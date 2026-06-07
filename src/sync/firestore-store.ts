import { initializeApp, cert, type ServiceAccount, type App } from "firebase-admin/app";
import { getFirestore, type Firestore, type DocumentData } from "firebase-admin/firestore";
import {
  validateTask,
  type Task,
  type TaskStore,
  type ProjectConfig,
} from "../core/index.js";
import { join } from "node:path";
import { homedir } from "node:os";

let firebaseApp: App | null = null;

export async function initializeFirebase(credentialPath?: string): Promise<App> {
  if (firebaseApp) return firebaseApp;

  if (credentialPath) {
    const serviceAccount = await import(credentialPath, {
      assert: { type: "json" },
    }) as { default: ServiceAccount };
    firebaseApp = initializeApp({
      credential: cert(serviceAccount.default),
    });
  } else {
    // Use application default credentials (e.g., GOOGLE_APPLICATION_CREDENTIALS env var)
    firebaseApp = initializeApp();
  }

  return firebaseApp;
}

export function getFirebaseApp(): App {
  if (!firebaseApp) {
    firebaseApp = initializeApp();
  }
  return firebaseApp;
}

function taskToDoc(task: Task): DocumentData {
  return {
    ...task,
    context: {
      files: task.context.files,
      urls: task.context.urls,
      notes: task.context.notes,
    },
  };
}

function docToTask(data: DocumentData): Task {
  return validateTask({
    id: data.id,
    title: data.title,
    status: data.status,
    priority: data.priority,
    project: data.project,
    tags: data.tags || [],
    created_at: data.created_at,
    updated_at: data.updated_at,
    created_by: data.created_by,
    assigned_to: data.assigned_to,
    context: {
      files: data.context?.files || [],
      urls: data.context?.urls || [],
      notes: data.context?.notes || "",
    },
    dependencies: data.dependencies || [],
  });
}

export class FirestoreTaskStore implements TaskStore {
  private db: Firestore;

  constructor(app?: App) {
    this.db = getFirestore(app || getFirebaseApp());
  }

  // Registry is still stored locally as JSON
  async getRegistry(): Promise<ProjectConfig[]> {
    const { readFile } = await import("node:fs/promises");
    const registryPath = join(homedir(), ".zenarc", "projects.json");
    try {
      const raw = await readFile(registryPath, "utf-8");
      return JSON.parse(raw) as ProjectConfig[];
    } catch {
      return [];
    }
  }

  async saveRegistry(projects: ProjectConfig[]): Promise<void> {
    const { writeFile, mkdir } = await import("node:fs/promises");
    const registryPath = join(homedir(), ".zenarc", "projects.json");
    await mkdir(join(homedir(), ".zenarc"), { recursive: true });
    await writeFile(registryPath, JSON.stringify(projects, null, 2), "utf-8");
  }

  async addProject(config: ProjectConfig): Promise<void> {
    const registry = await this.getRegistry();
    const filtered = registry.filter((p) => p.name !== config.name);
    filtered.push(config);
    await this.saveRegistry(filtered);
  }

  async removeProject(name: string): Promise<void> {
    const registry = await this.getRegistry();
    await this.saveRegistry(registry.filter((p) => p.name !== name));
  }

  getProjectTasksDir(projectPath: string): string {
    return join(projectPath, ".zenarc", "tasks");
  }

  async listProjectTasks(projectPath: string): Promise<Task[]> {
    const projectName = await this.getProjectNameFromPath(projectPath);
    if (!projectName) return [];

    const snapshot = await this.db
      .collection("projects")
      .doc(projectName)
      .collection("tasks")
      .orderBy("updated_at", "desc")
      .get();

    return snapshot.docs.map((doc) => docToTask(doc.data()));
  }

  async readTask(projectPath: string, taskId: string): Promise<Task | null> {
    const projectName = await this.getProjectNameFromPath(projectPath);
    if (!projectName) return null;

    const doc = await this.db
      .collection("projects")
      .doc(projectName)
      .collection("tasks")
      .doc(taskId)
      .get();

    if (!doc.exists) return null;
    return docToTask(doc.data()!);
  }

  async writeTask(projectPath: string, task: Task): Promise<void> {
    const projectName = await this.getProjectNameFromPath(projectPath);
    if (!projectName) throw new Error(`Project not found for path: ${projectPath}`);

    await this.db
      .collection("projects")
      .doc(projectName)
      .collection("tasks")
      .doc(task.id)
      .set(taskToDoc(task), { merge: true });
  }

  async deleteTask(projectPath: string, taskId: string): Promise<boolean> {
    const projectName = await this.getProjectNameFromPath(projectPath);
    if (!projectName) return false;

    const docRef = this.db
      .collection("projects")
      .doc(projectName)
      .collection("tasks")
      .doc(taskId);

    const doc = await docRef.get();
    if (!doc.exists) return false;

    await docRef.delete();
    return true;
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
    const registry = await this.getRegistry();
    let projectNames = registry.map((p) => p.name);

    if (options?.project) {
      projectNames = projectNames.filter((n) => n === options.project);
    }

    const allTasks: Task[] = [];
    for (const name of projectNames) {
      const snapshot = await this.db
        .collection("projects")
        .doc(name)
        .collection("tasks")
        .get();

      for (const doc of snapshot.docs) {
        allTasks.push(docToTask(doc.data()));
      }
    }

    const q = query.toLowerCase();
    return allTasks.filter((task) => {
      if (options?.status && task.status !== options.status) return false;
      if (options?.priority && task.priority !== options.priority) return false;
      if (options?.tag && !task.tags.includes(options.tag)) return false;
      if (options?.assigned_to && task.assigned_to !== options.assigned_to) return false;
      if (!q) return true;

      const text = [
        task.title,
        task.context.notes,
        ...task.tags,
        task.project,
        task.assigned_to || "",
      ]
        .join(" ")
        .toLowerCase();
      return text.includes(q);
    });
  }

  async scanForProjects(rootPaths: string[]): Promise<ProjectConfig[]> {
    const { readdir, access } = await import("node:fs/promises");
    const { join } = await import("node:path");
    const found: ProjectConfig[] = [];

    for (const root of rootPaths) {
      try {
        const entries = await readdir(root, { withFileTypes: true });
        for (const entry of entries) {
          if (!entry.isDirectory()) continue;
          const projectPath = join(root, entry.name);

          // Check for .zenarc/tasks/ directory
          try {
            const tasksDir = join(projectPath, ".zenarc", "tasks");
            await access(tasksDir);
            found.push({ name: entry.name, path: projectPath, format: "yaml" });
            continue;
          } catch {
            // No .zenarc/tasks/
          }

          // Check for .zenarc/overview.yml
          try {
            await access(join(projectPath, ".zenarc", "overview.yml"));
            found.push({ name: entry.name, path: projectPath, format: "yaml" });
            continue;
          } catch {
            // No .zenarc/overview.yml
          }
        }
      } catch {
        // Root path doesn't exist
      }
    }

    return found;
  }

  private async getProjectNameFromPath(projectPath: string): Promise<string | null> {
    const registry = await this.getRegistry();
    const project = registry.find((p) => p.path === projectPath);
    return project?.name || null;
  }

  // Real-time listeners for sync bridge
  onTaskChanged(
    projectName: string,
    callback: (task: Task | null, taskId: string) => void
  ): () => void {
    const unsubscribe = this.db
      .collection("projects")
      .doc(projectName)
      .collection("tasks")
      .onSnapshot((snapshot) => {
        snapshot.docChanges().forEach((change) => {
          if (change.type === "removed") {
            callback(null, change.doc.id);
          } else {
            callback(docToTask(change.doc.data()), change.doc.id);
          }
        });
      });

    return () => unsubscribe();
  }
}
