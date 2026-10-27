import { z } from "zod";
import { CourseAccentSchema, CourseSummarySchema, MaterialKindSchema } from "./course.js";

export const CanvasStatusSchema = z.object({ configured: z.boolean(), baseUrl: z.string().url() });
export const CanvasPreviewRequestSchema = z.object({ courseUrl: z.string().url().max(2048) });
export const CanvasResourceSchema = z.object({
  id: z.string(), type: z.enum(["syllabus", "outline", "file", "page", "assignment", "quiz", "external"]),
  title: z.string(), filename: z.string(), sourceUrl: z.string().url(),
  kind: MaterialKindSchema, modules: z.array(z.string()),
  availability: z.enum(["available", "locked", "unavailable", "unsupported", "link-only"]),
  detail: z.string(), sizeBytes: z.number().nonnegative().nullable(),
  containsSolutions: z.boolean(), imported: z.boolean(),
});
export const CanvasPreviewSchema = z.object({
  id: z.string().uuid(), expiresAt: z.string(), sourceUrl: z.string().url(),
  course: z.object({ remoteId: z.string(), title: z.string(), code: z.string(), term: z.string() }),
  linkedCourseId: z.string().uuid().nullable(), moduleCount: z.number().int().nonnegative(),
  resources: z.array(CanvasResourceSchema), warnings: z.array(z.string()),
});
export const CanvasImportRequestSchema = z.object({
  previewId: z.string().uuid(), resourceIds: z.array(z.string()).min(1).max(2000),
  existingCourseId: z.string().uuid().optional(),
  title: z.string().trim().min(1).max(120), code: z.string().trim().max(32),
  term: z.string().trim().max(64), accent: CourseAccentSchema.default("moss"),
});
export const CanvasJobItemSchema = z.object({
  resourceId: z.string(), title: z.string(),
  status: z.enum(["queued", "importing", "imported", "unchanged", "failed", "skipped"]),
  detail: z.string(), materialId: z.string().uuid().nullable(),
});
export const CanvasImportJobSchema = z.object({
  id: z.string().uuid(), courseId: z.string().uuid(),
  status: z.enum(["queued", "running", "completed", "completed-with-errors", "interrupted"]),
  createdAt: z.string(), completedAt: z.string().nullable(),
  items: z.array(CanvasJobItemSchema),
});
export const CanvasImportStartedSchema = z.object({ course: CourseSummarySchema, job: CanvasImportJobSchema });
export type CanvasStatus = z.infer<typeof CanvasStatusSchema>;
export type CanvasResource = z.infer<typeof CanvasResourceSchema>;
export type CanvasPreview = z.infer<typeof CanvasPreviewSchema>;
export type CanvasImportRequest = z.infer<typeof CanvasImportRequestSchema>;
export type CanvasImportJob = z.infer<typeof CanvasImportJobSchema>;
export type CanvasJobItem = z.infer<typeof CanvasJobItemSchema>;
