import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { DatabaseSync } from "node:sqlite";

interface LegacyPassageRow {
  id: string;
  courseId: string;
  materialId: string;
  ordinal: number;
  content: string;
  contentHash: string;
  locatorKind: "page" | "lines";
  pageStart: number | null;
  pageEnd: number | null;
  lineStart: number | null;
  lineEnd: number | null;
  heading: string | null;
  createdAt: string;
}

function createSourcePassagesTable(database: DatabaseSync) {
  database.exec(`
    CREATE TABLE IF NOT EXISTS source_passages (
      id TEXT PRIMARY KEY,
      course_id TEXT NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
      material_id TEXT NOT NULL REFERENCES materials(id) ON DELETE CASCADE,
      ordinal INTEGER NOT NULL,
      content TEXT NOT NULL,
      content_hash TEXT NOT NULL,
      location_json TEXT NOT NULL CHECK(json_valid(location_json)),
      created_at TEXT NOT NULL,
      UNIQUE(material_id, ordinal)
    );
  `);
}

function ensureColumn(database: DatabaseSync, table: string, column: string, definition: string) {
  const columns = database.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>;
  if (!columns.some((item) => item.name === column)) {
    database.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  }
}

function migrateLegacySourcePassages(database: DatabaseSync) {
  const columns = database.prepare("PRAGMA table_info(source_passages)").all() as
    | Array<{ name: string }>
    | undefined;
  if (columns?.some(({ name }) => name === "location_json")) return;

  const rows = database
    .prepare(`
      SELECT
        id,
        course_id AS courseId,
        material_id AS materialId,
        ordinal,
        content,
        content_hash AS contentHash,
        locator_kind AS locatorKind,
        page_start AS pageStart,
        page_end AS pageEnd,
        line_start AS lineStart,
        line_end AS lineEnd,
        heading,
        created_at AS createdAt
      FROM source_passages
      ORDER BY material_id, ordinal
    `)
    .all() as unknown as LegacyPassageRow[];

  database.exec("BEGIN IMMEDIATE");
  try {
    database.exec("DROP INDEX IF EXISTS source_passages_course_material");
    database.exec(
      "ALTER TABLE source_passages RENAME TO source_passages_legacy",
    );
    createSourcePassagesTable(database);
    const insert = database.prepare(`
      INSERT INTO source_passages (
        id, course_id, material_id, ordinal, content, content_hash,
        location_json, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);

    for (const row of rows) {
      const location =
        row.locatorKind === "page"
          ? {
              kind: "page",
              pageStart: Number(row.pageStart),
              pageEnd: Number(row.pageEnd),
            }
          : {
              kind: "lines",
              lineStart: Number(row.lineStart),
              lineEnd: Number(row.lineEnd),
              heading: row.heading,
            };
      insert.run(
        row.id,
        row.courseId,
        row.materialId,
        row.ordinal,
        row.content,
        row.contentHash,
        JSON.stringify(location),
        row.createdAt,
      );
    }

    database.exec("DROP TABLE source_passages_legacy");
    database.exec(`
      CREATE INDEX source_passages_course_material
        ON source_passages(course_id, material_id, ordinal)
    `);
    database.exec("COMMIT");
  } catch (error) {
    database.exec("ROLLBACK");
    throw error;
  }
}

export function openDatabase(databasePath: string) {
  if (databasePath !== ":memory:") {
    mkdirSync(dirname(databasePath), { recursive: true });
  }

  const database = new DatabaseSync(databasePath);
  database.exec("PRAGMA foreign_keys = ON;");
  database.exec("PRAGMA journal_mode = WAL;");
  database.exec(`
    CREATE TABLE IF NOT EXISTS courses (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      code TEXT NOT NULL DEFAULT '',
      term TEXT NOT NULL DEFAULT '',
      accent TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS materials (
      id TEXT PRIMARY KEY,
      course_id TEXT NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
      original_name TEXT NOT NULL,
      stored_name TEXT NOT NULL,
      media_type TEXT NOT NULL,
      kind TEXT NOT NULL,
      size_bytes INTEGER NOT NULL,
      status TEXT NOT NULL,
      error_message TEXT,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS modules (
      id TEXT PRIMARY KEY,
      course_id TEXT NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
      title TEXT NOT NULL,
      position INTEGER NOT NULL,
      description TEXT,
      origin TEXT NOT NULL,
      UNIQUE(course_id, position)
    );

    CREATE TABLE IF NOT EXISTS assessments (
      id TEXT PRIMARY KEY,
      course_id TEXT NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
      module_id TEXT REFERENCES modules(id) ON DELETE SET NULL,
      title TEXT NOT NULL,
      kind TEXT NOT NULL,
      due_at TEXT,
      weight_percent REAL,
      origin TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS concepts (
      id TEXT PRIMARY KEY,
      course_id TEXT NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
      title TEXT NOT NULL,
      description TEXT NOT NULL,
      origin TEXT NOT NULL,
      UNIQUE(course_id, id)
    );

    CREATE TABLE IF NOT EXISTS learning_artifacts (
      id TEXT PRIMARY KEY,
      course_id TEXT NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
      kind TEXT NOT NULL,
      schema_version TEXT NOT NULL,
      status TEXT NOT NULL,
      source_fingerprint TEXT NOT NULL,
      skill_name TEXT NOT NULL,
      model TEXT NOT NULL,
      payload_json TEXT NOT NULL CHECK(json_valid(payload_json)),
      created_at TEXT NOT NULL,
      accepted_at TEXT
    );

    CREATE TABLE IF NOT EXISTS concept_prerequisites (
      course_id TEXT NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
      concept_id TEXT NOT NULL,
      prerequisite_concept_id TEXT NOT NULL,
      PRIMARY KEY(concept_id, prerequisite_concept_id),
      CHECK(concept_id <> prerequisite_concept_id),
      FOREIGN KEY(course_id, concept_id)
        REFERENCES concepts(course_id, id) ON DELETE CASCADE,
      FOREIGN KEY(course_id, prerequisite_concept_id)
        REFERENCES concepts(course_id, id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS concept_learning_objectives (
      course_id TEXT NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
      concept_id TEXT NOT NULL REFERENCES concepts(id) ON DELETE CASCADE,
      position INTEGER NOT NULL,
      objective TEXT NOT NULL,
      PRIMARY KEY(concept_id, position)
    );

    CREATE TABLE IF NOT EXISTS module_concepts (
      course_id TEXT NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
      module_id TEXT NOT NULL REFERENCES modules(id) ON DELETE CASCADE,
      concept_id TEXT NOT NULL REFERENCES concepts(id) ON DELETE CASCADE,
      position INTEGER NOT NULL,
      PRIMARY KEY(module_id, concept_id)
    );

    CREATE TABLE IF NOT EXISTS learner_assessments (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      kind TEXT NOT NULL CHECK(kind IN ('exam','quiz','other')),
      scheduled_at TEXT,
      available_minutes INTEGER CHECK(available_minutes IS NULL OR available_minutes > 0),
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS learner_concepts (
      id TEXT PRIMARY KEY,
      stable_key TEXT NOT NULL UNIQUE,
      title TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS learner_topics (
      id TEXT PRIMARY KEY,
      assessment_id TEXT NOT NULL REFERENCES learner_assessments(id) ON DELETE CASCADE,
      concept_id TEXT REFERENCES learner_concepts(id) ON DELETE SET NULL,
      title TEXT NOT NULL,
      position INTEGER NOT NULL,
      importance TEXT NOT NULL DEFAULT 'normal' CHECK(importance IN ('low','normal','high')),
      provenance TEXT NOT NULL CHECK(provenance IN ('learner','model','material')),
      created_at TEXT NOT NULL,
      UNIQUE(assessment_id, position)
    );

    CREATE TABLE IF NOT EXISTS study_attempts (
      id TEXT PRIMARY KEY,
      concept_id TEXT NOT NULL REFERENCES learner_concepts(id) ON DELETE CASCADE,
      assessment_id TEXT REFERENCES learner_assessments(id) ON DELETE SET NULL,
      activity_type TEXT NOT NULL CHECK(activity_type IN ('recall','explanation','application','recognition','retention')),
      prompt TEXT NOT NULL DEFAULT '',
      response TEXT NOT NULL DEFAULT '',
      reasoning TEXT NOT NULL DEFAULT '',
      confidence REAL CHECK(confidence IS NULL OR (confidence >= 0 AND confidence <= 1)),
      hint_count INTEGER NOT NULL DEFAULT 0 CHECK(hint_count >= 0),
      method TEXT NOT NULL DEFAULT '',
      outcome TEXT NOT NULL CHECK(outcome IN ('correct','incorrect','incomplete','unsupported','not-graded')),
      source_refs_json TEXT NOT NULL DEFAULT '[]' CHECK(json_valid(source_refs_json)),
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS study_sessions (
      id TEXT PRIMARY KEY,
      course_id TEXT NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
      concept_id TEXT NOT NULL REFERENCES learner_concepts(id) ON DELETE CASCADE,
      topic TEXT NOT NULL,
      method TEXT NOT NULL CHECK(method IN ('explanation','worked-example','quiz','analogy')),
      content_json TEXT NOT NULL CHECK(json_valid(content_json)),
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS mastery_evidence (
      id TEXT PRIMARY KEY,
      attempt_id TEXT NOT NULL UNIQUE REFERENCES study_attempts(id) ON DELETE CASCADE,
      concept_id TEXT NOT NULL REFERENCES learner_concepts(id) ON DELETE CASCADE,
      evidence_kind TEXT NOT NULL,
      outcome TEXT NOT NULL,
      independence TEXT NOT NULL CHECK(independence IN ('independent','hinted','assisted','unknown')),
      rationale TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS materials_course_id
      ON materials(course_id);
    CREATE INDEX IF NOT EXISTS modules_course_id
      ON modules(course_id);
    CREATE INDEX IF NOT EXISTS assessments_course_id
      ON assessments(course_id);
    CREATE INDEX IF NOT EXISTS concepts_course_id
      ON concepts(course_id);
    CREATE INDEX IF NOT EXISTS module_concepts_course_id
      ON module_concepts(course_id, module_id, position);
    CREATE INDEX IF NOT EXISTS learning_artifacts_course_kind
      ON learning_artifacts(course_id, kind, created_at DESC);
    CREATE INDEX IF NOT EXISTS learning_artifacts_fingerprint
      ON learning_artifacts(course_id, kind, source_fingerprint);
    CREATE INDEX IF NOT EXISTS learner_topics_assessment
      ON learner_topics(assessment_id, position);
    CREATE INDEX IF NOT EXISTS study_attempts_concept_time
      ON study_attempts(concept_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS mastery_evidence_concept_time
      ON mastery_evidence(concept_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS study_sessions_course_time
      ON study_sessions(course_id, created_at DESC);
  `);

  createSourcePassagesTable(database);
  migrateLegacySourcePassages(database);
  for (const table of ["learner_assessments", "learner_topics", "learner_concepts", "study_attempts", "mastery_evidence"]) {
    ensureColumn(database, table, "course_id", "TEXT REFERENCES courses(id) ON DELETE CASCADE");
  }
  database.exec(`
    CREATE INDEX IF NOT EXISTS source_passages_course_material
      ON source_passages(course_id, material_id, ordinal);
    CREATE INDEX IF NOT EXISTS learner_assessments_course_time
      ON learner_assessments(course_id, scheduled_at);
    CREATE INDEX IF NOT EXISTS learner_concepts_course
      ON learner_concepts(course_id, title);
    CREATE INDEX IF NOT EXISTS learner_topics_course
      ON learner_topics(course_id, assessment_id, position);
  `);

  return database;
}
