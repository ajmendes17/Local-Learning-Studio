export interface InstructorTopicDraft {
  assessmentId: string | null;
  title: string;
  scheduledAt: string;
  availableMinutes: string;
  dailyMinutes: string;
  topics: string;
  notes: string;
  importance: Record<string, "low" | "normal" | "high">;
}

type DraftStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;

function storageKey(courseId: string) {
  return `lls-instructor-topic-draft:${courseId}`;
}

function textValue(value: unknown, limit = 20_000) {
  return typeof value === "string" ? value.slice(0, limit) : "";
}

function cleanImportance(value: unknown) {
  if (value == null || typeof value !== "object" || Array.isArray(value)) return {};
  return Object.fromEntries(Object.entries(value)
    .filter((entry): entry is [string, "low" | "normal" | "high"] =>
      typeof entry[0] === "string" && ["low", "normal", "high"].includes(String(entry[1])),
    )
    .map(([key, importance]) => [key.slice(0, 240), importance]));
}

export function readInstructorTopicDraft(storage: DraftStorage, courseId: string): InstructorTopicDraft | null {
  try {
    const raw = storage.getItem(storageKey(courseId));
    if (!raw) return null;
    const value = JSON.parse(raw) as Partial<InstructorTopicDraft>;
    return {
      assessmentId: typeof value.assessmentId === "string" ? value.assessmentId : null,
      title: textValue(value.title, 200),
      scheduledAt: textValue(value.scheduledAt, 40),
      availableMinutes: textValue(value.availableMinutes, 8),
      dailyMinutes: textValue(value.dailyMinutes, 8) || "45",
      topics: textValue(value.topics),
      notes: textValue(value.notes, 12_000),
      importance: cleanImportance(value.importance),
    };
  } catch {
    return null;
  }
}

export function writeInstructorTopicDraft(storage: DraftStorage, courseId: string, draft: InstructorTopicDraft) {
  try {
    const hasWork = Boolean(draft.assessmentId || draft.title.trim() || draft.scheduledAt || draft.availableMinutes || draft.topics.trim() || draft.notes.trim());
    if (!hasWork) {
      storage.removeItem(storageKey(courseId));
      return;
    }
    storage.setItem(storageKey(courseId), JSON.stringify(draft));
  } catch {
    // The topic list remains editable in memory when browser storage is unavailable.
  }
}

export function clearInstructorTopicDraft(storage: DraftStorage, courseId: string) {
  try { storage.removeItem(storageKey(courseId)); } catch { /* Storage may be unavailable. */ }
}
