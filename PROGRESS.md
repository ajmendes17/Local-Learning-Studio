# Project Progress

Last updated: 2026-07-29

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
- [x] Create the project-local `learning-coach` skill.
  - Evidence: the skill passes the Codex skill validator.
- [x] Document architecture, setup, boundaries, and verification.
  - Evidence: `README.md`, `docs/ARCHITECTURE.md`, and this ledger exist.

## Milestone 1: Local course library

- [x] Define course, material, module, and assessment schemas.
  - Evidence: shared Zod contracts validate API records at runtime.
- [x] Add SQLite migrations and repository interfaces.
  - Evidence: course and material records survive a service restart in tests.
- [x] Store PDF, Markdown, text, DOCX, and PPTX sources by class.
  - Evidence: uploads use collision-safe names under the owning course ID.
- [ ] Extract supported source contents for retrieval.
- [ ] Define concept and prerequisite schemas with the course map.
- [ ] Preserve page, heading, and file provenance during extraction.
- [x] Show explicit upload failures and unsupported-file messages.
  - Evidence: unsupported files receive `415` and create no material record.
- [x] Add a course-library UI with upload status.
  - Evidence: verified empty, populated, class-detail, and upload states.

Acceptance:

- A user can import a supported source, restart the app, and find it intact.
- Every extracted passage can be traced to a file and source location.
- A failed import never appears as a successful or partially complete course.

## Milestone 2: Course map and training plan

- [x] Define the end-to-end learning feedback loops.
  - Evidence: `docs/LEARNING-FEEDBACK-LOOPS.md` specifies inputs, outputs,
    evidence, conversations, artifacts, guardrails, and implementation order.
- [x] Add an in-app explanation of the planned learning system.
  - Evidence: `/how-it-works` presents the five linked loops and data boundaries.
- [ ] Define versioned structured-output schemas.
- [ ] Invoke locally authenticated Codex from the server.
- [ ] Generate concepts, prerequisites, objectives, and source references.
- [ ] Create a deadline-aware training plan.
- [ ] Store artifacts so reopening a course does not regenerate them.
- [ ] Add review and explicit regeneration controls.

Acceptance:

- Generated claims cite imported source locations.
- Invalid structured output is rejected without overwriting valid artifacts.
- A saved plan can be reopened without another model run.

## Milestone 3: Guided study session

- [ ] Build focused lesson, example, practice, and recap views.
- [ ] Add progressive hints that do not reveal answers immediately.
- [ ] Check reasoning as well as final answers.
- [ ] Generate comparable practice with solution validation.
- [ ] Save attempts, confidence, hints, and misconceptions.

Acceptance:

- A complete session can run without leaving the primary study surface.
- Feedback distinguishes unsupported, incorrect, and incomplete reasoning.
- Session history survives restart and drives the next recommendation.

## Milestone 4: Adaptive review

- [ ] Define an explainable mastery model.
- [ ] Schedule retrieval practice and delayed review.
- [ ] Adapt format based on measured outcomes and user preference.
- [ ] Add progress and weak-point views without noisy gamification.
- [ ] Provide export and deletion for learner data.

Acceptance:

- The next activity can be explained from recorded evidence.
- Users can override recommendations without corrupting mastery history.
- All local learner data can be exported and permanently deleted.

## Later decisions

- [!] Desktop packaging: evaluate Tauri after the web workflow is validated.
- [!] Hosted/API mode: define only after personal local mode is accepted.
- [!] Multi-user accounts: out of scope for the personal MVP.
- [!] Native distraction controls: separate product decision, not an MVP gate.

## Verification log

| Date | Scope | Result |
|---|---|---|
| 2026-07-29 | Initial project foundation | Passed skill validation, workspace type checks, 1 API test, 3 production builds, and `git diff --check` |
| 2026-07-29 | Course library framework | Passed workspace type checks, 4 API/storage tests, 3 production builds, `git diff --check`, and desktop/mobile browser flows for create, open, and upload |
| 2026-07-29 | Learning feedback-loop plan and information page | Passed workspace type checks, 4 API/storage tests, 3 production builds, `git diff --check`, route navigation, and desktop/mobile browser review |
