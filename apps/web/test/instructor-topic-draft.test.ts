import assert from "node:assert/strict";
import test from "node:test";
import { clearInstructorTopicDraft, readInstructorTopicDraft, writeInstructorTopicDraft, type InstructorTopicDraft } from "../src/lib/instructor-topic-draft";

function memoryStorage() {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, value); },
    removeItem: (key: string) => { values.delete(key); },
  };
}

test("instructor topic drafts survive navigation in the same tab and remain class-scoped", () => {
  const storage = memoryStorage();
  const draft: InstructorTopicDraft = {
    assessmentId: null,
    title: "Midterm 2",
    scheduledAt: "2026-11-12T16:30",
    availableMinutes: "120",
    dailyMinutes: "45",
    topics: "1. Partial trace of $\\rho_{AB}$\n2. Conditional states",
    notes: "No proofs required.",
    importance: { "partial trace of $\\rho_{ab}$": "high" },
  };

  writeInstructorTopicDraft(storage, "course-one", draft);
  assert.deepEqual(readInstructorTopicDraft(storage, "course-one"), draft);
  assert.equal(readInstructorTopicDraft(storage, "course-two"), null);

  clearInstructorTopicDraft(storage, "course-one");
  assert.equal(readInstructorTopicDraft(storage, "course-one"), null);
});

test("empty instructor topic forms remove their saved draft", () => {
  const storage = memoryStorage();
  writeInstructorTopicDraft(storage, "course-one", {
    assessmentId: null,
    title: " ",
    scheduledAt: "",
    availableMinutes: "",
    dailyMinutes: "45",
    topics: "",
    notes: "",
    importance: {},
  });
  assert.equal(readInstructorTopicDraft(storage, "course-one"), null);
});

test("malformed draft data cannot break the study page", () => {
  const storage = memoryStorage();
  storage.setItem("lls-instructor-topic-draft:course-one", "{bad json");
  assert.equal(readInstructorTopicDraft(storage, "course-one"), null);
});
