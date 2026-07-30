import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  API_VERSION,
  CourseDetailSchema,
  CourseListResponseSchema,
  CourseMaterialSchema,
  CourseSummarySchema,
} from "@local-learning-studio/contracts";
import { buildApp } from "../src/app.js";

async function createTestApp() {
  const root = await mkdtemp(join(tmpdir(), "learning-studio-"));
  const app = buildApp({
    databasePath: join(root, "data", "studio.sqlite"),
    courseRoot: join(root, "courses"),
  });
  return { app, root };
}

function multipartFile(filename: string, content: string) {
  const boundary = "learning-studio-test-boundary";
  const payload = Buffer.from(
    [
      `--${boundary}`,
      `Content-Disposition: form-data; name="file"; filename="${filename}"`,
      "Content-Type: text/markdown",
      "",
      content,
      `--${boundary}--`,
      "",
    ].join("\r\n"),
  );

  return {
    payload,
    contentType: `multipart/form-data; boundary=${boundary}`,
  };
}

test("GET /api/health reports the shared API version", async () => {
  const { app, root } = await createTestApp();
  const response = await app.inject({ method: "GET", url: "/api/health" });

  assert.equal(response.statusCode, 200);
  assert.deepEqual(response.json(), {
    status: "ok",
    service: "local-learning-studio",
    apiVersion: API_VERSION,
  });

  await app.close();
  await rm(root, { recursive: true });
});

test("course library persists a course and its uploaded material", async () => {
  const { app, root } = await createTestApp();
  const databasePath = join(root, "data", "studio.sqlite");
  const courseRoot = join(root, "courses");

  const createResponse = await app.inject({
    method: "POST",
    url: "/api/courses",
    payload: {
      title: "Applied Statistics",
      code: "STAT 301",
      term: "Fall 2026",
      accent: "ocean",
    },
  });
  assert.equal(createResponse.statusCode, 201);
  const course = CourseSummarySchema.parse(createResponse.json());

  const upload = multipartFile(
    "syllabus.md",
    "# Applied Statistics\n\n## Midterm",
  );
  const uploadResponse = await app.inject({
    method: "POST",
    url: `/api/courses/${course.id}/materials?kind=syllabus`,
    headers: { "content-type": upload.contentType },
    payload: upload.payload,
  });
  assert.equal(uploadResponse.statusCode, 201);
  const material = CourseMaterialSchema.parse(uploadResponse.json());
  assert.equal(material.kind, "syllabus");
  assert.equal(material.status, "stored");

  const listResponse = await app.inject({
    method: "GET",
    url: "/api/courses",
  });
  const list = CourseListResponseSchema.parse(listResponse.json());
  assert.equal(list.courses[0]?.materialCount, 1);

  const detailResponse = await app.inject({
    method: "GET",
    url: `/api/courses/${course.id}`,
  });
  const detail = CourseDetailSchema.parse(detailResponse.json());
  assert.equal(detail.materials[0]?.originalName, "syllabus.md");

  const files = await readFile(
    join(
      root,
      "courses",
      course.id,
      "materials",
      `${material.id}--syllabus.md`,
    ),
    "utf8",
  );
  assert.match(files, /Applied Statistics/);

  await app.close();

  const reopenedApp = buildApp({ databasePath, courseRoot });
  const reopenedResponse = await reopenedApp.inject({
    method: "GET",
    url: `/api/courses/${course.id}`,
  });
  const reopenedCourse = CourseDetailSchema.parse(reopenedResponse.json());
  assert.equal(reopenedCourse.materials[0]?.id, material.id);

  await reopenedApp.close();
  await rm(root, { recursive: true });
});

test("course creation rejects an empty title", async () => {
  const { app, root } = await createTestApp();
  const response = await app.inject({
    method: "POST",
    url: "/api/courses",
    payload: { title: "   " },
  });

  assert.equal(response.statusCode, 400);
  assert.equal(response.json().error, "Course details are invalid.");

  await app.close();
  await rm(root, { recursive: true });
});

test("unsupported uploads do not create material records", async () => {
  const { app, root } = await createTestApp();
  const createResponse = await app.inject({
    method: "POST",
    url: "/api/courses",
    payload: { title: "Course Safety" },
  });
  const course = CourseSummarySchema.parse(createResponse.json());
  const upload = multipartFile("unsafe.exe", "not a course source");

  const uploadResponse = await app.inject({
    method: "POST",
    url: `/api/courses/${course.id}/materials?kind=other`,
    headers: { "content-type": upload.contentType },
    payload: upload.payload,
  });
  assert.equal(uploadResponse.statusCode, 415);

  const detailResponse = await app.inject({
    method: "GET",
    url: `/api/courses/${course.id}`,
  });
  const detail = CourseDetailSchema.parse(detailResponse.json());
  assert.equal(detail.materials.length, 0);

  await app.close();
  await rm(root, { recursive: true });
});
