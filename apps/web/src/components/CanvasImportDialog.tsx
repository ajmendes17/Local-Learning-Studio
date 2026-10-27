import { useEffect, useRef, useState, type FormEvent } from "react";
import type { CanvasImportJob, CanvasPreview, CanvasStatus, CourseSummary } from "@local-learning-studio/contracts";
import { getCanvasImport, getCanvasStatus, importCanvasCourse, previewCanvasCourse } from "../lib/api";
import { materialKindLabels } from "../lib/material-kinds";

interface Props {
  courses: CourseSummary[];
  existingCourseId?: string;
  courseUrl?: string;
  onClose: () => void;
  onImported: (courseId: string) => Promise<void>;
}
const busyJob = (job: CanvasImportJob | null) => job?.status === "queued" || job?.status === "running";
const byteLabel = (size: number | null) => size === null ? "" : size < 1024 * 1024 ? `${Math.round(size / 1024)} KB` : `${(size / (1024 * 1024)).toFixed(1)} MB`;

export function CanvasImportDialog({ courses, existingCourseId, courseUrl, onClose, onImported }: Props) {
  const [connection, setConnection] = useState<CanvasStatus | null>(null);
  const [url, setUrl] = useState(courseUrl ?? "");
  const [preview, setPreview] = useState<CanvasPreview | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [destination, setDestination] = useState(existingCourseId ?? "");
  const [title, setTitle] = useState("");
  const [code, setCode] = useState("");
  const [term, setTerm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [job, setJob] = useState<CanvasImportJob | null>(null);
  const [filter, setFilter] = useState("");
  const [visibility, setVisibility] = useState("all");
  const notified = useRef<string | null>(null);
  const dialog = useRef<HTMLElement>(null);

  useEffect(() => { void getCanvasStatus().then(setConnection).catch((e: Error) => setError(e.message)); }, []);
  useEffect(() => {
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    let disposed = false;
    try {
      const pending = localStorage.getItem("canvas-import-job");
      if (pending) void getCanvasImport(pending).then(async (next) => {
        if (disposed) return;
        setJob(next);
        if (!busyJob(next)) { notified.current = next.id; await onImported(next.courseId); }
      }).catch(() => { localStorage.removeItem("canvas-import-job"); });
    } catch { /* Import still works if browser storage is unavailable. */ }
    return () => { disposed = true; previousFocus?.focus(); };
  }, [onImported]);
  useEffect(() => {
    if (!job || !busyJob(job)) return;
    let disposed = false;
    let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      try {
        const next = await getCanvasImport(job.id);
        if (disposed) return;
        setJob(next);
        if (!busyJob(next) && notified.current !== next.id) { notified.current = next.id; await onImported(next.courseId); }
        else if (!disposed) timer = setTimeout(() => void poll(), 1200);
      } catch (e) { if (!disposed) { setError((e as Error).message); timer = setTimeout(() => void poll(), 3000); } }
    };
    timer = setTimeout(() => void poll(), 300);
    return () => { disposed = true; clearTimeout(timer); };
  }, [job?.id, job?.status, onImported]);

  async function discover(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError(null); setPreview(null); setJob(null);
    try {
      const next = await previewCanvasCourse(url);
      setPreview(next); setTitle(next.course.title); setCode(next.course.code); setTerm(next.course.term);
      setDestination(next.linkedCourseId ?? existingCourseId ?? "");
      setSelected(new Set(next.resources.filter((resource) => resource.availability === "available" && !resource.containsSolutions && !resource.imported).map(({ id }) => id)));
    } catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  }
  async function start() {
    if (!preview) return;
    setBusy(true); setError(null);
    try {
      const started = await importCanvasCourse({ previewId: preview.id, resourceIds: [...selected], title, code, term, accent: "moss", ...(destination ? { existingCourseId: destination } : {}) });
      setJob(started.job);
      try { localStorage.setItem("canvas-import-job", started.job.id); } catch { /* Progress remains on the server. */ }
      if (!busyJob(started.job)) { notified.current = started.job.id; await onImported(started.course.id); }
    } catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  }
  const finished = job && !busyJob(job);
  const completed = job?.items.filter((item) => !["queued", "importing"].includes(item.status)).length ?? 0;
  const issues = job?.items.filter((item) => item.status === "failed") ?? [];
  const needsAttention = (availability: string) => ["locked", "unavailable", "unsupported"].includes(availability);
  const resources = preview?.resources.filter((resource) => {
    const match = visibility === "all" || visibility === resource.availability || (visibility === "restricted" && ["locked", "unavailable"].includes(resource.availability)) || (visibility === "solutions" && resource.containsSolutions);
    return match && `${resource.title} ${resource.modules.join(" ")} ${resource.type} ${resource.availability} ${resource.detail}`.toLowerCase().includes(filter.toLowerCase());
  }).sort((a, b) => Number(needsAttention(b.availability)) - Number(needsAttention(a.availability))) ?? [];

  return <div className="dialog-backdrop" role="presentation" onMouseDown={() => { if (!busy && !busyJob(job)) onClose(); }}>
    <section ref={dialog} className="course-dialog canvas-dialog" role="dialog" aria-modal="true" aria-labelledby="canvas-heading" onMouseDown={(event) => event.stopPropagation()} onKeyDown={(event) => {
      if (event.key === "Escape" && !busy && !busyJob(job)) { event.preventDefault(); onClose(); }
      if (event.key === "Tab") {
        const controls = [...(dialog.current?.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), select:not(:disabled), a[href], summary') ?? [])].filter((element) => element.getClientRects().length > 0);
        const first = controls[0], last = controls[controls.length - 1];
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
      }
    }}>
      <div className="dialog-heading"><div><p className="eyebrow">Canvas import</p><h2 id="canvas-heading">Bring your class into focus.</h2></div><button type="button" className="icon-button" aria-label="Close Canvas import" disabled={busy || busyJob(job)} onClick={onClose}>×</button></div>
      {!job && <>
        <p className="canvas-copy">Preview your course, then choose materials to save alongside your own uploads.</p>
        <form onSubmit={(event) => void discover(event)}>
          <label>Canvas course URL<input autoFocus required type="url" value={url} disabled={busy} onChange={(event) => setUrl(event.target.value)} placeholder={`${connection?.baseUrl ?? "https://your-school.instructure.com"}/courses/12345`} /></label>
          <p className="canvas-connection">{connection ? connection.configured ? `Using your local connection to ${new URL(connection.baseUrl).hostname}.` : "Canvas is not configured. Set CANVAS_ACCESS_TOKEN on your local server, then restart it." : "Checking your Canvas connection…"}</p>
          <button type="submit" className="button-primary" disabled={busy || !connection?.configured}>{busy ? "Finding course resources…" : "Preview course"}</button>
        </form>
      </>}
      {error && <p className="form-error" role="alert">{error}</p>}
      {preview && !job && <div className="canvas-preview">
        <div className="canvas-preview-heading"><div><p className="section-kicker">{preview.moduleCount} Canvas modules · {preview.resources.length} resources</p><h3>{preview.course.title}</h3></div><a href={preview.sourceUrl} target="_blank" rel="noreferrer">Open in Canvas ↗</a></div>
        <p className="canvas-access-summary">{preview.resources.filter((r) => r.availability === "available").length} available · {preview.resources.filter((r) => r.availability === "locked").length} locked · {preview.resources.filter((r) => r.availability === "unavailable").length} access unavailable · {preview.resources.filter((r) => r.availability === "unsupported").length} unsupported</p>
        {!!preview.warnings.length && <details open className="canvas-warnings"><summary>Some course sections could not be listed</summary><ul>{preview.warnings.map((warning) => <li key={warning}>{warning}</li>)}</ul></details>}
        <label>Add materials to<select value={destination} disabled={Boolean(existingCourseId || preview.linkedCourseId)} onChange={(event) => setDestination(event.target.value)}><option value="">Create a new class</option>{courses.map((course) => <option key={course.id} value={course.id}>{course.title}</option>)}</select></label>
        {!destination && <div className="canvas-course-fields"><label>Class name<input required maxLength={120} value={title} onChange={(event) => setTitle(event.target.value)} /></label><div className="field-row"><label>Course code<input maxLength={32} value={code} onChange={(event) => setCode(event.target.value)} /></label><label>Term<input maxLength={64} value={term} onChange={(event) => setTerm(event.target.value)} /></label></div></div>}
        <div className="canvas-selection"><div className="field-row"><label>Filter resources<input value={filter} onChange={(event) => setFilter(event.target.value)} placeholder="Find a lecture, page or file" /></label><label>Show resources<select value={visibility} onChange={(event) => setVisibility(event.target.value)}><option value="all">All resources</option><option value="available">Available to import</option><option value="restricted">Locked or unavailable</option><option value="unsupported">Unsupported formats</option><option value="solutions">Labeled solutions</option><option value="link-only">External and quiz links</option></select></label></div><div className="canvas-selection-actions"><button type="button" className="text-button" onClick={() => setSelected(new Set(preview.resources.filter((r) => r.availability === "available" && !r.containsSolutions && !r.imported).map((r) => r.id)))}>Select recommended</button><button type="button" className="text-button" onClick={() => setSelected(new Set(preview.resources.filter((r) => r.availability === "available").map((r) => r.id)))}>Select all available</button><button type="button" className="text-button" onClick={() => setSelected(new Set())}>Clear</button></div></div>
        <p className="canvas-copy">Items needing attention appear first. Locked or unavailable resources are skipped; access is checked again before each import. Materials labeled as solutions start unchecked. Categories are suggested from titles and resource types; unclear matches use Other.</p>
        <ul className="canvas-resources">{resources.map((resource) => <li key={resource.id}><label className="canvas-resource"><input type="checkbox" checked={selected.has(resource.id)} disabled={resource.availability !== "available"} onChange={(event) => setSelected((current) => { const next = new Set(current); if (event.target.checked) next.add(resource.id); else next.delete(resource.id); return next; })} /><span><strong>{resource.title}</strong><small>{materialKindLabels[resource.kind]} · {resource.type} {resource.sizeBytes !== null ? `· ${byteLabel(resource.sizeBytes)}` : ""}{resource.imported ? " · Imported" : ""}{resource.containsSolutions ? " · Contains solutions" : ""}{resource.availability !== "available" ? ` · ${resource.availability}` : ""}</small><small>{resource.detail}</small>{resource.modules.length > 0 && <small>{resource.modules.join(" · ")}</small>}</span><a href={resource.sourceUrl} aria-label={`Open ${resource.title} in source`} target="_blank" rel="noreferrer">↗</a></label></li>)}</ul>
        <div className="dialog-actions canvas-import-footer"><span>{selected.size} selected</span><button type="button" className="button-primary" disabled={busy || !selected.size || !title.trim()} onClick={() => void start()}>{busy ? "Starting…" : `Import ${selected.size} resources`}</button></div>
      </div>}
      {job && <section className="canvas-progress" aria-live="polite">
        <p className="section-kicker">{finished ? "Import results" : "Saving your class"}</p>
        <h3>{finished ? job.status === "completed" ? "Your class is ready." : "Import finished with items to review." : `${completed} of ${job.items.length} resources processed`}</h3>
        {issues.length > 0 && <div className="canvas-import-issues">
          <h4>Needs attention ({issues.length})</h4>
          <p>Other accessible resources continue importing. Review these items in Canvas or add a file manually.</p>
          <ul className="canvas-resources canvas-job-items">{issues.map((item) => <li key={item.resourceId}><strong>{item.title}</strong><small className="form-error">{item.detail}</small></li>)}</ul>
        </div>}
        <progress value={completed} max={job.items.length} />
        <p className="canvas-copy">{job.items.filter((item) => item.status === "imported").length} imported · {job.items.filter((item) => item.status === "unchanged").length} unchanged · {issues.length} need attention</p>
        {issues.length > 0 && <p className="section-kicker">Other resources</p>}
        <ul className="canvas-resources canvas-job-items">{job.items.filter((item) => item.status !== "failed").map((item) => <li key={item.resourceId}><strong>{item.title}</strong><small>{item.status} · {item.detail}</small></li>)}</ul>
        {finished && <div className="dialog-actions"><button type="button" className="button-primary" onClick={onClose}>Open class</button></div>}
      </section>}
    </section>
  </div>;
}
