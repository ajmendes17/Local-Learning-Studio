export interface LearningRunInfo {
  operationId: string;
  phase: "classification" | "course-map";
  startedAt: number;
  status: "running" | "complete" | "failed";
  model?: string;
  promptCharacters?: number;
  sourceStats?: { materialCount: number; passageCount: number; characterCount: number };
  omittedPassageCount?: number;
  durationMs?: number;
  usage?: { inputTokens: number; cachedInputTokens: number; outputTokens: number; reasoningOutputTokens: number } | null;
}

const HISTORY_LIMIT = 8;
const storageKey = (courseId: string) => `lls-learning-run-history:${courseId}`;

export function readLearningRunHistory(courseId: string): LearningRunInfo[] {
  try {
    const parsed: unknown = JSON.parse(window.localStorage.getItem(storageKey(courseId)) ?? "[]");
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item): item is LearningRunInfo => item && typeof item === "object"
      && typeof item.operationId === "string"
      && (item.phase === "classification" || item.phase === "course-map")
      && typeof item.startedAt === "number"
      && (item.status === "running" || item.status === "complete" || item.status === "failed"));
  } catch {
    return [];
  }
}

export function recordLearningRun(courseId: string, run: LearningRunInfo): LearningRunInfo[] {
  const history = readLearningRunHistory(courseId);
  const next = [run, ...history.filter(({ operationId }) => operationId !== run.operationId)]
    .sort((left, right) => right.startedAt - left.startedAt)
    .slice(0, HISTORY_LIMIT);
  try {
    window.localStorage.setItem(storageKey(courseId), JSON.stringify(next));
  } catch {
    // Storage may be disabled or full; live run tracking still works.
  }
  return next;
}

export function updateLearningRun(courseId: string, operationId: string, update: (run: LearningRunInfo) => LearningRunInfo): LearningRunInfo[] {
  const history = readLearningRunHistory(courseId);
  const current = history.find((run) => run.operationId === operationId);
  return current ? recordLearningRun(courseId, update(current)) : history;
}
