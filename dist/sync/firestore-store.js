import { initializeApp, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { validateTask, } from "@zenarc/core";
import { join } from "node:path";
import { homedir } from "node:os";
let firebaseApp = null;
export async function initializeFirebase(credentialPath) {
    if (firebaseApp)
        return firebaseApp;
    if (credentialPath) {
        const serviceAccount = await import(credentialPath, {
            assert: { type: "json" },
        });
        firebaseApp = initializeApp({
            credential: cert(serviceAccount.default),
        });
    }
    else {
        // Use application default credentials (e.g., GOOGLE_APPLICATION_CREDENTIALS env var)
        firebaseApp = initializeApp();
    }
    return firebaseApp;
}
export function getFirebaseApp() {
    if (!firebaseApp) {
        firebaseApp = initializeApp();
    }
    return firebaseApp;
}
function taskToDoc(task) {
    return {
        ...task,
        context: {
            files: task.context.files,
            urls: task.context.urls,
            description: task.context.description,
        },
    };
}
function docToTask(data) {
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
            description: data.context?.description || data.context?.notes || "",
        },
        dependencies: data.dependencies || [],
    });
}
export class FirestoreTaskStore {
    db;
    constructor(app) {
        this.db = getFirestore(app || getFirebaseApp());
    }
    // Registry is still stored locally as JSON
    async getRegistry() {
        const { readFile } = await import("node:fs/promises");
        const registryPath = join(homedir(), ".zenarc", "projects.json");
        try {
            const raw = await readFile(registryPath, "utf-8");
            return JSON.parse(raw);
        }
        catch {
            return [];
        }
    }
    async saveRegistry(projects) {
        const { writeFile, mkdir } = await import("node:fs/promises");
        const registryPath = join(homedir(), ".zenarc", "projects.json");
        await mkdir(join(homedir(), ".zenarc"), { recursive: true });
        await writeFile(registryPath, JSON.stringify(projects, null, 2), "utf-8");
    }
    async addProject(config) {
        const registry = await this.getRegistry();
        const filtered = registry.filter((p) => p.name !== config.name);
        filtered.push(config);
        await this.saveRegistry(filtered);
    }
    async removeProject(name) {
        const registry = await this.getRegistry();
        await this.saveRegistry(registry.filter((p) => p.name !== name));
    }
    getProjectTasksDir(projectPath) {
        return join(projectPath, ".zenarc", "tasks");
    }
    async listProjectTasks(projectPath) {
        const projectName = await this.getProjectNameFromPath(projectPath);
        if (!projectName)
            return [];
        const snapshot = await this.db
            .collection("projects")
            .doc(projectName)
            .collection("tasks")
            .orderBy("updated_at", "desc")
            .get();
        return snapshot.docs.map((doc) => docToTask(doc.data()));
    }
    async readTask(projectPath, taskId) {
        const projectName = await this.getProjectNameFromPath(projectPath);
        if (!projectName)
            return null;
        const doc = await this.db
            .collection("projects")
            .doc(projectName)
            .collection("tasks")
            .doc(taskId)
            .get();
        if (!doc.exists)
            return null;
        return docToTask(doc.data());
    }
    async writeTask(projectPath, task) {
        const projectName = await this.getProjectNameFromPath(projectPath);
        if (!projectName)
            throw new Error(`Project not found for path: ${projectPath}`);
        await this.db
            .collection("projects")
            .doc(projectName)
            .collection("tasks")
            .doc(task.id)
            .set(taskToDoc(task), { merge: true });
    }
    async deleteTask(projectPath, taskId) {
        const projectName = await this.getProjectNameFromPath(projectPath);
        if (!projectName)
            return false;
        const docRef = this.db
            .collection("projects")
            .doc(projectName)
            .collection("tasks")
            .doc(taskId);
        const doc = await docRef.get();
        if (!doc.exists)
            return false;
        await docRef.delete();
        return true;
    }
    async searchTasks(query, options) {
        const registry = await this.getRegistry();
        let projectNames = registry.map((p) => p.name);
        if (options?.project) {
            projectNames = projectNames.filter((n) => n === options.project);
        }
        const allTasks = [];
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
            if (options?.status && task.status !== options.status)
                return false;
            if (options?.priority && task.priority !== options.priority)
                return false;
            if (options?.tag && !task.tags.includes(options.tag))
                return false;
            if (options?.assigned_to && task.assigned_to !== options.assigned_to)
                return false;
            if (!q)
                return true;
            const text = [
                task.title,
                task.context.description,
                ...task.tags,
                task.project,
                task.assigned_to || "",
            ]
                .join(" ")
                .toLowerCase();
            return text.includes(q);
        });
    }
    async scanForProjects(rootPaths) {
        const { readdir, access } = await import("node:fs/promises");
        const { join } = await import("node:path");
        const found = [];
        for (const root of rootPaths) {
            try {
                const entries = await readdir(root, { withFileTypes: true });
                for (const entry of entries) {
                    if (!entry.isDirectory())
                        continue;
                    const projectPath = join(root, entry.name);
                    // Check for .zenarc/tasks/ directory
                    try {
                        const tasksDir = join(projectPath, ".zenarc", "tasks");
                        await access(tasksDir);
                        found.push({ name: entry.name, path: projectPath, format: "yaml" });
                        continue;
                    }
                    catch {
                        // No .zenarc/tasks/
                    }
                    // Check for .zenarc/overview.yml
                    try {
                        await access(join(projectPath, ".zenarc", "overview.yml"));
                        found.push({ name: entry.name, path: projectPath, format: "yaml" });
                        continue;
                    }
                    catch {
                        // No .zenarc/overview.yml
                    }
                }
            }
            catch {
                // Root path doesn't exist
            }
        }
        return found;
    }
    async getProjectNameFromPath(projectPath) {
        const registry = await this.getRegistry();
        const project = registry.find((p) => p.path === projectPath);
        return project?.name || null;
    }
    // Real-time listeners for sync bridge
    onTaskChanged(projectName, callback) {
        const unsubscribe = this.db
            .collection("projects")
            .doc(projectName)
            .collection("tasks")
            .onSnapshot((snapshot) => {
            snapshot.docChanges().forEach((change) => {
                if (change.type === "removed") {
                    callback(null, change.doc.id);
                }
                else {
                    callback(docToTask(change.doc.data()), change.doc.id);
                }
            });
        });
        return () => unsubscribe();
    }
}
//# sourceMappingURL=firestore-store.js.map