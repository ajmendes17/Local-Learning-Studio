# Skill Architecture

## Decision

Use narrow, explicitly invoked repository skills for model-backed learning
actions. Keep file parsing, indexing, exact grading, persistence, validation,
and scheduling arithmetic in deterministic application code.

The GUI should invoke a named skill for each model-backed step, so skill
selection does not depend on ambiguous natural-language triggering. Shared
learning rules remain in project documentation and versioned contracts instead
of being copied into every skill.

## Implemented skills

| GUI action | Skill | Responsibility | Default model |
|---|---|---|---|
| Import course | `classify-course-sources` | Classify canonical passages, identify likely syllabus/material roles, and report source gaps after deterministic extraction | Luna |
| Build plan, stage 1 | `map-course` | Propose concepts, prerequisites, objectives, modules, assessments, and source references | Terra |
| Build plan, stage 2 | `build-training-plan` | Turn the accepted course map, deadlines, available time, and learner evidence into a schedule | Terra |
| Start lesson | `compose-study-lesson` | Construct the next bounded lesson from the active plan and current evidence | Terra, with Luna allowed after evaluation |
| Explain | `explain-course-concept` | Give a concise source-grounded explanation or progressive hint for one selected concept | Luna |
| Practice | `generate-adaptive-practice` | Generate targeted problems and separately validated solutions at the current mastery level | Terra |
| Submit answer | `evaluate-learner-response` | Score non-deterministic reasoning against a rubric and propose misconception evidence | Luna |
| Take quiz | `generate-course-quiz` | Create a balanced assessment with validated keys, rubrics, source coverage, and difficulty distribution | Terra |
| Review mistakes | `plan-remediation` | Convert recent errors and retention evidence into the smallest useful remediation session and plan revision | Terra |
| Review learning patterns | `review-learning-patterns` | Propose provisional patterns from a bounded same-class attempt history and prior snapshot, only on explicit triggers | Terra |
| Reconcile assessment scope | `reconcile-assessments` | Group duplicate course-map and Obsidian assessment records, then compare exam-specific evidence with scheduled coverage | Sol |

Study actions run inside a selected class workspace. Their inputs include only
that class's concept profile, relevant evidence, and any selected passages;
they must not retrieve learner history from another class. Direct study can
start without a schedule, while time-budget planning is an explicit optional
action.

Sol is an escalation for difficult synthesis or quality audits, not a default
skill model. The server selects the runtime model; skills do not select models
themselves.

## Deterministic boundaries

No skill is required to:

- store or extract an upload;
- hash, deduplicate, chunk, or index canonical passages;
- retrieve a bounded source set;
- validate a structured response;
- grade multiple choice, true/false, or contract-approved exact answers;
- calculate basic attempt statistics or review intervals;
- persist artifacts or learner evidence.

Keeping these operations outside skills reduces rate-limit use, makes failures
repeatable, and protects learner-state integrity.

## Shared run contract

Every skill run receives only:

- the requested course and activity identifiers;
- the smallest relevant canonical source passages;
- the applicable versioned output schema;
- a compact learner-evidence projection;
- any task-specific rubric or plan fragment.

Every run returns a structured proposal. The application validates and commits
it. A skill never writes directly to the database or silently broadens its
source scope.

## Migration from `learning-coach`

The broad `learning-coach` skill has been removed. All nine narrow skills were
initialized with the supported skill scaffold, validated independently, and
configured with implicit invocation disabled. The future GUI must invoke the
exact `$skill-name`; the server remains responsible for choosing the model and
validating the response.


## Persisted direct study

The default direct-study action uses `compose-study-lesson` with general
knowledge when no source passages are supplied. The server validates the result,
associates it with the class-local concept, and saves it as a `study_sessions`
record. Reopening a saved session reads the validated stored payload without
calling Codex. Submitted answers go through deterministic answer-key checking
and append-only class learner evidence.

A future practice-exam action may retrieve explicitly selected course materials
and pass source references into generation and validation; it is an extension
of this loop rather than a prerequisite for direct learning.

## Confidence- and history-aware adaptation

Stage one records confidence and revealed-hint count with each answer, then
supplies up to five recent attempts for that class-local concept to
`generate-adaptive-practice`. A miss or low-confidence success offers a new
item on the same concept with a changed surface form or reasoning path. An
exact-question retry remains optional. Repeated errors or high hint use can
suggest an example or clarification before another independent check.

The existing `evaluate-learner-response` skill remains responsible for
interpreting short free responses against a rubric. The existing
`plan-remediation` skill can propose a focused next step from recent attempts.
Neither skill grades objective keys, reads the full profile, nor writes learner
state. The application selects the bounded evidence window, validates
proposals, persists attempts, and explains the suggested action. Later stages
may add recurring-pattern analysis, method outcome comparisons, and
learner-controlled adaptation strength without assigning fixed learning-style
labels.

The `review-learning-patterns` skill and `learner-pattern-review.v1` contract
power explicit reviews at a completed-session boundary or when the learner
requests one. The Study page invokes it only through those actions. It never
runs per answer, continuously, on a timer, or in the background. The application
owns same-class attempt selection, output validation, append-only review
history, current pattern projection, and learner status corrections.

The Study UI reveals progressive hints, records confidence and hint use, and
offers both a new question and an exact-question retry. New-question generation
is class-scoped and saves a new session artifact. Later stages may add
recurring-pattern analysis, method outcome comparisons, and learner-controlled
adaptation strength without assigning fixed learning-style labels.
