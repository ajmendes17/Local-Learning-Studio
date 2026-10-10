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
  const score = scoredAttemptCount ? Math.round(correctCount / scoredAttemptCount * 100) : null;
  const independentScore = independentScoredAttemptCount
    ? Math.round(independentCorrectCount / independentScoredAttemptCount * 100)
    : null;

  return <div className="method-progress__tracks">
    <div>
      <small>All scored · {scoredAttemptCount ? `${correctCount}/${scoredAttemptCount}` : "no checks"}</small>
      {score == null
        ? <span className="method-progress__unmeasured">No scored checks yet</span>
        : <span className="method-progress__track" role="progressbar" aria-label={`${methodLabel} all scored check results`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={score}><span style={{ width: `${score}%` }} /></span>}
    </div>
    <div>
      <small>Independent · {independentScoredAttemptCount ? `${independentCorrectCount}/${independentScoredAttemptCount}` : "no checks"}</small>
      {independentScore == null
        ? <span className="method-progress__unmeasured">No independent checks yet</span>
        : <span className="method-progress__track method-progress__track--independent" role="progressbar" aria-label={`${methodLabel} independent check results`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={independentScore}><span style={{ width: `${independentScore}%` }} /></span>}
    </div>
  </div>;
}
