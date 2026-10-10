import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { allocateAssessmentStudyPlan, assessmentDeadlineLabel, parseInstructorTopicList, prioritizeStudyRecommendations, recommendNextStudyTopic, scheduleAssessmentStudyDays, summarizeStudyCoverage } from "@local-learning-studio/contracts";
import { MathText } from "../components/MathText";
import "../styles/study.css";

type Method = "explanation" | "worked-example" | "quiz" | "analogy";
const studyMethods: Array<{ value: Method; label: string; description: string }> = [
  { value: "explanation", label: "Clear explanation", description: "Build intuition first, then connect the idea to precise terms and a short example." },
  { value: "worked-example", label: "Worked example", description: "Follow a complete solution step by step, then identify the pattern you can reuse." },
  { value: "quiz", label: "Quiz first", description: "Try retrieval before seeing the lesson; the explanation becomes a debrief afterward." },
  { value: "analogy", label: "Use an analogy", description: "Connect the idea to something familiar, including where that comparison stops working." },
];

function studyMethodLabel(method: string) {
  switch (method) {
    case "explanation": return "Clear explanation";
    case "worked-example": return "Worked example";
    case "quiz":
    case "retrieval-practice": return "Quiz first";
    case "analogy": return "Use an analogy";
    default: return method.trim() ? method.replaceAll("-", " ") : "Method not recorded";
  }
}

interface StudyAttemptSummary { outcome: string; response: string; confidence: number | null; hintCount: number; createdAt: string }
interface StudyContent {
  sessionId: string; createdAt: string;
  conceptId: string; assessmentId?: string | null; sourceMaterialId?: string | null; topic: string; method: Method; sourceBasis: "general-knowledge" | "course-materials";
  lesson: string; example: string; question: string; options: string[]; answerIndex: number; feedback: string; clarification: string; hints: string[];
  attempts?: StudyAttemptSummary[];
}
interface SourceTopicProgress { conceptId: string; title: string; attemptCount: number; scoredAttemptCount: number; correctCount: number; latestOutcome: string | null; lastPracticedAt: string | null; sessionCount: number; lastSessionAt: string | null }
interface SourceProgress { materialId: string; title: string; kind: string; attemptCount: number; scoredAttemptCount: number; correctCount: number; topicCount: number; practicedTopicCount: number; lastPracticedAt: string | null; sessionCount: number; lastSessionAt: string | null; topics: SourceTopicProgress[] }
interface SessionSummary { sessionId: string; conceptId: string; topic: string; method: Method; createdAt: string; attemptCount: number; correctCount: number; latestOutcome: string | null }
interface ConceptProgress { id: string; title: string; attemptCount: number; scoredAttemptCount: number; correctCount: number; latestOutcome: string | null; lastPracticedAt: string | null; sessionCount: number; lastSessionAt: string | null }
interface MethodTopicProgress { conceptId: string | null; title: string; attemptCount: number; scoredAttemptCount: number; independentScoredAttemptCount: number; independentCorrectCount: number; hintedScoredAttemptCount: number; assistedScoredAttemptCount: number; unknownIndependenceScoredAttemptCount: number; correctCount: number; confidenceRatedAttemptCount: number; meanConfidenceGap: number | null; lastPracticedAt: string | null }
interface MethodProgress { method: string; attemptCount: number; scoredAttemptCount: number; independentScoredAttemptCount: number; independentCorrectCount: number; hintedScoredAttemptCount: number; assistedScoredAttemptCount: number; unknownIndependenceScoredAttemptCount: number; confidenceRatedAttemptCount: number; meanConfidenceGap: number | null; correctCount: number; topicCount: number; topicTitles: string[]; topicProgress: MethodTopicProgress[]; highConfidenceMissCount: number; lowConfidenceCorrectCount: number; lastPracticedAt: string | null }
interface AssessmentScope { id: string; title: string; instructorText: string; kind: "exam" | "quiz" | "other"; scheduledAt: string | null; availableMinutes: number | null; dailyMinutes: number; attemptCount: number; scoredAttemptCount: number; correctCount: number; sessionCount: number; lastSessionAt: string | null; topics: Array<{ id: string; conceptId: string | null; title: string; importance: "low" | "normal" | "high"; attemptCount: number; scoredAttemptCount: number; correctCount: number; latestOutcome: string | null; lastPracticedAt: string | null; sessionCount: number; lastSessionAt: string | null }> }
interface StudyRecommendation {
  title: string;
  reason: "needs-review" | "lesson-only" | "not-practiced" | "least-recently-practiced";
  latestOutcome: string | null;
  lastPracticedAt: string | null;
  assessmentId?: string;
  assessmentTitle?: string;
  sourceMaterialId?: string;
  sourceTitle?: string;
  importance?: "low" | "normal" | "high";
}
interface ChatAnswer { answer: string; followUp: string; sourceBasis: "general-knowledge" | "course-materials" }
interface PatternEvidence { id: string; conceptTitle: string; response: string; outcome: string; confidence: number | null; hintCount: number; method: string; createdAt: string }
interface Pattern { id: string; patternKey: string; kind: string; conceptIds: string[]; claim: string; status: string; confidence: number; supportingAttemptIds: string[]; counterexampleAttemptIds: string[]; supportingEvidence: PatternEvidence[]; counterexampleEvidence: PatternEvidence[]; statusRationale: string }
interface PendingAttempt { id: string; payload: Record<string, unknown> }
interface StudyAttemptDraft { selected: number | null; confidence: number; hintCount: number; studyTab: "lesson" | "check" }

function attemptDraftKey(courseId: string, sessionId: string) {
  return `lls-study-draft:${courseId}:${sessionId}`;
}

function readAttemptDraft(courseId: string, content: StudyContent): StudyAttemptDraft | null {
  try {
    const stored = window.sessionStorage.getItem(attemptDraftKey(courseId, content.sessionId));
    if (!stored) return null;
    const parsed = JSON.parse(stored) as Partial<StudyAttemptDraft>;
    const selected = Number.isInteger(parsed.selected) && (parsed.selected as number) >= 0 && (parsed.selected as number) < content.options.length
      ? parsed.selected as number : null;
    const confidence = [0.25, 0.5, 0.75, 1].includes(parsed.confidence ?? Number.NaN) ? parsed.confidence! : 0.5;
    const hintCount = Number.isInteger(parsed.hintCount) ? Math.max(0, Math.min(content.hints.length, parsed.hintCount!)) : 0;
    const studyTab = parsed.studyTab === "check" || parsed.studyTab === "lesson" ? parsed.studyTab : content.method === "quiz" ? "check" : "lesson";
    return { selected, confidence, hintCount, studyTab };
  } catch {
    return null;
  }
}

function writeAttemptDraft(courseId: string, sessionId: string, draft: StudyAttemptDraft) {
  try { window.sessionStorage.setItem(attemptDraftKey(courseId, sessionId), JSON.stringify(draft)); } catch { /* Storage may be unavailable; the check remains usable in memory. */ }
}

function clearAttemptDraft(courseId: string, sessionId: string) {
  try { window.sessionStorage.removeItem(attemptDraftKey(courseId, sessionId)); } catch { /* Storage may be unavailable. */ }
}

class StudyRequestError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}

async function postJson<T>(path: string, body: unknown, method: "POST" | "PATCH" = "POST"): Promise<T> {
  const response = await fetch(path, { method, headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  const result = await response.json().catch(() => null) as { error?: string } | null;
  if (!response.ok) throw new StudyRequestError(result?.error ?? `The local service returned ${response.status}.`, response.status);
  if (result == null) throw new Error("The local service returned an empty response. Check that it is running, then try again.");
  return result as T;
}

export function StudyPage({ courseId, courseTitle, initialTopic, initialSourceMaterialId, initialAssessmentId, initialSessionId, onBack }: { courseId: string; courseTitle: string; initialTopic?: string; initialSourceMaterialId?: string; initialAssessmentId?: string; initialSessionId?: string; onBack: () => void }) {
  const [topic, setTopic] = useState(initialTopic ?? "");
  const [studySourceMaterialId, setStudySourceMaterialId] = useState(initialSourceMaterialId);
  const [studyAssessmentId, setStudyAssessmentId] = useState(initialAssessmentId);
  const [method, setMethod] = useState<Method>("explanation");
  const [content, setContent] = useState<StudyContent | null>(null);
  const [selected, setSelected] = useState<number | null>(null);
  const [reopenedAttempt, setReopenedAttempt] = useState<StudyAttemptSummary | null>(null);
  const [confidence, setConfidence] = useState(0.5);
  const [hintCount, setHintCount] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [saved, setSaved] = useState(false);
  const [savingAttempt, setSavingAttempt] = useState(false);
  const [attemptSaveError, setAttemptSaveError] = useState("");
  const pendingAttempt = useRef<PendingAttempt | null>(null);
  const [chatQuestion, setChatQuestion] = useState("");
  const [chatAnswer, setChatAnswer] = useState<ChatAnswer | null>(null);
  const [chatBusy, setChatBusy] = useState(false);
  const [budgetOpen, setBudgetOpen] = useState(false);
  const [topicScopeOpen, setTopicScopeOpen] = useState(false);
  const [topicScopeTargetAssessmentId, setTopicScopeTargetAssessmentId] = useState<string | null>(null);
  const [topicScopeTitle, setTopicScopeTitle] = useState("");
  const [topicScopeScheduledAt, setTopicScopeScheduledAt] = useState("");
  const [topicScopeAvailableMinutes, setTopicScopeAvailableMinutes] = useState("");
  const [topicScopeDailyMinutes, setTopicScopeDailyMinutes] = useState("45");
  const [topicScopeText, setTopicScopeText] = useState("");
  const [topicScopeNotes, setTopicScopeNotes] = useState("");
  const [topicScopeImportance, setTopicScopeImportance] = useState<Record<string, "low" | "normal" | "high">>({});
  const [topicScopeMessage, setTopicScopeMessage] = useState("");
  const [topicScopeSaving, setTopicScopeSaving] = useState(false);
  const [editingInstructorScopeId, setEditingInstructorScopeId] = useState<string | null>(null);
  const [instructorTextDraft, setInstructorTextDraft] = useState("");
  const [instructorTextSaving, setInstructorTextSaving] = useState(false);
  const [savingPriorityTopicId, setSavingPriorityTopicId] = useState<string | null>(null);
  const [budgetTitle, setBudgetTitle] = useState("");
  const [budgetMinutes, setBudgetMinutes] = useState(60);
  const [budgetDailyMinutes, setBudgetDailyMinutes] = useState(45);
  const [examAt, setExamAt] = useState("");
  const [budgetTopics, setBudgetTopics] = useState("");
  const [budget, setBudget] = useState<Array<{ topic: string; minutes: number }> | null>(null);
  const [budgetSaving, setBudgetSaving] = useState(false);
  const [history, setHistory] = useState<SessionSummary[]>([]);
  const [progress, setProgress] = useState<ConceptProgress[]>([]);
  const [methodProgress, setMethodProgress] = useState<MethodProgress[]>([]);
  const [assessmentScopes, setAssessmentScopes] = useState<AssessmentScope[]>([]);
  const [sourceProgress, setSourceProgress] = useState<SourceProgress[]>([]);
  const [patterns, setPatterns] = useState<Pattern[]>([]);
  const [patternBusy, setPatternBusy] = useState(false);
  const [studyTab, setStudyTab] = useState<"lesson" | "check">("lesson");
  const autoStartedTopic = useRef<string | null>(null);

  function setActiveSessionInUrl(sessionId: string) {
    const query = new URLSearchParams(window.location.search);
    query.delete("topic");
    query.delete("sourceMaterialId");
    query.delete("assessmentId");
    query.set("sessionId", sessionId);
    window.history.replaceState({}, "", `${window.location.pathname}?${query}`);
  }

  async function refreshClassData() {
    const [historyResponse, profileResponse, patternResponse, methodProgressResponse] = await Promise.all([
      fetch(`/api/courses/${courseId}/learner/study-sessions`),
      fetch(`/api/courses/${courseId}/learner/profile`),
      fetch(`/api/courses/${courseId}/learner/patterns`),
      fetch(`/api/courses/${courseId}/learner/method-progress`),
    ]);
    if (historyResponse.ok) setHistory(await historyResponse.json());
    if (profileResponse.ok) {
      const profile = await profileResponse.json();
      setProgress(profile.concepts);
      setAssessmentScopes(profile.assessments.filter((assessment: AssessmentScope) => assessment.topics.length > 0));
      setSourceProgress(profile.sources ?? []);
    }
    if (patternResponse.ok) setPatterns((await patternResponse.json()).patterns);
    if (methodProgressResponse.ok) setMethodProgress(await methodProgressResponse.json());
    if ([historyResponse, profileResponse, patternResponse, methodProgressResponse].some((response) => !response.ok)) {
      setError("Some class progress could not be loaded. Check that the local service is running, then refresh.");
    } else setError((current) => current.startsWith("Some class progress could not be loaded.") ? "" : current);
  }

  useEffect(() => { void refreshClassData().catch(() => undefined); }, [courseId]);

  useEffect(() => {
    if (!content) return;
    if (saved || reopenedAttempt) {
      clearAttemptDraft(courseId, content.sessionId);
      return;
    }
    writeAttemptDraft(courseId, content.sessionId, { selected, confidence, hintCount, studyTab });
  }, [courseId, content?.sessionId, selected, confidence, hintCount, studyTab, saved, reopenedAttempt]);

  async function beginStudy(event: React.FormEvent) {
    event.preventDefault();
    await startStudy(topic, method, studySourceMaterialId, studyAssessmentId);
  }

  async function startStudy(requestedTopic: string, requestedMethod: Method, sourceMaterialId?: string, assessmentId?: string, reviewSessionId?: string) {
    if (!requestedTopic.trim()) return;
    const requestStartedAt = Date.now();
    setTopic(requestedTopic.trim());
    setMethod(requestedMethod);
    setBusy(true); setError(""); setNotice(""); setContent(null); setSelected(null); setReopenedAttempt(null); setSaved(false); setAttemptSaveError(""); pendingAttempt.current = null; setChatAnswer(null); setHintCount(0);
    setStudyTab(requestedMethod === "quiz" ? "check" : "lesson");
    try {
      const generated = await postJson<StudyContent>(`/api/courses/${courseId}/learner/study-session`, { topic: requestedTopic.trim(), method: requestedMethod, ...(sourceMaterialId ? { sourceMaterialId } : {}), ...(assessmentId ? { assessmentId } : {}), ...(reviewSessionId ? { reviewSessionId } : {}) });
      const next = { ...generated, sourceMaterialId: generated.sourceMaterialId ?? sourceMaterialId ?? null };
      setContent(next);
      setActiveSessionInUrl(next.sessionId);
      void refreshClassData();
    } catch (err) {
      const requestError = err instanceof Error ? err : new Error(String(err));
      const couldHaveSavedBeforeDisconnect = !(err instanceof StudyRequestError) || err.status >= 500;
      if (couldHaveSavedBeforeDisconnect && await restoreRecentlySavedSession({ topic: requestedTopic.trim(), method: requestedMethod, requestStartedAt, sourceMaterialId, assessmentId })) {
        setNotice("The connection interrupted the response, but the lesson was saved. I reopened it from your history so you won’t generate it twice.");
        void refreshClassData();
      } else {
        setError(requestError.message);
      }
    }
    finally { setBusy(false); }
  }

  function restoreSessionState(reopened: StudyContent) {
    pendingAttempt.current = null; setAttemptSaveError("");
    const latestAttempt = reopened.attempts?.at(-1) ?? null;
    const draft = latestAttempt ? null : readAttemptDraft(courseId, reopened);
    setContent(reopened); setTopic(reopened.topic); setMethod(reopened.method); setStudyTab(draft?.studyTab ?? (reopened.method === "quiz" ? "check" : "lesson"));
    setReopenedAttempt(latestAttempt);
    const savedOptionIndex = latestAttempt ? reopened.options.indexOf(latestAttempt.response) : -1;
    setSelected(savedOptionIndex >= 0 ? savedOptionIndex : draft?.selected ?? null);
    setSaved(Boolean(latestAttempt));
    setConfidence(latestAttempt?.confidence ?? draft?.confidence ?? 0.5);
    setHintCount(latestAttempt?.hintCount ?? draft?.hintCount ?? 0);
    setActiveSessionInUrl(reopened.sessionId);
  }

  async function restoreRecentlySavedSession(request: { topic: string; method: Method; requestStartedAt: number; sourceMaterialId?: string; assessmentId?: string }) {
    try {
      const response = await fetch(`/api/courses/${courseId}/learner/study-sessions`);
      if (!response.ok) return false;
      const sessions = await response.json() as SessionSummary[];
      const candidates = sessions.filter((session) =>
        session.topic === request.topic
        && session.method === request.method
        && Date.parse(session.createdAt) >= request.requestStartedAt,
      );
      for (const candidate of candidates) {
        const detailResponse = await fetch(`/api/courses/${courseId}/learner/study-sessions/${candidate.sessionId}`);
        if (!detailResponse.ok) continue;
        const reopened = await detailResponse.json() as StudyContent;
        const expectedSourceBasis = request.sourceMaterialId ? "course-materials" : "general-knowledge";
        if ((reopened.assessmentId ?? null) !== (request.assessmentId ?? null)
          || (reopened.sourceMaterialId ?? null) !== (request.sourceMaterialId ?? null)
          || reopened.sourceBasis !== expectedSourceBasis) continue;
        restoreSessionState(reopened);
        return true;
      }
    } catch {
      // Preserve the original request error when the recovery check also fails.
    }
    return false;
  }

  useEffect(() => {
    if (!initialSessionId) return;
    autoStartedTopic.current = initialTopic ?? null;
    void reopenSession(initialSessionId);
  }, [initialSessionId, courseId]);

  useEffect(() => {
    if (initialSessionId || !initialTopic || autoStartedTopic.current === initialTopic) return;
    autoStartedTopic.current = initialTopic;
    void startStudy(initialTopic, "explanation", initialSourceMaterialId, initialAssessmentId);
  }, [initialTopic, initialSourceMaterialId, initialAssessmentId]);

  function selectAnswer(index: number) {
    if (!saved && !reopenedAttempt && !pendingAttempt.current) {
      setSelected(index);
      if (content) writeAttemptDraft(courseId, content.sessionId, { selected: index, confidence, hintCount, studyTab });
    }
  }

  function updateConfidence(value: number) {
    setConfidence(value);
    if (content) writeAttemptDraft(courseId, content.sessionId, { selected, confidence: value, hintCount, studyTab });
  }

  function revealHint() {
    const nextHintCount = Math.min(content?.hints.length ?? 0, hintCount + 1);
    setHintCount(nextHintCount);
    if (content) writeAttemptDraft(courseId, content.sessionId, { selected, confidence, hintCount: nextHintCount, studyTab });
  }

  function selectStudyTab(nextTab: "lesson" | "check") {
    setStudyTab(nextTab);
    if (content && !saved && !reopenedAttempt) {
      writeAttemptDraft(courseId, content.sessionId, { selected, confidence, hintCount, studyTab: nextTab });
    }
  }

  function navigateStudyTabs(event: KeyboardEvent<HTMLButtonElement>) {
    const tabs = ["lesson", "check"] as const;
    const index = tabs.indexOf(studyTab);
    const nextIndex = event.key === "ArrowRight" ? (index + 1) % tabs.length
      : event.key === "ArrowLeft" ? (index + tabs.length - 1) % tabs.length
        : event.key === "Home" ? 0
          : event.key === "End" ? tabs.length - 1 : index;
    if (nextIndex === index) return;
    event.preventDefault();
    const nextTab = tabs[nextIndex]!;
    selectStudyTab(nextTab);
    document.getElementById(`study-tab-${nextTab}`)?.focus();
  }

  async function submitAnswer() {
    if (!content || selected === null || reopenedAttempt || pendingAttempt.current) return;
    const correct = selected === content.answerIndex;
    pendingAttempt.current = {
      id: crypto.randomUUID(),
      payload: {
        sessionId: content.sessionId, conceptId: content.conceptId, assessmentId: content.assessmentId ?? null, activityType: "recognition", prompt: content.question,
        response: content.options[selected], reasoning: "", confidence, hintCount,
        method: content.method === "quiz" ? "retrieval-practice" : content.method,
        outcome: correct ? "correct" : "incorrect", sourceRefs: content.sourceMaterialId ? [{ materialId: content.sourceMaterialId }] : [],
        independence: hintCount > 0 ? "hinted" : "independent", rationale: `${correct ? "Selected the validated answer key" : "Answer did not match the validated key"}${hintCount ? ` after ${hintCount} hint(s)` : " independently"}; confidence ${Math.round(confidence * 100)}%.`,
      },
    };
    setSaved(false); setAttemptSaveError("");
    await savePendingAttempt();
  }

  async function savePendingAttempt() {
    if (!pendingAttempt.current || savingAttempt) return;
    setSavingAttempt(true);
    try {
      const attempt = pendingAttempt.current;
      await postJson(`/api/courses/${courseId}/learner/attempts`, { ...attempt.payload, attemptId: attempt.id });
      setSaved(true);
      setAttemptSaveError("");
      clearAttemptDraft(courseId, String(attempt.payload.sessionId));
      void refreshClassData();
    } catch (err) { setAttemptSaveError((err as Error).message); }
    finally { setSavingAttempt(false); }
  }

  async function reviewPatterns(trigger: "session-end" | "user-request") {
    if (trigger === "session-end" && !content) return;
    setPatternBusy(true); setError("");
    try {
      await postJson(`/api/courses/${courseId}/learner/pattern-reviews`, trigger === "session-end"
        ? { trigger, sessionId: content!.sessionId }
        : { trigger });
      await refreshClassData();
    } catch (err) { setError((err as Error).message); }
    finally { setPatternBusy(false); }
  }

  async function updatePattern(id: string, status: string) {
    try {
      await postJson(`/api/courses/${courseId}/learner/patterns/${id}`, { status });
      await refreshClassData();
    } catch (err) { setError((err as Error).message); }
  }

  async function nextQuestion() {
    if (!content) return;
    setBusy(true); setError("");
    try {
      const next = await postJson<StudyContent>(`/api/courses/${courseId}/learner/study-sessions/${content.sessionId}/next-question`, {});
      pendingAttempt.current = null; setAttemptSaveError(""); setContent(next); setSelected(null); setReopenedAttempt(null); setSaved(false); setHintCount(0); setConfidence(0.5); setChatAnswer(null); setStudyTab("check");
      setActiveSessionInUrl(next.sessionId);
      void refreshClassData();
    } catch (err) { setError((err as Error).message); }
    finally { setBusy(false); }
  }

  function switchToReinforcementMethod() {
    if (!content) return;
    const nextMethod: Method = content.method === "worked-example" ? "explanation" : "worked-example";
    void startStudy(content.topic, nextMethod, content.sourceMaterialId ?? undefined, content.assessmentId ?? undefined, content.sessionId);
  }

  function retryCurrentQuestion() {
    pendingAttempt.current = null; setAttemptSaveError(""); setSelected(null); setReopenedAttempt(null); setSaved(false); setHintCount(0); setConfidence(0.5); setChatAnswer(null);
  }

  async function reopenSession(sessionId: string) {
    setBusy(true); setError(""); pendingAttempt.current = null; setAttemptSaveError(""); setSelected(null); setSaved(false); setChatAnswer(null); setHintCount(0); setConfidence(0.5);
    try {
      const response = await fetch(`/api/courses/${courseId}/learner/study-sessions/${sessionId}`);
      const value = await response.json().catch(() => null);
      if (!response.ok) throw new Error(value?.error ?? "Could not reopen this lesson.");
      if (!value) throw new Error("The local service returned an empty response. Check that it is running, then try again.");
      restoreSessionState(value as StudyContent);
    } catch (err) { setError((err as Error).message); }
    finally { setBusy(false); }
  }

  async function askClarification(event: React.FormEvent) {
    event.preventDefault(); if (!content || !chatQuestion.trim()) return;
    setChatBusy(true); setError("");
    try {
      setChatAnswer(await postJson<ChatAnswer>(`/api/courses/${courseId}/learner/clarify`, { conceptId: content.conceptId, topic: content.topic, question: chatQuestion.trim(), context: content.lesson }));
    } catch (err) { setError((err as Error).message); }
    finally { setChatBusy(false); }
  }

  async function makeBudget(event: React.FormEvent) {
    event.preventDefault();
    const topics = parseInstructorTopicList(budgetTopics);
    const title = budgetTitle.trim();
    if (!topics.length || !title || budgetSaving) return;
    const existing = assessmentScopes.find((assessment) => assessment.title.trim().normalize("NFKC").toLocaleLowerCase() === title.normalize("NFKC").toLocaleLowerCase());
    const progressByTitle = new Map(progress.map((item) => [item.title.trim().normalize("NFKC").toLocaleLowerCase(), item]));
    const existingTopicsByTitle = new Map((existing?.topics ?? []).map((item) => [item.title.trim().normalize("NFKC").toLocaleLowerCase(), item]));
    const planTopics = topics.map((topicTitle) => {
      const key = topicTitle.trim().normalize("NFKC").toLocaleLowerCase();
      const prior = existingTopicsByTitle.get(key);
      const signal = progressByTitle.get(key);
      return {
        title: topicTitle,
        conceptId: prior?.conceptId ?? signal?.id ?? null,
        importance: prior?.importance ?? "normal" as const,
        attemptCount: prior?.attemptCount ?? signal?.attemptCount ?? 0,
        scoredAttemptCount: prior?.scoredAttemptCount ?? signal?.scoredAttemptCount ?? 0,
        correctCount: prior?.correctCount ?? signal?.correctCount ?? 0,
        sessionCount: prior?.sessionCount ?? signal?.sessionCount ?? 0,
        latestOutcome: prior?.latestOutcome ?? signal?.latestOutcome ?? null,
        lastPracticedAt: prior?.lastPracticedAt ?? signal?.lastPracticedAt ?? null,
      };
    });
    const allocations = allocateAssessmentStudyPlan(planTopics, budgetMinutes)
      .map(({ topic: planTopic, minutes }) => ({ topic: planTopic.title, minutes }));
    setBudget(allocations);
    setBudgetSaving(true);
    setError("");
    try {
      const scheduledAt = examAt ? new Date(examAt).toISOString() : null;
      if (existing) {
        await postJson(`/api/courses/${courseId}/learner/assessments/${existing.id}`, { scheduledAt, availableMinutes: budgetMinutes, dailyMinutes: budgetDailyMinutes }, "PATCH");
        const existingKeys = new Set(existing.topics.map((item) => item.title.trim().normalize("NFKC").toLocaleLowerCase()));
        const additionalTopics = topics.filter((item) => !existingKeys.has(item.trim().normalize("NFKC").toLocaleLowerCase()));
        if (additionalTopics.length) await postJson(`/api/courses/${courseId}/learner/assessments/${existing.id}/topics`, {
          topics: additionalTopics.map((topicTitle) => {
            const conceptId = progressByTitle.get(topicTitle.trim().normalize("NFKC").toLocaleLowerCase())?.id;
            return { title: topicTitle, ...(conceptId ? { conceptId } : {}), importance: "normal", provenance: "learner" };
          }),
        }, "PATCH");
      } else {
        await postJson(`/api/courses/${courseId}/learner/assessments`, {
          title, kind: "exam", scheduledAt, availableMinutes: budgetMinutes, dailyMinutes: budgetDailyMinutes,
          topics: planTopics.map(({ title: topicTitle, conceptId, importance }) => ({ title: topicTitle, ...(conceptId ? { conceptId } : {}), importance, provenance: "learner" })),
        });
      }
      await refreshClassData();
    } catch (err) { setError((err as Error).message); }
    finally { setBudgetSaving(false); }
  }

  async function saveInstructorTopicList(event: React.FormEvent) {
    event.preventDefault();
    if (!parsedTopicScope.length || topicScopeSaving) return;
    setTopicScopeSaving(true);
    const topics = parsedTopicScope.map((title) => {
      const conceptId = progress.find((item) => item.title.trim().normalize("NFKC").toLocaleLowerCase() === title.trim().normalize("NFKC").toLocaleLowerCase())?.id;
      return {
        title,
        ...(conceptId ? { conceptId } : {}),
        importance: topicScopeImportance[title.trim().normalize("NFKC").toLocaleLowerCase()] ?? "normal",
        provenance: "learner" as const,
      };
    });
    const instructorText = topicScopeNotes.trim()
      ? `${topicScopeText}\n\nProfessor notes:\n${topicScopeNotes}`
      : topicScopeText;
    try {
      let addedTopicCount = parsedTopicScope.length;
      if (topicScopeTargetAssessmentId) {
        const result = await postJson<{ addedTopicCount: number }>(`/api/courses/${courseId}/learner/assessments/${topicScopeTargetAssessmentId}/topics`, {
          topics,
        }, "PATCH");
        addedTopicCount = result.addedTopicCount;
        if (addedTopicCount) {
          const currentText = assessmentScopes.find(({ id }) => id === topicScopeTargetAssessmentId)?.instructorText ?? "";
          await postJson(`/api/courses/${courseId}/learner/assessments/${topicScopeTargetAssessmentId}`, {
            instructorText: currentText ? `${currentText.trimEnd()}\n\nAdditional instructor topics (${new Date().toLocaleDateString()}):\n${instructorText}` : instructorText,
          }, "PATCH");
        }
      } else {
        await postJson(`/api/courses/${courseId}/learner/assessments`, {
          title: normalizedTopicScopeTitle,
          instructorText,
          kind: "exam",
          scheduledAt: topicScopeScheduledAt ? new Date(topicScopeScheduledAt).toISOString() : null,
          availableMinutes: topicScopeAvailableMinutes ? Number(topicScopeAvailableMinutes) : null,
          dailyMinutes: Number(topicScopeDailyMinutes) || 45,
          topics,
        });
      }
      const targetTitle = assessmentScopes.find(({ id }) => id === topicScopeTargetAssessmentId)?.title;
      setTopicScopeMessage(topicScopeTargetAssessmentId
        ? addedTopicCount
          ? `Added ${addedTopicCount} new ${addedTopicCount === 1 ? "topic" : "topics"} to ${targetTitle ?? "this scope"}. Existing topic history was kept.`
          : `Those topics are already in ${targetTitle ?? "this scope"}; nothing new was added.`
        : `Saved ${addedTopicCount} ${addedTopicCount === 1 ? "topic" : "topics"} to this class.`);
      setTopicScopeTargetAssessmentId(null);
      setTopicScopeTitle("");
      setTopicScopeScheduledAt("");
      setTopicScopeAvailableMinutes("");
      setTopicScopeDailyMinutes("45");
      setTopicScopeText("");
      setTopicScopeNotes("");
      setTopicScopeImportance({});
      setTopicScopeOpen(false);
      await refreshClassData();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setTopicScopeSaving(false);
    }
  }

  async function saveInstructorText(assessmentId: string) {
    setInstructorTextSaving(true);
    try {
      await postJson(`/api/courses/${courseId}/learner/assessments/${assessmentId}`, { instructorText: instructorTextDraft }, "PATCH");
      setEditingInstructorScopeId(null);
      await refreshClassData();
    } catch (err) { setError((err as Error).message); }
    finally { setInstructorTextSaving(false); }
  }

  const parsedTopicScope = parseInstructorTopicList(topicScopeText);
  const providedTopicCount = topicScopeText.split(/[\n,;]+/).filter((part) => part.trim()).length;
  const parsedBudgetTopics = parseInstructorTopicList(budgetTopics);
  const matchingBudgetAssessment = assessmentScopes.find((assessment) => assessment.title.trim().normalize("NFKC").toLocaleLowerCase() === budgetTitle.trim().normalize("NFKC").toLocaleLowerCase());
  const normalizedTopicScopeTitle = topicScopeTitle.trim() || "Instructor topic list";
  const topicScopeTitleKey = normalizedTopicScopeTitle.normalize("NFKC").toLocaleLowerCase();
  const duplicateTopicScope = topicScopeTargetAssessmentId ? undefined : assessmentScopes.find((assessment) => assessment.title.trim().normalize("NFKC").toLocaleLowerCase() === topicScopeTitleKey);

  function appendTopicsToAssessment(assessment: AssessmentScope) {
    setTopicScopeTargetAssessmentId(assessment.id);
    setTopicScopeTitle(assessment.title);
    setTopicScopeScheduledAt("");
    setTopicScopeAvailableMinutes("");
    setTopicScopeDailyMinutes("45");
    setTopicScopeText("");
    setTopicScopeNotes("");
    setTopicScopeImportance({});
    setTopicScopeMessage("");
    setTopicScopeOpen(true);
    window.requestAnimationFrame(() => document.getElementById("topic-scope-editor")?.scrollIntoView({ behavior: "smooth", block: "center" }));
  }

  async function updateTopicImportance(assessment: AssessmentScope, topicId: string, importance: "low" | "normal" | "high") {
    setSavingPriorityTopicId(topicId);
    setError("");
    try {
      const result = await postJson<{ assessment: AssessmentScope }>(
        `/api/courses/${courseId}/learner/assessments/${assessment.id}/topics/${topicId}/importance`,
        { importance }, "PATCH",
      );
      setAssessmentScopes((current) => current.map((item) => item.id === assessment.id ? result.assessment : item));
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSavingPriorityTopicId(null);
    }
  }

  // Include lesson-only topics here: a learner may have studied one already
  // without saving a knowledge check, which is a useful next retrieval prompt.
  const classNextTopic = recommendNextStudyTopic(progress, progress);
  const recommendations: StudyRecommendation[] = [
    ...assessmentScopes.flatMap((assessment) => {
      const next = recommendNextStudyTopic(assessment.topics, assessment.topics);
      return next ? [{
        title: next.topic.title,
        reason: next.reason,
        latestOutcome: next.topic.latestOutcome,
        lastPracticedAt: next.topic.lastPracticedAt,
        importance: next.topic.importance,
        assessmentId: assessment.id,
        assessmentTitle: assessment.title,
      }] : [];
    }),
    ...sourceProgress.flatMap((source) => {
      const next = recommendNextStudyTopic(source.topics, source.topics);
      return next ? [{
        title: next.topic.title,
        reason: next.reason,
        latestOutcome: next.topic.latestOutcome,
        lastPracticedAt: next.topic.lastPracticedAt,
        sourceMaterialId: source.materialId,
        sourceTitle: source.title,
      }] : [];
    }),
    ...(classNextTopic ? [{
      title: classNextTopic.topic.title,
      reason: classNextTopic.reason,
      latestOutcome: classNextTopic.topic.latestOutcome,
      lastPracticedAt: classNextTopic.topic.lastPracticedAt,
    }] : []),
  ];
  const contextPriority = (item: StudyRecommendation) => item.assessmentId ? 0
    : item.sourceMaterialId && sourceProgress.find(({ materialId }) => materialId === item.sourceMaterialId)?.kind === "assignment" ? 1
      : item.sourceMaterialId ? 2 : 3;
  const nextRecommendation = prioritizeStudyRecommendations(
    recommendations.map((item) => ({ ...item, contextPriority: contextPriority(item) })),
  )[0];
  const recommendationStatus = nextRecommendation?.reason === "needs-review"
    ? nextRecommendation.latestOutcome === "incorrect" ? "Your latest check was incorrect."
      : nextRecommendation.latestOutcome === "incomplete" ? "Your latest check was incomplete."
        : "Your latest check needs another pass."
    : nextRecommendation?.reason === "lesson-only"
      ? "You’ve opened this lesson; a first knowledge check can show what you recall."
    : nextRecommendation?.reason === "not-practiced"
      ? "No lesson or check activity is recorded for this topic yet."
      : nextRecommendation?.lastPracticedAt
        ? `Last practiced ${new Date(nextRecommendation.lastPracticedAt).toLocaleDateString()}.`
        : "No recent practice is recorded.";
  const sessionSourceTitle = content?.sourceMaterialId
    ? sourceProgress.find(({ materialId }) => materialId === content.sourceMaterialId)?.title
    : undefined;
  const reviewedAnswerCorrect = reopenedAttempt ? reopenedAttempt.outcome === "correct" : selected === content?.answerIndex;
  const reviewedConfidence = reopenedAttempt ? reopenedAttempt.confidence : confidence;
  const displayedConfidence = reopenedAttempt ? reopenedAttempt.confidence : confidence;
  const displayedHintCount = reopenedAttempt ? reopenedAttempt.hintCount : hintCount;
  const confidenceSummary = displayedConfidence == null ? "confidence not recorded" : `confidence ${Math.round(displayedConfidence * 100)}%`;
  const answerFollowUp = !reviewedAnswerCorrect
    ? reviewedConfidence != null && reviewedConfidence >= 0.75
      ? "You felt confident in this answer. Review the explanation and compare the key distinction with the choice you made."
      : "Review the explanation, then try a different version to reinforce the idea."
    : reviewedConfidence != null && reviewedConfidence <= 0.5
      ? "You got it right with lower confidence. Another version can check whether the reasoning holds."
      : reviewedConfidence == null
        ? "You got it right. A transfer question can check whether the idea holds in a new setting."
      : (reopenedAttempt?.hintCount ?? hintCount) > 0
        ? "You got it right with hints. Try another version without help to check independent recall."
        : "You got it right with confidence. A transfer question can check the idea in a new setting.";
  const shouldReviewLesson = Boolean(content && !reviewedAnswerCorrect && reviewedConfidence != null && reviewedConfidence >= 0.75);

  return <main className="study-page">
    <button className="back-link" type="button" onClick={onBack}>← {courseTitle}</button><header className="study-heading"><div><p className="eyebrow">{courseTitle} · class study space</p><h1>Learn something now.</h1><p>This class has its own topics and learning history. Pick a topic and approach, ask questions, and add a schedule only if you want one.</p></div><button className="button-secondary" type="button" onClick={() => setBudgetOpen((open) => !open)}>{budgetOpen ? "Close time budget" : "Plan my time (optional)"}</button></header>
    <form className="study-start" onSubmit={beginStudy}><label htmlFor="study-topic">What would you like to understand?</label><div className="study-start__row"><input id="study-topic" value={topic} onChange={(event) => setTopic(event.target.value)} placeholder="e.g. Bayes' theorem, recursion, quantum measurement" /><button className="button-primary" disabled={busy || !topic.trim()}>{busy ? "Preparing…" : "Start learning →"}</button></div>{studySourceMaterialId || studyAssessmentId ? <div className="study-start__scope" role="status"><span>{studySourceMaterialId ? `Grounded in ${sourceProgress.find(({ materialId }) => materialId === studySourceMaterialId)?.title ?? "the selected course material"}` : ""}{studySourceMaterialId && studyAssessmentId ? " · " : ""}{studyAssessmentId ? `Tracked under ${assessmentScopes.find(({ id }) => id === studyAssessmentId)?.title ?? "the selected assessment scope"}` : ""}. Lessons and checks will stay connected to this evidence.</span><button type="button" onClick={() => { setStudySourceMaterialId(undefined); setStudyAssessmentId(undefined); }}>Clear study scope</button></div> : null}<div className="study-methods" aria-label="Choose a learning approach">{studyMethods.map(({ value, label }) => <button type="button" key={value} aria-pressed={method === value} className={method === value ? "study-method study-method--active" : "study-method"} onClick={() => setMethod(value)}>{label}</button>)}</div><p className="study-method-description" aria-live="polite">{studyMethods.find(({ value }) => value === method)?.description}</p><small>{studySourceMaterialId ? "The lesson and knowledge check will use the selected course material." : studyAssessmentId ? "The lesson and knowledge check will be tracked under the selected assessment scope." : "No notes required. Without course materials, explanations use general knowledge and are marked as not course-verified."}</small></form>
    <section className="topic-scope-panel">
      <div className="topic-scope-panel__heading"><div><p className="section-kicker">Instructor guidance</p><h2>Paste an exam topic list</h2><p>Save the professor’s wording as this class’s learner-provided exam scope.</p></div><button className="button-secondary" type="button" aria-expanded={topicScopeOpen} onClick={() => setTopicScopeOpen((open) => !open)}>{topicScopeOpen ? "Close topic list" : "Add topic list"}</button></div>
      {topicScopeMessage ? <p className="topic-scope-panel__success" role="status">{topicScopeMessage}</p> : null}
      {topicScopeOpen ? <form id="topic-scope-editor" onSubmit={(event) => void saveInstructorTopicList(event)}>
        {topicScopeTargetAssessmentId ? <p className="topic-scope-panel__target">Adding the professor’s new topics to <strong>{assessmentScopes.find(({ id }) => id === topicScopeTargetAssessmentId)?.title ?? topicScopeTitle}</strong>. Existing topics and their study history stay in place.</p> : <>
          <label>Exam or assessment name<input value={topicScopeTitle} onChange={(event) => { setTopicScopeTitle(event.target.value); setTopicScopeMessage(""); }} placeholder="e.g. Midterm 2" /></label>
          <div className="topic-scope-schedule">
            <label>When is it? <span>(optional)</span><input type="datetime-local" value={topicScopeScheduledAt} onChange={(event) => setTopicScopeScheduledAt(event.target.value)} /></label>
            <label>Study time available <span>(optional)</span><div className="topic-scope-minutes"><input type="number" min="5" max="1440" step="5" value={topicScopeAvailableMinutes} onChange={(event) => setTopicScopeAvailableMinutes(event.target.value)} placeholder="120" /><span>minutes</span></div></label>
            <label>Target minutes per study day<div className="topic-scope-minutes"><input type="number" min="15" max="240" step="5" value={topicScopeDailyMinutes} onChange={(event) => setTopicScopeDailyMinutes(event.target.value)} /><span>minutes max</span></div></label>
          </div>
        </>}
        <label>{topicScopeTargetAssessmentId ? "Additional topics from the instructor" : "Topics from the instructor"}<textarea required value={topicScopeText} onChange={(event) => { setTopicScopeText(event.target.value); setTopicScopeMessage(""); }} placeholder={topicScopeTargetAssessmentId ? "Paste the new topics; topics already saved to this scope will be skipped" : "Paste one per line; numbering, bullets, commas, and semicolons are okay"} /></label>
        <label>Other instructions or context <span>(optional)</span><textarea value={topicScopeNotes} onChange={(event) => { setTopicScopeNotes(event.target.value); setTopicScopeMessage(""); }} placeholder="For example: You should be able to compute reduced density matrices. No proofs required." /></label>
        {topicScopeText.trim() ? <div className="topic-scope-preview" aria-live="polite"><strong>{parsedTopicScope.length ? `${parsedTopicScope.length} cleaned ${parsedTopicScope.length === 1 ? "topic" : "topics"} ready to ${topicScopeTargetAssessmentId ? "add" : "save"}` : "No topics found yet"}</strong>{providedTopicCount > parsedTopicScope.length ? <small>{providedTopicCount - parsedTopicScope.length} duplicate or empty {providedTopicCount - parsedTopicScope.length === 1 ? "entry was" : "entries were"} removed.</small> : null}{duplicateTopicScope ? <p role="alert">A scope named “{duplicateTopicScope.title}” already exists. Use its “Add topics” action to extend it and keep its progress.</p> : null}{topicScopeTargetAssessmentId ? <p>Topics already in this scope will be skipped; their saved study history remains unchanged.</p> : null}{parsedTopicScope.length ? <ol>{parsedTopicScope.map((item, index) => <li key={`${item}-${index}`}><span>{item}</span><label className="topic-scope-preview__priority">Priority<select aria-label={`Priority for ${item}`} value={topicScopeImportance[item.trim().normalize("NFKC").toLocaleLowerCase()] ?? "normal"} onChange={(event) => setTopicScopeImportance((current) => ({ ...current, [item.trim().normalize("NFKC").toLocaleLowerCase()]: event.target.value as "low" | "normal" | "high" }))}><option value="high">High</option><option value="normal">Normal</option><option value="low">Low</option></select></label></li>)}</ol> : <p>Try one topic per line or separate topics with commas.</p>}</div> : null}
        <div className="topic-scope-panel__form-actions"><button className="button-primary" disabled={topicScopeSaving || !parsedTopicScope.length}>{topicScopeSaving ? "Saving…" : topicScopeTargetAssessmentId ? "Add topics to this list" : "Save topic scope"}</button>{topicScopeTargetAssessmentId ? <button className="button-secondary" type="button" onClick={() => { setTopicScopeTargetAssessmentId(null); setTopicScopeTitle(""); setTopicScopeScheduledAt(""); setTopicScopeAvailableMinutes(""); setTopicScopeDailyMinutes("45"); setTopicScopeText(""); setTopicScopeNotes(""); setTopicScopeImportance({}); setTopicScopeMessage(""); }}>Cancel</button> : null}</div></form> : null}
      {assessmentScopes.length ? <div className="topic-scope-panel__saved"><strong>Saved class scopes · checks are practice activity, not mastery estimates</strong>{assessmentScopes.map((assessment) => {
        const coverage = summarizeStudyCoverage(assessment.topics.map(({ title }) => title), assessment.topics);
        const lessonCoveragePercent = coverage.topicCount ? Math.round(coverage.lessonTopicCount / coverage.topicCount * 100) : 0;
        const checkCoveragePercent = coverage.topicCount ? Math.round(coverage.checkedTopicCount / coverage.topicCount * 100) : 0;
        const latestPractice = assessment.topics.map((item) => item.lastPracticedAt).filter((value): value is string => Boolean(value)).sort().at(-1);
        const latestLesson = assessment.topics.map((item) => item.lastSessionAt).filter((value): value is string => Boolean(value)).sort().at(-1);
        const studyPlan = assessment.availableMinutes == null ? [] : allocateAssessmentStudyPlan(assessment.topics, assessment.availableMinutes);
        const minutesByTopicId = new Map(studyPlan.map(({ topic: planTopic, minutes }) => [planTopic.id, minutes]));
        const daySchedule = assessment.availableMinutes == null ? null : scheduleAssessmentStudyDays(
          studyPlan.map(({ topic: planTopic, minutes }) => ({ title: planTopic.title, minutes })),
          assessment.scheduledAt,
          assessment.dailyMinutes,
        );
        const deadline = assessmentDeadlineLabel(assessment.scheduledAt);
        return <article key={assessment.id}>
          <div className="scope-assessment-head"><div><h3>{assessment.title}</h3>{assessment.scheduledAt || assessment.availableMinutes ? <small className="scope-assessment-meta">{assessment.scheduledAt ? `Scheduled ${new Date(assessment.scheduledAt).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })}${deadline ? ` · ${deadline}` : ""}` : "Date not set"}{assessment.availableMinutes ? ` · ${assessment.availableMinutes} total min · up to ${assessment.dailyMinutes} min/day` : ""}</small> : null}</div><small>{assessment.scoredAttemptCount ? `${assessment.correctCount} of ${assessment.scoredAttemptCount} scored checks correct${assessment.attemptCount > assessment.scoredAttemptCount ? ` · ${assessment.attemptCount - assessment.scoredAttemptCount} unscored` : ""}` : assessment.attemptCount ? `${assessment.attemptCount} unscored attempt${assessment.attemptCount === 1 ? "" : "s"}` : assessment.sessionCount ? `${assessment.sessionCount} lesson session${assessment.sessionCount === 1 ? "" : "s"} · no checks saved` : "No checks recorded yet"}</small></div>
          <button className="scope-add-topics" type="button" onClick={() => appendTopicsToAssessment(assessment)}>Add topics to this list →</button>
          <details className="scope-instructor-text"><summary>{assessment.instructorText ? "Professor’s original wording" : "Add professor wording or notes"}</summary>{editingInstructorScopeId === assessment.id ? <div><textarea aria-label={`Professor wording for ${assessment.title}`} maxLength={12000} value={instructorTextDraft} onChange={(event) => setInstructorTextDraft(event.target.value)} placeholder="Paste the professor’s exact wording, including caveats or emphasis."/><div><button type="button" className="button-primary" disabled={instructorTextSaving} onClick={() => void saveInstructorText(assessment.id)}>{instructorTextSaving ? "Saving…" : "Save wording"}</button><button type="button" className="button-secondary" onClick={() => setEditingInstructorScopeId(null)}>Cancel</button></div></div> : <><pre>{assessment.instructorText || "No original wording saved yet."}</pre><button type="button" className="button-secondary" onClick={() => { setInstructorTextDraft(assessment.instructorText); setEditingInstructorScopeId(assessment.id); }}>Edit wording</button></>}</details>
          <div className="scope-coverage"><span>{coverage.lessonTopicCount}/{coverage.topicCount} topics studied · {coverage.checkedTopicCount}/{coverage.topicCount} checked · {assessment.sessionCount} lesson session{assessment.sessionCount === 1 ? "" : "s"}{latestLesson ? ` · last lesson ${new Date(latestLesson).toLocaleDateString()}` : ""}{latestPractice ? ` · last check ${new Date(latestPractice).toLocaleDateString()}` : ""}</span><div className="scope-coverage__tracks"><div><small>Lesson</small><span className="scope-coverage__track" role="progressbar" aria-label={`${assessment.title} lesson coverage`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={lessonCoveragePercent}><span style={{ width: `${lessonCoveragePercent}%` }} /></span></div><div><small>Knowledge checks</small><span className="scope-coverage__track scope-coverage__track--checked" role="progressbar" aria-label={`${assessment.title} knowledge check coverage`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={checkCoveragePercent}><span style={{ width: `${checkCoveragePercent}%` }} /></span></div></div></div>
          {studyPlan.length ? <p className="scope-plan-note">Suggested minutes rebalance as you study, giving more time to high-priority topics, missed checks, and topics with less evidence.</p> : null}
          {daySchedule ? <div className="scope-day-plan"><strong>Day-by-day study plan</strong>{daySchedule.days.length ? <ol>{daySchedule.days.map((day) => <li key={day.date}><div><b>{new Date(`${day.date}T00:00:00`).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" })}</b><span>{day.minutes} min</span></div><small>{day.topics.map(({ title, minutes }) => `${title} · ${minutes} min`).join("; ")}</small></li>)}</ol> : <p>{daySchedule.status === "missing-deadline" ? "Add the exam date to place study sessions on calendar days." : daySchedule.status === "deadline-passed" ? "This assessment date has passed. Update it to make a future plan." : "No study minutes need scheduling."}</p>}{daySchedule.unscheduledMinutes ? <p className="scope-day-plan__warning">{daySchedule.unscheduledMinutes} minutes do not fit before the assessment at this daily limit. Increase minutes per day or reduce the total study time.</p> : null}</div> : null}
          <ul>{assessment.topics.map((item) => {
            const lessonStatus = item.sessionCount ? "Lesson seen" : "Not studied";
            const checkStatus = item.scoredAttemptCount ? `${item.scoredAttemptCount} check${item.scoredAttemptCount === 1 ? "" : "s"} · ${item.correctCount} correct` : item.attemptCount ? "Check needs grading" : "No checks";
            const latestStatus = item.latestOutcome ? `Latest: ${item.latestOutcome}` : null;
            return <li className="scope-topic-row" key={item.id}>
              <div className="scope-topic-row__info"><strong>{item.title}</strong><div className="scope-topic-signals"><span className={item.sessionCount ? "scope-topic-signal scope-topic-signal--studied" : "scope-topic-signal"}>{lessonStatus}</span><span className={item.scoredAttemptCount ? "scope-topic-signal scope-topic-signal--checked" : "scope-topic-signal"}>{checkStatus}</span>{latestStatus ? <span className={item.latestOutcome === "incorrect" || item.latestOutcome === "incomplete" ? "scope-topic-signal scope-topic-signal--review" : "scope-topic-signal"}>{latestStatus}</span> : null}{minutesByTopicId.has(item.id) ? <span className="scope-topic-signal scope-topic-signal--plan">Plan · {minutesByTopicId.get(item.id)} min</span> : null}</div></div>
              <div className="scope-topic-row__actions"><label className="scope-topic-priority">Priority<select aria-label={`Importance for ${item.title}`} value={item.importance} disabled={savingPriorityTopicId === item.id} onChange={(event) => void updateTopicImportance(assessment, item.id, event.target.value as "low" | "normal" | "high")}><option value="high">High</option><option value="normal">Normal</option><option value="low">Low</option></select></label><button type="button" disabled={busy} onClick={() => void startStudy(item.title, "explanation", undefined, assessment.id)}>Study lesson</button><button type="button" disabled={busy} onClick={() => void startStudy(item.title, "quiz", undefined, assessment.id)}>Practice check</button></div>
            </li>;
          })}</ul>
        </article>;
      })}</div> : null}
    </section>
    {notice ? <div className="study-notice" role="status">{notice}</div> : null}
    {error ? <div className="error-banner">{error}{error.startsWith("Some class progress could not be loaded.") ? <button className="button-secondary" type="button" onClick={() => void refreshClassData()}>Retry loading progress</button> : null}</div> : null}
    {budgetOpen ? <section className="budget-panel">
      <div><p className="section-kicker">Assessment study plan</p><h2>Make room for every topic.</h2><p>Save the exam date, total study time, and exact topic list. We’ll spread short sessions across the days before the exam, up to your daily limit. Topic minutes rebalance as you practice.</p></div>
      <form onSubmit={makeBudget}>
        <label>Exam or quiz name<input required value={budgetTitle} onChange={(event) => setBudgetTitle(event.target.value)} placeholder="e.g. Midterm 2" /></label>
        <label>Exam or quiz time<input type="datetime-local" value={examAt} onChange={(event) => setExamAt(event.target.value)} /></label>
        <label>Total study minutes<input type="number" min="5" max="1440" value={budgetMinutes} onChange={(event) => setBudgetMinutes(Number(event.target.value))} /></label>
        <label>Target minutes per study day<input type="number" min="15" max="240" step="5" value={budgetDailyMinutes} onChange={(event) => setBudgetDailyMinutes(Number(event.target.value))} /></label>
        <label className="budget-topics">Topics<textarea value={budgetTopics} onChange={(event) => setBudgetTopics(event.target.value)} placeholder="Bayes' theorem\nConditional probability\nDistributions" /></label>
        {matchingBudgetAssessment ? <p className="budget-plan-update" role="status">A scope with this name already exists. Saving updates its date and time budget, then adds only new topics. Existing topic priorities and progress are kept.</p> : null}
        <button className="button-primary" disabled={budgetSaving || !budgetTitle.trim() || !parsedBudgetTopics.length}>{budgetSaving ? "Saving plan…" : "Save study plan"}</button>
        {budget ? <div className="budget-result"><p className="budget-result__total">{budget.reduce((sum, item) => sum + item.minutes, 0)} minutes suggested · saved to {budgetTitle}</p>{budget.map((item) => <p key={item.topic}><strong>{item.topic}</strong><span>{item.minutes} min</span></p>)}</div> : null}
      </form>
    </section> : null}
    <section className="study-memory"><div className="study-memory__head"><div><p className="section-kicker">This class</p><h2>Your learning trail</h2></div><span>Evidence builds over time; one correct answer does not establish mastery.</span></div>{nextRecommendation ? <div className="next-review-card"><div><p className="section-kicker">{nextRecommendation.reason === "lesson-only" ? "First knowledge check" : nextRecommendation.reason === "not-practiced" ? "A useful next study" : "A useful next review"}</p><strong>{nextRecommendation.title}</strong><span>{nextRecommendation.importance === "high" ? "High-priority topic · " : ""}{recommendationStatus}{nextRecommendation.assessmentTitle ? ` · ${nextRecommendation.assessmentTitle}` : nextRecommendation.sourceTitle ? ` · ${nextRecommendation.sourceTitle}` : " · Across this class"}</span></div><button type="button" className="button-secondary" disabled={busy} onClick={() => void startStudy(nextRecommendation.title, "quiz", nextRecommendation.sourceMaterialId, nextRecommendation.assessmentId)}>{nextRecommendation.reason === "lesson-only" ? "Try your first check →" : nextRecommendation.assessmentTitle ? "Practice for this scope →" : nextRecommendation.sourceTitle ? `Study with ${nextRecommendation.sourceTitle} →` : "Practice with a quiz →"}</button></div> : null}<div className="study-memory__grid"><div className="study-memory__progress"><strong>Topic signals</strong>{progress.length ? progress.map((item) => <div className="progress-row" key={item.id}><span>{item.title}</span><small>{item.scoredAttemptCount ? `${item.correctCount} of ${item.scoredAttemptCount} scored checks correct${item.attemptCount > item.scoredAttemptCount ? ` · ${item.attemptCount - item.scoredAttemptCount} unscored` : ""}${item.latestOutcome ? ` · latest ${item.latestOutcome}` : ""}${item.lastPracticedAt ? ` · last checked ${new Date(item.lastPracticedAt).toLocaleDateString()}` : ""}` : item.attemptCount ? `${item.attemptCount} unscored attempt${item.attemptCount === 1 ? "" : "s"}${item.latestOutcome ? ` · latest ${item.latestOutcome}` : ""}` : item.sessionCount ? `${item.sessionCount} lesson session${item.sessionCount === 1 ? "" : "s"} · no checks saved${item.lastSessionAt ? ` · last lesson ${new Date(item.lastSessionAt).toLocaleDateString()}` : ""}` : "No lesson or check activity yet"}</small></div>) : <p>Saved class progress will appear here as you study.</p>}</div><div className="study-memory__history"><strong>Recent lessons</strong>{history.length ? history.slice(0,5).map((item) => <button type="button" key={item.sessionId} onClick={() => void reopenSession(item.sessionId)}><span>{item.topic}</span><small>{studyMethodLabel(item.method)} · {item.attemptCount} checks · {new Date(item.createdAt).toLocaleString(undefined, { month: "numeric", day: "numeric", hour: "numeric", minute: "2-digit" })}</small></button>) : <p>Your generated lessons will be saved here for later.</p>}</div></div><div className="study-method-progress"><div><strong>Practice by approach</strong><p>Confidence gap averages the distance between your rated confidence and each scored outcome; lower is closer to outcomes. Small samples and different topics make method comparisons uncertain.</p></div>{methodProgress.length ? <ul>{methodProgress.map((item) => {
      const score = item.scoredAttemptCount ? Math.round(item.correctCount / item.scoredAttemptCount * 100) : 0;
      const label = studyMethodLabel(item.method);
      const notScored = item.attemptCount - item.scoredAttemptCount;
      const lastUsed = item.lastPracticedAt ? ` · last used ${new Date(item.lastPracticedAt).toLocaleDateString()}` : "";
      const confidenceSignal = item.scoredAttemptCount ? ` · ${item.highConfidenceMissCount} confident miss${item.highConfidenceMissCount === 1 ? "" : "es"} · ${item.lowConfidenceCorrectCount} low-confidence correct` : "";
      const independenceSignal = `${item.independentCorrectCount}/${item.independentScoredAttemptCount} independent correct${item.hintedScoredAttemptCount ? ` · ${item.hintedScoredAttemptCount} hinted` : ""}${item.assistedScoredAttemptCount ? ` · ${item.assistedScoredAttemptCount} assisted` : ""}${item.unknownIndependenceScoredAttemptCount ? ` · ${item.unknownIndependenceScoredAttemptCount} unknown independence` : ""}`;
      const confidenceGap = item.meanConfidenceGap == null ? " · confidence alignment unavailable" : ` · confidence gap ${Math.round(item.meanConfidenceGap * 100)}% (${item.confidenceRatedAttemptCount} rated check${item.confidenceRatedAttemptCount === 1 ? "" : "s"}; lower is closer to outcomes)`;
      return <li key={item.method}><div><span>{label}</span><small>{item.correctCount}/{item.scoredAttemptCount} scored correct · {independenceSignal} · {item.attemptCount} total attempt{item.attemptCount === 1 ? "" : "s"} across {item.topicCount} topic{item.topicCount === 1 ? "" : "s"}{notScored ? ` · ${notScored} not scored` : ""}{confidenceSignal}{confidenceGap}{lastUsed}</small></div><details className="method-progress__topics"><summary>View results by topic</summary>{item.topicProgress.length ? <ul>{item.topicProgress.map((topic) => { const unscored = Math.max(0, topic.attemptCount - topic.scoredAttemptCount); const outcome = topic.scoredAttemptCount ? `${topic.correctCount}/${topic.scoredAttemptCount} scored correct` : "no scored checks"; const independence = `${topic.independentCorrectCount}/${topic.independentScoredAttemptCount} independent correct${topic.hintedScoredAttemptCount ? ` · ${topic.hintedScoredAttemptCount} hinted` : ""}${topic.assistedScoredAttemptCount ? ` · ${topic.assistedScoredAttemptCount} assisted` : ""}${topic.unknownIndependenceScoredAttemptCount ? ` · ${topic.unknownIndependenceScoredAttemptCount} unknown independence` : ""}`; const gap = topic.meanConfidenceGap == null ? "confidence unavailable" : `${Math.round(topic.meanConfidenceGap * 100)}% confidence gap across ${topic.confidenceRatedAttemptCount} rated`; const lastPracticed = topic.lastPracticedAt ? ` · last practiced ${new Date(topic.lastPracticedAt).toLocaleDateString()}` : ""; return <li key={topic.conceptId ?? topic.title}><strong>{topic.title}</strong><span>{outcome}{unscored ? ` · ${unscored} unscored` : ""} · {independence} · {gap}{lastPracticed}</span></li>; })}</ul> : <span>{item.topicTitles.length ? item.topicTitles.join(" · ") : "Topic results unavailable"}</span>}</details><span className="method-progress__track" role="progressbar" aria-label={`${label} recorded check outcomes`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={score}><span style={{ width: `${score}%` }} /></span></li>;
    })}</ul> : <p className="study-method-progress__empty">Your method-by-method signals will appear after you save knowledge checks.</p>}</div></section>
    <section className="pattern-panel"><div className="study-memory__head"><div><p className="section-kicker">Pattern review · this class only</p><h2>Learning patterns</h2></div><button className="button-secondary" type="button" disabled={patternBusy || !progress.some((item) => item.attemptCount)} onClick={() => void reviewPatterns("user-request")}>{patternBusy ? "Reviewing…" : "Review my history"}</button></div><p className="pattern-panel__note">Reviews happen only when you request one or end a study session. They never run in the background or after every answer.</p>{patterns.length ? <div className="pattern-list">{patterns.map((pattern) => <article className="pattern-card" key={pattern.id}><div className="pattern-card__head"><span>{pattern.kind.replaceAll("-", " ")}</span><select aria-label={`Update status for ${pattern.claim}`} value={pattern.status} onChange={(event) => void updatePattern(pattern.id, event.target.value)}><option value="emerging">Emerging</option><option value="reinforced">Reinforced</option><option value="mixed">Mixed evidence</option><option value="weakened">Weakened</option><option value="dismissed">Dismiss</option></select></div><h3>{pattern.claim}</h3><p>{pattern.statusRationale}</p><small>{Math.round(pattern.confidence * 100)}% confidence · supports {pattern.supportingAttemptIds.length} attempt(s) · counterexamples {pattern.counterexampleAttemptIds.length}</small><details className="pattern-evidence"><summary>Inspect attempts</summary>{([["Supporting evidence", pattern.supportingEvidence], ["Counterexamples", pattern.counterexampleEvidence]] as Array<[string, PatternEvidence[]]>).map(([label, evidence]) => <div key={label}><strong>{label}</strong>{evidence.length ? evidence.map((attempt) => <p key={attempt.id}><b>{attempt.conceptTitle} · {attempt.outcome}</b>{attempt.response ? ` — “${attempt.response}”` : " — no written response"}<small>{studyMethodLabel(attempt.method)} · {attempt.confidence == null ? "confidence not recorded" : `${Math.round(attempt.confidence * 100)}% confidence`} · {attempt.hintCount} hint(s)</small></p>) : <p>No attempts linked.</p>}</div>)}</details></article>)}</div> : <p className="pattern-panel__empty">No patterns reviewed yet. Study a topic, then request a review or end that session to create a provisional evidence summary.</p>}</section>
    {content ? <div className="study-columns">
      <div className="study-main">
        <div className="study-session-meta"><span>{content.topic}</span><span>{content.sourceBasis === "general-knowledge" ? "General knowledge · not checked against your course" : sessionSourceTitle ? `Course-grounded · ${sessionSourceTitle}` : "Course-grounded"}</span></div>
        <button className="button-secondary pattern-end-button" type="button" disabled={patternBusy || !saved} onClick={() => void reviewPatterns("session-end")}>{patternBusy ? "Reviewing session…" : "End session and review patterns"}</button>
        <div className="study-tabs" role="tablist" aria-label="Study session">
          <button id="study-tab-lesson" type="button" role="tab" tabIndex={studyTab === "lesson" ? 0 : -1} aria-selected={studyTab === "lesson"} aria-controls="study-panel-lesson" onKeyDown={navigateStudyTabs} onClick={() => selectStudyTab("lesson")}>Lesson</button>
          <button id="study-tab-check" type="button" role="tab" tabIndex={studyTab === "check" ? 0 : -1} aria-selected={studyTab === "check"} aria-controls="study-panel-check" onKeyDown={navigateStudyTabs} onClick={() => selectStudyTab("check")}>Knowledge check</button>
        </div>
        <section className="lesson-card" role="tabpanel" id="study-panel-lesson" aria-labelledby="study-tab-lesson" hidden={studyTab !== "lesson"}>
          <p className="section-kicker">{method === "worked-example" ? "Worked example" : method === "analogy" ? "A helpful analogy" : "Core idea"}</p>
          <h2>{content.topic}</h2><MathText className="lesson-copy" content={content.lesson} />
          {content.example ? <div className="worked-example"><strong>{method === "analogy" ? "Connect it" : "Walkthrough"}</strong><MathText content={content.example} /></div> : null}
          {method === "quiz" ? <p className="quiz-first-note">You started with retrieval. Review the explanation after trying the check.</p> : null}
        </section>
        <section className="check-card" role="tabpanel" id="study-panel-check" aria-labelledby="study-tab-check" hidden={studyTab !== "check"}>
          <div><p className="section-kicker">Quick knowledge check</p><MathText className="check-question" content={content.question} /></div>
          {!saved && !reopenedAttempt && !pendingAttempt.current && content.hints.length ? <div className="study-hints"><div><strong>Need a hint?</strong><small>Hints are counted as part of this attempt.</small></div>{content.hints.slice(0,hintCount).map((hint,index) => <p key={`${index}-${hint}`}><span>Hint {index+1}</span><MathText inline content={hint} /></p>)}{hintCount < content.hints.length ? <button type="button" className="button-secondary" onClick={revealHint}>Show hint {hintCount + 1}</button> : null}</div> : null}
          {reopenedAttempt ? <p className="reopened-attempt-note" role="status">Showing your saved {reopenedAttempt.outcome} response from {new Date(reopenedAttempt.createdAt).toLocaleString()}. Choose “Try this exact question again” below if you want to make another attempt.</p> : null}
          <div className="answer-options" role="group" aria-label="Answer choices">{content.options.map((option,index) => {
            const isCorrect = index === content.answerIndex;
            const className = saved ? selected === index ? isCorrect ? "answer-option answer-option--correct" : "answer-option answer-option--wrong" : isCorrect ? "answer-option answer-option--correct" : "answer-option"
              : selected === index ? "answer-option answer-option--selected" : "answer-option";
            return <button type="button" key={`${index}-${option}`} disabled={saved || savingAttempt || Boolean(reopenedAttempt) || Boolean(pendingAttempt.current)} aria-pressed={selected === index} onClick={() => selectAnswer(index)} className={className}><span>{String.fromCharCode(65+index)}</span><MathText inline content={option} /></button>;
          })}</div>
          {!saved && !reopenedAttempt ? <label className="confidence-input">How confident are you?<select value={confidence} onChange={(event) => updateConfidence(Number(event.target.value))}><option value={0.25}>Low</option><option value={0.5}>Somewhat</option><option value={0.75}>Confident</option><option value={1}>Very confident</option></select></label> : null}
          {!saved && !reopenedAttempt ? <button className="button-primary check-submit" type="button" disabled={selected === null || savingAttempt || busy} onClick={() => void submitAnswer()}>{savingAttempt ? "Saving answer…" : "Check answer"}</button> : null}
          {saved ? <><div className={reviewedAnswerCorrect ? "answer-feedback answer-feedback--good" : "answer-feedback answer-feedback--retry"}><strong>{reviewedAnswerCorrect ? "That's right." : "Not quite yet."}</strong><MathText content={content.feedback} /><small>{`Attempt saved · ${confidenceSummary} · ${displayedHintCount} hint${displayedHintCount === 1 ? "" : "s"}.`}</small></div>{attemptSaveError ? <div className="attempt-save-error" role="alert"><span>Your answer was checked, but it hasn’t been saved to your progress yet: {attemptSaveError}</span><button type="button" className="button-secondary" disabled={savingAttempt} onClick={() => void savePendingAttempt()}>{savingAttempt ? "Retrying…" : "Retry saving attempt"}</button></div> : <div className="study-next-step"><p>{answerFollowUp}</p><button className="button-primary" type="button" disabled={busy} onClick={() => void nextQuestion()}>{busy ? "Preparing…" : "Another question on this concept →"}</button>{shouldReviewLesson ? <button className="button-secondary" type="button" disabled={busy} onClick={() => selectStudyTab("lesson")}>Review the lesson first →</button> : null}{!reviewedAnswerCorrect || (reviewedConfidence ?? 0.5) <= 0.5 || displayedHintCount >= 2 ? <button className="button-secondary" type="button" disabled={busy} onClick={switchToReinforcementMethod}>Switch to {content.method === "worked-example" ? "a clear explanation" : "a worked example"} →</button> : null}<button className="study-retry-link" type="button" onClick={retryCurrentQuestion}>Try this exact question again</button></div>}</> : null}
          <details className="lesson-recap"><summary>Show answer explanation</summary><MathText content={content.feedback} /></details>
        </section>
      </div>
      <aside className="study-chat"><p className="section-kicker">Side chat</p><h2>Clarify a step.</h2><p>Ask a follow-up without losing your place in the lesson.</p><form onSubmit={askClarification}><textarea value={chatQuestion} onChange={(event) => setChatQuestion(event.target.value)} placeholder="Which part should we unpack?" /><button className="button-secondary" disabled={chatBusy || !chatQuestion.trim()}>{chatBusy ? "Thinking…" : "Ask Codex"}</button></form>{chatAnswer ? <div className="chat-answer"><MathText content={chatAnswer.answer} />{chatAnswer.followUp ? <small>{chatAnswer.followUp}</small> : null}<span>{chatAnswer.sourceBasis === "general-knowledge" ? "General knowledge · not course-verified" : "Course-grounded"}</span></div> : <div className="chat-prompt">Try: “Can you explain why that step works?”</div>}<div className="session-recap"><span>Learning method</span><strong>{studyMethodLabel(content.method)}</strong><span>One check does not establish mastery. More evidence builds your profile.</span></div></aside>
    </div> : <div className="study-empty"><span>01</span><div><h2>Your next topic starts here.</h2><p>Try any topic, even if it isn’t in a course yet. Generated topic coverage is useful study support, but not a guarantee of exam coverage.</p></div></div>}
  </main>;
}
