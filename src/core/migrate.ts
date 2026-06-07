import { readFile, rename } from "node:fs/promises";
import { join } from "node:path";
import { parse } from "yaml";
import { generateTaskId, type Task } from "./schema.js";
import { writeTask, addProject, getRegistry } from "./store/index.js";

/**
 * Parse a single TODO.md file into structured tasks.
 */
export async function parseTodoMarkdown(
  content: string,
  projectName: string
): Promise<Task[]> {
  const tasks: Task[] = [];
  const lines = content.split("\n");

  let currentSection = "backlog";
  let i = 0;

  const sectionToStatus: Record<string, string> = {
    active: "in_progress",
    critical: "in_progress",
    "do next": "in_progress",
    backlog: "todo",
    todo: "todo",
    done: "done",
    archive: "done",
    "quick wins": "todo",
  };

  const priorityMap: Record<string, string> = {
    critical: "critical",
    active: "high",
    "do next": "high",
    backlog: "medium",
    todo: "medium",
    done: "low",
    archive: "low",
    "quick wins": "low",
  };

  while (i < lines.length) {
    const line = lines[i];

    // Detect sections via headings
    const headingMatch = line.match(/^##\s+([🔴🟡🟢⚪🔵🟣🟠⚫\s]*)(.+)/i);
    if (headingMatch) {
      const sectionName = headingMatch[2].toLowerCase().trim();
      for (const key of Object.keys(sectionToStatus)) {
        if (sectionName.includes(key)) {
          currentSection = key;
          break;
        }
      }
      i++;
      continue;
    }

    // Detect checklist items
    const checkMatch = line.match(/^\s*-\s*\[([xX\s])\]\s*(.+)/);
    if (checkMatch) {
      const isDone = checkMatch[1].toLowerCase() === "x";
      let title = checkMatch[2].trim();

      // Extract bold title if present: **Fix something** — description
      const boldMatch = title.match(/^\*\*(.+?)\*\*\s*[—\-:]?\s*(.*)/);
      let description = "";
      if (boldMatch) {
        title = boldMatch[1].trim();
        description = boldMatch[2].trim();
      }

      // Collect indented description lines that follow
      const notesLines: string[] = description ? [description] : [];
      let j = i + 1;
      while (j < lines.length) {
        const nextLine = lines[j];
        // Stop at next checklist, heading, or horizontal rule
        if (
          nextLine.match(/^\s*-\s*\[/) ||
          nextLine.match(/^#{1,3}\s/) ||
          nextLine.match(/^\s*---\s*$/)
        ) {
          break;
        }
        // Include indented lines or continuation paragraphs
        if (nextLine.match(/^\s{2,}/) || nextLine.match(/^\s*\>/)) {
          notesLines.push(nextLine.trim());
          j++;
        } else if (nextLine.trim() === "") {
          notesLines.push("");
          j++;
        } else {
          break;
        }
      }

      // Extract file paths from backticks and code blocks in notes
      const files: string[] = [];
      const urls: string[] = [];
      const allText = [title, ...notesLines].join(" ");

      // Match backtick file paths
      const backtickMatches = allText.matchAll(/`([^`]+\.(?:js|ts|tsx|jsx|py|java|kt|swift|go|rs|yaml|json|md|css|html))`/g);
      for (const m of backtickMatches) {
        files.push(m[1]);
      }

      // Match URLs
      const urlMatches = allText.matchAll(/https?:\/\/[^\s\)\]\>]+/g);
      for (const m of urlMatches) {
        urls.push(m[0]);
      }

      const status = isDone
        ? "done"
        : sectionToStatus[currentSection] || "todo";
      const priority =
        priorityMap[currentSection] || "medium";

      const now = new Date().toISOString();

      const task: Task = {
        id: generateTaskId(),
        title,
        status: status as Task["status"],
        priority: priority as Task["priority"],
        project: projectName,
        tags: [],
        created_at: now,
        updated_at: now,
        created_by: "human",
        assigned_to: undefined,
        context: {
          files: [...new Set(files)],
          urls: [...new Set(urls)],
          notes: notesLines.join("\n").trim(),
        },
        dependencies: [],
      };

      tasks.push(task);
      i = j;
      continue;
    }

    i++;
  }

  return tasks;
}

/**
 * Migrate a single project's TODO.md into structured task files.
 */
export async function migrateProject(
  projectName: string,
  projectPath: string,
  todoFilename = "TODO.md"
): Promise<{ tasks: number; archived: boolean }> {
  const todoPath = join(projectPath, todoFilename);

  let content: string;
  try {
    content = await readFile(todoPath, "utf-8");
  } catch {
    return { tasks: 0, archived: false };
  }

  // Add to registry if not present
  const registry = await getRegistry();
  if (!registry.find((p) => p.name === projectName)) {
    await addProject({ name: projectName, path: projectPath, format: "yaml" });
  }

  const tasks = await parseTodoMarkdown(content, projectName);

  for (const task of tasks) {
    await writeTask(projectPath, task);
  }

  // Archive original
  await rename(todoPath, `${todoPath}.archive`);

  return { tasks: tasks.length, archived: true };
}
