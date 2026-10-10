import assert from "node:assert/strict";
import test from "node:test";
import {
  clearStudyAttemptDraft,
  readStudyAttemptDraft,
  STUDY_ATTEMPT_DRAFT_TTL_MS,
  studyAttemptDraftKey,
  writeStudyAttemptDraft,
  type DraftStorage,
} from "../src/lib/study-attempt-draft";

function memoryStorage(shared = new Map<string, string>()): DraftStorage {
  return {
    getItem: (key) => shared.get(key) ?? null,
    setItem: (key, value) => { shared.set(key, value); },
    removeItem: (key) => { shared.delete(key); },
  };
}

const content = { sessionId: "session-one", options: ["A", "B", "C"], hints: ["Hint 1", "Hint 2"], method: "quiz" };
const draft = { selected: 1, response: "", confidence: 0.75, hintCount: 1, usedOutsideHelp: true, studyTab: "check" as const };

test("knowledge-check drafts resume across browser restarts and stay course scoped", () => {
  const browserData = new Map<string, string>();
  const firstTabStorage = memoryStorage(browserData);
  writeStudyAttemptDraft([firstTabStorage], "course-one", content.sessionId, draft, 1000);

  const reopenedBrowserStorage = memoryStorage(browserData);
  const reopenedLessonFirstSession = { ...content, method: "explanation" };
  assert.deepEqual(readStudyAttemptDraft([reopenedBrowserStorage], "course-one", reopenedLessonFirstSession, 2000), draft,
    "the learner's selected Knowledge check tab should override the method's default Lesson tab");
  assert.equal(readStudyAttemptDraft([reopenedBrowserStorage], "course-two", content, 2000), null);
});

test("expired knowledge-check drafts are removed from every available storage", () => {
  const localValues = new Map<string, string>();
  const sessionValues = new Map<string, string>();
  const localStorage = memoryStorage(localValues);
  const sessionStorage = memoryStorage(sessionValues);
  const key = studyAttemptDraftKey("course-one", content.sessionId);
  writeStudyAttemptDraft([localStorage, sessionStorage], "course-one", content.sessionId, draft, 1000);

  assert.equal(readStudyAttemptDraft([localStorage, sessionStorage], "course-one", content, 1000 + STUDY_ATTEMPT_DRAFT_TTL_MS + 1), null);
  assert.equal(localStorage.getItem(key), null);
  assert.equal(sessionStorage.getItem(key), null);
});

test("draft restoration bounds the selected answer, hint count, and response size", () => {
  const storage = memoryStorage();
  storage.setItem(studyAttemptDraftKey("course-one", content.sessionId), JSON.stringify({
    selected: 9,
    response: "r".repeat(20010),
    confidence: 0.1,
    hintCount: 9,
    usedOutsideHelp: false,
    studyTab: "other",
  }));

  const restored = readStudyAttemptDraft([storage], "course-one", content, 5000);
  assert.deepEqual(restored, {
    selected: null,
    response: "r".repeat(20000),
    confidence: 0.5,
    hintCount: 2,
    usedOutsideHelp: false,
    studyTab: "check",
  });
});

test("malformed or non-object saved drafts are ignored without breaking study", () => {
  const storage = memoryStorage();
  const key = studyAttemptDraftKey("course-one", content.sessionId);
  storage.setItem(key, "null");

  assert.doesNotThrow(() => assert.equal(readStudyAttemptDraft([storage], "course-one", content), null));
  assert.equal(storage.getItem(key), null);
});

test("saving an attempt clears its local and session draft copies", () => {
  const localStorage = memoryStorage();
  const sessionStorage = memoryStorage();
  const key = studyAttemptDraftKey("course-one", content.sessionId);
  writeStudyAttemptDraft([localStorage, sessionStorage], "course-one", content.sessionId, draft);
  clearStudyAttemptDraft([localStorage, sessionStorage], "course-one", content.sessionId);

  assert.equal(localStorage.getItem(key), null);
  assert.equal(sessionStorage.getItem(key), null);
});
