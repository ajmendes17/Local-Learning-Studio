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

    CREATE INDEX IF NOT EXISTS materials_course_id
      ON materials(course_id);
    CREATE INDEX IF NOT EXISTS modules_course_id
      ON modules(course_id);
    CREATE INDEX IF NOT EXISTS assessments_course_id
      ON assessments(course_id);
  `);

  return database;
}

