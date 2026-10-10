interface MethodProgressTracksProps {
  methodLabel: string;
  correctCount: number;
  scoredAttemptCount: number;
  independentCorrectCount: number;
  independentScoredAttemptCount: number;
}

export function MethodProgressTracks({
  methodLabel,
  correctCount,
  scoredAttemptCount,
  independentCorrectCount,
  independentScoredAttemptCount,
}: MethodProgressTracksProps) {
  const safeScoredAttemptCount = Math.max(0, Math.floor(scoredAttemptCount));
  const safeCorrectCount = Math.min(safeScoredAttemptCount, Math.max(0, Math.floor(correctCount)));
  const safeIndependentScoredAttemptCount = Math.max(0, Math.floor(independentScoredAttemptCount));
  const safeIndependentCorrectCount = Math.min(safeIndependentScoredAttemptCount, Math.max(0, Math.floor(independentCorrectCount)));
  const score = safeScoredAttemptCount ? Math.round(safeCorrectCount / safeScoredAttemptCount * 100) : null;
  const independentScore = safeIndependentScoredAttemptCount
    ? Math.round(safeIndependentCorrectCount / safeIndependentScoredAttemptCount * 100)
    : null;

  return <div className="method-progress__tracks" aria-label={`${methodLabel} scored progress`}>
    <div className={score == null ? "method-progress__row method-progress__row--empty" : "method-progress__row"}>
      <small><span>Scored checks</span><strong>{safeScoredAttemptCount ? `${safeCorrectCount}/${safeScoredAttemptCount}` : "Not measured"}</strong></small>
      {score == null
        ? <span className="method-progress__unmeasured">Ungraded recall and teach-back are tracked separately.</span>
        : <div className="method-progress__meter"><span className="method-progress__track" role="progressbar" aria-label={`${methodLabel} scored check accuracy`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={score}><span style={{ width: `${score}%` }} /></span><strong>{score}%</strong></div>}
    </div>
    <div className={independentScore == null ? "method-progress__row method-progress__row--empty" : "method-progress__row"}>
      <small><span>Independent checks</span><strong>{safeIndependentScoredAttemptCount ? `${safeIndependentCorrectCount}/${safeIndependentScoredAttemptCount}` : "Not measured"}</strong></small>
      {independentScore == null
        ? <span className="method-progress__unmeasured">No solo scored checks yet.</span>
        : <div className="method-progress__meter"><span className="method-progress__track method-progress__track--independent" role="progressbar" aria-label={`${methodLabel} independent check accuracy`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={independentScore}><span style={{ width: `${independentScore}%` }} /></span><strong>{independentScore}%</strong></div>}
    </div>
  </div>;
}
