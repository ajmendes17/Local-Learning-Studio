import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
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
  MaterialPassagesResponseSchema,
} from "@local-learning-studio/contracts";
import { PDFDocument, StandardFonts } from "pdf-lib";
import { buildApp } from "../src/app.js";
import { openDatabase } from "../src/storage/database.js";

async function createTestApp() {
  const root = await mkdtemp(join(tmpdir(), "learning-studio-"));
  const app = buildApp({
    databasePath: join(root, "data", "studio.sqlite"),
    courseRoot: join(root, "courses"),
  });
  return { app, root };
}

function multipartFile(
  filename: string,
  content: string | Uint8Array,
  mediaType = "text/markdown",
) {
  const boundary = "learning-studio-test-boundary";
  const header = Buffer.from(
    [
      `--${boundary}`,
      `Content-Disposition: form-data; name="file"; filename="${filename}"`,
      `Content-Type: ${mediaType}`,
      "",
    ].join("\r\n"),
  );
  const footer = Buffer.from(`\r\n--${boundary}--\r\n`);
  const payload = Buffer.concat([
    header,
    Buffer.from("\r\n"),
    Buffer.from(content),
    footer,
  ]);

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
    "# Applied Statistics\n\nCourse overview.\n\n## Midterm\n\nExam coverage.",
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
  assert.equal(material.status, "ready");
  assert.equal(material.passageCount, 2);

  const passagesResponse = await app.inject({
    method: "GET",
    url: `/api/courses/${course.id}/materials/${material.id}/passages`,
  });
  assert.equal(passagesResponse.statusCode, 200);
  const passages = MaterialPassagesResponseSchema.parse(
    passagesResponse.json(),
  );
  assert.equal(passages.total, 2);
  assert.equal(passages.offset, 0);
  assert.equal(passages.limit, 100);
  assert.equal(passages.passages[1]?.content, "Exam coverage.");
  assert.deepEqual(passages.passages[0]?.location, {
    kind: "lines",
    lineStart: 3,
    lineEnd: 3,
    heading: "Applied Statistics",
  });

  const otherCourseResponse = await app.inject({
    method: "POST",
    url: "/api/courses",
    payload: { title: "Unrelated Course" },
  });
  const otherCourse = CourseSummarySchema.parse(otherCourseResponse.json());
  const crossCourseResponse = await app.inject({
    method: "GET",
    url: `/api/courses/${otherCourse.id}/materials/${material.id}/passages`,
  });
  assert.equal(crossCourseResponse.statusCode, 404);

  const pagedResponse = await app.inject({
    method: "GET",
    url: `/api/courses/${course.id}/materials/${material.id}/passages?offset=1&limit=1`,
  });
  const pagedPassages = MaterialPassagesResponseSchema.parse(
    pagedResponse.json(),
  );
  assert.equal(pagedPassages.total, 2);
  assert.equal(pagedPassages.passages[0]?.content, "Exam coverage.");

  const invalidRangeResponse = await app.inject({
    method: "GET",
    url: `/api/courses/${course.id}/materials/${material.id}/passages?limit=201`,
  });
  assert.equal(invalidRangeResponse.statusCode, 400);

  const listResponse = await app.inject({
    method: "GET",
    url: "/api/courses",
  });
  const list = CourseListResponseSchema.parse(listResponse.json());
  assert.equal(
    list.courses.find(({ id }) => id === course.id)?.materialCount,
    1,
  );

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
  assert.equal(reopenedCourse.materials[0]?.passageCount, 2);

  const reopenedPassages = await reopenedApp.inject({
    method: "GET",
    url: `/api/courses/${course.id}/materials/${material.id}/passages`,
  });
  assert.equal(
    MaterialPassagesResponseSchema.parse(reopenedPassages.json()).passages
      .length,
    2,
  );

  await reopenedApp.close();
  await rm(root, { recursive: true });
});

test("PDF extraction preserves page-level provenance", async () => {
  const { app, root } = await createTestApp();
  const createResponse = await app.inject({
    method: "POST",
    url: "/api/courses",
    payload: { title: "PDF Sources" },
  });
  const course = CourseSummarySchema.parse(createResponse.json());
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  pdf.addPage().drawText("First page evidence", { font });
  pdf.addPage().drawText("Second page evidence", { font });
  const upload = multipartFile(
    "reading.pdf",
    await pdf.save(),
    "application/pdf",
  );

  const uploadResponse = await app.inject({
    method: "POST",
    url: `/api/courses/${course.id}/materials?kind=reading`,
    headers: { "content-type": upload.contentType },
    payload: upload.payload,
  });
  assert.equal(uploadResponse.statusCode, 201);
  const material = CourseMaterialSchema.parse(uploadResponse.json());
  assert.equal(material.status, "ready");
  assert.equal(material.passageCount, 2);

  const response = await app.inject({
    method: "GET",
    url: `/api/courses/${course.id}/materials/${material.id}/passages`,
  });
  const passages = MaterialPassagesResponseSchema.parse(response.json());
  assert.deepEqual(
    passages.passages.map(({ content, location }) => ({ content, location })),
    [
      {
        content: "First page evidence",
        location: { kind: "page", pageStart: 1, pageEnd: 1 },
      },
      {
        content: "Second page evidence",
        location: { kind: "page", pageStart: 2, pageEnd: 2 },
      },
    ],
  );

  await app.close();
  await rm(root, { recursive: true });
});

test("empty extractable sources fail visibly without losing the upload", async () => {
  const { app, root } = await createTestApp();
  const createResponse = await app.inject({
    method: "POST",
    url: "/api/courses",
    payload: { title: "Failure States" },
  });
  const course = CourseSummarySchema.parse(createResponse.json());
  const upload = multipartFile("empty.txt", "  \n", "text/plain");

  const uploadResponse = await app.inject({
    method: "POST",
    url: `/api/courses/${course.id}/materials?kind=other`,
    headers: { "content-type": upload.contentType },
    payload: upload.payload,
  });
  assert.equal(uploadResponse.statusCode, 201);
  const material = CourseMaterialSchema.parse(uploadResponse.json());
  assert.equal(material.status, "failed");
  assert.equal(material.passageCount, 0);
  assert.match(material.errorMessage ?? "", /No extractable text/);

  const storedFile = await readFile(
    join(
      root,
      "courses",
      course.id,
      "materials",
      `${material.id}--empty.txt`,
    ),
    "utf8",
  );
  assert.equal(storedFile, "  \n");

  await app.close();
  await rm(root, { recursive: true });
});

test("Office files remain stored until an extractor is available", async () => {
  const { app, root } = await createTestApp();
  const createResponse = await app.inject({
    method: "POST",
    url: "/api/courses",
    payload: { title: "Office Sources" },
  });
  const course = CourseSummarySchema.parse(createResponse.json());
  const upload = multipartFile(
    "lecture.pptx",
    "placeholder package",
    "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  );

  const uploadResponse = await app.inject({
    method: "POST",
    url: `/api/courses/${course.id}/materials?kind=lecture-notes`,
    headers: { "content-type": upload.contentType },
    payload: upload.payload,
  });
  const material = CourseMaterialSchema.parse(uploadResponse.json());
  assert.equal(material.status, "stored");
  assert.equal(material.passageCount, 0);

  await app.close();
  await rm(root, { recursive: true });
});

test("startup turns interrupted extraction into an explicit failure", async () => {
  const root = await mkdtemp(join(tmpdir(), "learning-studio-"));
  const databasePath = join(root, "data", "studio.sqlite");
  const database = openDatabase(databasePath);
  const courseId = randomUUID();
  const materialId = randomUUID();
  const now = new Date().toISOString();

  database
    .prepare(`
      INSERT INTO courses (
        id, title, code, term, accent, created_at, updated_at
      ) VALUES (?, ?, '', '', 'moss', ?, ?)
    `)
    .run(courseId, "Interrupted Work", now, now);
  database
    .prepare(`
      INSERT INTO materials (
        id, course_id, original_name, stored_name, media_type, kind,
        size_bytes, status, error_message, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, 'processing', NULL, ?)
    `)
    .run(
      materialId,
      courseId,
      "source.md",
      `${materialId}--source.md`,
      "text/markdown",
      "other",
      10,
      now,
    );
  database.close();

  const app = buildApp({
    databasePath,
    courseRoot: join(root, "courses"),
  });
  const response = await app.inject({
    method: "GET",
    url: `/api/courses/${courseId}`,
  });
  const course = CourseDetailSchema.parse(response.json());
  assert.equal(course.materials[0]?.status, "failed");
  assert.match(course.materials[0]?.errorMessage ?? "", /interrupted/);

  await app.close();
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
