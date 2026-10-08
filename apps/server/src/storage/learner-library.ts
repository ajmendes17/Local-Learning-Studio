import { randomUUID } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import type { LearnerAssessmentCreate, LearnerProfileResponse } from "@local-learning-studio/contracts";

export class LearnerLibrary {
  constructor(private readonly database: DatabaseSync) {}

  createAssessment(courseId: string, input: LearnerAssessmentCreate) {
    const foreignConcept = input.topics.some(({ conceptId }) => conceptId && !this.database
      .prepare("SELECT 1 FROM learner_concepts WHERE id = ? AND course_id = ?")
      .get(conceptId, courseId));
    if (foreignConcept) throw new Error("Assessment topics must belong to the same class.");
    const id = randomUUID();
    const now = new Date().toISOString();
    const insert = this.database.prepare(`INSERT INTO learner_assessments
      (id,title,kind,scheduled_at,available_minutes,created_at,updated_at,course_id)
      VALUES (?,?,?,?,?,?,?,?)`);
    const insertTopic = this.database.prepare(`INSERT INTO learner_topics
      (id,assessment_id,concept_id,title,position,importance,provenance,created_at,course_id)
      VALUES (?,?,?,?,?,?,?,?,?)`);
    this.database.exec("BEGIN IMMEDIATE");
    try {
      insert.run(id, input.title, input.kind, input.scheduledAt ?? null, input.availableMinutes ?? null, now, now, courseId);
      input.topics.forEach((topic, position) => insertTopic.run(
        randomUUID(), id, topic.conceptId ?? null, topic.title, position,
        topic.importance, topic.provenance, now, courseId,
      ));
      this.database.exec("COMMIT");
    } catch (error) {
      this.database.exec("ROLLBACK");
      throw error;
    }
    return this.getProfile(courseId).assessments.find((assessment) => assessment.id === id)!;
  }

  createConcept(courseId: string, input: { stableKey: string; title: string; description: string }) {
    const id = randomUUID();
    const now = new Date().toISOString();
    const storedKey = `${courseId}:${input.stableKey}`;
    this.database.prepare(`INSERT INTO learner_concepts (id,stable_key,title,description,created_at,updated_at,course_id)
      VALUES (?,?,?,?,?,?,?)`).run(id, storedKey, input.title, input.description, now, now, courseId);
    return { id, ...input };
  }

  ensureConcept(courseId: string, title: string) {
    const baseKey = title.toLocaleLowerCase().normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "").slice(0, 110) || "topic";
    const stableKey = `${courseId}:${baseKey}`;
    const existing = this.database.prepare(`SELECT id,stable_key AS stableKey,title,description
      FROM learner_concepts WHERE course_id = ? AND stable_key = ?`).get(courseId, stableKey) as
      | { id: string; stableKey: string; title: string; description: string }
      | undefined;
    if (existing) return existing;
    try {
      return this.createConcept(courseId, { stableKey: baseKey, title, description: "" });
    } catch {
      return this.database.prepare(`SELECT id,stable_key AS stableKey,title,description
        FROM learner_concepts WHERE course_id = ? AND stable_key = ?`).get(courseId, stableKey) as
        { id: string; stableKey: string; title: string; description: string };
    }
  }

  saveStudySession(courseId: string, conceptId: string, content: unknown) {
    const id = randomUUID();
    const createdAt = new Date().toISOString();
    this.database.prepare(`INSERT INTO study_sessions (id,course_id,concept_id,topic,method,content_json,created_at)
      VALUES (?,?,?,?,?,?,?)`).run(id, courseId, conceptId, (content as any).topic, (content as any).method, JSON.stringify(content), createdAt);
    return { sessionId: id, createdAt, ...(content as object) };
  }

  getStudySession(courseId: string, sessionId: string) {
    const row = this.database.prepare(`SELECT id,content_json AS contentJson,created_at AS createdAt
      FROM study_sessions WHERE course_id = ? AND id = ?`).get(courseId, sessionId) as
      | { id: string; contentJson: string; createdAt: string } | undefined;
    return row ? { sessionId: row.id, createdAt: row.createdAt, ...JSON.parse(row.contentJson) } : null;
  }

  listStudySessions(courseId: string, limit = 30) {
    return this.database.prepare(`SELECT s.id AS sessionId,s.concept_id AS conceptId,s.topic,s.method,s.created_at AS createdAt,
      COUNT(a.id) AS attemptCount,SUM(CASE WHEN a.outcome='correct' THEN 1 ELSE 0 END) AS correctCount,
      (SELECT outcome FROM study_attempts WHERE concept_id=s.concept_id ORDER BY created_at DESC LIMIT 1) AS latestOutcome
      FROM study_sessions s LEFT JOIN study_attempts a ON a.concept_id=s.concept_id
      WHERE s.course_id=? GROUP BY s.id ORDER BY s.created_at DESC LIMIT ?`).all(courseId, limit).map((row: any) => ({
        ...row, attemptCount: Number(row.attemptCount), correctCount: Number(row.correctCount ?? 0),
      }));
  }

  recordAttempt(input: {
    courseId: string; conceptId: string; assessmentId?: string | null; activityType: string; prompt: string;
    response: string; reasoning: string; confidence?: number | null; hintCount: number;
    method: string; outcome: string; sourceRefs: unknown[]; independence: string; rationale: string;
  }) {
    const conceptExists = this.database.prepare("SELECT 1 FROM learner_concepts WHERE id = ? AND course_id = ?")
      .get(input.conceptId, input.courseId);
    const assessmentExists = !input.assessmentId || this.database.prepare("SELECT 1 FROM learner_assessments WHERE id = ? AND course_id = ?")
      .get(input.assessmentId, input.courseId);
    if (!conceptExists || !assessmentExists) throw new Error("Attempt references must belong to the same class.");
    const id = randomUUID();
    const now = new Date().toISOString();
    this.database.exec("BEGIN IMMEDIATE");
    try {
      this.database.prepare(`INSERT INTO study_attempts
        (id,concept_id,assessment_id,activity_type,prompt,response,reasoning,confidence,hint_count,method,outcome,source_refs_json,created_at,course_id)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
        id, input.conceptId, input.assessmentId ?? null, input.activityType, input.prompt,
        input.response, input.reasoning, input.confidence ?? null, input.hintCount,
        input.method, input.outcome, JSON.stringify(input.sourceRefs), now, input.courseId,
      );
      this.database.prepare(`INSERT INTO mastery_evidence
        (id,attempt_id,concept_id,evidence_kind,outcome,independence,rationale,created_at,course_id)
        VALUES (?,?,?,?,?,?,?,?,?)`).run(
        randomUUID(), id, input.conceptId, input.activityType, input.outcome,
        input.independence, input.rationale, now, input.courseId,
      );
      this.database.exec("COMMIT");
    } catch (error) {
      this.database.exec("ROLLBACK");
      throw error;
    }
    return { id, conceptId: input.conceptId, assessmentId: input.assessmentId ?? null, outcome: input.outcome, createdAt: now };
  }

  getRecentAttempts(courseId: string, conceptId: string, limit = 5) {
    return this.database.prepare(`SELECT activity_type AS activityType,prompt,response,reasoning,confidence,
      hint_count AS hintCount,method,outcome,independence,created_at AS createdAt
      FROM study_attempts WHERE course_id=? AND concept_id=? ORDER BY created_at DESC LIMIT ?`)
      .all(courseId, conceptId, limit).map((row: any) => ({
        ...row,
        confidence: row.confidence == null ? null : Number(row.confidence),
        hintCount: Number(row.hintCount),
      }));
  }

  getProfile(courseId: string): LearnerProfileResponse {
    const assessmentRows = this.database.prepare(`SELECT id,title,kind,scheduled_at AS scheduledAt,
      available_minutes AS availableMinutes,created_at AS createdAt FROM learner_assessments WHERE course_id = ? ORDER BY scheduled_at,created_at`).all(courseId) as any[];
    const topics = this.database.prepare(`SELECT id,assessment_id AS assessmentId,concept_id AS conceptId,title,position,importance,provenance
      FROM learner_topics WHERE course_id = ? ORDER BY assessment_id,position`).all(courseId) as any[];
    const concepts = this.database.prepare(`SELECT c.id,c.stable_key AS stableKey,c.title,c.description,
      COUNT(a.id) AS attemptCount,SUM(CASE WHEN a.outcome='correct' THEN 1 ELSE 0 END) AS correctCount,
      (SELECT outcome FROM study_attempts WHERE concept_id=c.id ORDER BY created_at DESC LIMIT 1) AS latestOutcome,
      MAX(a.created_at) AS lastPracticedAt FROM learner_concepts c LEFT JOIN study_attempts a ON a.concept_id=c.id
      WHERE c.course_id = ? GROUP BY c.id ORDER BY c.title`).all(courseId) as any[];
    return {
      assessments: assessmentRows.map((row) => ({
        ...row, availableMinutes: row.availableMinutes == null ? null : Number(row.availableMinutes),
        topics: topics.filter((topic) => topic.assessmentId === row.id).map(({ assessmentId: _assessmentId, ...topic }) => ({ ...topic, position: Number(topic.position) })),
      })),
      concepts: concepts.map((row) => ({ ...row, attemptCount: Number(row.attemptCount), correctCount: Number(row.correctCount ?? 0) })),
    };
  }
}
