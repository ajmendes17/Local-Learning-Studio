import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  CourseDetailSchema,
  CourseLearningArtifactsResponseSchema,
  CourseMapArtifactSchema,
  CourseSummarySchema,
  ApiErrorSchema,
  SourceClassificationArtifactSchema,
  type CodexTask,
} from "@local-learning-studio/contracts";
import type { z } from "zod";
import { buildApp } from "../src/app.js";
import { CodexRunError } from "../src/codex/codex-runner.js";
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
  readonly prompts: string[] = [];
  invalidNextMapSourceSet = false;
  invalidNextClassificationOutput = false;

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
    this.prompts.push(prompt);
    if (task === "classify-course-sources" && this.invalidNextClassificationOutput) {
      this.invalidNextClassificationOutput = false;
      throw new CodexRunError("invalid_output", "Codex returned a response that failed validation.", "sources.0.evidence: expected at least one source passage reference");
    }
    const input = JSON.parse(prompt.split("INPUT_JSON\n\n")[1]!) as any;
    const projection = input;
    const materialIds = projection.materials.map(({ id }: any) => id);
    const references = projection.materials.map(({ id, passages }: any) =>
      task === "map-course"
        ? { materialId: id, passageKey: passages[0].passageKey }
        : { materialId: id, passageId: passages[0].id },
    );
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

    if (task === "map-course" && this.invalidNextMapSourceSet) {
      this.invalidNextMapSourceSet = false;
      raw.sourceMaterialIds = [...materialIds, "00000000-0000-4000-8000-000000000000"];
    }

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

  codex.invalidNextClassificationOutput = true;
  const invalidClassificationResponse = await app.inject({
    method: "POST",
    url: `/api/courses/${course.id}/source-classification`,
    payload: {},
  });
  assert.equal(invalidClassificationResponse.statusCode, 502);
  const invalidClassificationError = ApiErrorSchema.parse(invalidClassificationResponse.json());
  assert.match(invalidClassificationError.detail ?? "", /did not match the expected structure/);
  assert.match(String(invalidClassificationError.diagnostics?.responseValidation), /sources\.0\.evidence/);

  const classificationResponse = await app.inject({
    method: "POST",
    url: `/api/courses/${course.id}/source-classification`,
    payload: {},
  });
  assert.equal(classificationResponse.statusCode, 200);
  const classification = SourceClassificationArtifactSchema.parse(
    classificationResponse.json(),
  );
  assert.match(codex.prompts.at(-1) ?? "", /every evidence reference must use that same source's materialId/);
  assert.match(codex.prompts.at(-1) ?? "", /never cite a passage from another material/);
  assert.equal(classification.payload.sources[0]?.role, "syllabus");
  assert.deepEqual(codex.calls, ["classify-course-sources", "classify-course-sources"]);

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
  assert.equal(codex.calls.length, 2, "matching classification should be cached");

  const mapResponse = await app.inject({
    method: "POST",
    url: `/api/courses/${course.id}/course-map`,
    payload: {},
  });
  assert.equal(mapResponse.statusCode, 200);
  const courseMap = CourseMapArtifactSchema.parse(mapResponse.json());
  assert.equal(courseMap.status, "draft");
  assert.deepEqual(codex.calls, ["classify-course-sources", "classify-course-sources", "map-course"]);

  await app.inject({
    method: "POST",
    url: `/api/courses/${course.id}/course-map`,
    payload: {},
  });
  assert.equal(codex.calls.length, 3, "matching map should be cached");

  const initiallyAcceptedMap = await app.inject({
    method: "POST",
    url: `/api/courses/${course.id}/course-map/${courseMap.id}/accept`,
  });
  assert.equal(initiallyAcceptedMap.statusCode, 200);

  codex.invalidNextMapSourceSet = true;
  const invalidMapResponse = await app.inject({
    method: "POST",
    url: `/api/courses/${course.id}/course-map`,
    payload: { regenerate: true },
  });
  assert.equal(invalidMapResponse.statusCode, 422, invalidMapResponse.body);
  const invalidMapError = ApiErrorSchema.parse(invalidMapResponse.json());
  assert.match(invalidMapError.error, /does not match the supplied course evidence/);
  assert.equal(invalidMapError.diagnostics?.courseIdMatches, true);
  assert.deepEqual(invalidMapError.diagnostics?.missingMaterialIds, []);
  assert.deepEqual(invalidMapError.diagnostics?.unexpectedMaterialIds, ["00000000-0000-4000-8000-000000000000"]);
  assert.equal(invalidMapError.diagnostics?.invalidReferenceCount, 0);
  assert.equal(invalidMapError.diagnostics?.omittedPassageCount, 0);

  const secondUpload = multipartFile(
    "lecture.md",
    "# Feedback\n\nUse retrieval evidence to revise the plan.",
  );
  const secondUploadResponse = await app.inject({
    method: "POST",
    url: `/api/courses/${course.id}/materials?kind=lecture-notes`,
    headers: { "content-type": secondUpload.contentType },
    payload: secondUpload.payload,
  });
  const secondMaterialId = secondUploadResponse.json().id as string;
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

  const vaultPath = join(root, "vault");
  await mkdir(vaultPath, { recursive: true });
  const vaultConfig = await app.inject({ method: "POST", url: "/api/obsidian/config", payload: { vaultPath } });
  assert.equal(vaultConfig.statusCode, 200, vaultConfig.body);
  const draftExport = await app.inject({ method: "POST", url: `/api/courses/${course.id}/obsidian/export` });
  assert.equal(draftExport.statusCode, 200, draftExport.body);
  const draftCourseNote = await readFile(join(vaultPath, draftExport.json().courseFolder, "Course.md"), "utf8");
  assert.match(draftCourseNote, /Course map:\*\* Accepted structure · stale/);
  assert.match(draftCourseNote, /Current map draft:\*\* Ready for review/);
  assert.match(draftCourseNote, /current replacement draft is ready for review/);
  const staleLinkedSourceNote = await readFile(join(vaultPath, draftExport.json().courseFolder, "sources", `lecture--${secondMaterialId.slice(0, 8)}.md`), "utf8");
  assert.match(staleLinkedSourceNote, /Course map status:\*\* Accepted structure · stale/);
  assert.match(staleLinkedSourceNote, /Related course topics · stale accepted structure[\s\S]*older accepted course map/);

  const instructorScopeResponse = await app.inject({
    method: "POST",
    url: `/api/courses/${course.id}/learner/assessments`,
    payload: {
      title: "Midterm topics from professor",
      kind: "exam",
      topics: [{ title: "Preserve this instructor wording", importance: "high", provenance: "learner" }],
    },
  });
  assert.equal(instructorScopeResponse.statusCode, 201, instructorScopeResponse.body);
  const instructorScopeId = instructorScopeResponse.json().id as string;

  const acceptedMapBeforeAcceptance = await app.inject({
    method: "GET",
    url: `/api/courses/${course.id}/course-map/accepted`,
  });
  assert.equal(acceptedMapBeforeAcceptance.statusCode, 200, acceptedMapBeforeAcceptance.body);
  assert.equal(CourseMapArtifactSchema.parse(acceptedMapBeforeAcceptance.json()).id, courseMap.id);

  const acceptResponse = await app.inject({
    method: "POST",
    url: `/api/courses/${course.id}/course-map/${refreshedMap.id}/accept`,
  });
  assert.equal(acceptResponse.statusCode, 200);
  assert.equal(CourseMapArtifactSchema.parse(acceptResponse.json()).status, "accepted");
  const acceptedMapResponse = await app.inject({
    method: "GET",
    url: `/api/courses/${course.id}/course-map/accepted`,
  });
  assert.equal(acceptedMapResponse.statusCode, 200, acceptedMapResponse.body);
  assert.equal(CourseMapArtifactSchema.parse(acceptedMapResponse.json()).id, refreshedMap.id);

  const detailResponse = await app.inject({
    method: "GET",
    url: `/api/courses/${course.id}`,
  });
  const detail = CourseDetailSchema.parse(detailResponse.json());
  assert.equal(detail.modules.length, 1);
  assert.equal(detail.assessments.length, 1);

  const profileResponse = await app.inject({
    method: "GET",
    url: `/api/courses/${course.id}/learner/profile`,
  });
  const savedInstructorScope = profileResponse.json().assessments.find((item: { id: string }) => item.id === instructorScopeId);
  assert.equal(savedInstructorScope.title, "Midterm topics from professor");
  assert.deepEqual(savedInstructorScope.topics.map((item: { title: string; importance: string }) => [item.title, item.importance]), [
    ["Preserve this instructor wording", "high"],
  ]);

  const artifactsResponse = await app.inject({
    method: "GET",
    url: `/api/courses/${course.id}/learning-artifacts`,
  });
  const artifacts = CourseLearningArtifactsResponseSchema.parse(
    artifactsResponse.json(),
  );
  assert.equal(artifacts.classification?.id, refreshedClassification.id);
  assert.equal(artifacts.courseMap?.status, "accepted");
  assert.equal(artifacts.classificationCurrent, true);
  assert.equal(artifacts.courseMapCurrent, true);

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
  const reopenedProfile = await reopened.inject({
    method: "GET",
    url: `/api/courses/${course.id}/learner/profile`,
  });
  const persistedInstructorScope = reopenedProfile.json().assessments.find((item: { id: string }) => item.id === instructorScopeId);
  assert.equal(persistedInstructorScope.topics[0].title, "Preserve this instructor wording");
  assert.equal(persistedInstructorScope.topics[0].importance, "high");
  await reopened.close();
  await rm(root, { recursive: true });
});
