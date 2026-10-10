import assert from "node:assert/strict";
import test from "node:test";
import { describePractice, practiceReviewMethod } from "../src/lib/study-progress";

test("assignment and exam topic summaries show due and upcoming spaced recall", () => {
  const now = Date.parse("2026-10-10T12:00:00.000Z");
  const completedSignal = {
    attemptCount: 3,
    scoredAttemptCount: 3,
    correctCount: 3,
    independentScoredAttemptCount: 2,
    independentCorrectCount: 2,
    latestOutcome: "correct",
    lastPracticedAt: "2026-10-03T12:00:00.000Z",
  };
  const due = describePractice(completedSignal, now);
  assert.match(due, /spaced recall is due/);
  assert.equal(practiceReviewMethod(completedSignal, now), "quiz");

  const upcoming = describePractice({
    ...completedSignal,
    lastPracticedAt: "2026-10-09T12:00:00.000Z",
    independentScoredAttemptCount: 1,
    independentCorrectCount: 1,
  }, now);
  assert.match(upcoming, new RegExp(`next spaced recall ${new Date("2026-10-12T12:00:00.000Z").toLocaleDateString()}`));
  assert.equal(practiceReviewMethod({
    ...completedSignal,
    lastPracticedAt: "2026-10-09T12:00:00.000Z",
    independentScoredAttemptCount: 1,
    independentCorrectCount: 1,
  }, now), undefined);
});

test("unscored and missed topics are not mislabeled as scheduled spaced recall", () => {
  const now = Date.parse("2026-10-10T12:00:00.000Z");
  const ungraded = describePractice({ attemptCount: 1, scoredAttemptCount: 0, correctCount: 0, latestOutcome: "not-graded" }, now);
  const incorrect = describePractice({ attemptCount: 1, scoredAttemptCount: 1, correctCount: 0, latestOutcome: "incorrect", lastPracticedAt: "2026-10-01T12:00:00.000Z" }, now);

  assert.match(ungraded, /last response was not scored/);
  assert.doesNotMatch(ungraded, /spaced recall/);
  assert.match(incorrect, /Needs review · last check incorrect/);
  assert.doesNotMatch(incorrect, /spaced recall/);
});

test("topic summaries separate scored correctness from independent checks", () => {
  const supportedOnly = describePractice({
    attemptCount: 2,
    scoredAttemptCount: 2,
    correctCount: 2,
    independentScoredAttemptCount: 0,
    independentCorrectCount: 0,
    latestOutcome: "correct",
  });
  assert.match(supportedOnly, /2\/2 scored checks correct · independent checks 0\/2/);

  const mixed = describePractice({
    attemptCount: 3,
    scoredAttemptCount: 3,
    correctCount: 3,
    independentScoredAttemptCount: 2,
    independentCorrectCount: 2,
    latestOutcome: "correct",
  });
  assert.match(mixed, /independent checks 2\/3/);

  const legacy = describePractice({ attemptCount: 1, scoredAttemptCount: 1, correctCount: 1 });
  assert.doesNotMatch(legacy, /independent checks/);
});

test("low scored accuracy starts quiz-first practice from topic actions", () => {
  assert.equal(practiceReviewMethod({
    attemptCount: 5,
    scoredAttemptCount: 5,
    correctCount: 2,
    independentScoredAttemptCount: 3,
    independentCorrectCount: 1,
    latestOutcome: "correct",
  }), "quiz");
  assert.equal(practiceReviewMethod({
    attemptCount: 2,
    scoredAttemptCount: 2,
    correctCount: 0,
    independentScoredAttemptCount: 2,
    independentCorrectCount: 0,
    latestOutcome: "correct",
  }), undefined, "a small sample keeps the learner-selected method");
});
