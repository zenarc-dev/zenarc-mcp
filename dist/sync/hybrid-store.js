import { YamlTaskStore } from "@zenarc/core";
import { FirestoreTaskStore } from "./firestore-store.js";
export class HybridTaskStore {
    yamlStore;
    firestoreStore;
    syncEnabled;
    constructor(options) {
        this.yamlStore = new YamlTaskStore();
        this.firestoreStore = options?.firestoreStore || new FirestoreTaskStore();
        this.syncEnabled = options?.syncEnabled ?? true;
    }
    async getRegistry() {
        return this.yamlStore.getRegistry();
    }
    async saveRegistry(projects) {
        await this.yamlStore.saveRegistry(projects);
    }
    async addProject(config) {
        await this.yamlStore.addProject(config);
    }
    async removeProject(name) {
        await this.yamlStore.removeProject(name);
    }
    getProjectTasksDir(projectPath) {
        return this.yamlStore.getProjectTasksDir(projectPath);
    }
    async listProjectTasks(projectPath) {
        // Read from YAML (fast, local). Firestore sync happens via bridge.
        return this.yamlStore.listProjectTasks(projectPath);
    }
    async readTask(projectPath, taskId) {
        // Try YAML first
        const yamlTask = await this.yamlStore.readTask(projectPath, taskId);
        if (yamlTask)
            return yamlTask;
        // Fallback to Firestore if enabled
        if (this.syncEnabled) {
            return this.firestoreStore.readTask(projectPath, taskId);
        }
        return null;
    }
    async writeTask(projectPath, task) {
        // Always write to YAML (source of truth on desktop)
        await this.yamlStore.writeTask(projectPath, task);
        // Async push to Firestore (non-blocking)
        if (this.syncEnabled) {
            try {
                await this.firestoreStore.writeTask(projectPath, task);
            }
            catch (err) {
                console.error("[HybridStore] Firestore write failed:", err);
            }
        }
    }
    async deleteTask(projectPath, taskId) {
        const deleted = await this.yamlStore.deleteTask(projectPath, taskId);
        if (deleted && this.syncEnabled) {
            try {
                await this.firestoreStore.deleteTask(projectPath, taskId);
            }
            catch (err) {
                console.error("[HybridStore] Firestore delete failed:", err);
            }
        }
        return deleted;
    }
    async searchTasks(query, options) {
        return this.yamlStore.searchTasks(query, options);
    }
    async scanForProjects(rootPaths) {
        return this.yamlStore.scanForProjects(rootPaths);
    }
    getYamlStore() {
        return this.yamlStore;
    }
    getFirestoreStore() {
        return this.firestoreStore;
    }
    isSyncEnabled() {
        return this.syncEnabled;
    }
    setSyncEnabled(enabled) {
        this.syncEnabled = enabled;
    }
}
//# sourceMappingURL=hybrid-store.js.map