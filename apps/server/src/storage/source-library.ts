import { createHash, randomUUID } from "node:crypto";
import type {
  CourseMaterial,
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
