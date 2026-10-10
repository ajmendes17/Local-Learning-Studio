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

  assert.match(html, /No scored checks yet/);
  assert.match(html, /No independent checks yet/);
  assert.doesNotMatch(html, /role="progressbar"/);
});

test("scored but supported attempts do not imply independent accuracy is zero", () => {
  const html = renderTracks({
    methodLabel: "Quiz first",
    correctCount: 2,
    scoredAttemptCount: 3,
  });

  assert.match(html, /role="progressbar" aria-label="Quiz first all scored check results"[^>]*aria-valuenow="67"/);
  assert.match(html, /No independent checks yet/);
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

  assert.match(html, /aria-label="Error analysis all scored check results"[^>]*aria-valuenow="50"/);
  assert.match(html, /aria-label="Error analysis independent check results"[^>]*aria-valuenow="50"/);
  assert.doesNotMatch(html, /No (?:scored|independent) checks yet/);
});
