import {
  ApiErrorSchema,
  CourseDetailSchema,
  CourseListResponseSchema,
  CourseMaterialSchema,
  CourseSummarySchema,
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

