import type { DatabaseSync } from "node:sqlite";
import { CanvasImportJobSchema, type CanvasImportJob, type MaterialKind } from "@local-learning-studio/contracts";
import { inferCanvasMaterialKind } from "../canvas/material-kind.js";

export class CanvasLibrary {
  constructor(private readonly database: DatabaseSync) {}
  refreshLabels() {
    const rows = this.database.prepare(`SELECT m.id, m.original_name AS title, s.source_url AS url
      FROM materials m JOIN canvas_material_sources s ON s.material_id = m.id
      WHERE m.kind_overridden = 0`).all() as Array<{ id: string; title: string; url: string }>;
    const update = this.database.prepare("UPDATE materials SET kind = ? WHERE id = ? AND kind_overridden = 0");
    for (const row of rows) {
      const type = /\/assignments\/syllabus\/?$/.test(row.url) ? "syllabus" : /\/assignments\/\d+\/?$/.test(row.url) ? "assignment" : undefined;
      update.run(inferCanvasMaterialKind(row.title, type), row.id);
    }
  }
  linkedCourse(origin: string, remoteId: string) {
    return (this.database.prepare("SELECT course_id AS id FROM canvas_courses WHERE origin = ? AND remote_id = ?").get(origin, remoteId) as { id: string } | undefined)?.id ?? null;
  }
  connection(courseId: string) {
    return this.database.prepare("SELECT origin, remote_id AS remoteId FROM canvas_courses WHERE course_id = ?").get(courseId) as { origin: string; remoteId: string } | undefined;
  }
  link(origin: string, remoteId: string, courseId: string, sourceUrl: string, moduleCount: number) {
    this.database.prepare(`INSERT INTO canvas_courses (origin, remote_id, course_id, source_url, module_count)
      VALUES (?, ?, ?, ?, ?) ON CONFLICT(origin, remote_id) DO UPDATE SET module_count = excluded.module_count`).run(origin, remoteId, courseId, sourceUrl, moduleCount);
  }
  resource(courseId: string, key: string) {
    return this.database.prepare(`SELECT canvas_resources.material_id AS materialId, content_hash AS contentHash, materials.status, materials.kind, materials.kind_overridden AS kindOverridden
      FROM canvas_resources JOIN materials ON materials.id = canvas_resources.material_id
      WHERE canvas_resources.course_id = ? AND resource_key = ?`).get(courseId, key) as { materialId: string; contentHash: string; status: string; kind: MaterialKind; kindOverridden: number } | undefined;
  }
  record(courseId: string, key: string, materialId: string, hash: string, url: string, ready: boolean) {
    const previous = this.resource(courseId, key);
    const now = new Date().toISOString();
    this.database.exec("BEGIN IMMEDIATE");
    try {
      this.database.prepare("INSERT INTO canvas_material_sources (material_id, source_url, imported_at) VALUES (?, ?, ?)").run(materialId, url, now);
      const override = this.database.prepare(`SELECT m.kind FROM materials m JOIN canvas_material_sources s ON s.material_id = m.id
        WHERE m.course_id = ? AND s.source_url = ? AND m.kind_overridden = 1 LIMIT 1`).get(courseId, url) as { kind: string } | undefined;
      if (override) this.database.prepare("UPDATE materials SET kind = ?, kind_overridden = 1 WHERE id = ?").run(override.kind, materialId);
      // Retry results supersede earlier failed Canvas attempts, never user uploads.
      this.database.prepare(`UPDATE materials SET is_active = 0 WHERE course_id = ? AND id <> ? AND status = 'failed'
        AND id IN (SELECT material_id FROM canvas_material_sources WHERE source_url = ?)`).run(courseId, materialId, url);
      if (ready || previous?.status !== "ready") {
        this.database.prepare(`INSERT INTO canvas_resources (course_id, resource_key, material_id, content_hash, source_url, imported_at)
          VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT(course_id, resource_key) DO UPDATE SET material_id=excluded.material_id, content_hash=excluded.content_hash, source_url=excluded.source_url, imported_at=excluded.imported_at`).run(courseId, key, materialId, hash, url, now);
        if (previous) this.database.prepare("UPDATE materials SET is_active = 0 WHERE id = ? AND course_id = ?").run(previous.materialId, courseId);
      } else if (previous) {
        this.database.prepare("UPDATE materials SET is_active = 0 WHERE id = ? AND course_id = ?").run(materialId, courseId);
      }
      this.database.exec("COMMIT");
    } catch (error) { this.database.exec("ROLLBACK"); throw error; }
  }
  saveJob(job: CanvasImportJob) {
    this.database.prepare(`INSERT INTO canvas_import_jobs (id, course_id, payload_json) VALUES (?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET payload_json = excluded.payload_json`).run(job.id, job.courseId, JSON.stringify(CanvasImportJobSchema.parse(job)));
  }
  job(id: string) {
    const row = this.database.prepare("SELECT payload_json FROM canvas_import_jobs WHERE id = ?").get(id) as { payload_json: string } | undefined;
    return row ? CanvasImportJobSchema.parse(JSON.parse(row.payload_json)) : null;
  }
  recoverJobs() {
    const rows = this.database.prepare("SELECT payload_json FROM canvas_import_jobs").all() as Array<{ payload_json: string }>;
    for (const row of rows) {
      const job = CanvasImportJobSchema.parse(JSON.parse(row.payload_json));
      if (job.status === "running" || job.status === "queued") {
        job.status = "interrupted";
        job.completedAt = new Date().toISOString();
        for (const item of job.items) if (["queued", "importing"].includes(item.status)) { item.status = "failed"; item.detail = "The server restarted. Preview and retry the import."; }
        this.saveJob(job);
      }
    }
  }
  finished(courseId: string) {
    this.database.prepare("UPDATE canvas_courses SET last_imported_at = ? WHERE course_id = ?").run(new Date().toISOString(), courseId);
  }
}
