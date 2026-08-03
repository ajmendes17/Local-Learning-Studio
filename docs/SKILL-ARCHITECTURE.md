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
