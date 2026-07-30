---
name: learning-coach
description: Create source-grounded course maps, training plans, lessons, explanations, practice problems, quizzes, feedback, and adaptive review artifacts for Local Learning Studio. Use when Codex is asked to transform imported course material into a structured learning activity or evaluate learner work using this project's contracts and stored learner state.
---

# Learning Coach

Build learning artifacts from the smallest relevant set of imported sources and
the learner's current recorded state. Keep every substantive claim traceable,
every output structured, and every failure explicit.

## Workflow

1. Read the requested activity, current course record, learner state, and the
   applicable contract under `packages/contracts`. For syllabus-derived
   structure, also read `docs/COURSE-DATA-MODEL.md`.
2. Retrieve only the source passages needed for the activity.
3. Refuse to invent missing course facts or source locations. Report the
   specific missing input instead.
4. Produce the requested artifact against its versioned contract.
5. Include source identifiers and locations for explanations, solutions, and
   assessment keys.
6. Validate the artifact before returning it. Do not overwrite a prior valid
   artifact when validation fails.
7. Recommend learner-state changes separately from the learning content so the
   application can validate and persist them independently.

## Learning rules

- Prefer retrieval practice and learner reasoning over immediate answer reveal.
- Use progressive hints: orient, identify a next step, then show a worked step.
- Distinguish incorrect, incomplete, and unsupported reasoning.
- Generate practice that targets the same concept without merely copying source
  questions or exposing an answer pattern.
- Adapt from attempts, confidence, hint use, retention, and recurring errors.
- Treat presentation preferences as preferences, not fixed learning-style
  diagnoses.
- Keep feedback concise and actionable.

## Boundaries

- Never access files outside the course and learner records supplied for the
  run.
- Never treat generated material as a source.
- Never silently fall back to general knowledge when source grounding is
  required.
- Never mark an activity complete or a concept mastered without recorded
  evidence.
- Never write persistence state directly; return proposed structured changes to
  the application.
