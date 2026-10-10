import { randomUUID } from "node:crypto";
import type {
  CourseAccent,
  CourseAssessment,
  CourseDetail,
  CourseMaterial,
  CourseModule,
  CourseSummary,
  CreateCourseRequest,
  MaterialKind,
  MaterialStatus,
} from "@local-learning-studio/contracts";
import type { DatabaseSync } from "node:sqlite";

interface CourseRow {
  id: string;
  title: string;
  code: string;
  term: string;
  accent: CourseAccent;
  material_count: number;
  module_count: number;
  assessment_count: number;
  created_at: string;
  updated_at: string;
}

const courseSelect = `
  SELECT
    courses.*,
    (SELECT COUNT(*) FROM materials WHERE course_id = courses.id)
      AS material_count,
    (SELECT COUNT(*) FROM modules WHERE course_id = courses.id)
      AS module_count,
    (SELECT COUNT(*) FROM assessments WHERE course_id = courses.id)
      AS assessment_count
  FROM courses
`;

function mapCourse(row: CourseRow): CourseSummary {
  return {
    id: row.id,
    title: row.title,
    code: row.code,
    term: row.term,
    accent: row.accent,
    materialCount: Number(row.material_count),
    moduleCount: Number(row.module_count),
    assessmentCount: Number(row.assessment_count),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export interface NewMaterialRecord {
  id: string;
  courseId: string;
  originalName: string;
  storedName: string;
  mediaType: string;
  kind: MaterialKind;
  sizeBytes: number;
  initialStatus?: MaterialStatus;
}

export class CourseLibrary {
  constructor(private readonly database: DatabaseSync) {}

  listCourses(): CourseSummary[] {
    const rows = this.database
      .prepare(`${courseSelect} ORDER BY updated_at DESC`)
      .all() as unknown as CourseRow[];
    return rows.map(mapCourse);
  }

  createCourse(input: CreateCourseRequest): CourseSummary {
    const id = randomUUID();
    const now = new Date().toISOString();

    this.database
      .prepare(`
        INSERT INTO courses (
          id, title, code, term, accent, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?)
      `)
      .run(id, input.title, input.code, input.term, input.accent, now, now);

    return this.getCourse(id)!;
  }

  getCourse(courseId: string): CourseSummary | null {
    const row = this.database
      .prepare(`${courseSelect} WHERE courses.id = ?`)
      .get(courseId) as unknown as CourseRow | undefined;
    return row ? mapCourse(row) : null;
  }

  getCourseDetail(courseId: string): CourseDetail | null {
    const course = this.getCourse(courseId);
    if (!course) return null;

    const materials = this.database
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
        WHERE course_id = ?
        ORDER BY created_at DESC
      `)
      .all(courseId) as unknown as CourseMaterial[];

    const modules = this.database
      .prepare(`
        SELECT id, course_id AS courseId, title, position, description, origin
        FROM modules
        WHERE course_id = ?
        ORDER BY position ASC
      `)
      .all(courseId) as unknown as CourseModule[];

    const assessments = this.database
      .prepare(`
        SELECT
          id,
          course_id AS courseId,
          module_id AS moduleId,
          title,
          kind,
          due_at AS dueAt,
          weight_percent AS weightPercent,
          origin
        FROM assessments
        WHERE course_id = ?
        ORDER BY due_at IS NULL, due_at ASC, title ASC
      `)
      .all(courseId) as unknown as CourseAssessment[];

    return { ...course, materials, modules, assessments };
  }

  getStoredMaterialFile(courseId: string, materialId: string) {
    return this.database.prepare(`SELECT original_name AS originalName,stored_name AS storedName,media_type AS mediaType
      FROM materials WHERE course_id=? AND id=?`).get(courseId, materialId) as
      | { originalName: string; storedName: string; mediaType: string }
      | undefined;
  }

  createMaterial(record: NewMaterialRecord): CourseMaterial {
    const now = new Date().toISOString();
    const status = record.initialStatus ?? "stored";

    this.database
      .prepare(`
        INSERT INTO materials (
          id, course_id, original_name, stored_name, media_type, kind,
          size_bytes, status, error_message, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL, ?)
      `)
      .run(
        record.id,
        record.courseId,
        record.originalName,
        record.storedName,
        record.mediaType,
        record.kind,
        record.sizeBytes,
        status,
        now,
      );

    this.database
      .prepare("UPDATE courses SET updated_at = ? WHERE id = ?")
      .run(now, record.courseId);

    return {
      id: record.id,
      courseId: record.courseId,
      originalName: record.originalName,
      mediaType: record.mediaType,
      kind: record.kind,
      sizeBytes: record.sizeBytes,
      status,
      passageCount: 0,
      errorMessage: null,
      createdAt: now,
    };
  }
}
