import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { DatabaseSync } from "node:sqlite";

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

    CREATE TABLE IF NOT EXISTS source_passages (
      id TEXT PRIMARY KEY,
      course_id TEXT NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
      material_id TEXT NOT NULL REFERENCES materials(id) ON DELETE CASCADE,
      ordinal INTEGER NOT NULL,
      content TEXT NOT NULL,
      content_hash TEXT NOT NULL,
      locator_kind TEXT NOT NULL,
      page_start INTEGER,
      page_end INTEGER,
      line_start INTEGER,
      line_end INTEGER,
      heading TEXT,
      created_at TEXT NOT NULL,
      UNIQUE(material_id, ordinal),
      CHECK(
        (
          locator_kind = 'page'
          AND page_start > 0
          AND page_end >= page_start
          AND line_start IS NULL
          AND line_end IS NULL
          AND heading IS NULL
        )
        OR
        (
          locator_kind = 'lines'
          AND line_start > 0
          AND line_end >= line_start
          AND page_start IS NULL
          AND page_end IS NULL
        )
      )
    );

    CREATE TABLE IF NOT EXISTS concepts (
      id TEXT PRIMARY KEY,
      course_id TEXT NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
      title TEXT NOT NULL,
      description TEXT NOT NULL,
      origin TEXT NOT NULL,
      UNIQUE(course_id, id)
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

    CREATE INDEX IF NOT EXISTS materials_course_id
      ON materials(course_id);
    CREATE INDEX IF NOT EXISTS source_passages_course_material
      ON source_passages(course_id, material_id, ordinal);
    CREATE INDEX IF NOT EXISTS modules_course_id
      ON modules(course_id);
    CREATE INDEX IF NOT EXISTS assessments_course_id
      ON assessments(course_id);
    CREATE INDEX IF NOT EXISTS concepts_course_id
      ON concepts(course_id);
  `);

  return database;
}
