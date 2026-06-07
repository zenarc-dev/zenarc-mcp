import { type Task } from "./schema.js";
/**
 * Parse a single TODO.md file into structured tasks.
 */
export declare function parseTodoMarkdown(content: string, projectName: string): Promise<Task[]>;
/**
 * Migrate a single project's TODO.md into structured task files.
 */
export declare function migrateProject(projectName: string, projectPath: string, todoFilename?: string): Promise<{
    tasks: number;
    archived: boolean;
}>;
//# sourceMappingURL=migrate.d.ts.map