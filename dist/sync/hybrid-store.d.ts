import { YamlTaskStore, type Task, type TaskStore, type ProjectConfig } from "../core/index.js";
import { FirestoreTaskStore } from "./firestore-store.js";
export declare class HybridTaskStore implements TaskStore {
    private yamlStore;
    private firestoreStore;
    private syncEnabled;
    constructor(options?: {
        syncEnabled?: boolean;
        firestoreStore?: FirestoreTaskStore;
    });
    getRegistry(): Promise<ProjectConfig[]>;
    saveRegistry(projects: ProjectConfig[]): Promise<void>;
    addProject(config: ProjectConfig): Promise<void>;
    removeProject(name: string): Promise<void>;
    getProjectTasksDir(projectPath: string): string;
    listProjectTasks(projectPath: string): Promise<Task[]>;
    readTask(projectPath: string, taskId: string): Promise<Task | null>;
    writeTask(projectPath: string, task: Task): Promise<void>;
    deleteTask(projectPath: string, taskId: string): Promise<boolean>;
    searchTasks(query: string, options?: {
        project?: string;
        status?: string;
        priority?: string;
        tag?: string;
        assigned_to?: string;
    }): Promise<Task[]>;
    scanForProjects(rootPaths: string[]): Promise<ProjectConfig[]>;
    getYamlStore(): YamlTaskStore;
    getFirestoreStore(): FirestoreTaskStore;
    isSyncEnabled(): boolean;
    setSyncEnabled(enabled: boolean): void;
}
//# sourceMappingURL=hybrid-store.d.ts.map