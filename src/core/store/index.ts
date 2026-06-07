export type { TaskStore, ProjectConfig } from "./types.js";
export { YamlTaskStore, getRecentParents, addRecentParent } from "./yaml-store.js";

import { YamlTaskStore } from "./yaml-store.js";
import type { TaskStore } from "./types.js";

// Global default store instance for backward-compatible function exports
let defaultStore: TaskStore = new YamlTaskStore();

export function setDefaultStore(store: TaskStore): void {
  defaultStore = store;
}

export function getDefaultStore(): TaskStore {
  return defaultStore;
}

// Backward-compatible function exports that delegate to defaultStore
export const getRegistry = () => defaultStore.getRegistry();
export const saveRegistry = (projects: Parameters<TaskStore["saveRegistry"]>[0]) =>
  defaultStore.saveRegistry(projects);
export const addProject = (config: Parameters<TaskStore["addProject"]>[0]) =>
  defaultStore.addProject(config);
export const removeProject = (name: string) => defaultStore.removeProject(name);
export const listProjectTasks = (path: string) => defaultStore.listProjectTasks(path);
export const readTask = (path: string, id: string) => defaultStore.readTask(path, id);
export const writeTask = (path: string, task: Parameters<TaskStore["writeTask"]>[1]) =>
  defaultStore.writeTask(path, task);
export const deleteTask = (path: string, id: string) => defaultStore.deleteTask(path, id);
export const searchTasks = (query: string, options?: Parameters<TaskStore["searchTasks"]>[1]) =>
  defaultStore.searchTasks(query, options);
export const scanForProjects = (paths: string[]) => defaultStore.scanForProjects(paths);
export const getProjectTasksDir = (path: string) => defaultStore.getProjectTasksDir(path);
