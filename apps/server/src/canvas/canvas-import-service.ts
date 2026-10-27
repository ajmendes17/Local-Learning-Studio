import { createHash, randomUUID } from "node:crypto";
import { extname } from "node:path";
import { Readable } from "node:stream";
import { z } from "zod";
import { CanvasPreviewSchema, type CanvasImportJob, type CanvasImportRequest, type CanvasPreview, type CanvasResource } from "@local-learning-studio/contracts";
import type { MaterialIngestion } from "../extraction/material-ingestion.js";
import type { CourseLibrary } from "../storage/course-library.js";
import type { CanvasLibrary } from "../storage/canvas-library.js";
import { CanvasClient, CanvasError } from "./canvas-client.js";
import { htmlMarkdown, htmlReferences, sourceUrl } from "./canvas-html.js";
import { inferCanvasMaterialKind } from "./material-kind.js";

const id = z.union([z.number(), z.string()]).transform(String).pipe(z.string().regex(/^\d+$/));
const CourseApi = z.object({ id, name: z.string(), course_code: z.string().nullish(), syllabus_body: z.string().nullish(), term: z.object({ name: z.string() }).nullish() });
const FileApi = z.object({ id, display_name: z.string().optional(), filename: z.string().optional(), size: z.number().default(0), "content-type": z.string().optional(), url: z.string().optional(), locked_for_user: z.boolean().nullish(), hidden_for_user: z.boolean().nullish(), lock_explanation: z.string().nullish() });
const PageApi = z.object({ url: z.string(), title: z.string(), body: z.string().nullish(), locked_for_user: z.boolean().nullish(), lock_explanation: z.string().nullish() });
const AssignmentApi = z.object({ id, name: z.string(), description: z.string().nullish(), due_at: z.string().nullish(), unlock_at: z.string().nullish(), lock_at: z.string().nullish(), locked_for_user: z.boolean().nullish(), lock_explanation: z.string().nullish() });
const ModuleApi = z.object({ id, name: z.string() });
const ItemApi = z.object({ id, title: z.string(), type: z.string(), content_id: id.optional(), page_url: z.string().optional(), external_url: z.string().optional(), html_url: z.string().optional() });
const MAX_SIZE = 50 * 1024 * 1024;
const solutions = /\b(?:solutions?|answer[ -]?keys?|answers)\b/i;
const filename = (title: string) => {
  const clean = title.replace(/[\\/\r\n:*?"<>|]/g, "-").trim() || "Canvas resource";
  const extension = extname(clean);
  return clean.length > 140 && extension.length < 12 ? `${clean.slice(0, 140 - extension.length)}${extension}` : clean.slice(0, 140);
};
interface InternalResource { visible: CanvasResource; fileId?: string; pageSlug?: string; assignmentId?: string; text?: string }
interface PendingPreview { visible: CanvasPreview; resources: Map<string, InternalResource>; expires: number }

export class CanvasImportService {
  private readonly previews = new Map<string, PendingPreview>();
  private running = false;
  private task: Promise<void> | null = null;
  constructor(private readonly client: CanvasClient, private readonly storage: CanvasLibrary, private readonly courses: CourseLibrary, private readonly ingestion: MaterialIngestion) {
    storage.recoverJobs();
    storage.refreshLabels();
  }
  status() { return { configured: this.client.configured, baseUrl: this.client.origin }; }
  async close() { await this.task; }
  job(id: string) { return this.storage.job(id); }
  async preview(url: string): Promise<CanvasPreview> {
    if (!this.client.configured) throw new CanvasError("Set CANVAS_ACCESS_TOKEN on the local server before importing a class.", 503);
    const remote = this.client.courseUrl(url);
    const course = CourseApi.parse((await this.client.get(`/api/v1/courses/${remote.id}?include[]=syllabus_body&include[]=term`)).data);
    if (course.id !== remote.id) throw new CanvasError("Canvas returned a different course. No import was created.");
    const root = `/api/v1/courses/${remote.id}`;
    const warnings = new Set<string>();
    const resources = new Map<string, InternalResource>();
    const linkedCourseId = this.storage.linkedCourse(this.client.origin, remote.id);
    const fileRefs = new Map<string, { title: string; modules: Set<string> }>();
    const pageRefs = new Map<string, { title: string; modules: Set<string> }>();
    const assignmentRefs = new Map<string, { title: string; modules: Set<string> }>();
    const files = new Map<string, z.infer<typeof FileApi>>();
    const pages = new Map<string, z.infer<typeof PageApi>>();
    const assignments = new Map<string, z.infer<typeof AssignmentApi>>();
    const add = (resource: InternalResource) => {
      if (resources.size >= 2000) throw new CanvasError("This course exceeds the 2,000-resource preview limit.");
      resource.visible.imported = Boolean(linkedCourseId && this.storage.resource(linkedCourseId, resource.visible.id)?.status === "ready");
      const saved = linkedCourseId ? this.storage.resource(linkedCourseId, resource.visible.id) : undefined;
      if (saved?.kindOverridden) resource.visible.kind = saved.kind;
      resources.set(resource.visible.id, resource);
    };
    const base = (key: string, type: CanvasResource["type"], title: string, source: string, modules: string[] = []): CanvasResource => ({
      id: key, type, title, filename: `${filename(title)}.md`, sourceUrl: source,
      kind: inferCanvasMaterialKind(title, type), modules, availability: "available", detail: "", sizeBytes: null,
      containsSolutions: solutions.test(title), imported: false,
    });
    const optional = async <T>(label: string, action: () => Promise<T>): Promise<T | null> => {
      try { return await action(); }
      catch (error) {
        if (error instanceof CanvasError && [403, 404].includes(error.status)) { warnings.add(`${label} was unavailable. Other accessible course resources are still included.`); return null; }
        throw error;
      }
    };
    const reference = (refs: Map<string, { title: string; modules: Set<string> }>, key: string, title: string, module?: string) => {
      const entry = refs.get(key) ?? { title, modules: new Set<string>() };
      if (module) entry.modules.add(module);
      refs.set(key, entry);
    };
    const scanHtml = (html: string) => {
      const refs = htmlReferences(html, this.client.origin, remote.id);
      for (const key of refs.files) reference(fileRefs, key, "Linked Canvas file");
      for (const [key, title] of refs.pages) reference(pageRefs, key, title);
    };
    const syllabus = course.syllabus_body ? htmlMarkdown(course.syllabus_body, this.client.origin) : "";
    if (syllabus) {
      const visible = base("syllabus", "syllabus", "Canvas syllabus", `${remote.url}/assignments/syllabus`);
      visible.kind = "syllabus";
      visible.detail = "Course syllabus saved as a source-linked Markdown snapshot.";
      add({ visible, text: syllabus });
      scanHtml(course.syllabus_body ?? "");
    }
    const rawModules = await optional("Module listing", () => this.client.list(`${root}/modules?per_page=100`));
    const modules: Array<{ title: string; items: Array<{ title: string; url: string | null; note: boolean }> }> = [];
    for (const rawModule of rawModules ?? []) {
      const module = ModuleApi.parse(rawModule);
      const rawItems = await optional(`Items in ${module.name}`, () => this.client.list(`${root}/modules/${module.id}/items?per_page=100`));
      const outline: (typeof modules)[number] = { title: module.name, items: [] };
      for (const rawItem of rawItems ?? []) {
        const item = ItemApi.parse(rawItem);
        const link = sourceUrl(item.html_url ?? `${remote.url}/modules/items/${item.id}`, this.client.origin);
        outline.items.push({ title: item.title, url: link, note: item.type === "SubHeader" });
        if (item.type === "File" && item.content_id) reference(fileRefs, item.content_id, item.title, module.name);
        if (item.type === "Page" && item.page_url) reference(pageRefs, item.page_url, item.title, module.name);
        if (item.type === "Assignment" && item.content_id) reference(assignmentRefs, item.content_id, item.title, module.name);
        if (item.type === "Quiz") {
          const visible = base(`quiz:${item.content_id ?? item.id}`, "quiz", item.title, `${remote.url}/quizzes/${item.content_id ?? item.id}`, [module.name]);
          visible.availability = "link-only"; visible.detail = "Quiz reference only; questions, answers and attempts are not imported.";
          add({ visible });
        }
        if (["ExternalUrl", "ExternalTool"].includes(item.type)) {
          const visible = base(`external:${item.id}`, "external", item.title, sourceUrl(item.external_url ?? link ?? remote.url, this.client.origin) ?? remote.url, [module.name]);
          visible.availability = "link-only"; visible.detail = "External resource link; its provider may need separate access.";
          add({ visible });
        }
      }
      modules.push(outline);
    }
    if (modules.length) {
      const visible = base("outline", "outline", "Canvas course outline", `${remote.url}/modules`);
      visible.detail = `${modules.length} modules, resource order and course notes; separate from the generated class map.`;
      const text = modules.map((module) => `## ${module.title}\n\n${module.items.map((item) => item.note ? item.title : `- ${item.url ? `[${item.title}](${item.url})` : item.title}`).join("\n")}`).join("\n\n");
      add({ visible, text });
    }
    const fileList = await optional("Course Files listing", () => this.client.list(`${root}/files?per_page=100`));
    for (const raw of fileList ?? []) { const file = FileApi.parse(raw); files.set(file.id, file); reference(fileRefs, file.id, file.display_name ?? file.filename ?? "Canvas file"); }
    const pageList = await optional("Course Pages listing", () => this.client.list(`${root}/pages?per_page=100`));
    for (const raw of pageList ?? []) { const page = PageApi.parse(raw); pages.set(page.url, page); reference(pageRefs, page.url, page.title); }
    const assignmentList = await optional("Assignment listing", () => this.client.list(`${root}/assignments?per_page=100`));
    for (const raw of assignmentList ?? []) {
      const assignment = AssignmentApi.parse(raw); assignments.set(assignment.id, assignment);
      reference(assignmentRefs, assignment.id, assignment.name);
      scanHtml(assignment.description ?? "");
    }
    for (const [key, ref] of assignmentRefs) {
      const assignment = assignments.get(key) ?? await optional("Some individual assignment metadata", async () => AssignmentApi.parse((await this.client.get(`${root}/assignments/${encodeURIComponent(key)}`)).data));
      const visible = base(`assignment:${key}`, "assignment", assignment?.name ?? ref.title, `${remote.url}/assignments/${key}`, [...ref.modules]);
      visible.kind = "assignment"; visible.detail = assignment?.due_at ? `Due ${assignment.due_at}; instructions and dates only.` : "Assignment instructions; no submissions or grades.";
      if (!assignment) { visible.availability = "unavailable"; visible.detail = "Canvas did not allow an access check for these instructions."; }
      else if (assignment.locked_for_user) { visible.availability = "locked"; visible.detail = assignment.lock_explanation ? htmlMarkdown(assignment.lock_explanation, this.client.origin) : "Canvas marks these instructions locked for your account."; }
      add({ visible, assignmentId: key });
    }
    for (const [key, ref] of pageRefs) {
      const page = await optional("Some individual page metadata", async () => PageApi.parse((await this.client.get(`${root}/pages/${encodeURIComponent(key)}`)).data));
      const visible = base(`page:${key}`, "page", page?.title ?? ref.title, `${remote.url}/pages/${encodeURIComponent(key)}`, [...ref.modules]);
      visible.detail = "Canvas page imported as readable text, including code and source links.";
      if (!page) { visible.availability = "unavailable"; visible.detail = "Canvas did not allow an access check for this page."; }
      else if (page.locked_for_user) { visible.availability = "locked"; visible.detail = page.lock_explanation ? htmlMarkdown(page.lock_explanation, this.client.origin) : "This Canvas page is locked for your account."; }
      add({ visible, pageSlug: key });
    }
    for (const [key, ref] of fileRefs) {
      const file = files.get(key) ?? await optional("Some individual file metadata", async () => FileApi.parse((await this.client.get(`/api/v1/files/${encodeURIComponent(key)}`)).data));
      const name = file?.display_name ?? file?.filename ?? ref.title;
      const visible = base(`file:${key}`, "file", name, `${remote.url}/files/${key}`, [...ref.modules]);
      visible.filename = filename(name);
      visible.containsSolutions = solutions.test(`${name} ${ref.title}`);
      visible.sizeBytes = file?.size ?? null;
      if (!file) { visible.availability = "unavailable"; visible.detail = "Canvas did not allow an access check for this file."; }
      else if (file.locked_for_user || file.hidden_for_user) { visible.availability = "locked"; visible.detail = file.lock_explanation ? htmlMarkdown(file.lock_explanation, this.client.origin) : "Canvas marks this file locked or hidden for your account."; }
      else if (!this.ingestion.supports(name)) { visible.availability = "unsupported"; visible.detail = "This file format needs an extractor that is not available yet."; }
      else if (file.size > MAX_SIZE) { visible.availability = "unsupported"; visible.detail = "This file exceeds the 50 MB material limit."; }
      else visible.detail = visible.containsSolutions ? "Canvas labels this resource as containing solutions." : "Download and extract the original course file.";
      add({ visible, fileId: key });
    }
    if (warnings.size) warnings.add("This preview covers what Canvas exposes to your account; hidden or unlisted resources may be absent.");
    const preview = CanvasPreviewSchema.parse({ id: randomUUID(), expiresAt: new Date(Date.now() + 15 * 60_000).toISOString(),
      sourceUrl: remote.url, course: { remoteId: remote.id, title: course.name.slice(0, 120), code: (course.course_code ?? "").slice(0, 32), term: (course.term?.name ?? "").slice(0, 64) },
      linkedCourseId, moduleCount: modules.length, resources: [...resources.values()].map(({ visible }) => visible).sort((a, b) => ["syllabus", "outline", "file", "page", "assignment", "quiz", "external"].indexOf(a.type) - ["syllabus", "outline", "file", "page", "assignment", "quiz", "external"].indexOf(b.type)), warnings: [...warnings],
    });
    for (const [key, pending] of this.previews) if (pending.expires < Date.now()) this.previews.delete(key);
    if (this.previews.size >= 10) this.previews.delete(this.previews.keys().next().value!);
    this.previews.set(preview.id, { visible: preview, resources, expires: Date.now() + 15 * 60_000 });
    return preview;
  }

  start(input: CanvasImportRequest) {
    if (this.running) throw new CanvasError("A Canvas import is already running. Wait for it to finish.", 409);
    const preview = this.previews.get(input.previewId);
    if (!preview || preview.expires < Date.now()) throw new CanvasError("This Canvas preview expired. Preview the course again.", 410);
    const selected = [...new Set(input.resourceIds)].map((key) => preview.resources.get(key));
    if (selected.some((item) => !item || item.visible.availability !== "available")) throw new CanvasError("Select only available resources from this preview.");
    const linkedId = this.storage.linkedCourse(this.client.origin, preview.visible.course.remoteId);
    if (linkedId && input.existingCourseId && input.existingCourseId !== linkedId) throw new CanvasError("This Canvas course is already connected to another local class.", 409);
    const targetId = linkedId ?? input.existingCourseId;
    if (targetId && !this.courses.getCourse(targetId)) throw new CanvasError("The destination class no longer exists.", 404);
    const connection = targetId ? this.storage.connection(targetId) : null;
    if (connection && (connection.remoteId !== preview.visible.course.remoteId || connection.origin !== this.client.origin)) throw new CanvasError("The selected local class is connected to a different Canvas course.", 409);
    const course = targetId ? this.courses.getCourse(targetId)! : this.courses.createCourse(input);
    this.storage.link(this.client.origin, preview.visible.course.remoteId, course.id, preview.visible.sourceUrl, preview.visible.moduleCount);
    const job: CanvasImportJob = { id: randomUUID(), courseId: course.id, status: "queued", createdAt: new Date().toISOString(), completedAt: null,
      items: selected.map((item) => ({ resourceId: item!.visible.id, title: item!.visible.title, status: "queued", detail: "Waiting to import.", materialId: null })),
    };
    this.storage.saveJob(job);
    this.running = true;
    this.task = this.run(job, selected as InternalResource[]).finally(() => { this.running = false; });
    return { course, job: this.storage.job(job.id)! };
  }

  private async run(job: CanvasImportJob, resources: InternalResource[]) {
    job.status = "running";
    this.storage.saveJob(job);
    try {
      for (const resource of resources) {
        const item = job.items.find((entry) => entry.resourceId === resource.visible.id)!;
        item.status = "importing"; item.detail = "Checking access, then fetching and extracting source content."; this.storage.saveJob(job);
        try {
          const { bytes, mediaType } = await this.content(resource);
          const hash = createHash("sha256").update(bytes).digest("hex");
          const previous = this.storage.resource(job.courseId, resource.visible.id);
          if (previous?.contentHash === hash && previous.status === "ready") {
            item.status = "unchanged"; item.materialId = previous.materialId; item.detail = "Already imported; source content is unchanged.";
          } else {
            const material = await this.ingestion.ingest(job.courseId, resource.visible.filename, mediaType, resource.visible.kind, Readable.from(bytes));
            const ready = material.status === "ready" && material.passageCount > 0;
            this.storage.record(job.courseId, resource.visible.id, material.id, hash, resource.visible.sourceUrl, ready);
            item.materialId = material.id; item.status = ready ? "imported" : "failed";
            item.detail = ready ? `${material.passageCount} source passages saved.` : material.errorMessage ?? "The file was saved but no readable passages were extracted.";
          }
        } catch (error) {
          item.status = "failed";
          item.detail = error instanceof CanvasError ? error.message : "This resource could not be imported. The last valid local version was preserved.";
        }
        this.storage.saveJob(job);
      }
      job.status = job.items.some(({ status }) => status === "failed") ? "completed-with-errors" : "completed";
      if (job.items.some(({ status }) => ["imported", "unchanged"].includes(status))) this.storage.finished(job.courseId);
    } catch {
      job.status = "interrupted";
      for (const item of job.items) if (["queued", "importing"].includes(item.status)) { item.status = "failed"; item.detail = "Import interrupted. Preview the course again to retry."; }
    } finally {
      job.completedAt = new Date().toISOString();
      this.storage.saveJob(job);
    }
  }

  private async content(resource: InternalResource): Promise<{ bytes: Buffer; mediaType: string }> {
    const { visible } = resource;
    if (resource.fileId) {
      const file = FileApi.parse((await this.client.get(`/api/v1/files/${encodeURIComponent(resource.fileId)}`)).data);
      if (file.locked_for_user || file.hidden_for_user) throw new CanvasError(file.lock_explanation ? htmlMarkdown(file.lock_explanation, this.client.origin) : "This Canvas file is locked or hidden for your account.");
      if (!file.url) throw new CanvasError("This Canvas file is no longer accessible.");
      if (file.size > MAX_SIZE) throw new CanvasError("This file exceeds the 50 MB material limit.");
      const bytes = await this.client.download(file.url);
      const extension = extname(visible.filename).toLowerCase();
      if (extension === ".pdf" && !bytes.subarray(0, 1024).includes(Buffer.from("%PDF-"))) throw new CanvasError("The downloaded file is not a valid PDF.");
      if ([".docx", ".pptx"].includes(extension) && bytes.subarray(0, 2).toString() !== "PK") throw new CanvasError("The downloaded file is not a valid Office document.");
      return { bytes, mediaType: file["content-type"] ?? "application/octet-stream" };
    }
    let text = resource.text;
    if (resource.pageSlug) {
      const course = this.client.courseUrl(visible.sourceUrl);
      const page = PageApi.parse((await this.client.get(`/api/v1/courses/${course.id}/pages/${encodeURIComponent(resource.pageSlug)}`)).data);
      if (page.locked_for_user) throw new CanvasError(page.lock_explanation ? htmlMarkdown(page.lock_explanation, this.client.origin) : "This Canvas page is locked.");
      text = htmlMarkdown(page.body ?? "", this.client.origin);
    }
    if (resource.assignmentId) {
      const course = this.client.courseUrl(visible.sourceUrl);
      const assignment = AssignmentApi.parse((await this.client.get(`/api/v1/courses/${course.id}/assignments/${resource.assignmentId}`)).data);
      if (assignment.locked_for_user) throw new CanvasError(assignment.lock_explanation ? htmlMarkdown(assignment.lock_explanation, this.client.origin) : "These assignment instructions are locked.");
      text = [assignment.due_at ? `Due: ${assignment.due_at}` : "", assignment.unlock_at ? `Available from: ${assignment.unlock_at}` : "", assignment.lock_at ? `Closes: ${assignment.lock_at}` : "", htmlMarkdown(assignment.description ?? "", this.client.origin)].filter(Boolean).join("\n\n");
      if (!text) text = `${assignment.name}\n\nCanvas provides no description or due date for this assignment.`;
    }
    if (!text?.trim()) throw new CanvasError("This Canvas resource has no readable text.");
    // No retrieval timestamp in the bytes: explicit refreshes produce stable hashes.
    const bytes = Buffer.from(`# ${visible.title}\n\nSource: ${visible.sourceUrl}\n\n${text}\n`);
    if (bytes.length > MAX_SIZE) throw new CanvasError("This resource exceeds the 50 MB material limit.");
    return { bytes, mediaType: "text/markdown" };
  }
}
