import { z } from "zod";

export function parseInstructorTopicList(raw: string): string[] {
  const seen = new Set<string>();
  const topics: string[] = [];
  for (const part of raw.replace(/\r\n?/g, "\n").split(/[\n,;]+/)) {
    const title = part
      .replace(/^\s*(?:(?:[-*+•▪‣◦]\s+)|(?:\d+[.)]\s+)|(?:\[[ xX]\]\s*)|(?:[☐☑]\s*))+/u, "")
      .replace(/\s+/g, " ")
      .trim();
    if (!title) continue;
    const key = title.normalize("NFKC").toLocaleLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    topics.push(title);
  }
  return topics;
}

export function allocateStudyMinutes(topics: string[], availableMinutes: number) {
  const minutes = Number.isFinite(availableMinutes) ? Math.max(0, Math.floor(availableMinutes)) : 0;
  if (!topics.length || minutes === 0) return topics.map((topic) => ({ topic, minutes: 0 }));
  const weights = topics.map((topic) => topic.toLocaleLowerCase().includes("weak") ? 1.5 : 1);
  const totalWeight = weights.reduce((sum, weight) => sum + weight, 0);
  const exact = weights.map((weight) => minutes * weight / totalWeight);
  const allocations = exact.map(Math.floor);
  let remaining = minutes - allocations.reduce((sum, allocation) => sum + allocation, 0);
  const remainderOrder = exact.map((allocation, index) => ({ index, fraction: allocation - Math.floor(allocation) }))
    .sort((a, b) => b.fraction - a.fraction || a.index - b.index);
  for (const item of remainderOrder) {
    if (remaining <= 0) break;
    allocations[item.index]! += 1;
    remaining -= 1;
  }
  return topics.map((topic, index) => ({ topic, minutes: allocations[index]! }));
}

export interface StudyPlanTopic {
  title: string;
  importance?: "low" | "normal" | "high";
  attemptCount?: number;
  scoredAttemptCount?: number;
  correctCount?: number;
  sessionCount?: number;
  latestOutcome?: string | null;
  lastPracticedAt?: string | null;
}

export function allocateAssessmentStudyPlan<T extends StudyPlanTopic>(topics: T[], availableMinutes: number) {
  const minutes = Number.isFinite(availableMinutes) ? Math.max(0, Math.floor(availableMinutes)) : 0;
  if (!topics.length) return [] as Array<{ topic: T; minutes: number }>;
  const weights = topics.map((topic) => {
    let weight = topic.importance === "high" ? 1.5 : topic.importance === "low" ? 0.75 : 1;
    if (["incorrect", "incomplete", "unsupported", "not-graded"].includes(topic.latestOutcome ?? "")) weight *= 1.5;
    if ((topic.sessionCount ?? 0) > 0 && (topic.attemptCount ?? 0) === 0) weight *= 1.15;
    if ((topic.attemptCount ?? 0) === 0 && (topic.sessionCount ?? 0) === 0) weight *= 1.2;
    const scoredCount = topic.scoredAttemptCount ?? topic.attemptCount ?? 0;
    if (scoredCount >= 2) {
      const accuracy = (topic.correctCount ?? 0) / scoredCount;
      if (accuracy < 0.6) weight *= 1.35;
      else if (accuracy >= 0.85) weight *= 0.8;
    }
    const lastPracticed = topic.lastPracticedAt ? Date.parse(topic.lastPracticedAt) : Number.NaN;
    if (Number.isFinite(lastPracticed) && Date.now() - lastPracticed > 7 * 86_400_000) weight *= 1.1;
    return weight;
  });
  const totalWeight = weights.reduce((sum, weight) => sum + weight, 0);
  const exact = weights.map((weight) => minutes * weight / totalWeight);
  const allocations = exact.map(Math.floor);
  let remaining = minutes - allocations.reduce((sum, allocation) => sum + allocation, 0);
  const remainderOrder = exact.map((allocation, index) => ({ index, fraction: allocation - Math.floor(allocation) }))
    .sort((a, b) => b.fraction - a.fraction || a.index - b.index);
  for (const item of remainderOrder) {
    if (remaining <= 0) break;
    allocations[item.index]! += 1;
    remaining -= 1;
  }
  return topics.map((topic, index) => ({ topic, minutes: allocations[index]! }));
}

export function assessmentDeadlineLabel(scheduledAt: string | null | undefined, now = Date.now()) {
  if (!scheduledAt) return null;
  const scheduled = Date.parse(scheduledAt);
  if (!Number.isFinite(scheduled)) return null;
  const difference = scheduled - now;
  const localDay = (timestamp: number) => {
    const date = new Date(timestamp);
    return Date.UTC(date.getFullYear(), date.getMonth(), date.getDate());
  };
  const days = Math.round((localDay(scheduled) - localDay(now)) / 86_400_000);
  if (difference < 0 && days === 0) return "overdue today";
  if (days < 0) {
    const daysOverdue = Math.abs(days);
    return `overdue by ${daysOverdue} day${daysOverdue === 1 ? "" : "s"}`;
  }
  if (days === 0) return "due today";
  if (days === 1) return "due tomorrow";
  return `due in ${days} days`;
}

export interface AssessmentStudyScheduleTopic { title: string; minutes: number }
export interface AssessmentStudyDay { date: string; minutes: number; topics: AssessmentStudyScheduleTopic[] }

export function scheduleAssessmentStudyDays(
  topicPlan: AssessmentStudyScheduleTopic[],
  scheduledAt: string | null | undefined,
  dailyMinutes: number,
  now = Date.now(),
) {
  const totalMinutes = topicPlan.reduce((sum, topic) => sum + Math.max(0, Math.floor(topic.minutes)), 0);
  const cap = Number.isFinite(dailyMinutes) ? Math.max(1, Math.floor(dailyMinutes)) : 45;
  const empty = { days: [] as AssessmentStudyDay[], scheduledMinutes: 0, unscheduledMinutes: totalMinutes };
  if (!scheduledAt) return { ...empty, status: "missing-deadline" as const };
  const deadline = Date.parse(scheduledAt);
  if (!Number.isFinite(deadline)) return { ...empty, status: "missing-deadline" as const };
  const localDay = (timestamp: number) => {
    const date = new Date(timestamp);
    return Date.UTC(date.getFullYear(), date.getMonth(), date.getDate());
  };
  const today = localDay(now);
  const dueDay = localDay(deadline);
  if (deadline <= now || dueDay < today) return { ...empty, status: "deadline-passed" as const };
  if (!totalMinutes) return { ...empty, scheduledMinutes: 0, unscheduledMinutes: 0, status: "scheduled" as const };

  const availableDayCount = Math.max(1, (dueDay - today) / 86_400_000);
  const sessionCount = Math.min(availableDayCount, Math.ceil(totalMinutes / cap));
  const sessionIndexes = sessionCount === 1
    ? [0]
    : Array.from({ length: sessionCount }, (_, index) => Math.round(index * (availableDayCount - 1) / (sessionCount - 1)));
  const remaining = topicPlan.map((topic) => Math.max(0, Math.floor(topic.minutes)));
  const days: AssessmentStudyDay[] = [];

  for (const dayIndex of sessionIndexes) {
    let capacity = Math.min(cap, remaining.reduce((sum, value) => sum + value, 0));
    const daily = remaining.map(() => 0);
    while (capacity > 0) {
      const weightTotal = remaining.reduce((sum, value) => sum + value, 0);
      if (!weightTotal) break;
      const exact = remaining.map((value) => capacity * value / weightTotal);
      const floors = exact.map((value, index) => Math.min(remaining[index]!, Math.floor(value)));
      let assigned = floors.reduce((sum, value) => sum + value, 0);
      floors.forEach((value, index) => { daily[index]! += value; remaining[index]! -= value; });
      capacity -= assigned;
      const order = exact.map((value, index) => ({ index, fraction: value - Math.floor(value) }))
        .sort((left, right) => right.fraction - left.fraction || left.index - right.index);
      for (const item of order) {
        if (capacity <= 0) break;
        if (remaining[item.index]! <= 0) continue;
        daily[item.index]! += 1;
        remaining[item.index]! -= 1;
        capacity -= 1;
        assigned += 1;
      }
      if (!assigned) break;
    }
    const date = new Date(today + dayIndex * 86_400_000);
    const dateText = `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(date.getUTCDate()).padStart(2, "0")}`;
    const topics = topicPlan.flatMap((topic, index) => daily[index]! > 0 ? [{ title: topic.title, minutes: daily[index]! }] : []);
    days.push({ date: dateText, minutes: topics.reduce((sum, topic) => sum + topic.minutes, 0), topics });
  }
  const scheduledMinutes = days.reduce((sum, day) => sum + day.minutes, 0);
  return {
    days,
    scheduledMinutes,
    unscheduledMinutes: Math.max(0, totalMinutes - scheduledMinutes),
    status: scheduledMinutes === totalMinutes ? "scheduled" as const : "over-capacity" as const,
  };
}

export function summarizeTopicProgress(
  topicTitles: string[],
  signals: Array<{ title: string; attemptCount: number; correctCount: number }>,
) {
  const signalByTitle = new Map(signals.map((signal) => [signal.title.trim().normalize("NFKC").toLocaleLowerCase(), signal]));
  const uniqueTopicTitles = [...new Set(topicTitles.map((title) => title.trim().normalize("NFKC").toLocaleLowerCase()).filter(Boolean))];
  const topics = uniqueTopicTitles.map((title) => signalByTitle.get(title));
  return {
    topicCount: uniqueTopicTitles.length,
    practicedTopicCount: topics.filter((item) => (item?.attemptCount ?? 0) > 0).length,
    attemptCount: topics.reduce((sum, item) => sum + (item?.attemptCount ?? 0), 0),
    correctCount: topics.reduce((sum, item) => sum + (item?.correctCount ?? 0), 0),
  };
}

export function summarizeStudyCoverage(
  topicTitles: string[],
  signals: Array<{ title: string; attemptCount: number; scoredAttemptCount?: number; independentScoredAttemptCount?: number; independentCorrectCount?: number; correctCount: number; sessionCount: number; latestOutcome?: string | null }>,
) {
  const signalByTitle = new Map(signals.map((signal) => [signal.title.trim().normalize("NFKC").toLocaleLowerCase(), signal]));
  const uniqueTopicTitles = [...new Set(topicTitles.map((title) => title.trim().normalize("NFKC").toLocaleLowerCase()).filter(Boolean))];
  const topics = uniqueTopicTitles.map((title) => signalByTitle.get(title));
  return {
    topicCount: uniqueTopicTitles.length,
    lessonTopicCount: topics.filter((item) => (item?.sessionCount ?? 0) > 0).length,
    checkedTopicCount: topics.filter((item) => (item?.attemptCount ?? 0) > 0).length,
    independentlyCheckedTopicCount: topics.filter((item) => (item?.independentScoredAttemptCount ?? 0) > 0).length,
    uncheckedTopicCount: topics.filter((item) => (item?.attemptCount ?? 0) === 0).length,
    reviewTopicCount: topics.filter((item) => ["incorrect", "incomplete", "unsupported", "not-graded"].includes(item?.latestOutcome ?? "")).length,
    attemptCount: topics.reduce((sum, item) => sum + (item?.attemptCount ?? 0), 0),
    scoredAttemptCount: topics.reduce((sum, item) => sum + (item?.scoredAttemptCount ?? item?.attemptCount ?? 0), 0),
    correctCount: topics.reduce((sum, item) => sum + (item?.correctCount ?? 0), 0),
    independentScoredAttemptCount: topics.reduce((sum, item) => sum + (item?.independentScoredAttemptCount ?? 0), 0),
    independentCorrectCount: topics.reduce((sum, item) => sum + (item?.independentCorrectCount ?? 0), 0),
  };
}

export function recommendNextStudyTopic<T extends { title: string }>(
  topics: T[],
  signals: Array<{ title: string; attemptCount: number; sessionCount?: number; latestOutcome?: string | null; lastPracticedAt?: string | null; lastSessionAt?: string | null }>,
  independenceSignals: Array<{ title: string; scoredAttemptCount: number; independentScoredAttemptCount: number }> = [],
  confidenceSignals: Array<{ title: string; latestOutcome: string | null; latestConfidence: number | null }> = [],
): { topic: T; reason: "needs-review" | "lesson-only" | "not-practiced" | "needs-independent-check" | "low-confidence-correct" | "least-recently-practiced" } | null {
  if (!topics.length) return null;
  const signalByTitle = new Map(signals.map((signal) => [signal.title.trim().normalize("NFKC").toLocaleLowerCase(), signal]));
  const candidates = topics.map((topic, index) => ({
    topic,
    index,
    signal: signalByTitle.get(topic.title.trim().normalize("NFKC").toLocaleLowerCase()),
  }));
  const independenceByTitle = new Map(independenceSignals.map((signal) => [signal.title.trim().normalize("NFKC").toLocaleLowerCase(), signal]));
  const confidenceByTitle = new Map(confidenceSignals.map((signal) => [signal.title.trim().normalize("NFKC").toLocaleLowerCase(), signal]));
  const importanceRank = (topic: T) => {
    const importance = (topic as T & { importance?: string }).importance;
    return importance === "high" ? 2 : importance === "low" ? 0 : 1;
  };
  const timestamp = (value?: string | null) => {
    if (!value) return Number.NEGATIVE_INFINITY;
    const parsed = Date.parse(value);
    return Number.isFinite(parsed) ? parsed : Number.NEGATIVE_INFINITY;
  };
  const needsReview = candidates
    .filter(({ signal }) => signal?.latestOutcome && ["incorrect", "incomplete", "unsupported", "not-graded"].includes(signal.latestOutcome))
    .sort((a, b) => importanceRank(b.topic) - importanceRank(a.topic) || timestamp(b.signal?.lastPracticedAt) - timestamp(a.signal?.lastPracticedAt) || a.index - b.index)[0];
  if (needsReview) return { topic: needsReview.topic, reason: "needs-review" };

  const lessonOnly = candidates
    .filter(({ signal }) => (signal?.sessionCount ?? 0) > 0 && (signal?.attemptCount ?? 0) === 0)
    .sort((a, b) => importanceRank(b.topic) - importanceRank(a.topic) || timestamp(b.signal?.lastSessionAt) - timestamp(a.signal?.lastSessionAt) || a.index - b.index)[0];
  if (lessonOnly) return { topic: lessonOnly.topic, reason: "lesson-only" };

  const notPracticed = candidates
    .filter(({ signal }) => !signal || signal.attemptCount === 0)
    .sort((a, b) => importanceRank(b.topic) - importanceRank(a.topic) || a.index - b.index)[0];
  if (notPracticed) return { topic: notPracticed.topic, reason: "not-practiced" };

  const needsIndependentCheck = candidates
    .filter(({ topic }) => {
      const signal = independenceByTitle.get(topic.title.trim().normalize("NFKC").toLocaleLowerCase());
      return signal && signal.scoredAttemptCount > 0 && signal.independentScoredAttemptCount === 0;
    })
    .sort((a, b) => importanceRank(b.topic) - importanceRank(a.topic) || timestamp(a.signal?.lastPracticedAt) - timestamp(b.signal?.lastPracticedAt) || a.index - b.index)[0];
  if (needsIndependentCheck) return { topic: needsIndependentCheck.topic, reason: "needs-independent-check" };

  const lowConfidenceCorrect = candidates
    .filter(({ topic }) => {
      const signal = confidenceByTitle.get(topic.title.trim().normalize("NFKC").toLocaleLowerCase());
      return signal?.latestOutcome === "correct" && signal.latestConfidence != null && signal.latestConfidence <= 0.5;
    })
    .sort((a, b) => importanceRank(b.topic) - importanceRank(a.topic) || timestamp(a.signal?.lastPracticedAt) - timestamp(b.signal?.lastPracticedAt) || a.index - b.index)[0];
  if (lowConfidenceCorrect) return { topic: lowConfidenceCorrect.topic, reason: "low-confidence-correct" };

  const leastRecentlyPracticed = candidates
    .sort((a, b) => importanceRank(b.topic) - importanceRank(a.topic) || timestamp(a.signal?.lastPracticedAt) - timestamp(b.signal?.lastPracticedAt) || a.index - b.index)[0]!;
  return { topic: leastRecentlyPracticed.topic, reason: "least-recently-practiced" };
}

type StudyRecommendationReason = "needs-review" | "lesson-only" | "not-practiced" | "needs-independent-check" | "low-confidence-correct" | "least-recently-practiced";

export function prioritizeStudyRecommendations<T extends {
  title: string;
  reason: StudyRecommendationReason;
  importance?: "low" | "normal" | "high";
  lastPracticedAt?: string | null;
  contextPriority?: number;
}>(recommendations: T[]): T[] {
  const reasonRank: Record<StudyRecommendationReason, number> = {
    "needs-review": 0,
    "lesson-only": 1,
    "not-practiced": 2,
    "needs-independent-check": 3,
    "low-confidence-correct": 4,
    "least-recently-practiced": 5,
  };
  const importanceRank = (importance?: T["importance"]) => importance === "high" ? 2 : importance === "low" ? 0 : 1;
  const timestamp = (value?: string | null) => {
    if (!value) return Number.NEGATIVE_INFINITY;
    const parsed = Date.parse(value);
    return Number.isFinite(parsed) ? parsed : Number.NEGATIVE_INFINITY;
  };
  return [...recommendations].sort((left, right) =>
    reasonRank[left.reason] - reasonRank[right.reason]
    || importanceRank(right.importance) - importanceRank(left.importance)
    || (left.reason === "needs-review" ? timestamp(right.lastPracticedAt) - timestamp(left.lastPracticedAt)
      : left.reason === "least-recently-practiced" ? timestamp(left.lastPracticedAt) - timestamp(right.lastPracticedAt) : 0)
    || (left.contextPriority ?? Number.MAX_SAFE_INTEGER) - (right.contextPriority ?? Number.MAX_SAFE_INTEGER)
    || left.title.localeCompare(right.title),
  );
}

export const LearnerAssessmentTopicImportanceUpdateSchema = z.object({ importance: z.enum(["low", "normal", "high"]) });

export const LearnerAssessmentCreateSchema = z.object({
  title: z.string().trim().min(1).max(160),
  instructorText: z.string().max(12000).default(""),
  kind: z.enum(["exam", "quiz", "other"]).default("exam"),
  scheduledAt: z.string().datetime().nullable().optional(),
  availableMinutes: z.number().int().positive().max(1440).nullable().optional(),
  dailyMinutes: z.number().int().min(15).max(240).default(45),
  topics: z.array(z.object({
    title: z.string().trim().min(1).max(200),
    conceptId: z.string().uuid().nullable().optional(),
    importance: z.enum(["low", "normal", "high"]).default("normal"),
    provenance: z.enum(["learner", "model", "material"]).default("learner"),
  })).max(200).default([]),
});
export type LearnerAssessmentCreate = z.infer<typeof LearnerAssessmentCreateSchema>;

export const LearnerAssessmentUpdateSchema = z.object({
  title: z.string().trim().min(1).max(160).optional(),
  instructorText: z.string().max(12000).optional(),
  scheduledAt: z.string().datetime().nullable().optional(),
  availableMinutes: z.number().int().positive().max(1440).nullable().optional(),
  dailyMinutes: z.number().int().min(15).max(240).optional(),
}).refine((value) => Object.keys(value).length > 0, { message: "At least one assessment field is required." });
export type LearnerAssessmentUpdate = z.infer<typeof LearnerAssessmentUpdateSchema>;

export const LearnerAssessmentTopicsAppendSchema = z.object({
  topics: z.array(z.object({
    title: z.string().trim().min(1).max(200),
    conceptId: z.string().uuid().nullable().optional(),
    importance: z.enum(["low", "normal", "high"]).default("normal"),
    provenance: z.enum(["learner", "model", "material"]).default("learner"),
  })).min(1).max(200),
});
export type LearnerAssessmentTopicsAppend = z.infer<typeof LearnerAssessmentTopicsAppendSchema>;

export const LearnerConceptCreateSchema = z.object({
  stableKey: z.string().trim().min(1).max(120).regex(/^[a-z0-9][a-z0-9._-]*$/i),
  title: z.string().trim().min(1).max(200),
  description: z.string().trim().max(2000).default(""),
});

export const StudyAttemptCreateSchema = z.object({
  attemptId: z.string().uuid().optional(),
  sessionId: z.string().uuid().nullable().optional(),
  conceptId: z.string().uuid(),
  assessmentId: z.string().uuid().nullable().optional(),
  activityType: z.enum(["recall", "explanation", "application", "recognition", "retention"]),
  prompt: z.string().max(8000).default(""),
  response: z.string().max(20000).default(""),
  reasoning: z.string().max(20000).default(""),
  confidence: z.number().min(0).max(1).nullable().optional(),
  hintCount: z.number().int().nonnegative().max(100).default(0),
  method: z.string().max(120).default(""),
  outcome: z.enum(["correct", "incorrect", "incomplete", "unsupported", "not-graded"]),
  sourceRefs: z.array(z.object({ materialId: z.string().uuid(), passageId: z.string().uuid().optional() })).max(100).default([]),
  independence: z.enum(["independent", "hinted", "assisted", "unknown"]).default("unknown"),
  rationale: z.string().trim().min(1).max(2000),
});

export const StudySessionRequestSchema = z.object({
  topic: z.string().trim().min(1).max(200),
  method: z.enum(["explanation", "worked-example", "quiz", "analogy", "free-recall", "teach-back", "compare-contrast", "error-analysis"]).default("explanation"),
  sourceMaterialId: z.string().uuid().optional(),
  assessmentId: z.string().uuid().optional(),
  reviewSessionId: z.string().uuid().optional(),
});

export const StudySessionContentSchema = z.object({
  conceptId: z.string().uuid(),
  assessmentId: z.string().uuid().nullable().optional(),
  sourceMaterialId: z.string().uuid().nullable().optional(),
  topic: z.string(),
  method: z.enum(["explanation", "worked-example", "quiz", "analogy", "free-recall", "teach-back", "compare-contrast", "error-analysis"]),
  sourceBasis: z.enum(["general-knowledge", "course-materials"]),
  lesson: z.string().min(1),
  example: z.string().default(""),
  question: z.string().min(1),
  options: z.array(z.string().min(1)).max(6).default([]),
  answerIndex: z.number().int().nonnegative().nullable().optional(),
  feedback: z.string().min(1),
  clarification: z.string().min(1),
  hints: z.array(z.string().min(1).max(1200)).max(3).default([]),
}).refine((value) => value.method === "free-recall" || value.method === "teach-back"
  ? value.options.length === 0 && value.answerIndex == null
  : value.options.length >= 2 && value.answerIndex != null && value.answerIndex < value.options.length
    && (value.method !== "error-analysis" || value.example.trim().length > 0), {
  message: "Open-response methods have no choices or answer key; other methods need indexed choices, and error analysis needs its worked solution.",
  path: ["options"],
});
export const StudyQuestionSchema = z.object({
  question: z.string().min(1).max(8000),
  options: z.array(z.string().min(1).max(2000)).min(2).max(6),
  answerIndex: z.number().int().nonnegative(),
  feedback: z.string().min(1).max(4000),
  hints: z.array(z.string().min(1).max(1200)).min(1).max(3),
}).refine((value) => value.answerIndex < value.options.length, {
  message: "Answer index must name one of the options.",
  path: ["answerIndex"],
});
export const StudyFreeRecallQuestionSchema = z.object({
  question: z.string().min(1).max(8000),
  feedback: z.string().min(1).max(4000),
  hints: z.array(z.string().min(1).max(1200)).min(1).max(3),
});
// Keep the model response limited to generated learning content. Session IDs,
// topic/method metadata, and nullable scope IDs are added by the server after
// generation; asking the model to fill those optional storage fields creates
// response schemas that strict structured-output APIs reject.
export const StudySessionGenerationContentSchema = z.object({
  lesson: z.string().min(1),
  example: z.string(),
  question: z.string().min(1),
  options: z.array(z.string().min(1)).max(6),
  answerIndex: z.number().int().nonnegative().nullable(),
  feedback: z.string().min(1),
  clarification: z.string().min(1),
  hints: z.array(z.string().min(1).max(1200)).min(1).max(3),
}).strict();
export const StudySessionRecordSchema = StudySessionContentSchema.safeExtend({
  sessionId: z.string().uuid(),
  createdAt: z.string().datetime(),
  attempts: z.array(z.object({
    outcome: z.enum(["correct", "incorrect", "incomplete", "unsupported", "not-graded"]),
    response: z.string(), confidence: z.number().min(0).max(1).nullable(), hintCount: z.number().int().nonnegative(),
    independence: z.enum(["independent", "hinted", "assisted", "unknown"]),
    createdAt: z.string().datetime(),
  })).default([]),
});
export const StudySessionSummarySchema = z.object({
  sessionId: z.string().uuid(), conceptId: z.string().uuid(), topic: z.string(),
  method: z.enum(["explanation", "worked-example", "quiz", "analogy", "free-recall", "teach-back", "compare-contrast", "error-analysis"]),
  createdAt: z.string().datetime(), attemptCount: z.number().int().nonnegative(),
  correctCount: z.number().int().nonnegative(), latestOutcome: z.enum(["correct", "incorrect", "incomplete", "unsupported", "not-graded"]).nullable(),
});

export const StudyClarificationRequestSchema = z.object({
  conceptId: z.string().uuid(),
  topic: z.string().trim().min(1).max(200),
  question: z.string().trim().min(1).max(4000),
  context: z.string().max(4000).default(""),
});
export const StudyClarificationResponseSchema = z.object({
  answer: z.string().min(1),
  followUp: z.string().default(""),
  sourceBasis: z.enum(["general-knowledge", "course-materials"]),
});

export const LearnerProfileResponseSchema = z.object({
  sources: z.array(z.object({
    materialId: z.string().uuid(), title: z.string(), kind: z.string(), mediaType: z.string(),
    attemptCount: z.number().int().nonnegative(), scoredAttemptCount: z.number().int().nonnegative(), correctCount: z.number().int().nonnegative(),
    sessionCount: z.number().int().nonnegative(), lastSessionAt: z.string().nullable(),
    topicCount: z.number().int().nonnegative(), practicedTopicCount: z.number().int().nonnegative(),
    lastPracticedAt: z.string().nullable(),
    topics: z.array(z.object({ conceptId: z.string().uuid(), title: z.string(), attemptCount: z.number().int().nonnegative(), scoredAttemptCount: z.number().int().nonnegative(), correctCount: z.number().int().nonnegative(), independentScoredAttemptCount: z.number().int().nonnegative(), independentCorrectCount: z.number().int().nonnegative(), latestOutcome: z.enum(["correct", "incorrect", "incomplete", "unsupported", "not-graded"]).nullable(), lastPracticedAt: z.string().nullable(), sessionCount: z.number().int().nonnegative(), lastSessionAt: z.string().nullable() })),
  })),
  assessments: z.array(z.object({
    id: z.string().uuid(), title: z.string(), instructorText: z.string(), kind: z.enum(["exam", "quiz", "other"]),
    scheduledAt: z.string().nullable(), availableMinutes: z.number().int().nullable(), dailyMinutes: z.number().int(), createdAt: z.string(),
    attemptCount: z.number().int().nonnegative(), scoredAttemptCount: z.number().int().nonnegative(), correctCount: z.number().int().nonnegative(), sessionCount: z.number().int().nonnegative(), lastSessionAt: z.string().nullable(),
    topics: z.array(z.object({ id: z.string().uuid(), conceptId: z.string().uuid().nullable(), title: z.string(), position: z.number().int(), importance: z.enum(["low", "normal", "high"]), provenance: z.enum(["learner", "model", "material"]), attemptCount: z.number().int().nonnegative(), scoredAttemptCount: z.number().int().nonnegative(), correctCount: z.number().int().nonnegative(), independentScoredAttemptCount: z.number().int().nonnegative(), independentCorrectCount: z.number().int().nonnegative(), latestOutcome: z.enum(["correct", "incorrect", "incomplete", "unsupported", "not-graded"]).nullable(), lastPracticedAt: z.string().nullable(), sessionCount: z.number().int().nonnegative(), lastSessionAt: z.string().nullable() })),
  })),
  concepts: z.array(z.object({
    id: z.string().uuid(), stableKey: z.string(), title: z.string(), description: z.string(),
    attemptCount: z.number().int().nonnegative(), scoredAttemptCount: z.number().int().nonnegative(), correctCount: z.number().int().nonnegative(), independentScoredAttemptCount: z.number().int().nonnegative(), independentCorrectCount: z.number().int().nonnegative(),
    latestOutcome: z.enum(["correct", "incorrect", "incomplete", "unsupported", "not-graded"]).nullable(),
    lastPracticedAt: z.string().nullable(), sessionCount: z.number().int().nonnegative(), lastSessionAt: z.string().nullable(),
  })),
});
export type LearnerProfileResponse = z.infer<typeof LearnerProfileResponseSchema>;

export const LearnerMethodProgressResponseSchema = z.array(z.object({
  method: z.string(),
  attemptCount: z.number().int().nonnegative(),
  scoredAttemptCount: z.number().int().nonnegative(),
  independentScoredAttemptCount: z.number().int().nonnegative(),
  independentCorrectCount: z.number().int().nonnegative(),
  hintedScoredAttemptCount: z.number().int().nonnegative(),
  hintedCorrectCount: z.number().int().nonnegative(),
  assistedScoredAttemptCount: z.number().int().nonnegative(),
  assistedCorrectCount: z.number().int().nonnegative(),
  unknownIndependenceScoredAttemptCount: z.number().int().nonnegative(),
  unknownIndependenceCorrectCount: z.number().int().nonnegative(),
  confidenceRatedAttemptCount: z.number().int().nonnegative(),
  meanConfidenceGap: z.number().min(0).max(1).nullable(),
  correctCount: z.number().int().nonnegative(),
  topicCount: z.number().int().nonnegative(),
  topicTitles: z.array(z.string()),
  topicProgress: z.array(z.object({
    conceptId: z.string().nullable(),
    title: z.string(),
    attemptCount: z.number().int().nonnegative(),
    scoredAttemptCount: z.number().int().nonnegative(),
    independentScoredAttemptCount: z.number().int().nonnegative(),
    independentCorrectCount: z.number().int().nonnegative(),
    hintedScoredAttemptCount: z.number().int().nonnegative(),
    hintedCorrectCount: z.number().int().nonnegative(),
    assistedScoredAttemptCount: z.number().int().nonnegative(),
    assistedCorrectCount: z.number().int().nonnegative(),
    unknownIndependenceScoredAttemptCount: z.number().int().nonnegative(),
    unknownIndependenceCorrectCount: z.number().int().nonnegative(),
    correctCount: z.number().int().nonnegative(),
    lowConfidenceCorrectCount: z.number().int().nonnegative(),
    confidenceRatedAttemptCount: z.number().int().nonnegative(),
    latestOutcome: z.enum(["correct", "incorrect", "incomplete", "unsupported", "not-graded"]).nullable(),
    latestConfidence: z.number().min(0).max(1).nullable(),
    meanConfidenceGap: z.number().min(0).max(1).nullable(),
    lastPracticedAt: z.string().nullable(),
  })),
  highConfidenceMissCount: z.number().int().nonnegative(),
  lowConfidenceCorrectCount: z.number().int().nonnegative(),
  lastPracticedAt: z.string().nullable(),
}));
export type LearnerMethodProgressResponse = z.infer<typeof LearnerMethodProgressResponseSchema>;
