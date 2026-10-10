import { randomUUID } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import type { LearnerAssessmentCreate, LearnerAssessmentTopicsAppend, LearnerAssessmentUpdate, LearnerMethodProgressResponse, LearnerPatternReviewResult, LearnerProfileResponse } from "@local-learning-studio/contracts";

function sourceSessionMatches(sessionAlias: string, materialAlias: string) {
  return `(json_extract(${sessionAlias}.content_json,'$.sourceMaterialId')=${materialAlias}.id OR (
    json_extract(${sessionAlias}.content_json,'$.sourceMaterialId') IS NULL
    AND json_extract(${sessionAlias}.content_json,'$.sourceBasis')='course-materials'
    AND instr(${sessionAlias}.content_json,${materialAlias}.original_name)>0
    AND (SELECT COUNT(*) FROM materials candidate WHERE candidate.course_id=${sessionAlias}.course_id
      AND instr(${sessionAlias}.content_json,candidate.original_name)>0)=1
  ))`;
}

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
      (id,title,instructor_text,kind,scheduled_at,available_minutes,daily_minutes,created_at,updated_at,course_id)
      VALUES (?,?,?,?,?,?,?,?,?,?)`);
    const insertTopic = this.database.prepare(`INSERT INTO learner_topics
      (id,assessment_id,concept_id,title,position,importance,provenance,created_at,course_id)
      VALUES (?,?,?,?,?,?,?,?,?)`);
    this.database.exec("BEGIN IMMEDIATE");
    try {
      insert.run(id, input.title, input.instructorText, input.kind, input.scheduledAt ?? null, input.availableMinutes ?? null, input.dailyMinutes, now, now, courseId);
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

  updateAssessment(courseId: string, assessmentId: string, input: LearnerAssessmentUpdate) {
    const current = this.database.prepare(`SELECT title,instructor_text AS instructorText,scheduled_at AS scheduledAt,available_minutes AS availableMinutes,daily_minutes AS dailyMinutes
      FROM learner_assessments WHERE course_id=? AND id=?`).get(courseId, assessmentId) as
      | { title: string; instructorText: string; scheduledAt: string | null; availableMinutes: number | null; dailyMinutes: number }
      | undefined;
    if (!current) return null;
    const title = input.title ?? current.title;
    const instructorText = input.instructorText ?? current.instructorText;
    const scheduledAt = Object.hasOwn(input, "scheduledAt") ? input.scheduledAt ?? null : current.scheduledAt;
    const availableMinutes = Object.hasOwn(input, "availableMinutes") ? input.availableMinutes ?? null : current.availableMinutes;
    const dailyMinutes = input.dailyMinutes ?? current.dailyMinutes;
    this.database.prepare(`UPDATE learner_assessments SET title=?,instructor_text=?,scheduled_at=?,available_minutes=?,daily_minutes=?,updated_at=?
      WHERE course_id=? AND id=?`).run(title, instructorText, scheduledAt, availableMinutes, dailyMinutes, new Date().toISOString(), courseId, assessmentId);
    return this.getProfile(courseId).assessments.find(({ id }) => id === assessmentId) ?? null;
  }

  appendAssessmentTopics(courseId: string, assessmentId: string, input: LearnerAssessmentTopicsAppend) {
    const assessment = this.database.prepare("SELECT id FROM learner_assessments WHERE course_id=? AND id=?")
      .get(courseId, assessmentId);
    if (!assessment) return null;
    const topicUsesForeignConcept = input.topics.some(({ conceptId }) => conceptId && !this.database
      .prepare("SELECT 1 FROM learner_concepts WHERE id=? AND course_id=?")
      .get(conceptId, courseId));
    if (topicUsesForeignConcept) throw new Error("Assessment topics must belong to the same class.");

    const current = this.database.prepare(`SELECT id,title,position,concept_id AS conceptId FROM learner_topics
      WHERE course_id=? AND assessment_id=? ORDER BY position`).all(courseId, assessmentId) as Array<{ id: string; title: string; position: number; conceptId: string | null }>;
    const currentTopicByTitle = new Map(current.map((topic) => [topic.title.trim().normalize("NFKC").toLocaleLowerCase(), topic]));
    const knownTitles = new Set(currentTopicByTitle.keys());
    let position = current.reduce((highest, topic) => Math.max(highest, topic.position), -1) + 1;
    let addedTopicCount = 0;
    const insertTopic = this.database.prepare(`INSERT INTO learner_topics
      (id,assessment_id,concept_id,title,position,importance,provenance,created_at,course_id)
      VALUES (?,?,?,?,?,?,?,?,?)`);
    const now = new Date().toISOString();
    this.database.exec("BEGIN IMMEDIATE");
    try {
      for (const topic of input.topics) {
        const key = topic.title.trim().normalize("NFKC").toLocaleLowerCase();
        if (knownTitles.has(key)) {
          const existingTopic = currentTopicByTitle.get(key);
          if (existingTopic && topic.conceptId && existingTopic.conceptId == null) {
            this.database.prepare(`UPDATE learner_topics SET concept_id=? WHERE course_id=? AND assessment_id=? AND id=? AND concept_id IS NULL`)
              .run(topic.conceptId, courseId, assessmentId, existingTopic.id);
            existingTopic.conceptId = topic.conceptId;
          }
          continue;
        }
        knownTitles.add(key);
        insertTopic.run(randomUUID(), assessmentId, topic.conceptId ?? null, topic.title, position++, topic.importance, topic.provenance, now, courseId);
        addedTopicCount += 1;
      }
      this.database.prepare("UPDATE learner_assessments SET updated_at=? WHERE course_id=? AND id=?")
        .run(now, courseId, assessmentId);
      this.database.exec("COMMIT");
    } catch (error) {
      this.database.exec("ROLLBACK");
      throw error;
    }
    const updatedAssessment = this.getProfile(courseId).assessments.find(({ id }) => id === assessmentId);
    return updatedAssessment ? { assessment: updatedAssessment, addedTopicCount } : null;
  }

  updateAssessmentTopicImportance(courseId: string, assessmentId: string, topicId: string, importance: "low" | "normal" | "high") {
    const now = new Date().toISOString();
    const result = this.database.prepare(`UPDATE learner_topics SET importance=?
      WHERE course_id=? AND assessment_id=? AND id=?`).run(importance, courseId, assessmentId, topicId);
    if (Number(result.changes) === 0) return null;
    this.database.prepare("UPDATE learner_assessments SET updated_at=? WHERE course_id=? AND id=?")
      .run(now, courseId, assessmentId);
    return this.getProfile(courseId).assessments.find(({ id }) => id === assessmentId) ?? null;
  }

  findAssessmentTopic(courseId: string, assessmentId: string, title: string) {
    return this.database.prepare(`SELECT id,concept_id AS conceptId,title FROM learner_topics
      WHERE course_id=? AND assessment_id=? AND lower(trim(title))=lower(trim(?)) LIMIT 1`)
      .get(courseId, assessmentId, title) as { id: string; conceptId: string | null; title: string } | undefined;
  }

  linkAssessmentTopic(courseId: string, assessmentId: string, topicId: string, conceptId: string) {
    const validConcept = this.database.prepare("SELECT 1 FROM learner_concepts WHERE id=? AND course_id=?").get(conceptId, courseId);
    if (!validConcept) return false;
    const result = this.database.prepare(`UPDATE learner_topics SET concept_id=?
      WHERE course_id=? AND assessment_id=? AND id=? AND (concept_id IS NULL OR concept_id=?)`)
      .run(conceptId, courseId, assessmentId, topicId, conceptId);
    return Number(result.changes) > 0;
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
    // Keep compatibility with databases whose CHECK constraint predates newer study methods;
    // the canonical method is preserved in content_json and used by readers below.
    const storedMethod = ["free-recall", "teach-back", "compare-contrast", "error-analysis"].includes((content as any).method) ? "quiz" : (content as any).method;
    this.database.prepare(`INSERT INTO study_sessions (id,course_id,concept_id,topic,method,content_json,created_at)
      VALUES (?,?,?,?,?,?,?)`).run(id, courseId, conceptId, (content as any).topic, storedMethod, JSON.stringify(content), createdAt);
    return { sessionId: id, createdAt, ...(content as object) };
  }

  getStudySession(courseId: string, sessionId: string) {
    const row = this.database.prepare(`SELECT id,content_json AS contentJson,created_at AS createdAt,
      (SELECT m.id FROM materials m WHERE m.course_id=study_sessions.course_id
        AND json_extract(study_sessions.content_json,'$.sourceMaterialId') IS NULL
        AND json_extract(study_sessions.content_json,'$.sourceBasis')='course-materials'
        AND instr(study_sessions.content_json,m.original_name)>0
        AND (SELECT COUNT(*) FROM materials candidate WHERE candidate.course_id=study_sessions.course_id
          AND instr(study_sessions.content_json,candidate.original_name)>0)=1 LIMIT 1) AS inferredSourceMaterialId
      FROM study_sessions WHERE course_id = ? AND id = ?`).get(courseId, sessionId) as
      | { id: string; contentJson: string; createdAt: string; inferredSourceMaterialId: string | null } | undefined;
    if (!row) return null;
    const content = JSON.parse(row.contentJson);
    // Older open-response sessions stored unused multiple-choice placeholders. Hide them
    // when reopening so every open-response view follows the same contract.
    if (content.method === "free-recall" || content.method === "teach-back") {
      content.options = [];
      content.answerIndex = null;
    }
    return { sessionId: row.id, createdAt: row.createdAt, ...content,
      sourceMaterialId: content.sourceMaterialId ?? row.inferredSourceMaterialId ?? null };
  }

  listStudySessions(courseId: string, limit = 30) {
    return this.database.prepare(`SELECT s.id AS sessionId,s.concept_id AS conceptId,s.topic,COALESCE(json_extract(s.content_json,'$.method'),s.method) AS method,s.created_at AS createdAt,
      COUNT(a.id) AS attemptCount,SUM(CASE WHEN a.outcome='correct' THEN 1 ELSE 0 END) AS correctCount,
      (SELECT outcome FROM study_attempts WHERE session_id=s.id ORDER BY created_at DESC, rowid DESC LIMIT 1) AS latestOutcome
      FROM study_sessions s LEFT JOIN study_attempts a ON a.session_id=s.id
      WHERE s.course_id=? GROUP BY s.id ORDER BY s.created_at DESC LIMIT ?`).all(courseId, limit).map((row: any) => ({
        ...row, attemptCount: Number(row.attemptCount), correctCount: Number(row.correctCount ?? 0),
      }));
  }

  recordAttempt(input: {
    courseId: string; attemptId?: string; conceptId: string; sessionId?: string | null; assessmentId?: string | null; activityType: string; prompt: string;
    response: string; reasoning: string; confidence?: number | null; hintCount: number;
    method: string; outcome: string; sourceRefs: unknown[]; independence: string; rationale: string;
  }) {
    const conceptExists = this.database.prepare("SELECT 1 FROM learner_concepts WHERE id = ? AND course_id = ?")
      .get(input.conceptId, input.courseId);
    const assessmentExists = !input.assessmentId || this.database.prepare("SELECT 1 FROM learner_assessments WHERE id = ? AND course_id = ?")
      .get(input.assessmentId, input.courseId);
    const assessmentTopicExists = !input.assessmentId || this.database.prepare(`SELECT 1 FROM learner_topics
      WHERE course_id=? AND assessment_id=? AND concept_id=?`).get(input.courseId, input.assessmentId, input.conceptId);
    const session = !input.sessionId || this.database.prepare("SELECT 1 FROM study_sessions WHERE id = ? AND course_id = ? AND concept_id = ?")
      .get(input.sessionId, input.courseId, input.conceptId);
    if (!conceptExists || !assessmentExists || !assessmentTopicExists || !session) throw new Error("Attempt references must belong to this class and the selected assessment scope.");
    const id = input.attemptId ?? randomUUID();
    const now = new Date().toISOString();
    this.database.exec("BEGIN IMMEDIATE");
    try {
      const existing = this.database.prepare(`SELECT id,session_id AS sessionId,concept_id AS conceptId,assessment_id AS assessmentId,
        activity_type AS activityType,prompt,response,reasoning,confidence,hint_count AS hintCount,method,outcome,source_refs_json AS sourceRefsJson,created_at AS createdAt
        FROM study_attempts WHERE course_id=? AND id=?`).get(input.courseId, id) as {
          id: string; sessionId: string | null; conceptId: string; assessmentId: string | null; activityType: string; prompt: string;
          response: string; reasoning: string; confidence: number | null; hintCount: number; method: string; outcome: string;
          sourceRefsJson: string; createdAt: string;
        } | undefined;
      if (existing) {
        const matches = existing.conceptId === input.conceptId
          && existing.sessionId === (input.sessionId ?? null)
          && existing.assessmentId === (input.assessmentId ?? null)
          && existing.activityType === input.activityType
          && existing.prompt === input.prompt
          && existing.response === input.response
          && existing.reasoning === input.reasoning
          && existing.confidence === (input.confidence ?? null)
          && existing.hintCount === input.hintCount
          && existing.method === input.method
          && existing.outcome === input.outcome
          && existing.sourceRefsJson === JSON.stringify(input.sourceRefs);
        if (!matches) throw new Error("This attempt ID was already used for a different answer.");
        this.database.exec("COMMIT");
        return { id: existing.id, sessionId: existing.sessionId, conceptId: existing.conceptId, assessmentId: existing.assessmentId, outcome: existing.outcome, createdAt: existing.createdAt };
      }
      this.database.prepare(`INSERT INTO study_attempts
        (id,session_id,concept_id,assessment_id,activity_type,prompt,response,reasoning,confidence,hint_count,method,outcome,source_refs_json,created_at,course_id)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
        id, input.sessionId ?? null, input.conceptId, input.assessmentId ?? null, input.activityType, input.prompt,
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
    return { id, sessionId: input.sessionId ?? null, conceptId: input.conceptId, assessmentId: input.assessmentId ?? null, outcome: input.outcome, createdAt: now };
  }

  getRecentAttempts(courseId: string, conceptId: string, limit = 5, assessmentId?: string) {
    return this.database.prepare(`SELECT a.id,a.session_id AS sessionId,a.concept_id AS conceptId,a.activity_type AS activityType,a.prompt,a.response,a.reasoning,a.confidence,
      a.hint_count AS hintCount,a.method,a.outcome,m.independence,a.created_at AS createdAt
      FROM study_attempts a JOIN mastery_evidence m ON m.attempt_id=a.id
      WHERE a.course_id=? AND a.concept_id=? AND (? IS NULL OR a.assessment_id=?) ORDER BY a.created_at DESC, a.rowid DESC LIMIT ?`)
      .all(courseId, conceptId, assessmentId ?? null, assessmentId ?? null, limit).map((row: any) => ({
        ...row,
        confidence: row.confidence == null ? null : Number(row.confidence),
        hintCount: Number(row.hintCount),
      }));
  }

  getSessionAttempts(courseId: string, sessionId: string) {
    return this.database.prepare(`SELECT a.id,a.session_id AS sessionId,a.concept_id AS conceptId,a.activity_type AS activityType,
      a.prompt,a.response,a.reasoning,a.confidence,a.hint_count AS hintCount,a.method,a.outcome,
      m.independence,a.created_at AS createdAt FROM study_attempts a
      JOIN mastery_evidence m ON m.attempt_id=a.id WHERE a.course_id=? AND a.session_id=? ORDER BY a.created_at`)
      .all(courseId, sessionId).map((row: any) => ({ ...row, confidence: row.confidence == null ? null : Number(row.confidence), hintCount: Number(row.hintCount) }));
  }

  getAttemptsForObsidianExport(courseId: string) {
    return this.database.prepare(`SELECT a.id,a.concept_id AS conceptId,c.title AS topic,a.assessment_id AS assessmentId,
      la.title AS assessmentTitle,a.activity_type AS activityType,a.prompt,a.response,a.reasoning,a.confidence,
      a.hint_count AS hintCount,a.method,a.outcome,COALESCE(e.independence,'unknown') AS independence,
      a.source_refs_json AS sourceRefsJson,json_extract(s.content_json,'$.sourceMaterialId') AS sessionSourceMaterialId,
      json_extract(s.content_json,'$.feedback') AS referenceExplanation,
      json_extract(s.content_json,'$.options') AS sessionOptionsJson,
      json_extract(s.content_json,'$.answerIndex') AS sessionAnswerIndex,
      a.created_at AS createdAt
      FROM study_attempts a JOIN learner_concepts c ON c.id=a.concept_id AND c.course_id=a.course_id
      LEFT JOIN learner_assessments la ON la.id=a.assessment_id AND la.course_id=a.course_id
      LEFT JOIN mastery_evidence e ON e.attempt_id=a.id AND e.course_id=a.course_id
      LEFT JOIN study_sessions s ON s.id=a.session_id AND s.course_id=a.course_id
      WHERE a.course_id=? ORDER BY a.created_at DESC,a.rowid DESC`).all(courseId).map((row: any) => {
      const sourceRefs = JSON.parse(row.sourceRefsJson) as Array<{ materialId?: string }>;
      const sessionOptions = typeof row.sessionOptionsJson === "string" ? JSON.parse(row.sessionOptionsJson) as unknown : [];
      const answerIndex = row.sessionAnswerIndex == null ? null : Number(row.sessionAnswerIndex);
      return {
        id: row.id as string, conceptId: row.conceptId as string, topic: row.topic as string,
        assessmentId: row.assessmentId as string | null, assessmentTitle: row.assessmentTitle as string | null,
        activityType: row.activityType as string, prompt: row.prompt as string, response: row.response as string,
        reasoning: row.reasoning as string, confidence: row.confidence == null ? null : Number(row.confidence),
        hintCount: Number(row.hintCount), method: row.method as string, outcome: row.outcome as string,
        independence: row.independence as string, createdAt: row.createdAt as string,
        correctAnswer: Array.isArray(sessionOptions) && Number.isInteger(answerIndex) && answerIndex! >= 0
          ? (typeof sessionOptions[answerIndex!] === "string" ? sessionOptions[answerIndex!] as string : null)
          : null,
        referenceExplanation: typeof row.referenceExplanation === "string" ? row.referenceExplanation : null,
        sourceMaterialIds: [...new Set([...sourceRefs.map(({ materialId }) => materialId).filter((id): id is string => Boolean(id)), row.sessionSourceMaterialId as string | null].filter((id): id is string => Boolean(id)))],
      };
    });
  }

  getPatternReviewAttempts(courseId: string, limit = 50) {
    return this.database.prepare(`SELECT a.id,a.session_id AS sessionId,a.concept_id AS conceptId,c.title AS conceptTitle,
      a.activity_type AS activityType,a.prompt,a.response,a.reasoning,a.confidence,a.hint_count AS hintCount,
      a.method,a.outcome,m.independence,a.created_at AS createdAt FROM study_attempts a
      JOIN learner_concepts c ON c.id=a.concept_id JOIN mastery_evidence m ON m.attempt_id=a.id
      WHERE a.course_id=? ORDER BY a.created_at DESC, a.rowid DESC LIMIT ?`).all(courseId, limit)
      .map((row: any) => ({ ...row, confidence: row.confidence == null ? null : Number(row.confidence), hintCount: Number(row.hintCount) }));
  }

  getLearnerPatterns(courseId: string) {
    return this.database.prepare(`SELECT id,pattern_key AS patternKey,payload_json AS payloadJson,learner_status AS learnerStatus,updated_at AS updatedAt
      FROM learner_patterns WHERE course_id=? ORDER BY updated_at DESC`).all(courseId).map((row: any) => ({
      id: row.id, patternKey: row.patternKey, ...JSON.parse(row.payloadJson),
      status: row.learnerStatus ?? JSON.parse(row.payloadJson).status, updatedAt: row.updatedAt,
    }));
  }

  getAttemptsByIds(courseId: string, attemptIds: string[]) {
    if (!attemptIds.length) return [];
    const placeholders = attemptIds.map(() => "?").join(",");
    return this.database.prepare(`SELECT a.id,a.concept_id AS conceptId,c.title AS conceptTitle,a.response,
      a.outcome,a.confidence,a.hint_count AS hintCount,a.method,a.created_at AS createdAt
      FROM study_attempts a JOIN learner_concepts c ON c.id=a.concept_id
      WHERE a.course_id=? AND a.id IN (${placeholders})`).all(courseId, ...attemptIds)
      .map((row: any) => ({ ...row, confidence: row.confidence == null ? null : Number(row.confidence), hintCount: Number(row.hintCount) }));
  }

  listPatternReviews(courseId: string, limit = 20) {
    return this.database.prepare(`SELECT id,trigger,result_json AS resultJson,model,created_at AS createdAt
      FROM learner_pattern_reviews WHERE course_id=? ORDER BY created_at DESC LIMIT ?`).all(courseId, limit)
      .map((row: any) => ({ id: row.id, trigger: row.trigger, ...JSON.parse(row.resultJson), model: row.model, createdAt: row.createdAt }));
  }

  savePatternReview(courseId: string, trigger: "session-end" | "user-request", result: LearnerPatternReviewResult, model: string) {
    const id = randomUUID(); const createdAt = new Date().toISOString();
    this.database.exec("BEGIN IMMEDIATE");
    try {
      this.database.prepare(`INSERT INTO learner_pattern_reviews (id,course_id,trigger,result_json,model,created_at) VALUES (?,?,?,?,?,?)`)
        .run(id, courseId, trigger, JSON.stringify(result), model, createdAt);
      const upsert = this.database.prepare(`INSERT INTO learner_patterns (id,course_id,pattern_key,review_id,payload_json,updated_at)
        VALUES (?,?,?,?,?,?) ON CONFLICT(course_id,pattern_key) DO UPDATE SET
        review_id=excluded.review_id,payload_json=excluded.payload_json,updated_at=excluded.updated_at`);
      for (const pattern of result.proposals) upsert.run(randomUUID(), courseId, pattern.patternKey, id, JSON.stringify(pattern), createdAt);
      this.database.exec("COMMIT");
    } catch (error) { this.database.exec("ROLLBACK"); throw error; }
    return { id, ...result, model, createdAt };
  }

  setPatternStatus(courseId: string, patternId: string, status: "emerging" | "reinforced" | "mixed" | "weakened" | "dismissed") {
    const result = this.database.prepare("UPDATE learner_patterns SET learner_status=?,updated_at=? WHERE course_id=? AND id=?")
      .run(status, new Date().toISOString(), courseId, patternId);
    return Number(result.changes) > 0;
  }

  getProfile(courseId: string): LearnerProfileResponse {
    const sources = this.database.prepare(`SELECT m.id AS materialId,m.original_name AS title,m.kind,m.media_type AS mediaType,
      COUNT(DISTINCT a.id) AS attemptCount,
      COUNT(DISTINCT CASE WHEN a.outcome IN ('correct','incorrect') THEN a.id END) AS scoredAttemptCount,
      COUNT(DISTINCT CASE WHEN a.outcome='correct' THEN a.id END) AS correctCount,
      COUNT(DISTINCT a.concept_id) AS topicCount,
      COUNT(DISTINCT a.concept_id) AS practicedTopicCount,
      MAX(a.created_at) AS lastPracticedAt,
      (SELECT COUNT(*) FROM study_sessions s WHERE s.course_id=m.course_id AND ${sourceSessionMatches("s", "m")}) AS sessionCount,
      (SELECT MAX(s.created_at) FROM study_sessions s WHERE s.course_id=m.course_id AND ${sourceSessionMatches("s", "m")}) AS lastSessionAt
      FROM materials m
      LEFT JOIN study_attempts a ON a.course_id=m.course_id AND (
        EXISTS (SELECT 1 FROM json_each(a.source_refs_json) ref WHERE json_extract(ref.value,'$.materialId')=m.id)
        OR EXISTS (SELECT 1 FROM study_sessions s WHERE s.id=a.session_id AND s.course_id=m.course_id AND ${sourceSessionMatches("s", "m")})
      )
      WHERE m.course_id=? GROUP BY m.id ORDER BY m.created_at`).all(courseId) as any[];
    const sourceTopics = this.database.prepare(`SELECT m.id AS materialId,c.id AS conceptId,c.title,
      (SELECT COUNT(*) FROM study_attempts a WHERE a.course_id=m.course_id AND a.concept_id=c.id AND (
        EXISTS (SELECT 1 FROM json_each(a.source_refs_json) ref WHERE json_extract(ref.value,'$.materialId')=m.id)
        OR EXISTS (SELECT 1 FROM study_sessions s WHERE s.id=a.session_id AND s.course_id=m.course_id AND ${sourceSessionMatches("s", "m")})
      )) AS attemptCount,
      (SELECT COUNT(*) FROM study_attempts a WHERE a.course_id=m.course_id AND a.concept_id=c.id AND a.outcome IN ('correct','incorrect') AND (
        EXISTS (SELECT 1 FROM json_each(a.source_refs_json) ref WHERE json_extract(ref.value,'$.materialId')=m.id)
        OR EXISTS (SELECT 1 FROM study_sessions s WHERE s.id=a.session_id AND s.course_id=m.course_id AND ${sourceSessionMatches("s", "m")})
      )) AS scoredAttemptCount,
      (SELECT COUNT(*) FROM study_attempts a WHERE a.course_id=m.course_id AND a.concept_id=c.id AND a.outcome='correct' AND (
        EXISTS (SELECT 1 FROM json_each(a.source_refs_json) ref WHERE json_extract(ref.value,'$.materialId')=m.id)
        OR EXISTS (SELECT 1 FROM study_sessions s WHERE s.id=a.session_id AND s.course_id=m.course_id AND ${sourceSessionMatches("s", "m")})
      )) AS correctCount,
      (SELECT outcome FROM study_attempts a WHERE a.course_id=m.course_id AND a.concept_id=c.id AND (
        EXISTS (SELECT 1 FROM json_each(a.source_refs_json) ref WHERE json_extract(ref.value,'$.materialId')=m.id)
        OR EXISTS (SELECT 1 FROM study_sessions s WHERE s.id=a.session_id AND s.course_id=m.course_id AND ${sourceSessionMatches("s", "m")})
      ) ORDER BY a.created_at DESC, a.rowid DESC LIMIT 1) AS latestOutcome,
      (SELECT MAX(a.created_at) FROM study_attempts a WHERE a.course_id=m.course_id AND a.concept_id=c.id AND (
        EXISTS (SELECT 1 FROM json_each(a.source_refs_json) ref WHERE json_extract(ref.value,'$.materialId')=m.id)
        OR EXISTS (SELECT 1 FROM study_sessions s WHERE s.id=a.session_id AND s.course_id=m.course_id AND ${sourceSessionMatches("s", "m")})
      )) AS lastPracticedAt,
      (SELECT COUNT(*) FROM study_sessions s WHERE s.course_id=m.course_id AND s.concept_id=c.id AND ${sourceSessionMatches("s", "m")}) AS sessionCount,
      (SELECT MAX(s.created_at) FROM study_sessions s WHERE s.course_id=m.course_id AND s.concept_id=c.id AND ${sourceSessionMatches("s", "m")}) AS lastSessionAt
      FROM materials m JOIN learner_concepts c ON c.course_id=m.course_id
      WHERE m.course_id=? AND (
        EXISTS (SELECT 1 FROM study_sessions s WHERE s.course_id=m.course_id AND s.concept_id=c.id AND ${sourceSessionMatches("s", "m")})
        OR EXISTS (SELECT 1 FROM study_attempts a WHERE a.course_id=m.course_id AND a.concept_id=c.id AND (
          EXISTS (SELECT 1 FROM json_each(a.source_refs_json) ref WHERE json_extract(ref.value,'$.materialId')=m.id)
          OR EXISTS (SELECT 1 FROM study_sessions s WHERE s.id=a.session_id AND s.course_id=m.course_id AND ${sourceSessionMatches("s", "m")})
        ))
      )`).all(courseId) as any[];
    const assessmentRows = this.database.prepare(`SELECT id,title,instructor_text AS instructorText,kind,scheduled_at AS scheduledAt,
      available_minutes AS availableMinutes,daily_minutes AS dailyMinutes,created_at AS createdAt,
      (SELECT COUNT(*) FROM study_attempts a WHERE a.course_id=learner_assessments.course_id AND a.assessment_id=learner_assessments.id) AS attemptCount,
      (SELECT COUNT(*) FROM study_attempts a WHERE a.course_id=learner_assessments.course_id AND a.assessment_id=learner_assessments.id AND a.outcome IN ('correct','incorrect')) AS scoredAttemptCount,
      (SELECT COUNT(*) FROM study_attempts a WHERE a.course_id=learner_assessments.course_id AND a.assessment_id=learner_assessments.id AND a.outcome='correct') AS correctCount,
      (SELECT COUNT(*) FROM study_sessions s WHERE s.course_id=learner_assessments.course_id AND json_extract(s.content_json,'$.assessmentId')=learner_assessments.id) AS sessionCount,
      (SELECT MAX(s.created_at) FROM study_sessions s WHERE s.course_id=learner_assessments.course_id AND json_extract(s.content_json,'$.assessmentId')=learner_assessments.id) AS lastSessionAt
      FROM learner_assessments WHERE course_id = ? ORDER BY scheduled_at,created_at`).all(courseId) as any[];
    const topics = this.database.prepare(`SELECT t.id,t.assessment_id AS assessmentId,t.concept_id AS conceptId,t.title,t.position,t.importance,t.provenance,
      (SELECT COUNT(*) FROM study_attempts a WHERE a.course_id=t.course_id AND a.assessment_id=t.assessment_id AND a.concept_id=t.concept_id) AS attemptCount,
      (SELECT COUNT(*) FROM study_attempts a WHERE a.course_id=t.course_id AND a.assessment_id=t.assessment_id AND a.concept_id=t.concept_id AND a.outcome IN ('correct','incorrect')) AS scoredAttemptCount,
      (SELECT COUNT(*) FROM study_attempts a WHERE a.course_id=t.course_id AND a.assessment_id=t.assessment_id AND a.concept_id=t.concept_id AND a.outcome='correct') AS correctCount,
      (SELECT outcome FROM study_attempts a WHERE a.course_id=t.course_id AND a.assessment_id=t.assessment_id AND a.concept_id=t.concept_id ORDER BY a.created_at DESC, a.rowid DESC LIMIT 1) AS latestOutcome,
      (SELECT MAX(a.created_at) FROM study_attempts a WHERE a.course_id=t.course_id AND a.assessment_id=t.assessment_id AND a.concept_id=t.concept_id) AS lastPracticedAt,
      (SELECT COUNT(*) FROM study_sessions s WHERE s.course_id=t.course_id AND s.concept_id=t.concept_id AND json_extract(s.content_json,'$.assessmentId')=t.assessment_id) AS sessionCount,
      (SELECT MAX(s.created_at) FROM study_sessions s WHERE s.course_id=t.course_id AND s.concept_id=t.concept_id AND json_extract(s.content_json,'$.assessmentId')=t.assessment_id) AS lastSessionAt
      FROM learner_topics t WHERE course_id = ? ORDER BY assessment_id,position`).all(courseId) as any[];
    const concepts = this.database.prepare(`SELECT c.id,c.stable_key AS stableKey,c.title,c.description,
      COUNT(a.id) AS attemptCount,SUM(CASE WHEN a.outcome='correct' THEN 1 ELSE 0 END) AS correctCount,
      SUM(CASE WHEN a.outcome IN ('correct','incorrect') THEN 1 ELSE 0 END) AS scoredAttemptCount,
      (SELECT outcome FROM study_attempts WHERE concept_id=c.id ORDER BY created_at DESC, rowid DESC LIMIT 1) AS latestOutcome,
      MAX(a.created_at) AS lastPracticedAt,
      (SELECT COUNT(*) FROM study_sessions s WHERE s.course_id=c.course_id AND s.concept_id=c.id) AS sessionCount,
      (SELECT MAX(s.created_at) FROM study_sessions s WHERE s.course_id=c.course_id AND s.concept_id=c.id) AS lastSessionAt
      FROM learner_concepts c LEFT JOIN study_attempts a ON a.concept_id=c.id
      WHERE c.course_id = ? GROUP BY c.id ORDER BY c.title`).all(courseId) as any[];
    return {
      sources: sources.map((source) => ({ ...source,
        attemptCount: Number(source.attemptCount), scoredAttemptCount: Number(source.scoredAttemptCount), correctCount: Number(source.correctCount ?? 0),
        sessionCount: Number(source.sessionCount),
        topicCount: Number(source.topicCount), practicedTopicCount: Number(source.practicedTopicCount),
        topics: sourceTopics.filter((topic) => topic.materialId === source.materialId).map(({ materialId: _materialId, ...topic }) => ({
          ...topic, attemptCount: Number(topic.attemptCount), scoredAttemptCount: Number(topic.scoredAttemptCount), correctCount: Number(topic.correctCount ?? 0), sessionCount: Number(topic.sessionCount),
        })),
      })),
      assessments: assessmentRows.map((row) => ({
        ...row, availableMinutes: row.availableMinutes == null ? null : Number(row.availableMinutes), dailyMinutes: Number(row.dailyMinutes),
        attemptCount: Number(row.attemptCount), scoredAttemptCount: Number(row.scoredAttemptCount), correctCount: Number(row.correctCount), sessionCount: Number(row.sessionCount),
        topics: topics.filter((topic) => topic.assessmentId === row.id).map(({ assessmentId: _assessmentId, ...topic }) => ({
          ...topic, position: Number(topic.position), attemptCount: Number(topic.attemptCount), scoredAttemptCount: Number(topic.scoredAttemptCount), correctCount: Number(topic.correctCount), sessionCount: Number(topic.sessionCount),
        })),
      })),
      concepts: concepts.map((row) => ({ ...row, attemptCount: Number(row.attemptCount), scoredAttemptCount: Number(row.scoredAttemptCount ?? 0), correctCount: Number(row.correctCount ?? 0), sessionCount: Number(row.sessionCount) })),
    };
  }

  getMethodProgress(courseId: string): LearnerMethodProgressResponse {
    const canonicalMethod = "CASE WHEN method IN ('quiz','retrieval-practice') THEN 'retrieval-practice' ELSE method END";
    const rows = this.database.prepare(`SELECT ${canonicalMethod} AS method,COUNT(*) AS attemptCount,
      SUM(CASE WHEN a.outcome IN ('correct','incorrect') THEN 1 ELSE 0 END) AS scoredAttemptCount,
      SUM(CASE WHEN a.outcome IN ('correct','incorrect') AND m.independence='independent' THEN 1 ELSE 0 END) AS independentScoredAttemptCount,
      SUM(CASE WHEN a.outcome='correct' AND m.independence='independent' THEN 1 ELSE 0 END) AS independentCorrectCount,
      SUM(CASE WHEN a.outcome IN ('correct','incorrect') AND m.independence='hinted' THEN 1 ELSE 0 END) AS hintedScoredAttemptCount,
      SUM(CASE WHEN a.outcome='correct' AND m.independence='hinted' THEN 1 ELSE 0 END) AS hintedCorrectCount,
      SUM(CASE WHEN a.outcome IN ('correct','incorrect') AND m.independence='assisted' THEN 1 ELSE 0 END) AS assistedScoredAttemptCount,
      SUM(CASE WHEN a.outcome='correct' AND m.independence='assisted' THEN 1 ELSE 0 END) AS assistedCorrectCount,
      SUM(CASE WHEN a.outcome IN ('correct','incorrect') AND (m.independence IS NULL OR m.independence='unknown') THEN 1 ELSE 0 END) AS unknownIndependenceScoredAttemptCount,
      SUM(CASE WHEN a.outcome='correct' AND (m.independence IS NULL OR m.independence='unknown') THEN 1 ELSE 0 END) AS unknownIndependenceCorrectCount,
      SUM(CASE WHEN a.outcome IN ('correct','incorrect') AND a.confidence IS NOT NULL THEN 1 ELSE 0 END) AS confidenceRatedAttemptCount,
      AVG(CASE WHEN a.outcome IN ('correct','incorrect') AND a.confidence IS NOT NULL THEN ABS(a.confidence - CASE WHEN a.outcome='correct' THEN 1.0 ELSE 0.0 END) END) AS meanConfidenceGap,
      SUM(CASE WHEN a.outcome='correct' THEN 1 ELSE 0 END) AS correctCount,
      COUNT(DISTINCT a.concept_id) AS topicCount,
      json_group_array(DISTINCT c.title) AS topicTitlesJson,
      SUM(CASE WHEN a.outcome='incorrect' AND a.confidence>=0.75 THEN 1 ELSE 0 END) AS highConfidenceMissCount,
      SUM(CASE WHEN a.outcome='correct' AND a.confidence<=0.5 THEN 1 ELSE 0 END) AS lowConfidenceCorrectCount,
      MAX(a.created_at) AS lastPracticedAt
      FROM study_attempts a LEFT JOIN mastery_evidence m ON m.attempt_id=a.id AND m.course_id=a.course_id LEFT JOIN learner_concepts c ON c.id=a.concept_id AND c.course_id=a.course_id
      WHERE a.course_id=? AND trim(a.method)!=''
      GROUP BY ${canonicalMethod} ORDER BY attemptCount DESC,method`).all(courseId).map((row: any) => ({
      ...row,
      topicTitles: (JSON.parse(row.topicTitlesJson) as unknown[]).filter((title): title is string => typeof title === "string").sort((left, right) => left.localeCompare(right)),
    }));
    const topicRows = this.database.prepare(`SELECT ${canonicalMethod} AS method,a.concept_id AS conceptId,
      COALESCE(c.title,'Unlabeled topic') AS title,COUNT(*) AS attemptCount,
      SUM(CASE WHEN a.outcome IN ('correct','incorrect') THEN 1 ELSE 0 END) AS scoredAttemptCount,
      SUM(CASE WHEN a.outcome IN ('correct','incorrect') AND m.independence='independent' THEN 1 ELSE 0 END) AS independentScoredAttemptCount,
      SUM(CASE WHEN a.outcome='correct' AND m.independence='independent' THEN 1 ELSE 0 END) AS independentCorrectCount,
      SUM(CASE WHEN a.outcome IN ('correct','incorrect') AND m.independence='hinted' THEN 1 ELSE 0 END) AS hintedScoredAttemptCount,
      SUM(CASE WHEN a.outcome='correct' AND m.independence='hinted' THEN 1 ELSE 0 END) AS hintedCorrectCount,
      SUM(CASE WHEN a.outcome IN ('correct','incorrect') AND m.independence='assisted' THEN 1 ELSE 0 END) AS assistedScoredAttemptCount,
      SUM(CASE WHEN a.outcome='correct' AND m.independence='assisted' THEN 1 ELSE 0 END) AS assistedCorrectCount,
      SUM(CASE WHEN a.outcome IN ('correct','incorrect') AND (m.independence IS NULL OR m.independence='unknown') THEN 1 ELSE 0 END) AS unknownIndependenceScoredAttemptCount,
      SUM(CASE WHEN a.outcome='correct' AND (m.independence IS NULL OR m.independence='unknown') THEN 1 ELSE 0 END) AS unknownIndependenceCorrectCount,
      SUM(CASE WHEN a.outcome='correct' THEN 1 ELSE 0 END) AS correctCount,
      SUM(CASE WHEN a.outcome IN ('correct','incorrect') AND a.confidence IS NOT NULL THEN 1 ELSE 0 END) AS confidenceRatedAttemptCount,
      AVG(CASE WHEN a.outcome IN ('correct','incorrect') AND a.confidence IS NOT NULL THEN ABS(a.confidence - CASE WHEN a.outcome='correct' THEN 1.0 ELSE 0.0 END) END) AS meanConfidenceGap,
      MAX(a.created_at) AS lastPracticedAt
      FROM study_attempts a LEFT JOIN mastery_evidence m ON m.attempt_id=a.id AND m.course_id=a.course_id LEFT JOIN learner_concepts c ON c.id=a.concept_id AND c.course_id=a.course_id
      WHERE a.course_id=? AND trim(a.method)!=''
      GROUP BY ${canonicalMethod},a.concept_id ORDER BY method,title`).all(courseId) as any[];
    const topicProgressByMethod = new Map<string, typeof topicRows>();
    for (const row of topicRows) topicProgressByMethod.set(row.method, [...(topicProgressByMethod.get(row.method) ?? []), row]);

    return rows.map((row: any) => ({
      method: row.method,
      attemptCount: Number(row.attemptCount),
      scoredAttemptCount: Number(row.scoredAttemptCount),
      independentScoredAttemptCount: Number(row.independentScoredAttemptCount),
      independentCorrectCount: Number(row.independentCorrectCount),
      hintedScoredAttemptCount: Number(row.hintedScoredAttemptCount),
      hintedCorrectCount: Number(row.hintedCorrectCount),
      assistedScoredAttemptCount: Number(row.assistedScoredAttemptCount),
      assistedCorrectCount: Number(row.assistedCorrectCount),
      unknownIndependenceScoredAttemptCount: Number(row.unknownIndependenceScoredAttemptCount),
      unknownIndependenceCorrectCount: Number(row.unknownIndependenceCorrectCount),
      confidenceRatedAttemptCount: Number(row.confidenceRatedAttemptCount),
      meanConfidenceGap: row.meanConfidenceGap == null ? null : Number(row.meanConfidenceGap),
      correctCount: Number(row.correctCount),
      topicCount: Number(row.topicCount),
      topicTitles: row.topicTitles,
      topicProgress: (topicProgressByMethod.get(row.method) ?? []).map((topic: any) => ({
        conceptId: topic.conceptId ?? null,
        title: topic.title,
        attemptCount: Number(topic.attemptCount),
        scoredAttemptCount: Number(topic.scoredAttemptCount),
        independentScoredAttemptCount: Number(topic.independentScoredAttemptCount),
        independentCorrectCount: Number(topic.independentCorrectCount),
        hintedScoredAttemptCount: Number(topic.hintedScoredAttemptCount),
        hintedCorrectCount: Number(topic.hintedCorrectCount),
        assistedScoredAttemptCount: Number(topic.assistedScoredAttemptCount),
        assistedCorrectCount: Number(topic.assistedCorrectCount),
        unknownIndependenceScoredAttemptCount: Number(topic.unknownIndependenceScoredAttemptCount),
        unknownIndependenceCorrectCount: Number(topic.unknownIndependenceCorrectCount),
        correctCount: Number(topic.correctCount),
        confidenceRatedAttemptCount: Number(topic.confidenceRatedAttemptCount),
        meanConfidenceGap: topic.meanConfidenceGap == null ? null : Number(topic.meanConfidenceGap),
        lastPracticedAt: topic.lastPracticedAt,
      })),
      highConfidenceMissCount: Number(row.highConfidenceMissCount),
      lowConfidenceCorrectCount: Number(row.lowConfidenceCorrectCount),
      lastPracticedAt: row.lastPracticedAt,
    }));
  }
}
