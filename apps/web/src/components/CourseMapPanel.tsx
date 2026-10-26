import type {
  CodexStatusResponse,
  CourseMaterial,
  CourseLearningArtifactsResponse,
  LearnerProfileResponse,
  AssessmentReconciliationResponse,
} from "@local-learning-studio/contracts";
import type { LearningRunInfo } from "../lib/learning-run-history";
import { AcceptedStructureDiagram } from "./AcceptedStructureDiagram";
import { MathText } from "./MathText";
import type { ApiErrorInfo } from "../lib/api";
import { useState } from "react";

export type LearningAction = "analyzing" | "mapping" | "accepting" | "reconciling" | "merging" | null;

interface CourseMapPanelProps {
  artifacts: CourseLearningArtifactsResponse | null;
  learnerProgress: LearnerProfileResponse["concepts"];
  sourceProgress: LearnerProfileResponse["sources"];
  learnerAssessments?: LearnerProfileResponse["assessments"];
  codex: CodexStatusResponse | null;
  readySourceCount: number;
  assessmentCount: number;
  materials: CourseMaterial[];
  action: LearningAction;
  run: LearningRunInfo | null;
  runHistory?: LearningRunInfo[];
  error: ApiErrorInfo | null;
  onAnalyze: (regenerate: boolean) => Promise<void>;
  onBuildMap: (regenerate: boolean) => Promise<void>;
  onAccept: () => Promise<void>;
  reconciliation: AssessmentReconciliationResponse | null;
  onReconcile: () => Promise<void>;
  onMergeAssessmentNotes: (canonicalRecordKey: string, duplicateRecordKeys: string[]) => Promise<void>;
  onStudyTopic: (topic: string, sourceMaterialId?: string, assessmentId?: string, method?: "quiz") => void;
  onStudyMaterial: (topic: string, materialId: string) => void;
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

function diagnosticText(value: unknown) {
  if (Array.isArray(value)) {
    return value.length ? value.map((item) => typeof item === "string" ? item : JSON.stringify(item)).join(" · ") : "none";
  }
  if (value && typeof value === "object") {
    return Object.entries(value).map(([key, item]) => `${key}: ${String(item)}`).join(" · ");
  }
  return String(value);
}

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
  learnerProgress,
  sourceProgress,
  learnerAssessments = [],
  codex,
  readySourceCount,
  assessmentCount,
  materials,
  action,
  run,
  runHistory = [],
  error,
  onAnalyze,
  onBuildMap,
  onAccept,
  reconciliation,
  onReconcile,
  onMergeAssessmentNotes,
  onStudyTopic,
  onStudyMaterial,
}: CourseMapPanelProps) {
  const [mergeDecisions, setMergeDecisions] = useState<Record<string, "merged" | "kept">>({});
  const [mergeBusy, setMergeBusy] = useState<string | null>(null);
  const [mergeError, setMergeError] = useState<string | null>(null);
  const classification = artifacts?.classification ?? null;
  const courseMap = artifacts?.courseMap ?? null;
  const classificationCurrent = artifacts?.classificationCurrent ?? false;
  const courseMapCurrent = artifacts?.courseMapCurrent ?? false;
  const codexReady = codex?.ready ?? false;
  const busy = action !== null;
  const mapAccepted = courseMapCurrent && courseMap?.status === "accepted";
  const supportedCount = reconciliation?.topicFindings.filter(({ status }) => status === "directly-supported").length ?? 0;
  const unsupportedCount = reconciliation?.topicFindings.filter(({ status }) => status === "contradicted" || status === "unsupported").length ?? 0;
  const scheduledCount = reconciliation?.topicFindings.filter(({ status }) => status === "scheduled" || status === "plausible-unverified").length ?? 0;

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

      {run && run.status !== "failed" ? (
        <div className="codex-run-status" role="status" aria-live="polite">
          <div><strong>{run.status === "running" ? `Codex is ${run.phase === "classification" ? "analyzing sources" : "building the course map"}…` : run.model === "Cached result" ? "Reused saved result" : "Codex run complete"}</strong><span>{run.model} · {run.durationMs == null ? `${Math.max(1, Math.floor((Date.now() - run.startedAt) / 1000))}s elapsed` : `${(run.durationMs / 1000).toFixed(1)}s`}</span></div>
          {run.usage ? <p>{run.usage.inputTokens.toLocaleString()} input tokens · {run.usage.outputTokens.toLocaleString()} output tokens · {run.usage.cachedInputTokens.toLocaleString()} cached input</p> : run.status === "running" ? <p>Token totals will appear when this model call finishes.</p> : <p>Token usage was not reported for this run.</p>}
          {run.promptCharacters != null && run.sourceStats ? <p>Prompt: {run.promptCharacters.toLocaleString()} characters · {run.sourceStats.passageCount} passages / {run.sourceStats.materialCount} materials · {run.sourceStats.characterCount.toLocaleString()} source characters · {run.omittedPassageCount ?? 0} omitted</p> : null}
        </div>
      ) : null}
      {runHistory.length ? <details className="learning-run-history"><summary>Recent analysis runs ({runHistory.length})</summary><ol>{runHistory.map((item) => <li key={item.operationId}><div><strong>{item.phase === "classification" ? "Source analysis" : "Course map"}</strong><span>{item.status === "running" ? "Interrupted or still running" : item.status} · {item.model ?? "Model not reported"} · {new Date(item.startedAt).toLocaleString()}</span></div><p>{item.usage ? `${item.usage.inputTokens.toLocaleString()} input · ${item.usage.cachedInputTokens.toLocaleString()} cached · ${item.usage.outputTokens.toLocaleString()} output tokens` : "No token usage reported"}{item.durationMs != null ? ` · ${(item.durationMs / 1000).toFixed(1)}s` : ""}</p>{item.promptCharacters != null && item.sourceStats ? <small>Prompt {item.promptCharacters.toLocaleString()} chars · {item.sourceStats.materialCount} sources · {item.sourceStats.passageCount} passages · {item.sourceStats.characterCount.toLocaleString()} source chars · {item.omittedPassageCount ?? 0} omitted</small> : null}</li>)}</ol></details> : null}

      {error ? <div className="map-error" role="alert"><p>{error.error}</p>{error.diagnostics ? <details className="map-error__diagnostics" open><summary>Inspect validation details</summary><p>These checks compare the generated response with the supported structure and the exact course evidence supplied for this run.</p><dl>{Object.entries(error.diagnostics).map(([key, value]) => <div key={key}><dt>{key.replaceAll(/([A-Z])/g, " $1").replace(/^./, (letter) => letter.toUpperCase())}</dt><dd>{diagnosticText(value)}</dd></div>)}</dl></details> : null}</div> : null}
      <section className="assessment-reconciliation" aria-labelledby="assessment-reconciliation-title">
        <div className="assessment-reconciliation__heading">
          <div><span className="map-action-card__label">Assessment check</span><h3 id="assessment-reconciliation-title">Compare exam records with course sources</h3><p>Find duplicate exam entries and see which topics are supported by a review or only appear in the schedule. Accepted merges keep one note, preserve personal notes, and archive duplicate snapshots in the vault.</p></div>
          <button type="button" className="button-secondary" disabled={!codexReady || busy || readySourceCount === 0 || assessmentCount === 0} onClick={() => void onReconcile()}>{action === "reconciling" ? "Comparing sources…" : reconciliation ? "Compare again" : "Reconcile assessments"}</button>
        </div>
        {assessmentCount === 0 ? <p className="assessment-reconciliation__hint">Add an exam or assessment to the course map first.</p> : null}
        {reconciliation ? <div className="assessment-reconciliation__result" aria-live="polite">
          <div className={`assessment-reconciliation__dashboard assessment-reconciliation__dashboard--${reconciliation.accuracyGrade.toLowerCase()}`}>
            <div className="assessment-reconciliation__grade"><span>Map accuracy</span><strong>{reconciliation.accuracyGrade}</strong></div>
            <div className="assessment-reconciliation__metric assessment-reconciliation__metric--supported"><strong>{supportedCount}</strong><span>Supported</span></div>
            <div className="assessment-reconciliation__metric assessment-reconciliation__metric--scheduled"><strong>{scheduledCount}</strong><span>Scheduled / uncertain</span></div>
            <div className="assessment-reconciliation__metric assessment-reconciliation__metric--unsupported"><strong>{unsupportedCount}</strong><span>Unsupported / contradicted</span></div>
          </div>
          <p className="assessment-reconciliation__grade-rationale">{reconciliation.gradeRationale}</p>
          <h4>Assessment records</h4>
          {reconciliation.assessmentGroups.map((group, index) => {
            const groupKey = group.recordKeys.join("|");
            const obsidianRecords = group.recordKeys.map((key) => reconciliation.recordIndex.find((record) => record.recordKey === key)).filter((record) => record?.kind === "obsidian-note");
            const canonicalSlug = group.canonicalTitle.toLowerCase().replaceAll(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
            const canonical = obsidianRecords.find((record) => record?.filename?.startsWith(`${canonicalSlug}--course-`)) ?? obsidianRecords[0];
            const duplicates = obsidianRecords.filter((record) => record && record.recordKey !== canonical?.recordKey);
            return <article className={`assessment-reconciliation__record ${duplicates.length && group.duplicateConfidence !== "not-duplicates" ? "assessment-reconciliation__record--duplicate" : ""}`} key={`${group.canonicalTitle}-${index}`}><strong>{group.canonicalTitle}</strong><span>{group.duplicateConfidence === "not-duplicates" ? "Separate records" : `${group.duplicateConfidence} confidence they describe the same assessment`}</span><p>{group.recordKeys.map((key) => reconciliation.recordIndex.find((record) => record.recordKey === key)?.title ?? key).join(" · ")}: {group.rationale}</p>{duplicates.length ? mergeDecisions[groupKey] === "merged" ? <small className="assessment-reconciliation__decision assessment-reconciliation__decision--accepted">One note kept; duplicate snapshots archived and personal notes preserved.</small> : mergeDecisions[groupKey] === "kept" ? <small className="assessment-reconciliation__decision assessment-reconciliation__decision--denied">Kept as separate notes.</small> : <div className="assessment-reconciliation__actions"><button type="button" className="assessment-reconciliation__accept" disabled={busy || mergeBusy !== null} onClick={async () => { if (!canonical?.recordKey) return; setMergeBusy(groupKey); setMergeError(null); try { await onMergeAssessmentNotes(canonical.recordKey, duplicates.map((record) => record!.recordKey)); setMergeDecisions((current) => ({ ...current, [groupKey]: "merged" })); } catch (error) { setMergeError((error as Error).message); } finally { setMergeBusy(null); } }}>{mergeBusy === groupKey ? "Combining notes…" : `Accept · keep “${group.canonicalTitle}”`}</button><button type="button" className="assessment-reconciliation__deny" disabled={busy || mergeBusy !== null} onClick={() => setMergeDecisions((current) => ({ ...current, [groupKey]: "kept" }))}>Keep separate</button></div> : null}</article>;
          })}
          {mergeError ? <p className="map-error" role="alert">{mergeError}</p> : null}
          <h4>Topic evidence</h4>
          <ul className="assessment-reconciliation__topics">{reconciliation.topicFindings.map((finding, index) => <li className={`assessment-reconciliation__topic assessment-reconciliation__topic--${finding.status}`} key={`${finding.topic}-${index}`}><div><strong>{finding.topic}</strong><span>{finding.status.replaceAll("-", " ")}</span></div><p>{finding.explanation}</p><small className="assessment-reconciliation__citations">{finding.examEvidence.length ? `Review evidence: ${finding.examEvidence.join(", ")}` : "No direct exam-review evidence."}{finding.scheduleEvidence.length ? ` · Schedule evidence: ${finding.scheduleEvidence.join(", ")}` : ""}</small></li>)}</ul>
          {reconciliation.clarifications.length ? <><h4>Still unclear</h4><ul>{reconciliation.clarifications.map((item, index) => <li key={index}>{item}</li>)}</ul></> : null}
          {reconciliation.cleanupSuggestions.length ? <><h4>Suggested cleanup</h4><ul>{reconciliation.cleanupSuggestions.map((item, index) => <li key={index}>{item}</li>)}</ul></> : null}
          <details><summary>Sources used</summary><ul>{reconciliation.sourceIndex.map((source) => <li key={source.sourceKey}>{source.sourceKey} · {source.materialName} · {source.location}</li>)}</ul></details>
          <small>Generated by {reconciliation.model} · {new Date(reconciliation.createdAt).toLocaleString()}</small>
        </div> : null}
      </section>
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
                  <span>{materials.find(({ id }) => id === source.materialId)?.originalName ?? roleLabels[source.role] ?? source.role}</span>
                  <small>{roleLabels[source.role] ?? source.role} · {source.confidence} confidence</small>
                </div>
                <p><MathText inline content={source.summary} /></p>
              </article>
            ))}
          </div>
          {classification?.payload.gaps.length ? (
            <p className="map-inline-warning">
              Missing coverage: {classification.payload.gaps.map((gap, index) => <span key={`${gap}-${index}`}>{index ? " · " : ""}<MathText inline content={gap} /></span>)}
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

          {mapAccepted ? <AcceptedStructureDiagram proposal={courseMap.payload} materials={materials} learnerProgress={learnerProgress} sourceProgress={sourceProgress} learnerAssessments={learnerAssessments} onStudyTopic={onStudyTopic} onStudyMaterial={onStudyMaterial} /> : <div className="map-module-list">
            {[...courseMap.payload.modules]
              .sort((left, right) => left.position - right.position)
              .map((module, index) => (
                <article key={module.key} className="map-module">
                  <span>{String(index + 1).padStart(2, "0")}</span>
                  <div>
                    <h4><MathText inline content={module.title} /></h4>
                    <p><MathText inline content={module.description} /></p>
                    <small>
                      {module.conceptKeys.length} {module.conceptKeys.length === 1 ? "concept" : "concepts"}
                    </small>
                  </div>
                </article>
              ))}
          </div>}

          {!mapAccepted && courseMap.payload.assessments.length ? (
            <div className="map-assessments">
              <strong>Assessments found</strong>
              <div>
                {courseMap.payload.assessments.map((assessment) => (
                  <span key={`${assessment.title}-${assessment.moduleKey ?? "course"}`}>
                    <MathText inline content={assessment.title} />
                  </span>
                ))}
              </div>
            </div>
          ) : null}

          {courseMap.payload.warnings.length ? (
            <div className="map-inline-warning">
              {courseMap.payload.warnings.map((warning, index) => <span key={`${warning}-${index}`}>{index ? " · " : ""}<MathText inline content={warning} /></span>)}
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
