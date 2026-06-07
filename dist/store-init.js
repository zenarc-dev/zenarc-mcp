import { mkdir, access, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { homedir } from "node:os";
import { setDefaultStore } from "./core/index.js";
const ZENARC_DIR = join(homedir(), ".zenarc");
const REGISTRY_PATH = join(ZENARC_DIR, "projects.json");
const RECENT_PARENTS_PATH = join(ZENARC_DIR, "recent-parents.json");
let initialized = false;
async function ensureFile(path, defaultContent) {
    try {
        await access(path);
    }
    catch {
        await writeFile(path, defaultContent, "utf-8");
    }
}
export async function initializeStore() {
    if (initialized)
        return;
    // Ensure ~/.zenarc/ exists with empty registry files
    await mkdir(ZENARC_DIR, { recursive: true });
    await ensureFile(REGISTRY_PATH, "[]");
    await ensureFile(RECENT_PARENTS_PATH, "[]");
    const syncEnabled = process.env.FIREBASE_SYNC_ENABLED === "true";
    if (syncEnabled) {
        try {
            const { HybridTaskStore, initializeFirebase } = await import("./sync/index.js");
            await initializeFirebase(process.env.GOOGLE_APPLICATION_CREDENTIALS);
            setDefaultStore(new HybridTaskStore({ syncEnabled: true }));
            console.error("[ZenArc MCP] Using HybridTaskStore with Firebase sync");
        }
        catch (err) {
            console.error("[ZenArc MCP] Failed to initialize Firebase sync:", err);
            console.error("[ZenArc MCP] Falling back to YamlTaskStore");
        }
    }
    initialized = true;
}
//# sourceMappingURL=store-init.js.map