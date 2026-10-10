import assert from "node:assert/strict";
import test from "node:test";
import { studyTopicPath, suggestedStudyMethod } from "../src/lib/study-navigation";

test("due-review topic links preserve homework scope and open quiz-first practice", () => {
  const path = studyTopicPath("course one", "Bell states / phase", "homework-1", undefined, "quiz");
  const url = new URL(path, "http://localhost");

  assert.equal(url.pathname, "/courses/course%20one/study");
  assert.equal(url.searchParams.get("topic"), "Bell states / phase");
  assert.equal(url.searchParams.get("sourceMaterialId"), "homework-1");
  assert.equal(url.searchParams.get("method"), "quiz");
  assert.equal(suggestedStudyMethod(url.searchParams.get("method")), "quiz");
});

test("unsupported method query values cannot choose a generated study method", () => {
  assert.equal(suggestedStudyMethod("free-recall"), undefined);
  assert.equal(suggestedStudyMethod(null), undefined);
});
