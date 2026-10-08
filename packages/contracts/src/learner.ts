import { z } from "zod";

export const LearnerAssessmentCreateSchema = z.object({
  title: z.string().trim().min(1).max(160),
  kind: z.enum(["exam", "quiz", "other"]).default("exam"),
  scheduledAt: z.string().datetime().nullable().optional(),
  availableMinutes: z.number().int().positive().max(1440).nullable().optional(),
  topics: z.array(z.object({
    title: z.string().trim().min(1).max(200),
    conceptId: z.string().uuid().nullable().optional(),
    importance: z.enum(["low", "normal", "high"]).default("normal"),
    provenance: z.enum(["learner", "model", "material"]).default("learner"),
  })).max(200).default([]),
});
export type LearnerAssessmentCreate = z.infer<typeof LearnerAssessmentCreateSchema>;

export const LearnerConceptCreateSchema = z.object({
  stableKey: z.string().trim().min(1).max(120).regex(/^[a-z0-9][a-z0-9._-]*$/i),
  title: z.string().trim().min(1).max(200),
  description: z.string().trim().max(2000).default(""),
});

export const StudyAttemptCreateSchema = z.object({
  conceptId: z.string().uuid(),
  assessmentId: z.string().uuid().nullable().optional(),
  activityType: z.enum(["recall", "explanation", "application", "recognition", "retention"]),
  prompt: z.string().max(8000).default(""),
  response: z.string().max(20000).default(""),
  reasoning: z.string().max(20000).default(""),
  confidence: z.number().min(0).max(1).nullable().optional(),
  hintCount: z.number().int().nonnegative().max(100).default(0),
  method: z.string().max(120).default(""),
  outcome: z.enum(["correct", "incorrect", "incomplete", "unsupported", "not-graded"]),
  sourceRefs: z.array(z.object({ materialId: z.string().uuid(), passageId: z.string().uuid().optional() })).max(100).default([]),
  independence: z.enum(["independent", "hinted", "assisted", "unknown"]).default("unknown"),
  rationale: z.string().trim().min(1).max(2000),
});

export const StudySessionRequestSchema = z.object({
  topic: z.string().trim().min(1).max(200),
  method: z.enum(["explanation", "worked-example", "quiz", "analogy"]).default("explanation"),
});

export const StudySessionContentSchema = z.object({
  conceptId: z.string().uuid(),
  topic: z.string(),
  method: z.enum(["explanation", "worked-example", "quiz", "analogy"]),
  sourceBasis: z.enum(["general-knowledge", "course-materials"]),
  lesson: z.string().min(1),
  example: z.string().default(""),
  question: z.string().min(1),
  options: z.array(z.string().min(1)).min(2).max(6),
  answerIndex: z.number().int().nonnegative(),
  feedback: z.string().min(1),
  clarification: z.string().min(1),
  hints: z.array(z.string().min(1).max(1200)).max(3).default([]),
}).refine((value) => value.answerIndex < value.options.length, {
  message: "Answer index must name one of the options.",
  path: ["answerIndex"],
});
export const StudyQuestionSchema = z.object({
  question: z.string().min(1).max(8000),
  options: z.array(z.string().min(1).max(2000)).min(2).max(6),
  answerIndex: z.number().int().nonnegative(),
  feedback: z.string().min(1).max(4000),
  hints: z.array(z.string().min(1).max(1200)).min(1).max(3),
}).refine((value) => value.answerIndex < value.options.length, {
  message: "Answer index must name one of the options.",
  path: ["answerIndex"],
});
export const StudySessionGenerationContentSchema = StudySessionContentSchema.safeExtend({
  hints: z.array(z.string().min(1).max(1200)).min(1).max(3),
});
export const StudySessionRecordSchema = StudySessionContentSchema.safeExtend({
  sessionId: z.string().uuid(),
  createdAt: z.string().datetime(),
});
export const StudySessionSummarySchema = z.object({
  sessionId: z.string().uuid(), conceptId: z.string().uuid(), topic: z.string(),
  method: z.enum(["explanation", "worked-example", "quiz", "analogy"]),
  createdAt: z.string().datetime(), attemptCount: z.number().int().nonnegative(),
  correctCount: z.number().int().nonnegative(), latestOutcome: z.enum(["correct", "incorrect", "incomplete", "unsupported", "not-graded"]).nullable(),
});

export const StudyClarificationRequestSchema = z.object({
  conceptId: z.string().uuid(),
  topic: z.string().trim().min(1).max(200),
  question: z.string().trim().min(1).max(4000),
  context: z.string().max(4000).default(""),
});
export const StudyClarificationResponseSchema = z.object({
  answer: z.string().min(1),
  followUp: z.string().default(""),
  sourceBasis: z.enum(["general-knowledge", "course-materials"]),
});

export const LearnerProfileResponseSchema = z.object({
  assessments: z.array(z.object({
    id: z.string().uuid(), title: z.string(), kind: z.enum(["exam", "quiz", "other"]),
    scheduledAt: z.string().nullable(), availableMinutes: z.number().int().nullable(), createdAt: z.string(),
    topics: z.array(z.object({ id: z.string().uuid(), conceptId: z.string().uuid().nullable(), title: z.string(), position: z.number().int(), importance: z.enum(["low", "normal", "high"]), provenance: z.enum(["learner", "model", "material"]) })),
  })),
  concepts: z.array(z.object({
    id: z.string().uuid(), stableKey: z.string(), title: z.string(), description: z.string(),
    attemptCount: z.number().int().nonnegative(), correctCount: z.number().int().nonnegative(),
    latestOutcome: z.enum(["correct", "incorrect", "incomplete", "unsupported", "not-graded"]).nullable(),
    lastPracticedAt: z.string().nullable(),
  })),
});
export type LearnerProfileResponse = z.infer<typeof LearnerProfileResponseSchema>;
