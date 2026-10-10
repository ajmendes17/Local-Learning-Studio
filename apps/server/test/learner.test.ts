import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { mkdir, mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { DatabaseSync } from "node:sqlite";
import { join } from "node:path";
import test from "node:test";
import { allocateAssessmentStudyPlan, allocateStudyMinutes, assessmentDeadlineLabel, assessmentScheduleOverflowMinutes, getSpacedReviewSchedule, normalizeMathText, parseInstructorTopicList, prioritizeStudyRecommendations, recommendNextStudyTopic, scheduleAssessmentStudyDays, StudySessionContentSchema, studyPlanReasonLabel, summarizeStudyCoverage, summarizeTopicProgress } from "@local-learning-studio/contracts";
import type { AppOptions } from "../src/app.js";
import { buildApp } from "../src/app.js";
import { CodexRunError } from "../src/codex/codex-runner.js";
import { openDatabase } from "../src/storage/database.js";
import { LearningArtifactLibrary } from "../src/storage/learning-artifact-library.js";
import { SourceLibrary } from "../src/storage/source-library.js";

test("study recommendations prefer nearer upcoming assessments when signals tie", () => {
  const soon = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString();
  const later = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString();
  const recommendations = prioritizeStudyRecommendations([
    { title: "Later exam topic", reason: "not-practiced" as const, importance: "normal" as const, scheduledAt: later, contextPriority: 0 },
    { title: "No date topic", reason: "not-practiced" as const, importance: "normal" as const, scheduledAt: null, contextPriority: 0 },
    { title: "Soon exam topic", reason: "not-practiced" as const, importance: "normal" as const, scheduledAt: soon, contextPriority: 4 },
    { title: "Missed topic", reason: "needs-review" as const, importance: "normal" as const, scheduledAt: later, contextPriority: 0 },
  ]);

  assert.deepEqual(recommendations.map(({ title }) => title), [
    "Missed topic",
    "Soon exam topic",
    "Later exam topic",
    "No date topic",
  ]);
});

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

async function createAppWithStudyModel(options: { corruptMath?: boolean; failure?: boolean; invalidErrorAnalysis?: boolean; invalidAdaptiveErrorAnalysis?: boolean } = {}) {
  const root = await mkdtemp(join(tmpdir(), "learning-studio-learner-"));
  const prompts: string[] = [];
  const controlCharacter = options.corruptMath ? String.fromCharCode(127) : "";
  const codex = {
    status: async () => ({ installed: true, authenticated: true, ready: true }),
    run: async (task: any, prompt: string, outputSchema: any) => {
      prompts.push(prompt);
      if (options.failure) throw new CodexRunError("execution_failed", `Codex failed while running ${task}.`, "The selected local model is unavailable.");
      const output = outputSchema.parse({
        lesson: options.corruptMath
          ? `## Source-grounded idea\n\nThe key operation is $H${controlCharacter}\\lvert 0\\rangle = (\\lvert 0\\rangle + \\lvert 1\\rangle)/\\sqrt{2}$.`
          : "## Source-grounded idea\n\nThe key operation is $H\\lvert 0\\rangle = (\\lvert 0\\rangle + \\lvert 1\\rangle)/\\sqrt{2}$.",
        example: /Teach through error analysis|four-step numbered worked solution/.test(prompt)
          ? options.invalidErrorAnalysis ? "Inspect this solution and find the issue." : "1. State the given values.\n2. Substitute into the relation.\n3. Reverse the relation incorrectly.\n4. Simplify the result."
          : options.corruptMath ? `Apply the stated operation to $${controlCharacter}\\ket{0}$.` : "Apply the stated operation to the source problem.",
        question: /Teach through error analysis|four-step numbered worked solution/.test(prompt)
          ? options.invalidAdaptiveErrorAnalysis && task === "generate-adaptive-practice"
            ? "Inspect this solution and find the issue."
            : "1. State the given values.\n2. Substitute into the relation.\n3. Reverse the relation incorrectly.\n4. Simplify the result.\n\nWhich step first becomes invalid?"
          : prompt.includes("Use a teach-back exercise")
          ? "Teach back the main idea and explain why it holds."
          : options.corruptMath ? `Which state $${controlCharacter}\\ket{\\psi}$ does the source operation produce?` : "Which state does the source operation produce?",
        options: prompt.includes("Start with unaided free recall") || prompt.includes("Use a teach-back exercise") ? [] : [options.corruptMath ? `$${controlCharacter}\\lvert 0\\rangle$` : "$\\lvert 0\\rangle$", "$\\lvert 1\\rangle$", "$\\lvert +\\rangle$", "$\\lvert -\\rangle$"],
        answerIndex: prompt.includes("Start with unaided free recall") || prompt.includes("Use a teach-back exercise") ? null : 2,
        feedback: options.corruptMath ? `The source identifies $${controlCharacter}\\ket{+}$.` : "The source identifies the equal superposition.",
        clarification: options.corruptMath ? `The operation creates both components of $${controlCharacter}\\ket{\\psi}$.` : "The operation creates both basis components.",
        hints: [options.corruptMath ? `Check the coefficient of $${controlCharacter}\\ket{0}$.` : "Check the coefficients in the source."],
      });
      return { task, model: "test-model", startedAt: new Date().toISOString(), durationMs: 1, output };
    },
  } as unknown as NonNullable<AppOptions["codex"]>;
  const app = buildApp({ databasePath: join(root, "data", "studio.sqlite"), courseRoot: join(root, "courses"), codex });
  return { app, root, prompts };
}

test("study generation exposes a safe CLI diagnostic for troubleshooting", async () => {
  const { app, root } = await createAppWithStudyModel({ failure: true });
  const course = await app.inject({ method: "POST", url: "/api/courses", payload: { title: "Study diagnostic" } });
  const courseId = course.json().id as string;
  const failed = await app.inject({
    method: "POST",
    url: `/api/courses/${courseId}/learner/study-session`,
    payload: { topic: "Bell states", method: "explanation" },
  });

  assert.equal(failed.statusCode, 502);
  assert.equal(failed.json().error, "Codex failed while running compose-study-lesson.");
  assert.equal(failed.json().detail, "The selected local model is unavailable.");
  assert.deepEqual(failed.json().diagnostics, { task: "compose-study-lesson", code: "execution_failed" });

  await app.close();
  await rm(root, { recursive: true, force: true });
});

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

test("professor topic-list parser removes common copied scope headings", () => {
  assert.deepEqual(parseInstructorTopicList([
    "Exam topics: conservation laws, Newton's laws",
    "Topics for the midterm include: energy methods",
    "The final will cover: wave functions; operators",
    "Scope for the quiz: measurement",
  ].join("\n")), [
    "conservation laws",
    "Newton's laws",
    "energy methods",
    "wave functions",
    "operators",
    "measurement",
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
  const now = Date.parse("2026-10-10T12:00:00.000Z");
  const plan = allocateAssessmentStudyPlan([
    { id: "missed", title: "Missed high-priority topic", importance: "high" as const, attemptCount: 2, scoredAttemptCount: 2, correctCount: 0, latestOutcome: "incorrect", sessionCount: 1 },
    { id: "steady", title: "Recent steady topic", importance: "normal" as const, attemptCount: 3, scoredAttemptCount: 3, correctCount: 3, latestOutcome: "correct", sessionCount: 2, lastPracticedAt: "2026-10-10T12:00:00.000Z" },
    { id: "new", title: "Untouched topic", importance: "normal" as const, attemptCount: 0, scoredAttemptCount: 0, correctCount: 0, latestOutcome: null, sessionCount: 0 },
  ], 90, now);
  assert.equal(plan.reduce((sum, item) => sum + item.minutes, 0), 90);
  assert.ok(plan[0]!.minutes > plan[1]!.minutes, "missed, high-priority evidence should receive more than a strong recent result");
  assert.ok(plan[2]!.minutes > 0, "untouched topics should retain some preparation time");
  assert.deepEqual(plan[0]!.reasons.map(studyPlanReasonLabel), ["marked high priority", "latest response needs another pass", "below 60% across at least two scored checks"]);
  assert.deepEqual(plan[1]!.reasons.map(studyPlanReasonLabel), ["at least 85% across scored checks"]);
  assert.deepEqual(plan[2]!.reasons.map(studyPlanReasonLabel), ["not practiced yet"]);
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
  const missingDeadline = scheduleAssessmentStudyDays([{ title: "Topic", minutes: 90 }], null, 45, now);
  assert.equal(missingDeadline.status, "missing-deadline");
  assert.equal(missingDeadline.unscheduledMinutes, 90);
  assert.equal(assessmentScheduleOverflowMinutes(missingDeadline), 0, "a missing date needs a date, not a capacity warning");
  const pastDeadline = scheduleAssessmentStudyDays([{ title: "Topic", minutes: 30 }], new Date(2026, 9, 9, 12).toISOString(), 45, now);
  assert.equal(pastDeadline.status, "deadline-passed");
  assert.equal(assessmentScheduleOverflowMinutes(pastDeadline), 0, "a past date needs updating, not a capacity warning");
  assert.equal(assessmentScheduleOverflowMinutes(overCapacity), 75);
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
    { title: "Partial trace", sessionCount: 0, attemptCount: 2, scoredAttemptCount: 1, independentScoredAttemptCount: 1, independentCorrectCount: 0, correctCount: 1, latestOutcome: "incorrect" },
    { title: "Unrelated topic", sessionCount: 9, attemptCount: 9, correctCount: 9 },
  ]), {
    topicCount: 2,
    lessonTopicCount: 1,
    checkedTopicCount: 1,
    independentlyCheckedTopicCount: 1,
    uncheckedTopicCount: 1,
    reviewTopicCount: 1,
    attemptCount: 2,
    scoredAttemptCount: 1,
    correctCount: 1,
    independentScoredAttemptCount: 1,
    independentCorrectCount: 0,
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

  const lowAccuracyTopic = { title: "Partial trace", importance: "high" as const };
  const lowAccuracy = recommendNextStudyTopic([lowAccuracyTopic, topics[2]!], [
    { title: "Partial trace", attemptCount: 5, scoredAttemptCount: 5, correctCount: 2, latestOutcome: "correct", lastPracticedAt: "2026-10-10T10:00:00.000Z" },
    { title: "Teleportation", attemptCount: 3, scoredAttemptCount: 3, correctCount: 3, latestOutcome: "correct", lastPracticedAt: "2026-10-09T10:00:00.000Z" },
  ]);
  assert.deepEqual(lowAccuracy, { topic: lowAccuracyTopic, reason: "low-scored-accuracy" }, "a correct latest answer should not hide a repeated low score from the next-study recommendation");
  const legacyCountOnly = recommendNextStudyTopic([lowAccuracyTopic], [
    { title: "Partial trace", attemptCount: 5, correctCount: 1, latestOutcome: "correct" },
  ]);
  assert.deepEqual(legacyCountOnly, { topic: lowAccuracyTopic, reason: "least-recently-practiced" }, "missing scored denominators must not be treated as low accuracy");

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
  assert.deepEqual(unscored, { topic: topics[0], reason: "needs-scored-check" });
  const priority = recommendNextStudyTopic([
    { title: "Optional detail", importance: "low" },
    { title: "Core theorem", importance: "high" },
  ], []);
  assert.deepEqual(priority, { topic: { title: "Core theorem", importance: "high" }, reason: "not-practiced" });
  assert.equal(recommendNextStudyTopic([], []), null);
});

test("spaced recall uses shorter intervals for uncertain evidence and extends after independent success", () => {
  const now = Date.parse("2026-10-10T12:00:00.000Z");
  const base = {
    latestOutcome: "correct",
    scoredAttemptCount: 3,
    correctCount: 3,
    independentScoredAttemptCount: 2,
    independentCorrectCount: 2,
    lastPracticedAt: "2026-10-03T12:00:00.000Z",
  };

  assert.deepEqual(getSpacedReviewSchedule(base, now), {
    intervalDays: 7,
    dueAt: "2026-10-10T12:00:00.000Z",
    due: true,
  });
  assert.equal(getSpacedReviewSchedule({ ...base, latestConfidence: 0.5 }, now)?.intervalDays, 1);
  assert.equal(getSpacedReviewSchedule({ ...base, correctCount: 1 }, now)?.intervalDays, 1);
  assert.equal(getSpacedReviewSchedule({ ...base, independentScoredAttemptCount: 0, independentCorrectCount: 0 }, now)?.intervalDays, 3);
  assert.equal(getSpacedReviewSchedule({ ...base, latestOutcome: "incorrect" }, now), null);
  assert.equal(getSpacedReviewSchedule({ ...base, latestOutcome: "not-graded" }, now), null);
  assert.equal(getSpacedReviewSchedule({ ...base, lastPracticedAt: "not-a-date" }, now), null);
});

test("recommendations surface due spaced recall and show the next date before it is due", () => {
  const topics = [{ title: "Bell states" }, { title: "Partial trace" }];
  const now = Date.parse("2026-10-10T12:00:00.000Z");
  const signals = [
    { title: "Bell states", attemptCount: 3, scoredAttemptCount: 3, correctCount: 3, latestOutcome: "correct", lastPracticedAt: "2026-10-03T12:00:00.000Z" },
    { title: "Partial trace", attemptCount: 1, scoredAttemptCount: 1, correctCount: 1, latestOutcome: "correct", lastPracticedAt: "2026-10-09T12:00:00.000Z" },
  ];
  const independence = [
    { title: "Bell states", scoredAttemptCount: 3, independentScoredAttemptCount: 2, independentCorrectCount: 2 },
    { title: "Partial trace", scoredAttemptCount: 1, independentScoredAttemptCount: 1, independentCorrectCount: 1 },
  ];
  const confidence = [
    { title: "Bell states", latestOutcome: "correct", latestConfidence: 0.75 },
    { title: "Partial trace", latestOutcome: "correct", latestConfidence: 0.75 },
  ];

  assert.deepEqual(recommendNextStudyTopic(topics, signals, independence, confidence, now), {
    topic: topics[0],
    reason: "spaced-review",
    nextReviewAt: "2026-10-10T12:00:00.000Z",
  });

  const upcoming = recommendNextStudyTopic(topics.slice(1), [signals[1]!], [independence[1]!], [confidence[1]!], now);
  assert.deepEqual(upcoming, {
    topic: topics[1],
    reason: "least-recently-practiced",
    nextReviewAt: "2026-10-12T12:00:00.000Z",
  });
});

test("class recommendation distinguishes lesson-only topics and suggests their first knowledge check", () => {
  const topics = [
    { title: "Bell states", attemptCount: 0, sessionCount: 2, latestOutcome: null, lastPracticedAt: null, lastSessionAt: "2026-10-09T12:00:00.000Z" },
    { title: "Partial trace", attemptCount: 1, sessionCount: 1, latestOutcome: "correct", lastPracticedAt: "2026-10-09T10:00:00.000Z", lastSessionAt: "2026-10-09T10:00:00.000Z" },
  ];
  assert.deepEqual(recommendNextStudyTopic(topics, topics), { topic: topics[0], reason: "lesson-only" });
  assert.deepEqual(recommendNextStudyTopic([{ title: "No lesson yet" }], []), { topic: { title: "No lesson yet" }, reason: "not-practiced" });
});

test("recommendations ask for an independent check after assisted-only correct attempts", () => {
  const topics = [{ title: "Bell states" }, { title: "Partial trace" }, { title: "Untouched" }];
  const signals = [
    { title: "Bell states", attemptCount: 2, latestOutcome: "correct", lastPracticedAt: "2026-10-08T10:00:00.000Z" },
    { title: "Partial trace", attemptCount: 1, latestOutcome: "correct", lastPracticedAt: "2026-10-09T10:00:00.000Z" },
  ];
  const independence = [
    { title: "Bell states", scoredAttemptCount: 2, independentScoredAttemptCount: 0 },
    { title: "Partial trace", scoredAttemptCount: 1, independentScoredAttemptCount: 0 },
  ];
  assert.deepEqual(recommendNextStudyTopic(topics.slice(0, 2), signals, independence), { topic: topics[0], reason: "needs-independent-check" });
  const lowConfidence = [
    { title: "Bell states", latestOutcome: "correct", latestConfidence: 0.5 },
    { title: "Partial trace", latestOutcome: "correct", latestConfidence: 0.75 },
  ];
  const independentlyChecked = independence.map((signal) => ({ ...signal, independentScoredAttemptCount: signal.scoredAttemptCount }));
  assert.deepEqual(recommendNextStudyTopic(topics.slice(0, 2), signals, independentlyChecked, lowConfidence), { topic: topics[0], reason: "low-confidence-correct" });
  assert.deepEqual(recommendNextStudyTopic(topics.slice(0, 2), signals, independentlyChecked, lowConfidence.map((signal) => ({ ...signal, latestConfidence: 0.75 }))), { topic: topics[0], reason: "least-recently-practiced" });
  assert.deepEqual(recommendNextStudyTopic(topics, signals, independentlyChecked, lowConfidence), { topic: topics[0], reason: "low-confidence-correct" });
  assert.deepEqual(recommendNextStudyTopic(topics.slice(0, 2), [
    { ...signals[0]!, latestOutcome: "incorrect" }, signals[1]!,
  ], independence), { topic: topics[0], reason: "needs-review" });
  assert.deepEqual(recommendNextStudyTopic(topics, signals, independence), { topic: topics[0], reason: "needs-independent-check" });
  const scoredMiss = recommendNextStudyTopic(topics, [
    { title: "Bell states", attemptCount: 2, scoredAttemptCount: 1, latestOutcome: "incorrect", lastPracticedAt: "2026-10-09T10:00:00.000Z" },
    { title: "Partial trace", attemptCount: 2, scoredAttemptCount: 1, latestOutcome: "not-graded", lastPracticedAt: "2026-10-08T10:00:00.000Z" },
  ]);
  assert.deepEqual(scoredMiss, { topic: topics[0], reason: "needs-review" });
  const ungradedRecall = recommendNextStudyTopic(topics, [
    { title: "Bell states", attemptCount: 2, scoredAttemptCount: 1, latestOutcome: "not-graded", lastPracticedAt: "2026-10-09T10:00:00.000Z" },
    { title: "Partial trace", attemptCount: 1, scoredAttemptCount: 1, latestOutcome: "correct", lastPracticedAt: "2026-10-08T10:00:00.000Z" },
  ]);
  assert.deepEqual(ungradedRecall, { topic: topics[0], reason: "needs-scored-check" });
});

test("cross-scope recommendations preserve review urgency and instructor priority", () => {
  const candidates = [
    { title: "Low priority, newer miss", reason: "needs-review" as const, importance: "low" as const, lastPracticedAt: "2026-10-09T10:00:00.000Z", contextPriority: 0 },
    { title: "High priority, older miss", reason: "needs-review" as const, importance: "high" as const, lastPracticedAt: "2026-10-07T10:00:00.000Z", contextPriority: 3 },
    { title: "Lesson opened, no check", reason: "lesson-only" as const, importance: "normal" as const, contextPriority: 0 },
    { title: "High priority, untouched", reason: "not-practiced" as const, importance: "high" as const, contextPriority: 0 },
    { title: "No independent check yet", reason: "needs-independent-check" as const, importance: "high" as const, contextPriority: 0 },
    { title: "Low scored accuracy", reason: "low-scored-accuracy" as const, importance: "normal" as const, contextPriority: 0 },
    { title: "Correct, low confidence", reason: "low-confidence-correct" as const, importance: "high" as const, contextPriority: 0 },
    { title: "Normal priority, untouched", reason: "not-practiced" as const, importance: "normal" as const, contextPriority: 0 },
    { title: "Spaced review", reason: "spaced-review" as const, nextReviewAt: "2026-10-10T10:00:00.000Z", contextPriority: 0 },
    { title: "Least recently practiced", reason: "least-recently-practiced" as const, contextPriority: 0 },
  ];
  assert.deepEqual(prioritizeStudyRecommendations(candidates).map(({ title }) => title), [
    "High priority, older miss",
    "Low priority, newer miss",
    "Low scored accuracy",
    "No independent check yet",
    "Correct, low confidence",
    "Lesson opened, no check",
    "High priority, untouched",
    "Normal priority, untouched",
    "Spaced review",
    "Least recently practiced",
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

test("math text renders recognizable PDF Dirac notation without changing code or delimited math", () => {
  const extracted = "Use | + 〉 = (| 0 〉 + | 1 〉)/√2 and 〈Φ + | Ψ −〉 with 〈0|, then compare `| 00 〉` literally.";
  assert.equal(
    normalizeMathText(extracted),
    String.raw`Use $\ket{+}$ = ($\ket{0}$ + $\ket{1}$)/$\sqrt{2}$ and $\braket{\Phi^{+}|\Psi^{-}}$ with $\bra{0}$, then compare ` + "`| 00 〉`" + " literally.",
  );
  assert.equal(normalizeMathText(String.raw`Existing $|0\rangle$ and \(\lvert 1\rangle\)`), String.raw`Existing $|0\rangle$ and $\lvert 1\rangle$`);
  assert.equal(normalizeMathText("Dirac math: $| 0 〉 + | 1 〉$"), String.raw`Dirac math: $\ket{0} + \ket{1}$`);
  assert.equal(normalizeMathText("Projector: |+⟩⟨+|", { inline: true }), String.raw`Projector: $\ket{+}\bra{+}$`);
  assert.equal(normalizeMathText("For qubits, | a 〉 A ⊗ | b 〉 B."), String.raw`For qubits, $\ket{a}_A$ $\otimes$ $\ket{b}_B$.`);
  assert.equal(normalizeMathText("State |ψ₁⟩, Bell pair |Φ⁺⟩ and excited level |n²⟩."), String.raw`State $\ket{\psi_{1}}$, Bell pair $\ket{\Phi^{+}}$ and excited level $\ket{n^{2}}$.`);
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
  assert.deepEqual(reopened.json().attempts.map((item: { outcome: string; response: string; independence: string }) => [item.outcome, item.response, item.independence]), [["correct", session.json().options[session.json().answerIndex], "independent"]]);
  const profile = await app.inject({ method: "GET", url: `/api/courses/${courseId}/learner/profile` });
  const updated = profile.json().assessments[0];
  assert.equal(updated.attemptCount, 1);
  assert.equal(updated.correctCount, 1);
  assert.equal(updated.topics[0].attemptCount, 1);
  assert.equal(updated.topics[0].sessionCount, 1);
  assert.equal(updated.topics[0].correctCount, 1);
  assert.equal(updated.topics[0].latestOutcome, "correct");
  assert.equal(updated.topics[0].latestConfidence, 0.75, "assessment topic summaries retain the latest learner confidence");
  assert.equal(profile.json().concepts.find((item: { id: string }) => item.id === session.json().conceptId).latestConfidence, 0.75);

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
  assert.deepEqual([finalProfile.json().assessments[0].topics[0].independentScoredAttemptCount, finalProfile.json().assessments[0].topics[0].independentCorrectCount], [1, 1], "assessment progress separates independent from hinted attempts");
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
  const retrievalIndependence = methodProgressWithIncomplete.json().find((item: { method: string }) => item.method === "retrieval-practice");
  assert.deepEqual([retrievalIndependence.independentScoredAttemptCount, retrievalIndependence.independentCorrectCount, retrievalIndependence.hintedScoredAttemptCount, retrievalIndependence.hintedCorrectCount, retrievalIndependence.assistedScoredAttemptCount, retrievalIndependence.unknownIndependenceScoredAttemptCount], [1, 1, 1, 0, 0, 0]);
  assert.deepEqual([retrievalIndependence.topicProgress[0].independentScoredAttemptCount, retrievalIndependence.topicProgress[0].independentCorrectCount, retrievalIndependence.topicProgress[0].hintedScoredAttemptCount, retrievalIndependence.topicProgress[0].hintedCorrectCount], [1, 1, 1, 0]);
  const explanationIndependence = methodProgressWithIncomplete.json().find((item: { method: string }) => item.method === "explanation");
  assert.deepEqual([explanationIndependence.independentScoredAttemptCount, explanationIndependence.independentCorrectCount, explanationIndependence.unknownIndependenceScoredAttemptCount], [1, 1, 0]);
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

test("learner-data export includes the full class profile, saved sessions, and responses", async () => {
  const { app, root } = await createAppWithStudyModel();
  try {
    const course = await app.inject({ method: "POST", url: "/api/courses", payload: { title: "Portable data fixture" } });
    const courseId = course.json().id as string;
    const otherCourse = await app.inject({ method: "POST", url: "/api/courses", payload: { title: "Unaffected class" } });
    const otherCourseId = otherCourse.json().id as string;
    const otherScope = await app.inject({
      method: "POST", url: `/api/courses/${otherCourseId}/learner/assessments`,
      payload: { title: "Other class exam", kind: "exam", topics: [{ title: "Other topic", importance: "normal", provenance: "learner" }] },
    });
    assert.equal(otherScope.statusCode, 201, otherScope.body);
    const source = uploadPayload("Exam notes.md", "# Bell states\n\nThe professor emphasized relative phase and normalization.");
    const material = await app.inject({
      method: "POST", url: `/api/courses/${courseId}/materials?kind=reading`,
      headers: { "content-type": source.contentType }, payload: source.payload,
    });
    assert.equal(material.statusCode, 201, material.body);
    const passages = await app.inject({ method: "GET", url: `/api/courses/${courseId}/materials/${material.json().id}/passages` });
    const sourcePassageId = passages.json().passages[0].id as string;
    const annotation = await app.inject({
      method: "POST", url: `/api/courses/${courseId}/materials/${material.json().id}/annotations`,
      payload: { passageId: sourcePassageId, body: "Remember the relative phase." },
    });
    assert.equal(annotation.statusCode, 201, annotation.body);
    const scope = await app.inject({
      method: "POST", url: `/api/courses/${courseId}/learner/assessments`,
      payload: { title: "Final review", kind: "exam", topics: [{ title: "Bell states", importance: "high", provenance: "learner" }] },
    });
    assert.equal(scope.statusCode, 201, scope.body);
    const session = await app.inject({
      method: "POST", url: `/api/courses/${courseId}/learner/study-session`,
      payload: { topic: "Bell states", method: "quiz", assessmentId: scope.json().id },
    });
    assert.equal(session.statusCode, 200, session.body);
    const responseText = "I remembered the two amplitudes and their relative phase.";
    const saved = await app.inject({
      method: "POST", url: `/api/courses/${courseId}/learner/attempts`,
      payload: {
        sessionId: session.json().sessionId, conceptId: session.json().conceptId,
        assessmentId: scope.json().id, activityType: "recognition", prompt: session.json().question,
        response: responseText, reasoning: "A short reasoning note.", confidence: 0.75,
        hintCount: 1, method: "quiz", outcome: "correct", sourceRefs: [{ materialId: material.json().id, passageId: sourcePassageId }],
        independence: "hinted", rationale: "Correct after using one hint.",
      },
    });
    assert.equal(saved.statusCode, 201, saved.body);

    const exported = await app.inject({ method: "GET", url: `/api/courses/${courseId}/learner/export` });
    assert.equal(exported.statusCode, 200, exported.body);
    assert.match(exported.headers["content-disposition"] ?? "", new RegExp(`attachment; filename="local-learning-studio-${courseId}-learner-data\\.json"`));
    assert.equal(exported.headers["cache-control"], "no-store");
    const data = exported.json();
    assert.equal(data.exportVersion, 2);
    assert.equal(data.classId, courseId);
    assert.deepEqual(data.course, { id: courseId, title: "Portable data fixture", code: "", term: "", accent: "moss" });
    assert.ok(Number.isFinite(Date.parse(data.exportedAt)));
    assert.equal(data.profile.assessments[0].title, "Final review");
    assert.equal(data.studySessions.length, 1);
    assert.equal(data.studySessions[0].question, session.json().question);
    assert.equal(data.attempts.length, 1);
    assert.equal(data.attempts[0].response, responseText);
    assert.equal(data.attempts[0].independence, "hinted");
    assert.deepEqual(data.attempts[0].sourceRefs, [{ materialId: material.json().id, passageId: sourcePassageId }]);
    assert.deepEqual(data.attempts[0].sourceMaterialIds, [material.json().id]);
    assert.equal(data.sourceAnnotations.length, 1);
    assert.equal(data.sourceAnnotations[0].body, "Remember the relative phase.");
    assert.deepEqual(data.learningPatterns, []);
    assert.deepEqual(data.patternReviews, []);
    const missing = await app.inject({ method: "GET", url: `/api/courses/${randomUUID()}/learner/export` });
    assert.equal(missing.statusCode, 404);

    const rejectedDelete = await app.inject({
      method: "DELETE", url: `/api/courses/${courseId}/learner/data`,
      payload: { confirmation: "DELETE THE CLASS" },
    });
    assert.equal(rejectedDelete.statusCode, 400);
    assert.equal((await app.inject({ method: "GET", url: `/api/courses/${courseId}/learner/export` })).json().attempts.length, 1);
    const deleted = await app.inject({
      method: "DELETE", url: `/api/courses/${courseId}/learner/data`,
      payload: { confirmation: "DELETE ALL LEARNER DATA" },
    });
    assert.equal(deleted.statusCode, 200, deleted.body);
    assert.equal(deleted.json().deleted.study_attempts, 1);
    assert.equal(deleted.json().deleted.study_sessions, 1);
    assert.equal(deleted.json().deleted.learner_assessments, 1);
    assert.equal(deleted.json().deleted.learner_topics, 1);
    assert.equal(deleted.json().deleted.learner_concepts, 1);
    assert.equal(deleted.json().deleted.mastery_evidence, 1);
    assert.equal(deleted.json().deleted.source_annotations, 1);
    const afterDelete = await app.inject({ method: "GET", url: `/api/courses/${courseId}/learner/export` });
    assert.equal(afterDelete.json().profile.assessments.length, 0);
    assert.equal(afterDelete.json().profile.concepts.length, 0);
    assert.equal(afterDelete.json().studySessions.length, 0);
    assert.equal(afterDelete.json().attempts.length, 0);
    assert.equal(afterDelete.json().sourceAnnotations.length, 0);
    const otherClassProfile = await app.inject({ method: "GET", url: `/api/courses/${otherCourseId}/learner/profile` });
    assert.equal(otherClassProfile.json().assessments[0].title, "Other class exam", "deletion must leave another class untouched");
    const materialStillExists = await app.inject({ method: "GET", url: `/api/courses/${courseId}` });
    assert.equal(materialStillExists.statusCode, 200, "learner-data removal must preserve course source files");
    assert.equal(materialStillExists.json().materials.length, 1);
  } finally {
    await app.close();
    await rm(root, { recursive: true });
  }
});

test("exam topic study selects a matching class source and marks unmatched topics as general knowledge", async () => {
  const { app, root, prompts } = await createAppWithStudyModel({ corruptMath: true });
  try {
    const course = await app.inject({ method: "POST", url: "/api/courses", payload: { title: "Quantum Information" } });
    const courseId = course.json().id as string;
    const syllabus = uploadPayload("Syllabus.md", "# Bell states\n\nBell states are a course topic. SYLLABUS_MATCH_SENTINEL");
    const syllabusUpload = await app.inject({
      method: "POST", url: `/api/courses/${courseId}/materials?kind=syllabus`,
      headers: { "content-type": syllabus.contentType }, payload: syllabus.payload,
    });
    const unrelatedBackground = Array.from({ length: 45 }, (_, index) => `Background section ${index + 1} introduces an unrelated principle from the course.`).join("\n\n");
    const reading = uploadPayload("Bell states reading.md", `${unrelatedBackground}\n\n# Bell states\n\nBell states are entangled two-qubit states. READING_MATCH_SENTINEL`);
    const readingUpload = await app.inject({
      method: "POST", url: `/api/courses/${courseId}/materials?kind=reading`,
      headers: { "content-type": reading.contentType }, payload: reading.payload,
    });
    const assessment = await app.inject({
      method: "POST", url: `/api/courses/${courseId}/learner/assessments`,
      payload: { title: "Professor’s exam list", kind: "exam", topics: [
        { title: "Bell states", importance: "normal", provenance: "learner" },
        { title: "Unlisted topic", importance: "normal", provenance: "learner" },
      ] },
    });
    const sourceGrounded = await app.inject({
      method: "POST", url: `/api/courses/${courseId}/learner/study-session`,
      payload: { topic: "Bell states", method: "explanation", assessmentId: assessment.json().id },
    });
    assert.equal(sourceGrounded.statusCode, 200, sourceGrounded.body);
    assert.equal(JSON.stringify(sourceGrounded.json()).includes(String.fromCharCode(127)), false, "generated math control characters must be removed before study content is persisted or returned");
    assert.equal(sourceGrounded.json().sourceMaterialId, readingUpload.json().id, "a focused reading should win a tie with the syllabus");
    assert.equal(sourceGrounded.json().sourceBasis, "course-materials");
    const groundedInput = JSON.parse(prompts.at(-1)!.split("INPUT_JSON\n\n")[1]!);
    assert.equal(groundedInput.sourceMaterial.id, readingUpload.json().id);
    assert.ok(groundedInput.sourceMaterial.passages.some((passage: { content: string }) => passage.content.includes("READING_MATCH_SENTINEL")));
    assert.ok(groundedInput.sourceMaterial.passages[0].ordinal > 24, "topic-matched evidence after the old retrieval window must reach the model");
    assert.equal(groundedInput.sourceMaterial.passages.some((passage: { content: string }) => passage.content.includes("SYLLABUS_MATCH_SENTINEL")), false);
    const adaptive = await app.inject({
      method: "POST", url: `/api/courses/${courseId}/learner/study-sessions/${sourceGrounded.json().sessionId}/next-question`, payload: {},
    });
    assert.equal(adaptive.statusCode, 200, adaptive.body);
    assert.equal(JSON.stringify(adaptive.json()).includes(String.fromCharCode(127)), false, "adaptive math control characters must be removed before returning the updated session");
    assert.equal(adaptive.json().sourceMaterialId, readingUpload.json().id);
    assert.equal(adaptive.json().assessmentId, assessment.json().id);
    assert.match(prompts.at(-1) ?? "", /READING_MATCH_SENTINEL/);
    const reopenedGrounded = await app.inject({
      method: "GET", url: `/api/courses/${courseId}/learner/study-sessions/${sourceGrounded.json().sessionId}`,
    });
    assert.equal(reopenedGrounded.json().sourceMaterialId, readingUpload.json().id);

    const unmatched = await app.inject({
      method: "POST", url: `/api/courses/${courseId}/learner/study-session`,
      payload: { topic: "Unlisted topic", method: "explanation", assessmentId: assessment.json().id },
    });
    assert.equal(unmatched.statusCode, 200, unmatched.body);
    assert.equal(unmatched.json().sourceMaterialId, null);
    assert.equal(unmatched.json().sourceBasis, "general-knowledge");
    const unmatchedInput = JSON.parse(prompts.at(-1)!.split("INPUT_JSON\n\n")[1]!);
    assert.equal(unmatchedInput.sourceMaterial, null);
    assert.match(prompts.at(-1) ?? "", /Clearly mark that content as not verified against the learner's course/);
    assert.equal(syllabusUpload.statusCode, 201);
  } finally {
    await app.close();
    await rm(root, { recursive: true, force: true });
  }
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
    ["free-recall", /Start with unaided free recall/],
    ["teach-back", /Use a teach-back exercise/],
    ["compare-contrast", /Use contrastive learning/],
    ["error-analysis", /Teach through error analysis/],
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
  const compareSession = await app.inject({ method: "POST", url: `/api/courses/${courseId}/learner/study-session`, payload: { topic: "Method check: contrast", method: "compare-contrast" } });
  assert.equal(compareSession.statusCode, 200, compareSession.body);
  const reopenedContrast = await app.inject({ method: "GET", url: `/api/courses/${courseId}/learner/study-sessions/${compareSession.json().sessionId}` });
  assert.equal(reopenedContrast.statusCode, 200, reopenedContrast.body);
  assert.equal(reopenedContrast.json().method, "compare-contrast");
  const history = await app.inject({ method: "GET", url: `/api/courses/${courseId}/learner/study-sessions` });
  assert.ok(history.json().some((item: { sessionId: string; method: string }) => item.sessionId === compareSession.json().sessionId && item.method === "compare-contrast"));
  const nextContrast = await app.inject({ method: "POST", url: `/api/courses/${courseId}/learner/study-sessions/${compareSession.json().sessionId}/next-question`, payload: {} });
  assert.equal(nextContrast.statusCode, 200, nextContrast.body);
  assert.equal(nextContrast.json().method, "compare-contrast");
  assert.match(prompts.at(-1) ?? "", /tests the distinction between this concept/);
  const errorSession = await app.inject({ method: "POST", url: `/api/courses/${courseId}/learner/study-session`, payload: { topic: "Method check: error analysis", method: "error-analysis" } });
  assert.equal(errorSession.statusCode, 200, errorSession.body);
  assert.equal(errorSession.json().method, "error-analysis");
  assert.deepEqual(errorSession.json().options, ["Step 1", "Step 2", "Step 3", "Step 4"]);
  assert.match(errorSession.json().example, /^1\.[\s\S]*\n2\.[\s\S]*\n3\.[\s\S]*\n4\./);
  assert.equal(StudySessionContentSchema.safeParse({ ...(errorSession.json() as Record<string, unknown>), example: "" }).success, false, "error-analysis sessions must keep a visible flawed solution");
  assert.match(prompts.at(-1) ?? "", /four-step numbered example containing exactly one invalid reasoning step/);
  const nextError = await app.inject({ method: "POST", url: `/api/courses/${courseId}/learner/study-sessions/${errorSession.json().sessionId}/next-question`, payload: {} });
  assert.equal(nextError.statusCode, 200, nextError.body);
  assert.equal(nextError.json().method, "error-analysis");
  assert.deepEqual(nextError.json().options, ["Step 1", "Step 2", "Step 3", "Step 4"]);
  assert.match(prompts.at(-1) ?? "", /fresh four-step numbered worked solution with exactly one subtle invalid step/);
  const errorAttempt = await app.inject({
    method: "POST", url: `/api/courses/${courseId}/learner/attempts`,
    payload: {
      sessionId: nextError.json().sessionId, conceptId: nextError.json().conceptId,
      activityType: "recognition", prompt: nextError.json().question,
      response: nextError.json().options[nextError.json().answerIndex], reasoning: "",
      confidence: 0.7, hintCount: 0, method: "error-analysis", outcome: "correct",
      sourceRefs: [], independence: "independent", rationale: "Identified the first invalid step.",
    },
  });
  assert.equal(errorAttempt.statusCode, 201, errorAttempt.body);
  const methodProgress = await app.inject({ method: "GET", url: `/api/courses/${courseId}/learner/method-progress` });
  assert.ok(methodProgress.json().some((item: { method: string; attemptCount: number }) => item.method === "error-analysis" && item.attemptCount === 1));
  assert.equal(prompts.length, methods.length + 4);
  await app.close();
  await rm(root, { recursive: true });
});

test("error-analysis refuses generated work without four numbered steps", async () => {
  const { app, root } = await createAppWithStudyModel({ invalidErrorAnalysis: true });
  const course = await app.inject({ method: "POST", url: "/api/courses", payload: { title: "Invalid error-analysis fixture" } });
  const response = await app.inject({
    method: "POST",
    url: `/api/courses/${course.json().id}/learner/study-session`,
    payload: { topic: "A method with a strict structure", method: "error-analysis" },
  });

  assert.equal(response.statusCode, 502);
  assert.equal(response.json().diagnostics.code, "invalid_method_structure");
  assert.equal((await app.inject({ method: "GET", url: `/api/courses/${course.json().id}/learner/study-sessions` })).json().length, 0);
  await app.close();
  await rm(root, { recursive: true });
});

test("error-analysis refuses adaptive work without four numbered steps", async () => {
  const { app, root } = await createAppWithStudyModel({ invalidAdaptiveErrorAnalysis: true });
  const course = await app.inject({ method: "POST", url: "/api/courses", payload: { title: "Invalid adaptive error-analysis fixture" } });
  const courseId = course.json().id as string;
  const initial = await app.inject({
    method: "POST",
    url: `/api/courses/${courseId}/learner/study-session`,
    payload: { topic: "A method with an adaptive structure", method: "error-analysis" },
  });
  assert.equal(initial.statusCode, 200, initial.body);

  const followUp = await app.inject({
    method: "POST",
    url: `/api/courses/${courseId}/learner/study-sessions/${initial.json().sessionId}/next-question`,
    payload: {},
  });

  assert.equal(followUp.statusCode, 502);
  assert.equal(followUp.json().diagnostics.code, "invalid_method_structure");
  const sessions = await app.inject({ method: "GET", url: `/api/courses/${courseId}/learner/study-sessions` });
  assert.equal(sessions.json().length, 1, "an invalid follow-up must not be saved as a new session");
  await app.close();
  await rm(root, { recursive: true });
});

test("compare and contrast uses accepted course-map neighbors in initial and adaptive study", async () => {
  const { app, root, prompts } = await createAppWithStudyModel();
  try {
    const course = await app.inject({ method: "POST", url: "/api/courses", payload: { title: "Contrastive study fixture" } });
    const courseId = course.json().id as string;
    const upload = uploadPayload("density-notes.md", "Density operators describe mixed quantum states. The partial trace obtains a subsystem state by tracing out the other subsystem.");
    const material = await app.inject({
      method: "POST", url: `/api/courses/${courseId}/materials?kind=reading`,
      headers: { "content-type": upload.contentType }, payload: upload.payload,
    });
    assert.equal(material.statusCode, 201, material.body);
    const passages = await app.inject({ method: "GET", url: `/api/courses/${courseId}/materials/${material.json().id}/passages` });
    const passageId = passages.json().passages[0].id as string;
    const database = openDatabase(join(root, "data", "studio.sqlite"));
    const artifacts = new LearningArtifactLibrary(database);
    const sourceLibrary = new SourceLibrary(database);
    const sourceFingerprint = createHash("sha256")
      .update(`course-source.v1\n${courseId}\n${sourceLibrary.getCoursePassageHashes(courseId).map(({ materialId, contentHash }) => `${materialId}:${contentHash}`).join("\n")}`)
      .digest("hex");
    const classificationPayload = {
      schemaVersion: "source-classification.v1" as const,
      courseId,
      sourceMaterialIds: [material.json().id as string],
      sources: [{ materialId: material.json().id as string, role: "reading" as const, summary: "Quantum density operator notes.", confidence: "high" as const, evidence: [{ materialId: material.json().id as string, passageId }] }],
      gaps: [],
      warnings: [],
    };
    artifacts.saveClassification({ courseId, sourceFingerprint, model: "test-model", payload: classificationPayload });
    const mapFingerprint = createHash("sha256")
      .update(`course-map-input.v1\n${sourceFingerprint}\n${JSON.stringify(classificationPayload)}`)
      .digest("hex");
    const artifact = artifacts.saveCourseMap({
      courseId,
      sourceFingerprint: mapFingerprint,
      model: "test-model",
      payload: {
        schemaVersion: "course-map.v1",
        courseId,
        sourceMaterialIds: [material.json().id],
        modules: [{ key: "states-and-subsystems", title: "States and Subsystems", description: "Representing states and obtaining subsystem states.", position: 0, conceptKeys: ["density-operators", "partial-trace"], sourceReferences: [{ materialId: material.json().id, passageId }] }],
        concepts: [
          { key: "density-operators", title: "Density operators", description: "Represent pure and mixed states with density operators.", learningObjectives: ["Distinguish pure and mixed states"], prerequisiteKeys: [], sourceReferences: [{ materialId: material.json().id, passageId }] },
          { key: "partial-trace", title: "Partial trace", description: "Obtain a subsystem state by tracing over another subsystem.", learningObjectives: ["Compute reduced states"], prerequisiteKeys: ["density-operators"], sourceReferences: [{ materialId: material.json().id, passageId }] },
        ],
        assessments: [],
        warnings: [],
      },
    });
    artifacts.acceptCourseMap(courseId, artifact.id);
    database.close();

    const study = await app.inject({
      method: "POST", url: `/api/courses/${courseId}/learner/study-session`,
      payload: { topic: "Partial trace", method: "compare-contrast", sourceMaterialId: material.json().id },
    });
    assert.equal(study.statusCode, 200, study.body);
    const initialInput = JSON.parse((prompts.at(-1) ?? "").split("INPUT_JSON\n\n")[1] ?? "{}");
    assert.deepEqual(initialInput.acceptedMapRelatedConcepts.map(({ title, relationship }: { title: string; relationship: string }) => [title, relationship]), [["Density operators", "same accepted module: States and Subsystems"]]);

    const next = await app.inject({ method: "POST", url: `/api/courses/${courseId}/learner/study-sessions/${study.json().sessionId}/next-question`, payload: {} });
    assert.equal(next.statusCode, 200, next.body);
    const adaptiveInput = JSON.parse((prompts.at(-1) ?? "").split("INPUT_JSON\n\n")[1] ?? "{}");
    assert.deepEqual(adaptiveInput.acceptedMapRelatedConcepts.map(({ title }: { title: string }) => title), ["Density operators"]);
    assert.equal(next.json().method, "compare-contrast");

    const attempt = await app.inject({
      method: "POST", url: `/api/courses/${courseId}/learner/attempts`,
      payload: {
        sessionId: next.json().sessionId, conceptId: next.json().conceptId,
        activityType: "recognition", prompt: next.json().question,
        response: next.json().options[next.json().answerIndex], reasoning: "",
        confidence: 0.75, hintCount: 0, method: "compare-contrast", outcome: "correct",
        sourceRefs: [{ materialId: material.json().id }], independence: "independent",
        rationale: "Correctly distinguished the neighboring course concepts.",
      },
    });
    assert.equal(attempt.statusCode, 201, attempt.body);
    const methodProgress = await app.inject({ method: "GET", url: `/api/courses/${courseId}/learner/method-progress` });
    assert.deepEqual(methodProgress.json().map((item: { method: string; attemptCount: number; correctCount: number }) => [item.method, item.attemptCount, item.correctCount]), [["compare-contrast", 1, 1]]);

    const changedEvidenceDb = openDatabase(join(root, "data", "studio.sqlite"));
    changedEvidenceDb.prepare("UPDATE source_passages SET content_hash=? WHERE course_id=? AND material_id=? AND id=?")
      .run("f".repeat(64), courseId, material.json().id, passageId);
    changedEvidenceDb.close();
    const staleStatus = await app.inject({ method: "GET", url: `/api/courses/${courseId}/learning-artifacts` });
    assert.equal(staleStatus.json().classificationCurrent, false);
    assert.equal(staleStatus.json().courseMapCurrent, false);
    const staleStudy = await app.inject({ method: "POST", url: `/api/courses/${courseId}/learner/study-session`, payload: { topic: "Partial trace", method: "compare-contrast", sourceMaterialId: material.json().id } });
    assert.equal(staleStudy.statusCode, 200, staleStudy.body);
    const staleInput = JSON.parse((prompts.at(-1) ?? "").split("INPUT_JSON\n\n")[1] ?? "{}");
    assert.deepEqual(staleInput.acceptedMapRelatedConcepts, [], "stale map neighbors must not guide a new comparison lesson");

    const vaultPath = join(root, "vault");
    await mkdir(vaultPath, { recursive: true });
    const configured = await app.inject({ method: "POST", url: "/api/obsidian/config", payload: { vaultPath } });
    assert.equal(configured.statusCode, 200, configured.body);
    const exported = await app.inject({ method: "POST", url: `/api/courses/${courseId}/obsidian/export` });
    assert.equal(exported.statusCode, 200, exported.body);
    const exportedCourseNote = await readFile(join(vaultPath, exported.json().courseFolder, "Course.md"), "utf8");
    assert.match(exportedCourseNote, /Course map:\*\* Accepted structure · stale/);
    assert.match(exportedCourseNote, /Imported source text has changed since this structure was accepted/);
    const journal = await readFile(join(vaultPath, exported.json().courseFolder, "Study Journal.md"), "utf8");
    assert.match(journal, /Compare & contrast/);
  } finally {
    await app.close();
    await rm(root, { recursive: true, force: true });
  }
});

test("free recall saves the learner response as ungraded and keeps the method in history", async () => {
  const { app, root, prompts } = await createAppWithStudyModel();
  try {
    const course = await app.inject({ method: "POST", url: "/api/courses", payload: { title: "Free recall check" } });
    const courseId = course.json().id as string;
    const vaultPath = join(root, "vault");
    await mkdir(vaultPath, { recursive: true });
    const vaultConfig = await app.inject({ method: "POST", url: "/api/obsidian/config", payload: { vaultPath } });
    assert.equal(vaultConfig.statusCode, 200, vaultConfig.body);
    const study = await app.inject({
      method: "POST", url: `/api/courses/${courseId}/learner/study-session`,
      payload: { topic: "Bell states", method: "free-recall" },
    });
    assert.equal(study.statusCode, 200, study.body);
    assert.equal(study.json().method, "free-recall");
    assert.deepEqual([study.json().options, study.json().answerIndex], [[], null]);
    assert.match(prompts.at(-1) ?? "", /open-ended free-recall question/);
    const saved = await app.inject({
      method: "POST", url: `/api/courses/${courseId}/learner/attempts`,
      payload: {
        sessionId: study.json().sessionId, conceptId: study.json().conceptId,
        activityType: "explanation", prompt: study.json().question,
        response: "I recall that Bell states are entangled two-qubit states.", reasoning: "",
        confidence: 0.5, hintCount: 0, method: "free-recall", outcome: "not-graded",
        sourceRefs: [], independence: "independent", rationale: "Saved for self-comparison; not graded.",
      },
    });
    assert.equal(saved.statusCode, 201, saved.body);
    const database = new DatabaseSync(join(root, "data", "studio.sqlite"));
    database.prepare("UPDATE study_sessions SET content_json=? WHERE id=?").run(
      JSON.stringify({ ...study.json(), options: ["legacy distractor A", "legacy distractor B"], answerIndex: 0 }),
      study.json().sessionId,
    );
    database.close();
    const reopened = await app.inject({ method: "GET", url: `/api/courses/${courseId}/learner/study-sessions/${study.json().sessionId}` });
    assert.equal(reopened.statusCode, 200, reopened.body);
    assert.equal(reopened.json().method, "free-recall");
    assert.deepEqual([reopened.json().options, reopened.json().answerIndex], [[], null]);
    assert.equal(reopened.json().attempts[0].response, "I recall that Bell states are entangled two-qubit states.");
    assert.equal(reopened.json().attempts[0].outcome, "not-graded");
    const nextRecall = await app.inject({
      method: "POST", url: `/api/courses/${courseId}/learner/study-sessions/${study.json().sessionId}/next-question`, payload: {},
    });
    assert.equal(nextRecall.statusCode, 200, nextRecall.body);
    assert.equal(nextRecall.json().method, "free-recall");
    assert.deepEqual([nextRecall.json().options, nextRecall.json().answerIndex], [[], null]);
    assert.match(prompts.at(-1) ?? "", /Do not return choices or an answer key/);
    const history = await app.inject({ method: "GET", url: `/api/courses/${courseId}/learner/study-sessions` });
    assert.equal(history.json().find((item: { sessionId: string }) => item.sessionId === study.json().sessionId).method, "free-recall");
    const progress = await app.inject({ method: "GET", url: `/api/courses/${courseId}/learner/method-progress` });
    const recall = progress.json().find((item: { method: string }) => item.method === "free-recall");
    assert.deepEqual([recall.attemptCount, recall.scoredAttemptCount, recall.correctCount], [1, 0, 0]);
    const exported = await app.inject({ method: "POST", url: `/api/courses/${courseId}/obsidian/export` });
    assert.equal(exported.statusCode, 200, exported.body);
    const courseNote = await readFile(join(vaultPath, exported.json().courseFolder, "Course.md"), "utf8");
    assert.match(courseNote, /Free recall:/);
    assert.match(courseNote, /1 unscored/);
  } finally {
    await app.close();
    await rm(root, { recursive: true });
  }
});

test("teach-back is a distinct open response that persists independently and exports its reference", async () => {
  const { app, root, prompts } = await createAppWithStudyModel();
  try {
    const course = await app.inject({ method: "POST", url: "/api/courses", payload: { title: "Teach-back method check" } });
    const courseId = course.json().id as string;
    const vaultPath = join(root, "vault");
    await mkdir(vaultPath, { recursive: true });
    const vaultConfig = await app.inject({ method: "POST", url: "/api/obsidian/config", payload: { vaultPath } });
    assert.equal(vaultConfig.statusCode, 200, vaultConfig.body);

    const study = await app.inject({
      method: "POST", url: `/api/courses/${courseId}/learner/study-session`,
      payload: { topic: "Conditional states", method: "teach-back" },
    });
    assert.equal(study.statusCode, 200, study.body);
    assert.equal(study.json().method, "teach-back");
    assert.deepEqual([study.json().options, study.json().answerIndex], [[], null]);
    assert.equal(study.json().question, "Teach back the main idea and explain why it holds.");
    assert.match(prompts.at(-1) ?? "", /Use a teach-back exercise/);

    const nextQuestion = await app.inject({ method: "POST", url: `/api/courses/${courseId}/learner/study-sessions/${study.json().sessionId}/next-question`, payload: {} });
    assert.equal(nextQuestion.statusCode, 200, nextQuestion.body);
    assert.equal(nextQuestion.json().method, "teach-back");
    assert.deepEqual([nextQuestion.json().options, nextQuestion.json().answerIndex], [[], null]);
    assert.match(prompts.at(-1) ?? "", /new teach-back prompt/);

    const reopened = await app.inject({ method: "GET", url: `/api/courses/${courseId}/learner/study-sessions/${study.json().sessionId}` });
    assert.equal(reopened.statusCode, 200, reopened.body);
    assert.equal(reopened.json().method, "teach-back");
    assert.deepEqual([reopened.json().options, reopened.json().answerIndex], [[], null]);

    const saved = await app.inject({
      method: "POST", url: `/api/courses/${courseId}/learner/attempts`,
      payload: {
        sessionId: study.json().sessionId, conceptId: study.json().conceptId, activityType: "explanation",
        prompt: study.json().question, response: "The average over outcomes removes the usable signal.", reasoning: "",
        confidence: 0.5, hintCount: 0, method: "teach-back", outcome: "not-graded", sourceRefs: [],
        independence: "independent", rationale: "Saved teach-back response for comparison; not graded.",
      },
    });
    assert.equal(saved.statusCode, 201, saved.body);
    const methods = await app.inject({ method: "GET", url: `/api/courses/${courseId}/learner/method-progress` });
    assert.deepEqual(methods.json().map((item: { method: string; attemptCount: number; scoredAttemptCount: number }) => [item.method, item.attemptCount, item.scoredAttemptCount]), [["teach-back", 1, 0]]);

    const exported = await app.inject({ method: "POST", url: `/api/courses/${courseId}/obsidian/export` });
    assert.equal(exported.statusCode, 200, exported.body);
    const journal = await readFile(join(vaultPath, exported.json().courseFolder, "Study Journal.md"), "utf8");
    assert.match(journal, /Teach it back/);
    assert.match(journal, /\*\*My response\*\*[\s\S]*The average over outcomes removes the usable signal\./);
    assert.match(journal, /\*\*Reference explanation\*\*[\s\S]*The source identifies the equal superposition\./);
  } finally {
    await app.close();
    await rm(root, { recursive: true, force: true });
  }
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
        reasoning: "", confidence: 0.5, hintCount: 0, method: "quiz", outcome: "correct",
        sourceRefs: [{ materialId: material.json().id }], independence: "independent", rationale: "Disposable integration attempt.",
      },
    });
    assert.equal(attempt.statusCode, 201, attempt.body);
    const profile = await app.inject({ method: "GET", url: `/api/courses/${courseId}/learner/profile` });
    assert.deepEqual([profile.json().assessments[0].attemptCount, profile.json().assessments[0].correctCount], [1, 1]);
    const methodProgress = await app.inject({ method: "GET", url: `/api/courses/${courseId}/learner/method-progress` });
    assert.deepEqual(methodProgress.json().map(({ method, attemptCount, scoredAttemptCount, independentScoredAttemptCount, independentCorrectCount, hintedScoredAttemptCount, assistedScoredAttemptCount, unknownIndependenceScoredAttemptCount, correctCount, lowConfidenceCorrectCount, topicCount, topicTitles }: { method: string; attemptCount: number; scoredAttemptCount: number; independentScoredAttemptCount: number; independentCorrectCount: number; hintedScoredAttemptCount: number; assistedScoredAttemptCount: number; unknownIndependenceScoredAttemptCount: number; correctCount: number; lowConfidenceCorrectCount: number; topicCount: number; topicTitles: string[] }) => [method, attemptCount, scoredAttemptCount, independentScoredAttemptCount, independentCorrectCount, hintedScoredAttemptCount, assistedScoredAttemptCount, unknownIndependenceScoredAttemptCount, correctCount, lowConfidenceCorrectCount, topicCount, topicTitles]), [
      ["retrieval-practice", 1, 1, 1, 1, 0, 0, 0, 1, 1, 1, ["Bell states"]],
    ]);
    assert.deepEqual(methodProgress.json()[0].topicProgress.map(({ title, attemptCount, scoredAttemptCount, independentScoredAttemptCount, independentCorrectCount, hintedScoredAttemptCount, assistedScoredAttemptCount, unknownIndependenceScoredAttemptCount, correctCount, lowConfidenceCorrectCount, confidenceRatedAttemptCount, latestOutcome, latestConfidence, meanConfidenceGap }: { title: string; attemptCount: number; scoredAttemptCount: number; independentScoredAttemptCount: number; independentCorrectCount: number; hintedScoredAttemptCount: number; assistedScoredAttemptCount: number; unknownIndependenceScoredAttemptCount: number; correctCount: number; lowConfidenceCorrectCount: number; confidenceRatedAttemptCount: number; latestOutcome: string | null; latestConfidence: number | null; meanConfidenceGap: number | null }) => [title, attemptCount, scoredAttemptCount, independentScoredAttemptCount, independentCorrectCount, hintedScoredAttemptCount, assistedScoredAttemptCount, unknownIndependenceScoredAttemptCount, correctCount, lowConfidenceCorrectCount, confidenceRatedAttemptCount, latestOutcome, latestConfidence, meanConfidenceGap]), [
      ["Bell states", 1, 1, 1, 1, 0, 0, 0, 1, 1, 1, "correct", 0.5, 0.5],
    ]);
    const assistedAttempt = await app.inject({
      method: "POST", url: `/api/courses/${courseId}/learner/attempts`,
      payload: {
        conceptId: study.json().conceptId, activityType: "application", prompt: "Explain the result in a new case.",
        response: "A correct response reached with outside resources.", reasoning: "Checked notes during the attempt.", confidence: 0.5,
        hintCount: 0, method: "explanation", outcome: "correct", sourceRefs: [], independence: "assisted",
        rationale: "Disposable integration attempt with learner-reported outside help.",
      },
    });
    assert.equal(assistedAttempt.statusCode, 201, assistedAttempt.body);
    const assistedProgress = await app.inject({ method: "GET", url: `/api/courses/${courseId}/learner/method-progress` });
    const explanationProgress = assistedProgress.json().find((item: { method: string }) => item.method === "explanation");
    assert.deepEqual([explanationProgress.scoredAttemptCount, explanationProgress.independentScoredAttemptCount, explanationProgress.assistedScoredAttemptCount, explanationProgress.assistedCorrectCount, explanationProgress.topicProgress[0].assistedScoredAttemptCount, explanationProgress.topicProgress[0].assistedCorrectCount], [1, 0, 1, 1, 1, 1]);
    const exported = await app.inject({ method: "POST", url: `/api/courses/${courseId}/obsidian/export` });
    assert.equal(exported.statusCode, 200, exported.body);
    assert.equal(exported.json().notesWritten, 4);
    const courseNote = await readFile(join(vaultPath, exported.json().courseFolder, "Course.md"), "utf8");
    assert.match(courseNote, /## Practice by study approach[\s\S]*Quiz first:\*\* 1\/1 scored checks correct; 1\/1 correct independently; confidence gap 50% across 1 rated check \(lower is closer to outcomes\); 1 total attempt/);
    assert.match(courseNote, /Clear explanation:\*\* 1\/1 scored checks correct; No independent scored checks; 1\/1 correct with outside help; confidence gap 50% across 1 rated check/);
    assert.match(courseNote, /Quiz first:[^\n]*Early signal · at least 3 scored checks give a steadier signal/);
    assert.match(courseNote, /Clear explanation:[^\n]*Bell states \(1\/1 scored correct; no independent scored checks; 1\/1 correct with outside help; 50% confidence gap across 1 rated; early signal · at least 3 scored checks give a steadier topic-level signal/);
    assert.match(courseNote, /across 1 topic; topics: Bell states/);
    assert.match(courseNote, /by topic: Bell states \(1\/1 scored correct; 1\/1 independently correct; 50% confidence gap across 1 rated; early signal · at least 3 scored checks give a steadier topic-level signal; last practiced 2026-\d\d-\d\dT/);
    assert.match(courseNote, /by topic: Bell states \(1\/1 scored correct; no independent scored checks; 1\/1 correct with outside help; 50% confidence gap across 1 rated/);
    const assessmentFolder = join(vaultPath, exported.json().courseFolder, "assessments");
    const assessmentNote = await readFile(join(assessmentFolder, "professor-s-bell-states-scope--" + assessment.json().id.slice(0, 8) + ".md"), "utf8");
    assert.match(assessmentNote, /Bell states .*priority: high; .*1\/1 scored checks correct/);
    const studyJournal = await readFile(join(vaultPath, exported.json().courseFolder, "Study Journal.md"), "utf8");
    assert.match(studyJournal, /\*\*Reference answer\*\*[\s\S]*\$\\lvert \+\\rangle\$/);
    assert.match(studyJournal, /\*\*Reference explanation\*\*[\s\S]*The source identifies the equal superposition\./);
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
  assert.equal(sourceSignal.topics[0].latestConfidence, 0.5, "source topic summaries retain the latest learner confidence");
  assert.deepEqual([sourceSignal.topics[0].independentScoredAttemptCount, sourceSignal.topics[0].independentCorrectCount], [0, 0], "source progress does not count hinted checks as independent");
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
