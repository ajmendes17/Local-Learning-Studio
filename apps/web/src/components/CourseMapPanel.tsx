import type {
  CodexStatusResponse,
  CourseLearningArtifactsResponse,
} from "@local-learning-studio/contracts";

export type LearningAction = "analyzing" | "mapping" | "accepting" | null;

interface CourseMapPanelProps {
  artifacts: CourseLearningArtifactsResponse | null;
  codex: CodexStatusResponse | null;
  readySourceCount: number;
  action: LearningAction;
  error: string | null;
  onAnalyze: (regenerate: boolean) => Promise<void>;
  onBuildMap: (regenerate: boolean) => Promise<void>;
  onAccept: () => Promise<void>;
}

const roleLabels: Record<string, string> = {
  syllabus: "Syllabus",
  schedule: "Schedule",
  "lecture-notes": "Lecture notes",
  reading: "Reading",
  assignment: "Assignment",
  "study-guide": "Study guide",
  reference: "Reference",
  other: "Other",
};

function PipelineStep({
  number,
  title,
  detail,
  state,
}: {
  number: string;
  title: string;
  detail: string;
  state: "waiting" | "current" | "complete";
}) {
  return (
    <li className={`map-step map-step--${state}`}>
      <span>{state === "complete" ? "✓" : number}</span>
      <div>
        <strong>{title}</strong>
        <p>{detail}</p>
      </div>
    </li>
  );
}

export function CourseMapPanel({
  artifacts,
  codex,
  readySourceCount,
  action,
  error,
  onAnalyze,
  onBuildMap,
  onAccept,
}: CourseMapPanelProps) {
  const classification = artifacts?.classification ?? null;
  const courseMap = artifacts?.courseMap ?? null;
  const classificationCurrent = artifacts?.classificationCurrent ?? false;
  const courseMapCurrent = artifacts?.courseMapCurrent ?? false;
  const codexReady = codex?.ready ?? false;
  const busy = action !== null;
  const mapAccepted = courseMapCurrent && courseMap?.status === "accepted";

  return (
    <section className="learning-map" aria-labelledby="learning-map-title">
      <div className="learning-map__heading">
        <div>
          <p className="section-kicker">Codex learning workflow</p>
          <h2 id="learning-map-title">Build your course map</h2>
          <p>
            Analyze imported evidence, review the proposed structure, then
            choose when it becomes part of this course.
          </p>
        </div>
        <span
          className={`codex-readiness ${codexReady ? "codex-readiness--ready" : ""}`}
        >
          <i aria-hidden="true" />
          {codex === null
            ? "Checking Codex"
            : codexReady
              ? "Codex ready"
              : "Codex setup needed"}
        </span>
      </div>

      <ol className="map-pipeline" aria-label="Course map progress">
        <PipelineStep
          number="1"
          title="Import"
          detail={
            readySourceCount > 0
              ? `${readySourceCount} extracted ${readySourceCount === 1 ? "source" : "sources"}`
              : "Add an extractable course file"
          }
          state={readySourceCount > 0 ? "complete" : "current"}
        />
        <PipelineStep
          number="2"
          title="Classify"
          detail={classificationCurrent ? "Current source roles ready" : "Analyze current evidence"}
          state={
            classificationCurrent
              ? "complete"
              : readySourceCount > 0
                ? "current"
                : "waiting"
          }
        />
        <PipelineStep
          number="3"
          title="Review map"
          detail={
            courseMapCurrent
              ? mapAccepted
                ? "Accepted course structure"
                : "Draft ready for review"
              : courseMap
                ? "Sources changed · rebuild needed"
                : "Build concepts and modules"
          }
          state={
            courseMapCurrent
              ? "complete"
              : classificationCurrent
                ? "current"
                : "waiting"
          }
        />
      </ol>

      {error ? <div className="map-error">{error}</div> : null}
      {!codexReady && codex ? (
        <div className="map-notice">
          <strong>Connect Codex before running analysis.</strong>
          <span>{codex.detail ?? "Install Codex and complete local sign-in."}</span>
        </div>
      ) : null}

      {!classificationCurrent ? (
        <div className="map-action-card">
          <div>
            <span className="map-action-card__label">First model step · Luna</span>
            <h3>Understand what each source contributes</h3>
            <p>
              Classification uses a bounded projection of extracted passages.
              Matching source fingerprints reuse the saved result.
            </p>
          </div>
          <button
            type="button"
            className="button-primary"
            disabled={!codexReady || readySourceCount === 0 || busy}
            onClick={() => void onAnalyze(false)}
          >
            {action === "analyzing" ? "Analyzing sources…" : "Analyze sources"}
          </button>
        </div>
      ) : (
        <div className="classification-review">
          <div className="map-subheading">
            <div>
              <span>Source classification</span>
              <h3>
                {classification?.payload.sources.length}{" "}
                {classification?.payload.sources.length === 1
                  ? "source"
                  : "sources"}{" "}
                understood
              </h3>
            </div>
            <button
              type="button"
              className="text-button"
              disabled={!codexReady || busy}
              onClick={() => void onAnalyze(true)}
            >
              Analyze again
            </button>
          </div>
          <div className="source-role-grid">
            {classification?.payload.sources.map((source) => (
              <article key={source.materialId} className="source-role">
                <div>
                  <span>{roleLabels[source.role] ?? source.role}</span>
                  <small>{source.confidence} confidence</small>
                </div>
                <p>{source.summary}</p>
              </article>
            ))}
          </div>
          {classification?.payload.gaps.length ? (
            <p className="map-inline-warning">
              Missing coverage: {classification.payload.gaps.join(" · ")}
            </p>
          ) : null}
        </div>
      )}

      {classificationCurrent && !courseMapCurrent ? (
        <div className="map-action-card map-action-card--terra">
          <div>
            <span className="map-action-card__label">Synthesis step · Terra</span>
            <h3>{courseMap ? "Rebuild from changed sources" : "Create a reviewable course structure"}</h3>
            <p>
              Codex proposes modules, concepts, prerequisites, objectives, and
              assessments. Nothing changes until you accept the draft.
            </p>
          </div>
          <button
            type="button"
            className="button-primary"
            disabled={!codexReady || busy}
            onClick={() => void onBuildMap(false)}
          >
            {action === "mapping" ? "Building course map…" : "Build course map"}
          </button>
        </div>
      ) : null}

      {courseMapCurrent && courseMap ? (
        <div className="course-map-review">
          <div className="map-subheading">
            <div>
              <span>{mapAccepted ? "Accepted structure" : "Review draft"}</span>
              <h3>
                {courseMap.payload.modules.length} modules · {courseMap.payload.concepts.length} concepts
              </h3>
            </div>
            <span className={`map-status map-status--${courseMap.status}`}>
              {courseMap.status}
            </span>
          </div>

          <div className="map-module-list">
            {[...courseMap.payload.modules]
              .sort((left, right) => left.position - right.position)
              .map((module, index) => (
                <article key={module.key} className="map-module">
                  <span>{String(index + 1).padStart(2, "0")}</span>
                  <div>
                    <h4>{module.title}</h4>
                    <p>{module.description}</p>
                    <small>
                      {module.conceptKeys.length} {module.conceptKeys.length === 1 ? "concept" : "concepts"}
                    </small>
                  </div>
                </article>
              ))}
          </div>

          {courseMap.payload.assessments.length ? (
            <div className="map-assessments">
              <strong>Assessments found</strong>
              <div>
                {courseMap.payload.assessments.map((assessment) => (
                  <span key={`${assessment.title}-${assessment.moduleKey ?? "course"}`}>
                    {assessment.title}
                  </span>
                ))}
              </div>
            </div>
          ) : null}

          {courseMap.payload.warnings.length ? (
            <div className="map-inline-warning">
              {courseMap.payload.warnings.join(" · ")}
            </div>
          ) : null}

          <div className="map-review-actions">
            <div>
              <small>Generated with {courseMap.model}</small>
              <span>
                {mapAccepted
                  ? "This version is active and remains available after restart."
                  : "Accepting replaces the generated course structure in one transaction."}
              </span>
            </div>
            <div>
              <button
                type="button"
                className="button-secondary"
                disabled={!codexReady || busy}
                onClick={() => void onBuildMap(true)}
              >
                {action === "mapping" ? "Regenerating…" : "Regenerate"}
              </button>
              {!mapAccepted ? (
                <button
                  type="button"
                  className="button-primary"
                  disabled={busy}
                  onClick={() => void onAccept()}
                >
                  {action === "accepting" ? "Accepting…" : "Accept course map"}
                </button>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
