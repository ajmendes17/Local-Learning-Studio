import {
  ApiErrorSchema,
  CodexStatusResponseSchema,
  CourseLearningArtifactsResponseSchema,
  CourseMapArtifactSchema,
  CourseDetailSchema,
  CourseListResponseSchema,
  CourseMaterialSchema,
  CourseSummarySchema,
  SourceClassificationArtifactSchema,
  AssessmentReconciliationResponseSchema,
  type CreateCourseRequest,
  type ApiError,
  type MaterialKind,
} from "@local-learning-studio/contracts";
import type { AssessmentReconciliationResponse } from "@local-learning-studio/contracts";

export type ApiErrorInfo = Pick<ApiError, "error" | "detail" | "diagnostics">;

export class ApiRequestError extends Error {
  constructor(readonly info: ApiErrorInfo) {
    super([info.error, info.detail].filter(Boolean).join(" "));
    this.name = "ApiRequestError";
  }
}

async function readResponse(response: Response) {
  const body: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const parsed = ApiErrorSchema.safeParse(body);
    if (parsed.success) throw new ApiRequestError(parsed.data);
    throw new ApiRequestError({ error: `The local service returned ${response.status}.` });
  }
  return body;
}

export async function listCourses() {
  const response = await fetch("/api/courses");
  return CourseListResponseSchema.parse(await readResponse(response));
}

export async function createCourse(input: CreateCourseRequest) {
  const response = await fetch("/api/courses", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input),
  });
  return CourseSummarySchema.parse(await readResponse(response));
}

export async function getCourse(courseId: string) {
  const response = await fetch(`/api/courses/${courseId}`);
  return CourseDetailSchema.parse(await readResponse(response));
}

export async function uploadMaterial(
  courseId: string,
  file: File,
  kind: MaterialKind,
) {
  const form = new FormData();
  form.append("file", file);

  const response = await fetch(
    `/api/courses/${courseId}/materials?kind=${encodeURIComponent(kind)}`,
    { method: "POST", body: form },
  );
  return CourseMaterialSchema.parse(await readResponse(response));
}

export async function getCodexStatus() {
  const response = await fetch("/api/codex/status");
  return CodexStatusResponseSchema.parse(await readResponse(response));
}

export async function getLearningArtifacts(courseId: string) {
  const response = await fetch(`/api/courses/${courseId}/learning-artifacts`);
  return CourseLearningArtifactsResponseSchema.parse(
    await readResponse(response),
  );
}

export async function getAcceptedCourseMap(courseId: string) {
  const response = await fetch(`/api/courses/${courseId}/course-map/accepted`);
  return CourseMapArtifactSchema.nullable().parse(await readResponse(response));
}

export async function classifyCourseSources(
  courseId: string,
  regenerate = false,
) {
  const response = await fetch(
    `/api/courses/${courseId}/source-classification`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ regenerate }),
    },
  );
  return SourceClassificationArtifactSchema.parse(await readResponse(response));
}

export async function generateCourseMap(
  courseId: string,
  regenerate = false,
) {
  const response = await fetch(`/api/courses/${courseId}/course-map`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ regenerate }),
  });
  return CourseMapArtifactSchema.parse(await readResponse(response));
}

export async function acceptCourseMap(
  courseId: string,
  artifactId: string,
) {
  const response = await fetch(
    `/api/courses/${courseId}/course-map/${artifactId}/accept`,
    { method: "POST" },
  );
  return CourseMapArtifactSchema.parse(await readResponse(response));
}

export async function reconcileCourseAssessments(courseId: string): Promise<AssessmentReconciliationResponse> {
  const response = await fetch(`/api/courses/${courseId}/assessment-reconciliation`, { method: "POST" });
  return AssessmentReconciliationResponseSchema.parse(await readResponse(response));
}

export async function mergeObsidianAssessmentNotes(courseId: string, canonicalRecordKey: string, duplicateRecordKeys: string[]) {
  const response = await fetch(`/api/courses/${courseId}/assessment-reconciliation/merge`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ canonicalRecordKey, duplicateRecordKeys }) });
  return await readResponse(response) as { mergedCount: number; kept: string; removed: string[] };
}
