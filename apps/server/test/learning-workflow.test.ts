import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  CourseDetailSchema,
  CourseLearningArtifactsResponseSchema,
  CourseMapArtifactSchema,
  CourseSummarySchema,
  SourceClassificationArtifactSchema,
  type CodexTask,
} from "@local-learning-studio/contracts";
import type { z } from "zod";
import { buildApp } from "../src/app.js";
import type { CodexRunResult } from "../src/codex/codex-runner.js";
import type { LearningCodexClient } from "../src/learning/learning-workflow-service.js";

function multipartFile(filename: string, content: string) {
  const boundary = "learning-workflow-test-boundary";
  return {
    contentType: `multipart/form-data; boundary=${boundary}`,
    payload: Buffer.from(
      [
        `--${boundary}`,
        `Content-Disposition: form-data; name="file"; filename="${filename}"`,
        "Content-Type: text/markdown",
        "",
        content,
        `--${boundary}--`,
        "",
      ].join("\r\n"),
    ),
  };
}

class FakeLearningCodex implements LearningCodexClient {
  readonly calls: CodexTask[] = [];

  async status() {
    return {
      installed: true,
      authenticated: true,
      ready: true,
      version: "fake-codex",
      detail: null,
    };
  }

  async run<T>(
    task: CodexTask,
    prompt: string,
    outputSchema: z.ZodType<T>,
  ): Promise<CodexRunResult<T>> {
    this.calls.push(task);
    const input = JSON.parse(prompt.split("INPUT_JSON\n\n")[1]!) as any;
    const projection = task === "map-course" ? input.projection : input;
    const materialIds = projection.materials.map(({ id }: any) => id);
    const references = projection.materials.map(({ id, passages }: any) => ({
      materialId: id,
      passageId: passages[0].id,
    }));
    const raw =
      task === "classify-course-sources"
        ? {
            schemaVersion: "source-classification.v1",
            courseId: projection.course.id,
            sourceMaterialIds: materialIds,
            sources: projection.materials.map(
              ({ id, declaredKind, passages }: any) => ({
                materialId: id,
                role: declaredKind,
                summary: `Classified ${declaredKind} source.`,
                confidence: "high",
                evidence: [{ materialId: id, passageId: passages[0].id }],
              }),
            ),
            gaps: [],
            warnings: [],
          }
        : {
            schemaVersion: "course-map.v1",
            courseId: projection.course.id,
            sourceMaterialIds: materialIds,
            concepts: [
              {
                key: "course-foundations",
                title: "Course foundations",
                description: "The central ideas in the supplied sources.",
                learningObjectives: ["Explain the course foundations."],
                prerequisiteKeys: [],
                sourceReferences: references,
              },
            ],
            modules: [
              {
                key: "module-one",
                title: "Module one",
                description: "The opening course module.",
                position: 0,
                conceptKeys: ["course-foundations"],
                sourceReferences: references,
              },
            ],
            assessments: [
              {
                title: "Checkpoint quiz",
                kind: "quiz",
                moduleKey: "module-one",
                dueAt: null,
                weightPercent: null,
                sourceReferences: [references[0]],
              },
            ],
            warnings: [],
          };

    return {
      task,
      model:
        task === "classify-course-sources"
          ? "gpt-5.6-luna"
          : "gpt-5.6-terra",
      startedAt: new Date().toISOString(),
      durationMs: 1,
      output: outputSchema.parse(raw),
    };
  }
}

test("course sources flow through cached classification, map review, and acceptance", async () => {
  const root = await mkdtemp(join(tmpdir(), "learning-workflow-"));
  const databasePath = join(root, "data", "studio.sqlite");
  const courseRoot = join(root, "courses");
  const codex = new FakeLearningCodex();
  const app = buildApp({ databasePath, courseRoot, codex });

  const createResponse = await app.inject({
    method: "POST",
    url: "/api/courses",
    payload: { title: "Learning Systems" },
  });
  const course = CourseSummarySchema.parse(createResponse.json());

  const emptyAnalysis = await app.inject({
    method: "POST",
    url: `/api/courses/${course.id}/source-classification`,
    payload: {},
  });
  assert.equal(emptyAnalysis.statusCode, 409);
  assert.equal(codex.calls.length, 0);

  const upload = multipartFile(
    "syllabus.md",
    "# Learning Systems\n\nStudy feedback loops.\n\n## Quiz\n\nCheckpoint quiz.",
  );
  const uploadResponse = await app.inject({
    method: "POST",
    url: `/api/courses/${course.id}/materials?kind=syllabus`,
    headers: { "content-type": upload.contentType },
    payload: upload.payload,
  });
  assert.equal(uploadResponse.statusCode, 201);

  const classificationResponse = await app.inject({
    method: "POST",
    url: `/api/courses/${course.id}/source-classification`,
    payload: {},
  });
  assert.equal(classificationResponse.statusCode, 200);
  const classification = SourceClassificationArtifactSchema.parse(
    classificationResponse.json(),
  );
  assert.equal(classification.payload.sources[0]?.role, "syllabus");
  assert.deepEqual(codex.calls, ["classify-course-sources"]);

  const cachedClassificationResponse = await app.inject({
    method: "POST",
    url: `/api/courses/${course.id}/source-classification`,
    payload: {},
  });
  assert.equal(
    SourceClassificationArtifactSchema.parse(cachedClassificationResponse.json())
      .id,
    classification.id,
  );
  assert.equal(codex.calls.length, 1, "matching classification should be cached");

  const mapResponse = await app.inject({
    method: "POST",
    url: `/api/courses/${course.id}/course-map`,
    payload: {},
  });
  assert.equal(mapResponse.statusCode, 200);
  const courseMap = CourseMapArtifactSchema.parse(mapResponse.json());
  assert.equal(courseMap.status, "draft");
  assert.deepEqual(codex.calls, ["classify-course-sources", "map-course"]);

  await app.inject({
    method: "POST",
    url: `/api/courses/${course.id}/course-map`,
    payload: {},
  });
  assert.equal(codex.calls.length, 2, "matching map should be cached");

  const secondUpload = multipartFile(
    "lecture.md",
    "# Feedback\n\nUse retrieval evidence to revise the plan.",
  );
  await app.inject({
    method: "POST",
    url: `/api/courses/${course.id}/materials?kind=lecture-notes`,
    headers: { "content-type": secondUpload.contentType },
    payload: secondUpload.payload,
  });
  const staleAcceptResponse = await app.inject({
    method: "POST",
    url: `/api/courses/${course.id}/course-map/${courseMap.id}/accept`,
  });
  assert.equal(staleAcceptResponse.statusCode, 409);

  const refreshedClassificationResponse = await app.inject({
    method: "POST",
    url: `/api/courses/${course.id}/source-classification`,
    payload: {},
  });
  const refreshedClassification = SourceClassificationArtifactSchema.parse(
    refreshedClassificationResponse.json(),
  );
  const refreshedMapResponse = await app.inject({
    method: "POST",
    url: `/api/courses/${course.id}/course-map`,
    payload: {},
  });
  const refreshedMap = CourseMapArtifactSchema.parse(
    refreshedMapResponse.json(),
  );
  assert.notEqual(refreshedMap.id, courseMap.id);

  const acceptResponse = await app.inject({
    method: "POST",
    url: `/api/courses/${course.id}/course-map/${refreshedMap.id}/accept`,
  });
  assert.equal(acceptResponse.statusCode, 200);
  assert.equal(CourseMapArtifactSchema.parse(acceptResponse.json()).status, "accepted");

  const detailResponse = await app.inject({
    method: "GET",
    url: `/api/courses/${course.id}`,
  });
  const detail = CourseDetailSchema.parse(detailResponse.json());
  assert.equal(detail.modules.length, 1);
  assert.equal(detail.assessments.length, 1);

  const artifactsResponse = await app.inject({
    method: "GET",
    url: `/api/courses/${course.id}/learning-artifacts`,
  });
  const artifacts = CourseLearningArtifactsResponseSchema.parse(
    artifactsResponse.json(),
  );
  assert.equal(artifacts.classification?.id, refreshedClassification.id);
  assert.equal(artifacts.courseMap?.status, "accepted");

  await app.close();
  const reopened = buildApp({ databasePath, courseRoot, codex });
  const reopenedArtifacts = await reopened.inject({
    method: "GET",
    url: `/api/courses/${course.id}/learning-artifacts`,
  });
  assert.equal(
    CourseLearningArtifactsResponseSchema.parse(reopenedArtifacts.json())
      .courseMap?.id,
    refreshedMap.id,
  );
  await reopened.close();
  await rm(root, { recursive: true });
});
