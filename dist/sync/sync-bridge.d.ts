import { FirestoreTaskStore } from "./firestore-store.js";
export type SyncBridgeOptions = {
    pollIntervalMs?: number;
    verbose?: boolean;
};
export declare class SyncBridge {
    private yamlStore;
    private firestoreStore;
    private watchers;
    private firestoreUnsubscribers;
    private options;
    private syncInProgress;
    constructor(firestoreStore?: FirestoreTaskStore, options?: SyncBridgeOptions);
    private log;
    start(projectName: string, projectPath: string): Promise<void>;
    stop(projectName: string): void;
    stopAll(): void;
    initialSync(projectName: string, projectPath: string): Promise<void>;
    startAllFromRegistry(): Promise<void>;
}
//# sourceMappingURL=sync-bridge.d.ts.map