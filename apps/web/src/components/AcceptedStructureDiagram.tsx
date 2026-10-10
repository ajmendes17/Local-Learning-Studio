import { useLayoutEffect, useMemo, useRef, useState } from "react";
import { recommendNextStudyTopic, summarizeStudyCoverage, type CourseMapProposal, type CourseMaterial, type LearnerProfileResponse } from "@local-learning-studio/contracts";
import { MathText } from "./MathText";
import { describePractice, practiceReviewMethod } from "../lib/study-progress";

interface AcceptedStructureDiagramProps {
  proposal: CourseMapProposal;
  materials: CourseMaterial[];
  learnerProgress: LearnerProfileResponse["concepts"];
  sourceProgress: LearnerProfileResponse["sources"];
  learnerAssessments?: LearnerProfileResponse["assessments"];
  onStudyTopic: (topic: string, sourceMaterialId?: string, assessmentId?: string, method?: "quiz") => void;
}

interface ModuleConnection {
  assessmentIndex: number;
  moduleKey: string;
  type: "evidence" | "module";
}

function referenceKey(reference: { materialId: string; passageId: string }) {
  return `${reference.materialId}:${reference.passageId}`;
}

function topicKey(title: string) {
  return title.trim().normalize("NFKC").toLocaleLowerCase();
}

function CategoryProgress({ label, coverage }: { label: string; coverage: ReturnType<typeof summarizeStudyCoverage> }) {
  const lessonPercent = coverage.topicCount ? Math.round(coverage.lessonTopicCount / coverage.topicCount * 100) : 0;
  const checkPercent = coverage.topicCount ? Math.round(coverage.checkedTopicCount / coverage.topicCount * 100) : 0;
  const independentPercent = coverage.topicCount ? Math.round(coverage.independentlyCheckedTopicCount / coverage.topicCount * 100) : 0;
  const accuracyPercent = coverage.scoredAttemptCount ? Math.round(coverage.correctCount / coverage.scoredAttemptCount * 100) : 0;
  return <div className="accepted-map__category-progress" aria-label={`${label} progress`}>
    <p className="accepted-map__category-focus">{coverage.reviewTopicCount ? `${coverage.reviewTopicCount} need review` : "No topics flagged for review"} · {coverage.uncheckedTopicCount} without a check</p>
    <div><span className="accepted-map__category-progress-heading"><small>Lessons</small><small>{coverage.lessonTopicCount}/{coverage.topicCount} topics</small></span><span className="accepted-map__progress-track" role="progressbar" aria-label={`${label} lesson coverage`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={lessonPercent}><span style={{ width: `${lessonPercent}%` }} /></span></div>
    <div><span className="accepted-map__category-progress-heading"><small>Knowledge checks</small><small>{coverage.checkedTopicCount}/{coverage.topicCount} topics · {coverage.scoredAttemptCount ? `${coverage.correctCount}/${coverage.scoredAttemptCount} scored correct` : "no scored checks yet"}{coverage.attemptCount > coverage.scoredAttemptCount ? ` · ${coverage.attemptCount - coverage.scoredAttemptCount} unscored` : ""}</small></span><span className="accepted-map__progress-track accepted-map__progress-track--checked" role="progressbar" aria-label={`${label} knowledge check coverage`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={checkPercent}><span style={{ width: `${checkPercent}%` }} /></span></div>
    <div><span className="accepted-map__category-progress-heading"><small>Independent checks</small><small>{coverage.independentlyCheckedTopicCount}/{coverage.topicCount} topics · {coverage.independentScoredAttemptCount ? `${coverage.independentCorrectCount}/${coverage.independentScoredAttemptCount} correct independently` : "no independent checks yet"}</small></span><span className="accepted-map__progress-track accepted-map__progress-track--independent" role="progressbar" aria-label={`${label} independent check coverage`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={independentPercent}><span style={{ width: `${independentPercent}%` }} /></span></div>
    {coverage.scoredAttemptCount ? <div><span className="accepted-map__category-progress-heading"><small>Recorded answer accuracy</small><small>{accuracyPercent}% · {coverage.correctCount}/{coverage.scoredAttemptCount} scored</small></span><span className="accepted-map__progress-track accepted-map__progress-track--accuracy" role="progressbar" aria-label={`${label} recorded answer accuracy`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={accuracyPercent}><span style={{ width: `${accuracyPercent}%` }} /></span></div> : null}
  </div>;
}

export function AcceptedStructureDiagram({ proposal, materials, learnerProgress, sourceProgress, learnerAssessments = [], onStudyTopic }: AcceptedStructureDiagramProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const [paths, setPaths] = useState<Array<{ id: string; d: string; type: ModuleConnection["type"]; moduleKey: string; assessmentIndex: number }>>([]);
  const [selectedModuleKey, setSelectedModuleKey] = useState<string | null>(null);
  const [selectedAssessmentIndex, setSelectedAssessmentIndex] = useState<number | null>(null);
  const [selectedHomeworkMaterialId, setSelectedHomeworkMaterialId] = useState<string | null>(null);
  const orderedModules = useMemo(() => [...proposal.modules].sort((a, b) => a.position - b.position), [proposal.modules]);
  const unrepresentedExamScopes = learnerAssessments.filter((assessment) => assessment.kind === "exam" && assessment.topics.length > 0 && !proposal.assessments.some((item) => (item.kind === "major-exam" || /exam|midterm|final/i.test(item.title)) && item.title.trim().toLocaleLowerCase() === assessment.title.trim().toLocaleLowerCase()));
  const conceptsByKey = useMemo(() => new Map(proposal.concepts.map((concept) => [concept.key, concept])), [proposal.concepts]);
  const selectedModule = orderedModules.find(({ key }) => key === selectedModuleKey) ?? null;
  const progressByTitle = useMemo(() => new Map(learnerProgress.map((item) => [topicKey(item.title), item])), [learnerProgress]);
  const moduleConnections = useMemo(() => {
    const links: ModuleConnection[] = [];
    const assignmentMaterialIds = new Set(materials.filter((material) =>
      material.kind === "assignment" || /homework|assignment|problem\s*set|pset/i.test(material.originalName),
    ).map(({ id }) => id));

    proposal.assessments.forEach((assessment, assessmentIndex) => {
      const assessmentReferences = new Set(assessment.sourceReferences.map(referenceKey));
      const isAssignment = /homework|assignment|problem\s*set|pset/i.test(assessment.title);
      const linkedModules = orderedModules.filter((module) => module.conceptKeys.some((conceptKey) => {
        const concept = conceptsByKey.get(conceptKey);
        return concept?.sourceReferences.some((reference) =>
          assessmentReferences.has(referenceKey(reference)) || (isAssignment && assignmentMaterialIds.has(reference.materialId)),
        );
      }));

      const explicitlyLinkedModule = assessment.moduleKey
        ? orderedModules.find(({ key }) => key === assessment.moduleKey)
        : undefined;
      const modules = linkedModules.length ? linkedModules : explicitlyLinkedModule ? [explicitlyLinkedModule] : [];
      modules.forEach((module) => links.push({
        assessmentIndex,
        moduleKey: module.key,
        type: linkedModules.length ? "evidence" : "module",
      }));
    });
    return links;
  }, [proposal, orderedModules, conceptsByKey, materials]);

  useLayoutEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const draw = () => {
      const rootRect = root.getBoundingClientRect();
      setPaths(moduleConnections.flatMap((connection) => {
        const module = root.querySelector<HTMLElement>(`[data-module-key="${CSS.escape(connection.moduleKey)}"]`);
        const assessment = root.querySelector<HTMLElement>(`[data-assessment-index="${connection.assessmentIndex}"]`);
        if (!module || !assessment) return [];
        const from = module.getBoundingClientRect();
        const to = assessment.getBoundingClientRect();
        const x1 = from.left + from.width / 2 - rootRect.left;
        const y1 = from.bottom - rootRect.top;
        const x2 = to.left + to.width / 2 - rootRect.left;
        const y2 = to.top - rootRect.top;
        const bend = y1 + Math.max(24, (y2 - y1) * 0.55);
        return [{
          id: `${connection.assessmentIndex}-${connection.moduleKey}`,
          d: `M ${x1} ${y1} C ${x1} ${bend}, ${x2} ${bend}, ${x2} ${y2}`,
          type: connection.type,
          moduleKey: connection.moduleKey,
          assessmentIndex: connection.assessmentIndex,
        }];
      }));
    };
    draw();
    const observer = new ResizeObserver(draw);
    observer.observe(root);
    root.querySelectorAll<HTMLElement>("[data-module-key], [data-assessment-index]").forEach((element) => observer.observe(element));
    window.addEventListener("resize", draw);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", draw);
    };
  }, [moduleConnections, selectedModuleKey]);

  return (
    <section className="accepted-map" aria-label="Interactive accepted course map">
      <div className="accepted-map__intro">
        <div><p className="section-kicker">Accepted learning path</p><h4>Choose a module to see its topics and assignment connections.</h4><p className="accepted-map__progress-note">Modules use class-wide practice. Exam topic bars use a matching instructor topic list when one exists; homework bars count practice tied to that assignment’s source. These are study signals, not mastery estimates.</p></div>
        <div className="accepted-map__legend"><span><i className="accepted-map__line accepted-map__line--evidence" />Evidence-linked assignment</span><span><i className="accepted-map__line accepted-map__line--module" />Module association</span></div>
      </div>
      <div className="accepted-map__canvas" ref={rootRef}>
        <svg className="accepted-map__connections" aria-hidden="true" focusable="false">
          {paths.map((path) => <path key={path.id} d={path.d} className={`accepted-map__path accepted-map__path--${path.type}${selectedModuleKey === path.moduleKey || selectedAssessmentIndex === path.assessmentIndex ? " accepted-map__path--active" : ""}`} />)}
        </svg>
        <div className="accepted-map__module-row" aria-label="Course modules">
          {orderedModules.map((module, moduleIndex) => {
            const moduleConcepts = module.conceptKeys.map((key) => conceptsByKey.get(key)).filter((concept) => concept !== undefined);
            const moduleProgress = summarizeStudyCoverage(moduleConcepts.map(({ title }) => title), learnerProgress);
            return <button
              aria-expanded={selectedModuleKey === module.key}
              aria-pressed={selectedModuleKey === module.key}
              className={`accepted-map__module ${selectedModuleKey === module.key ? "accepted-map__module--selected" : ""}`}
              data-module-key={module.key}
              key={module.key}
              onClick={() => {
                setSelectedAssessmentIndex(null);
                setSelectedModuleKey((current) => current === module.key ? null : module.key);
              }}
              type="button"
            >
              <span className="accepted-map__module-number">{String(moduleIndex + 1).padStart(2, "0")}</span>
              <small>MODULE {moduleIndex + 1}</small>
              <strong><MathText inline content={module.title} /></strong>
              <span className="accepted-map__module-count">{module.conceptKeys.length} {module.conceptKeys.length === 1 ? "topic" : "topics"}</span>
              <CategoryProgress label={module.title} coverage={moduleProgress} />
            </button>;
          })}
        </div>

        {selectedModule ? (
          <section className="accepted-map__module-detail" aria-live="polite">
            <div className="accepted-map__module-detail-heading">
              <div><small>MODULE DETAILS</small><h5><MathText inline content={selectedModule.title} /></h5><p><MathText inline content={selectedModule.description} /></p></div>
              <button type="button" onClick={() => setSelectedModuleKey(null)} aria-label="Close module details">Close</button>
            </div>
            <div className="accepted-map__detail-topics">
              {selectedModule.conceptKeys.map((key) => {
                const concept = conceptsByKey.get(key);
                if (!concept) return null;
                const itemProgress = progressByTitle.get(topicKey(concept.title));
                return <button className="accepted-map__topic" key={concept.key} type="button" onClick={() => onStudyTopic(concept.title, undefined, undefined, practiceReviewMethod(itemProgress))}><span className="accepted-map__topic-kicker">TOPIC</span><strong><MathText inline content={concept.title} /></strong><span><MathText inline content={concept.description} /></span><small>{describePractice(itemProgress)} · Study topic →</small></button>;
              })}
            </div>
          </section>
        ) : null}

        <aside className="accepted-map__assessment-lane" aria-label="Assignments and exams linked to modules">
          <div className="accepted-map__assessment-heading"><p className="section-kicker">Assignments and exams</p><span>Connections show which modules each one covers</span></div>
          {proposal.assessments.length ? proposal.assessments.map((assessment, index) => {
            const linkedModules = moduleConnections.filter((connection) => connection.assessmentIndex === index);
            const isAssignment = /homework|assignment|problem\s*set|pset/i.test(assessment.title);
            const isExam = assessment.kind === "major-exam" || /exam|midterm|final/i.test(assessment.title);
            const citedMaterialIds = new Set(assessment.sourceReferences.map(({ materialId }) => materialId));
            if (isAssignment) for (const material of materials) if (material.kind === "assignment" || /homework|assignment|problem\s*set|pset/i.test(material.originalName)) citedMaterialIds.add(material.id);
            const citedSources = [...citedMaterialIds].map((materialId) => materials.find(({ id }) => id === materialId)?.originalName).filter((name): name is string => Boolean(name));
            const studyMaterials = isAssignment ? materials.filter((material) =>
              citedMaterialIds.has(material.id)
              && (material.kind === "assignment" || /homework|assignment|problem\s*set|pset/i.test(material.originalName)),
            ) : [];
            const assignmentMaterialIds = new Set(studyMaterials.map(({ id }) => id));
            const assignmentTopicKeys = proposal.concepts
              .filter((concept) => concept.sourceReferences.some((reference) => assignmentMaterialIds.has(reference.materialId)))
              .map(({ key }) => key);
            const assessmentTopicKeys = [...new Set(isAssignment && assignmentTopicKeys.length
              ? assignmentTopicKeys
              : linkedModules.flatMap(({ moduleKey }) => orderedModules.find(({ key }) => key === moduleKey)?.conceptKeys ?? []))];
            const assessmentTopics = assessmentTopicKeys.map((key) => conceptsByKey.get(key)).filter((concept) => concept !== undefined);
            const learnerAssessment = isExam ? learnerAssessments.find((item) => item.kind === "exam" && item.title.trim().toLocaleLowerCase() === assessment.title.trim().toLocaleLowerCase()) : undefined;
            const learnerAssessmentTopics = learnerAssessment?.topics ?? [];
            const assignmentSignals = isAssignment ? assessmentTopics.map((concept) => {
              const topicMaterialIds = new Set(concept.sourceReferences.map(({ materialId }) => materialId).filter((id) => citedMaterialIds.has(id)));
              const signals = sourceProgress.filter(({ materialId }) => topicMaterialIds.has(materialId)).flatMap(({ topics }) => topics).filter((item) => topicKey(item.title) === topicKey(concept.title));
              return {
                title: concept.title,
                attemptCount: signals.reduce((sum, item) => sum + item.attemptCount, 0),
                scoredAttemptCount: signals.reduce((sum, item) => sum + item.scoredAttemptCount, 0),
                correctCount: signals.reduce((sum, item) => sum + item.correctCount, 0),
                independentScoredAttemptCount: signals.reduce((sum, item) => sum + item.independentScoredAttemptCount, 0),
                independentCorrectCount: signals.reduce((sum, item) => sum + item.independentCorrectCount, 0),
                sessionCount: signals.reduce((sum, item) => sum + item.sessionCount, 0),
                latestOutcome: [...signals].sort((left, right) => (right.lastPracticedAt ?? "").localeCompare(left.lastPracticedAt ?? ""))[0]?.latestOutcome ?? null,
              };
            }) : isExam && learnerAssessmentTopics.length ? learnerAssessmentTopics : learnerProgress;
            const assessmentProgress = summarizeStudyCoverage(assessmentTopics.map(({ title }) => title), assignmentSignals);
            const examTopics = isExam ? assessmentTopics : [];
            return <div className="accepted-map__assessment-group" key={`${assessment.title}-${index}`}>
              <button
              aria-expanded={(isAssignment || isExam) && selectedAssessmentIndex === index}
              aria-pressed={selectedAssessmentIndex === index}
              className={`accepted-map__assessment${selectedModuleKey && linkedModules.some(({ moduleKey }) => moduleKey === selectedModuleKey) || selectedAssessmentIndex === index ? " accepted-map__assessment--active" : ""}`}
              data-assessment-index={index}
              onClick={() => {
                setSelectedModuleKey(null);
                setSelectedHomeworkMaterialId(null);
                setSelectedAssessmentIndex((current) => current === index ? null : index);
              }}
              type="button"
            >
              <span>{isAssignment ? "assignment" : isExam ? "major exam" : assessment.kind.replaceAll("-", " ")}</span><h5><MathText inline content={assessment.title} /></h5>
              {assessment.dueAt ? <small>{assessment.dueAt}</small> : null}
              {citedSources.length ? <small>Evidence: {citedSources.join(", ")}</small> : null}
              {linkedModules.length ? <p>Connected to {linkedModules.map((link, moduleIndex) => {
                const linkedModule = orderedModules.find(({ key }) => key === link.moduleKey);
                return linkedModule ? <span key={link.moduleKey}>{moduleIndex ? ", " : ""}<MathText inline content={linkedModule.title} /></span> : null;
              })}</p> : <p>No module link identified in the cited evidence.</p>}
              {assessmentTopics.length ? <CategoryProgress label={assessment.title} coverage={assessmentProgress} /> : null}
              </button>
              {selectedAssessmentIndex === index && (isAssignment || isExam) ? <div className="accepted-map__assessment-detail">
                {isAssignment ? <><strong>Study for this homework</strong>
                  {studyMaterials.length ? <><p>Click a homework to follow its suggested next topic, or open its topic picker to choose another.</p>{studyMaterials.map((material) => {
                  const studyTopic = material.originalName.replace(/\.[^.]+$/, "").replace(/[_-]+/g, " ").replace(/([a-z])([0-9])/gi, "$1 $2").replace(/\bstudent\b/gi, "").replace(/\s+/g, " ").trim();
                  const homeworkTopics = proposal.concepts.filter((concept) => concept.sourceReferences.some((reference) => reference.materialId === material.id));
                  const homeworkStudyTopics = homeworkTopics.length ? homeworkTopics : assessmentTopics;
                  const isHomeworkOpen = selectedHomeworkMaterialId === material.id;
                  const sourceSignals = sourceProgress.find((item) => item.materialId === material.id);
                  const topicProgress = new Map(sourceSignals?.topics.map((item) => [topicKey(item.title), item]) ?? []);
                  const homeworkProgress = summarizeStudyCoverage(homeworkStudyTopics.map(({ title }) => title), sourceSignals?.topics ?? []);
                  const mappedHomeworkTitles = new Set(homeworkStudyTopics.map(({ title }) => topicKey(title)));
                  const unlinkedHomeworkPractice = (sourceSignals?.topics ?? []).filter((signal) => !mappedHomeworkTitles.has(topicKey(signal.title)) && signal.attemptCount > 0);
                  const recommendation = recommendNextStudyTopic(homeworkStudyTopics, sourceSignals?.topics ?? []);
                  const homeworkLessonSessions = sourceSignals?.sessionCount ?? 0;
                  const homeworkLastPracticedAt = homeworkStudyTopics
                    .map(({ title }) => topicProgress.get(topicKey(title))?.lastPracticedAt)
                    .filter((value): value is string => Boolean(value))
                    .sort()
                    .at(-1);
                  const recommendedTopic = recommendation?.topic;
                  const recommendationAction = !recommendation ? "No study topics available yet" : recommendation.reason === "needs-review"
                    ? `Review ${recommendedTopic!.title} · needs another pass →`
                    : recommendation.reason === "low-scored-accuracy"
                      ? `Low scored accuracy · quiz ${recommendedTopic!.title} →`
                    : recommendation.reason === "spaced-review"
                      ? `Spaced review due · take a knowledge check on ${recommendedTopic!.title} →`
                    : recommendation.reason === "lesson-only"
                      ? `Try a first check on ${recommendedTopic!.title} →`
                      : recommendation.reason === "not-practiced"
                        ? `Start with ${recommendedTopic!.title} · not studied yet →`
                        : `Revisit ${recommendedTopic!.title} · least recently studied →`;
                  return <div className="accepted-map__homework-group" key={material.id}>
                    <button className="accepted-map__homework" type="button" aria-label={recommendedTopic ? `Study ${studyTopic}: ${recommendedTopic.title}` : `Study ${studyTopic}, no mapped study topics yet`} disabled={material.status !== "ready" || !recommendedTopic} onClick={() => recommendedTopic && onStudyTopic(recommendedTopic.title, material.id, undefined, recommendation?.reason === "spaced-review" || recommendation?.reason === "low-scored-accuracy" ? "quiz" : undefined)}>
                      <span>{studyTopic}<span className="accepted-map__homework-action">{recommendedTopic ? "Study this homework →" : "No study topics available"}</span></span>
                      <small>{material.status === "ready" ? `${homeworkLessonSessions} homework lesson session${homeworkLessonSessions === 1 ? "" : "s"}${homeworkLastPracticedAt ? ` · last topic check ${new Date(homeworkLastPracticedAt).toLocaleDateString()}` : ""}` : "Source extraction is not ready yet"}</small>
                      {material.status === "ready" && homeworkProgress.topicCount ? <CategoryProgress label={studyTopic} coverage={homeworkProgress} /> : null}
                      <small>{recommendationAction}</small>
                    </button>
                    {unlinkedHomeworkPractice.length ? <div className="accepted-map__unlinked-practice"><strong>Assignment-level practice</strong>{unlinkedHomeworkPractice.map((signal) => {
                      const scored = signal.scoredAttemptCount ?? signal.attemptCount;
                      const outcome = scored ? `${signal.correctCount}/${scored} scored correct${signal.attemptCount > scored ? ` · ${signal.attemptCount - scored} unscored` : ""}` : `${signal.attemptCount} unscored checks`;
                      return <small key={signal.conceptId}>{signal.title}: {outcome}</small>;
                    })}<small>Not tied to a mapped topic. Choose one below to track topic progress.</small></div> : null}
                    <button className="accepted-map__homework-topics-toggle" type="button" aria-expanded={isHomeworkOpen} onClick={() => setSelectedHomeworkMaterialId((current) => current === material.id ? null : material.id)}>{isHomeworkOpen ? "Hide topic progress ↑" : "Choose a topic · view progress →"}</button>
                      {isHomeworkOpen ? <div className="accepted-map__homework-topics">
                      {material.status !== "ready" ? <p>Wait for this assignment’s source extraction before starting a grounded session.</p> : homeworkTopics.length ? <>
                        <p>Follow the suggested topic above, or choose any topic below. Lessons and checks will use this homework’s extracted passages.</p>
                        {homeworkTopics.map((concept) => {
                          const conceptProgress = topicProgress.get(topicKey(concept.title));
                          const classProgress = progressByTitle.get(topicKey(concept.title));
                          return <button className="accepted-map__assessment-topic" key={concept.key} type="button" onClick={() => onStudyTopic(concept.title, material.id, undefined, practiceReviewMethod(conceptProgress))}>
                            <span><MathText inline content={concept.title} /></span>
                            <small>{conceptProgress?.attemptCount || conceptProgress?.sessionCount ? `${describePractice(conceptProgress)} for this homework · Study here →` : classProgress?.attemptCount ? `${classProgress.scoredAttemptCount ? `Practiced in class · ${classProgress.correctCount}/${classProgress.scoredAttemptCount} scored checks correct${classProgress.attemptCount > classProgress.scoredAttemptCount ? ` · ${classProgress.attemptCount - classProgress.scoredAttemptCount} unscored` : ""}` : `${classProgress.attemptCount} unscored class attempt${classProgress.attemptCount === 1 ? "" : "s"}`} · not checked with this homework yet · Study here →` : classProgress?.sessionCount ? `Lesson opened in class · no checks saved · not checked with this homework yet · Study here →` : "Not practiced yet · Start studying →"}</small>
                          </button>;
                        })}
                      </> : <><p>No map topics cite this assignment yet. Choose a topic connected to the homework category:</p>{assessmentTopics.map((concept) => <button className="accepted-map__assessment-topic" key={concept.key} type="button" onClick={() => onStudyTopic(concept.title, material.id, undefined, practiceReviewMethod(topicProgress.get(topicKey(concept.title))))}><span><MathText inline content={concept.title} /></span><small>Study with this homework →</small></button>)}</>}
                    </div> : null}
                  </div>;
                })}</> : <p>Upload the homework file as an assignment to see its topic list here.</p>}</> : null}
                {isExam ? <><strong>Study the connected exam topics</strong>
                  {learnerAssessment && learnerAssessmentTopics.length ? <><p>Practice is scoped to your saved instructor list for this exam.</p>{learnerAssessmentTopics.map((topic) => {
                    const proposalTopic = examTopics.find((concept) => topicKey(concept.title) === topicKey(topic.title));
                    return <button className="accepted-map__assessment-topic" key={topic.id} type="button" onClick={() => onStudyTopic(topic.title, undefined, learnerAssessment.id, practiceReviewMethod(topic))}><span><MathText inline content={topic.title} /></span><small>{describePractice(topic)} · Open a focused exam practice session →</small>{proposalTopic && topic.title.trim() !== proposalTopic.title.trim() ? <small>Mapped topic: {proposalTopic.title}</small> : null}</button>;
                  })}</> : examTopics.length ? examTopics.map((concept) => {
                    const signal = progressByTitle.get(topicKey(concept.title));
                    return <button className="accepted-map__assessment-topic" key={concept.key} type="button" onClick={() => onStudyTopic(concept.title, undefined, undefined, practiceReviewMethod(signal))}><span><MathText inline content={concept.title} /></span><small>{describePractice(signal)} · Open a focused study session →</small></button>;
                  }) : <p>No linked topics were identified. Open a module above to choose a topic.</p>}
                </> : null}
              </div> : null}
            </div>;
          }) : <p className="accepted-map__empty">No exams or assignments linked yet.</p>}
          {unrepresentedExamScopes.map((assessment) => <section className="accepted-map__scope-card" key={assessment.id} aria-label={`${assessment.title} instructor topic scope`}>
            <div><span>INSTRUCTOR EXAM SCOPE</span><h5><MathText inline content={assessment.title} /></h5><small>{assessment.topics.length} supplied topics · {describePractice(assessment)}</small></div>
            <div className="accepted-map__scope-topics">{assessment.topics.map((topic) => <button className="accepted-map__assessment-topic" key={topic.id} type="button" onClick={() => onStudyTopic(topic.title, undefined, assessment.id, practiceReviewMethod(topic))}><span><MathText inline content={topic.title} /></span><small>{describePractice(topic)} · Study this exam topic →</small></button>)}</div>
          </section>)}
        </aside>
      </div>
    </section>
  );
}
