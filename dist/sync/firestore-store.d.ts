import { type App } from "firebase-admin/app";
import { type Task, type TaskStore, type ProjectConfig } from "../core/index.js";
export declare function initializeFirebase(credentialPath?: string): Promise<App>;
export declare function getFirebaseApp(): App;
export declare class FirestoreTaskStore implements TaskStore {
    private db;
    constructor(app?: App);
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
    private getProjectNameFromPath;
    onTaskChanged(projectName: string, callback: (task: Task | null, taskId: string) => void): () => void;
}
//# sourceMappingURL=firestore-store.d.ts.map