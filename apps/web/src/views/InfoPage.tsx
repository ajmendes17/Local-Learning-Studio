interface InfoPageProps {
  onStart: () => void;
}

const feedbackLoops = [
  {
    number: "01",
    title: "Ground the course",
    input: "Syllabus, notes, readings, assignments",
    result: "A reviewed map of modules, concepts, objectives, and exams",
  },
  {
    number: "02",
    title: "Find the starting point",
    input: "Goals, confidence, conversation, short diagnostics",
    result: "Evidence of what is known, uncertain, or blocked by prerequisites",
  },
  {
    number: "03",
    title: "Teach what is needed",
    input: "Current objective, sources, recent errors, preferences",
    result: "A concise explanation, example, hint, or prerequisite refresher",
  },
  {
    number: "04",
    title: "Practice independently",
    input: "Answers, reasoning, confidence, hint use",
    result: "Specific feedback and proposed evidence—not just right or wrong",
  },
  {
    number: "05",
    title: "Return at the right time",
    input: "Retention, deadlines, weak points, available study time",
    result: "An explainable next activity and delayed-review schedule",
  },
];

const signals = [
  {
    title: "Course truth",
    body: "Source passages, syllabus structure, objectives, and assessment expectations.",
  },
  {
    title: "Demonstrated knowledge",
    body: "Recall, explanations, applications, mistakes, and solution steps.",
  },
  {
    title: "Learning context",
    body: "Goals, deadlines, confidence, preferences, and available time.",
  },
  {
    title: "Durability",
    body: "What can still be recalled later, without escalating hints.",
  },
];

const artifacts = [
  "Course map",
  "Training plan",
  "Focused lesson",
  "Worked example",
  "Practice or quiz",
  "Review recommendation",
];

const sessionSteps = [
  "Confirm the goal and available time.",
  "Begin with one retrieval warm-up.",
  "Teach the smallest missing piece.",
  "Move from guided to independent work.",
  "Give feedback on the learner’s reasoning.",
  "Record evidence and explain what comes next.",
];

export function InfoPage({ onStart }: InfoPageProps) {
  return (
    <main className="info-page">
      <section className="info-hero">
        <div>
          <p className="eyebrow">Product blueprint</p>
          <h1>A learning system that listens, tests, and adapts.</h1>
        </div>
        <div className="info-hero__summary">
          <p>
            Local Learning Studio will use your own course material and your
            demonstrated work to choose the smallest useful next step.
          </p>
          <span>Planned workflow · Built around inspectable evidence</span>
        </div>
      </section>

      <section className="loop-section" aria-labelledby="loop-heading">
        <div className="info-section-heading">
          <div>
            <p className="section-kicker">The core cycle</p>
            <h2 id="loop-heading">Five loops, one continuous model.</h2>
          </div>
          <p>
            Each activity creates evidence for the next. Generated content is
            saved as an artifact; it never becomes a source of course truth.
          </p>
        </div>
        <ol className="feedback-loop">
          {feedbackLoops.map((loop) => (
            <li key={loop.number}>
              <span className="loop-number">{loop.number}</span>
              <div className="loop-copy">
                <h3>{loop.title}</h3>
                <p>
                  <span>Take in</span>
                  {loop.input}
                </p>
                <p>
                  <span>Create</span>
                  {loop.result}
                </p>
              </div>
              <span className="loop-arrow" aria-hidden="true">
                ↓
              </span>
            </li>
          ))}
        </ol>
      </section>

      <section className="evidence-section" aria-labelledby="evidence-heading">
        <div className="info-section-heading">
          <div>
            <p className="section-kicker">What it notices</p>
            <h2 id="evidence-heading">Evidence, not a mystery score.</h2>
          </div>
          <p>
            Mastery will be a readable view over many observations. One answer,
            one conversation, or one self-rating will never settle the question.
          </p>
        </div>
        <div className="signal-grid">
          {signals.map((signal, index) => (
            <article key={signal.title}>
              <span>0{index + 1}</span>
              <h3>{signal.title}</h3>
              <p>{signal.body}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="conversation-section">
        <div className="conversation-copy">
          <p className="section-kicker">Conversation as diagnosis</p>
          <h2>The system asks to understand—not to fill a chat window.</h2>
          <p>
            A useful conversation has a decision behind it. The studio might
            ask you to explain an idea, identify an uncertain step, rate your
            confidence before checking, or say why an incorrect option looked
            plausible.
          </p>
          <p>
            Your words can create evidence and clarify preferences, but they do
            not silently become mastery. The system proposes structured updates
            that can be validated, inspected, and corrected.
          </p>
        </div>
        <div className="conversation-sample" aria-label="Example dialogue">
          <div className="message message--studio">
            <span>Studio</span>
            Which step feels uncertain—and what would you try next?
          </div>
          <div className="message message--learner">
            <span>Learner</span>I know the formula, but I’m not sure why this
            value belongs in the denominator.
          </div>
          <div className="message message--studio">
            <span>Studio</span>
            Good signal. Before I explain, what quantity does the denominator
            represent in your course notes?
          </div>
          <p>
            The response determines whether to hint, explain, revisit a
            prerequisite, or move into practice.
          </p>
        </div>
      </section>

      <section className="artifact-section" aria-labelledby="artifact-heading">
        <div className="artifact-intro">
          <p className="section-kicker">What it creates</p>
          <h2 id="artifact-heading">Durable learning material, built for reuse.</h2>
          <p>
            Artifacts keep their source references, schema version, and
            generation history. Reopening a lesson or plan should not trigger
            another model run.
          </p>
        </div>
        <div className="artifact-list">
          {artifacts.map((artifact, index) => (
            <div key={artifact}>
              <span>{String(index + 1).padStart(2, "0")}</span>
              <strong>{artifact}</strong>
            </div>
          ))}
        </div>
      </section>

      <section className="session-section" aria-labelledby="session-heading">
        <div>
          <p className="section-kicker">A typical session</p>
          <h2 id="session-heading">From intention to retained knowledge.</h2>
        </div>
        <ol>
          {sessionSteps.map((step, index) => (
            <li key={step}>
              <span>{index + 1}</span>
              {step}
            </li>
          ))}
        </ol>
      </section>

      <section className="guardrail-section">
        <div>
          <p className="section-kicker">Non-negotiable boundaries</p>
          <h2>Adaptation stays visible and reversible.</h2>
        </div>
        <ul>
          <li>No fixed “learning style” label</li>
          <li>No mastery from one answer or self-report</li>
          <li>No hidden fallback beyond the course sources</li>
          <li>No full solution before the hint progression</li>
          <li>No state change without validated evidence</li>
          <li>Always inspect, correct, export, and delete your data</li>
        </ul>
      </section>

      <section className="info-cta">
        <p className="eyebrow">Start with the source</p>
        <h2>Every useful loop begins with one class.</h2>
        <button type="button" className="button-primary" onClick={onStart}>
          Open course library
        </button>
      </section>
    </main>
  );
}

