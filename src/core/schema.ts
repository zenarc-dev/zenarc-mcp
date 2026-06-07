import { z } from "zod";

export const TaskStatus = z.enum([
  "todo",
  "in_progress",
  "done",
  "blocked",
  "deferred",
]);

export const TaskPriority = z.enum([
  "critical",
  "high",
  "medium",
  "low",
]);

export const TaskContext = z.object({
  files: z.array(z.string()).default([]),
  urls: z.array(z.string().url()).default([]),
  notes: z.string().default(""),
});

export const TaskSchema = z.object({
  id: z.string().regex(/^tm-\d{8}-[a-z0-9]{8}$/),
  title: z.string().min(1),
  status: TaskStatus,
  priority: TaskPriority,
  project: z.string().min(1),
  tags: z.array(z.string()).default([]),
  created_at: z.string().datetime(),
  updated_at: z.string().datetime(),
  created_by: z.enum(["human", "claude", "other-agent"]).default("human"),
  assigned_to: z.string().optional(),
  context: TaskContext.default({ files: [], urls: [], notes: "" }),
  dependencies: z.array(z.string()).default([]),
});

export type Task = z.infer<typeof TaskSchema>;
export type TaskStatus = z.infer<typeof TaskStatus>;
export type TaskPriority = z.infer<typeof TaskPriority>;

export function generateTaskId(): string {
  const date = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  const rand = Math.random().toString(36).slice(2, 10);
  return `tm-${date}-${rand}`;
}

export function validateTask(data: unknown): Task {
  return TaskSchema.parse(data);
}

export function safeValidateTask(data: unknown):
  | { success: true; data: Task }
  | { success: false; error: z.ZodError } {
  const result = TaskSchema.safeParse(data);
  if (result.success) {
    return { success: true, data: result.data };
  }
  return { success: false, error: result.error };
}
