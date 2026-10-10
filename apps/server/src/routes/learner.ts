import {
  LearnerAssessmentCreateSchema,
  LearnerAssessmentUpdateSchema,
  LearnerAssessmentTopicsAppendSchema,
  LearnerAssessmentTopicImportanceUpdateSchema,
  LearnerConceptCreateSchema,
  LearnerProfileResponseSchema,
  LearnerMethodProgressResponseSchema,
  StudyClarificationRequestSchema,
  StudyClarificationResponseSchema,
  StudySessionContentSchema,
  StudySessionGenerationContentSchema,
  StudySessionRecordSchema,
  StudySessionRequestSchema,
  StudyQuestionSchema,
  StudyFreeRecallQuestionSchema,
  StudyAttemptCreateSchema,
  LearnerPatternReviewResultSchema,
  LearnerPatternReviewTriggerSchema,
  type LearnerPatternReviewResult,
  type CodexTask,
  type CourseMapProposal,
} from "@local-learning-studio/contracts";
import type { FastifyInstance } from "fastify";
import type { LearnerLibrary } from "../storage/learner-library.js";
import type { CourseLibrary } from "../storage/course-library.js";
import type { SourceLibrary } from "../storage/source-library.js";
import type { LearningArtifactLibrary } from "../storage/learning-artifact-library.js";
import { z } from "zod";

function acceptedContrastTopics(map: CourseMapProposal | null, rawTopic: string) {
  if (!map) return [];
  const keyFor = (value: string) => value.trim().normalize("NFKC").toLocaleLowerCase();
  const focus = map.concepts.find((concept) => keyFor(concept.title) === keyFor(rawTopic));
  if (!focus) return [];
  const concepts = new Map(map.concepts.map((concept) => [concept.key, concept]));
  const candidates = new Map<string, { title: string; relationship: string; description: string; learningObjectives: string[] }>();
  for (const module of map.modules.filter((item) => item.conceptKeys.includes(focus.key))) {
    for (const relatedKey of module.conceptKeys) {
      if (relatedKey === focus.key || candidates.has(relatedKey)) continue;
      const related = concepts.get(relatedKey);
      if (related) candidates.set(relatedKey, {
        title: related.title,
        relationship: `same accepted module: ${module.title}`,
        description: related.description,
        learningObjectives: related.learningObjectives.slice(0, 3),
      });
    }
  }
  for (const related of map.concepts) {
    if (related.key === focus.key || candidates.has(related.key)) continue;
    if (focus.prerequisiteKeys.includes(related.key)) {
      candidates.set(related.key, { title: related.title, relationship: "accepted prerequisite", description: related.description, learningObjectives: related.learningObjectives.slice(0, 3) });
    } else if (related.prerequisiteKeys.includes(focus.key)) {
      candidates.set(related.key, { title: related.title, relationship: "accepted follow-on concept", description: related.description, learningObjectives: related.learningObjectives.slice(0, 3) });
    }
  }
  return [...candidates.values()].slice(0, 6);
}

export async function registerLearnerRoutes(app: FastifyInstance, options: {
  learner: LearnerLibrary;
  artifacts: LearningArtifactLibrary;
  courses: CourseLibrary;
  sources: SourceLibrary;
  codex: { run<T>(task: CodexTask, prompt: string, schema: import("zod").ZodType<T>): Promise<{ output: T; model?: string }> };
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

  app.get<{ Params: { courseId: string } }>("/api/courses/:courseId/learner/method-progress", async (request, reply) => {
    const courseId = courseIdFor(request.params);
    if (!courseId) return reply.code(404).send({ error: "Class not found." });
    return LearnerMethodProgressResponseSchema.parse(options.learner.getMethodProgress(courseId));
  });

  app.get<{ Params: { courseId: string } }>("/api/courses/:courseId/learner/patterns", async (request, reply) => {
    const courseId = courseIdFor(request.params);
    if (!courseId) return reply.code(404).send({ error: "Class not found." });
    const patterns = options.learner.getLearnerPatterns(courseId).map((pattern: any) => {
      const evidence = options.learner.getAttemptsByIds(courseId, [...pattern.supportingAttemptIds, ...pattern.counterexampleAttemptIds]);
      return {
        ...pattern,
        supportingEvidence: evidence.filter(({ id }: { id: string }) => pattern.supportingAttemptIds.includes(id)),
        counterexampleEvidence: evidence.filter(({ id }: { id: string }) => pattern.counterexampleAttemptIds.includes(id)),
      };
    });
    return { patterns, reviews: options.learner.listPatternReviews(courseId) };
  });

  app.patch<{ Params: { courseId: string; patternId: string } }>("/api/courses/:courseId/learner/patterns/:patternId", async (request, reply) => {
    const courseId = courseIdFor(request.params);
    const patternId = z.string().uuid().safeParse(request.params.patternId);
    const body = z.object({ status: z.enum(["emerging", "reinforced", "mixed", "weakened", "dismissed"]) }).safeParse(request.body);
    if (!courseId) return reply.code(404).send({ error: "Class not found." });
    if (!patternId.success || !body.success) return reply.code(400).send({ error: "Pattern update is invalid." });
    if (!options.learner.setPatternStatus(courseId, patternId.data, body.data.status)) return reply.code(404).send({ error: "Pattern not found in this class." });
    return { patterns: options.learner.getLearnerPatterns(courseId) };
  });

  app.post<{ Params: { courseId: string } }>("/api/courses/:courseId/learner/pattern-reviews", async (request, reply) => {
    const courseId = courseIdFor(request.params);
    if (!courseId) return reply.code(404).send({ error: "Class not found." });
    const triggerData = LearnerPatternReviewTriggerSchema.safeParse(request.body);
    if (!triggerData.success) return reply.code(400).send({ error: "Pattern review trigger is invalid." });
    const { trigger } = triggerData.data;
    const attempts = trigger === "session-end"
      ? options.learner.getSessionAttempts(courseId, triggerData.data.sessionId)
      : options.learner.getPatternReviewAttempts(courseId, 50);
    if (!attempts.length) return reply.code(422).send({ error: trigger === "session-end" ? "This session has no saved attempts to review." : "Save at least one study attempt before requesting a review." });
    const attemptIds = attempts.map(({ id }) => id);
    const priorPatterns = options.learner.getLearnerPatterns(courseId);
    const input = {
      schemaVersion: "learner-pattern-review.v1" as const,
      trigger,
      courseId,
      requestedAt: new Date().toISOString(),
      conceptIds: [...new Set(attempts.map(({ conceptId }) => conceptId))],
      attemptIds,
      priorPatternIds: priorPatterns.map(({ id }) => id),
    };
    try {
      const generated = await options.codex.run("review-learning-patterns", [
        "Use $review-learning-patterns for this explicit learner-requested or session-end review.",
        "Review only the one class and bounded attempt history supplied below. Return provisional observations with evidence sufficiency. Never infer fixed learning styles or treat sparse evidence as a stable trait.",
        "INPUT_JSON", JSON.stringify({ request: input, attempts, priorPatterns }),
      ].join("\n\n"), LearnerPatternReviewResultSchema);
      const result: LearnerPatternReviewResult = LearnerPatternReviewResultSchema.parse(generated.output);
      const expected = [...attemptIds].sort();
      if (result.courseId !== courseId || result.trigger !== trigger || JSON.stringify([...result.reviewedAttemptIds].sort()) !== JSON.stringify(expected)) {
        return reply.code(502).send({ error: "The pattern review did not match the supplied class and evidence window." });
      }
      const knownConcepts = new Set(input.conceptIds);
      if (result.proposals.some((proposal) => proposal.conceptIds.some((id) => !knownConcepts.has(id)))) {
        return reply.code(502).send({ error: "The pattern review referenced a concept outside the supplied evidence." });
      }
      return reply.code(201).send(options.learner.savePatternReview(courseId, trigger, result, generated.model ?? "Codex"));
    } catch (error) {
      if (error instanceof Error && error.name === "CodexRunError") return reply.code(503).send({ error: error.message });
      throw error;
    }
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
    const attempts = options.learner.getSessionAttempts(courseId, sessionId.data);
    return StudySessionRecordSchema.parse({ ...session, attempts: attempts.map(({ outcome, response, confidence, hintCount, independence, createdAt }) => ({ outcome, response, confidence, hintCount, independence, createdAt })) });
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

  app.patch<{ Params: { courseId: string; assessmentId: string } }>("/api/courses/:courseId/learner/assessments/:assessmentId", async (request, reply) => {
    const params = z.object({ courseId: z.string().uuid(), assessmentId: z.string().uuid() }).safeParse(request.params);
    if (!params.success || !options.courses.getCourse(params.data.courseId)) return reply.code(404).send({ error: "Assessment scope not found." });
    const parsed = LearnerAssessmentUpdateSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: "Assessment details are invalid.", issues: parsed.error.issues });
    const assessment = options.learner.updateAssessment(params.data.courseId, params.data.assessmentId, parsed.data);
    return assessment ? reply.send({ assessment }) : reply.code(404).send({ error: "Assessment scope not found in this class." });
  });

  app.patch<{ Params: { courseId: string; assessmentId: string } }>("/api/courses/:courseId/learner/assessments/:assessmentId/topics", async (request, reply) => {
    const params = z.object({ courseId: z.string().uuid(), assessmentId: z.string().uuid() }).safeParse(request.params);
    if (!params.success || !options.courses.getCourse(params.data.courseId)) return reply.code(404).send({ error: "Assessment scope not found." });
    const parsed = LearnerAssessmentTopicsAppendSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: "Assessment topics are invalid.", issues: parsed.error.issues });
    try {
      const result = options.learner.appendAssessmentTopics(params.data.courseId, params.data.assessmentId, parsed.data);
      return result ? reply.send(result) : reply.code(404).send({ error: "Assessment scope not found in this class." });
    } catch {
      return reply.code(422).send({ error: "Assessment topics must belong to the same class." });
    }
  });

  app.patch<{ Params: { courseId: string; assessmentId: string; topicId: string } }>("/api/courses/:courseId/learner/assessments/:assessmentId/topics/:topicId/importance", async (request, reply) => {
    const params = z.object({ courseId: z.string().uuid(), assessmentId: z.string().uuid(), topicId: z.string().uuid() }).safeParse(request.params);
    if (!params.success || !options.courses.getCourse(params.data.courseId)) return reply.code(404).send({ error: "Assessment topic not found." });
    const parsed = LearnerAssessmentTopicImportanceUpdateSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: "Topic importance is invalid." });
    const assessment = options.learner.updateAssessmentTopicImportance(params.data.courseId, params.data.assessmentId, params.data.topicId, parsed.data.importance);
    return assessment ? reply.send({ assessment }) : reply.code(404).send({ error: "Assessment topic not found in this class." });
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
    const sourceMaterial = parsed.data.sourceMaterialId
      ? options.sources.getMaterial(courseId, parsed.data.sourceMaterialId)
      : null;
    if (parsed.data.sourceMaterialId && (!sourceMaterial || sourceMaterial.status !== "ready")) {
      return reply.code(422).send({ error: "That assignment is unavailable for source-grounded study." });
    }
    const assessment = parsed.data.assessmentId
      ? options.learner.getProfile(courseId).assessments.find(({ id }) => id === parsed.data.assessmentId)
      : undefined;
    if (parsed.data.assessmentId && !assessment) return reply.code(422).send({ error: "That exam topic list is unavailable in this class." });
    const assessmentTopic = assessment
      ? options.learner.findAssessmentTopic(courseId, assessment.id, parsed.data.topic)
      : undefined;
    if (assessment && !assessmentTopic) return reply.code(422).send({ error: "Choose a topic from the selected exam topic list." });
    const reviewSession = parsed.data.reviewSessionId
      ? options.learner.getStudySession(courseId, parsed.data.reviewSessionId)
      : null;
    if (parsed.data.reviewSessionId && !reviewSession) {
      return reply.code(422).send({ error: "The study session selected for remediation is unavailable in this class." });
    }
    if (reviewSession && (reviewSession.topic !== parsed.data.topic
      || (reviewSession.assessmentId ?? null) !== (assessment?.id ?? null)
      || (reviewSession.sourceMaterialId ?? null) !== (sourceMaterial?.id ?? null))) {
      return reply.code(422).send({ error: "Remediation must keep the original topic, assignment source, and assessment scope." });
    }
    const reviewAttempts = reviewSession
      ? options.learner.getSessionAttempts(courseId, reviewSession.sessionId).slice(-3)
      : [];
    if (reviewSession && !reviewAttempts.length) {
      return reply.code(422).send({ error: "The selected study session has no saved response to review yet." });
    }
    const sourcePassages = sourceMaterial
      ? options.sources.getPassages(courseId, sourceMaterial.id, 40, 0)
        .map(({ id, ordinal, content, location }) => ({ id, ordinal, content: content.slice(0, 1800), location }))
        .slice(0, 24)
      : [];
    const contrastTopics = parsed.data.method === "compare-contrast"
      ? acceptedContrastTopics(options.artifacts.acceptedCourseMap(courseId)?.payload ?? null, parsed.data.topic)
      : [];
    const concept = options.learner.ensureConcept(courseId, parsed.data.topic);
    if (reviewSession && reviewSession.conceptId !== concept.id) {
      return reply.code(422).send({ error: "Remediation must stay with the original course concept." });
    }
    if (assessment && assessmentTopic && !options.learner.linkAssessmentTopic(courseId, assessment.id, assessmentTopic.id, concept.id)) {
      return reply.code(422).send({ error: "Could not link the study topic to this exam scope." });
    }
    const methodDirections = {
      explanation: "Lead with the core idea, build intuition, define precise terms, then connect the idea to one short example.",
      "worked-example": "Lead with a complete worked example, show why each step is valid, then identify the reusable pattern. Keep the learner's practice check separate.",
      quiz: "Use retrieval first: make the knowledge check test the central idea before revealing the lesson. Keep the lesson as a concise debrief that the learner can open after attempting the check.",
      analogy: "Choose a concrete analogy that maps the important parts of the concept, state where the analogy breaks, then connect it back to precise terms.",
      "free-recall": "Start with unaided free recall: ask one open-ended question that requires the learner to explain the core concept in their own words. Progressive in-app hints may be requested and are tracked separately. Do not make the question multiple choice. Keep the answer explanation hidden until the learner submits a short response; after submission, show a concise reference explanation they can compare against. Do not claim the response was graded.",
      "teach-back": "Use a teach-back exercise: ask the learner to explain the core idea as if teaching a curious student who has not seen it before. Prompt them to state the key relationship and explain why it holds, in their own words. Keep the reference explanation hidden until they submit. Do not make the question multiple choice or claim their response was graded.",
      "compare-contrast": "Use contrastive learning: first use the accepted course-map related concepts supplied in INPUT_JSON, when available, to choose one closely related idea learners may confuse with this topic. Explain both ideas side by side, emphasize the decisive difference, and give a concise example of when each applies. The knowledge check should test that distinction in a new case. Ground both sides in supplied course evidence when available. If no supported neighboring concept exists, contrast the topic with a boundary case and do not invent course-specific facts.",
      "error-analysis": "Teach through error analysis. Include a short, plausible four-step numbered worked solution with one subtle but meaningful invalid step. Ask the learner to identify the first invalid step, with answer choices corresponding in order to Steps 1 through 4. Keep the flawed work visible while answering, but do not signal which step is wrong before submission. Make all other steps valid, ground the reasoning in supplied course evidence when available, and use feedback to identify the misconception and show the corrected step.",
    } satisfies Record<typeof parsed.data.method, string>;
    const openResponse = parsed.data.method === "free-recall" || parsed.data.method === "teach-back";
    try {
      const result = await options.codex.run("compose-study-lesson", [
        "Use $compose-study-lesson for a direct study session.",
        sourceMaterial
          ? "Ground the lesson and knowledge check in the supplied assignment passages. Keep problem statements and course-specific notation faithful to the source; explain the underlying ideas without inventing assignment details. Mark sourceBasis as course-materials."
          : "Teach from reliable general knowledge when no course passages are supplied. Clearly mark that content as not verified against the learner's course.",
        assessment ? "Focus this session on the selected learner-provided assessment topic. Preserve the instructor's wording and do not expand into unrelated topics." : "",
        reviewSession ? "This is a focused remediation follow-up. Use the saved attempt evidence to address the learner's specific uncertainty. For a miss or unscored response, explain the likely gap briefly before a different example; for a low-confidence correct response, test transfer. Do not repeat the old question or reveal the new answer in advance." : "",
        openResponse
          ? parsed.data.method === "teach-back"
            ? "Return one concise lesson, an optional worked example, one teach-back prompt that asks the learner to explain the concept as if teaching a new student, a concise reference explanation in feedback, a clarification answer, and one or two progressive hints that do not reveal the explanation. Do not include answer choices or an answer index."
            : "Return one concise lesson, an optional worked example, one open-ended free-recall question, a concise reference explanation in feedback, a clarification answer, and one or two progressive hints that do not reveal the answer. Do not include answer choices or an answer index."
          : parsed.data.method === "error-analysis"
            ? "Return a concise lesson, a four-step numbered example containing exactly one invalid reasoning step, and a four-option question asking which step is the first invalid step. Label the choices Step 1 through Step 4 in order, mark the correct step index, explain the misconception in feedback, provide a clarification answer, and add one or two progressive hints that do not identify the wrong step."
            : "Return one concise lesson, an optional worked example, one four-option knowledge check, the correct option index, concise immediate feedback, a clarification answer, and one or two progressive hints that do not reveal the answer.",
        "Write mathematical notation with Markdown math delimiters: use $...$ inline; for display equations put $$ on its own line, the equation on following line(s), and the closing $$ on its own line. For quantum notation use supported LaTeX such as \\ket{\\psi}, \\bra{\\phi}, and \\braket{\\phi|\\psi}; do not leave raw TeX commands outside math delimiters.",
        methodDirections[parsed.data.method],
        "Never say the learner has mastered the topic based on this generated lesson.",
        "INPUT_JSON", JSON.stringify({ className: options.courses.getCourse(courseId)?.title, topic: parsed.data.topic, method: parsed.data.method, ...(parsed.data.method === "compare-contrast" ? { acceptedMapRelatedConcepts: contrastTopics } : {}), sourceMaterial: sourceMaterial ? { id: sourceMaterial.id, name: sourceMaterial.originalName, passages: sourcePassages } : null, assessmentScope: assessment ? { id: assessment.id, title: assessment.title, topic: assessmentTopic?.title } : null, followUpEvidence: reviewAttempts.map(({ outcome, response, confidence, hintCount, method, independence, createdAt }) => ({ outcome, response: response.slice(0, 2000), confidence, hintCount, method, independence, createdAt })), learnerProfile: options.learner.getProfile(courseId).concepts.find((item) => item.id === concept.id) ?? null }),
      ].join("\n\n"), StudySessionGenerationContentSchema);
      const content = StudySessionContentSchema.parse({ ...result.output, ...(sourceMaterial ? { sourceBasis: "course-materials" } : {}), conceptId: concept.id, assessmentId: assessment?.id ?? null, sourceMaterialId: sourceMaterial?.id ?? null, topic: parsed.data.topic, method: parsed.data.method, ...(openResponse ? { options: [], answerIndex: null } : {}) });
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
    try {
      const recentAttempts = options.learner.getRecentAttempts(courseId, session.conceptId, 5, session.assessmentId ?? undefined);
      const sourceMaterial = session.sourceMaterialId
        ? options.sources.getMaterial(courseId, session.sourceMaterialId)
        : null;
      if (session.sourceMaterialId && (!sourceMaterial || sourceMaterial.status !== "ready")) {
        return reply.code(422).send({ error: "The source for this study session is no longer available." });
      }
      const assessment = session.assessmentId
        ? options.learner.getProfile(courseId).assessments.find(({ id }) => id === session.assessmentId)
        : undefined;
      if (session.assessmentId && !assessment) return reply.code(422).send({ error: "The assessment scope for this study session is no longer available." });
      const assessmentTopic = assessment
        ? options.learner.findAssessmentTopic(courseId, assessment.id, session.topic)
        : undefined;
      if (assessment && !assessmentTopic) return reply.code(422).send({ error: "The study topic is no longer in this assessment scope." });
      const sourcePassages = sourceMaterial
        ? options.sources.getPassages(courseId, sourceMaterial.id, 40, 0)
          .map(({ id, ordinal, content, location }) => ({ id, ordinal, content: content.slice(0, 1800), location }))
          .slice(0, 24)
        : [];
      const contrastTopics = session.method === "compare-contrast"
        ? acceptedContrastTopics(options.artifacts.acceptedCourseMap(courseId)?.payload ?? null, session.topic)
        : [];
      const openResponse = session.method === "free-recall" || session.method === "teach-back";
      const questionSchema = openResponse ? StudyFreeRecallQuestionSchema : StudyQuestionSchema;
      const result = await options.codex.run("generate-adaptive-practice", [
        openResponse
          ? session.method === "teach-back"
            ? "Use $generate-adaptive-practice to create one new teach-back prompt for this same concept. Ask the learner to explain the idea as if teaching a new student; the learner will submit text and compare it with a reference explanation, so do not make the prompt multiple choice."
            : "Use $generate-adaptive-practice to create one new open-ended free-recall prompt for this same concept. Ask the learner to explain or retrieve the idea in their own words; the learner will submit text and compare it with a reference explanation, so do not make the prompt multiple choice."
            : session.method === "compare-contrast"
              ? "Use $generate-adaptive-practice to create one new multiple-choice question that tests the distinction between this concept and a related idea in acceptedMapRelatedConcepts when available. Use a new case and explain the decisive difference in feedback. If no neighboring concept is supported, test a boundary case for this concept instead."
              : session.method === "error-analysis"
                ? "Use $generate-adaptive-practice to create a new error-analysis exercise for this concept. Put a fresh four-step numbered worked solution with exactly one subtle invalid step directly in the question text, then ask which step first goes wrong. This question text is the only exercise content shown in the knowledge-check tab. Return four choices labeled Step 1 through Step 4 in order. Do not reuse the earlier error, solution, or surface form. Explain the misconception and corrected step in feedback."
              : "Use $generate-adaptive-practice to create exactly one new multiple-choice question for this same concept.",
        "Use the attempt history to target likely uncertainty. Change the surface form or reasoning path; do not repeat any prior question or simply paraphrase its choices.",
        openResponse
          ? "Return the open-ended prompt, its concise reference explanation as feedback, and up to two progressive hints. Do not return choices or an answer key."
          : session.method === "error-analysis"
            ? "Return a question asking which numbered step first becomes invalid, one answer choice per displayed step, a validated correct option index, feedback explaining the misconception and corrected step, and up to two hints that do not reveal the answer."
            : "Return a compact question, 2 to 6 plausible options, a validated correct option index, concise corrective feedback, and up to two progressive hints that do not reveal the answer.",
        sourceMaterial
          ? openResponse
            ? "Ground the open-ended prompt, reference explanation, and hints in the supplied source passages. Preserve the source's course-specific notation and facts; do not introduce unsupported details or add choices."
            : "Ground the new question, options, answer, feedback, and hints in the supplied source passages. Preserve the source's course-specific notation and facts; do not introduce unsupported details."
          : "No course source passages are attached. Use general knowledge and keep the question marked as not course-verified.",
        "Format inline equations as $...$ and put display equations in standalone $$ blocks with the opening and closing $$ on their own lines. Keep raw TeX commands inside math delimiters.",
        assessment ? "Keep the question within the selected learner-provided assessment topic and preserve the instructor's wording." : "",
        "INPUT_JSON", JSON.stringify({
          className: options.courses.getCourse(courseId)?.title,
          concept: { id: session.conceptId, title: session.topic },
          learningMethod: session.method,
          ...(session.method === "compare-contrast" ? { acceptedMapRelatedConcepts: contrastTopics } : {}),
          sourceMaterial: sourceMaterial ? { id: sourceMaterial.id, name: sourceMaterial.originalName, passages: sourcePassages } : null,
          assessmentScope: assessment ? { id: assessment.id, title: assessment.title, topic: assessmentTopic?.title } : null,
          priorLesson: session.lesson,
          priorExample: session.example,
          recentAttempts,
          previousQuestion: session.question,
        }),
      ].join("\n\n"), questionSchema);
      const question = questionSchema.parse(result.output);
      const { sessionId: _oldSessionId, createdAt: _oldCreatedAt, ...sessionContent } = session;
      const nextSession = StudySessionRecordSchema.parse(options.learner.saveStudySession(courseId, session.conceptId, {
        ...sessionContent,
        ...question,
        ...(openResponse ? { options: [], answerIndex: null } : {}),
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
        "Format inline equations as $...$ and put display equations in standalone $$ blocks with the opening and closing $$ on their own lines. Keep raw TeX commands inside math delimiters.",
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
