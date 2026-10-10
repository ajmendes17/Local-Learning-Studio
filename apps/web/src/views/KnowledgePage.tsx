import type { CourseSummary, LearnerMethodProgressResponse, LearnerProfileResponse } from "@local-learning-studio/contracts";

type CourseKnowledge = { course: CourseSummary; profile: LearnerProfileResponse; methods: LearnerMethodProgressResponse; courseMap: import("@local-learning-studio/contracts").CourseMapArtifact | null };

interface KnowledgePageProps {
  profiles: CourseKnowledge[];
  loading: boolean;
  error: string | null;
  onOpenCourse: (courseId: string) => void;
  onStudyTopic: (courseId: string, topic: string, assessmentId?: string) => void;
}

function activityLabel(attemptCount: number, sessionCount: number) {
  if (attemptCount) return `${attemptCount} saved attempt${attemptCount === 1 ? "" : "s"}`;
  if (sessionCount) return `${sessionCount} lesson${sessionCount === 1 ? "" : "s"} · no check yet`;
  return "No practice yet";
}

function topicState(topic: LearnerProfileResponse["concepts"][number]) {
  if (!topic.attemptCount) return topic.sessionCount ? "Lesson studied" : "Not started";
  if (!topic.scoredAttemptCount) return "Recall recorded · not graded";
  if (topic.latestOutcome === "incorrect") return "Needs another pass";
  if (topic.latestOutcome === "correct" && topic.scoredAttemptCount >= 3 && topic.correctCount / topic.scoredAttemptCount >= 0.8) return "Consistent so far";
  return "Building evidence";
}

function methodLabel(method: string) {
  return method.split("-").map((part) => part ? `${part[0]!.toUpperCase()}${part.slice(1)}` : part).join(" ");
}

export function KnowledgePage({ profiles, loading, error, onOpenCourse, onStudyTopic }: KnowledgePageProps) {
  const concepts = profiles.flatMap(({ course, profile, courseMap }) => {
    const evidenceByTitle = new Map(profile.concepts.map((concept) => [concept.title.trim().normalize("NFKC").toLocaleLowerCase(), concept]));
    const mapped = courseMap?.payload.concepts.map((concept) => ({
      id: concept.key,
      stableKey: concept.key,
      title: concept.title,
      description: concept.description,
      attemptCount: 0,
      scoredAttemptCount: 0,
      correctCount: 0,
      independentScoredAttemptCount: 0,
      independentCorrectCount: 0,
      latestOutcome: null,
      lastPracticedAt: null,
      sessionCount: 0,
      lastSessionAt: null,
    })) ?? [];
    const mappedTitles = new Set(mapped.map((concept) => concept.title.trim().normalize("NFKC").toLocaleLowerCase()));
    const combined = [
      ...mapped.map((concept) => ({ ...concept, ...evidenceByTitle.get(concept.title.trim().normalize("NFKC").toLocaleLowerCase()), title: concept.title, description: concept.description })),
      ...profile.concepts.filter((concept) => !mappedTitles.has(concept.title.trim().normalize("NFKC").toLocaleLowerCase())),
    ];
    return combined.map((concept) => ({ course, concept }));
  });
  const assessments = profiles.flatMap(({ course, profile }) => profile.assessments.map((assessment) => ({ course, assessment })));
  const practiced = concepts.filter(({ concept }) => concept.attemptCount || concept.sessionCount).length;
  const checked = concepts.filter(({ concept }) => concept.attemptCount > 0).length;
  const needsReview = concepts.filter(({ concept }) => concept.latestOutcome === "incorrect").length;
  const methods = profiles.flatMap(({ course, methods: rows }) => rows.map((row) => ({ course, row })))
    .filter(({ row }) => row.attemptCount > 0)
    .sort((a, b) => b.row.scoredAttemptCount - a.row.scoredAttemptCount || b.row.attemptCount - a.row.attemptCount);
  const conceptsByCourse = new Map<string, typeof concepts[number]["concept"][]>();
  for (const entry of concepts) conceptsByCourse.set(entry.course.id, [...(conceptsByCourse.get(entry.course.id) ?? []), entry.concept]);

  return (
    <main className="knowledge-page knowledge-page--live">
      <section className="knowledge-hero">
        <div className="knowledge-hero__copy">
          <p className="eyebrow">Your learning profile · Saved evidence</p>
          <h1>Knowledge grows<br />through practice.</h1>
          <p>A cross-course view of lessons, checks, and study approaches recorded in your local workspace.</p>
        </div>
        <div className="knowledge-summary" aria-label="Knowledge profile overview">
          <div><span className="summary-number">{profiles.length}</span><span>classes</span></div>
          <div><span className="summary-number">{practiced}/{concepts.length}</span><span>topics practiced</span></div>
          <div><span className="summary-number">{needsReview}</span><span>latest checks missed</span></div>
          <p>Counts describe recorded activity, not mastery or exam readiness.</p>
        </div>
      </section>

      {error ? <p className="knowledge-feedback" role="alert">{error}</p> : null}
      {loading ? <p className="knowledge-feedback" role="status">Loading saved course evidence…</p> : null}

      <section className="knowledge-layout" aria-label="Cross-course topic and method evidence">
        <div className="knowledge-main-column">
          <section className="knowledge-panel tree-panel">
            <div className="knowledge-panel__heading">
              <div><p className="section-kicker">Across your courses</p><h2>Topic evidence</h2></div>
              <span className="soft-badge">{checked} {checked === 1 ? "topic" : "topics"} with saved attempts</span>
            </div>
            {!concepts.length && !loading ? <div className="knowledge-empty"><h3>No mapped topics yet</h3><p>Build or accept a course map, then study its topics. You can also start a topic from any course’s Study page.</p></div> : null}
            {profiles.map(({ course }) => {
              const courseConcepts = conceptsByCourse.get(course.id) ?? [];
              return <section className="knowledge-course-group" key={course.id}>
                <div className="tree-course-label"><span className="tree-course-dot" />{course.code ? `${course.code} · ` : ""}{course.title}<span>{courseConcepts.length} {courseConcepts.length === 1 ? "topic" : "topics"}</span></div>
                {courseConcepts.length ? <div className="knowledge-topic-list">{courseConcepts.map((concept) => {
                  const percent = concept.scoredAttemptCount ? Math.round(concept.correctCount / concept.scoredAttemptCount * 100) : 0;
                  const evidence = concept.scoredAttemptCount
                    ? `${concept.correctCount}/${concept.scoredAttemptCount} scored correct · ${concept.attemptCount - concept.scoredAttemptCount} ungraded`
                    : concept.attemptCount ? `${concept.attemptCount} ungraded recall response${concept.attemptCount === 1 ? "" : "s"}` : activityLabel(concept.attemptCount, concept.sessionCount);
                  return <article className="knowledge-topic" key={concept.id}>
                    <div className="knowledge-topic__heading"><div><span className="knowledge-topic__state">{topicState(concept)}</span><h3>{concept.title}</h3></div><span className="knowledge-topic__activity">{activityLabel(concept.attemptCount, concept.sessionCount)}</span></div>
                    <p>{concept.description || "This topic is in your course map. Study it to build evidence about what you can recall."}</p>
                    <div className="knowledge-topic__meter"><div><span>{evidence}</span><span>{concept.scoredAttemptCount ? `${percent}%` : "—"}</span></div><span className="progress-track" role="progressbar" aria-label={`${concept.title} scored check accuracy`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent}><span style={{ width: `${percent}%` }} /></span></div>
                    <div className="knowledge-topic__actions"><button type="button" className="button-primary" onClick={() => onStudyTopic(course.id, concept.title)}>Study topic →</button><button type="button" className="button-secondary" onClick={() => onOpenCourse(course.id)}>Open class</button>{concept.lastPracticedAt ? <small>Last check {new Date(concept.lastPracticedAt).toLocaleDateString()}</small> : concept.lastSessionAt ? <small>Last lesson {new Date(concept.lastSessionAt).toLocaleDateString()}</small> : null}</div>
                  </article>;
                })}</div> : <p className="knowledge-empty knowledge-empty--compact">No course-map topics yet. <button type="button" onClick={() => onOpenCourse(course.id)}>Open class to build its map →</button></p>}
              </section>
            })}
          </section>

          <section className="knowledge-panel methods-panel">
            <div className="knowledge-panel__heading"><div><p className="section-kicker">Observed study activity</p><h2>Practice by approach</h2></div><span className="soft-badge">Descriptive · not a learning-style diagnosis</span></div>
            {!methods.length ? <p className="knowledge-empty">Method comparisons will appear after you save knowledge checks in a course.</p> : <div className="knowledge-method-list">{methods.map(({ course, row }) => {
              const accuracy = row.scoredAttemptCount ? Math.round(row.correctCount / row.scoredAttemptCount * 100) : null;
              const independent = row.independentScoredAttemptCount ? Math.round(row.independentCorrectCount / row.independentScoredAttemptCount * 100) : null;
              return <article className="knowledge-method" key={`${course.id}:${row.method}`}><div><h3>{methodLabel(row.method)}</h3><span>{course.code || course.title}</span></div><p>{row.scoredAttemptCount ? `${row.correctCount}/${row.scoredAttemptCount} scored checks correct` : `${row.attemptCount} saved response${row.attemptCount === 1 ? "" : "s"} · not graded`}{row.topicCount ? ` · ${row.topicCount} topic${row.topicCount === 1 ? "" : "s"}` : ""}</p><div className="knowledge-method__scores">{accuracy == null ? <small>No scored outcome yet</small> : <span>All scored <strong>{accuracy}%</strong></span>}{independent == null ? <small>No independent check yet</small> : <span>Independent <strong>{independent}%</strong></span>}{row.scoredAttemptCount < 5 ? <small>Early sample · compare cautiously</small> : null}</div></article>;
            })}</div>}
          </section>
        </div>

        <aside className="knowledge-side-column">
          <section className="next-step-card"><p className="section-kicker">A useful next step</p><span className="next-step-number">{String(Math.max(1, needsReview + 1)).padStart(2, "0")}</span><h2>{needsReview ? "Revisit a topic after a missed check." : checked ? "Try a delayed independent check." : "Start with one topic from a class."}</h2><p>{needsReview ? "A missed answer is a useful signal. Work through the idea, then try another question when ready." : "A fresh closed-book attempt can show what comes back without hints or notes."}</p>{concepts.length ? <button className="button-primary" type="button" onClick={() => {
            const candidate = concepts.find(({ concept }) => concept.latestOutcome === "incorrect")
              ?? (checked ? concepts.find(({ concept }) => concept.scoredAttemptCount > 0) ?? concepts.find(({ concept }) => concept.attemptCount > 0) : concepts.find(({ concept }) => concept.attemptCount === 0))
              ?? concepts[0]!;
            onStudyTopic(candidate.course.id, candidate.concept.title);
          }}>Study a suggested topic <span aria-hidden="true">→</span></button> : <button className="button-primary" type="button" onClick={() => onOpenCourse(profiles[0]?.course.id ?? "") } disabled={!profiles.length}>Open a class <span aria-hidden="true">→</span></button>}<small>Suggestions follow recent evidence; they are not predictions of exam performance.</small></section>

          <section className="knowledge-panel knowledge-assessments"><div className="knowledge-panel__heading"><div><p className="section-kicker">Instructor scope</p><h2>Exam topic lists</h2></div></div>{assessments.length ? assessments.map(({ course, assessment }) => <article className="knowledge-assessment" key={assessment.id}><div><strong>{assessment.title}</strong><span>{course.code || course.title} · {assessment.topics.length} supplied {assessment.topics.length === 1 ? "topic" : "topics"}</span></div><p>{assessment.scoredAttemptCount ? `${assessment.correctCount}/${assessment.scoredAttemptCount} scored checks correct` : assessment.attemptCount ? `${assessment.attemptCount} saved, ungraded responses` : "No practice recorded yet"}</p><div className="knowledge-assessment__topics">{assessment.topics.slice(0, 5).map((topic) => <button type="button" key={topic.id} onClick={() => onStudyTopic(course.id, topic.title, assessment.id)}>{topic.importance === "high" ? "★ " : ""}{topic.title}<span>{topic.scoredAttemptCount ? `${topic.correctCount}/${topic.scoredAttemptCount}` : topic.attemptCount ? "Ungraded" : "Not started"}</span></button>)}{assessment.topics.length > 5 ? <small>+ {assessment.topics.length - 5} more topics</small> : null}</div><button className="button-secondary" type="button" onClick={() => onOpenCourse(course.id)}>Manage topic wording →</button></article>) : <p className="knowledge-empty">Paste the instructor’s exam or quiz topic list on a class Study page. Its original wording and topic-level progress will show here.</p>}</section>

          <section className="obsidian-card"><div className="obsidian-mark" aria-hidden="true">◈</div><p className="section-kicker">Your notes, connected</p><h2>Local Obsidian brain</h2><p>Course notes are generated from your saved maps, sources, and study history. Export or refresh them from each class page.</p><div className="obsidian-status"><span className="status-dot" />Course exports stay under your vault settings</div></section>
        </aside>
      </section>
      <footer className="knowledge-footer"><span>LOCAL LEARNING STUDIO</span><span>Counts reflect recorded activity.</span><span>Private · Saved locally</span></footer>
    </main>
  );
}
