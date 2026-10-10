import type { DraftStorage } from "./study-attempt-draft";

export const SOURCE_COMMENT_DRAFT_TTL_MS = 7 * 24 * 60 * 60 * 1000;
export const SOURCE_COMMENT_MAX_LENGTH = 8000;

export function sourceCommentDraftKey(courseId: string, materialId: string, passageId: string) {
  return `lls-source-comment-draft:${courseId}:${materialId}:${passageId}`;
}

export function readSourceCommentDraft(
  storages: DraftStorage[],
  courseId: string,
  materialId: string,
  passageId: string,
  now = Date.now(),
): string | null {
  const key = sourceCommentDraftKey(courseId, materialId, passageId);
  for (const storage of storages) {
    let stored: string | null;
    try { stored = storage.getItem(key); } catch { continue; }
    if (!stored) continue;
    let decoded: unknown;
    try { decoded = JSON.parse(stored) as unknown; }
    catch { try { storage.removeItem(key); } catch { /* Storage may be unavailable. */ } continue; }
    if (!decoded || typeof decoded !== "object" || Array.isArray(decoded)) {
      try { storage.removeItem(key); } catch { /* Storage may be unavailable. */ }
      continue;
    }
    const parsed = decoded as Record<string, unknown>;
    if (typeof parsed.body !== "string" || typeof parsed.savedAt !== "number" || !Number.isFinite(parsed.savedAt)
      || parsed.savedAt > now + 5 * 60 * 1000 || now - parsed.savedAt > SOURCE_COMMENT_DRAFT_TTL_MS) {
      for (const candidate of storages) {
        try { candidate.removeItem(key); } catch { /* Storage may be unavailable. */ }
      }
      return null;
    }
    return parsed.body.slice(0, SOURCE_COMMENT_MAX_LENGTH);
  }
  return null;
}

export function writeSourceCommentDraft(
  storages: DraftStorage[],
  courseId: string,
  materialId: string,
  passageId: string,
  body: string,
  now = Date.now(),
) {
  const key = sourceCommentDraftKey(courseId, materialId, passageId);
  if (!body.trim()) {
    clearSourceCommentDraft(storages, courseId, materialId, passageId);
    return;
  }
  const value = JSON.stringify({ body: body.slice(0, SOURCE_COMMENT_MAX_LENGTH), savedAt: now });
  for (const storage of storages) {
    try { storage.setItem(key, value); } catch { /* The comment editor remains usable in memory. */ }
  }
}

export function clearSourceCommentDraft(storages: DraftStorage[], courseId: string, materialId: string, passageId: string) {
  const key = sourceCommentDraftKey(courseId, materialId, passageId);
  for (const storage of storages) {
    try { storage.removeItem(key); } catch { /* Storage may be unavailable. */ }
  }
}
