import type {
  CourseDetail,
  CourseMaterial,
  MaterialKind,
} from "@local-learning-studio/contracts";
import { MaterialUpload } from "../components/MaterialUpload";

interface CoursePageProps {
  course: CourseDetail | null;
  loading: boolean;
  error: string | null;
  onBack: () => void;
  onUpload: (file: File, kind: MaterialKind) => Promise<void>;
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

function MaterialRow({ material }: { material: CourseMaterial }) {
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
    </li>
  );
}

export function CoursePage({
  course,
  loading,
  error,
  onBack,
  onUpload,
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
                <MaterialRow key={material.id} material={material} />
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
            <span>Next capability</span>
            <strong>Build structure from a syllabus</strong>
            <p>
              A reviewed syllabus analysis will propose modules, exams, due
              dates, and weights without changing your course automatically.
            </p>
          </div>
        </aside>
      </section>
    </main>
  );
}
