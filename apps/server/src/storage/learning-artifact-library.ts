import { randomUUID } from "node:crypto";
import {
  CourseMapArtifactSchema,
  type CourseMapProposal,
  type LearningArtifact,
  LearningArtifactSchema,
  type SourceClassificationProposal,
  SourceClassificationArtifactSchema,
} from "@local-learning-studio/contracts";
import type { DatabaseSync } from "node:sqlite";

type ArtifactKind = LearningArtifact["kind"];

interface ArtifactRow {
  id: string;
  courseId: string;
  kind: ArtifactKind;
  schemaVersion: string;
  status: LearningArtifact["status"];
  sourceFingerprint: string;
  skillName: string;
  model: string;
  payloadJson: string;
  createdAt: string;
  acceptedAt: string | null;
}

const artifactSelect = `
  SELECT
    id,
    course_id AS courseId,
    kind,
    schema_version AS schemaVersion,
    status,
    source_fingerprint AS sourceFingerprint,
    skill_name AS skillName,
    model,
    payload_json AS payloadJson,
    created_at AS createdAt,
    accepted_at AS acceptedAt
  FROM learning_artifacts
`;

function mapArtifact(row: ArtifactRow): LearningArtifact {
  return LearningArtifactSchema.parse({
    ...row,
    payload: JSON.parse(row.payloadJson),
  });
}

export class LearningArtifactLibrary {
  constructor(private readonly database: DatabaseSync) {}

  latest(courseId: string, kind: ArtifactKind): LearningArtifact | null {
    const row = this.database
      .prepare(`
        ${artifactSelect}
        WHERE course_id = ? AND kind = ? AND status <> 'superseded'
        ORDER BY CASE status WHEN 'draft' THEN 0 ELSE 1 END, created_at DESC
        LIMIT 1
      `)
      .get(courseId, kind) as unknown as ArtifactRow | undefined;
    return row ? mapArtifact(row) : null;
  }

  acceptedCourseMap(courseId: string) {
    const row = this.database.prepare(`
      ${artifactSelect}
      WHERE course_id = ? AND kind = 'course-map' AND status = 'accepted'
      ORDER BY accepted_at DESC LIMIT 1
    `).get(courseId) as unknown as ArtifactRow | undefined;
    return row ? CourseMapArtifactSchema.parse(mapArtifact(row)) : null;
  }

  findByFingerprint(
    courseId: string,
    kind: ArtifactKind,
    sourceFingerprint: string,
  ): LearningArtifact | null {
    const row = this.database
      .prepare(`
        ${artifactSelect}
        WHERE course_id = ? AND kind = ? AND source_fingerprint = ?
          AND status <> 'superseded'
        ORDER BY created_at DESC
        LIMIT 1
      `)
      .get(courseId, kind, sourceFingerprint) as unknown as
      | ArtifactRow
      | undefined;
    return row ? mapArtifact(row) : null;
  }

  saveClassification(input: {
    courseId: string;
    sourceFingerprint: string;
    model: string;
    payload: SourceClassificationProposal;
  }) {
    const artifact = this.save({
      ...input,
      kind: "source-classification",
      schemaVersion: "source-classification.v1",
      skillName: "classify-course-sources",
    });
    return SourceClassificationArtifactSchema.parse(artifact);
  }

  saveCourseMap(input: {
    courseId: string;
    sourceFingerprint: string;
    model: string;
    payload: CourseMapProposal;
  }) {
    const artifact = this.save({
      ...input,
      kind: "course-map",
      schemaVersion: "course-map.v1",
      skillName: "map-course",
    });
    return CourseMapArtifactSchema.parse(artifact);
  }

  acceptCourseMap(
    courseId: string,
    artifactId: string,
    apply?: (proposal: CourseMapProposal) => void,
  ) {
    const row = this.database
      .prepare(`
        ${artifactSelect}
        WHERE course_id = ? AND id = ? AND kind = 'course-map'
      `)
      .get(courseId, artifactId) as unknown as ArtifactRow | undefined;
    if (!row || row.status === "superseded") return null;

    const acceptedAt = new Date().toISOString();
    const artifact = CourseMapArtifactSchema.parse(mapArtifact(row));
    this.database.exec("BEGIN IMMEDIATE");
    try {
      apply?.(artifact.payload);
      this.database
        .prepare(`
          UPDATE learning_artifacts
          SET status = 'superseded'
          WHERE course_id = ? AND kind = 'course-map'
            AND status = 'accepted' AND id <> ?
        `)
        .run(courseId, artifactId);
      this.database
        .prepare(`
          UPDATE learning_artifacts
          SET status = 'accepted', accepted_at = ?
          WHERE course_id = ? AND id = ?
        `)
        .run(acceptedAt, courseId, artifactId);
      this.database.exec("COMMIT");
    } catch (error) {
      this.database.exec("ROLLBACK");
      throw error;
    }

    return CourseMapArtifactSchema.parse({
      ...artifact,
      status: "accepted",
      acceptedAt,
    });
  }

  private save(input: {
    courseId: string;
    kind: ArtifactKind;
    schemaVersion: string;
    sourceFingerprint: string;
    skillName: string;
    model: string;
    payload: SourceClassificationProposal | CourseMapProposal;
  }) {
    const id = randomUUID();
    const createdAt = new Date().toISOString();

    this.database.exec("BEGIN IMMEDIATE");
    try {
      this.database
        .prepare(`
          UPDATE learning_artifacts
          SET status = 'superseded'
          WHERE course_id = ? AND kind = ? AND status = 'draft'
        `)
        .run(input.courseId, input.kind);
      this.database
        .prepare(`
          INSERT INTO learning_artifacts (
            id, course_id, kind, schema_version, status, source_fingerprint,
            skill_name, model, payload_json, created_at, accepted_at
          ) VALUES (?, ?, ?, ?, 'draft', ?, ?, ?, ?, ?, NULL)
        `)
        .run(
          id,
          input.courseId,
          input.kind,
          input.schemaVersion,
          input.sourceFingerprint,
          input.skillName,
          input.model,
          JSON.stringify(input.payload),
          createdAt,
        );
      this.database.exec("COMMIT");
    } catch (error) {
      this.database.exec("ROLLBACK");
      throw error;
    }

    return LearningArtifactSchema.parse({
      id,
      courseId: input.courseId,
      kind: input.kind,
      schemaVersion: input.schemaVersion,
      status: "draft",
      sourceFingerprint: input.sourceFingerprint,
      skillName: input.skillName,
      model: input.model,
      payload: input.payload,
      createdAt,
      acceptedAt: null,
    });
  }
}
