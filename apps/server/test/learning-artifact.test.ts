import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import type {
  CourseMapProposal,
  SourceClassificationProposal,
} from "@local-learning-studio/contracts";
import { CourseLibrary } from "../src/storage/course-library.js";
import { openDatabase } from "../src/storage/database.js";
import { LearningArtifactLibrary } from "../src/storage/learning-artifact-library.js";

const fingerprint = (character: string) => character.repeat(64);

function classification(courseId: string): SourceClassificationProposal {
  const materialId = randomUUID();
  return {
    schemaVersion: "source-classification.v1",
    courseId,
    sourceMaterialIds: [materialId],
    sources: [
      {
        materialId,
        role: "syllabus",
        summary: "Course structure.",
        confidence: "high",
        evidence: [{ materialId, passageId: randomUUID() }],
      },
    ],
    gaps: [],
    warnings: [],
  };
}

function courseMap(
  courseId: string,
  materialId: string,
): CourseMapProposal {
  const sourceReferences = [{ materialId, passageId: randomUUID() }];
  return {
    schemaVersion: "course-map.v1",
    courseId,
    sourceMaterialIds: [materialId],
    concepts: [
      {
        key: "foundations",
        title: "Foundations",
        description: "Core ideas.",
        learningObjectives: ["Explain the core ideas."],
        prerequisiteKeys: [],
        sourceReferences,
      },
    ],
    modules: [
      {
        key: "module-one",
        title: "Module one",
        description: "Start here.",
        position: 0,
        conceptKeys: ["foundations"],
        sourceReferences,
      },
    ],
    assessments: [],
    warnings: [],
  };
}

test("learning artifacts preserve drafts, fingerprints, and accepted history", () => {
  const database = openDatabase(":memory:");
  const course = new CourseLibrary(database).createCourse({
    title: "Artifact Course",
    code: "",
    term: "",
    accent: "moss",
  });
  const artifacts = new LearningArtifactLibrary(database);
  const firstClassification = classification(course.id);

  const savedClassification = artifacts.saveClassification({
    courseId: course.id,
    sourceFingerprint: fingerprint("a"),
    model: "gpt-5.6-luna",
    payload: firstClassification,
  });
  assert.equal(savedClassification.status, "draft");
  assert.equal(
    artifacts.findByFingerprint(
      course.id,
      "source-classification",
      fingerprint("a"),
    )?.id,
    savedClassification.id,
  );

  const firstMap = artifacts.saveCourseMap({
    courseId: course.id,
    sourceFingerprint: fingerprint("b"),
    model: "gpt-5.6-terra",
    payload: courseMap(
      course.id,
      firstClassification.sourceMaterialIds[0]!,
    ),
  });
  const acceptedFirst = artifacts.acceptCourseMap(course.id, firstMap.id);
  assert.equal(acceptedFirst?.status, "accepted");
  assert.ok(acceptedFirst?.acceptedAt);

  const secondMap = artifacts.saveCourseMap({
    courseId: course.id,
    sourceFingerprint: fingerprint("c"),
    model: "gpt-5.6-terra",
    payload: courseMap(
      course.id,
      firstClassification.sourceMaterialIds[0]!,
    ),
  });
  assert.equal(artifacts.latest(course.id, "course-map")?.id, secondMap.id);

  const acceptedSecond = artifacts.acceptCourseMap(course.id, secondMap.id);
  assert.equal(acceptedSecond?.status, "accepted");
  assert.equal(
    artifacts.findByFingerprint(course.id, "course-map", fingerprint("b")),
    null,
  );
  assert.equal(
    artifacts.findByFingerprint(course.id, "course-map", fingerprint("c"))
      ?.status,
    "accepted",
  );
  database.close();
});
