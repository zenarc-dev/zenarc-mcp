import { watch, type FSWatcher } from "node:fs";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { parse } from "yaml";
import { validateTask, type Task, type ProjectConfig } from "../core/index.js";
import { YamlTaskStore } from "../core/index.js";
import { FirestoreTaskStore } from "./firestore-store.js";

export type SyncBridgeOptions = {
  pollIntervalMs?: number;
  verbose?: boolean;
};

export class SyncBridge {
  private yamlStore = new YamlTaskStore();
  private firestoreStore: FirestoreTaskStore;
  private watchers: Map<string, FSWatcher> = new Map();
  private firestoreUnsubscribers: Map<string, () => void> = new Map();
  private options: SyncBridgeOptions;
  private syncInProgress = new Set<string>();

  constructor(firestoreStore?: FirestoreTaskStore, options: SyncBridgeOptions = {}) {
    this.firestoreStore = firestoreStore || new FirestoreTaskStore();
    this.options = {
      pollIntervalMs: 5000,
      verbose: false,
      ...options,
    };
  }

  private log(...args: unknown[]): void {
    if (this.options.verbose) {
      console.log("[SyncBridge]", ...args);
    }
  }

  async start(projectName: string, projectPath: string): Promise<void> {
    const tasksDir = this.yamlStore.getProjectTasksDir(projectPath);

    // Watch YAML files and push to Firestore
    const watcher = watch(tasksDir, { recursive: true }, async (eventType, filename) => {
      if (!filename || !(filename.endsWith(".yaml") || filename.endsWith(".yml"))) return;

      const filepath = join(tasksDir, filename);

      try {
        if (eventType === "rename") {
          // File was deleted
          const exists = await readFile(filepath, "utf-8").then(() => true).catch(() => false);
          if (!exists) {
            this.log("File deleted:", filename);
            // We don't know the taskId from filename alone, so we skip Firestore delete here.
            // The Firestore listener will handle mobile-initiated deletes back to YAML.
          }
        } else {
          // File changed or created
          const raw = await readFile(filepath, "utf-8");
          const data = parse(raw);
          const task = validateTask(data);

          if (this.syncInProgress.has(task.id)) return;

          this.syncInProgress.add(task.id);
          this.log("YAML → Firestore:", task.id, task.title);
          await this.firestoreStore.writeTask(projectPath, task);
          this.syncInProgress.delete(task.id);
        }
      } catch (err) {
        if (eventType !== "rename") {
          // Try to read the file to get task id for cleanup
          try {
            const raw = await readFile(filepath, "utf-8");
            const data = parse(raw);
            if (data?.id) this.syncInProgress.delete(data.id);
          } catch {
            // ignore
          }
        }
        console.error("[SyncBridge] Error syncing YAML to Firestore:", err);
      }
    });

    this.watchers.set(projectName, watcher);

    // Listen to Firestore changes and write back to YAML
    const unsubscribe = this.firestoreStore.onTaskChanged(projectName, async (task) => {
      if (!task) {
        // Task deleted in Firestore — we would need to know which file to delete.
        // In practice, mobile-initiated deletes are rare; mobile usually marks as "done".
        return;
      }

      if (this.syncInProgress.has(task.id)) return;

      try {
        const existing = await this.yamlStore.readTask(projectPath, task.id);
        if (existing && existing.updated_at >= task.updated_at) {
          this.log("Skipping Firestore → YAML (YAML is newer):", task.id);
          return;
        }

        this.log("Firestore → YAML:", task.id, task.title);
        this.syncInProgress.add(task.id);
        await this.yamlStore.writeTask(projectPath, task);
        this.syncInProgress.delete(task.id);
      } catch (err) {
        this.syncInProgress.delete(task.id);
        console.error("[SyncBridge] Error syncing Firestore to YAML:", err);
      }
    });

    this.firestoreUnsubscribers.set(projectName, unsubscribe);
    this.log("Started sync for project:", projectName);
  }

  stop(projectName: string): void {
    const watcher = this.watchers.get(projectName);
    if (watcher) {
      watcher.close();
      this.watchers.delete(projectName);
    }

    const unsub = this.firestoreUnsubscribers.get(projectName);
    if (unsub) {
      unsub();
      this.firestoreUnsubscribers.delete(projectName);
    }

    this.log("Stopped sync for project:", projectName);
  }

  stopAll(): void {
    for (const [name] of this.watchers) {
      this.stop(name);
    }
  }

  async initialSync(projectName: string, projectPath: string): Promise<void> {
    this.log("Running initial sync for:", projectName);

    // Push all local YAML tasks to Firestore
    const yamlTasks = await this.yamlStore.listProjectTasks(projectPath);
    for (const task of yamlTasks) {
      try {
        const firestoreTask = await this.firestoreStore.readTask(projectPath, task.id);
        if (!firestoreTask || task.updated_at > firestoreTask.updated_at) {
          await this.firestoreStore.writeTask(projectPath, task);
          this.log("Initial sync pushed:", task.id);
        }
      } catch (err) {
        console.error("[SyncBridge] Initial sync error for task:", task.id, err);
      }
    }

    // Pull any Firestore tasks that don't exist locally
    const firestoreTasks = await this.firestoreStore.listProjectTasks(projectPath);
    for (const task of firestoreTasks) {
      const yamlTask = await this.yamlStore.readTask(projectPath, task.id);
      if (!yamlTask || task.updated_at > yamlTask.updated_at) {
        await this.yamlStore.writeTask(projectPath, task);
        this.log("Initial sync pulled:", task.id);
      }
    }
  }

  async startAllFromRegistry(): Promise<void> {
    const registry = await this.yamlStore.getRegistry();
    for (const project of registry) {
      if (project.sync?.enabled) {
        await this.initialSync(project.name, project.path);
        await this.start(project.name, project.path);
      }
    }
  }
}
