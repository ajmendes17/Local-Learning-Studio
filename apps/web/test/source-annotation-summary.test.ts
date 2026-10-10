import assert from "node:assert/strict";
import test from "node:test";
import { summarizeSourceAnnotations } from "../src/lib/source-annotation-summary";

test("source comment summary counts annotated passages separately from comments and stale notes", () => {
  const summary = summarizeSourceAnnotations(["p1", "p2", "p3", "p4"], [
    { passageId: "p1", isCurrent: true },
    { passageId: "p1", isCurrent: true },
    { passageId: "p3", isCurrent: true },
    { passageId: "old-passage", isCurrent: false },
  ]);

  assert.deepEqual(summary, {
    commentedPassageCount: 2,
    currentCommentCount: 3,
    olderCommentCount: 1,
  });
});
