import { useEffect, useState } from "react";
import "../styles/study.css";

type Method = "explanation" | "worked-example" | "quiz" | "analogy";
interface StudyContent {
  sessionId: string; createdAt: string;
  conceptId: string; topic: string; method: Method; sourceBasis: "general-knowledge" | "course-materials";
  lesson: string; example: string; question: string; options: string[]; answerIndex: number; feedback: string; clarification: string; hints: string[];
}
interface SessionSummary { sessionId: string; conceptId: string; topic: string; method: Method; createdAt: string; attemptCount: number; correctCount: number; latestOutcome: string | null }
interface ConceptProgress { id: string; title: string; attemptCount: number; correctCount: number; latestOutcome: string | null; lastPracticedAt: string | null }
interface ChatAnswer { answer: string; followUp: string; sourceBasis: "general-knowledge" | "course-materials" }

async function postJson<T>(path: string, body: unknown): Promise<T> {
  const response = await fetch(path, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error ?? `The local service returned ${response.status}.`);
  return result as T;
}

export function StudyPage({ courseId, courseTitle, onBack }: { courseId: string; courseTitle: string; onBack: () => void }) {
  const [topic, setTopic] = useState("");
  const [method, setMethod] = useState<Method>("explanation");
  const [content, setContent] = useState<StudyContent | null>(null);
  const [selected, setSelected] = useState<number | null>(null);
  const [confidence, setConfidence] = useState(0.5);
  const [hintCount, setHintCount] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  const [chatQuestion, setChatQuestion] = useState("");
  const [chatAnswer, setChatAnswer] = useState<ChatAnswer | null>(null);
  const [chatBusy, setChatBusy] = useState(false);
  const [budgetOpen, setBudgetOpen] = useState(false);
  const [budgetMinutes, setBudgetMinutes] = useState(60);
  const [examAt, setExamAt] = useState("");
  const [budgetTopics, setBudgetTopics] = useState("");
  const [budget, setBudget] = useState<Array<{ topic: string; minutes: number }> | null>(null);
  const [history, setHistory] = useState<SessionSummary[]>([]);
  const [progress, setProgress] = useState<ConceptProgress[]>([]);

  async function refreshClassData() {
    const [historyResponse, profileResponse] = await Promise.all([
      fetch(`/api/courses/${courseId}/learner/study-sessions`),
      fetch(`/api/courses/${courseId}/learner/profile`),
    ]);
    if (historyResponse.ok) setHistory(await historyResponse.json());
    if (profileResponse.ok) setProgress((await profileResponse.json()).concepts);
  }

  useEffect(() => { void refreshClassData().catch(() => undefined); }, [courseId]);

  async function beginStudy(event: React.FormEvent) {
    event.preventDefault();
    if (!topic.trim()) return;
    setBusy(true); setError(""); setContent(null); setSelected(null); setSaved(false); setChatAnswer(null); setHintCount(0);
    try {
      const next = await postJson<StudyContent>(`/api/courses/${courseId}/learner/study-session`, { topic: topic.trim(), method });
      setContent(next);
      void refreshClassData();
    } catch (err) { setError((err as Error).message); }
    finally { setBusy(false); }
  }

  async function answerQuestion(index: number) {
    if (!content || selected !== null) return;
    setSelected(index); setSaved(false);
    try {
      await postJson(`/api/courses/${courseId}/learner/attempts`, {
        conceptId: content.conceptId, activityType: "recognition", prompt: content.question,
        response: content.options[index], reasoning: "", confidence, hintCount,
        method: method === "quiz" ? "retrieval-practice" : method,
        outcome: index === content.answerIndex ? "correct" : "incorrect", sourceRefs: [],
        independence: hintCount > 0 ? "hinted" : "independent", rationale: `${index === content.answerIndex ? "Selected the validated answer key" : "Answer did not match the validated key"}${hintCount ? ` after ${hintCount} hint(s)` : " independently"}; confidence ${Math.round(confidence * 100)}%.`,
      });
      setSaved(true);
      void refreshClassData();
    } catch (err) { setError(`Your answer was checked, but could not be saved: ${(err as Error).message}`); }
  }

  async function nextQuestion() {
    if (!content) return;
    setBusy(true); setError("");
    try {
      const next = await postJson<StudyContent>(`/api/courses/${courseId}/learner/study-sessions/${content.sessionId}/next-question`, {});
      setContent(next); setSelected(null); setSaved(false); setHintCount(0); setConfidence(0.5); setChatAnswer(null);
      void refreshClassData();
    } catch (err) { setError((err as Error).message); }
    finally { setBusy(false); }
  }

  function retryCurrentQuestion() {
    setSelected(null); setSaved(false); setHintCount(0); setChatAnswer(null);
  }

  async function reopenSession(sessionId: string) {
    setBusy(true); setError(""); setSelected(null); setSaved(false); setChatAnswer(null); setHintCount(0); setConfidence(0.5);
    try {
      const response = await fetch(`/api/courses/${courseId}/learner/study-sessions/${sessionId}`);
      const value = await response.json();
      if (!response.ok) throw new Error(value.error ?? "Could not reopen this lesson.");
      setContent(value as StudyContent); setTopic(value.topic); setMethod(value.method);
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

  function makeBudget(event: React.FormEvent) {
    event.preventDefault();
    const topics = budgetTopics.split(/\n|,/).map((item) => item.trim()).filter(Boolean);
    if (!topics.length) return;
    const weights = topics.map((item) => item.toLowerCase().includes("weak") ? 1.5 : 1);
    const totalWeight = weights.reduce((sum, item) => sum + item, 0);
    const allocations = topics.map((item, index) => ({ topic: item, minutes: Math.max(5, Math.floor(budgetMinutes * weights[index]! / totalWeight)) }));
    setBudget(allocations);
    void postJson(`/api/courses/${courseId}/learner/assessments`, {
      title: `${topic || "Study"} preparation`, kind: "exam", scheduledAt: examAt ? new Date(examAt).toISOString() : null,
      availableMinutes: budgetMinutes, topics: topics.map((title) => ({ title, importance: "normal", provenance: "learner" })),
    }).catch((err) => setError((err as Error).message));
  }

  return <main className="study-page">
    <button className="back-link" type="button" onClick={onBack}>← {courseTitle}</button><header className="study-heading"><div><p className="eyebrow">{courseTitle} · class study space</p><h1>Learn something now.</h1><p>This class has its own topics and learning history. Pick a topic and approach, ask questions, and add a schedule only if you want one.</p></div><button className="button-secondary" type="button" onClick={() => setBudgetOpen((open) => !open)}>{budgetOpen ? "Close time budget" : "Plan my time (optional)"}</button></header>
    <form className="study-start" onSubmit={beginStudy}><label htmlFor="study-topic">What would you like to understand?</label><div className="study-start__row"><input id="study-topic" value={topic} onChange={(event) => setTopic(event.target.value)} placeholder="e.g. Bayes' theorem, recursion, quantum measurement" /><button className="button-primary" disabled={busy || !topic.trim()}>{busy ? "Preparing…" : "Start learning →"}</button></div><div className="study-methods" aria-label="Choose a learning approach">{([ ["explanation", "Clear explanation"], ["worked-example", "Worked example"], ["quiz", "Quiz first"], ["analogy", "Use an analogy"] ] as Array<[Method,string]>).map(([value,label]) => <button type="button" key={value} className={method === value ? "study-method study-method--active" : "study-method"} onClick={() => setMethod(value)}>{label}</button>)}</div><small>No notes required. Without course materials, explanations use general knowledge and are marked as not course-verified.</small></form>
    {error ? <div className="error-banner">{error}</div> : null}
    {budgetOpen ? <section className="budget-panel"><div><p className="section-kicker">Optional time budget</p><h2>Make room for every topic.</h2><p>We’ll split the minutes you have across the topics you list. You can still study directly without creating a plan.</p></div><form onSubmit={makeBudget}><label>Exam or quiz time<input type="datetime-local" value={examAt} onChange={(event) => setExamAt(event.target.value)} /></label><label>Available study minutes<input type="number" min="5" max="1440" value={budgetMinutes} onChange={(event) => setBudgetMinutes(Number(event.target.value))} /></label><label className="budget-topics">Topics, one per line<textarea value={budgetTopics} onChange={(event) => setBudgetTopics(event.target.value)} placeholder="Bayes' theorem\nConditional probability\nDistributions" /></label><button className="button-primary">Build optional budget</button>{budget ? <div className="budget-result">{budget.map((item) => <p key={item.topic}><strong>{item.topic}</strong><span>{item.minutes} min</span></p>)}</div> : null}</form></section> : null}
    <section className="study-memory"><div className="study-memory__head"><div><p className="section-kicker">This class</p><h2>Your learning trail</h2></div><span>Evidence builds over time; one correct answer does not establish mastery.</span></div><div className="study-memory__grid"><div className="study-memory__progress"><strong>Topic signals</strong>{progress.length ? progress.map((item) => <div className="progress-row" key={item.id}><span>{item.title}</span><small>{item.correctCount}/{item.attemptCount} correct{item.latestOutcome ? ` · latest ${item.latestOutcome}` : " · not checked yet"}</small></div>) : <p>Saved class progress will appear here as you study.</p>}</div><div className="study-memory__history"><strong>Recent lessons</strong>{history.length ? history.slice(0,5).map((item) => <button type="button" key={item.sessionId} onClick={() => void reopenSession(item.sessionId)}><span>{item.topic}</span><small>{item.method.replaceAll("-", " ")} · {item.attemptCount} checks · {new Date(item.createdAt).toLocaleDateString()}</small></button>) : <p>Your generated lessons will be saved here for later.</p>}</div></div></section>
    {content ? <div className="study-columns"><div className="study-main"><div className="study-session-meta"><span>{content.topic}</span><span>{content.sourceBasis === "general-knowledge" ? "General knowledge · not checked against your course" : "Course-grounded"}</span></div><section className="lesson-card"><p className="section-kicker">{method === "quiz" ? "Start with retrieval" : method === "worked-example" ? "Worked example" : method === "analogy" ? "A helpful analogy" : "Core idea"}</p><h2>{content.topic}</h2><p className="lesson-copy">{content.lesson}</p>{content.example ? <div className="worked-example"><strong>{method === "analogy" ? "Connect it" : "Walkthrough"}</strong><p>{content.example}</p></div> : null}</section><section className="check-card"><div><p className="section-kicker">Quick knowledge check</p><h2>{content.question}</h2></div>{selected === null && content.hints.length ? <div className="study-hints"><div><strong>Need a hint?</strong><small>Hints are counted as part of this attempt.</small></div>{content.hints.slice(0,hintCount).map((hint,index) => <p key={`${index}-${hint}`}><span>Hint {index+1}</span>{hint}</p>)}{hintCount < content.hints.length ? <button type="button" className="button-secondary" onClick={() => setHintCount((count) => count + 1)}>Show hint {hintCount + 1}</button> : null}</div> : null}<div className="answer-options">{content.options.map((option,index) => <button type="button" key={option} disabled={selected !== null || busy} onClick={() => void answerQuestion(index)} className={selected === index ? index === content.answerIndex ? "answer-option answer-option--correct" : "answer-option answer-option--wrong" : selected !== null && index === content.answerIndex ? "answer-option answer-option--correct" : "answer-option"}><span>{String.fromCharCode(65+index)}</span>{option}</button>)}</div>{selected === null ? <label className="confidence-input">How confident are you?<select value={confidence} onChange={(event) => setConfidence(Number(event.target.value))}><option value={0.25}>Low</option><option value={0.5}>Somewhat</option><option value={0.75}>Confident</option><option value={1}>Very confident</option></select></label> : <><div className={selected === content.answerIndex ? "answer-feedback answer-feedback--good" : "answer-feedback answer-feedback--retry"}><strong>{selected === content.answerIndex ? "That's right." : "Not quite yet."}</strong><p>{content.feedback}</p><small>{saved ? `Attempt saved · confidence ${Math.round(confidence * 100)}% · ${hintCount} hint${hintCount === 1 ? "" : "s"}.` : "Saving your attempt…"}</small></div>{saved ? <div className="study-next-step"><p>{selected !== content.answerIndex ? "Let’s reinforce this concept with a fresh question." : confidence <= 0.5 ? "Correct with lower confidence; a new version can help check the idea." : "Ready to strengthen this concept or move on?"}</p><button className="button-primary" type="button" disabled={busy} onClick={() => void nextQuestion()}>{busy ? "Preparing…" : "Another question on this concept →"}</button><button className="study-retry-link" type="button" onClick={retryCurrentQuestion}>Try this exact question again</button></div> : null}</>}</section><details className="lesson-recap"><summary>Show answer explanation</summary><p>{content.feedback}</p></details></div><aside className="study-chat"><p className="section-kicker">Side chat</p><h2>Clarify a step.</h2><p>Ask a follow-up without losing your place in the lesson.</p><form onSubmit={askClarification}><textarea value={chatQuestion} onChange={(event) => setChatQuestion(event.target.value)} placeholder="Which part should we unpack?" /><button className="button-secondary" disabled={chatBusy || !chatQuestion.trim()}>{chatBusy ? "Thinking…" : "Ask Codex"}</button></form>{chatAnswer ? <div className="chat-answer"><p>{chatAnswer.answer}</p>{chatAnswer.followUp ? <small>{chatAnswer.followUp}</small> : null}<span>{chatAnswer.sourceBasis === "general-knowledge" ? "General knowledge · not course-verified" : "Course-grounded"}</span></div> : <div className="chat-prompt">Try: “Can you explain why that step works?”</div>}<div className="session-recap"><span>Learning method</span><strong>{method.replaceAll("-", " ")}</strong><span>One check does not establish mastery. More evidence builds your profile.</span></div></aside></div> : <div className="study-empty"><span>01</span><div><h2>Your next topic starts here.</h2><p>Try any topic, even if it isn’t in a course yet. Generated topic coverage is useful study support, but not a guarantee of exam coverage.</p></div></div>}
  </main>;
}
