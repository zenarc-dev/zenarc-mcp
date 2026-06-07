import { readFile, writeFile, readdir, mkdir, access, unlink } from "node:fs/promises";
import { join } from "node:path";
import { homedir } from "node:os";
import { parse, stringify } from "yaml";
import { validateTask, type Task } from "../schema.js";
import type { TaskStore, ProjectConfig } from "./types.js";

const ZENARC_DIR = join(homedir(), ".zenarc");
const REGISTRY_PATH = join(ZENARC_DIR, "projects.json");
const RECENT_PARENTS_PATH = join(ZENARC_DIR, "recent-parents.json");
const MAX_RECENT_PARENTS = 20;

const AGENT_MD = `# ZenArc Project Structure

This folder (\`.zenarc/\`) is managed by **ZenArc** — a task manager that stores tasks as YAML files.

## Folder Structure

\`\`\`
.zenarc/
├── AGENT.md         # This file — structure documentation
├── overview.yml     # Auto-generated project summary (task counts, last updated)
└── tasks/           # Individual task YAML files
    ├── {slug}.yaml
    └── ...
\`\`\`

## Rules

- **All task files MUST be stored in \`.zenarc/tasks/\`** — never in the project root.
- **Task filenames are \`{slug}.yaml\`** where slug comes from the task title.
- **Never rename task files manually** — ZenArc tracks tasks by ID inside the YAML, not by filename.
- **\`overview.yml\` is auto-generated** — do not edit it manually. It gets refreshed on every task change.
- **\`config.yml\` is reserved** for user-configurable project settings. Do not create it unless asked.

## Backward Compatibility

Old ZenArc projects may have task files directly in the project root (e.g., \`zenarc-*.yaml\` or \`tm-*.yaml\`). These are still read for backward compatibility, but all new tasks are written to \`.zenarc/tasks/\`.

## Task YAML Format

Each task file contains:
- \`id\`: Unique task ID (e.g., \`tm-20260604-abc12345\`)
- \`title\`, \`status\`, \`priority\`, \`project\`, \`tags\`
- \`created_at\`, \`updated_at\`, \`created_by\`, \`assigned_to\`
- \`context\`: \`{ files, urls, notes }\`
- \`dependencies\`: Array of task IDs
`;

async function ensureDir(path: string): Promise<void> {
  await mkdir(path, { recursive: true });
}

/* ------------------------------------------------------------------ */
/*  Recent parent directories — improves project path auto-detection  */
/* ------------------------------------------------------------------ */

export async function getRecentParents(): Promise<string[]> {
  try {
    const raw = await readFile(RECENT_PARENTS_PATH, "utf-8");
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed) && parsed.every((p) => typeof p === "string")) {
      return parsed;
    }
  } catch {
    // File doesn't exist or is invalid
  }
  return [];
}

export async function addRecentParent(dir: string): Promise<void> {
  const recent = await getRecentParents();
  const normalized = dir.trim();
  if (!normalized) return;

  // Move to front if already exists, otherwise prepend
  const filtered = recent.filter((p) => p !== normalized);
  filtered.unshift(normalized);

  // Limit size
  const trimmed = filtered.slice(0, MAX_RECENT_PARENTS);

  await ensureDir(ZENARC_DIR);
  await writeFile(RECENT_PARENTS_PATH, JSON.stringify(trimmed, null, 2), "utf-8");
}

function isPotentialTaskFile(name: string): boolean {
  return name.endsWith(".yaml") || name.endsWith(".yml");
}

function isLegacyTaskFilename(name: string): boolean {
  return (
    isPotentialTaskFile(name) &&
    (name.startsWith("zenarc-") || name.startsWith("tm-"))
  );
}

function getZenarcDir(projectPath: string): string {
  return join(projectPath, ".zenarc");
}

function getProjectOverviewPath(projectPath: string): string {
  return join(getZenarcDir(projectPath), "overview.yml");
}

export class YamlTaskStore implements TaskStore {
  getProjectTasksDir(projectPath: string): string {
    return join(projectPath, ".zenarc", "tasks");
  }

  private async ensureZenarcStructure(projectPath: string): Promise<string> {
    const zenarcDir = getZenarcDir(projectPath);
    const tasksDir = this.getProjectTasksDir(projectPath);
    await ensureDir(tasksDir);

    // Write AGENT.md on first creation
    const agentPath = join(zenarcDir, "AGENT.md");
    try {
      await access(agentPath);
    } catch {
      await writeFile(agentPath, AGENT_MD, "utf-8");
    }

    return tasksDir;
  }

  async getRegistry(): Promise<ProjectConfig[]> {
    try {
      const raw = await readFile(REGISTRY_PATH, "utf-8");
      return JSON.parse(raw) as ProjectConfig[];
    } catch {
      return [];
    }
  }

  async saveRegistry(projects: ProjectConfig[]): Promise<void> {
    await ensureDir(ZENARC_DIR);
    await writeFile(REGISTRY_PATH, JSON.stringify(projects, null, 2), "utf-8");
  }

  async addProject(config: ProjectConfig): Promise<void> {
    const registry = await this.getRegistry();
    const filtered = registry.filter((p) => p.name !== config.name);
    filtered.push(config);
    await this.saveRegistry(filtered);
  }

  async removeProject(name: string): Promise<void> {
    const registry = await this.getRegistry();
    await this.saveRegistry(registry.filter((p) => p.name !== name));
  }

  /* ------------------------------------------------------------------ */
  /*  Config / summary file                                             */
  /* ------------------------------------------------------------------ */

  private async writeProjectConfig(projectPath: string, tasks: Task[]): Promise<void> {
    const overviewPath = getProjectOverviewPath(projectPath);
    const counts: Record<string, number> = {};
    for (const task of tasks) {
      counts[task.status] = (counts[task.status] || 0) + 1;
    }

    const config = {
      name: tasks[0]?.project || "",
      summary: {
        total: tasks.length,
        by_status: counts,
      },
      last_updated: new Date().toISOString(),
    };

    await writeFile(overviewPath, stringify(config, { indent: 2 }), "utf-8");
  }

  /* ------------------------------------------------------------------ */
  /*  Task reading — prefers .zenarc/tasks/, falls back to root         */
  /* ------------------------------------------------------------------ */

  async listProjectTasks(projectPath: string): Promise<Task[]> {
    const tasks = new Map<string, Task>();

    // Read from .zenarc/tasks/ (new location)
    try {
      const tasksDir = this.getProjectTasksDir(projectPath);
      const entries = await readdir(tasksDir);
      for (const entry of entries) {
        if (!isPotentialTaskFile(entry)) continue;
        try {
          const raw = await readFile(join(tasksDir, entry), "utf-8");
          const data = parse(raw);
          const task = validateTask(data);
          tasks.set(task.id, task);
        } catch {
          // Skip invalid task files
        }
      }
    } catch {
      // .zenarc/tasks/ doesn't exist yet
    }

    // Backward compatibility: read from project root
    try {
      const entries = await readdir(projectPath);
      for (const entry of entries) {
        if (!isPotentialTaskFile(entry)) continue;
        try {
          const raw = await readFile(join(projectPath, entry), "utf-8");
          const data = parse(raw);
          const task = validateTask(data);
          if (!tasks.has(task.id)) {
            tasks.set(task.id, task);
          }
        } catch {
          // Skip invalid task files
        }
      }
    } catch {
      // Project path doesn't exist
    }

    return Array.from(tasks.values()).sort(
      (a, b) =>
        new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()
    );
  }

  async readTask(projectPath: string, taskId: string): Promise<Task | null> {
    // Search .zenarc/tasks/ first
    try {
      const tasksDir = this.getProjectTasksDir(projectPath);
      const entries = await readdir(tasksDir);
      for (const entry of entries) {
        if (!isPotentialTaskFile(entry)) continue;
        try {
          const raw = await readFile(join(tasksDir, entry), "utf-8");
          const data = parse(raw);
          if (data.id === taskId) {
            return validateTask(data);
          }
        } catch {
          // Continue searching
        }
      }
    } catch {
      // .zenarc/tasks/ doesn't exist
    }

    // Backward compatibility: search project root
    try {
      const entries = await readdir(projectPath);
      for (const entry of entries) {
        if (!isPotentialTaskFile(entry)) continue;
        try {
          const raw = await readFile(join(projectPath, entry), "utf-8");
          const data = parse(raw);
          if (data.id === taskId) {
            return validateTask(data);
          }
        } catch {
          // Continue searching
        }
      }
    } catch {
      // Project path doesn't exist
    }

    return null;
  }

  /* ------------------------------------------------------------------ */
  /*  Task writing — always writes to .zenarc/tasks/                    */
  /* ------------------------------------------------------------------ */

  async writeTask(projectPath: string, task: Task): Promise<void> {
    const tasksDir = await this.ensureZenarcStructure(projectPath);

    const validated = validateTask(task);
    const yaml = stringify(validated, {
      indent: 2,
      sortMapEntries: false,
    });

    // Try to find existing file by task ID and overwrite it
    try {
      const entries = await readdir(tasksDir);
      for (const entry of entries) {
        if (!isPotentialTaskFile(entry)) continue;
        try {
          const raw = await readFile(join(tasksDir, entry), "utf-8");
          const data = parse(raw);
          if (data.id === task.id) {
            await writeFile(join(tasksDir, entry), yaml, "utf-8");
            await this.writeProjectConfig(projectPath, [
              ...Array.from(
                (await this.listProjectTasks(projectPath)).filter((t) => t.id !== task.id)
              ),
              validated,
            ]);
            return;
          }
        } catch {
          // Continue searching
        }
      }
    } catch {
      // Directory empty or unreadable
    }

    // No existing file — create new slug-based filename
    const slug = task.title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 50);

    let filename = `${slug}.yaml`;
    let filepath = join(tasksDir, filename);

    // Handle collision by appending counter
    let counter = 1;
    while (true) {
      try {
        await access(filepath);
        counter++;
        filename = `${slug}-${counter}.yaml`;
        filepath = join(tasksDir, filename);
      } catch {
        break;
      }
    }

    await writeFile(filepath, yaml, "utf-8");

    // Update config summary
    const existingTasks = await this.listProjectTasks(projectPath);
    await this.writeProjectConfig(projectPath, [...existingTasks, validated]);
  }

  /* ------------------------------------------------------------------ */
  /*  Task deletion — prefers .zenarc/tasks/, falls back to root        */
  /* ------------------------------------------------------------------ */

  async deleteTask(projectPath: string, taskId: string): Promise<boolean> {
    let deletedTask: Task | null = null;

    // Search .zenarc/tasks/ first
    try {
      const tasksDir = this.getProjectTasksDir(projectPath);
      const entries = await readdir(tasksDir);
      for (const entry of entries) {
        if (!isPotentialTaskFile(entry)) continue;
        try {
          const raw = await readFile(join(tasksDir, entry), "utf-8");
          const data = parse(raw);
          if (data.id === taskId) {
            await unlink(join(tasksDir, entry));
            deletedTask = validateTask(data);
            break;
          }
        } catch {
          // Continue searching
        }
      }
    } catch {
      // .zenarc/tasks/ doesn't exist
    }

    // Backward compatibility: search project root
    if (!deletedTask) {
      try {
        const entries = await readdir(projectPath);
        for (const entry of entries) {
          if (!isPotentialTaskFile(entry)) continue;
          try {
            const raw = await readFile(join(projectPath, entry), "utf-8");
            const data = parse(raw);
            if (data.id === taskId) {
              await unlink(join(projectPath, entry));
              deletedTask = validateTask(data);
              break;
            }
          } catch {
            // Continue searching
          }
        }
      } catch {
        // Project path doesn't exist
      }
    }

    if (deletedTask) {
      const remaining = (await this.listProjectTasks(projectPath)).filter(
        (t) => t.id !== taskId
      );
      await this.writeProjectConfig(projectPath, remaining);
      return true;
    }

    return false;
  }

  async searchTasks(
    query: string,
    options?: {
      project?: string;
      status?: string;
      priority?: string;
      tag?: string;
      assigned_to?: string;
    }
  ): Promise<Task[]> {
    const registry = await this.getRegistry();
    let projects = registry;

    if (options?.project) {
      projects = projects.filter((p) => p.name === options.project);
    }

    const allTasks: Task[] = [];
    for (const project of projects) {
      const tasks = await this.listProjectTasks(project.path);
      allTasks.push(...tasks);
    }

    const q = query.toLowerCase();

    return allTasks.filter((task) => {
      if (options?.status && task.status !== options.status) return false;
      if (options?.priority && task.priority !== options.priority) return false;
      if (options?.tag && !task.tags.includes(options.tag)) return false;
      if (options?.assigned_to && task.assigned_to !== options.assigned_to)
        return false;

      if (!q) return true;

      const text = [
        task.title,
        task.context.notes,
        ...task.tags,
        task.project,
        task.assigned_to || "",
      ]
        .join(" ")
        .toLowerCase();

      return text.includes(q);
    });
  }

  async scanForProjects(rootPaths: string[]): Promise<ProjectConfig[]> {
    const { readdir } = await import("node:fs/promises");
    const found: ProjectConfig[] = [];
    const seen = new Set<string>();

    const checkProject = async (projectPath: string, name: string): Promise<boolean> => {
      if (seen.has(projectPath)) return false;

      // Check for .zenarc/tasks/ directory (new format)
      try {
        const tasksDir = this.getProjectTasksDir(projectPath);
        await access(tasksDir);
        const files = await readdir(tasksDir);
        if (files.some(isPotentialTaskFile)) {
          found.push({ name, path: projectPath, format: "yaml" });
          seen.add(projectPath);
          return true;
        }
      } catch {
        // No .zenarc/tasks/ directory
      }

      // Check for .zenarc/overview.yml
      try {
        await access(getProjectOverviewPath(projectPath));
        found.push({ name, path: projectPath, format: "yaml" });
        seen.add(projectPath);
        return true;
      } catch {
        // No .zenarc/overview.yml
      }

      // Check for .zenarc.yml config file (legacy)
      try {
        await access(join(projectPath, ".zenarc.yml"));
        found.push({ name, path: projectPath, format: "yaml" });
        seen.add(projectPath);
        return true;
      } catch {
        // No .zenarc.yml
      }

      // Backward compatibility: check for legacy task files in root
      try {
        const files = await readdir(projectPath);
        const hasTaskFiles = files.some((f) => isLegacyTaskFilename(f));
        if (hasTaskFiles) {
          found.push({ name, path: projectPath, format: "yaml" });
          seen.add(projectPath);
          return true;
        }
      } catch {
        // Can't read directory
      }

      return false;
    };

    for (const root of rootPaths) {
      // First, check if the root path itself is a project
      const rootName = root.split("/").pop() || root;
      const isProject = await checkProject(root, rootName);
      if (isProject) continue;

      // Then scan subdirectories (original behavior)
      try {
        const entries = await readdir(root, { withFileTypes: true });
        for (const entry of entries) {
          if (!entry.isDirectory()) continue;
          const projectPath = join(root, entry.name);
          await checkProject(projectPath, entry.name);
        }
      } catch {
        // Root path doesn't exist or isn't readable
      }
    }

    return found;
  }
}
