import { YamlTaskStore, type Task, type TaskStore, type ProjectConfig } from "../core/index.js";
import { FirestoreTaskStore } from "./firestore-store.js";

export class HybridTaskStore implements TaskStore {
  private yamlStore: YamlTaskStore;
  private firestoreStore: FirestoreTaskStore;
  private syncEnabled: boolean;

  constructor(options?: { syncEnabled?: boolean; firestoreStore?: FirestoreTaskStore }) {
    this.yamlStore = new YamlTaskStore();
    this.firestoreStore = options?.firestoreStore || new FirestoreTaskStore();
    this.syncEnabled = options?.syncEnabled ?? true;
  }

  async getRegistry(): Promise<ProjectConfig[]> {
    return this.yamlStore.getRegistry();
  }

  async saveRegistry(projects: ProjectConfig[]): Promise<void> {
    await this.yamlStore.saveRegistry(projects);
  }

  async addProject(config: ProjectConfig): Promise<void> {
    await this.yamlStore.addProject(config);
  }

  async removeProject(name: string): Promise<void> {
    await this.yamlStore.removeProject(name);
  }

  getProjectTasksDir(projectPath: string): string {
    return this.yamlStore.getProjectTasksDir(projectPath);
  }

  async listProjectTasks(projectPath: string): Promise<Task[]> {
    // Read from YAML (fast, local). Firestore sync happens via bridge.
    return this.yamlStore.listProjectTasks(projectPath);
  }

  async readTask(projectPath: string, taskId: string): Promise<Task | null> {
    // Try YAML first
    const yamlTask = await this.yamlStore.readTask(projectPath, taskId);
    if (yamlTask) return yamlTask;

    // Fallback to Firestore if enabled
    if (this.syncEnabled) {
      return this.firestoreStore.readTask(projectPath, taskId);
    }
    return null;
  }

  async writeTask(projectPath: string, task: Task): Promise<void> {
    // Always write to YAML (source of truth on desktop)
    await this.yamlStore.writeTask(projectPath, task);

    // Async push to Firestore (non-blocking)
    if (this.syncEnabled) {
      try {
        await this.firestoreStore.writeTask(projectPath, task);
      } catch (err) {
        console.error("[HybridStore] Firestore write failed:", err);
      }
    }
  }

  async deleteTask(projectPath: string, taskId: string): Promise<boolean> {
    const deleted = await this.yamlStore.deleteTask(projectPath, taskId);

    if (deleted && this.syncEnabled) {
      try {
        await this.firestoreStore.deleteTask(projectPath, taskId);
      } catch (err) {
        console.error("[HybridStore] Firestore delete failed:", err);
      }
    }

    return deleted;
  }

  async searchTasks(
    query: string,
    options?: {
      project?: string;
      status?: string;
      priority?: string;
      tag?: string;
      assigned_to?: string;
    }
  ): Promise<Task[]> {
    return this.yamlStore.searchTasks(query, options);
  }

  async scanForProjects(rootPaths: string[]): Promise<ProjectConfig[]> {
    return this.yamlStore.scanForProjects(rootPaths);
  }

  getYamlStore(): YamlTaskStore {
    return this.yamlStore;
  }

  getFirestoreStore(): FirestoreTaskStore {
    return this.firestoreStore;
  }

  isSyncEnabled(): boolean {
    return this.syncEnabled;
  }

  setSyncEnabled(enabled: boolean): void {
    this.syncEnabled = enabled;
  }
}
