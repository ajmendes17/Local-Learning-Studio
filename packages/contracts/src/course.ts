import { z } from "zod";

export const CourseAccentSchema = z.enum([
  "moss",
  "clay",
  "ink",
  "ochre",
  "plum",
  "ocean",
]);
export type CourseAccent = z.infer<typeof CourseAccentSchema>;

export const MaterialKindSchema = z.enum([
  "syllabus",
  "lecture-notes",
  "reading",
  "assignment",
  "study-guide",
  "other",
]);
export type MaterialKind = z.infer<typeof MaterialKindSchema>;

export const MaterialStatusSchema = z.enum([
  "stored",
  "processing",
  "ready",
  "failed",
]);
export type MaterialStatus = z.infer<typeof MaterialStatusSchema>;

export const CreateCourseRequestSchema = z.object({
  title: z.string().trim().min(1).max(120),
  code: z.string().trim().max(32).optional().default(""),
  term: z.string().trim().max(64).optional().default(""),
  accent: CourseAccentSchema.optional().default("moss"),
});
export type CreateCourseRequest = z.infer<typeof CreateCourseRequestSchema>;

export const CourseSummarySchema = z.object({
  id: z.string().uuid(),
  title: z.string(),
  code: z.string(),
  term: z.string(),
  accent: CourseAccentSchema,
  materialCount: z.number().int().nonnegative(),
  moduleCount: z.number().int().nonnegative(),
  assessmentCount: z.number().int().nonnegative(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type CourseSummary = z.infer<typeof CourseSummarySchema>;

export const CourseMaterialSchema = z.object({
  id: z.string().uuid(),
  courseId: z.string().uuid(),
  originalName: z.string(),
  mediaType: z.string(),
  kind: MaterialKindSchema,
  sizeBytes: z.number().int().nonnegative(),
  status: MaterialStatusSchema,
  passageCount: z.number().int().nonnegative(),
  errorMessage: z.string().nullable(),
  createdAt: z.string(),
  source: z.object({ provider: z.literal("canvas"), url: z.string().url(), importedAt: z.string() }).optional(),
});
export type CourseMaterial = z.infer<typeof CourseMaterialSchema>;

export const CourseModuleSchema = z.object({
  id: z.string().uuid(),
  courseId: z.string().uuid(),
  title: z.string(),
  position: z.number().int().nonnegative(),
  description: z.string().nullable(),
  origin: z.enum(["manual", "syllabus"]),
});
export type CourseModule = z.infer<typeof CourseModuleSchema>;

export const AssessmentKindSchema = z.enum([
  "major-exam",
  "quiz",
  "paper",
  "project",
  "other",
]);
export type AssessmentKind = z.infer<typeof AssessmentKindSchema>;

export const CourseAssessmentSchema = z.object({
  id: z.string().uuid(),
  courseId: z.string().uuid(),
  moduleId: z.string().uuid().nullable(),
  title: z.string(),
  kind: AssessmentKindSchema,
  dueAt: z.string().nullable(),
  weightPercent: z.number().min(0).max(100).nullable(),
  origin: z.enum(["manual", "syllabus"]),
});
export type CourseAssessment = z.infer<typeof CourseAssessmentSchema>;

export const CourseDetailSchema = CourseSummarySchema.extend({
  materials: z.array(CourseMaterialSchema),
  modules: z.array(CourseModuleSchema),
  assessments: z.array(CourseAssessmentSchema),
  canvas: z.object({ sourceUrl: z.string().url(), remoteId: z.string(), moduleCount: z.number().int().nonnegative(), lastImportedAt: z.string().nullable() }).optional(),
});
export type CourseDetail = z.infer<typeof CourseDetailSchema>;

export const CourseListResponseSchema = z.object({
  courses: z.array(CourseSummarySchema),
});
export type CourseListResponse = z.infer<typeof CourseListResponseSchema>;

