import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { PDFDocument, StandardFonts } from "pdf-lib";
import { CanvasImportJobSchema, CanvasPreviewSchema } from "@local-learning-studio/contracts";
import { buildApp } from "../src/app.js";
import { CanvasClient, publicAddress } from "../src/canvas/canvas-client.js";
import { htmlMarkdown, sourceUrl } from "../src/canvas/canvas-html.js";
import { openDatabase } from "../src/storage/database.js";
import { CanvasLibrary } from "../src/storage/canvas-library.js";

const origin = "https://canvas.school.example";
const token = "fixture-not-a-real-credential";
const json = (body: unknown, status = 200, headers: Record<string, string> = {}) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", ...headers } });
async function fixture() {
  const root = await mkdtemp(join(tmpdir(), "canvas-import-"));
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  doc.addPage().drawText("Lecture on programming language semantics.", { font, size: 14 });
  const pdf = Buffer.from(await doc.save());
  const calls: Array<{ path: string; authorization: string | null }> = [];
  let pageText = "<h2>Lesson notes</h2><p>Functions map inputs to outputs.</p>";
  let pageLocked = false;
  let validBinary = true;
  const request: typeof fetch = async (input, options) => {
    const url = new URL(input instanceof Request ? input.url : input.toString());
    const headers = new Headers(options?.headers);
    calls.push({ path: url.href, authorization: headers.get("authorization") });
    assert.equal(options?.method, "GET");
    if (url.origin !== origin) {
      assert.equal(headers.get("authorization"), null);
      assert.equal(url.hostname, "fixture.canvas-user-content.com");
      return new Response(validBinary ? pdf : Buffer.from("%PDF-1.7\nNot a complete PDF document."), { headers: { "content-type": "application/pdf" } });
    }
    assert.equal(headers.get("authorization"), `Bearer ${token}`);
    const path = url.pathname;
    const match = path.match(/^\/api\/v1\/courses\/(\d+)(.*)$/);
    if (match) {
      const remoteId = Number(match[1]); const suffix = match[2];
      if (!suffix) return json({ id: remoteId, name: remoteId === 7281 ? "Programming Language Theory" : "Another Course", course_code: "CS7", term: { name: "Fall" }, syllabus_body: '<h2>Course objectives</h2><p>Learn semantics and evaluation.</p><a href="/files/11/download">Lecture notes</a>' });
      if (suffix === "/modules") return json([{ id: 9, name: "Functions" }]);
      if (suffix === "/modules/9/items") return json([
        { id: 1, type: "File", title: "lecture.pdf", content_id: 11 },
        { id: 2, type: "File", title: "lecture.pdf", content_id: 11 },
        { id: 3, type: "File", title: "locked.pdf", content_id: 12 },
        { id: 4, type: "File", title: "image.png", content_id: 13 },
        { id: 5, type: "Page", title: "Lecture notes", page_url: "lesson-notes" },
        { id: 6, type: "ExternalUrl", title: "Video", external_url: "https://video.example/watch/1" },
        { id: 7, type: "Quiz", title: "Course quiz", content_id: 31 },
        { id: 8, type: "File", title: "Answer key", content_id: 14 },
      ]);
      if (suffix === "/files") return json({}, 403);
      if (suffix === "/pages") return json({}, 404);
      if (suffix === "/pages/lesson-notes") return json({ title: "Lecture notes", url: "lesson-notes", body: pageText, locked_for_user: pageLocked, lock_explanation: pageLocked ? "<p>This page is locked until November 2.</p>" : null });
      if (suffix === "/assignments") return json([{ id: 21, name: "Worksheet", description: "<p>Read the lesson.</p>", due_at: "2026-11-01T16:00:00Z" }]);
      if (suffix === "/assignments/21") return json({ id: 21, name: "Worksheet", description: "<p>Read the lesson.</p>", due_at: "2026-11-01T16:00:00Z" });
    }
    const fileId = path.match(/^\/api\/v1\/files\/(\d+)$/)?.[1];
    if (fileId) {
      const names: Record<string, string> = { "11": "lecture.pdf", "12": "locked.pdf", "13": "image.png", "14": "lecture-solutions.pdf" };
      return json({ id: Number(fileId), display_name: names[fileId], size: pdf.length, "content-type": "application/pdf", url: `${origin}/files/${fileId}/download?access_token=do-not-copy`, locked_for_user: fileId === "12", hidden_for_user: false });
    }
    if (path.startsWith("/files/")) return new Response(null, { status: 302, headers: { location: "https://fixture.canvas-user-content.com/document.pdf?signature=not-to-be-persisted" } });
    return json({}, 404);
  };
  const options = { databasePath: join(root, "data", "studio.sqlite"), courseRoot: join(root, "courses"), canvas: { baseUrl: origin, token, request, resolve: async () => [{ address: "93.184.216.34", family: 4 }] } };
  return { root, options, app: buildApp(options), calls, setPage: (html: string) => { pageText = html; }, lockPage: (locked: boolean) => { pageLocked = locked; }, validBinary: (valid: boolean) => { validBinary = valid; } };
}
async function finish(app: ReturnType<typeof buildApp>, id: string) {
  for (let attempt = 0; attempt < 500; attempt += 1) {
    const response = await app.inject({ method: "GET", url: `/api/canvas/imports/${id}` });
    assert.equal(response.statusCode, 200);
    const job = CanvasImportJobSchema.parse(response.json());
    if (!["queued", "running"].includes(job.status)) return job;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error("Fixture import did not finish.");
}
async function preview(app: ReturnType<typeof buildApp>, remoteId = 7281) {
  const response = await app.inject({ method: "POST", url: "/api/canvas/preview", payload: { courseUrl: `${origin}/courses/${remoteId}` } });
  assert.equal(response.statusCode, 200, response.body);
  return CanvasPreviewSchema.parse(response.json());
}
async function start(app: ReturnType<typeof buildApp>, input: { id: string; course: { title: string; code: string; term: string } }, resourceIds: string[], existingCourseId?: string) {
  const response = await app.inject({ method: "POST", url: "/api/canvas/imports", payload: { previewId: input.id, resourceIds, ...input.course, existingCourseId } });
  assert.equal(response.statusCode, 202, response.body);
  return response.json() as { course: { id: string }; job: { id: string } };
}

test("Canvas preview handles arbitrary courses, denied listings, module duplicates and access state without revealing tokens", async () => {
  const f = await fixture();
  try {
    const p = await preview(f.app);
    assert.equal(p.course.title, "Programming Language Theory");
    assert.equal(p.resources.filter(({ id }) => id === "file:11").length, 1);
    assert.equal(p.resources.find(({ id }) => id === "file:12")?.availability, "locked");
    assert.equal(p.resources.find(({ id }) => id === "file:13")?.availability, "unsupported");
    assert.equal(p.resources.find(({ id }) => id === "file:14")?.containsSolutions, true);
    assert.ok(p.resources.some(({ type }) => type === "syllabus"));
    assert.ok(p.resources.some(({ type }) => type === "outline"));
    assert.equal(p.resources.find(({ type }) => type === "external")?.availability, "link-only");
    assert.ok(p.warnings.length >= 2);
    assert.doesNotMatch(JSON.stringify(p), /fixture-not-a-real-credential|signature=|access_token/);
    const second = await preview(f.app, 6429);
    assert.equal(second.course.remoteId, "6429");
    assert.equal(second.course.title, "Another Course");
    assert.equal((await f.app.inject({ method: "GET", url: "/api/courses" })).json().courses.length, 0);
  } finally { await f.app.close(); await rm(f.root, { recursive: true }); }
});

test("Canvas imports original PDF and readable page sources, preserves manual uploads, skips unchanged content, and retains old citations on revisions", async () => {
  const f = await fixture();
  let app = f.app;
  try {
    const created = (await app.inject({ method: "POST", url: "/api/courses", payload: { title: "My own course name" } })).json() as { id: string };
    const boundary = "manual-canvas-test";
    const manual = await app.inject({ method: "POST", url: `/api/courses/${created.id}/materials?kind=reading`, headers: { "content-type": `multipart/form-data; boundary=${boundary}` }, payload: `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="my-notes.md"\r\nContent-Type: text/markdown\r\n\r\n# My personal notes\r\n\r\nExamples I wrote myself.\r\n--${boundary}--\r\n` });
    assert.equal(manual.statusCode, 201, manual.body);
    const p = await preview(app);
    const started = await start(app, p, ["syllabus", "outline", "file:11", "page:lesson-notes", "assignment:21"], created.id);
    const job = await finish(app, started.job.id);
    assert.equal(job.status, "completed", JSON.stringify(job));
    assert.equal(job.items.filter(({ status }) => status === "imported").length, 5);
    assert.doesNotMatch(JSON.stringify(job), /fixture-not-a-real-credential|signature=/);
    let detail = (await app.inject({ method: "GET", url: `/api/courses/${created.id}` })).json();
    assert.equal(detail.materials.length, 6);
    assert.equal(detail.title, "My own course name");
    assert.equal(detail.canvas.remoteId, "7281");
    assert.equal(detail.materials.find((m: { id: string }) => m.id === manual.json().id).source, undefined);
    const pdf = detail.materials.find((m: { originalName: string }) => m.originalName === "lecture.pdf");
    assert.equal(pdf.status, "ready");
    assert.equal(pdf.source.provider, "canvas");
    assert.ok(f.calls.some(({ path, authorization }) => path.startsWith("https://fixture.canvas-user-content.com") && authorization === null));
    const again = await preview(app);
    const rerun = await start(app, again, ["file:11", "page:lesson-notes"]);
    assert.equal(rerun.course.id, created.id);
    assert.ok((await finish(app, rerun.job.id)).items.every(({ status }) => status === "unchanged"));
    const originalPage = job.items.find(({ resourceId }) => resourceId === "page:lesson-notes")!.materialId!;
    f.setPage("<h2>Updated lesson</h2><p>Closures capture their lexical environment.</p>");
    const revised = await start(app, await preview(app), ["page:lesson-notes"]);
    assert.equal((await finish(app, revised.job.id)).status, "completed");
    detail = (await app.inject({ method: "GET", url: `/api/courses/${created.id}` })).json();
    assert.equal(detail.materials.length, 6);
    assert.ok(!detail.materials.some((m: { id: string }) => m.id === originalPage));
    const oldPassages = await app.inject({ method: "GET", url: `/api/courses/${created.id}/materials/${originalPage}/passages` });
    assert.equal(oldPassages.statusCode, 200);
    assert.ok(oldPassages.json().passages.some((p: { content: string }) => /Functions map/.test(p.content)));
    await app.close(); app = buildApp(f.options);
    const reopened = await app.inject({ method: "GET", url: `/api/courses/${created.id}` });
    assert.equal(reopened.json().materials.length, 6);
    assert.equal(reopened.json().canvas.remoteId, "7281");
  } finally { await app.close(); await rm(f.root, { recursive: true }); }
});

test("Canvas rejects locked selections, unknown targets, cross-origin requests and foreign institution URLs", async () => {
  const f = await fixture();
  try {
    const p = await preview(f.app);
    const locked = await f.app.inject({ method: "POST", url: "/api/canvas/imports", payload: { previewId: p.id, resourceIds: ["file:12"], ...p.course } });
    assert.equal(locked.statusCode, 400);
    const missing = await f.app.inject({ method: "POST", url: "/api/canvas/imports", payload: { previewId: p.id, resourceIds: ["syllabus"], ...p.course, existingCourseId: randomUUID() } });
    assert.equal(missing.statusCode, 404);
    const crossOrigin = await f.app.inject({ method: "POST", url: "/api/canvas/preview", headers: { origin: "https://unrelated.example" }, payload: { courseUrl: `${origin}/courses/7281` } });
    assert.equal(crossOrigin.statusCode, 403);
    const devProxy = await f.app.inject({ method: "POST", url: "/api/canvas/preview", headers: { origin: "http://localhost:4317", host: "127.0.0.1:4318", "sec-fetch-site": "same-origin" }, payload: { courseUrl: `${origin}/courses/7281` } });
    assert.equal(devProxy.statusCode, 200);
    const foreign = await f.app.inject({ method: "POST", url: "/api/canvas/preview", payload: { courseUrl: "https://unrelated.example/courses/1" } });
    assert.equal(foreign.statusCode, 400);
    assert.equal((await f.app.inject({ method: "GET", url: "/api/courses" })).json().courses.length, 0);
  } finally { await f.app.close(); await rm(f.root, { recursive: true }); }
});

test("page locks and reasons are checked in preview and checked again if access changes before import", async () => {
  const f = await fixture();
  try {
    f.lockPage(true);
    const lockedPreview = await preview(f.app);
    const locked = lockedPreview.resources.find(({ id }) => id === "page:lesson-notes")!;
    assert.equal(locked.availability, "locked");
    assert.match(locked.detail, /locked until November 2/);
    assert.ok(!f.calls.some(({ path }) => new URL(path).pathname.startsWith("/files/")));
    f.lockPage(false);
    const accessible = await preview(f.app);
    f.lockPage(true);
    const started = await start(f.app, accessible, ["syllabus", "page:lesson-notes"]);
    const job = await finish(f.app, started.job.id);
    assert.equal(job.status, "completed-with-errors");
    assert.equal(job.items.find(({ resourceId }) => resourceId === "syllabus")?.status, "imported");
    assert.match(job.items.find(({ resourceId }) => resourceId === "page:lesson-notes")!.detail, /locked until November 2/);
  } finally { await f.app.close(); await rm(f.root, { recursive: true }); }
});

test("failed extraction retries do not multiply active materials and failed updates preserve a valid revision", async () => {
  const f = await fixture();
  try {
    const original = await start(f.app, await preview(f.app), ["file:11"]);
    assert.equal((await finish(f.app, original.job.id)).status, "completed");
    f.validBinary(false);
    const brokenUpdate = await start(f.app, await preview(f.app), ["file:11"]);
    assert.equal((await finish(f.app, brokenUpdate.job.id)).status, "completed-with-errors");
    const preserved = (await f.app.inject({ method: "GET", url: `/api/courses/${original.course.id}` })).json();
    assert.equal(preserved.materials.length, 1); assert.equal(preserved.materials[0].status, "ready");
    const initialFailure = await start(f.app, await preview(f.app, 6429), ["file:11"]);
    assert.equal((await finish(f.app, initialFailure.job.id)).status, "completed-with-errors");
    const retryPreview = await preview(f.app, 6429);
    assert.equal(retryPreview.resources.find(({ id }) => id === "file:11")?.imported, false);
    const retry = await start(f.app, retryPreview, ["file:11"]);
    assert.equal((await finish(f.app, retry.job.id)).status, "completed-with-errors");
    const failed = (await f.app.inject({ method: "GET", url: `/api/courses/${initialFailure.course.id}` })).json();
    assert.equal(failed.materials.length, 1);
  } finally { await f.app.close(); await rm(f.root, { recursive: true }); }
});

test("interrupted import jobs are explicit after restart", async () => {
  const f = await fixture();
  let app = f.app;
  try {
    const course = (await app.inject({ method: "POST", url: "/api/courses", payload: { title: "Recovery" } })).json() as { id: string };
    await app.close();
    const db = openDatabase(f.options.databasePath);
    const id = randomUUID();
    new CanvasLibrary(db).saveJob({ id, courseId: course.id, status: "running", createdAt: new Date().toISOString(), completedAt: null, items: [{ resourceId: "syllabus", title: "Syllabus", status: "importing", materialId: null, detail: "Waiting" }] });
    db.close(); app = buildApp(f.options);
    const job = (await app.inject({ method: "GET", url: `/api/canvas/imports/${id}` })).json();
    assert.equal(job.status, "interrupted"); assert.equal(job.items[0].status, "failed");
  } finally { await app.close(); await rm(f.root, { recursive: true }); }
});

test("Canvas network handling rejects private addresses and unexpected pagination without issuing requests", async () => {
  assert.equal(publicAddress("127.0.0.1"), false);
  assert.equal(publicAddress("10.1.2.3"), false);
  assert.equal(publicAddress("::1"), false);
  assert.equal(publicAddress("93.184.216.34"), true);
  let calls = 0;
  const client = new CanvasClient({ baseUrl: origin, token, resolve: async () => [{ address: "127.0.0.1", family: 4 }], request: async () => { calls++; return json({}); } });
  await assert.rejects(() => client.get("/api/v1/courses/1"), /private or local/);
  assert.equal(calls, 0);
  const foreign = new CanvasClient({ baseUrl: origin, token, resolve: async () => [{ address: "93.184.216.34", family: 4 }], request: async () => json([], 200, { link: '<https://unrelated.example/api/v1/courses>; rel="next"' }) });
  await assert.rejects(() => foreign.list("/api/v1/courses"), /unexpected API destination/);
});

test("HTML normalization preserves code and source links without active content or query credentials", () => {
  const text = htmlMarkdown('<h2>Example</h2><pre>let f x = x + 1</pre><script>execute()</script><p><a href="/courses/1?access_token=private">Source</a></p>', origin);
  assert.match(text, /## Example/); assert.match(text, /let f x = x \+ 1/);
  assert.doesNotMatch(text, /execute|private|access_token/);
  assert.equal(sourceUrl("https://www.youtube.com/watch?v=lesson-id&t=30&access_token=private", origin), "https://www.youtube.com/watch?v=lesson-id&t=30");
});
