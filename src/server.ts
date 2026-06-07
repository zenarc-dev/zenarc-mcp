#!/usr/bin/env node
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import {
  getRegistry,
  addProject,
  listProjectTasks,
  readTask,
  writeTask,
  searchTasks,
  scanForProjects,
  generateTaskId,
  validateTask,
  type Task,
} from "./core/index.js";
import { initializeStore } from "./store-init.js";

const server = new Server(
  {
    name: "zenarc-mcp",
    version: "0.1.0",
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: "zenarc_scan",
        description:
          "Discover ZenArc projects under given root directories and add newly-found projects to the registry. Checks subdirectories for .zenarc/tasks/, .zenarc/overview.yml, .zenarc.yml, or legacy task files.",
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
        description:
          "List tasks across projects with optional filtering by project, status, priority, tag, or assignee.",
        inputSchema: {
          type: "object",
          properties: {
            project: { type: "string", description: "Filter by project name" },
            status: {
              type: "string",
              enum: ["todo", "in_progress", "done", "blocked", "deferred"],
              description: "Filter by status",
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
        description: "Create a new task in a project.",
        inputSchema: {
          type: "object",
          properties: {
            project: { type: "string", description: "Project name" },
            title: { type: "string", description: "Task title" },
            status: {
              type: "string",
              enum: ["todo", "in_progress", "done", "blocked", "deferred"],
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
            notes: { type: "string", description: "Context notes" },
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
        description: "Update an existing task's fields.",
        inputSchema: {
          type: "object",
          properties: {
            taskId: { type: "string", description: "Task ID to update" },
            status: {
              type: "string",
              enum: ["todo", "in_progress", "done", "blocked", "deferred"],
            },
            priority: {
              type: "string",
              enum: ["critical", "high", "medium", "low"],
            },
            title: { type: "string" },
            assigned_to: { type: "string" },
            tags: { type: "array", items: { type: "string" } },
            notes: { type: "string" },
            append_notes: {
              type: "string",
              description: "Append text to existing notes",
            },
          },
          required: ["taskId"],
        },
      },
      {
        name: "zenarc_search",
        description: "Search tasks by keyword across titles, tags, and notes.",
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
    ],
  };
});

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    switch (name) {
      case "zenarc_scan": {
        const { rootPaths } = args as { rootPaths: string[] };
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
        const {
          project,
          status,
          priority,
          tag,
          assigned_to,
          limit = 50,
        } = args as {
          project?: string;
          status?: string;
          priority?: string;
          tag?: string;
          assigned_to?: string;
          limit?: number;
        };

        const registry = await getRegistry();
        let projects = registry;
        if (project) {
          projects = projects.filter((p) => p.name === project);
        }

        const allTasks: Task[] = [];
        for (const p of projects) {
          const tasks = await listProjectTasks(p.path);
          allTasks.push(...tasks);
        }

        let filtered = allTasks;
        if (status) filtered = filtered.filter((t) => t.status === status);
        if (priority) filtered = filtered.filter((t) => t.priority === priority);
        if (tag) filtered = filtered.filter((t) => t.tags.includes(tag));
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
          .map(
            (t) =>
              `[${t.status}] ${t.priority} | ${t.project} | ${t.title} (${t.id})${
                t.assigned_to ? ` → @${t.assigned_to}` : ""
              }`
          )
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
        const { taskId } = args as { taskId: string };
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
        const {
          project,
          title,
          status = "todo",
          priority = "medium",
          tags = [],
          assigned_to,
          notes = "",
          files = [],
          urls = [],
          dependencies = [],
        } = args as {
          project: string;
          title: string;
          status?: string;
          priority?: string;
          tags?: string[];
          assigned_to?: string;
          notes?: string;
          files?: string[];
          urls?: string[];
          dependencies?: string[];
        };

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
        const task: Task = validateTask({
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
          context: { files, urls, notes },
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
        const {
          taskId,
          status,
          priority,
          title,
          assigned_to,
          tags,
          notes,
          append_notes,
        } = args as {
          taskId: string;
          status?: string;
          priority?: string;
          title?: string;
          assigned_to?: string;
          tags?: string[];
          notes?: string;
          append_notes?: string;
        };

        const registry = await getRegistry();
        let task: Task | null = null;
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

        if (status !== undefined) task.status = status as Task["status"];
        if (priority !== undefined) task.priority = priority as Task["priority"];
        if (title !== undefined) task.title = title;
        if (assigned_to !== undefined) task.assigned_to = assigned_to;
        if (tags !== undefined) task.tags = tags;
        if (notes !== undefined) task.context.notes = notes;
        if (append_notes !== undefined)
          task.context.notes += "\n" + append_notes;

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

      case "zenarc_search": {
        const {
          query,
          project,
          status,
          priority,
          tag,
          limit = 20,
        } = args as {
          query: string;
          project?: string;
          status?: string;
          priority?: string;
          tag?: string;
          limit?: number;
        };

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
          .map(
            (t) =>
              `[${t.status}] ${t.priority} | ${t.project} | ${t.title} (${t.id})`
          )
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
        const {
          taskId,
          file,
          url,
          note,
        } = args as {
          taskId: string;
          file?: string;
          url?: string;
          note?: string;
        };

        const registry = await getRegistry();
        let task: Task | null = null;
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

        if (file) task.context.files.push(file);
        if (url) task.context.urls.push(url);
        if (note) task.context.notes += "\n" + note;

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

      default:
        return {
          content: [
            { type: "text", text: `Unknown tool: ${name}` },
          ],
          isError: true,
        };
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      content: [{ type: "text", text: `Error: ${message}` }],
      isError: true,
    };
  }
});

async function main() {
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
  } else {
    console.error(`ZenArc MCP ready — ${registry.length} project(s) loaded`);
  }

  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
