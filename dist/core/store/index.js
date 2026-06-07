export { YamlTaskStore, getRecentParents, addRecentParent } from "./yaml-store.js";
import { YamlTaskStore } from "./yaml-store.js";
// Global default store instance for backward-compatible function exports
let defaultStore = new YamlTaskStore();
export function setDefaultStore(store) {
    defaultStore = store;
}
export function getDefaultStore() {
    return defaultStore;
}
// Backward-compatible function exports that delegate to defaultStore
export const getRegistry = () => defaultStore.getRegistry();
export const saveRegistry = (projects) => defaultStore.saveRegistry(projects);
export const addProject = (config) => defaultStore.addProject(config);
export const removeProject = (name) => defaultStore.removeProject(name);
export const listProjectTasks = (path) => defaultStore.listProjectTasks(path);
export const readTask = (path, id) => defaultStore.readTask(path, id);
export const writeTask = (path, task) => defaultStore.writeTask(path, task);
export const deleteTask = (path, id) => defaultStore.deleteTask(path, id);
export const searchTasks = (query, options) => defaultStore.searchTasks(query, options);
export const scanForProjects = (paths) => defaultStore.scanForProjects(paths);
export const getProjectTasksDir = (path) => defaultStore.getProjectTasksDir(path);
//# sourceMappingURL=index.js.map