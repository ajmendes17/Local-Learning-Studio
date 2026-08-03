import { z } from "zod";
import { AssessmentKindSchema } from "./course.js";
import { SourceReferenceSchema } from "./source.js";

export const CourseConceptSchema = z.object({
  id: z.string().uuid(),
  courseId: z.string().uuid(),
  title: z.string().trim().min(1).max(160),
  description: z.string().trim().min(1),
  origin: z.enum(["manual", "syllabus"]),
});
export type CourseConcept = z.infer<typeof CourseConceptSchema>;

export const ConceptPrerequisiteSchema = z.object({
  courseId: z.string().uuid(),
  conceptId: z.string().uuid(),
  prerequisiteConceptId: z.string().uuid(),
});
export type ConceptPrerequisite = z.infer<typeof ConceptPrerequisiteSchema>;

const proposalKey = z.string().regex(/^[a-z0-9][a-z0-9-]{0,63}$/);

export const CourseMapConceptProposalSchema = z.object({
  key: proposalKey,
  title: z.string().trim().min(1).max(160),
  description: z.string().trim().min(1),
  learningObjectives: z.array(z.string().trim().min(1)).min(1),
  prerequisiteKeys: z.array(proposalKey),
  sourceReferences: z.array(SourceReferenceSchema).min(1),
});

export const CourseMapModuleProposalSchema = z.object({
  key: proposalKey,
  title: z.string().trim().min(1).max(160),
  description: z.string().trim().min(1),
  position: z.number().int().nonnegative(),
  conceptKeys: z.array(proposalKey).min(1),
  sourceReferences: z.array(SourceReferenceSchema).min(1),
});

export const CourseMapAssessmentProposalSchema = z.object({
  title: z.string().trim().min(1).max(160),
  kind: AssessmentKindSchema,
  moduleKey: proposalKey.nullable(),
  dueAt: z.string().nullable(),
  weightPercent: z.number().min(0).max(100).nullable(),
  sourceReferences: z.array(SourceReferenceSchema).min(1),
});

export const CourseMapProposalSchema = z
  .object({
    schemaVersion: z.literal("course-map.v1"),
    courseId: z.string().uuid(),
    sourceMaterialIds: z.array(z.string().uuid()).min(1),
    modules: z.array(CourseMapModuleProposalSchema).min(1),
    concepts: z.array(CourseMapConceptProposalSchema).min(1),
    assessments: z.array(CourseMapAssessmentProposalSchema),
    warnings: z.array(z.string()),
  })
  .superRefine((proposal, context) => {
    const conceptKeys = new Set(proposal.concepts.map(({ key }) => key));
    const moduleKeys = new Set(proposal.modules.map(({ key }) => key));
    const materialIds = new Set(proposal.sourceMaterialIds);

    const requireUniqueKeys = (
      records: Array<{ key: string }>,
      path: "concepts" | "modules",
    ) => {
      const seen = new Set<string>();
      records.forEach(({ key }, index) => {
        if (seen.has(key)) {
          context.addIssue({
            code: "custom",
            message: `Duplicate ${path.slice(0, -1)} key: ${key}`,
            path: [path, index, "key"],
          });
        }
        seen.add(key);
      });
    };

    const validateReferences = (
      references: Array<{ materialId: string }>,
      path: Array<string | number>,
    ) => {
      references.forEach(({ materialId }, index) => {
        if (!materialIds.has(materialId)) {
          context.addIssue({
            code: "custom",
            message: "Source reference is outside sourceMaterialIds.",
            path: [...path, index, "materialId"],
          });
        }
      });
    };

    requireUniqueKeys(proposal.concepts, "concepts");
    requireUniqueKeys(proposal.modules, "modules");

    proposal.concepts.forEach((concept, index) => {
      concept.prerequisiteKeys.forEach((key, prerequisiteIndex) => {
        if (!conceptKeys.has(key) || key === concept.key) {
          context.addIssue({
            code: "custom",
            message: "Prerequisite must name another proposed concept.",
            path: ["concepts", index, "prerequisiteKeys", prerequisiteIndex],
          });
        }
      });
      validateReferences(concept.sourceReferences, [
        "concepts",
        index,
        "sourceReferences",
      ]);
    });

    proposal.modules.forEach((module, index) => {
      module.conceptKeys.forEach((key, conceptIndex) => {
        if (!conceptKeys.has(key)) {
          context.addIssue({
            code: "custom",
            message: "Module concept key is not proposed.",
            path: ["modules", index, "conceptKeys", conceptIndex],
          });
        }
      });
      validateReferences(module.sourceReferences, [
        "modules",
        index,
        "sourceReferences",
      ]);
    });

    proposal.assessments.forEach((assessment, index) => {
      if (assessment.moduleKey && !moduleKeys.has(assessment.moduleKey)) {
        context.addIssue({
          code: "custom",
          message: "Assessment module key is not proposed.",
          path: ["assessments", index, "moduleKey"],
        });
      }
      validateReferences(assessment.sourceReferences, [
        "assessments",
        index,
        "sourceReferences",
      ]);
    });
  });
export type CourseMapProposal = z.infer<typeof CourseMapProposalSchema>;
