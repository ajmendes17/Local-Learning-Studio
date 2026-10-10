import { createHash, randomUUID } from "node:crypto";
import type {
  CourseMaterial,
  SourceAnnotation,
  SourcePassage,
} from "@local-learning-studio/contracts";
import { SourceLocationSchema } from "@local-learning-studio/contracts";
import type { DatabaseSync } from "node:sqlite";
import type { ExtractedPassage } from "../extraction/types.js";

interface PassageRow {
  id: string;
  courseId: string;
  materialId: string;
  ordinal: number;
  content: string;
  contentHash: string;
  locationJson: string;
  createdAt: string;
}

interface PassageHashRow {
  materialId: string;
  contentHash: string;
}

function mapPassage(row: PassageRow): SourcePassage {
  return {
    id: row.id,
    courseId: row.courseId,
    materialId: row.materialId,
    ordinal: Number(row.ordinal),
    content: row.content,
    contentHash: row.contentHash,
    location: SourceLocationSchema.parse(JSON.parse(row.locationJson)),
    createdAt: row.createdAt,
  };
}

const passageSelect = `
  SELECT
    id,
    course_id AS courseId,
    material_id AS materialId,
    ordinal,
    content,
    content_hash AS contentHash,
    location_json AS locationJson,
    created_at AS createdAt
  FROM source_passages
`;

export class SourceLibrary {
  constructor(private readonly database: DatabaseSync) {}

  recoverInterruptedExtractions() {
    return this.database
      .prepare(`
        UPDATE materials
        SET
          status = 'failed',
          error_message = 'Extraction was interrupted before it completed.'
        WHERE status = 'processing'
      `)
      .run().changes;
  }

  getMaterial(courseId: string, materialId: string): CourseMaterial | null {
    const row = this.database
      .prepare(`
        SELECT
          id,
          course_id AS courseId,
          original_name AS originalName,
          media_type AS mediaType,
          kind,
          size_bytes AS sizeBytes,
          status,
          (SELECT COUNT(*) FROM source_passages
            WHERE material_id = materials.id) AS passageCount,
          error_message AS errorMessage,
          created_at AS createdAt
        FROM materials
        WHERE course_id = ? AND id = ?
      `)
      .get(courseId, materialId) as unknown as CourseMaterial | undefined;
    return row ?? null;
  }

  countPassages(courseId: string, materialId: string) {
    const row = this.database
      .prepare(`
        SELECT COUNT(*) AS count
        FROM source_passages
        WHERE course_id = ? AND material_id = ?
      `)
      .get(courseId, materialId) as { count: number };
    return Number(row.count);
  }

  getPassages(
    courseId: string,
    materialId: string,
    limit: number,
    offset: number,
  ): SourcePassage[] {
    const rows = this.database
      .prepare(`
        ${passageSelect}
        WHERE course_id = ? AND material_id = ?
        ORDER BY ordinal ASC
        LIMIT ? OFFSET ?
      `)
      .all(courseId, materialId, limit, offset) as unknown as PassageRow[];
    return rows.map(mapPassage);
  }

  getAnnotations(courseId: string, materialId: string): SourceAnnotation[] {
    const rows = this.database.prepare(`SELECT a.id,a.course_id AS courseId,a.material_id AS materialId,
      COALESCE((SELECT current.id FROM source_passages current WHERE current.course_id=a.course_id
        AND current.material_id=a.material_id AND current.ordinal=a.passage_ordinal
        AND current.content_hash=a.content_hash AND current.location_json=a.location_json LIMIT 1),a.passage_id) AS passageId,
      a.passage_ordinal AS ordinal,a.content_hash AS contentHash,a.location_json AS locationJson,
      a.excerpt,a.body,a.created_at AS createdAt,a.updated_at AS updatedAt,
      EXISTS(SELECT 1 FROM source_passages current WHERE current.course_id=a.course_id
        AND current.material_id=a.material_id AND current.ordinal=a.passage_ordinal
        AND current.content_hash=a.content_hash AND current.location_json=a.location_json) AS isCurrent
      FROM source_annotations a WHERE a.course_id=? AND a.material_id=? ORDER BY a.passage_ordinal,a.created_at,a.id`)
      .all(courseId, materialId) as Array<Record<string, unknown> & { locationJson: string; isCurrent: number }>;
    return rows.map((row) => ({
      ...row,
      location: SourceLocationSchema.parse(JSON.parse(row.locationJson)),
      isCurrent: Boolean(row.isCurrent),
    } as unknown as SourceAnnotation));
  }

  createAnnotation(courseId: string, materialId: string, passageId: string, body: string) {
    const passageRow = this.database.prepare(`${passageSelect} WHERE course_id=? AND material_id=? AND id=?`)
      .get(courseId, materialId, passageId) as unknown as PassageRow | undefined;
    if (!passageRow) return null;
    const passage = mapPassage(passageRow);
    const id = randomUUID();
    const now = new Date().toISOString();
    this.database.prepare(`INSERT INTO source_annotations
      (id,course_id,material_id,passage_id,passage_ordinal,content_hash,location_json,excerpt,body,created_at,updated_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?)`).run(
      id, courseId, materialId, passage.id, passage.ordinal, passage.contentHash,
      JSON.stringify(passage.location), passage.content.slice(0, 800), body, now, now,
    );
    return this.getAnnotations(courseId, materialId).find((annotation) => annotation.id === id) ?? null;
  }

  updateAnnotation(courseId: string, materialId: string, annotationId: string, body: string) {
    const result = this.database.prepare(`UPDATE source_annotations SET body=?,updated_at=?
      WHERE course_id=? AND material_id=? AND id=?`).run(body, new Date().toISOString(), courseId, materialId, annotationId);
    if (Number(result.changes) === 0) return null;
    return this.getAnnotations(courseId, materialId).find((annotation) => annotation.id === annotationId) ?? null;
  }

  deleteAnnotation(courseId: string, materialId: string, annotationId: string) {
    const result = this.database.prepare(`DELETE FROM source_annotations
      WHERE course_id=? AND material_id=? AND id=?`).run(courseId, materialId, annotationId);
    return Number(result.changes) > 0;
  }

  getCoursePassageHashes(courseId: string): PassageHashRow[] {
    return this.database
      .prepare(`
        SELECT
          material_id AS materialId,
          content_hash AS contentHash
        FROM source_passages
        WHERE course_id = ?
        ORDER BY material_id, ordinal
      `)
      .all(courseId) as unknown as PassageHashRow[];
  }

  completeExtraction(
    courseId: string,
    materialId: string,
    drafts: ExtractedPassage[],
  ) {
    const createdAt = new Date().toISOString();
    const insert = this.database.prepare(`
      INSERT INTO source_passages (
        id, course_id, material_id, ordinal, content, content_hash,
        location_json, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);

    this.database.exec("BEGIN IMMEDIATE");
    try {
      this.database
        .prepare("DELETE FROM source_passages WHERE material_id = ?")
        .run(materialId);

      drafts.forEach((draft, ordinal) => {
        const location = draft.location;
        insert.run(
          randomUUID(),
          courseId,
          materialId,
          ordinal,
          draft.content,
          createHash("sha256").update(draft.content).digest("hex"),
          JSON.stringify(SourceLocationSchema.parse(location)),
          createdAt,
        );
      });

      this.database
        .prepare(`
          UPDATE materials
          SET status = 'ready', error_message = NULL
          WHERE course_id = ? AND id = ?
        `)
        .run(courseId, materialId);
      this.database.exec("COMMIT");
    } catch (error) {
      this.database.exec("ROLLBACK");
      throw error;
    }
  }

  failExtraction(courseId: string, materialId: string, message: string) {
    this.database.exec("BEGIN IMMEDIATE");
    try {
      this.database
        .prepare("DELETE FROM source_passages WHERE material_id = ?")
        .run(materialId);
      this.database
        .prepare(`
          UPDATE materials
          SET status = 'failed', error_message = ?
          WHERE course_id = ? AND id = ?
        `)
        .run(message.slice(0, 500), courseId, materialId);
      this.database.exec("COMMIT");
    } catch (error) {
      this.database.exec("ROLLBACK");
      throw error;
    }
  }
}
