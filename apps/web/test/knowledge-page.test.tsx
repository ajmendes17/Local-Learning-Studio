import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { CourseMapArtifact, CourseSummary, LearnerProfileResponse } from "@local-learning-studio/contracts";
import { KnowledgePage } from "../src/views/KnowledgePage";

const course = {
  id: "a4ad088d-a83f-407c-b9f6-7ec0a5d7c062",
  title: "Physics",
  code: "PHGN 519",
  term: "Fall 2026",
  accent: "plum",
  materialCount: 1,
  moduleCount: 1,
  assessmentCount: 1,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
} as CourseSummary;

const profile = {
  concepts: [{
    id: "e38f1a3b-50da-443a-81b7-e0a8fa2712c0",
    stableKey: "studied-topic",
    title: "A learner-created topic",
    description: "A topic studied outside the accepted map.",
    attemptCount: 1,
    scoredAttemptCount: 0,
    correctCount: 0,
    latestOutcome: "not-graded",
    lastPracticedAt: "2026-01-02T00:00:00.000Z",
    sessionCount: 1,
    lastSessionAt: "2026-01-02T00:00:00.000Z",
  }],
  assessments: [{
    id: "9a0b8452-b959-4e3e-b937-8b1f01e4cad0",
    title: "Midterm 1",
    instructorText: "Bell states; Partial trace",
    kind: "exam",
    scheduledAt: null,
    availableMinutes: null,
    dailyMinutes: 45,
    createdAt: "2026-01-01T00:00:00.000Z",
    attemptCount: 0,
    scoredAttemptCount: 0,
    correctCount: 0,
    sessionCount: 0,
    lastSessionAt: null,
    topics: [{
      id: "0c08ddee-0a44-4e93-8208-96af0ecafee6",
      conceptId: null,
      title: "Partial trace",
      position: 0,
      importance: "high",
      provenance: "learner",
      attemptCount: 0,
      scoredAttemptCount: 0,
      correctCount: 0,
      latestOutcome: null,
      lastPracticedAt: null,
      sessionCount: 0,
      lastSessionAt: null,
    }],
  }],
  sources: [],
} as LearnerProfileResponse;

const courseMap = {
  payload: {
    concepts: [{
      key: "mapped-topic",
      title: "Mapped but not practiced",
      description: "This accepted-map topic has no learner activity.",
    }],
  },
} as CourseMapArtifact;

test("knowledge dashboard keeps mapped, learner-created, and instructor-scope topics distinct", () => {
  const html = renderToStaticMarkup(createElement(KnowledgePage, {
    profiles: [{ course, profile, methods: [], courseMap }],
    loading: false,
    error: null,
    onOpenCourse: () => undefined,
    onStudyTopic: () => undefined,
  }));

  assert.match(html, /1\/2<\/span><span>topics practiced/);
  assert.match(html, /Mapped but not practiced/);
  assert.match(html, /A learner-created topic/);
  assert.match(html, /2 topics/);
  assert.match(html, /Midterm 1/);
  assert.match(html, /Partial trace/);
  assert.match(html, /1 topic with saved attempts/);
  assert.doesNotMatch(html, /Bayesian inference|Recursive definitions|Quantum measurement/);
});
