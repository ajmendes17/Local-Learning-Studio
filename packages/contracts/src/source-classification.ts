import { z } from "zod";
import { SourceReferenceSchema } from "./source.js";

export const SourceRoleSchema = z.enum([
  "syllabus",
  "schedule",
  "lecture-notes",
  "reading",
  "assignment",
  "study-guide",
  "reference",
  "other",
]);
export type SourceRole = z.infer<typeof SourceRoleSchema>;

export const ClassifiedSourceSchema = z.object({
  materialId: z.string().uuid(),
  role: SourceRoleSchema,
  summary: z.string().trim().min(1),
  confidence: z.enum(["high", "medium", "low"]),
  evidence: z.array(SourceReferenceSchema).min(1),
});
export type ClassifiedSource = z.infer<typeof ClassifiedSourceSchema>;

export const SourceClassificationProposalSchema = z
  .object({
    schemaVersion: z.literal("source-classification.v1"),
    courseId: z.string().uuid(),
    sourceMaterialIds: z.array(z.string().uuid()).min(1),
    sources: z.array(ClassifiedSourceSchema).min(1),
    gaps: z.array(z.string().trim().min(1)),
    warnings: z.array(z.string().trim().min(1)),
  })
  .superRefine((proposal, context) => {
    const materialIds = new Set(proposal.sourceMaterialIds);
    const classified = new Set<string>();

    proposal.sources.forEach((source, sourceIndex) => {
      if (!materialIds.has(source.materialId)) {
        context.addIssue({
          code: "custom",
          message: "Classified source is outside sourceMaterialIds.",
          path: ["sources", sourceIndex, "materialId"],
        });
      }
      if (classified.has(source.materialId)) {
        context.addIssue({
          code: "custom",
          message: "Each source material may be classified only once.",
          path: ["sources", sourceIndex, "materialId"],
        });
      }
      classified.add(source.materialId);

      source.evidence.forEach((reference, referenceIndex) => {
        if (reference.materialId !== source.materialId) {
          context.addIssue({
            code: "custom",
            message: "Classification evidence must belong to its material.",
            path: ["sources", sourceIndex, "evidence", referenceIndex],
          });
        }
      });
    });
  });
export type SourceClassificationProposal = z.infer<
  typeof SourceClassificationProposalSchema
>;
