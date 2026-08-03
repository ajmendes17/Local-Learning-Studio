import { z } from "zod";
import { CourseMapProposalSchema } from "./course-map.js";
import { SourceClassificationProposalSchema } from "./source-classification.js";

export const LearningArtifactStatusSchema = z.enum([
  "draft",
  "accepted",
  "superseded",
]);
export type LearningArtifactStatus = z.infer<
  typeof LearningArtifactStatusSchema
>;

const artifactFields = {
  id: z.string().uuid(),
  courseId: z.string().uuid(),
  status: LearningArtifactStatusSchema,
  sourceFingerprint: z.string().regex(/^[a-f0-9]{64}$/),
  skillName: z.string().trim().min(1),
  model: z.string().trim().min(1),
  createdAt: z.string(),
  acceptedAt: z.string().nullable(),
};

export const SourceClassificationArtifactSchema = z.object({
  ...artifactFields,
  kind: z.literal("source-classification"),
  schemaVersion: z.literal("source-classification.v1"),
  payload: SourceClassificationProposalSchema,
});
export type SourceClassificationArtifact = z.infer<
  typeof SourceClassificationArtifactSchema
>;

export const CourseMapArtifactSchema = z.object({
  ...artifactFields,
  kind: z.literal("course-map"),
  schemaVersion: z.literal("course-map.v1"),
  payload: CourseMapProposalSchema,
});
export type CourseMapArtifact = z.infer<typeof CourseMapArtifactSchema>;

export const LearningArtifactSchema = z.discriminatedUnion("kind", [
  SourceClassificationArtifactSchema,
  CourseMapArtifactSchema,
]);
export type LearningArtifact = z.infer<typeof LearningArtifactSchema>;

export const CourseLearningArtifactsResponseSchema = z.object({
  classification: SourceClassificationArtifactSchema.nullable(),
  courseMap: CourseMapArtifactSchema.nullable(),
});
export type CourseLearningArtifactsResponse = z.infer<
  typeof CourseLearningArtifactsResponseSchema
>;
