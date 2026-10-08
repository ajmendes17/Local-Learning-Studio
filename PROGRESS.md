# Project Progress

Last updated: 2026-10-08

This file is the durable implementation ledger. A task is complete only when
its acceptance evidence is recorded here.

## Status key

- `[x]` Complete and verified
- `[ ]` Not started or incomplete
- `[~]` In progress
- `[!]` Blocked or requires a decision

## Foundation

- [x] Initialize the Git repository.
  - Evidence: repository exists with `main` as the working branch.
- [x] Create the npm workspace and TypeScript configuration.
  - Evidence: root scripts coordinate contracts, server, and web workspaces.
- [x] Add the React/Vite application shell.
  - Evidence: production build succeeds and renders the local service state.
- [x] Add the Fastify local service.
  - Evidence: `/api/health` is covered by an injection test.
- [x] Add shared TypeScript contracts.
  - Evidence: server and web import the same `HealthResponse` contract.
- [x] Create project-local learning skills.
  - Evidence: nine narrow skills under `.agents/skills` pass the Codex skill
    validator and disable implicit invocation.
- [x] Document architecture, setup, boundaries, and verification.
  - Evidence: `README.md`, `docs/ARCHITECTURE.md`, `docs/PRODUCT-PLAN.md`, and
    this ledger exist.

## Milestone 1: Local course library

- [x] Define course, material, module, and assessment schemas.
  - Evidence: shared Zod contracts validate API records at runtime.
- [x] Add SQLite migrations and repository interfaces.
  - Evidence: course and material records survive a service restart in tests.
- [x] Store PDF, Markdown, text, DOCX, and PPTX sources by class.
  - Evidence: uploads use collision-safe names under the owning course ID.
- [x] Extract supported source contents for retrieval.
  - Evidence: Markdown, plain-text, text-PDF, DOCX, and PPTX uploads produce
    persisted canonical source passages.
- [x] Define concept and prerequisite schemas with the course map.
  - Evidence: shared runtime contracts cover concepts, prerequisite edges, and
    a source-referenced `course-map.v1` proposal.
- [x] Preserve page, heading, and file provenance during extraction.
  - Evidence: PDFs retain page locations; text retains line locations;
    Markdown retains its nearest heading; DOCX retains paragraph ranges and
    headings; PPTX retains slide ranges and titles; all passages own a material
    ID and content hash.
- [x] Show explicit upload failures and unsupported-file messages.
  - Evidence: unsupported files receive `415` and create no material record.
- [x] Add a course-library UI with upload status.
  - Evidence: verified empty, populated, class-detail, and upload states.

Acceptance:

- A user can import a supported source, restart the app, and find it intact.
- Every extracted passage can be traced to a file and source location.
- A failed import never appears as a successful or partially complete course.

## Milestone 2: Course map and training plan

The training workflow is exam/quiz-first. A learner can enter an assessment
time and its topics and receive a useful plan without uploading class materials;
sources are optional grounding that can be added later.

- [x] Define the end-to-end learning feedback loops.
  - Evidence: `docs/LEARNING-FEEDBACK-LOOPS.md` specifies inputs, outputs,
    evidence, conversations, artifacts, guardrails, and implementation order.
- [x] Add an in-app explanation of the planned learning system.
  - Evidence: `/how-it-works` presents the five linked loops and data boundaries.
- [x] Define versioned structured-output schemas.
  - Evidence: `CourseMapProposalSchema` requires `course-map.v1`, source
    material IDs, passage references, and internally consistent module,
    concept, prerequisite, and assessment keys.
- [x] Invoke locally authenticated Codex from the server.
  - Evidence: the runner uses ephemeral, read-only `codex exec` calls, sends
    prompts over stdin, requests schema-constrained output, and revalidates the
    final JSON.
- [x] Locate and validate learning skills under `.agents/skills` so repository
  clones discover them automatically.
  - Evidence: all nine repository skills validate under `.agents/skills`; the
    old `.codex/skills` copy is gone.
- [x] Add configurable task-to-model routing for Luna, Terra, and Sol with
  explicit unavailable-model errors.
  - Evidence: every typed task maps to a configurable model; failures are
    returned explicitly and never trigger model substitution.
- [x] Define the specialized skill inventory and deterministic boundaries.
  - Evidence: `docs/SKILL-ARCHITECTURE.md` maps each GUI action to a narrow
    skill, default model, and validated application boundary.
- [x] Scaffold and validate the specialized learning skills.
  - Evidence: each GUI action owns a concise skill with matching UI metadata;
    the overlapping broad skill has been removed.
- [x] Add versioned source-classification and course-map artifact storage.
  - Evidence: drafts are cached by source fingerprint, validated on read and
    write, and accepted history is superseded only by a reviewed replacement.
- [x] Generate concepts, prerequisites, objectives, and source references.
  - Evidence: the action-specific backend classifies current sources, invokes
    `map-course`, validates every cited passage, and caches by fingerprint.
- [ ] Create an exam/quiz record with scheduled time and editable topic scope.
- [ ] Create a deadline- and availability-aware plan from assessment topics,
  learner knowledge evidence, importance, and uncertainty, even when no course
  materials have been uploaded.
- [x] Store artifacts so reopening a course does not regenerate them.
  - Evidence: matching source-classification and course-map fingerprints reuse
    validated SQLite artifacts; the integration test verifies restart.
- [x] Add review and explicit regeneration controls.
  - Evidence: the course workspace shows classification and map freshness,
    warnings, model provenance, modules, assessments, acceptance, reanalysis,
    and regeneration without automatically applying drafts.

Acceptance:

- Generated claims cite imported source locations.
- Invalid structured output is rejected without overwriting valid artifacts.
- A saved plan can be reopened without another model run.
- A learner can create a useful topic-based exam plan without uploading notes;
  the plan states which scope comes from the learner and which topics are
  model-suggested pending confirmation.

## Milestone 3: Guided study session

- [~] Build a direct-start lesson, worked-example, analogy, and quiz-first
  flow with immediate objective feedback, confidence capture, and a side chat.
  - Evidence: `/courses/:courseId/study` invokes Codex CLI through the structured
    lesson and explanation tasks; objective attempts use class-scoped API routes.
- [x] Place the Study space inside each class and isolate learner profile,
  assessment, concept, attempt, and evidence storage by class ID.
  - Evidence: nested class Study route, class-specific profile endpoint, and
    same-class concept/assessment reference checks; Obsidian folders are planned.
- [ ] Retrieve selected course passages for study sessions and clarification
  chat when materials are attached.
- [x] Persist and reopen generated lesson/session artifacts per class.
  - Evidence: validated lesson content is stored in `study_sessions`; the Study tab lists recent lessons and reopens the saved content without regenerating it.
- [ ] Add deterministic multiple-choice, true/false, numeric, and
  contract-approved exact-answer grading.
- [ ] Route short-response grading through the configured lightweight model.
- [ ] Add progressive hints that do not reveal answers immediately.
- [ ] Check reasoning as well as final answers.
- [ ] Generate comparable practice with solution validation.
- [x] Save attempts with confidence and hint use, then offer same-concept practice.
  - Evidence: the Study tab records each response, confidence, and revealed-hint count; offers a newly generated question using up to five recent same-class attempts; saves the new question as a session artifact; and keeps exact-question retry optional.
- [x] Set the staged direction for confidence- and history-aware adaptation.
  - Evidence: stage one uses recent same-concept attempts to guide feedback and offer a new question on the concept; later stages add recurring patterns, method outcomes, and learner-controlled adaptation strength. See `docs/LEARNING-FEEDBACK-LOOPS.md` and `docs/SKILL-ARCHITECTURE.md`.

Acceptance:

- A complete session can run without leaving the primary study surface.
- Feedback distinguishes unsupported, incorrect, and incomplete reasoning.
- Session history survives restart and drives the next recommendation.

## Personal knowledge profile and Obsidian companion

- [x] Define class-scoped assessment, topic, stable concept, attempt, and
  append-only mastery-evidence records that do not require course materials.
  - Evidence: SQLite storage and validated class-scoped API schemas/routes persist assessment
    scope, optional concept links, response evidence, confidence, hint use,
    learning method, outcome, source references, independence, and rationale.
- [x] Record append-only class-local attempts and show transparent per-concept evidence
  summaries; define calibrated knowledge-state rules and promotion thresholds.
  - Evidence: `GET /api/courses/:courseId/learner/profile` reports attempt count, correct count,
    latest outcome, and last practice time; it does not claim calibrated mastery.
- [ ] Configure an Obsidian vault root and create one separate folder per class;
  define stable class-local note IDs, generated/user-owned sections, and
  bidirectional edit/conflict behavior.
- [ ] Export and synchronize a navigable knowledge tree with links to courses,
  assessments, topics, concepts, evidence, and learner-authored reflections.

## Milestone 4: Adaptive review

- [ ] Define an explainable mastery model.
- [ ] Schedule retrieval practice and delayed review.
- [ ] Automatically version and revise the training plan after quiz evidence.
- [ ] Adapt format based on measured outcomes and user preference.
- [ ] Add progress and weak-point views without noisy gamification.
- [ ] Provide export and deletion for learner data.

Acceptance:

- The next activity can be explained from recorded evidence.
- Users can override recommendations without corrupting mastery history.
- All local learner data can be exported and permanently deleted.

## Future interaction experiments

The hand-tracking proof of concept can estimate a calibrated quadrant and
recognize pointing, open-hand, and closed-fist poses. The following interactions
are ideas only; they are not implemented yet:

- [ ] Gesture navigation and dashboard layout: use deliberate quadrant-based
  pointing or swipes to move between LLS sections and reposition dashboard
  panels. Keep mouse and keyboard controls available; evaluate usability and
  engagement without assuming navigation gestures improve learning outcomes.
- [ ] Two-hand zoom: track the distance between both palm centers, zooming in
  as the hands move apart and out as they move together. Add smoothing and a
  deliberate activation rule to reduce accidental zooming.

## Later decisions

- [!] Desktop packaging: evaluate Tauri after the web workflow is validated.
- [!] Hosted/API mode: define only after personal local mode is accepted.
- [!] Multi-user accounts: out of scope for the personal MVP.
- [!] Native distraction controls: separate product decision, not an MVP gate.
- [x] Audio/video transcription: deferred beyond the first MVP.

## Verification log

| Date | Scope | Result |
|---|---|---|
| 2026-07-29 | Initial project foundation | Passed skill validation, workspace type checks, 1 API test, 3 production builds, and `git diff --check` |
| 2026-07-29 | Course library framework | Passed workspace type checks, 4 API/storage tests, 3 production builds, `git diff --check`, and desktop/mobile browser flows for create, open, and upload |
| 2026-07-29 | Learning feedback-loop plan and information page | Passed workspace type checks, 4 API/storage tests, 3 production builds, `git diff --check`, route navigation, and desktop/mobile browser review |
| 2026-07-30 | Source ingestion and course-map contracts | Passed workspace type checks, 10 contract/API/storage/extraction tests, 3 production builds, `git diff --check`, and desktop/mobile browser review of a real extracted upload |
| 2026-08-03 | DOCX/PPTX extraction and skill architecture | Passed 13 contract/API/storage/extraction tests, workspace type checks, 3 production builds, `git diff --check`, skill discovery, and a zero-vulnerability production dependency audit |
| 2026-08-03 | Codex runner and model router | Passed 20 tests including structured-output validation, explicit failure and timeout handling, serialized calls, model selection, and setup status; workspace checks and production audit passed |
| 2026-08-03 | Specialized learning skills | All 9 skill folders passed the Codex skill validator; implicit invocation is disabled and the broad transitional skill was removed |
| 2026-08-03 | Source classification and course-map backend | Passed 23 tests including fingerprint caching, stale-draft rejection, citation validation, restart persistence, and transactional map acceptance; workspace checks and production audit passed |
| 2026-08-03 | Course-map review interface | Verified empty, draft, and accepted states in the local browser; acceptance updated 3 module and 2 assessment records, the 390 px layout had no horizontal overflow, and browser console review found no errors or warnings |
| 2026-10-07 | Persisted class study loop | In progress: session persistence, reopen/history routes, evidence summary UI, and docs updated; workspace checks pending |
