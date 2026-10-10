import { getSpacedReviewSchedule } from "@local-learning-studio/contracts";

export interface PracticeSignal {
  attemptCount: number;
  scoredAttemptCount?: number;
  correctCount: number;
  independentScoredAttemptCount?: number;
  independentCorrectCount?: number;
  latestOutcome?: string | null;
  latestConfidence?: number | null;
  lastPracticedAt?: string | null;
  sessionCount?: number;
  lastSessionAt?: string | null;
}

export function getTopicScore(attemptCount: number, scoredAttemptCount: number, correctCount: number) {
  if (scoredAttemptCount <= 0) return null;
  const boundedCorrectCount = Math.max(0, Math.min(scoredAttemptCount, correctCount));
  return {
    percent: Math.round(boundedCorrectCount / scoredAttemptCount * 100),
    correctCount: boundedCorrectCount,
    scoredAttemptCount,
    unscoredCount: Math.max(0, attemptCount - scoredAttemptCount),
  };
}

export type TopicEvidence = {
  attemptCount: number;
  scoredAttemptCount: number;
  correctCount: number;
  independentScoredAttemptCount: number;
  independentCorrectCount: number;
  latestOutcome?: string | null;
};

export function describeTopicEvidence(evidence: TopicEvidence) {
  if (evidence.latestOutcome === "incorrect" || evidence.latestOutcome === "incomplete" || evidence.latestOutcome === "unsupported") {
    return "Needs another look";
  }
  if (evidence.scoredAttemptCount === 0) {
    return evidence.attemptCount > 0 ? "Unscored practice" : "No check yet";
  }
  if (evidence.independentScoredAttemptCount === 0) return "Supported practice";
  if (evidence.independentScoredAttemptCount >= 3 && evidence.independentCorrectCount / evidence.independentScoredAttemptCount >= 0.8) {
    return "Repeated independent success";
  }
  return "Some independent evidence";
}

export function practiceReviewMethod(signal: PracticeSignal | undefined, now = Date.now()) {
  if (!signal) return undefined;
  const schedule = getSpacedReviewSchedule({
    ...signal,
    scoredAttemptCount: signal.scoredAttemptCount ?? signal.attemptCount,
  }, now);
  return schedule?.due ? "quiz" as const : undefined;
}

export function describePractice(signal: PracticeSignal | undefined, now = Date.now()) {
  if (!signal?.attemptCount) {
    if (signal?.sessionCount) {
      const date = signal.lastSessionAt ? ` · last lesson ${new Date(signal.lastSessionAt).toLocaleDateString()}` : "";
      return `Lesson opened · no checks saved${date}`;
    }
    return "Not practiced yet";
  }
  const outcome = signal.latestOutcome;
  const needsReview = outcome === "incorrect" || outcome === "incomplete" || outcome === "unsupported" || outcome === "not-graded";
  const scoredAttemptCount = signal.scoredAttemptCount ?? signal.attemptCount;
  const summary = scoredAttemptCount
    ? `${signal.correctCount}/${scoredAttemptCount} scored checks correct${signal.attemptCount > scoredAttemptCount ? ` · ${signal.attemptCount - scoredAttemptCount} unscored` : ""}`
    : `${signal.attemptCount} unscored attempt${signal.attemptCount === 1 ? "" : "s"}`;
  const date = signal.lastPracticedAt ? ` · last ${new Date(signal.lastPracticedAt).toLocaleDateString()}` : "";
  const reviewReason = outcome === "incorrect" ? "last check incorrect"
    : outcome === "incomplete" ? "last check incomplete"
      : outcome === "unsupported" ? "last check needs another pass"
        : outcome === "not-graded" ? "last response was not scored" : null;
  const lessons = signal.sessionCount ? `${signal.sessionCount} lesson${signal.sessionCount === 1 ? "" : "s"}` : "no lesson sessions";
  const spacedReview = getSpacedReviewSchedule({ ...signal, scoredAttemptCount }, now);
  const spacedReviewText = spacedReview
    ? spacedReview.due
      ? " · spaced recall is due"
      : ` · next spaced recall ${new Date(spacedReview.dueAt).toLocaleDateString()}`
    : "";
  return `${needsReview ? `Needs review · ${reviewReason}` : "Practice recorded"} · ${summary} · ${lessons}${date}${spacedReviewText}`;
}
