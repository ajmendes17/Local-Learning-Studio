export interface LearnerDraftStorage {
  length: number;
  key(index: number): string | null;
  removeItem(key: string): void;
}

export function clearLearnerDrafts(storages: LearnerDraftStorage[], courseId: string) {
  const prefixes = [`lls-study-draft:${courseId}:`, `lls-instructor-topic-draft:${courseId}`, `lls-source-comment-draft:${courseId}:`];
  for (const storage of storages) {
    const keys: string[] = [];
    for (let index = 0; index < storage.length; index += 1) {
      const key = storage.key(index);
      if (key && prefixes.some((prefix) => key.startsWith(prefix))) keys.push(key);
    }
    for (const key of keys) {
      try { storage.removeItem(key); } catch { /* Storage may become unavailable during cleanup. */ }
    }
  }
}
