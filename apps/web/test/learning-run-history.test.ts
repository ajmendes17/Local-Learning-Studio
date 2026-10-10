import assert from "node:assert/strict";
import test from "node:test";
import { readLearningRunHistory, recordLearningRun, updateLearningRun, type LearningRunInfo } from "../src/lib/learning-run-history.js";

function installStorage() {
  const values = new Map<string, string>();
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: { localStorage: {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => { values.set(key, value); },
    } },
  });
  return values;
}

const run = (operationId: string, startedAt: number): LearningRunInfo => ({
  operationId, phase: "course-map", startedAt, status: "running", model: "Terra",
  promptCharacters: 2400, sourceStats: { materialCount: 2, passageCount: 5, characterCount: 6000 },
});

test("analysis run history is per course, deduplicated, ordered, and capped at eight", () => {
  installStorage();
  let history: LearningRunInfo[] = [];
  for (let index = 0; index < 10; index += 1) history = recordLearningRun("course-a", run(`run-${index}`, index));
  history = recordLearningRun("course-a", run("run-9", 9));

  assert.equal(history.length, 8);
  assert.equal(history[0]?.operationId, "run-9");
  assert.equal(history.filter(({ operationId }) => operationId === "run-9").length, 1);
  assert.equal(readLearningRunHistory("course-a").length, 8);
  assert.deepEqual(readLearningRunHistory("course-b"), []);
});

test("analysis run history updates usage after completion and tolerates malformed storage", () => {
  const values = installStorage();
  recordLearningRun("course-a", run("run-1", 10));
  const history = updateLearningRun("course-a", "run-1", (item) => ({
    ...item, status: "complete", durationMs: 1300,
    usage: { inputTokens: 20000, cachedInputTokens: 0, outputTokens: 500, reasoningOutputTokens: 70 },
  }));
  assert.equal(history[0]?.status, "complete");
  assert.equal(history[0]?.usage?.inputTokens, 20000);
  values.set("lls-learning-run-history:broken", "not-json");
  assert.deepEqual(readLearningRunHistory("broken"), []);
});
