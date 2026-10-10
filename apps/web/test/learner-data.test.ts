import assert from "node:assert/strict";
import test from "node:test";
import { clearLearnerDrafts, type LearnerDraftStorage } from "../src/lib/learner-data";

class MemoryStorage implements LearnerDraftStorage {
  private readonly values = new Map<string, string>();
  get length() { return this.values.size; }
  key(index: number) { return [...this.values.keys()][index] ?? null; }
  setItem(key: string, value: string) { this.values.set(key, value); }
  getItem(key: string) { return this.values.get(key) ?? null; }
  removeItem(key: string) { this.values.delete(key); }
}

test("learner-data cleanup clears only the selected class drafts in every storage", () => {
  const local = new MemoryStorage();
  const session = new MemoryStorage();
  local.setItem("lls-study-draft:class-a:session-1", "answer");
  local.setItem("lls-study-draft:class-a:session-2", "answer");
  local.setItem("lls-instructor-topic-draft:class-a", "exam topics");
  local.setItem("lls-source-comment-draft:class-a:material-1:passage-1", "comment");
  local.setItem("lls-study-draft:class-b:session-1", "keep");
  local.setItem("unrelated-key", "keep");
  session.setItem("lls-study-draft:class-a:session-1", "answer");
  session.setItem("lls-instructor-topic-draft:class-a", "exam topics");
  session.setItem("lls-source-comment-draft:class-a:material-1:passage-2", "comment");

  clearLearnerDrafts([local, session], "class-a");

  assert.deepEqual([...Array(local.length)].map((_, index) => local.key(index)).sort(), ["lls-study-draft:class-b:session-1", "unrelated-key"]);
  assert.equal(session.length, 0);
});

test("learner-data cleanup tolerates blocked storage writes/removals", () => {
  const blocked: LearnerDraftStorage = {
    length: 1,
    key: () => "lls-study-draft:class-a:session-1",
    removeItem: () => { throw new Error("Storage blocked"); },
  };
  assert.doesNotThrow(() => clearLearnerDrafts([blocked], "class-a"));
});
