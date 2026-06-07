import type { Task } from "../schema.js";
export type ProjectConfig = {
    name: string;
    path: string;
    format: "yaml" | "json";
    sync?: {
        enabled: boolean;
        firebaseProject?: string;
    };
};
export interface TaskStore {
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
}
//# sourceMappingURL=types.d.ts.map