const concepts = [
  { title: "Bayesian inference", course: "Probability & Statistics", state: "Building", color: "amber", detail: "Can explain priors and likelihoods; posterior updates need more practice.", progress: 62 },
  { title: "Recursive definitions", course: "Programming Languages", state: "Steady", color: "green", detail: "Explains base and recursive cases clearly; test transfer to tree structures.", progress: 82 },
  { title: "Persistent trees", course: "Programming Languages", state: "Uncertain", color: "blue", detail: "The idea is familiar; insertion and balancing are not yet checked.", progress: 38 },
  { title: "Quantum measurement", course: "Quantum Mechanics", state: "Needs evidence", color: "rose", detail: "Added from course context. No learning evidence recorded yet.", progress: 0 },
];

const methods = [
  { name: "Worked example → solo attempt", label: "Promising", note: "You reported that solving one independently after seeing a worked solution made the steps easier to recall.", tag: "Your reflection · 2 sessions" },
  { name: "Retrieval practice", label: "Keep observing", note: "Short closed-book explanations have helped surface gaps. Delayed recall evidence is still limited.", tag: "Early signal · 3 attempts" },
];

export function KnowledgePage() {
  return (
    <main className="knowledge-page">
      <section className="knowledge-hero">
        <div className="knowledge-hero__copy">
          <p className="eyebrow">Your learning profile · Preview</p>
          <h1>Knowledge grows<br />through connections.</h1>
          <p>A living map of what feels solid, what needs another pass, and the ways of studying that seem to help you.</p>
        </div>
        <div className="knowledge-summary" aria-label="Knowledge profile overview">
          <div><span className="summary-number">12</span><span>concepts mapped</span></div>
          <div><span className="summary-number">4</span><span>need another look</span></div>
          <div><span className="summary-number">3</span><span>methods observed</span></div>
          <p>Personal view · Evidence and confidence stay visible</p>
        </div>
      </section>

      <section className="knowledge-layout" aria-label="Knowledge tree and learning methods">
        <div className="knowledge-main-column">
          <section className="knowledge-panel tree-panel">
            <div className="knowledge-panel__heading">
              <div><p className="section-kicker">Across your courses</p><h2>Knowledge tree</h2></div>
              <button className="button-secondary" type="button">Explore all concepts <span aria-hidden="true">↗</span></button>
            </div>
            <div className="tree-map">
              <div className="tree-course-label"><span className="tree-course-dot tree-course-dot--plum" />Programming Languages <span>2 concepts</span></div>
              <div className="tree-branch">
                <article className="concept-node concept-node--green"><div className="concept-node__top"><span>FOUNDATION</span><span className="concept-state">Steady</span></div><h3>Recursive definitions</h3><p>Build a problem from a stopping case and a smaller case.</p><div className="concept-node__footer"><span>2 practice sessions</span><span>82%</span></div><div className="progress-track"><span style={{ width: "82%" }} /></div></article>
                <span className="tree-connector" aria-hidden="true">↳</span>
                <article className="concept-node concept-node--blue"><div className="concept-node__top"><span>CONNECTED IDEA</span><span className="concept-state">Uncertain</span></div><h3>Persistent trees</h3><p>Understand sharing; insertion and balancing need a fresh attempt.</p><div className="concept-node__footer"><span>1 guided example</span><span>38%</span></div><div className="progress-track"><span style={{ width: "38%" }} /></div></article>
              </div>
              <div className="tree-course-label"><span className="tree-course-dot tree-course-dot--ochre" />Probability &amp; Statistics <span>1 concept</span></div>
              <article className="concept-node concept-node--amber concept-node--wide"><div className="concept-node__top"><span>IN PROGRESS</span><span className="concept-state">Building</span></div><h3>Bayesian inference</h3><p>Connect prior belief and new evidence to update a probability. You can describe the ingredients; interpreting the resulting posterior is the next useful check.</p><div className="concept-node__footer"><span>Quiz + your reflection</span><span>62%</span></div><div className="progress-track"><span style={{ width: "62%" }} /></div></article>
              <div className="tree-course-label"><span className="tree-course-dot tree-course-dot--rose" />Quantum Mechanics <span>new area</span></div>
              <article className="concept-node concept-node--rose concept-node--wide"><div className="concept-node__top"><span>NOT ASSESSED YET</span><span className="concept-state">Needs evidence</span></div><h3>Quantum measurement</h3><p>Present in your course map, but there is not enough practice evidence to estimate how well it is known.</p><div className="concept-node__footer"><span>Start with a short diagnostic</span><span>—</span></div><div className="progress-track"><span style={{ width: "0%" }} /></div></article>
              <div className="tree-legend"><span><i className="legend-dot legend-dot--solid" />Evidence of recall</span><span><i className="legend-dot legend-dot--building" />Developing</span><span><i className="legend-dot legend-dot--empty" />Not assessed</span></div>
            </div>
          </section>

          <section className="knowledge-panel methods-panel">
            <div className="knowledge-panel__heading"><div><p className="section-kicker">Personal learning signals</p><h2>What helps you learn</h2></div><span className="soft-badge">Provisional · based on your sessions</span></div>
            <div className="method-list">{methods.map((method, index) => <article className="method-row" key={method.name}><span className="method-index">0{index + 1}</span><div className="method-copy"><div className="method-title"><h3>{method.name}</h3><span>{method.label}</span></div><p>{method.note}</p><small>{method.tag}</small></div><span className="method-arrow" aria-hidden="true">↗</span></article>)}</div>
            <p className="profile-note">These are early observations, not fixed learning-style labels. Your results can differ by topic and over time.</p>
          </section>
        </div>

        <aside className="knowledge-side-column">
          <section className="next-step-card"><p className="section-kicker">A useful next step</p><span className="next-step-number">01</span><h2>Try one persistent-tree insertion on your own.</h2><p>It will show whether the recursive idea transfers when the structure changes.</p><button className="button-primary" type="button">Start a quick practice <span aria-hidden="true">→</span></button><small>About 8 minutes · No grade attached</small></section>
          <section className="obsidian-card"><div className="obsidian-mark" aria-hidden="true">◈</div><p className="section-kicker">Your notes, connected</p><h2>Knowledge tree in Obsidian</h2><p>Concept notes, course links, and learning reflections will come together in your vault.</p><div className="obsidian-status"><span className="status-dot" />Vault connection not set up</div><button className="button-secondary" type="button">Set up Obsidian</button><small>Your vault stays yours. Sync settings come next.</small></section>
          <section className="profile-activity"><p className="section-kicker">Recent signal</p><div className="activity-glyph">↗</div><p><strong>Confidence matched your explanation</strong><br />On recursive definitions, you rated confidence as medium and explained both cases correctly.</p><span>Programming Languages · recent practice</span></section>
        </aside>
      </section>

      <section className="concept-directory"><div><p className="section-kicker">Your map at a glance</p><h2>Every concept has a story.</h2></div><p>Each state links to attempts, source material, your confidence, and the reason for its current status.</p><div className="concept-strip">{concepts.map((concept) => <div className={`concept-chip concept-chip--${concept.color}`} key={concept.title}><span>{concept.state}</span><strong>{concept.title}</strong><small>{concept.course}</small><p>{concept.detail}</p></div>)}</div></section>
      <footer className="knowledge-footer"><span>LOCAL LEARNING STUDIO</span><span>Knowledge belongs to you.</span><span>Personal profile · Preview</span></footer>
    </main>
  );
}
