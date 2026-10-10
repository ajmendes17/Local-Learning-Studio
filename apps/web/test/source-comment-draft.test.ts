import assert from "node:assert/strict";
import test from "node:test";
import {
  clearSourceCommentDraft,
  readSourceCommentDraft,
  SOURCE_COMMENT_DRAFT_TTL_MS,
  sourceCommentDraftKey,
  writeSourceCommentDraft,
} from "../src/lib/source-comment-draft";
import type { DraftStorage } from "../src/lib/study-attempt-draft";

function memoryStorage(shared = new Map<string, string>()): DraftStorage {
  return {
    getItem: (key) => shared.get(key) ?? null,
    setItem: (key, value) => { shared.set(key, value); },
    removeItem: (key) => { shared.delete(key); },
  };
}

test("source comment drafts restore for the same course, source, and passage", () => {
  const data = new Map<string, string>();
  const storage = memoryStorage(data);
  writeSourceCommentDraft([storage], "course-a", "source-a", "passage-a", "Exam emphasis", 1000);

  assert.equal(readSourceCommentDraft([memoryStorage(data)], "course-a", "source-a", "passage-a", 2000), "Exam emphasis");
  assert.equal(readSourceCommentDraft([storage], "course-b", "source-a", "passage-a", 2000), null);
  assert.equal(readSourceCommentDraft([storage], "course-a", "source-b", "passage-a", 2000), null);
  assert.equal(readSourceCommentDraft([storage], "course-a", "source-a", "passage-b", 2000), null);
});

test("expired source comment drafts are removed from every storage", () => {
  const local = memoryStorage();
  const session = memoryStorage();
  const storages = [local, session];
  const key = sourceCommentDraftKey("course-a", "source-a", "passage-a");
  writeSourceCommentDraft(storages, "course-a", "source-a", "passage-a", "Draft", 1000);

  assert.equal(readSourceCommentDraft(storages, "course-a", "source-a", "passage-a", 1000 + SOURCE_COMMENT_DRAFT_TTL_MS + 1), null);
  assert.equal(local.getItem(key), null);
  assert.equal(session.getItem(key), null);
});

test("blanking and saving a source comment clear its browser draft", () => {
  const local = memoryStorage();
  const session = memoryStorage();
  const storages = [local, session];
  const key = sourceCommentDraftKey("course-a", "source-a", "passage-a");
  writeSourceCommentDraft(storages, "course-a", "source-a", "passage-a", "Draft", 1000);
  writeSourceCommentDraft(storages, "course-a", "source-a", "passage-a", "  ", 2000);
  assert.equal(local.getItem(key), null);

  writeSourceCommentDraft(storages, "course-a", "source-a", "passage-a", "Saved comment", 3000);
  clearSourceCommentDraft(storages, "course-a", "source-a", "passage-a");
  assert.equal(session.getItem(key), null);
});

test("comment drafts remain usable when browser storage is blocked", () => {
  const blocked: DraftStorage = {
    getItem: () => { throw new Error("Storage blocked"); },
    setItem: () => { throw new Error("Storage blocked"); },
    removeItem: () => { throw new Error("Storage blocked"); },
  };
  assert.doesNotThrow(() => writeSourceCommentDraft([blocked], "course-a", "source-a", "passage-a", "Draft"));
  assert.doesNotThrow(() => clearSourceCommentDraft([blocked], "course-a", "source-a", "passage-a"));
  assert.equal(readSourceCommentDraft([blocked], "course-a", "source-a", "passage-a"), null);
});
