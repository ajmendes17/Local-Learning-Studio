import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MethodProgressTracks } from "../src/components/MethodProgressTracks";

function renderTracks(overrides: Partial<Parameters<typeof MethodProgressTracks>[0]> = {}) {
  return renderToStaticMarkup(createElement(MethodProgressTracks, {
    methodLabel: "Free recall",
    correctCount: 0,
    scoredAttemptCount: 0,
    independentCorrectCount: 0,
    independentScoredAttemptCount: 0,
    ...overrides,
  }));
}

test("ungraded methods show unmeasured states instead of zero-percent score bars", () => {
  const html = renderTracks();

  assert.match(html, /Ungraded recall and teach-back are tracked separately\./);
  assert.match(html, /No solo scored checks yet\./);
  assert.doesNotMatch(html, /role="progressbar"/);
});

test("scored but supported attempts do not imply independent accuracy is zero", () => {
  const html = renderTracks({
    methodLabel: "Quiz first",
    correctCount: 2,
    scoredAttemptCount: 3,
  });

  assert.match(html, /role="progressbar" aria-label="Quiz first scored check accuracy"[^>]*aria-valuenow="67"/);
  assert.match(html, /No solo scored checks yet\./);
  assert.equal((html.match(/role="progressbar"/g) ?? []).length, 1);
});

test("observed scored and independent results render separate measured bars", () => {
  const html = renderTracks({
    methodLabel: "Error analysis",
    correctCount: 2,
    scoredAttemptCount: 4,
    independentCorrectCount: 1,
    independentScoredAttemptCount: 2,
  });

  assert.match(html, /aria-label="Error analysis scored check accuracy"[^>]*aria-valuenow="50"/);
  assert.match(html, /aria-label="Error analysis independent check accuracy"[^>]*aria-valuenow="50"/);
  assert.doesNotMatch(html, /No solo scored checks yet|Ungraded recall/);
});

test("inconsistent counts cannot render accuracy above 100 percent", () => {
  const html = renderTracks({
    correctCount: 5,
    scoredAttemptCount: 2,
    independentCorrectCount: 4,
    independentScoredAttemptCount: 1,
  });

  assert.match(html, /<strong>100%<\/strong>/);
  assert.match(html, /<strong>2\/2<\/strong>/);
  assert.match(html, /<strong>1\/1<\/strong>/);
  assert.equal((html.match(/aria-valuenow="100"/g) ?? []).length, 2);
  assert.doesNotMatch(html, /aria-valuenow="101"|aria-valuenow="200"/);
});
