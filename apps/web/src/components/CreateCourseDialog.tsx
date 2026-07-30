import { useState, type FormEvent } from "react";
import type {
  CourseAccent,
  CreateCourseRequest,
} from "@local-learning-studio/contracts";

interface CreateCourseDialogProps {
  onClose: () => void;
  onCreate: (input: CreateCourseRequest) => Promise<void>;
}

const accents: CourseAccent[] = [
  "moss",
  "clay",
  "ink",
  "ochre",
  "plum",
  "ocean",
];

export function CreateCourseDialog({
  onClose,
  onCreate,
}: CreateCourseDialogProps) {
  const [title, setTitle] = useState("");
  const [code, setCode] = useState("");
  const [term, setTerm] = useState("");
  const [accent, setAccent] = useState<CourseAccent>("moss");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError(null);

    try {
      await onCreate({ title, code, term, accent });
      onClose();
    } catch (requestError) {
      setError((requestError as Error).message);
      setSaving(false);
    }
  }

  return (
    <div className="dialog-backdrop" role="presentation" onMouseDown={onClose}>
      <section
        className="course-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="new-course-heading"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="dialog-heading">
          <div>
            <p className="eyebrow">New class</p>
            <h2 id="new-course-heading">Create a course space.</h2>
          </div>
          <button
            type="button"
            className="icon-button"
            onClick={onClose}
            aria-label="Close"
          >
            ×
          </button>
        </div>
        <form onSubmit={handleSubmit}>
          <label>
            Class name
            <input
              autoFocus
              required
              maxLength={120}
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder="Applied Statistics"
            />
          </label>
          <div className="field-row">
            <label>
              Course code
              <input
                maxLength={32}
                value={code}
                onChange={(event) => setCode(event.target.value)}
                placeholder="STAT 301"
              />
            </label>
            <label>
              Term
              <input
                maxLength={64}
                value={term}
                onChange={(event) => setTerm(event.target.value)}
                placeholder="Fall 2026"
              />
            </label>
          </div>
          <fieldset>
            <legend>Course color</legend>
            <div className="accent-options">
              {accents.map((option) => (
                <label key={option} title={option}>
                  <input
                    type="radio"
                    name="accent"
                    value={option}
                    checked={accent === option}
                    onChange={() => setAccent(option)}
                  />
                  <span className={`accent-dot accent-dot--${option}`} />
                </label>
              ))}
            </div>
          </fieldset>
          {error ? <p className="form-error">{error}</p> : null}
          <div className="dialog-actions">
            <button type="button" className="button-secondary" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="button-primary" disabled={saving}>
              {saving ? "Creating…" : "Create class"}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}

