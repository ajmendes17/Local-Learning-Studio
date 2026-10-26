import { z } from "zod";

const sourceKey = z.string().regex(/^S\d+-P\d+$/);
const recordKey = z.string().regex(/^(A|M|O)\d+$/);

export const AssessmentReconciliationSchema = z.object({
  schemaVersion: z.literal("assessment-reconciliation.v1"),
  assessmentGroups: z.array(z.object({
    recordKeys: z.array(recordKey).min(1),
    canonicalTitle: z.string().trim().min(1).max(160),
    duplicateConfidence: z.enum(["high", "medium", "low", "not-duplicates"]),
    rationale: z.string().trim().min(1),
    sourceKeys: z.array(sourceKey),
  })).min(1),
  topicFindings: z.array(z.object({
    topic: z.string().trim().min(1).max(200),
    status: z.enum(["directly-supported", "scheduled", "plausible-unverified", "contradicted", "unsupported"]),
    examEvidence: z.array(sourceKey),
    scheduleEvidence: z.array(sourceKey),
    explanation: z.string().trim().min(1),
  })),
  accuracyGrade: z.enum(["A", "B", "C", "D", "F"]),
  gradeRationale: z.string().trim().min(1),
  clarifications: z.array(z.string().trim().min(1)),
  cleanupSuggestions: z.array(z.string().trim().min(1)),
});
export type AssessmentReconciliation = z.infer<typeof AssessmentReconciliationSchema>;

export const AssessmentReconciliationResponseSchema = AssessmentReconciliationSchema.extend({
  sourceIndex: z.array(z.object({
    sourceKey,
    materialName: z.string(),
    location: z.string(),
  })),
  recordIndex: z.array(z.object({
    recordKey,
    title: z.string(),
    kind: z.enum(["course-assessment", "course-map-proposal", "obsidian-note"]),
    filename: z.string().optional(),
  })),
  model: z.string(),
  createdAt: z.string(),
});
export type AssessmentReconciliationResponse = z.infer<typeof AssessmentReconciliationResponseSchema>;
