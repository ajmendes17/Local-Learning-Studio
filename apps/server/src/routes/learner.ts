import {
  LearnerAssessmentCreateSchema,
  LearnerConceptCreateSchema,
  LearnerProfileResponseSchema,
  StudyClarificationRequestSchema,
  StudyClarificationResponseSchema,
  StudySessionContentSchema,
  StudySessionGenerationContentSchema,
  StudySessionRecordSchema,
  StudySessionRequestSchema,
  StudyQuestionSchema,
  StudyAttemptCreateSchema,
} from "@local-learning-studio/contracts";
import type { FastifyInstance } from "fastify";
import type { LearnerLibrary } from "../storage/learner-library.js";
import type { CourseLibrary } from "../storage/course-library.js";
import { z } from "zod";

export async function registerLearnerRoutes(app: FastifyInstance, options: {
  learner: LearnerLibrary;
  courses: CourseLibrary;
  codex: { run<T>(task: "compose-study-lesson" | "explain-course-concept" | "generate-adaptive-practice", prompt: string, schema: import("zod").ZodType<T>): Promise<{ output: T }> };
}) {
  const paramsSchema = z.object({ courseId: z.string().uuid() });
  const courseIdFor = (raw: unknown) => {
    const parsed = paramsSchema.safeParse(raw);
    if (!parsed.success || !options.courses.getCourse(parsed.data.courseId)) return null;
    return parsed.data.courseId;
  };

  app.get<{ Params: { courseId: string } }>("/api/courses/:courseId/learner/profile", async (request, reply) => {
    const courseId = courseIdFor(request.params);
    if (!courseId) return reply.code(404).send({ error: "Class not found." });
    return LearnerProfileResponseSchema.parse(options.learner.getProfile(courseId));
  });

  app.get<{ Params: { courseId: string } }>("/api/courses/:courseId/learner/study-sessions", async (request, reply) => {
    const courseId = courseIdFor(request.params);
    if (!courseId) return reply.code(404).send({ error: "Class not found." });
    return options.learner.listStudySessions(courseId);
  });

  app.get<{ Params: { courseId: string; sessionId: string } }>("/api/courses/:courseId/learner/study-sessions/:sessionId", async (request, reply) => {
    const courseId = courseIdFor(request.params);
    const sessionId = z.string().uuid().safeParse(request.params.sessionId);
    if (!courseId || !sessionId.success) return reply.code(404).send({ error: "Study session not found." });
    const session = options.learner.getStudySession(courseId, sessionId.data);
    if (!session) return reply.code(404).send({ error: "Study session not found in this class." });
    return StudySessionRecordSchema.parse(session);
  });

  app.post<{ Params: { courseId: string } }>("/api/courses/:courseId/learner/assessments", async (request, reply) => {
    const courseId = courseIdFor(request.params);
    if (!courseId) return reply.code(404).send({ error: "Class not found." });
    const parsed = LearnerAssessmentCreateSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: "Assessment details are invalid.", issues: parsed.error.issues });
    try {
      return reply.code(201).send(options.learner.createAssessment(courseId, parsed.data));
    } catch {
      return reply.code(422).send({ error: "A topic references a concept that does not exist." });
    }
  });

  app.post<{ Params: { courseId: string } }>("/api/courses/:courseId/learner/concepts", async (request, reply) => {
    const courseId = courseIdFor(request.params);
    if (!courseId) return reply.code(404).send({ error: "Class not found." });
    const parsed = LearnerConceptCreateSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: "Concept details are invalid.", issues: parsed.error.issues });
    try {
      return reply.code(201).send(options.learner.createConcept(courseId, parsed.data));
    } catch {
      return reply.code(409).send({ error: "That stable concept key is already in use." });
    }
  });

  app.post<{ Params: { courseId: string } }>("/api/courses/:courseId/learner/attempts", async (request, reply) => {
    const courseId = courseIdFor(request.params);
    if (!courseId) return reply.code(404).send({ error: "Class not found." });
    const parsed = StudyAttemptCreateSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: "Study attempt is invalid.", issues: parsed.error.issues });
    try {
      return reply.code(201).send(options.learner.recordAttempt({ ...parsed.data, courseId }));
    } catch {
      return reply.code(422).send({ error: "The attempt references an unknown concept or assessment." });
    }
  });

  app.post<{ Params: { courseId: string } }>("/api/courses/:courseId/learner/study-session", async (request, reply) => {
    const courseId = courseIdFor(request.params);
    if (!courseId) return reply.code(404).send({ error: "Class not found." });
    const parsed = StudySessionRequestSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: "Study request is invalid." });
    const concept = options.learner.ensureConcept(courseId, parsed.data.topic);
    try {
      const result = await options.codex.run("compose-study-lesson", [
        "Use $compose-study-lesson for a direct study session.",
        "Teach from reliable general knowledge when no course passages are supplied. Clearly mark that content as not verified against the learner's course.",
        "Return one concise lesson, an optional worked example, one four-option knowledge check, the correct option index, concise immediate feedback, a clarification answer, and one or two progressive hints that do not reveal the answer.",
        "Adapt the requested method. Never say the learner has mastered the topic based on this generated lesson.",
        "INPUT_JSON", JSON.stringify({ className: options.courses.getCourse(courseId)?.title, topic: parsed.data.topic, method: parsed.data.method, learnerProfile: options.learner.getProfile(courseId).concepts.find((item) => item.id === concept.id) ?? null }),
      ].join("\n\n"), StudySessionGenerationContentSchema);
      const content = StudySessionContentSchema.parse({ ...result.output, conceptId: concept.id, topic: parsed.data.topic, method: parsed.data.method });
      return StudySessionRecordSchema.parse(options.learner.saveStudySession(courseId, concept.id, content));
    } catch (error) {
      if (error instanceof Error && error.name === "CodexRunError") {
        return reply.code(503).send({ error: error.message });
      }
      throw error;
    }
  });

  app.post<{ Params: { courseId: string; sessionId: string } }>("/api/courses/:courseId/learner/study-sessions/:sessionId/next-question", async (request, reply) => {
    const courseId = courseIdFor(request.params);
    const sessionId = z.string().uuid().safeParse(request.params.sessionId);
    if (!courseId || !sessionId.success) return reply.code(404).send({ error: "Study session not found." });
    const session = options.learner.getStudySession(courseId, sessionId.data);
    if (!session) return reply.code(404).send({ error: "Study session not found in this class." });
    const recentAttempts = options.learner.getRecentAttempts(courseId, session.conceptId, 5);
    try {
      const result = await options.codex.run("generate-adaptive-practice", [
        "Use $generate-adaptive-practice to create exactly one new multiple-choice question for this same concept.",
        "Use the attempt history to target likely uncertainty. Change the surface form or reasoning path; do not repeat any prior question or simply paraphrase its choices.",
        "Return a compact question, 2 to 6 plausible options, a validated correct option index, concise corrective feedback, and up to two progressive hints that do not reveal the answer.",
        "No course source passages are provided, so the question uses general knowledge and remains unverified against course materials.",
        "INPUT_JSON", JSON.stringify({
          className: options.courses.getCourse(courseId)?.title,
          concept: { id: session.conceptId, title: session.topic },
          learningMethod: session.method,
          recentAttempts,
          previousQuestion: session.question,
        }),
      ].join("\n\n"), StudyQuestionSchema);
      const question = StudyQuestionSchema.parse(result.output);
      const { sessionId: _oldSessionId, createdAt: _oldCreatedAt, ...sessionContent } = session;
      const nextSession = StudySessionRecordSchema.parse(options.learner.saveStudySession(courseId, session.conceptId, {
        ...sessionContent,
        ...question,
      }));
      return nextSession;
    } catch (error) {
      if (error instanceof Error && error.name === "CodexRunError") return reply.code(503).send({ error: error.message });
      throw error;
    }
  });

  app.post<{ Params: { courseId: string } }>("/api/courses/:courseId/learner/clarify", async (request, reply) => {
    const courseId = courseIdFor(request.params);
    if (!courseId) return reply.code(404).send({ error: "Class not found." });
    const parsed = StudyClarificationRequestSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: "Clarification request is invalid." });
    if (!options.learner.getProfile(courseId).concepts.some(({ id }) => id === parsed.data.conceptId)) {
      return reply.code(404).send({ error: "Concept not found in this class." });
    }
    try {
      const result = await options.codex.run("explain-course-concept", [
        "Use $explain-course-concept to answer this learner's side-chat question.",
        "No course passages are supplied, so use general knowledge and say the answer has not been checked against their course materials.",
        "Answer the actual question clearly, connect it to the current topic, and offer one useful follow-up.",
        "INPUT_JSON", JSON.stringify(parsed.data),
      ].join("\n\n"), StudyClarificationResponseSchema);
      return StudyClarificationResponseSchema.parse(result.output);
    } catch (error) {
      if (error instanceof Error && error.name === "CodexRunError") {
        return reply.code(503).send({ error: error.message });
      }
      throw error;
    }
  });
}
