import type {
  CodexStatusResponse,
  CourseDetail,
  CourseLearningArtifactsResponse,
  CourseMaterial,
  LearnerProfileResponse,
  MaterialKind,
  SourceAnnotation,
  SourcePassage,
} from "@local-learning-studio/contracts";
import { useEffect, useState } from "react";
import {
  CourseMapPanel,
  type LearningAction,
} from "../components/CourseMapPanel";
import { MaterialUpload } from "../components/MaterialUpload";
import { ObsidianExportPanel } from "../components/ObsidianExportPanel";
import { MathText } from "../components/MathText";
import type { LearningRunInfo } from "../App";
import type { ApiErrorInfo } from "../lib/api";
import { summarizeSourceAnnotations } from "../lib/source-annotation-summary";
import { clearSourceCommentDraft, readSourceCommentDraft, writeSourceCommentDraft } from "../lib/source-comment-draft";
import type { DraftStorage } from "../lib/study-attempt-draft";

interface CoursePageProps {
  course: CourseDetail | null;
  loading: boolean;
  error: string | null;
  artifacts: CourseLearningArtifactsResponse | null;
  learnerProgress: LearnerProfileResponse["concepts"];
  sourceProgress: LearnerProfileResponse["sources"];
  learnerAssessments: LearnerProfileResponse["assessments"];
  codex: CodexStatusResponse | null;
  learningAction: LearningAction;
  learningRun: LearningRunInfo | null;
  learningError: ApiErrorInfo | null;
  onBack: () => void;
  onUpload: (file: File, kind: MaterialKind) => Promise<void>;
  onAnalyze: (regenerate: boolean) => Promise<void>;
  onBuildMap: (regenerate: boolean) => Promise<void>;
  onAcceptMap: () => Promise<void>;
  onStudy: () => void;
  onStudyTopic: (topic: string, sourceMaterialId?: string, assessmentId?: string, method?: "quiz") => void;
  onStudyMaterial: (topic: string, materialId: string) => void;
  onRefreshCourse: () => Promise<void>;
}

const materialKindLabels: Record<MaterialKind, string> = {
  syllabus: "Syllabus",
  "lecture-notes": "Lecture notes",
  reading: "Reading",
  assignment: "Assignment",
  "study-guide": "Study guide",
  other: "Other",
};

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function MaterialRow({ courseId, material, onRefresh }: { courseId: string; material: CourseMaterial; onRefresh: () => Promise<void> }) {
  const [open, setOpen] = useState(false);
  const [reprocessing, setReprocessing] = useState(false);
  const [reprocessMessage, setReprocessMessage] = useState("");
  async function reprocessSource() {
    setReprocessing(true); setReprocessMessage("");
    try {
      const response = await fetch(`/api/courses/${courseId}/materials/${material.id}/reprocess`, { method: "POST" });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error ?? "Could not refresh extracted source text.");
      setReprocessMessage("Extraction refreshed. Comments tied to changed passages may need review.");
      setOpen(false);
      await onRefresh();
    } catch (error) { setReprocessMessage((error as Error).message); }
    finally { setReprocessing(false); }
  }
  const extension =
    material.originalName.split(".").pop()?.toUpperCase() ?? "FILE";
  const processingSummary =
    material.status === "ready"
      ? `${material.passageCount} source ${
          material.passageCount === 1 ? "passage" : "passages"
        }`
      : material.status === "stored"
        ? "Saved · extraction not available yet"
        : material.status === "processing"
          ? "Extracting source passages"
          : material.errorMessage;
  const statusLabel = {
    failed: "Needs attention",
    processing: "Processing",
    ready: "Ready",
    stored: "Stored",
  }[material.status];

  return (
    <>
    <li className="material-row">
      <span className="file-mark" aria-hidden="true">
        {extension.slice(0, 4)}
      </span>
      <span className="material-row__name">
        <strong>{material.originalName}</strong>
        <span>
          {materialKindLabels[material.kind]} · {formatBytes(material.sizeBytes)}
        </span>
        {processingSummary ? (
          <span
            className={
              material.status === "failed" ? "material-row__error" : undefined
            }
          >
            {processingSummary}
          </span>
        ) : null}
      </span>
      <span className={`status-pill status-pill--${material.status}`}>
        {statusLabel}
      </span>
      <button type="button" className="material-row__review" disabled={material.status !== "ready"} aria-expanded={open} onClick={() => setOpen((current) => !current)}>{open ? "Close review" : "Review & comment"}</button>
      <button type="button" className="material-row__review" disabled={reprocessing || !["ready", "failed"].includes(material.status)} onClick={() => void reprocessSource()}>{reprocessing ? "Refreshing…" : material.status === "failed" ? "Retry extraction" : "Refresh extraction"}</button>
    </li>
    {reprocessMessage ? <li className="material-review-row" role="status">{reprocessMessage}</li> : null}
    {open ? <li className="material-review-row"><MaterialReview courseId={courseId} material={material} /></li> : null}
    </>
  );
}

function sourceLocationLabel(location: SourcePassage["location"]) {
  switch (location.kind) {
    case "page": return location.pageStart === location.pageEnd ? `Page ${location.pageStart}` : `Pages ${location.pageStart}–${location.pageEnd}`;
    case "slides": return `Slides ${location.slideStart}–${location.slideEnd}${location.title ? ` · ${location.title}` : ""}`;
    case "lines": return `Lines ${location.lineStart}–${location.lineEnd}${location.heading ? ` · ${location.heading}` : ""}`;
    case "paragraphs": return `Paragraphs ${location.paragraphStart}–${location.paragraphEnd}${location.heading ? ` · ${location.heading}` : ""}`;
  }
}

function MaterialReview({ courseId, material }: { courseId: string; material: CourseMaterial }) {
  const [passages, setPassages] = useState<SourcePassage[]>([]);
  const [annotations, setAnnotations] = useState<SourceAnnotation[]>([]);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editBody, setEditBody] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [loaded, setLoaded] = useState(false);
  const base = `/api/courses/${courseId}/materials/${material.id}`;
  const annotationSummary = summarizeSourceAnnotations(passages.map(({ id }) => id), annotations);
  const draftStorages = (): DraftStorage[] => {
    try { return [window.localStorage, window.sessionStorage]; } catch { return []; }
  };

  async function load() {
    setLoading(true); setError("");
    try {
      const [passageResponse, annotationResponse] = await Promise.all([fetch(`${base}/passages?limit=200&offset=0`), fetch(`${base}/annotations`)]);
      const passageData = await passageResponse.json();
      const annotationData = await annotationResponse.json();
      if (!passageResponse.ok || !annotationResponse.ok) throw new Error(passageData.error ?? annotationData.error ?? "Could not load this material’s passages.");
      const allPassages = [...passageData.passages as SourcePassage[]];
      while (allPassages.length < passageData.total) {
        const nextResponse = await fetch(`${base}/passages?limit=200&offset=${allPassages.length}`);
        const nextPage = await nextResponse.json();
        if (!nextResponse.ok) throw new Error(nextPage.error ?? "Could not load the rest of this material’s passages.");
        if (!nextPage.passages.length) break;
        allPassages.push(...nextPage.passages as SourcePassage[]);
      }
      const storages = draftStorages();
      setDrafts((current) => {
        const restored = { ...current };
        for (const passage of allPassages) {
          if (restored[passage.id] === undefined) {
            restored[passage.id] = readSourceCommentDraft(storages, courseId, material.id, passage.id) ?? "";
          }
        }
        return restored;
      });
      setPassages(allPassages);
      setAnnotations(annotationData as SourceAnnotation[]);
      setLoaded(true);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not load material review."); }
    finally { setLoading(false); }
  }

  useEffect(() => { void load(); }, []);

  async function send(path: string, method: "POST" | "PATCH" | "DELETE", body?: unknown) {
    const response = await fetch(path, { method, ...(body !== undefined ? { headers: { "content-type": "application/json" }, body: JSON.stringify(body) } : {}) });
    const result = response.status === 204 ? null : await response.json().catch(() => null);
    if (!response.ok) throw new Error(result?.error ?? `The local service returned ${response.status}.`);
    return result;
  }

  async function addComment(passageId: string) {
    const body = drafts[passageId]?.trim();
    if (!body || busy) return;
    setBusy(true); setError("");
    try {
      const created = await send(`${base}/annotations`, "POST", { passageId, body }) as SourceAnnotation;
      setAnnotations((current) => [...current, created]);
      setDrafts((current) => ({ ...current, [passageId]: "" }));
      clearSourceCommentDraft(draftStorages(), courseId, material.id, passageId);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not save comment."); }
    finally { setBusy(false); }
  }

  async function saveEdit(annotation: SourceAnnotation) {
    if (!editBody.trim() || busy) return;
    setBusy(true); setError("");
    try {
      const updated = await send(`${base}/annotations/${annotation.id}`, "PATCH", { body: editBody }) as SourceAnnotation;
      setAnnotations((current) => current.map((item) => item.id === updated.id ? updated : item));
      setEditingId(null); setEditBody("");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not update comment."); }
    finally { setBusy(false); }
  }

  async function remove(annotation: SourceAnnotation) {
    if (busy || !window.confirm("Delete this comment from the source passage?")) return;
    setBusy(true); setError("");
    try {
      await send(`${base}/annotations/${annotation.id}`, "DELETE");
      setAnnotations((current) => current.filter((item) => item.id !== annotation.id));
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not delete comment."); }
    finally { setBusy(false); }
  }

  return <section className="material-review" aria-label={`Review ${material.originalName}`}>
    <div className="material-review__heading"><div><p className="section-kicker">Source review</p><h3>{material.originalName}</h3><p>Comments stay attached to the extracted passage and its page, slide, or line location.</p>{loaded && passages.length ? <p className="material-review__coverage">{annotationSummary.commentedPassageCount} of {passages.length} passages commented · {annotationSummary.currentCommentCount} current {annotationSummary.currentCommentCount === 1 ? "comment" : "comments"}{annotationSummary.olderCommentCount ? ` · ${annotationSummary.olderCommentCount} from older extractions` : ""}</p> : null}</div>{loaded ? <button type="button" className="button-secondary" disabled={loading} onClick={() => void load()}>Refresh passages</button> : null}</div>
    {material.mediaType === "application/pdf" ? <p className="material-review__math-note" role="note">PDF text extraction can flatten equation layout or separate symbols. Use the original page link below to verify math notation.</p> : null}
    {loading ? <p>Loading extracted passages…</p> : null}
    {error ? <p className="error-banner" role="alert">{error}</p> : null}
    {!loading && passages.map((passage) => {
      const passageComments = annotations.filter((annotation) => annotation.isCurrent && annotation.passageId === passage.id);
      const originalPdfPage = material.mediaType === "application/pdf" && passage.location.kind === "page" ? passage.location.pageStart : null;
      return <article className="material-review__passage" key={passage.id}>
        <h4>Passage {passage.ordinal + 1} <span>{sourceLocationLabel(passage.location)}</span></h4>
        {originalPdfPage ? <a className="material-review__original-pdf" href={`/api/courses/${courseId}/materials/${material.id}/file#page=${originalPdfPage}`} target="_blank" rel="noreferrer">Open original PDF · page {originalPdfPage} →</a> : null}
        <details><summary>Read extracted text</summary><blockquote><MathText content={passage.content} inertLinksAndImages /></blockquote></details>
        {passageComments.map((annotation) => <div className="material-comment" key={annotation.id}>
          {editingId === annotation.id ? <><textarea aria-label="Edit source comment" maxLength={8000} value={editBody} onChange={(event) => setEditBody(event.target.value)} /><div className="material-comment__actions"><button type="button" className="button-primary" disabled={busy || !editBody.trim()} onClick={() => void saveEdit(annotation)}>Save edit</button><button type="button" className="button-secondary" onClick={() => setEditingId(null)}>Cancel</button></div></> : <><MathText content={annotation.body} inertLinksAndImages /><small>Commented {new Date(annotation.updatedAt).toLocaleString()}</small><div className="material-comment__actions"><button type="button" className="button-secondary" onClick={() => { setEditingId(annotation.id); setEditBody(annotation.body); }}>Edit</button><button type="button" className="button-secondary" disabled={busy} onClick={() => void remove(annotation)}>Delete</button></div></>}
        </div>)}
        <label className="material-review__add">Add a comment<textarea maxLength={8000} value={drafts[passage.id] ?? ""} onChange={(event) => { const body = event.target.value; setDrafts((current) => ({ ...current, [passage.id]: body })); writeSourceCommentDraft(draftStorages(), courseId, material.id, passage.id, body); }} placeholder="Add a question, clarification, exam emphasis, or personal note for this passage." /></label>
        {drafts[passage.id]?.trim() ? <small role="status">Draft saved in this browser for up to 7 days.</small> : null}
        <button type="button" className="button-primary" disabled={busy || !drafts[passage.id]?.trim()} onClick={() => void addComment(passage.id)}>Save comment</button>
      </article>;
    })}
    {!loading && annotations.some((annotation) => !annotation.isCurrent) ? <section className="material-review__stale"><h4>Comments from an older extraction</h4><p>The source text changed, so these comments remain saved with their old excerpt and location. Review them before copying into Obsidian.</p>{annotations.filter((annotation) => !annotation.isCurrent).map((annotation) => <article key={annotation.id}><strong>{sourceLocationLabel(annotation.location)} · saved excerpt</strong><blockquote><MathText content={annotation.excerpt} inertLinksAndImages /></blockquote><MathText content={annotation.body} inertLinksAndImages /><button type="button" className="button-secondary" disabled={busy} onClick={() => void remove(annotation)}>Delete old comment</button></article>)}</section> : null}
    {!loading && !passages.length ? <p>No extracted passages are available for comments.</p> : null}
  </section>;
}

export function CoursePage({
  course,
  loading,
  error,
  artifacts,
  learnerProgress,
  sourceProgress,
  learnerAssessments,
  codex,
  learningAction,
  learningRun,
  learningError,
  onBack,
  onUpload,
  onAnalyze,
  onBuildMap,
  onAcceptMap,
  onStudy,
  onStudyTopic,
  onStudyMaterial,
  onRefreshCourse,
}: CoursePageProps) {
  if (loading && !course) {
    return <main className="course-loading">Opening class…</main>;
  }

  if (!course) {
    return (
      <main className="course-error">
        <p className="eyebrow">Class unavailable</p>
        <h1>We couldn’t open this course.</h1>
        <p>{error ?? "The class may no longer exist."}</p>
        <button type="button" className="button-primary" onClick={onBack}>
          Return to library
        </button>
      </main>
    );
  }

  return (
    <main className={`course-workspace course-workspace--${course.accent}`}>
      <button type="button" className="back-link" onClick={onBack}>
        <span aria-hidden="true">←</span> All classes
      </button>

      <section className="course-title">
        <div>
          <p className="eyebrow">{course.code || "Personal course"}</p>
          <h1>{course.title}</h1>
          <p>{course.term || "No term assigned"}</p>
        </div>
        <div className="course-stats" aria-label="Course summary">
          <span>
            <strong>{course.materialCount}</strong>
            Materials
          </span>
          <span>
            <strong>{course.moduleCount}</strong>
            Modules
          </span>
          <span>
            <strong>{course.assessmentCount}</strong>
            Assessments
          </span>
        </div>
      </section>
      <section className="course-study-callout">
        <div><p className="section-kicker">Class knowledge base</p><h2>Study this class</h2><p>Lessons, assessments, attempts, and knowledge evidence stay separate for {course.title}.</p></div>
        <button type="button" className="button-primary" onClick={onStudy}>Open study space →</button>
      </section>

      {error ? <div className="error-banner">{error}</div> : null}

      <section className="workspace-grid">
        <div className="workspace-main">
          <div className="section-title">
            <div>
              <p className="section-kicker">Source library</p>
              <h2>Course materials</h2>
            </div>
            <p>Files are saved only inside this class.</p>
          </div>
          <MaterialUpload onUpload={onUpload} />
          {course.materials.length > 0 ? (
            <ul className="material-list">
              {course.materials.map((material) => (
                <MaterialRow key={material.id} courseId={course.id} material={material} onRefresh={onRefreshCourse} />
              ))}
            </ul>
          ) : (
            <div className="section-empty">
              <p>No course material yet.</p>
              <span>
                Begin with the syllabus so this class can later propose modules
                and major exams.
              </span>
            </div>
          )}
        </div>

        <aside className="structure-panel">
          <div className="section-title">
            <div>
              <p className="section-kicker">Class map</p>
              <h2>Structure</h2>
            </div>
          </div>
          <div className="structure-block">
            <span className="structure-icon" aria-hidden="true">
              M
            </span>
            <div>
              <strong>Modules</strong>
              <p>
                {course.modules.length
                  ? `${course.modules.length} organized modules`
                  : "No modules defined yet"}
              </p>
            </div>
          </div>
          <div className="structure-block">
            <span className="structure-icon" aria-hidden="true">
              E
            </span>
            <div>
              <strong>Major assessments</strong>
              <p>
                {course.assessments.length
                  ? `${course.assessments.length} exams and assignments`
                  : "No assessments defined yet"}
              </p>
            </div>
          </div>
          <div className="syllabus-note">
            <span>Learning structure</span>
            <strong>
              {artifacts?.courseMapCurrent
                ? artifacts.courseMap?.status === "accepted"
                  ? "Course map active"
                  : "Draft ready to review"
                : "Build from course evidence"}
            </strong>
            <p>
              Codex proposes source-grounded modules, concepts, and assessments.
              You decide when a current draft becomes active.
            </p>
          </div>
        </aside>
      </section>

      <CourseMapPanel
        artifacts={artifacts}
        learnerProgress={learnerProgress}
        sourceProgress={sourceProgress}
        learnerAssessments={learnerAssessments}
        codex={codex}
        readySourceCount={
          course.materials.filter(({ status }) => status === "ready").length
        }
        materials={course.materials}
        action={learningAction}
        run={learningRun}
        error={learningError}
        onAnalyze={onAnalyze}
        onBuildMap={onBuildMap}
        onAccept={onAcceptMap}
        onStudyTopic={onStudyTopic}
        onStudyMaterial={onStudyMaterial}
      />
      <ObsidianExportPanel courseId={course.id} courseTitle={course.title} />
    </main>
  );
}
