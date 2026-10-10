import assert from "node:assert/strict";
import test from "node:test";
import { appendInstructorTopicWording, partitionInstructorTopics } from "../src/lib/instructor-topic-scope";

test("scope append preview separates already-listed topics without changing their order", () => {
  assert.deepEqual(partitionInstructorTopics(
    ["Partial trace", "Partial transpose", "Reduced density operators"],
    ["partial TRACE"],
  ), {
    newTopics: ["Partial transpose", "Reduced density operators"],
    alreadyListedTopics: ["Partial trace"],
  });
});

test("appending duplicate topics can still preserve new professor wording", () => {
  const updated = appendInstructorTopicWording(
    "Midterm 2 topics:\n1. Bell states",
    "1. Bell states\nProfessor note: compare the X and Z bases.",
    "10/10/2026",
  );

  assert.equal(updated, "Midterm 2 topics:\n1. Bell states\n\nAdditional instructor topics (10/10/2026):\n1. Bell states\nProfessor note: compare the X and Z bases.");
});

test("first professor wording does not gain an unnecessary append heading", () => {
  assert.equal(appendInstructorTopicWording("  ", "1. Partial trace", "10/10/2026"), "1. Partial trace");
});

test("retrying the same append does not duplicate professor wording", () => {
  const original = "Midterm topics";
  const once = appendInstructorTopicWording(original, "1. Bell states", "10/10/2026");
  assert.equal(appendInstructorTopicWording(once, "1. Bell states", "10/10/2026"), once);
});
