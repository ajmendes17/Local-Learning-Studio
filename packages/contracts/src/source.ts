import { z } from "zod";

export const PageSourceLocationSchema = z.object({
  kind: z.literal("page"),
  pageStart: z.number().int().positive(),
  pageEnd: z.number().int().positive(),
});

export const LineSourceLocationSchema = z.object({
  kind: z.literal("lines"),
  lineStart: z.number().int().positive(),
  lineEnd: z.number().int().positive(),
  heading: z.string().nullable(),
});

export const ParagraphSourceLocationSchema = z.object({
  kind: z.literal("paragraphs"),
  paragraphStart: z.number().int().positive(),
  paragraphEnd: z.number().int().positive(),
  heading: z.string().nullable(),
});

export const SlideSourceLocationSchema = z.object({
  kind: z.literal("slides"),
  slideStart: z.number().int().positive(),
  slideEnd: z.number().int().positive(),
  title: z.string().nullable(),
});

export const SourceLocationSchema = z.discriminatedUnion("kind", [
  PageSourceLocationSchema,
  LineSourceLocationSchema,
  ParagraphSourceLocationSchema,
  SlideSourceLocationSchema,
]);
export type SourceLocation = z.infer<typeof SourceLocationSchema>;

export const SourcePassageSchema = z.object({
  id: z.string().uuid(),
  courseId: z.string().uuid(),
  materialId: z.string().uuid(),
  ordinal: z.number().int().nonnegative(),
  content: z.string().min(1),
  contentHash: z.string().regex(/^[a-f0-9]{64}$/),
  location: SourceLocationSchema,
  createdAt: z.string(),
});
export type SourcePassage = z.infer<typeof SourcePassageSchema>;

export const MaterialPassagesResponseSchema = z.object({
  passages: z.array(SourcePassageSchema),
  total: z.number().int().nonnegative(),
  offset: z.number().int().nonnegative(),
  limit: z.number().int().positive(),
});
export type MaterialPassagesResponse = z.infer<
  typeof MaterialPassagesResponseSchema
>;

export const SourceAnnotationCreateSchema = z.object({
  passageId: z.string().uuid(),
  body: z.string().trim().min(1).max(8000),
});
export const SourceAnnotationUpdateSchema = z.object({
  body: z.string().trim().min(1).max(8000),
});
export const SourceAnnotationSchema = z.object({
  id: z.string().uuid(),
  courseId: z.string().uuid(),
  materialId: z.string().uuid(),
  passageId: z.string().uuid(),
  ordinal: z.number().int().nonnegative(),
  contentHash: z.string().regex(/^[a-f0-9]{64}$/),
  location: SourceLocationSchema,
  excerpt: z.string().min(1),
  body: z.string().min(1),
  isCurrent: z.boolean(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type SourceAnnotation = z.infer<typeof SourceAnnotationSchema>;
export const SourceAnnotationsResponseSchema = z.array(SourceAnnotationSchema);

export const SourceReferenceSchema = z.object({
  materialId: z.string().uuid(),
  passageId: z.string().uuid(),
});
export type SourceReference = z.infer<typeof SourceReferenceSchema>;
