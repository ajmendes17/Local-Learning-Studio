import { useRef, useState, type FormEvent } from "react";
import type { MaterialKind } from "@local-learning-studio/contracts";

interface MaterialUploadProps {
  onUpload: (file: File, kind: MaterialKind) => Promise<void>;
}

const materialKinds: Array<{ value: MaterialKind; label: string }> = [
  { value: "syllabus", label: "Syllabus" },
  { value: "lecture-notes", label: "Lecture notes" },
  { value: "reading", label: "Reading" },
  { value: "assignment", label: "Assignment" },
  { value: "study-guide", label: "Study guide" },
  { value: "other", label: "Other" },
];

export function MaterialUpload({ onUpload }: MaterialUploadProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [kind, setKind] = useState<MaterialKind>("syllabus");
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!file) {
      setError("Choose a course file first.");
      return;
    }

    setUploading(true);
    setError(null);
    try {
      await onUpload(file, kind);
      setFile(null);
      if (inputRef.current) inputRef.current.value = "";
    } catch (requestError) {
      setError((requestError as Error).message);
    } finally {
      setUploading(false);
    }
  }

  return (
    <form className="upload-panel" onSubmit={handleSubmit}>
      <div className="upload-panel__copy">
        <span className="upload-icon" aria-hidden="true">
          ↑
        </span>
        <div>
          <strong>{file ? file.name : "Add course material"}</strong>
          <p>
            {file
              ? "Ready to save inside this class."
              : "PDF, Markdown, text, DOCX, or PPTX · up to 50 MB"}
          </p>
        </div>
      </div>
      <div className="upload-controls">
        <select
          aria-label="Material type"
          value={kind}
          onChange={(event) => setKind(event.target.value as MaterialKind)}
        >
          {materialKinds.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        <label className="button-secondary file-button">
          Choose file
          <input
            ref={inputRef}
            type="file"
            accept=".pdf,.md,.txt,.docx,.pptx"
            onChange={(event) => setFile(event.target.files?.[0] ?? null)}
          />
        </label>
        <button
          className="button-primary"
          type="submit"
          disabled={!file || uploading}
        >
          {uploading ? "Uploading…" : "Upload"}
        </button>
      </div>
      {error ? <p className="form-error upload-error">{error}</p> : null}
    </form>
  );
}

