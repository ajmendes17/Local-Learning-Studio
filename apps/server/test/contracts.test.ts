import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import {
  CourseMapProposalSchema,
  SourceClassificationProposalSchema,
} from "@local-learning-studio/contracts";

function validCourseMap() {
  const materialId = randomUUID();
  const sourceReference = () => [{ materialId, passageId: randomUUID() }];

  return {
    schemaVersion: "course-map.v1",
    courseId: randomUUID(),
    sourceMaterialIds: [materialId],
    concepts: [
      {
        key: "foundations",
        title: "Foundations",
        description: "Course foundations.",
        learningObjectives: ["Explain the foundations."],
        prerequisiteKeys: [],
        sourceReferences: sourceReference(),
      },
    ],
    modules: [
      {
        key: "module-one",
        title: "Module one",
        description: "The first module.",
        position: 0,
        conceptKeys: ["foundations"],
        sourceReferences: sourceReference(),
      },
    ],
    assessments: [
      {
        title: "Midterm",
        kind: "major-exam",
        moduleKey: "module-one",
        dueAt: null,
        weightPercent: 25,
        sourceReferences: sourceReference(),
      },
    ],
    warnings: [],
  };
}

test("course-map.v1 accepts internally consistent source-grounded structure", () => {
  assert.equal(CourseMapProposalSchema.safeParse(validCourseMap()).success, true);
});

test("course-map.v1 rejects dangling course and source references", () => {
  const proposal = validCourseMap();
  proposal.modules[0]!.conceptKeys = ["missing-concept"];
  proposal.assessments[0]!.moduleKey = "missing-module";
  proposal.concepts[0]!.sourceReferences[0]!.materialId = randomUUID();

  const parsed = CourseMapProposalSchema.safeParse(proposal);
  assert.equal(parsed.success, false);
  if (parsed.success) return;
  assert.deepEqual(
    parsed.error.issues.map(({ path }) => path),
    [
      ["concepts", 0, "sourceReferences", 0, "materialId"],
      ["modules", 0, "conceptKeys", 0],
      ["assessments", 0, "moduleKey"],
    ],
  );
});

test("source-classification.v1 requires unique, internally grounded sources", () => {
  const materialId = randomUUID();
  const proposal = {
    schemaVersion: "source-classification.v1",
    courseId: randomUUID(),
    sourceMaterialIds: [materialId],
    sources: [
      {
        materialId,
        role: "syllabus",
        summary: "Course policies and schedule.",
        confidence: "high",
        evidence: [{ materialId, passageId: randomUUID() }],
      },
    ],
    gaps: [],
    warnings: [],
  };

  assert.equal(
    SourceClassificationProposalSchema.safeParse(proposal).success,
    true,
  );
  proposal.sources.push({
    ...proposal.sources[0]!,
    evidence: [{ materialId: randomUUID(), passageId: randomUUID() }],
  });
  assert.equal(
    SourceClassificationProposalSchema.safeParse(proposal).success,
    false,
  );
});
