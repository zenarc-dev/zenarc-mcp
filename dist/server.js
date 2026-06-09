#!/usr/bin/env node
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema, } from "@modelcontextprotocol/sdk/types.js";
import { getRegistry, addProject, listProjectTasks, readTask, writeTask, deleteTask, searchTasks, scanForProjects, generateTaskId, validateTask, safeValidateTask, repairTaskData, detectSchemaVersion, CURRENT_SCHEMA_VERSION, TaskSchema, } from "@zenarc/core";
import { initializeStore } from "./store-init.js";
import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { readdir, readFile, writeFile } from "node:fs/promises";
import { parse as parseYaml } from "yaml";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
/* ------------------------------------------------------------------ */
/*  CLI helpers                                                       */
/* ------------------------------------------------------------------ */
function getPackageVersion() {
    try {
        const __dirname = dirname(fileURLToPath(import.meta.url));
        const pkgPath = join(__dirname, "..", "package.json");
        const pkg = JSON.parse(readFileSync(pkgPath, "utf-8"));
        return pkg.version ?? "unknown";
    }
    catch {
        return "unknown";
    }
}
function handleCLI() {
    const args = process.argv.slice(2);
    if (args.length === 0)
        return false;
    const cmd = args[0];
    if (cmd === "--version" || cmd === "-v") {
        console.log(`zenarc-mcp ${getPackageVersion()}`);
        return true;
    }
    if (cmd === "update" || cmd === "--update") {
        const current = getPackageVersion();
        console.log(`Current version: ${current}`);
        try {
            const latest = execSync("npm view zenarc-mcp version", {
                encoding: "utf-8",
                stdio: ["pipe", "pipe", "ignore"],
            }).trim();
            if (latest === current) {
                console.log("✅ zenarc-mcp is already up to date.");
            }
            else {
                console.log(`Update available: ${current} → ${latest}`);
                console.log("Running npm update -g zenarc-mcp ...");
                execSync("npm update -g zenarc-mcp", { stdio: "inherit" });
                console.log("✅ Update complete. Restart Claude Code to use the new version.");
            }
        }
        catch (err) {
            console.error("❌ Failed to check for updates:", err.message);
            process.exit(1);
        }
        return true;
    }
    if (cmd === "--help" || cmd === "-h") {
        console.log(`zenarc-mcp — AI-native task manager for Claude Code

Usage:
  zenarc-mcp              Start the MCP server (stdio)
  zenarc-mcp --version    Show version
  zenarc-mcp update       Check for updates and install latest
  zenarc-mcp --help       Show this help
`);
        return true;
    }
    console.error(`Unknown command: ${cmd}\nRun "zenarc-mcp --help" for usage.`);
    process.exit(1);
}
const server = new Server({
    name: "zenarc-mcp",
    version: "0.1.0",
}, {
    capabilities: {
        tools: {},
    },
});
server.setRequestHandler(ListToolsRequestSchema, async () => {
    return {
        tools: [
            {
                name: "zenarc_scan",
                description: "Discover ZenArc projects under given root directories and add newly-found projects to the registry. Checks subdirectories for .zenarc/tasks/, .zenarc/overview.yml, .zenarc.yml, or legacy task files.",
                inputSchema: {
                    type: "object",
                    properties: {
                        rootPaths: {
                            type: "array",
                            items: { type: "string" },
                            description: "Array of directory paths to scan for projects",
                        },
                    },
                    required: ["rootPaths"],
                },
            },
            {
                name: "zenarc_list",
                description: "List tasks across projects with optional filtering by project, status, priority, tag, or assignee. Call zenarc_get_config first to discover valid status values for a project, since dashboards can define custom columns.",
                inputSchema: {
                    type: "object",
                    properties: {
                        project: { type: "string", description: "Filter by project name" },
                        status: {
                            type: "string",
                            description: "Filter by status. Use zenarc_get_config to discover valid statuses for this project.",
                        },
                        priority: {
                            type: "string",
                            enum: ["critical", "high", "medium", "low"],
                            description: "Filter by priority",
                        },
                        tag: { type: "string", description: "Filter by tag" },
                        assigned_to: {
                            type: "string",
                            description: "Filter by assignee (human, claude, etc.)",
                        },
                        limit: {
                            type: "number",
                            description: "Max number of tasks to return",
                            default: 50,
                        },
                    },
                },
            },
            {
                name: "zenarc_get",
                description: "Get full details of a single task by its ID.",
                inputSchema: {
                    type: "object",
                    properties: {
                        taskId: { type: "string", description: "Task ID (e.g., tm-20260602-a1b2c3d4)" },
                    },
                    required: ["taskId"],
                },
            },
            {
                name: "zenarc_create",
                description: "Create a new task in a project. Call zenarc_get_config first to discover valid status values for the project, since dashboards can define custom columns beyond the default todo/in_progress/done/blocked/deferred.",
                inputSchema: {
                    type: "object",
                    properties: {
                        project: { type: "string", description: "Project name" },
                        title: { type: "string", description: "Task title" },
                        status: {
                            type: "string",
                            description: "Task status. Use zenarc_get_config to discover valid statuses for this project. Defaults to 'todo'.",
                            default: "todo",
                        },
                        priority: {
                            type: "string",
                            enum: ["critical", "high", "medium", "low"],
                            default: "medium",
                        },
                        tags: {
                            type: "array",
                            items: { type: "string" },
                            description: "Array of tag strings",
                        },
                        assigned_to: {
                            type: "string",
                            description: "Assignee (human, claude, etc.)",
                        },
                        description: { type: "string", description: "Task description" },
                        files: {
                            type: "array",
                            items: { type: "string" },
                            description: "Related file paths",
                        },
                        urls: {
                            type: "array",
                            items: { type: "string" },
                            description: "Related URLs",
                        },
                        dependencies: {
                            type: "array",
                            items: { type: "string" },
                            description: "Task IDs this task depends on",
                        },
                    },
                    required: ["project", "title"],
                },
            },
            {
                name: "zenarc_update",
                description: "Update an existing task's fields. Call zenarc_get_config first to discover valid status values for the project, since dashboards can define custom columns.",
                inputSchema: {
                    type: "object",
                    properties: {
                        taskId: { type: "string", description: "Task ID to update" },
                        status: {
                            type: "string",
                            description: "New task status. Use zenarc_get_config to discover valid statuses for this project.",
                        },
                        priority: {
                            type: "string",
                            enum: ["critical", "high", "medium", "low"],
                        },
                        title: { type: "string" },
                        assigned_to: { type: "string" },
                        tags: { type: "array", items: { type: "string" } },
                        description: { type: "string" },
                        append_description: {
                            type: "string",
                            description: "Append text to existing description",
                        },
                        files: {
                            type: "array",
                            items: { type: "string" },
                            description: "Replace related file paths",
                        },
                        urls: {
                            type: "array",
                            items: { type: "string" },
                            description: "Replace related URLs",
                        },
                    },
                    required: ["taskId"],
                },
            },
            {
                name: "zenarc_delete",
                description: "Delete a task by its ID. This action cannot be undone.",
                inputSchema: {
                    type: "object",
                    properties: {
                        taskId: { type: "string", description: "Task ID to delete (e.g., tm-20260602-a1b2c3d4)" },
                    },
                    required: ["taskId"],
                },
            },
            {
                name: "zenarc_search",
                description: "Search tasks by keyword across titles, tags, and description.",
                inputSchema: {
                    type: "object",
                    properties: {
                        query: { type: "string", description: "Search query" },
                        project: { type: "string", description: "Filter by project" },
                        status: { type: "string" },
                        priority: { type: "string" },
                        tag: { type: "string" },
                        limit: { type: "number", default: 20 },
                    },
                    required: ["query"],
                },
            },
            {
                name: "zenarc_context_add",
                description: "Add context (file path or URL) to an existing task.",
                inputSchema: {
                    type: "object",
                    properties: {
                        taskId: { type: "string", description: "Task ID" },
                        file: { type: "string", description: "File path to add" },
                        url: { type: "string", description: "URL to add" },
                        note: { type: "string", description: "Note to append" },
                    },
                    required: ["taskId"],
                },
            },
            {
                name: "zenarc_update_schema",
                description: "Upgrade all task YAML files across all projects to the latest schema version. Skips broken files and reports them so zenarc_validate_schema can repair them first. Only migrates files that pass validation but are on an old schema version.",
                inputSchema: {
                    type: "object",
                    properties: {},
                },
            },
            {
                name: "zenarc_validate_schema",
                description: "Validate all task YAML files across projects and repair corrupted ones by injecting missing required fields (id, title, status, priority, project, tags, created_at, updated_at, created_by, context, dependencies). Does NOT migrate schema versions. Optionally target a single project.",
                inputSchema: {
                    type: "object",
                    properties: {
                        project: {
                            type: "string",
                            description: "Project name to validate/repair. If omitted, scans all projects.",
                        },
                    },
                },
            },
            {
                name: "zenarc_get_config",
                description: "Read a project's ZenArc configuration (dashboard column layout, display name, etc.) from .zenarc/config.yml. Call this before zenarc_create or zenarc_update to discover valid status values, since dashboards can define custom columns.",
                inputSchema: {
                    type: "object",
                    properties: {
                        project: {
                            type: "string",
                            description: "Project name (must exist in the registry)",
                        },
                    },
                    required: ["project"],
                },
            },
        ],
    };
});
server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;
    try {
        switch (name) {
            case "zenarc_scan": {
                const { rootPaths } = args;
                const found = await scanForProjects(rootPaths);
                const registry = await getRegistry();
                const existingNames = new Set(registry.map((p) => p.name));
                for (const project of found) {
                    if (!existingNames.has(project.name)) {
                        await addProject(project);
                    }
                }
                const updated = await getRegistry();
                return {
                    content: [
                        {
                            type: "text",
                            text: `Scanned ${rootPaths.length} directories. Found ${found.length} projects. Registry now has ${updated.length} projects:\n${updated
                                .map((p) => `- ${p.name} (${p.path})`)
                                .join("\n")}`,
                        },
                    ],
                };
            }
            case "zenarc_list": {
                const { project, status, priority, tag, assigned_to, limit = 50, } = args;
                const registry = await getRegistry();
                let projects = registry;
                if (project) {
                    projects = projects.filter((p) => p.name === project);
                }
                const allTasks = [];
                for (const p of projects) {
                    const tasks = await listProjectTasks(p.path);
                    allTasks.push(...tasks);
                }
                let filtered = allTasks;
                if (status)
                    filtered = filtered.filter((t) => t.status === status);
                if (priority)
                    filtered = filtered.filter((t) => t.priority === priority);
                if (tag)
                    filtered = filtered.filter((t) => t.tags.includes(tag));
                if (assigned_to)
                    filtered = filtered.filter((t) => t.assigned_to === assigned_to);
                filtered = filtered.slice(0, limit);
                if (filtered.length === 0) {
                    return {
                        content: [
                            { type: "text", text: "No tasks found matching the criteria." },
                        ],
                    };
                }
                const text = filtered
                    .map((t) => `[${t.status}] ${t.priority} | ${t.project} | ${t.title} (${t.id})${t.assigned_to ? ` → @${t.assigned_to}` : ""}`)
                    .join("\n");
                return {
                    content: [
                        {
                            type: "text",
                            text: `Found ${filtered.length} tasks:\n${text}`,
                        },
                    ],
                };
            }
            case "zenarc_get": {
                const { taskId } = args;
                const registry = await getRegistry();
                for (const project of registry) {
                    const task = await readTask(project.path, taskId);
                    if (task) {
                        return {
                            content: [
                                {
                                    type: "text",
                                    text: JSON.stringify(task, null, 2),
                                },
                            ],
                        };
                    }
                }
                return {
                    content: [
                        { type: "text", text: `Task ${taskId} not found.` },
                    ],
                };
            }
            case "zenarc_create": {
                const { project, title, status = "todo", priority = "medium", tags = [], assigned_to, description = "", files = [], urls = [], dependencies = [], } = args;
                const registry = await getRegistry();
                const projectConfig = registry.find((p) => p.name === project);
                if (!projectConfig) {
                    return {
                        content: [
                            {
                                type: "text",
                                text: `Project "${project}" not found in registry. Run zenarc_scan first.`,
                            },
                        ],
                    };
                }
                const now = new Date().toISOString();
                const task = validateTask({
                    id: generateTaskId(),
                    title,
                    status,
                    priority,
                    project,
                    tags,
                    created_at: now,
                    updated_at: now,
                    created_by: "claude",
                    assigned_to,
                    context: { files, urls, description },
                    dependencies,
                });
                await writeTask(projectConfig.path, task);
                return {
                    content: [
                        {
                            type: "text",
                            text: `Created task ${task.id}: "${title}" in project ${project}`,
                        },
                    ],
                };
            }
            case "zenarc_update": {
                const { taskId, status, priority, title, assigned_to, tags, description, append_description, files, urls, } = args;
                const registry = await getRegistry();
                let task = null;
                let projectPath = "";
                for (const project of registry) {
                    task = await readTask(project.path, taskId);
                    if (task) {
                        projectPath = project.path;
                        break;
                    }
                }
                if (!task) {
                    return {
                        content: [
                            { type: "text", text: `Task ${taskId} not found.` },
                        ],
                    };
                }
                if (status !== undefined)
                    task.status = status;
                if (priority !== undefined)
                    task.priority = priority;
                if (title !== undefined)
                    task.title = title;
                if (assigned_to !== undefined)
                    task.assigned_to = assigned_to;
                if (tags !== undefined)
                    task.tags = tags;
                if (description !== undefined)
                    task.context.description = description;
                if (append_description !== undefined)
                    task.context.description += "\n" + append_description;
                if (files !== undefined)
                    task.context.files = files;
                if (urls !== undefined)
                    task.context.urls = urls;
                task.updated_at = new Date().toISOString();
                await writeTask(projectPath, task);
                return {
                    content: [
                        {
                            type: "text",
                            text: `Updated task ${taskId}. Current status: ${task.status}`,
                        },
                    ],
                };
            }
            case "zenarc_delete": {
                const { taskId } = args;
                const registry = await getRegistry();
                let deleted = false;
                for (const project of registry) {
                    const task = await readTask(project.path, taskId);
                    if (task) {
                        await deleteTask(project.path, taskId);
                        deleted = true;
                        break;
                    }
                }
                if (!deleted) {
                    return {
                        content: [
                            { type: "text", text: `Task ${taskId} not found.` },
                        ],
                        isError: true,
                    };
                }
                return {
                    content: [
                        {
                            type: "text",
                            text: `Deleted task ${taskId}.`,
                        },
                    ],
                };
            }
            case "zenarc_search": {
                const { query, project, status, priority, tag, limit = 20, } = args;
                const results = await searchTasks(query, {
                    project,
                    status,
                    priority,
                    tag,
                });
                const limited = results.slice(0, limit);
                if (limited.length === 0) {
                    return {
                        content: [
                            { type: "text", text: `No tasks found for "${query}".` },
                        ],
                    };
                }
                const text = limited
                    .map((t) => `[${t.status}] ${t.priority} | ${t.project} | ${t.title} (${t.id})`)
                    .join("\n");
                return {
                    content: [
                        {
                            type: "text",
                            text: `Search "${query}" found ${limited.length} tasks:\n${text}`,
                        },
                    ],
                };
            }
            case "zenarc_context_add": {
                const { taskId, file, url, note, } = args;
                const registry = await getRegistry();
                let task = null;
                let projectPath = "";
                for (const project of registry) {
                    task = await readTask(project.path, taskId);
                    if (task) {
                        projectPath = project.path;
                        break;
                    }
                }
                if (!task) {
                    return {
                        content: [
                            { type: "text", text: `Task ${taskId} not found.` },
                        ],
                    };
                }
                if (file)
                    task.context.files.push(file);
                if (url)
                    task.context.urls.push(url);
                if (note)
                    task.context.description += "\n" + note;
                task.updated_at = new Date().toISOString();
                await writeTask(projectPath, task);
                return {
                    content: [
                        {
                            type: "text",
                            text: `Added context to task ${taskId}.`,
                        },
                    ],
                };
            }
            case "zenarc_update_schema": {
                const registry = await getRegistry();
                let upgraded = 0;
                let current = 0;
                let failed = 0;
                const brokenFiles = [];
                for (const project of registry) {
                    const tasksDir = join(project.path, ".zenarc", "tasks");
                    let files = [];
                    try {
                        files = (await readdir(tasksDir)).filter((f) => (f.endsWith(".yaml") || f.endsWith(".yml")) &&
                            f !== "config.yml" && f !== "config.yaml" && f !== "overview.yml" && f !== "overview.yaml");
                    }
                    catch {
                        continue;
                    }
                    for (const filename of files) {
                        const filePath = join(tasksDir, filename);
                        let raw;
                        try {
                            const content = await readFile(filePath, "utf-8");
                            raw = (await import("yaml")).parse(content);
                        }
                        catch {
                            failed++;
                            continue;
                        }
                        // Check if file is broken before attempting migration
                        const validation = TaskSchema.safeParse(raw);
                        if (!validation.success) {
                            const errors = validation.error.errors
                                .map((e) => `${e.path?.length ? e.path.join(".") + ": " : ""}${e.message}`)
                                .join("; ");
                            brokenFiles.push({ project: project.name, file: filename, errors });
                            continue;
                        }
                        const detectedVersion = detectSchemaVersion(raw);
                        if (detectedVersion >= CURRENT_SCHEMA_VERSION) {
                            current++;
                            continue;
                        }
                        const result = safeValidateTask(raw, project.name);
                        if (!result.success) {
                            failed++;
                            continue;
                        }
                        try {
                            await writeTask(project.path, result.data);
                            upgraded++;
                        }
                        catch {
                            failed++;
                        }
                    }
                }
                let text = "";
                if (brokenFiles.length > 0) {
                    text += `Found ${brokenFiles.length} broken file(s) that must be repaired before migration:\n`;
                    for (const b of brokenFiles) {
                        text += `- ${b.project}/${b.file}: ${b.errors}\n`;
                    }
                    text += `\nRun zenarc_validate_schema first to repair these files, then run zenarc_update_schema again.\n\n`;
                }
                text += `Upgraded ${upgraded} task file(s) to schema v${CURRENT_SCHEMA_VERSION}.`;
                if (current > 0) {
                    text += ` ${current} file(s) already at current version.`;
                }
                if (failed > 0) {
                    text += ` ${failed} file(s) failed.`;
                }
                return {
                    content: [{ type: "text", text }],
                };
            }
            case "zenarc_validate_schema": {
                const { project } = args;
                const registry = await getRegistry();
                let projects = registry;
                if (project) {
                    projects = projects.filter((p) => p.name === project);
                    if (projects.length === 0) {
                        return {
                            content: [
                                {
                                    type: "text",
                                    text: `Project "${project}" not found in registry.`,
                                },
                            ],
                            isError: true,
                        };
                    }
                }
                const repairedFiles = [];
                let skipped = 0;
                let failed = 0;
                for (const proj of projects) {
                    const tasksDir = join(proj.path, ".zenarc", "tasks");
                    let files = [];
                    try {
                        files = (await readdir(tasksDir)).filter((f) => f.endsWith(".yaml") || f.endsWith(".yml"));
                    }
                    catch {
                        continue;
                    }
                    for (const filename of files) {
                        const filePath = join(tasksDir, filename);
                        let raw;
                        try {
                            const content = await readFile(filePath, "utf-8");
                            raw = (await import("yaml")).parse(content);
                        }
                        catch {
                            failed++;
                            continue;
                        }
                        const rawSnapshot = JSON.parse(JSON.stringify(raw));
                        const repaired = repairTaskData(raw, {
                            projectName: proj.name,
                            targetVersion: detectSchemaVersion(raw),
                        });
                        const result = TaskSchema.safeParse(repaired);
                        if (!result.success) {
                            failed++;
                            continue;
                        }
                        const wasRepaired = JSON.stringify(rawSnapshot) !== JSON.stringify(repaired);
                        if (!wasRepaired) {
                            skipped++;
                            continue;
                        }
                        try {
                            const yaml = (await import("yaml")).stringify(result.data, {
                                indent: 2,
                                sortMapEntries: false,
                            });
                            await writeFile(filePath, yaml, "utf-8");
                            repairedFiles.push({
                                project: proj.name,
                                file: filename,
                                taskId: result.data.id,
                            });
                        }
                        catch {
                            failed++;
                        }
                    }
                }
                let text = "";
                if (repairedFiles.length > 0) {
                    text += `Repaired ${repairedFiles.length} task file(s):\n`;
                    for (const r of repairedFiles) {
                        text += `- ${r.project}/${r.file} (${r.taskId}): repaired\n`;
                    }
                }
                if (skipped > 0) {
                    text += `\nSkipped ${skipped} valid task file(s).`;
                }
                if (failed > 0) {
                    text += `\nFailed to process ${failed} file(s).`;
                }
                if (repairedFiles.length === 0 && failed === 0) {
                    text = "All task files are valid and up to date.";
                }
                return {
                    content: [{ type: "text", text: text.trim() }],
                };
            }
            case "zenarc_get_config": {
                const { project } = args;
                const registry = await getRegistry();
                const projectConfig = registry.find((p) => p.name === project);
                if (!projectConfig) {
                    return {
                        content: [
                            {
                                type: "text",
                                text: `Project "${project}" not found in registry. Run zenarc_scan first.`,
                            },
                        ],
                        isError: true,
                    };
                }
                const configPath = join(projectConfig.path, ".zenarc", "config.yml");
                let raw;
                try {
                    const content = await readFile(configPath, "utf-8");
                    raw = parseYaml(content);
                }
                catch {
                    return {
                        content: [
                            {
                                type: "text",
                                text: `No config.yml found for project "${project}". It likely uses the default dashboard columns: todo, in_progress, blocked, deferred, done.`,
                            },
                        ],
                    };
                }
                const config = raw && typeof raw === "object" ? raw : {};
                const columns = Array.isArray(config.columns)
                    ? config.columns.map((c) => {
                        const col = c;
                        return {
                            id: typeof col.id === "string" ? col.id : "",
                            label: typeof col.label === "string" ? col.label : "",
                            color: typeof col.color === "string" ? col.color : undefined,
                        };
                    }).filter((c) => c.id)
                    : [];
                let text = `Project config for "${project}":\n`;
                if (typeof config.name === "string") {
                    text += `Display name: ${config.name}\n`;
                }
                if (typeof config.canonical_name === "string") {
                    text += `Canonical name: ${config.canonical_name}\n`;
                }
                if (columns.length > 0) {
                    text += `\nDashboard columns (${columns.length}):\n`;
                    for (const col of columns) {
                        text += `- ${col.id}`;
                        if (col.label !== col.id)
                            text += ` (${col.label})`;
                        if (col.color)
                            text += ` [${col.color}]`;
                        text += "\n";
                    }
                    text += "\nUse the 'id' values above as valid statuses when creating or updating tasks.";
                }
                else {
                    text += "\nNo custom column config found. Default columns apply:\n- todo (Todo)\n- in_progress (In Progress)\n- blocked (Blocked)\n- deferred (Deferred)\n- done (Done)";
                }
                return {
                    content: [{ type: "text", text }],
                };
            }
            default:
                return {
                    content: [
                        { type: "text", text: `Unknown tool: ${name}` },
                    ],
                    isError: true,
                };
        }
    }
    catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return {
            content: [{ type: "text", text: `Error: ${message}` }],
            isError: true,
        };
    }
});
async function main() {
    if (handleCLI())
        return;
    await initializeStore();
    // First-run welcome
    const registry = await getRegistry();
    if (registry.length === 0) {
        console.error("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
        console.error("  👋 Welcome to ZenArc MCP!");
        console.error("");
        console.error("  No projects found. To get started, ask Claude to:");
        console.error('  "Scan my projects in ~/dev or ~/projects"');
        console.error("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    }
    else {
        console.error(`ZenArc MCP ready — ${registry.length} project(s) loaded`);
    }
    const transport = new StdioServerTransport();
    await server.connect(transport);
}
main().catch((err) => {
    console.error("Fatal error:", err);
    process.exit(1);
});
//# sourceMappingURL=server.js.map