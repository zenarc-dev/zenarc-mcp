import { type Task } from "../schema.js";
import type { TaskStore, ProjectConfig } from "./types.js";
export declare function getRecentParents(): Promise<string[]>;
export declare function addRecentParent(dir: string): Promise<void>;
export declare class YamlTaskStore implements TaskStore {
    getProjectTasksDir(projectPath: string): string;
    private ensureZenarcStructure;
    getRegistry(): Promise<ProjectConfig[]>;
    saveRegistry(projects: ProjectConfig[]): Promise<void>;
    addProject(config: ProjectConfig): Promise<void>;
    removeProject(name: string): Promise<void>;
    private writeProjectConfig;
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
//# sourceMappingURL=yaml-store.d.ts.map