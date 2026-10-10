export const STUDY_ATTEMPT_DRAFT_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export interface StudyAttemptDraft {
  selected: number | null;
  response: string;
  confidence: number;
  hintCount: number;
  usedOutsideHelp: boolean;
  studyTab: "lesson" | "check";
}

interface StudyContentDraftShape {
  sessionId: string;
  options: string[];
  hints: string[];
  method: string;
}

export interface DraftStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export function studyAttemptDraftKey(courseId: string, sessionId: string) {
  return `lls-study-draft:${courseId}:${sessionId}`;
}

export function readStudyAttemptDraft(
  storages: DraftStorage[],
  courseId: string,
  content: StudyContentDraftShape,
  now = Date.now(),
): StudyAttemptDraft | null {
  const key = studyAttemptDraftKey(courseId, content.sessionId);
  for (const storage of storages) {
    let stored: string | null;
    try { stored = storage.getItem(key); } catch { continue; }
    if (!stored) continue;
    let decoded: unknown;
    try { decoded = JSON.parse(stored) as unknown; }
    catch {
      try { storage.removeItem(key); } catch { /* Keep trying other available storage. */ }
      continue;
    }
    if (!decoded || typeof decoded !== "object" || Array.isArray(decoded)) {
      try { storage.removeItem(key); } catch { /* Keep trying other available storage. */ }
      continue;
    }
    const parsed = decoded as Record<string, unknown>;
    const savedAt = parsed.savedAt;
    if (savedAt !== undefined && (typeof savedAt !== "number" || !Number.isFinite(savedAt)
      || savedAt > now + 5 * 60 * 1000 || now - savedAt > STUDY_ATTEMPT_DRAFT_TTL_MS)) {
      for (const candidate of storages) {
        try { candidate.removeItem(key); } catch { /* Storage may be unavailable. */ }
      }
      return null;
    }
    const selected = Number.isInteger(parsed.selected) && (parsed.selected as number) >= 0 && (parsed.selected as number) < content.options.length
      ? parsed.selected as number : null;
    const confidence = [0.25, 0.5, 0.75, 1].includes(parsed.confidence as number) ? parsed.confidence as number : 0.5;
    const hintCount = Number.isInteger(parsed.hintCount) ? Math.max(0, Math.min(content.hints.length, parsed.hintCount as number)) : 0;
    const studyTab = parsed.studyTab === "check" || parsed.studyTab === "lesson"
      ? parsed.studyTab
      : content.method === "quiz" || content.method === "free-recall" || content.method === "teach-back" ? "check" : "lesson";
    return {
      selected,
      response: typeof parsed.response === "string" ? parsed.response.slice(0, 20000) : "",
      confidence,
      hintCount,
      usedOutsideHelp: parsed.usedOutsideHelp === true,
      studyTab,
    };
  }
  return null;
}

export function writeStudyAttemptDraft(storages: DraftStorage[], courseId: string, sessionId: string, draft: StudyAttemptDraft, now = Date.now()) {
  const key = studyAttemptDraftKey(courseId, sessionId);
  const value = JSON.stringify({ ...draft, savedAt: now });
  for (const storage of storages) {
    try { storage.setItem(key, value); } catch { /* The study check remains usable in memory. */ }
  }
}

export function clearStudyAttemptDraft(storages: DraftStorage[], courseId: string, sessionId: string) {
  const key = studyAttemptDraftKey(courseId, sessionId);
  for (const storage of storages) {
    try { storage.removeItem(key); } catch { /* Storage may be unavailable. */ }
  }
}
