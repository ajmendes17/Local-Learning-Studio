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
  type CreateCourseRequest,
  type MaterialKind,
} from "@local-learning-studio/contracts";

async function readResponse(response: Response) {
  const body: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const parsed = ApiErrorSchema.safeParse(body);
    const message = parsed.success
      ? [parsed.data.error, parsed.data.detail].filter(Boolean).join(" ")
      : `The local service returned ${response.status}.`;
    throw new Error(message);
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
