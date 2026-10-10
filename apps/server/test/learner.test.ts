import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdir, mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { DatabaseSync } from "node:sqlite";
import { join } from "node:path";
import test from "node:test";
import { allocateAssessmentStudyPlan, allocateStudyMinutes, assessmentDeadlineLabel, normalizeMathText, parseInstructorTopicList, prioritizeStudyRecommendations, recommendNextStudyTopic, scheduleAssessmentStudyDays, summarizeStudyCoverage, summarizeTopicProgress } from "@local-learning-studio/contracts";
import type { AppOptions } from "../src/app.js";
import { buildApp } from "../src/app.js";

function uploadPayload(filename: string, content: string) {
  const boundary = "learner-study-test-boundary";
  const body = [
    `--${boundary}`,
    `Content-Disposition: form-data; name="file"; filename="${filename}"`,
    "Content-Type: text/markdown",
    "",
    content,
    `--${boundary}--`,
    "",
  ].join("\r\n");
  return { payload: body, contentType: `multipart/form-data; boundary=${boundary}` };
}

async function createAppWithStudyModel() {
  const root = await mkdtemp(join(tmpdir(), "learning-studio-learner-"));
  const prompts: string[] = [];
  const codex = {
    status: async () => ({ installed: true, authenticated: true, ready: true }),
    run: async (task: any, prompt: string, outputSchema: any) => {
      prompts.push(prompt);
      const output = outputSchema.parse({
        conceptId: randomUUID(),
        topic: "model topic",
        method: "explanation",
        sourceBasis: "course-materials",
        lesson: "## Source-grounded idea\n\nThe key operation is $H\lvert 0\\rangle = (\\lvert 0\\rangle + \\lvert 1\\rangle)/\\sqrt{2}$.",
        example: "Apply the stated operation to the source problem.",
        question: "Which state does the source operation produce?",
        options: ["$\\lvert 0\\rangle$", "$\\lvert 1\\rangle$", "$\\lvert +\\rangle$", "$\\lvert -\\rangle$"],
        answerIndex: 2,
        feedback: "The source identifies the equal superposition.",
        clarification: "The operation creates both basis components.",
        hints: ["Check the coefficients in the source."],
      });
      return { task, model: "test-model", startedAt: new Date().toISOString(), durationMs: 1, output };
    },
  } as unknown as NonNullable<AppOptions["codex"]>;
  const app = buildApp({ databasePath: join(root, "data", "studio.sqlite"), courseRoot: join(root, "courses"), codex });
  return { app, root, prompts };
}

test("professor topic-list parser removes common numbering and bullets and deduplicates case-insensitively", () => {
  assert.deepEqual(parseInstructorTopicList([
    "1. Tensor products",
    "2) Bell states",
    "- Partial trace",
    "• No-signaling",
    "☐ Density matrices",
    "density MATRICES",
    "1.5 GHz frequency shifts",
    "Entanglement swapping, Teleportation",
    "Quantum channels; Density operators",
  ].join("\r\n")), [
    "Tensor products",
    "Bell states",
    "Partial trace",
    "No-signaling",
    "Density matrices",
    "1.5 GHz frequency shifts",
    "Entanglement swapping",
    "Teleportation",
    "Quantum channels",
    "Density operators",
  ]);
});

test("study budget allocates exactly the available minutes and favors weak topics", () => {
  const plan = allocateStudyMinutes(["Weak Bayes", "Bell states", "Partial trace"], 10);
  assert.deepEqual(plan, [
    { topic: "Weak Bayes", minutes: 4 },
    { topic: "Bell states", minutes: 3 },
    { topic: "Partial trace", minutes: 3 },
  ]);
  assert.equal(plan.reduce((sum, item) => sum + item.minutes, 0), 10);
  assert.deepEqual(allocateStudyMinutes(["A", "B"], 1).map(({ minutes }) => minutes), [1, 0]);
  assert.deepEqual(allocateStudyMinutes(["A"], Number.NaN), [{ topic: "A", minutes: 0 }]);
});

test("assessment study plan weights saved evidence and reports deadline timing", () => {
  const plan = allocateAssessmentStudyPlan([
    { id: "missed", title: "Missed high-priority topic", importance: "high" as const, attemptCount: 2, scoredAttemptCount: 2, correctCount: 0, latestOutcome: "incorrect", sessionCount: 1 },
    { id: "steady", title: "Recent steady topic", importance: "normal" as const, attemptCount: 3, scoredAttemptCount: 3, correctCount: 3, latestOutcome: "correct", sessionCount: 2, lastPracticedAt: "2026-10-10T12:00:00.000Z" },
    { id: "new", title: "Untouched topic", importance: "normal" as const, attemptCount: 0, scoredAttemptCount: 0, correctCount: 0, latestOutcome: null, sessionCount: 0 },
  ], 90);
  assert.equal(plan.reduce((sum, item) => sum + item.minutes, 0), 90);
  assert.ok(plan[0]!.minutes > plan[1]!.minutes, "missed, high-priority evidence should receive more than a strong recent result");
  assert.ok(plan[2]!.minutes > 0, "untouched topics should retain some preparation time");
  const now = Date.parse("2026-10-10T12:00:00.000Z");
  assert.equal(assessmentDeadlineLabel("2026-10-10T20:00:00.000Z", now), "due today");
  assert.equal(assessmentDeadlineLabel("2026-10-11T12:00:00.000Z", now), "due tomorrow");
  assert.equal(assessmentDeadlineLabel("2026-10-09T12:00:00.000Z", now), "overdue by 1 day");
});

test("assessment schedule spreads sessions before the deadline and flags over-capacity time", () => {
  const now = new Date(2026, 9, 10, 8).getTime();
  const due = new Date(2026, 9, 16, 12).toISOString();
  const plan = scheduleAssessmentStudyDays([
    { title: "Missed topic", minutes: 80 },
    { title: "New topic", minutes: 40 },
  ], due, 60, now);
  assert.equal(plan.status, "scheduled");
  assert.equal(plan.scheduledMinutes, 120);
  assert.equal(plan.unscheduledMinutes, 0);
  assert.deepEqual(plan.days.map(({ date }) => date), ["2026-10-10", "2026-10-15"]);
  assert.ok(plan.days.every((day) => day.minutes <= 60));
  assert.ok(plan.days.every((day) => day.date < "2026-10-16"), "study sessions must happen before the assessment date");
  assert.equal(plan.days.reduce((sum, day) => sum + day.minutes, 0), 120);

  const overCapacity = scheduleAssessmentStudyDays([{ title: "Topic", minutes: 120 }], new Date(2026, 9, 11, 12).toISOString(), 45, now);
  assert.equal(overCapacity.status, "over-capacity");
  assert.equal(overCapacity.scheduledMinutes, 45);
  assert.equal(overCapacity.unscheduledMinutes, 75);
  assert.equal(scheduleAssessmentStudyDays([{ title: "Topic", minutes: 30 }], null, 45, now).status, "missing-deadline");
  assert.equal(scheduleAssessmentStudyDays([{ title: "Topic", minutes: 30 }], new Date(2026, 9, 9, 12).toISOString(), 45, now).status, "deadline-passed");
});

test("category progress counts only the displayed topics and ignores duplicate titles", () => {
  assert.deepEqual(summarizeTopicProgress(["Bell states", "Partial trace", "bell STATES"], [
    { title: "Bell states", attemptCount: 2, correctCount: 1 },
    { title: "Partial trace", attemptCount: 1, correctCount: 1 },
    { title: "Unrelated topic", attemptCount: 7, correctCount: 7 },
  ]), { topicCount: 2, practicedTopicCount: 2, attemptCount: 3, correctCount: 2 });
});

test("study coverage distinguishes lesson sessions from saved knowledge checks", () => {
  assert.deepEqual(summarizeStudyCoverage(["Bell states", "Partial trace", "BELL STATES"], [
    { title: "Bell states", sessionCount: 2, attemptCount: 0, correctCount: 0 },
    { title: "Partial trace", sessionCount: 0, attemptCount: 2, scoredAttemptCount: 1, correctCount: 1, latestOutcome: "incorrect" },
    { title: "Unrelated topic", sessionCount: 9, attemptCount: 9, correctCount: 9 },
  ]), {
    topicCount: 2,
    lessonTopicCount: 1,
    checkedTopicCount: 1,
    uncheckedTopicCount: 1,
    reviewTopicCount: 1,
    attemptCount: 2,
    scoredAttemptCount: 1,
    correctCount: 1,
  });
  const scoredOnlyCoverage = summarizeStudyCoverage(["Partial trace"], [
    { title: "Partial trace", sessionCount: 0, attemptCount: 2, scoredAttemptCount: 1, correctCount: 1 },
  ]);
  assert.equal(Math.round(scoredOnlyCoverage.correctCount / scoredOnlyCoverage.scoredAttemptCount * 100), 100);
});

test("homework next-topic recommendation prioritizes review, untouched topics, then stale topics", () => {
  const topics = [{ title: "Bell states" }, { title: "Partial trace" }, { title: "Teleportation" }];
  const missedReview = recommendNextStudyTopic(topics, [
    { title: "Ｂell states", attemptCount: 2, latestOutcome: "incorrect", lastPracticedAt: "2026-10-08T10:00:00.000Z" },
    { title: "Partial trace", attemptCount: 1, latestOutcome: "correct", lastPracticedAt: "2026-10-09T10:00:00.000Z" },
  ]);
  assert.deepEqual(missedReview, { topic: topics[0], reason: "needs-review" });

  const untouched = recommendNextStudyTopic(topics, [
    { title: "Bell states", attemptCount: 2, latestOutcome: "correct", lastPracticedAt: "2026-10-08T10:00:00.000Z" },
    { title: "Partial trace", attemptCount: 1, latestOutcome: "correct", lastPracticedAt: "2026-10-09T10:00:00.000Z" },
  ]);
  assert.deepEqual(untouched, { topic: topics[2], reason: "not-practiced" });

  const stale = recommendNextStudyTopic(topics, [
    { title: "Bell states", attemptCount: 2, latestOutcome: "correct", lastPracticedAt: "2026-10-08T10:00:00.000Z" },
    { title: "Partial trace", attemptCount: 1, latestOutcome: "correct", lastPracticedAt: "2026-10-06T10:00:00.000Z" },
    { title: "Teleportation", attemptCount: 1, latestOutcome: "correct", lastPracticedAt: "2026-10-09T10:00:00.000Z" },
  ]);
  assert.deepEqual(stale, { topic: topics[1], reason: "least-recently-practiced" });
  const unscored = recommendNextStudyTopic(topics, [
    { title: "Bell states", attemptCount: 1, latestOutcome: "not-graded", lastPracticedAt: "2026-10-09T10:00:00.000Z" },
    { title: "Partial trace", attemptCount: 1, latestOutcome: "correct", lastPracticedAt: "2026-10-08T10:00:00.000Z" },
  ]);
  assert.deepEqual(unscored, { topic: topics[0], reason: "needs-review" });
  const priority = recommendNextStudyTopic([
    { title: "Optional detail", importance: "low" },
    { title: "Core theorem", importance: "high" },
  ], []);
  assert.deepEqual(priority, { topic: { title: "Core theorem", importance: "high" }, reason: "not-practiced" });
  assert.equal(recommendNextStudyTopic([], []), null);
});

test("class recommendation distinguishes lesson-only topics and suggests their first knowledge check", () => {
  const topics = [
    { title: "Bell states", attemptCount: 0, sessionCount: 2, latestOutcome: null, lastPracticedAt: null, lastSessionAt: "2026-10-09T12:00:00.000Z" },
    { title: "Partial trace", attemptCount: 1, sessionCount: 1, latestOutcome: "correct", lastPracticedAt: "2026-10-09T10:00:00.000Z", lastSessionAt: "2026-10-09T10:00:00.000Z" },
  ];
  assert.deepEqual(recommendNextStudyTopic(topics, topics), { topic: topics[0], reason: "lesson-only" });
  assert.deepEqual(recommendNextStudyTopic([{ title: "No lesson yet" }], []), { topic: { title: "No lesson yet" }, reason: "not-practiced" });
});

test("cross-scope recommendations preserve review urgency and instructor priority", () => {
  const candidates = [
    { title: "Low priority, newer miss", reason: "needs-review" as const, importance: "low" as const, lastPracticedAt: "2026-10-09T10:00:00.000Z", contextPriority: 0 },
    { title: "High priority, older miss", reason: "needs-review" as const, importance: "high" as const, lastPracticedAt: "2026-10-07T10:00:00.000Z", contextPriority: 3 },
    { title: "Lesson opened, no check", reason: "lesson-only" as const, importance: "normal" as const, contextPriority: 0 },
    { title: "High priority, untouched", reason: "not-practiced" as const, importance: "high" as const, contextPriority: 0 },
    { title: "Normal priority, untouched", reason: "not-practiced" as const, importance: "normal" as const, contextPriority: 0 },
  ];
  assert.deepEqual(prioritizeStudyRecommendations(candidates).map(({ title }) => title), [
    "High priority, older miss",
    "Low priority, newer miss",
    "Lesson opened, no check",
    "High priority, untouched",
    "Normal priority, untouched",
  ]);
  assert.equal(candidates[0]!.title, "Low priority, newer miss", "ranking should not reorder the caller's array");
});

test("math text preserves TeX and repairs JSON-decoded control characters inside math", () => {
  const literal = String.raw`Inline $\rho = \theta \times \frac{1}{2}$ and display $$\nabla \cdot \vec{E} = \rho$$.`;
  assert.equal(normalizeMathText(literal), literal);

  const decoded = "$" + "\rho = \theta \times \right) + \tfrac{1}{2} + \braket{0|1} + \bra{0} + \beta + \begin{matrix} + \frac{1}{2} + \nabla + \nu" + "$";
  assert.equal(normalizeMathText(decoded), String.raw`$\rho = \theta \times \right) + \tfrac{1}{2} + \braket{0|1} + \bra{0} + \beta + \begin{matrix} + \frac{1}{2} + \nabla + \nu$`);

  const indexedSymbols = "$" + "\rho_{AB} + \theta_i + \nu_j + \nabla_k + \beta_m + \frac{1}{2}" + "$";
  assert.equal(normalizeMathText(indexedSymbols), String.raw`$\rho_{AB} + \theta_i + \nu_j + \nabla_k + \beta_m + \frac{1}{2}$`);

  const inlineCode = `\`${String.raw`\(not math\)`}\``;
  const fencedCode = ["```text", String.raw`\[not math\]`, "```"].join("\n");
  const alternateDelimiters = String.raw`Inline \(\rho = \theta\).
Display:
\[\frac{1}{2} = 0.5\]
Code: ${inlineCode}
${fencedCode}`;
  const normalizedAlternateDelimiters = normalizeMathText(alternateDelimiters);
  assert.ok(normalizedAlternateDelimiters.includes(String.raw`Inline $\rho = \theta$`));
  assert.ok(normalizedAlternateDelimiters.includes(["$$", String.raw`\frac{1}{2} = 0.5`, "$$"].join("\n")));
  assert.ok(normalizedAlternateDelimiters.includes(inlineCode));
  assert.ok(normalizedAlternateDelimiters.includes(fencedCode));
  assert.equal(normalizeMathText(String.raw`\[\frac{1}{2}\]`, { inline: true }), String.raw`$\frac{1}{2}$`);
});

test("instructor topic lists persist as class-scoped learner assessment topics", async () => {
  const { app, root } = await createAppWithStudyModel();
  const course = await app.inject({ method: "POST", url: "/api/courses", payload: { title: "Quantum Information" } });
  const courseId = course.json().id as string;

  const saved = await app.inject({
    method: "POST",
    url: `/api/courses/${courseId}/learner/assessments`,
    payload: {
      title: "Midterm 2 · professor scope",
      instructorText: "The professor said: \"Bell states and partial trace\". Do not study [[private course notes]].",
      kind: "exam",
      scheduledAt: "2026-11-12T16:30:00.000Z",
      availableMinutes: 180,
      topics: [
        { title: "Bell states", importance: "normal", provenance: "learner" },
        { title: "Partial trace", importance: "normal", provenance: "learner" },
      ],
    },
  });

  assert.equal(saved.statusCode, 201);
  const profile = await app.inject({ method: "GET", url: `/api/courses/${courseId}/learner/profile` });
  assert.equal(profile.statusCode, 200);
  assert.equal(profile.json().assessments[0].title, "Midterm 2 · professor scope");
  assert.equal(profile.json().assessments[0].scheduledAt, "2026-11-12T16:30:00.000Z");
  assert.equal(profile.json().assessments[0].availableMinutes, 180);
  assert.equal(profile.json().assessments[0].dailyMinutes, 45, "assessment scopes should use the default daily target");
  assert.equal(profile.json().assessments[0].instructorText, "The professor said: \"Bell states and partial trace\". Do not study [[private course notes]].");
  assert.deepEqual(profile.json().assessments[0].topics.map((topic: { title: string; provenance: string }) => [topic.title, topic.provenance]), [
    ["Bell states", "learner"],
    ["Partial trace", "learner"],
  ]);

  const updatedScope = await app.inject({
    method: "PATCH", url: `/api/courses/${courseId}/learner/assessments/${profile.json().assessments[0].id}`,
    payload: { availableMinutes: 240, dailyMinutes: 30 },
  });
  assert.equal(updatedScope.statusCode, 200);
  assert.equal(updatedScope.json().assessment.availableMinutes, 240);
  assert.equal(updatedScope.json().assessment.dailyMinutes, 30);
  assert.equal(updatedScope.json().assessment.instructorText, profile.json().assessments[0].instructorText, "other plan edits should preserve instructor wording");
  assert.equal(updatedScope.json().assessment.scheduledAt, "2026-11-12T16:30:00.000Z", "partial plan edits should preserve the saved date");
  const assessment = updatedScope.json().assessment;

  const editedWording = await app.inject({
    method: "PATCH", url: `/api/courses/${courseId}/learner/assessments/${assessment.id}`,
    payload: { instructorText: "Updated wording: focus on partial trace; Bell states are optional." },
  });
  assert.equal(editedWording.statusCode, 200);
  assert.equal(editedWording.json().assessment.instructorText, "Updated wording: focus on partial trace; Bell states are optional.");

  const bellTopicId = assessment.topics[0].id;
  const studied = await app.inject({
    method: "POST", url: `/api/courses/${courseId}/learner/study-session`,
    payload: { topic: "Bell states", method: "explanation", assessmentId: assessment.id },
  });
  assert.equal(studied.statusCode, 200, studied.body);
  const appended = await app.inject({
    method: "PATCH", url: `/api/courses/${courseId}/learner/assessments/${assessment.id}/topics`,
    payload: { topics: [
      { title: " BELL STATES ", importance: "normal", provenance: "learner" },
      { title: "Quantum teleportation", importance: "high", provenance: "learner" },
    ] },
  });
  assert.equal(appended.statusCode, 200, appended.body);
  assert.equal(appended.json().addedTopicCount, 1);
  assert.deepEqual(appended.json().assessment.topics.map((topic: { title: string }) => topic.title), ["Bell states", "Partial trace", "Quantum teleportation"]);
  assert.equal(appended.json().assessment.topics[2].importance, "high", "appended instructor priority should be retained");
  assert.equal(appended.json().assessment.topics[0].id, bellTopicId);
  assert.equal(appended.json().assessment.topics[0].sessionCount, 1);
  const priorityUpdate = await app.inject({
    method: "PATCH", url: `/api/courses/${courseId}/learner/assessments/${assessment.id}/topics/${appended.json().assessment.topics[2].id}/importance`,
    payload: { importance: "high" },
  });
  assert.equal(priorityUpdate.statusCode, 200, priorityUpdate.body);
  assert.equal(priorityUpdate.json().assessment.topics[2].importance, "high");
  const invalidPriority = await app.inject({
    method: "PATCH", url: `/api/courses/${courseId}/learner/assessments/${assessment.id}/topics/${appended.json().assessment.topics[2].id}/importance`,
    payload: { importance: "urgent" },
  });
  assert.equal(invalidPriority.statusCode, 400);

  await app.close();
  await rm(root, { recursive: true });
});

test("adding a topic already in an assessment can link its existing class progress", async () => {
  const { app } = await createAppWithStudyModel();
  const course = await app.inject({ method: "POST", url: "/api/courses", payload: { title: "Quantum Information" } });
  const courseId = course.json().id as string;
  const concept = await app.inject({
    method: "POST", url: `/api/courses/${courseId}/learner/concepts`,
    payload: { stableKey: "bell-states", title: "Bell states", description: "" },
  });
  assert.equal(concept.statusCode, 201, concept.body);
  const scope = await app.inject({
    method: "POST", url: `/api/courses/${courseId}/learner/assessments`,
    payload: { title: "Exam review", topics: [{ title: "Bell states" }] },
  });
  assert.equal(scope.statusCode, 201, scope.body);
  assert.equal(scope.json().topics[0].conceptId, null);
  const linked = await app.inject({
    method: "PATCH", url: `/api/courses/${courseId}/learner/assessments/${scope.json().id}/topics`,
    payload: { topics: [{ title: " bell STATES ", conceptId: concept.json().id }] },
  });
  assert.equal(linked.statusCode, 200, linked.body);
  assert.equal(linked.json().addedTopicCount, 0, "the duplicate should not create another scope topic");
  assert.equal(linked.json().assessment.topics.length, 1);
  assert.equal(linked.json().assessment.topics[0].conceptId, concept.json().id);
});

test("study attempts from a learner exam scope update assessment and topic progress", async () => {
  const { app, root, prompts } = await createAppWithStudyModel();
  const course = await app.inject({ method: "POST", url: "/api/courses", payload: { title: "Quantum Information" } });
  const courseId = course.json().id as string;
  const saved = await app.inject({
    method: "POST",
    url: `/api/courses/${courseId}/learner/assessments`,
    payload: { title: "Midterm 2", kind: "exam", scheduledAt: null, availableMinutes: null, topics: [{ title: "Bell states", importance: "normal", provenance: "learner" }] },
  });
  const assessmentId = saved.json().id as string;
  const session = await app.inject({
    method: "POST", url: `/api/courses/${courseId}/learner/study-session`,
    payload: { topic: "Bell states", method: "explanation", assessmentId },
  });
  assert.equal(session.statusCode, 200, session.body);
  assert.equal(session.json().assessmentId, assessmentId);
  assert.match(prompts[0] ?? "", /selected learner-provided assessment topic/);
  assert.match(prompts[0] ?? "", /Midterm 2/);
  const initialGenerationInput = JSON.parse((prompts[0] ?? "").split("INPUT_JSON\n\n")[1] ?? "{}");
  assert.deepEqual(initialGenerationInput.assessmentScope, {
    id: assessmentId,
    title: "Midterm 2",
    topic: "Bell states",
  });
  const lessonOnlyProfile = await app.inject({ method: "GET", url: `/api/courses/${courseId}/learner/profile` });
  const lessonOnlyAssessment = lessonOnlyProfile.json().assessments[0];
  assert.deepEqual([lessonOnlyAssessment.sessionCount, lessonOnlyAssessment.topics[0].sessionCount, lessonOnlyAssessment.topics[0].attemptCount], [1, 1, 0]);
  assert.equal(lessonOnlyProfile.json().concepts.find((item: { id: string }) => item.id === session.json().conceptId).sessionCount, 1);

  const attemptPayload = {
    attemptId: randomUUID(), sessionId: session.json().sessionId, conceptId: session.json().conceptId, assessmentId,
    activityType: "recognition", prompt: session.json().question, response: session.json().options[session.json().answerIndex],
    reasoning: "", confidence: 0.75, hintCount: 0, method: "explanation", outcome: "correct", sourceRefs: [],
    independence: "independent", rationale: "Correct answer in assessment preparation.",
  };
  const attempt = await app.inject({ method: "POST", url: `/api/courses/${courseId}/learner/attempts`, payload: attemptPayload });
  assert.equal(attempt.statusCode, 201, attempt.body);
  const retriedAttempt = await app.inject({ method: "POST", url: `/api/courses/${courseId}/learner/attempts`, payload: attemptPayload });
  assert.equal(retriedAttempt.statusCode, 201, retriedAttempt.body);
  assert.deepEqual(retriedAttempt.json(), attempt.json(), "retrying the same attempt ID returns the original saved attempt");
  const reopened = await app.inject({ method: "GET", url: `/api/courses/${courseId}/learner/study-sessions/${session.json().sessionId}` });
  assert.equal(reopened.statusCode, 200, reopened.body);
  assert.deepEqual(reopened.json().attempts.map((item: { outcome: string; response: string }) => [item.outcome, item.response]), [["correct", session.json().options[session.json().answerIndex]]]);
  const profile = await app.inject({ method: "GET", url: `/api/courses/${courseId}/learner/profile` });
  const updated = profile.json().assessments[0];
  assert.equal(updated.attemptCount, 1);
  assert.equal(updated.correctCount, 1);
  assert.equal(updated.topics[0].attemptCount, 1);
  assert.equal(updated.topics[0].sessionCount, 1);
  assert.equal(updated.topics[0].correctCount, 1);
  assert.equal(updated.topics[0].latestOutcome, "correct");

  const secondSession = await app.inject({
    method: "POST", url: `/api/courses/${courseId}/learner/study-session`,
    payload: { topic: "Bell states", method: "quiz", assessmentId },
  });
  assert.equal(secondSession.statusCode, 200, secondSession.body);
  const secondAttempt = await app.inject({
    method: "POST", url: `/api/courses/${courseId}/learner/attempts`,
    payload: {
      sessionId: secondSession.json().sessionId, conceptId: secondSession.json().conceptId, assessmentId,
      activityType: "recognition", prompt: secondSession.json().question, response: secondSession.json().options[0],
      reasoning: "", confidence: 0.5, hintCount: 1, method: "retrieval-practice", outcome: "incorrect", sourceRefs: [],
      independence: "hinted", rationale: "Second session sample attempt.",
    },
  });
  assert.equal(secondAttempt.statusCode, 201, secondAttempt.body);
  const promptCountBeforeInvalidRemediation = prompts.length;
  const missingExamContext = await app.inject({
    method: "POST", url: `/api/courses/${courseId}/learner/study-session`,
    payload: { topic: "Bell states", method: "worked-example", reviewSessionId: secondSession.json().sessionId },
  });
  assert.equal(missingExamContext.statusCode, 422, missingExamContext.body);
  assert.equal(prompts.length, promptCountBeforeInvalidRemediation, "mismatched remediation scope must not invoke the model");
  const remediation = await app.inject({
    method: "POST", url: `/api/courses/${courseId}/learner/study-session`,
    payload: { topic: "Bell states", method: "worked-example", assessmentId, reviewSessionId: secondSession.json().sessionId },
  });
  assert.equal(remediation.statusCode, 200, remediation.body);
  assert.equal(remediation.json().assessmentId, assessmentId);
  assert.equal(remediation.json().conceptId, secondSession.json().conceptId);
  const remediationInput = JSON.parse(prompts.at(-1)!.split("INPUT_JSON\n\n")[1]!);
  assert.deepEqual(remediationInput.followUpEvidence.map((item: { outcome: string; response: string; confidence: number; hintCount: number; method: string }) => [item.outcome, item.response, item.confidence, item.hintCount, item.method]), [
    ["incorrect", secondSession.json().options[0], 0.5, 1, "retrieval-practice"],
  ]);
  assert.match(prompts.at(-1) ?? "", /focused remediation follow-up/);
  const sessionHistory = await app.inject({ method: "GET", url: `/api/courses/${courseId}/learner/study-sessions` });
  const currentSession = sessionHistory.json().find((item: { sessionId: string }) => item.sessionId === session.json().sessionId);
  const laterSession = sessionHistory.json().find((item: { sessionId: string }) => item.sessionId === secondSession.json().sessionId);
  assert.deepEqual([currentSession.attemptCount, currentSession.latestOutcome], [1, "correct"]);
  assert.deepEqual([laterSession.attemptCount, laterSession.latestOutcome], [1, "incorrect"]);
  const finalProfile = await app.inject({ method: "GET", url: `/api/courses/${courseId}/learner/profile` });
  assert.deepEqual([finalProfile.json().assessments[0].attemptCount, finalProfile.json().assessments[0].scoredAttemptCount, finalProfile.json().assessments[0].correctCount], [2, 2, 1]);
  assert.deepEqual([finalProfile.json().assessments[0].topics[0].attemptCount, finalProfile.json().assessments[0].topics[0].scoredAttemptCount, finalProfile.json().assessments[0].topics[0].correctCount], [2, 2, 1]);
  const methodProgress = await app.inject({ method: "GET", url: `/api/courses/${courseId}/learner/method-progress` });
  assert.equal(methodProgress.statusCode, 200, methodProgress.body);
  assert.deepEqual(methodProgress.json().map(({ method, attemptCount, scoredAttemptCount, confidenceRatedAttemptCount, meanConfidenceGap, correctCount, topicCount, topicTitles }: { method: string; attemptCount: number; scoredAttemptCount: number; confidenceRatedAttemptCount: number; meanConfidenceGap: number | null; correctCount: number; topicCount: number; topicTitles: string[] }) => [method, attemptCount, scoredAttemptCount, confidenceRatedAttemptCount, meanConfidenceGap, correctCount, topicCount, topicTitles]), [
    ["explanation", 1, 1, 1, 0.25, 1, 1, ["Bell states"]],
    ["retrieval-practice", 1, 1, 1, 0.5, 0, 1, ["Bell states"]],
  ]);
  const legacyQuizAttempt = await app.inject({
    method: "POST", url: `/api/courses/${courseId}/learner/attempts`,
    payload: {
      conceptId: session.json().conceptId, activityType: "recognition", prompt: "Legacy quiz-method alias",
      response: "A correct recalled answer", reasoning: "", confidence: 0.75, hintCount: 0, method: "quiz",
      outcome: "correct", sourceRefs: [], independence: "independent", rationale: "Older sessions used quiz as the stored attempt method.",
    },
  });
  assert.equal(legacyQuizAttempt.statusCode, 201, legacyQuizAttempt.body);
  const normalizedMethodProgress = await app.inject({ method: "GET", url: `/api/courses/${courseId}/learner/method-progress` });
  assert.deepEqual(normalizedMethodProgress.json().map(({ method, attemptCount, scoredAttemptCount, confidenceRatedAttemptCount, meanConfidenceGap, correctCount }: { method: string; attemptCount: number; scoredAttemptCount: number; confidenceRatedAttemptCount: number; meanConfidenceGap: number | null; correctCount: number }) => [method, attemptCount, scoredAttemptCount, confidenceRatedAttemptCount, meanConfidenceGap, correctCount]), [
    ["retrieval-practice", 2, 2, 2, 0.375, 1],
    ["explanation", 1, 1, 1, 0.25, 1],
  ]);
  const partialConcept = await app.inject({
    method: "POST", url: `/api/courses/${courseId}/learner/concepts`,
    payload: { stableKey: "partial-recall", title: "Partial recall", description: "An incomplete attempt should not enter a scored denominator." },
  });
  assert.equal(partialConcept.statusCode, 201, partialConcept.body);
  const incompleteAttempt = await app.inject({
    method: "POST", url: `/api/courses/${courseId}/learner/attempts`,
    payload: {
      conceptId: partialConcept.json().id, activityType: "recall", prompt: "State the rule", response: "Partially remembered",
      reasoning: "", confidence: 0.5, hintCount: 1, method: "worked-example", outcome: "incomplete", sourceRefs: [],
      independence: "hinted", rationale: "Learner stopped before a scorable response.",
    },
  });
  assert.equal(incompleteAttempt.statusCode, 201, incompleteAttempt.body);
  const ungradedAttempt = await app.inject({
    method: "POST", url: `/api/courses/${courseId}/learner/attempts`,
    payload: {
      conceptId: partialConcept.json().id, activityType: "recall", prompt: "What is the rule?", response: "I am not sure",
      reasoning: "", confidence: 0.2, hintCount: 0, method: "explanation", outcome: "not-graded", sourceRefs: [],
      independence: "unknown", rationale: "This response needs review before scoring.",
    },
  });
  assert.equal(ungradedAttempt.statusCode, 201, ungradedAttempt.body);
  const profileWithUnscored = await app.inject({ method: "GET", url: `/api/courses/${courseId}/learner/profile` });
  const unscoredConceptSignal = profileWithUnscored.json().concepts.find((item: { id: string }) => item.id === partialConcept.json().id);
  assert.deepEqual([unscoredConceptSignal.attemptCount, unscoredConceptSignal.scoredAttemptCount, unscoredConceptSignal.correctCount], [2, 0, 0]);
  const methodProgressWithIncomplete = await app.inject({ method: "GET", url: `/api/courses/${courseId}/learner/method-progress` });
  assert.deepEqual(methodProgressWithIncomplete.json().map(({ method, attemptCount, scoredAttemptCount, confidenceRatedAttemptCount, meanConfidenceGap, correctCount, topicCount, topicTitles }: { method: string; attemptCount: number; scoredAttemptCount: number; confidenceRatedAttemptCount: number; meanConfidenceGap: number | null; correctCount: number; topicCount: number; topicTitles: string[] }) => [method, attemptCount, scoredAttemptCount, confidenceRatedAttemptCount, meanConfidenceGap, correctCount, topicCount, topicTitles]), [
    ["explanation", 2, 1, 1, 0.25, 1, 2, ["Bell states", "Partial recall"]],
    ["retrieval-practice", 2, 2, 2, 0.375, 1, 1, ["Bell states"]],
    ["worked-example", 1, 0, 0, null, 0, 1, ["Partial recall"]],
  ]);
  const explanationTopicResults = methodProgressWithIncomplete.json()[0].topicProgress;
  assert.deepEqual(explanationTopicResults.map(({ title, attemptCount, scoredAttemptCount, correctCount, confidenceRatedAttemptCount, meanConfidenceGap }: { title: string; attemptCount: number; scoredAttemptCount: number; correctCount: number; confidenceRatedAttemptCount: number; meanConfidenceGap: number | null }) => [title, attemptCount, scoredAttemptCount, correctCount, confidenceRatedAttemptCount, meanConfidenceGap]), [
    ["Bell states", 1, 1, 1, 1, 0.25],
    ["Partial recall", 1, 0, 0, 0, null],
  ]);

  const adaptiveQuestion = await app.inject({
    method: "POST",
    url: `/api/courses/${courseId}/learner/study-sessions/${secondSession.json().sessionId}/next-question`,
    payload: {},
  });
  assert.equal(adaptiveQuestion.statusCode, 200, adaptiveQuestion.body);
  assert.equal(adaptiveQuestion.json().assessmentId, assessmentId);
  assert.match(prompts.at(-1) ?? "", /preserve the instructor's wording/);
  const adaptiveGenerationInput = JSON.parse((prompts.at(-1) ?? "").split("INPUT_JSON\n\n")[1] ?? "{}");
  assert.deepEqual(adaptiveGenerationInput.assessmentScope, {
    id: assessmentId,
    title: "Midterm 2",
    topic: "Bell states",
  });

  await app.close();
  await rm(root, { recursive: true });
});

test("study methods send distinct learning directions", async () => {
  const { app, root, prompts } = await createAppWithStudyModel();
  const course = await app.inject({ method: "POST", url: "/api/courses", payload: { title: "Quantum Information" } });
  const courseId = course.json().id as string;
  const methods = [
    ["explanation", /core idea, build intuition/],
    ["worked-example", /complete worked example/],
    ["quiz", /Use retrieval first/],
    ["analogy", /concrete analogy/],
  ] as const;
  for (const [method, direction] of methods) {
    const response = await app.inject({
      method: "POST",
      url: `/api/courses/${courseId}/learner/study-session`,
      payload: { topic: `Method check: ${method}`, method },
    });
    assert.equal(response.statusCode, 200, response.body);
    assert.equal(response.json().method, method);
    assert.match(prompts.at(-1) ?? "", direction);
  }
  assert.equal(prompts.length, methods.length);
  await app.close();
  await rm(root, { recursive: true });
});

test("quiz study, saved answer, method progress, and Obsidian export work together in a disposable class", async () => {
  const { app, root, prompts } = await createAppWithStudyModel();
  try {
    const course = await app.inject({ method: "POST", url: "/api/courses", payload: { title: "Disposable study-method check" } });
    const courseId = course.json().id as string;
    const vaultPath = join(root, "vault");
    await mkdir(vaultPath, { recursive: true });
    const config = await app.inject({ method: "POST", url: "/api/obsidian/config", payload: { vaultPath } });
    assert.equal(config.statusCode, 200, config.body);
    const upload = uploadPayload("Bell-states.md", "Bell states are entangled two-qubit states.");
    const material = await app.inject({
      method: "POST", url: `/api/courses/${courseId}/materials?kind=reading`,
      headers: { "content-type": upload.contentType }, payload: upload.payload,
    });
    assert.equal(material.statusCode, 201, material.body);
    const assessment = await app.inject({
      method: "POST", url: `/api/courses/${courseId}/learner/assessments`,
      payload: { title: "Professor's Bell states scope", kind: "exam", topics: [{ title: "Bell states", importance: "high", provenance: "learner" }] },
    });
    assert.equal(assessment.statusCode, 201, assessment.body);
    const study = await app.inject({
      method: "POST", url: `/api/courses/${courseId}/learner/study-session`,
      payload: { topic: "Bell states", method: "quiz", sourceMaterialId: material.json().id, assessmentId: assessment.json().id },
    });
    assert.equal(study.statusCode, 200, study.body);
    assert.equal(study.json().sourceBasis, "course-materials");
    assert.equal(study.json().method, "quiz");
    assert.match(prompts.at(-1) ?? "", /Use retrieval first/);
    const attempt = await app.inject({
      method: "POST", url: `/api/courses/${courseId}/learner/attempts`,
      payload: {
        sessionId: study.json().sessionId, conceptId: study.json().conceptId, assessmentId: assessment.json().id,
        activityType: "recognition", prompt: study.json().question, response: study.json().options[study.json().answerIndex],
        reasoning: "", confidence: 0.75, hintCount: 0, method: "quiz", outcome: "correct",
        sourceRefs: [{ materialId: material.json().id }], independence: "independent", rationale: "Disposable integration attempt.",
      },
    });
    assert.equal(attempt.statusCode, 201, attempt.body);
    const profile = await app.inject({ method: "GET", url: `/api/courses/${courseId}/learner/profile` });
    assert.deepEqual([profile.json().assessments[0].attemptCount, profile.json().assessments[0].correctCount], [1, 1]);
    const methodProgress = await app.inject({ method: "GET", url: `/api/courses/${courseId}/learner/method-progress` });
    assert.deepEqual(methodProgress.json().map(({ method, attemptCount, scoredAttemptCount, correctCount, topicCount, topicTitles }: { method: string; attemptCount: number; scoredAttemptCount: number; correctCount: number; topicCount: number; topicTitles: string[] }) => [method, attemptCount, scoredAttemptCount, correctCount, topicCount, topicTitles]), [
      ["retrieval-practice", 1, 1, 1, 1, ["Bell states"]],
    ]);
    assert.deepEqual(methodProgress.json()[0].topicProgress.map(({ title, attemptCount, scoredAttemptCount, correctCount, confidenceRatedAttemptCount, meanConfidenceGap }: { title: string; attemptCount: number; scoredAttemptCount: number; correctCount: number; confidenceRatedAttemptCount: number; meanConfidenceGap: number | null }) => [title, attemptCount, scoredAttemptCount, correctCount, confidenceRatedAttemptCount, meanConfidenceGap]), [
      ["Bell states", 1, 1, 1, 1, 0.25],
    ]);
    const exported = await app.inject({ method: "POST", url: `/api/courses/${courseId}/obsidian/export` });
    assert.equal(exported.statusCode, 200, exported.body);
    assert.equal(exported.json().notesWritten, 3);
    const courseNote = await readFile(join(vaultPath, exported.json().courseFolder, "Course.md"), "utf8");
    assert.match(courseNote, /## Practice by study approach[\s\S]*Quiz first:\*\* 1\/1 scored checks correct; confidence gap 25% across 1 rated check \(lower is closer to outcomes\); 1 total attempt/);
    assert.match(courseNote, /across 1 topic; topics: Bell states/);
    assert.match(courseNote, /by topic: Bell states \(1\/1 scored correct; 25% confidence gap across 1 rated; last practiced 2026-\d\d-\d\dT/);
    const assessmentFolder = join(vaultPath, exported.json().courseFolder, "assessments");
    const assessmentNote = await readFile(join(assessmentFolder, "professor-s-bell-states-scope--" + assessment.json().id.slice(0, 8) + ".md"), "utf8");
    assert.match(assessmentNote, /Bell states .*priority: high; .*1\/1 scored checks correct/);
  } finally {
    await app.close();
    await rm(root, { recursive: true, force: true });
  }
});

test("assignment study sessions retrieve only the selected course material and return course-grounded content", async () => {
  const { app, root, prompts } = await createAppWithStudyModel();
  const course = await app.inject({ method: "POST", url: "/api/courses", payload: { title: "Quantum Information" } });
  const courseId = course.json().id as string;
  const upload = uploadPayload("Homework3_student.md", "# Homework 3\n\nHOMEWORK_EVIDENCE_SENTINEL: derive the Bell-state probabilities from the circuit.");
  const materialResponse = await app.inject({
    method: "POST",
    url: `/api/courses/${courseId}/materials?kind=assignment`,
    headers: { "content-type": upload.contentType },
    payload: upload.payload,
  });
  assert.equal(materialResponse.statusCode, 201);
  const materialId = materialResponse.json().id as string;

  const session = await app.inject({
    method: "POST",
    url: `/api/courses/${courseId}/learner/study-session`,
    payload: { topic: "Homework 3", method: "explanation", sourceMaterialId: materialId },
  });
  assert.equal(session.statusCode, 200, session.body);
  assert.equal(session.json().sourceBasis, "course-materials");
  assert.equal(session.json().sourceMaterialId, materialId);
  assert.equal(session.json().topic, "Homework 3");
  assert.match(prompts[0] ?? "", /HOMEWORK_EVIDENCE_SENTINEL/);
  const legacyDb = new DatabaseSync(join(root, "data", "studio.sqlite"));
  legacyDb.prepare(`UPDATE study_sessions SET content_json=json_set(
    json_remove(content_json,'$.sourceMaterialId'),
    '$.lesson',json_extract(content_json,'$.lesson') || ' Source: Homework3_student.md'
  ) WHERE id=?`).run(session.json().sessionId);
  legacyDb.close();
  const lessonOnlyProfile = await app.inject({ method: "GET", url: `/api/courses/${courseId}/learner/profile` });
  const lessonOnlySource = lessonOnlyProfile.json().sources.find((item: { materialId: string }) => item.materialId === materialId);
  assert.deepEqual([lessonOnlySource.sessionCount, lessonOnlySource.topics[0].sessionCount, lessonOnlySource.topics[0].attemptCount], [1, 1, 0]);
  assert.equal(lessonOnlyProfile.json().concepts.find((item: { id: string }) => item.id === session.json().conceptId).attemptCount, 0);
  const reopenedLegacySession = await app.inject({ method: "GET", url: `/api/courses/${courseId}/learner/study-sessions/${session.json().sessionId}` });
  assert.equal(reopenedLegacySession.statusCode, 200, reopenedLegacySession.body);
  assert.equal(reopenedLegacySession.json().sourceMaterialId, materialId, "a unique exact imported filename citation restores the legacy homework context");

  const attempt = await app.inject({
    method: "POST", url: `/api/courses/${courseId}/learner/attempts`,
    payload: {
      sessionId: session.json().sessionId, conceptId: session.json().conceptId,
      activityType: "recognition", prompt: session.json().question, response: "uncertain", reasoning: "",
      confidence: 0.5, hintCount: 1, method: "quiz", outcome: "incorrect",
      sourceRefs: [],
      independence: "hinted", rationale: "Source-specific progress check.",
    },
  });
  assert.equal(attempt.statusCode, 201, attempt.body);
  const remediation = await app.inject({
    method: "POST",
    url: `/api/courses/${courseId}/learner/study-session`,
    payload: {
      topic: "Homework 3",
      method: "worked-example",
      sourceMaterialId: materialId,
      reviewSessionId: session.json().sessionId,
    },
  });
  assert.equal(remediation.statusCode, 200, remediation.body);
  assert.equal(remediation.json().sourceMaterialId, materialId);
  const remediationInput = JSON.parse(prompts.at(-1)!.split("INPUT_JSON\n\n")[1]!);
  assert.ok(remediationInput.sourceMaterial.passages.some((passage: { content: string }) => passage.content.includes("HOMEWORK_EVIDENCE_SENTINEL")));
  assert.deepEqual(remediationInput.followUpEvidence.map(({ outcome, response }: { outcome: string; response: string }) => [outcome, response]), [["incorrect", "uncertain"]]);
  const progress = await app.inject({ method: "GET", url: `/api/courses/${courseId}/learner/profile` });
  const sourceSignal = progress.json().sources.find((item: { materialId: string }) => item.materialId === materialId);
  assert.deepEqual([sourceSignal.attemptCount, sourceSignal.correctCount, sourceSignal.practicedTopicCount], [1, 0, 1]);
  assert.equal(sourceSignal.sessionCount, 2, "the focused remediation lesson is also attached to the selected source");
  assert.deepEqual([sourceSignal.topics[0].attemptCount, sourceSignal.topics[0].latestOutcome], [1, "incorrect"]);
  assert.equal(progress.json().sources.some((item: { materialId: string; attemptCount: number }) => item.materialId !== materialId && item.attemptCount), false);

  const invalidSource = await app.inject({
    method: "POST",
    url: `/api/courses/${courseId}/learner/study-session`,
    payload: { topic: "Homework 3", sourceMaterialId: randomUUID() },
  });
  assert.equal(invalidSource.statusCode, 422);
  assert.equal(prompts.length, 2, "unowned materials must be rejected before the model call");

  const duplicateUpload = uploadPayload("Homework3_student.md", "A second import with the same filename makes legacy source matching ambiguous.");
  const duplicateMaterial = await app.inject({
    method: "POST", url: `/api/courses/${courseId}/materials?kind=assignment`,
    headers: { "content-type": duplicateUpload.contentType }, payload: duplicateUpload.payload,
  });
  assert.equal(duplicateMaterial.statusCode, 201, duplicateMaterial.body);
  const ambiguousProfile = await app.inject({ method: "GET", url: `/api/courses/${courseId}/learner/profile` });
  assert.equal(ambiguousProfile.json().sources.find((item: { materialId: string }) => item.materialId === materialId).sessionCount, 1, "the directly linked remediation session retains its source even if a legacy filename becomes ambiguous");
  const ambiguousSession = await app.inject({ method: "GET", url: `/api/courses/${courseId}/learner/study-sessions/${session.json().sessionId}` });
  assert.equal(ambiguousSession.json().sourceMaterialId, null, "ambiguous imported filenames must not be guessed");

  await app.close();
  await rm(root, { recursive: true });
});

test("adaptive questions preserve homework and assessment grounding", async () => {
  const { app, root, prompts } = await createAppWithStudyModel();
  const course = await app.inject({ method: "POST", url: "/api/courses", payload: { title: "Quantum Information" } });
  const courseId = course.json().id as string;
  const upload = uploadPayload("Homework3_student.md", "# Homework 3\n\nADAPTIVE_SOURCE_SENTINEL: derive probabilities from the supplied circuit.");
  const material = await app.inject({
    method: "POST",
    url: `/api/courses/${courseId}/materials?kind=assignment`,
    headers: { "content-type": upload.contentType },
    payload: upload.payload,
  });
  const assessment = await app.inject({
    method: "POST",
    url: `/api/courses/${courseId}/learner/assessments`,
    payload: { title: "Homework 3", kind: "quiz", topics: [{ title: "Homework 3", importance: "normal", provenance: "learner" }] },
  });
  const session = await app.inject({
    method: "POST",
    url: `/api/courses/${courseId}/learner/study-session`,
    payload: { topic: "Homework 3", method: "explanation", sourceMaterialId: material.json().id, assessmentId: assessment.json().id },
  });
  assert.equal(session.statusCode, 200, session.body);
  const generalAttempt = await app.inject({
    method: "POST",
    url: `/api/courses/${courseId}/learner/attempts`,
    payload: {
      conceptId: session.json().conceptId, activityType: "recognition", prompt: "General practice", response: "general-only",
      reasoning: "", confidence: 0.9, hintCount: 0, method: "quiz", outcome: "correct", sourceRefs: [],
      independence: "independent", rationale: "Unscoped practice must stay out of this homework's adaptive history.",
    },
  });
  assert.equal(generalAttempt.statusCode, 201, generalAttempt.body);
  const attempt = await app.inject({
    method: "POST",
    url: `/api/courses/${courseId}/learner/attempts`,
    payload: {
      sessionId: session.json().sessionId, conceptId: session.json().conceptId, assessmentId: assessment.json().id,
      activityType: "recognition", prompt: session.json().question, response: "unsure", reasoning: "",
      confidence: 0.25, hintCount: 1, method: "explanation", outcome: "incorrect", sourceRefs: [],
      independence: "hinted", rationale: "Test adaptive focus on the assessment evidence.",
    },
  });
  assert.equal(attempt.statusCode, 201, attempt.body);

  const next = await app.inject({
    method: "POST",
    url: `/api/courses/${courseId}/learner/study-sessions/${session.json().sessionId}/next-question`,
    payload: {},
  });
  assert.equal(next.statusCode, 200, `${next.body} · model calls: ${prompts.length}`);
  assert.equal(next.json().sourceMaterialId, material.json().id);
  assert.equal(next.json().assessmentId, assessment.json().id);
  assert.match(prompts[1] ?? "", /ADAPTIVE_SOURCE_SENTINEL/);
  assert.match(prompts[1] ?? "", /learner-provided assessment topic/);
  const adaptiveInput = JSON.parse((prompts[1] ?? "").split("INPUT_JSON\n\n")[1] ?? "{}");
  assert.equal(adaptiveInput.sourceMaterial.id, material.json().id);
  assert.equal(adaptiveInput.assessmentScope.title, "Homework 3");
  assert.equal(adaptiveInput.recentAttempts.length, 1);
  assert.equal(adaptiveInput.recentAttempts[0].outcome, "incorrect");

  await app.close();
  await rm(root, { recursive: true });
});
