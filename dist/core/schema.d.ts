import { z } from "zod";
export declare const TaskStatus: z.ZodEnum<["todo", "in_progress", "done", "blocked", "deferred"]>;
export declare const TaskPriority: z.ZodEnum<["critical", "high", "medium", "low"]>;
export declare const TaskContext: z.ZodObject<{
    files: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
    urls: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
    notes: z.ZodDefault<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    files: string[];
    urls: string[];
    notes: string;
}, {
    files?: string[] | undefined;
    urls?: string[] | undefined;
    notes?: string | undefined;
}>;
export declare const TaskSchema: z.ZodObject<{
    id: z.ZodString;
    title: z.ZodString;
    status: z.ZodEnum<["todo", "in_progress", "done", "blocked", "deferred"]>;
    priority: z.ZodEnum<["critical", "high", "medium", "low"]>;
    project: z.ZodString;
    tags: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
    created_at: z.ZodString;
    updated_at: z.ZodString;
    created_by: z.ZodDefault<z.ZodEnum<["human", "claude", "other-agent"]>>;
    assigned_to: z.ZodOptional<z.ZodString>;
    context: z.ZodDefault<z.ZodObject<{
        files: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
        urls: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
        notes: z.ZodDefault<z.ZodString>;
    }, "strip", z.ZodTypeAny, {
        files: string[];
        urls: string[];
        notes: string;
    }, {
        files?: string[] | undefined;
        urls?: string[] | undefined;
        notes?: string | undefined;
    }>>;
    dependencies: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
}, "strip", z.ZodTypeAny, {
    status: "todo" | "in_progress" | "done" | "blocked" | "deferred";
    id: string;
    title: string;
    priority: "critical" | "high" | "medium" | "low";
    project: string;
    tags: string[];
    created_at: string;
    updated_at: string;
    created_by: "human" | "claude" | "other-agent";
    context: {
        files: string[];
        urls: string[];
        notes: string;
    };
    dependencies: string[];
    assigned_to?: string | undefined;
}, {
    status: "todo" | "in_progress" | "done" | "blocked" | "deferred";
    id: string;
    title: string;
    priority: "critical" | "high" | "medium" | "low";
    project: string;
    created_at: string;
    updated_at: string;
    tags?: string[] | undefined;
    created_by?: "human" | "claude" | "other-agent" | undefined;
    assigned_to?: string | undefined;
    context?: {
        files?: string[] | undefined;
        urls?: string[] | undefined;
        notes?: string | undefined;
    } | undefined;
    dependencies?: string[] | undefined;
}>;
export type Task = z.infer<typeof TaskSchema>;
export type TaskStatus = z.infer<typeof TaskStatus>;
export type TaskPriority = z.infer<typeof TaskPriority>;
export declare function generateTaskId(): string;
export declare function validateTask(data: unknown): Task;
export declare function safeValidateTask(data: unknown): {
    success: true;
    data: Task;
} | {
    success: false;
    error: z.ZodError;
};
//# sourceMappingURL=schema.d.ts.map