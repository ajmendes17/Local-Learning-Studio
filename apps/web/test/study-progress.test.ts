import assert from "node:assert/strict";
import test from "node:test";
import { describeTopicEvidence, getTopicScore } from "../src/lib/study-progress";

test("topic score uses scored checks and keeps ungraded attempts separate", () => {
  assert.deepEqual(getTopicScore(5, 3, 2), {
    percent: 67,
    correctCount: 2,
    scoredAttemptCount: 3,
    unscoredCount: 2,
  });
});

test("topic score is unmeasured until a scored check exists", () => {
  assert.equal(getTopicScore(4, 0, 0), null);
  assert.equal(getTopicScore(0, 0, 0), null);
});

test("topic score bounds inconsistent server counts", () => {
  assert.deepEqual(getTopicScore(2, 2, 8), {
    percent: 100,
    correctCount: 2,
    scoredAttemptCount: 2,
    unscoredCount: 0,
  });
  assert.equal(getTopicScore(2, 2, -1)?.percent, 0);
});

test("topic evidence labels reflect repeated independent results and setbacks", () => {
  assert.equal(describeTopicEvidence({ attemptCount: 0, scoredAttemptCount: 0, correctCount: 0, independentScoredAttemptCount: 0, independentCorrectCount: 0 }), "No check yet");
  assert.equal(describeTopicEvidence({ attemptCount: 2, scoredAttemptCount: 0, correctCount: 0, independentScoredAttemptCount: 0, independentCorrectCount: 0 }), "Unscored practice");
  assert.equal(describeTopicEvidence({ attemptCount: 1, scoredAttemptCount: 1, correctCount: 1, independentScoredAttemptCount: 0, independentCorrectCount: 0 }), "Supported practice");
  assert.equal(describeTopicEvidence({ attemptCount: 2, scoredAttemptCount: 2, correctCount: 2, independentScoredAttemptCount: 2, independentCorrectCount: 2 }), "Some independent evidence");
  assert.equal(describeTopicEvidence({ attemptCount: 3, scoredAttemptCount: 3, correctCount: 3, independentScoredAttemptCount: 3, independentCorrectCount: 3 }), "Repeated independent success");
  assert.equal(describeTopicEvidence({ attemptCount: 3, scoredAttemptCount: 3, correctCount: 2, independentScoredAttemptCount: 3, independentCorrectCount: 2, latestOutcome: "incorrect" }), "Needs another look");
});
