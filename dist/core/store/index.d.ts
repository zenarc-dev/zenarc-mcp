export type { TaskStore, ProjectConfig } from "./types.js";
export { YamlTaskStore, getRecentParents, addRecentParent } from "./yaml-store.js";
import type { TaskStore } from "./types.js";
export declare function setDefaultStore(store: TaskStore): void;
export declare function getDefaultStore(): TaskStore;
export declare const getRegistry: () => Promise<import("./types.js").ProjectConfig[]>;
export declare const saveRegistry: (projects: Parameters<TaskStore["saveRegistry"]>[0]) => Promise<void>;
export declare const addProject: (config: Parameters<TaskStore["addProject"]>[0]) => Promise<void>;
export declare const removeProject: (name: string) => Promise<void>;
export declare const listProjectTasks: (path: string) => Promise<{
    status: "todo" | "in_progress" | "done" | "blocked" | "deferred";
    id: string;
    title: string;
    priority: "critical" | "high" | "medium" | "low";
    project: string;
    tags: string[];
    created_at: string;
    updated_at: string;
    created_by: "human" | "claude" | "other-agent";
    context: {
        files: string[];
        urls: string[];
        notes: string;
    };
    dependencies: string[];
    assigned_to?: string | undefined;
}[]>;
export declare const readTask: (path: string, id: string) => Promise<{
    status: "todo" | "in_progress" | "done" | "blocked" | "deferred";
    id: string;
    title: string;
    priority: "critical" | "high" | "medium" | "low";
    project: string;
    tags: string[];
    created_at: string;
    updated_at: string;
    created_by: "human" | "claude" | "other-agent";
    context: {
        files: string[];
        urls: string[];
        notes: string;
    };
    dependencies: string[];
    assigned_to?: string | undefined;
} | null>;
export declare const writeTask: (path: string, task: Parameters<TaskStore["writeTask"]>[1]) => Promise<void>;
export declare const deleteTask: (path: string, id: string) => Promise<boolean>;
export declare const searchTasks: (query: string, options?: Parameters<TaskStore["searchTasks"]>[1]) => Promise<{
    status: "todo" | "in_progress" | "done" | "blocked" | "deferred";
    id: string;
    title: string;
    priority: "critical" | "high" | "medium" | "low";
    project: string;
    tags: string[];
    created_at: string;
    updated_at: string;
    created_by: "human" | "claude" | "other-agent";
    context: {
        files: string[];
        urls: string[];
        notes: string;
    };
    dependencies: string[];
    assigned_to?: string | undefined;
}[]>;
export declare const scanForProjects: (paths: string[]) => Promise<import("./types.js").ProjectConfig[]>;
export declare const getProjectTasksDir: (path: string) => string;
//# sourceMappingURL=index.d.ts.map