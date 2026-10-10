import { z } from "zod";

/** A review is an explicit, bounded proposal. Persistence and scheduling belong to the app. */
export const LearnerPatternReviewRequestSchema = z.object({
  schemaVersion: z.literal("learner-pattern-review.v1"),
  trigger: z.enum(["session-end", "user-request"]),
  courseId: z.string().uuid(),
  requestedAt: z.string().datetime(),
  conceptIds: z.array(z.string().uuid()).max(40).default([]),
  attemptIds: z.array(z.string().uuid()).min(1).max(100),
  priorPatternIds: z.array(z.string().uuid()).max(100).default([]),
});

export const LearnerPatternReviewTriggerSchema = z.discriminatedUnion("trigger", [
  z.object({ trigger: z.literal("session-end"), sessionId: z.string().uuid() }),
  z.object({ trigger: z.literal("user-request") }),
]);

export const LearnerPatternProposalSchema = z.object({
  patternKey: z.string().trim().min(1).max(120).regex(/^[a-z0-9][a-z0-9._-]*$/i),
  kind: z.enum([
    "misconception",
    "demonstrated-strength",
    "effective-strategy",
    "confidence-calibration",
    "engagement-habit",
  ]),
  conceptIds: z.array(z.string().uuid()).max(20).default([]),
  claim: z.string().trim().min(1).max(500),
  status: z.enum(["emerging", "reinforced", "mixed", "weakened"]),
  confidence: z.number().min(0).max(1),
  supportingAttemptIds: z.array(z.string().uuid()).max(50).default([]),
  counterexampleAttemptIds: z.array(z.string().uuid()).max(50).default([]),
  priorStatus: z.enum(["emerging", "reinforced", "mixed", "weakened"]).nullable(),
  statusRationale: z.string().trim().min(1).max(1200),
});

export const LearnerPatternReviewResultSchema = z.object({
  schemaVersion: z.literal("learner-pattern-review.v1"),
  courseId: z.string().uuid(),
  trigger: z.enum(["session-end", "user-request"]),
  reviewedAttemptIds: z.array(z.string().uuid()).min(1).max(100),
  evidenceSufficiency: z.enum(["insufficient", "limited", "adequate"]),
  summary: z.string().trim().min(1).max(1200),
  proposals: z.array(LearnerPatternProposalSchema).max(40),
  unresolvedQuestions: z.array(z.string().trim().min(1).max(300)).max(20).default([]),
}).superRefine((result, ctx) => {
  const reviewed = new Set(result.reviewedAttemptIds);
  for (const [index, proposal] of result.proposals.entries()) {
    for (const id of [...proposal.supportingAttemptIds, ...proposal.counterexampleAttemptIds]) {
      if (!reviewed.has(id)) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["proposals", index], message: "Pattern evidence must reference an attempt included in this review." });
    }
  }
});

export type LearnerPatternReviewRequest = z.infer<typeof LearnerPatternReviewRequestSchema>;
export type LearnerPatternReviewResult = z.infer<typeof LearnerPatternReviewResultSchema>;
