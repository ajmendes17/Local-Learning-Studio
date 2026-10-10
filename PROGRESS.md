# Project Progress

Last updated: 2026-10-10

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
- [~] Ground assignment-specific study sessions in the selected uploaded
  assignment; retrieve selected course passages for general study and
  clarification chat still remains.
  - Evidence: selecting a homework file starts a study session with bounded
    extracted passages from that same class-local material. Accepted-map
    homework cards also offer their linked topics directly; when a homework
    source is ready, those topic sessions include its extracted passages.
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
- [x] Carry the saved answer into focused method-switch remediation.
  - Evidence: switching a session to a worked example or explanation passes
    its source session; the server checks that topic, concept, selected homework,
    and exam scope still match, then includes up to three bounded saved responses
    so remediation targets the learner's actual uncertainty. Coverage includes
    assignment source grounding and exam-scope validation.
- [x] Set the staged direction for confidence- and history-aware adaptation.
  - Evidence: stage one uses recent same-concept attempts to guide feedback and offer a new question on the concept; later stages add recurring patterns, method outcomes, and learner-controlled adaptation strength. See `docs/LEARNING-FEEDBACK-LOOPS.md` and `docs/SKILL-ARCHITECTURE.md`.
- [x] Run class-scoped learner-pattern reviews only at session end or by request.
  - Evidence: the versioned contract, explicit-only Codex skill, bounded attempt
    selection, append-only review history, current pattern projection, status
    correction/dismissal route, and Study UI controls are implemented. Each
    saved answer links to its session for precise session-end review. No
    per-answer or background review is scheduled.

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
- [x] Configure a local Obsidian vault root and create one stable folder per class;
  preserve learner-authored sections during managed exports.
  - Evidence: class page saves an existing vault path and in-vault folder to
    local app settings; generated-section replacement is atomic and refuses
    incomplete or duplicate markers.
- [~] Export a navigable course knowledge tree with links to modules, topics,
  syllabus assessments, and learner-added exam scopes.
  - Evidence: browser export wrote 34 notes for the active quantum-information
    class into the user's configured vault. Obsidian CLI lists the notes,
    opens the Course note, and resolves outgoing links to the modules and
    homework assignment note. Topic, assessment, source, and module notes show
    practice evidence; module notes aggregate lesson/check coverage and scored
    totals. A live refresh wrote 37 notes; a folder-scoped audit resolved all
    299 links and confirmed all 37 notes retain a learner notes section. This
    is one-way export; edits in Obsidian are not imported into the app.

## Milestone 4: Adaptive review

- [ ] Define an explainable mastery model.
- [x] Schedule retrieval practice and delayed review.
  - Evidence: deterministic 1-, 3-, and 7-day recall intervals use recorded
    accuracy, latest confidence, and independent-check evidence. Missed and
    ungraded checks retain their immediate remediation paths. Due or upcoming
    dates appear in class recommendations and homework/exam topic summaries;
    due map actions open quiz-first practice so spaced review adds scored
    evidence. Contract, service, and web tests cover
    interval boundaries, priority, display, and method routing.
- [ ] Automatically version and revise the training plan after quiz evidence.
- [ ] Adapt format based on measured outcomes and user preference.
- [~] Add progress and weak-point views without noisy gamification.
  - Evidence: accepted-map module categories show topic-practice coverage and
    per-topic attempt/correct counts; learner-provided exam scopes now also
    separate lesson coverage from saved scored checks per topic, show spaced
    recall timing, and offer direct lesson and practice actions. Calibrated
    weak-point summaries remain.
- [x] Provide export and deletion for learner data stored by Local Learning Studio.
  - Evidence: each class has a versioned JSON download with learner profile,
    assessment scopes, complete saved study sessions and attempts, method
    summaries, patterns, pattern reviews, and source comments. A typed,
    class-scoped delete removes learner tables, source comments/import markers,
    and the current browser's class drafts transactionally, while preserving
    course files, accepted course maps, other classes, and external Obsidian or
    downloaded copies. API and browser-storage tests verify scope and behavior.

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
| 2026-10-09 | Direct saved-session resume | Added a session ID to the Study URL after generation or history reopen; a valid session URL now restores the saved lesson and avoids re-running its topic. Reopened and reloaded the existing Homework 3 session in the browser, confirmed the URL and lesson survived, and verified the session still had zero attempts. Type checks, all 36 tests, builds, and `git diff --check` passed. |
| 2026-10-09 | Instructor topic-list UI preview | Browser preview cleaned numbered/bulleted sample input, deduplicated a repeated topic, and showed three topics ready to save. Left Save untouched, reloaded to discard the preview, then verified the live class still has zero learner-added scopes and unchanged homework-session count. |
| 2026-10-09 | Saved lesson and knowledge-check browser smoke | Reopened an existing saved PHGN 519 lesson, confirmed the Lesson and Knowledge check tabs work, inspected the rendered Greek symbols in lesson/question/options, and confirmed four math-enabled choices, zero console errors, and zero saved attempts after viewing. |
| 2026-10-09 | Indexed math symbol repair | Fixed decoded TeX repairs for Greek commands followed by subscripts; all 36 server tests, type checks, builds, and `git diff --check` passed. Reopened a real saved lesson in the browser and confirmed its previously missing rho now renders as `ρ` with valid MathML and zero browser console errors. |
| 2026-10-09 | Obsidian module progress and live vault audit | Passed all 36 server tests, type checks, builds, and `git diff --check`; refreshed 37 live notes, with Obsidian reporting zero unresolved links and a folder-scoped audit finding 299 valid links across the class notes. Verified module coverage renders in the actual vault. |
| 2026-10-09 | Per-topic assessment progress actions | Passed workspace type checks, all 36 server tests, production builds, and `git diff --check`; browser snapshot confirmed the live Study page and current Homework 3 recommendation. No learner assessment scope exists in the live class, so the new scope rows were validated by build/API coverage rather than live-clicked in that class. |
| 2026-10-09 | Focused study remediation | Passed workspace type checks, all 36 server tests, production builds, and `git diff --check`; confirmed homework remediation retains its source evidence and exam remediation rejects a changed assessment scope |
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
| 2026-10-08 | Explicit learner-pattern review | Workspace typecheck, production build, and `git diff --check` passed; pattern projection endpoint returned an empty class-scoped result on the local server. Automated tests were not run. |
| 2026-10-09 | Course-map citation diagnostics | A live Terra run confirmed 28/56 references used fabricated passage UUIDs while course and material IDs matched. Added short per-material passage keys with server-side resolution, content-free validation diagnostics, and source/prompt size reporting. Typecheck and `git diff --check` passed; no post-fix model run or automated tests were run. |
| 2026-10-09 | Accepted map study diagram | Added a linear module/topic tree, assessment-to-topic links from shared evidence citations, and topic-click navigation that starts a focused study session. Workspace typecheck, web production build, and `git diff --check` passed; live rendering with an accepted map was not available in the local course data. |
| 2026-10-09 | Assignment study, progress, study methods, math, and Obsidian export | Homework 3 assignment selection passes its source ID to study; exam cards expand to connected topic study actions. Module and linked assessment cards show practice coverage without claiming mastery; browser inspection confirmed 7 module and 4 assessment progress bars. Instructor topic-list capture, separate Lesson/Knowledge check tabs, and KaTeX math rendering are implemented; a live browser render confirmed inline ket notation and display equations. Local vault configuration and safe one-way Markdown export include stable links, generated sections, and preservation of user-written text. Browser export wrote 34 notes into the configured vault; Obsidian CLI confirmed note listing, course index, assessment files, and 12 outgoing links from the course index. The index includes its last-export timestamp. `npm run check` passed, including 27 server tests; `git diff --check` passed. Live lesson generation was skipped to avoid another model run. Obsidian Sync and bidirectional import remain unimplemented. The production web audit reports four low-severity findings from older transitive KaTeX copies. |
| 2026-10-09 | Assessment-topic study and progress | Saved instructor assessment topics are clickable from the Study page and start scoped sessions; attempts retain the assessment link. Assessment and topic counters show attempts, correct answers, latest outcome, and last practice time in the learner profile; Obsidian exports include the same progress. API integration test verifies scoped session generation, attempt saving, and updated profile counts. `npm run check` passed (28 tests) and `git diff --check` passed. |
| 2026-10-09 | Study progress polish and Obsidian evidence check | Live browser review on a disposable course showed clickable instructor topics, per-scope counts, and an evidence-based next-review action; topic cards now fill available columns. A suggested quiz preserves assessment scope when its topic is linked to an exam. Recent-lesson counters were corrected to count attempts per session rather than across all sessions for a concept. Added regression coverage for per-session outcomes and Obsidian export of an actual incorrect attempt; manually exported the disposable demo course to `/tmp` and inspected the generated assessment Markdown. `npm run check` passed (28 tests), and `git diff --check` passed. The existing project backend was offline during review; the visual smoke pass used a temporary API database and did not touch the user's course DB or configured Obsidian vault. |
| 2026-10-09 | Reopened knowledge-check evidence | Reopening a study session now returns saved responses/outcomes and restores the selected answer, confidence, and hints in the UI; the learner can explicitly retry when they want a new attempt. Added an API integration assertion for restored session attempts. The default backend came back healthy on port 4318 after its watcher restarted; live course view confirmed learner progress and study-history records load. The topic-list disclosure opened in the live UI. Stale progress-load errors now clear after successful refresh, with an explicit retry action when requests fail. |
| 2026-10-09 | Homework study path, progress, math, and Obsidian validation | The live accepted map expands “Homework assignments” → “Homework 3” → its six source-cited topics, each with topic progress and a source-grounded study action. Module, assessment, and per-homework trackers show course-wide topic practice plus saved check outcomes, and explain that the signal is not mastery. Reopened a saved lesson and confirmed ket/bra and Greek-rho formulas render through KaTeX in both lesson and knowledge-check tabs; MathText repairs common JSON-decoded control characters and doubled TeX slashes. Refreshed the configured Obsidian vault through the app UI: 37 notes written, including 3 extracted source notes; CLI verified Homework 3 page locators, 15 course-index links, and zero unresolved vault links. No new model generation or answer submission was made during browser validation. `npm run check` passed (28 tests, all workspace typechecks and production builds); `git diff --check` passed. The build retains its large-bundle warning. |
| 2026-10-09 | Study response recovery | After an HTTP 5xx or connection error, the study page checks for a matching session created during that request and restores it instead of inviting a duplicate generation. Sessions now retain their optional source-material ID, and recovery requires an exact source and assessment match. A browser route mock returned 502 plus a matching saved session; the page showed the recovery notice and rendered the saved lesson with no error banner. API integration assertion verifies source ID persistence. `npm run check` passed (28 tests and production builds); API health and `git diff --check` passed. The recovery browser exercise used mocked session data and made no model call or database write. |
| 2026-10-09 | Assessment progress coverage and app polish | Added a per-assessment practice coverage bar based on the share of listed topics with saved attempts, alongside the separate saved-check correctness count. A browser-only mock with 3 topics (2 practiced) rendered “2 of 3 topics practiced,” 67% accessible coverage, and “2 of 3 checks correct”; existing real course profile loaded without generating lessons. Added a branded SVG favicon; clean browser console review had no app errors or warnings. `npm run check` passed (28 tests, typechecks, builds); `git diff --check` passed. |
| 2026-10-09 | Grounded adaptive follow-up questions | Fixed a broken attempt-history query that read `independence` from the wrong table, which had made “Another question” return 500. Follow-ups now reuse the original homework passages, assignment ID, assessment scope, prior lesson, and only the selected assessment's attempts; stale source or scope references fail visibly. Added an integration test proving source/scope carryover and that an unscoped correct answer is excluded from homework-scoped history. A mocked browser walkthrough passed the Knowledge check tab, feedback display, and course-grounded follow-up transition without writing real attempts or invoking Codex. `npm run check` passed (29 tests, typechecks, production builds); `git diff --check` passed. |
| 2026-10-09 | Study-method guidance and live Obsidian audit | The study-method chooser now explains what each of its four approaches does and exposes selection with `aria-pressed` and a live description. API regression test verifies distinct instructions reach the generator; browser selection updated the analogy guidance and made no generation request. Read-only Obsidian audit found 37 notes in the configured course folder, 15 resolved links from the Course index, and zero unresolved links across the vault. Inspected the Homework 3 source note: all 9 extracted passages retain page locators and link back into the course. `npm run check` passed (30 tests, all typechecks/builds); `git diff --check` passed. No Obsidian export was run during the audit. |
| 2026-10-09 | Learner attempt save recovery | Study answers now use stable attempt IDs and expose a retry action if the checked response could not be saved. Repeating a successful save with the same ID returns the original attempt instead of incrementing progress twice; the API regression test verifies the saved record and count remain unchanged. `npm run check` and `git diff --check` passed. |
| 2026-10-09 | Homework-to-Obsidian navigation | Live browser review confirmed the accepted map expands Homework assignments → Homework 3 → six source-grounded, clickable topics, with progress at the category, homework, and topic levels. Obsidian source notes now link to accepted topics cited from that material and matching assignment assessments; regression coverage verifies the assignment-name fallback when explicit assessment citations are absent. Re-exported the live course (37 notes); Obsidian CLI confirmed the Homework 3 note links all six topics and Homework assignments, there are zero unresolved links, and Entanglement Swapping has module and source backlinks. `npm run check` passed; server suite passed (31 tests); `git diff --check` passed. A browser pass encountered transient Vite proxy 502s while the backend restarted after a contracts build, so export verification used the live API and Obsidian CLI. |
| 2026-10-09 | Post-restart UI and mobile smoke review | Fresh browser navigation recovered after the backend restart; export through the UI completed and reported 37 notes updated, with no console errors on the fresh load. At a 390 px viewport, document/body widths stayed below the viewport and the expanded Homework 3 topic list remained vertically accessible. Screenshots are in `output/playwright/course-map-obsidian-check.png` and `output/playwright/homework-mobile-check.png`. |
| 2026-10-09 | Class-scoped method progress | Added a learner-progress endpoint that groups saved attempts by study method without feeding the aggregate back into lesson prompts. The Study page now shows total attempts and correct/scored checks per approach, marks comparisons as uncertain across small or topic-mixed samples, and has an empty state when no answers are saved. API assertions verify explanation success, retrieval-practice miss, and that an incomplete worked-example attempt counts as activity but not as a scored outcome. The live course returned an empty array and displayed the empty state; a temporary browser route confirmed populated method bars and labels at 390 px, then was removed and the page reloaded against real data. `npm run check` passed all workspace typechecks, 31 tests, and production builds; `git diff --check` passed. The build retains its existing large-bundle warning. |
| 2026-10-09 | Method-progress clarity and mobile layout | Method rows now distinguish unscored practice from scored outcomes and show when each approach was last used. A 390 px browser review confirmed the worked-example sample reads “1/1 scored correct · 2 total attempts · 1 not scored · last used 10/9/2026” without horizontal overflow. Temporary route data was removed and the live empty state restored. `npm run check` passed (31 tests, workspace typechecks, and production builds); `git diff --check` passed. Screenshot: `output/playwright/method-progress-mobile.png`. |
| 2026-10-09 | Professor topic-list paste handling | Added a shared parser for numbered and bulleted lines, checkbox entries, comma-separated text, CRLF input, collapsed whitespace, and case-insensitive duplicate removal while preserving the first topic wording. Regression test confirms a decimal topic such as `1.5 GHz frequency shifts` is not mistaken for a numbered-list prefix. Browser form test captured the outgoing payload for a mixed-format sample: eight clean topics, one duplicate removed, wording retained, and `1.5 GHz` intact; the POST was mocked and did not modify the real course. Removed the mock and reloaded the live page. `npm run check` passed (32 tests, typechecks, production builds); `git diff --check` passed. |
| 2026-10-09 | Homework study navigation and category progress | Homework topic actions retain the extracted assignment source when opening study; category cards now label their progress as an open homework study plan and assessment-scope summaries show topic coverage, scored checks, and latest practice date. Verified by workspace typechecks, 32 server tests, production builds, and `git diff --check`. Syllabus map assessment records do not yet have learner assessment IDs, so their progress remains aggregated from shared topic evidence rather than stored per syllabus assessment. |
| 2026-10-09 | Source-specific progress and Obsidian practice notes | Learner profile now reports class-local attempt outcomes by cited material and topic. Homework progress bars use accepted-map topic counts as the denominator and source-linked attempts for practice coverage; saved answers from sourced study sessions retain their material provenance. Obsidian source notes export source totals and per-topic outcomes. Integration tests verify an incorrect attempt updates only the cited source and exports into the source note. Read-only live profile confirmed the Homework 3 source currently has 9 extracted passages and 0 practiced topics; no real attempt or vault export was made. `npm run check` passed (32 tests, all typechecks/builds); `git diff --check` passed. |
| 2026-10-09 | Math rendering and study history review | Extracted MathText normalization into the shared contracts package and added regression coverage for raw TeX plus JSON-decoded control-character repairs (`\rho`, `\theta`, `\braket`, `\frac`, `
abla`, and `
u`). Live browser review reopened a saved Homework 3 lesson and confirmed bra/ket notation, Greek symbols, fractions, tensor products, and display equations render through KaTeX; the separate Knowledge check tab also renders its question and answer options correctly without submitting an answer. Recent lesson entries now show local times, distinguishing repeated sessions. Fresh Vite console had no app errors after the contracts build. `npm run check` passed (33 tests, typechecks, production builds); `git diff --check` passed. The additional Vite process was stopped after review. |
| 2026-10-09 | Homework category counter alignment | Homework practice summaries now aggregate only the topics displayed for that homework, using source-attributed outcomes; unrelated topics practiced from the same file no longer inflate coverage or check totals. A shared helper normalizes and deduplicates topic labels, and regression coverage verifies off-list practice is excluded. Removed an unused passage join from source profile aggregation. `npm run check` passed (34 tests, workspace typechecks, and production builds); `git diff --check` passed. |
| 2026-10-09 | Homework topic-signal clarity | Homework topic rows now distinguish source-attributed homework checks from practice elsewhere in the class; the homework category’s last-practiced date is computed only from displayed topics. Full workspace check passed (34 tests, typechecks, production builds) and `git diff --check` passed. |
| 2026-10-09 | Direct homework study and source progress | Clicking a ready homework file (for example, Homework 3) starts a course-grounded session on its first mapped topic; the separate topic picker reveals six mapped topics. Each homework card shows its own source-attributed topic coverage bar and check totals, alongside existing module and assessment trackers. Browser request inspection confirmed the study request included the Homework 3 source ID; a mocked response prevented a Codex call or saved attempt. The live UI shows the corrected instructions and no app console errors after the service recovered from a transient restart. Screenshot: `output/playwright/homework-progress-live.png`. `npm run check` passed (34 tests, all typechecks and production builds); `git diff --check` passed. |
| 2026-10-09 | Adaptive homework review suggestions | Homework study now recommends a topic with a latest incorrect/incomplete/unsupported check first, otherwise an unpracticed topic, then the least recently practiced topic. Unicode-normalized topic matching keeps source progress aligned. A contract regression test covers all three priorities; a mocked live profile showed 2/6 practiced and recommended reviewing Bell States after an incorrect result, then was removed. The real profile still shows 0/6 and recommends the first unpracticed topic. Six topic actions were confirmed in the live picker. Screenshot examples: `output/playwright/homework-progress-live.png` (real profile) and `output/playwright/homework-next-review.png` (mocked recommendation). `npm run check` passed (35 tests, all typechecks and production builds); `git diff --check` passed. No Codex call, answer attempt, or persistent profile change occurred during the browser check. |
| 2026-10-09 | Homework source context in study session | Study metadata now retains the source filename after navigating from the course map, so a lesson shows “Course-grounded · Homework3_student.pdf.” Live browser navigation confirmed the correct topic and source filename with a mocked lesson response; the route was removed and the browser returned to the real course page. `npm run check` passed (35 tests, typechecks, production builds); `git diff --check` passed. The API watcher briefly returned 502 during the contracts build, recovered, and the final browser page loaded with no console errors. No Codex generation, answer attempt, or database write occurred. |
| 2026-10-09 | Obsidian source-topic progress alignment | Source notes now include accepted map topics even before they have attempts, show mapped-topic coverage, retain source-attributed outcome/date details for practiced topics, and state that activity is not mastery. Disposable-vault export assertions cover a zero-attempt mapped topic and a source-linked incorrect attempt. `npm run check` passed (35 tests, typechecks, production builds); `git diff --check` passed. No export was made to the configured personal vault. |
| 2026-10-09 | Per-category topic progress details | Module, homework, and exam topic rows now show whether a topic is unpracticed or needs review based on its latest saved check, plus correct/total checks and last-practiced date when available. Homework keeps source-specific progress separate from class-wide topic activity. Live browser review confirmed Homework 3's 0/6 topic tracker and per-topic signals on the First midterm exam; `/api/codex/status` returned a 502, but the course map and profile loaded. No study action was submitted. `npm run check` passed (35 tests, workspace typechecks, production builds); `git diff --check` passed. |
| 2026-10-09 | Assessment links in Obsidian | Syllabus assessment notes now connect to their relevant uploaded sources, modules, and topics; assignment-topic counts use assignment-source evidence while exams use class topic progress. A regression fixture with a syllabus-only topic guards against unrelated topics leaking into a homework note. Refreshed the configured vault: 37 notes written; Obsidian CLI confirmed the Homework assignments note links to 2 modules and 7 assessment topics, includes Homework 3 and syllabus sources, and reports 0 unresolved vault links. Its source note retains the narrower six Homework 3 topics. `npm run check` passed (35 tests, typechecks, production builds); `git diff --check` passed. |
| 2026-10-09 | Professor topic-list preview validation | Live browser preview cleaned a mixed numbered/bulleted topic list to 5 unique topics, preserved the decimal-numbered “1.5 GHz frequency shifts,” and explained that one duplicate was removed. Did not save the preview, so no learner scope was created. Returned the browser to the expanded course map. |
| 2026-10-09 | Scope-aware next study recommendation | The Study page now selects its next item across saved professor scopes, source-specific practice, and checked class topics; the action retains its exam or material context. Zero-check session labels are excluded from class-wide topic suggestions. With a mocked untouched exam scope, the page recommended its unpracticed topic, opened the Knowledge check tab, and sent the expected `assessmentId` in the study request. The mocked session route was removed; no model call, database session, or answer attempt occurred. `npm run check` passed (35 tests, typechecks, production builds); `git diff --check` passed. |
| 2026-10-09 | Lesson-session activity signal | Progress now reports lesson opens separately from saved checks in class topics, homework, and exam scopes; the accepted map labels lesson-only activity without counting it as practiced coverage. Obsidian source, topic, and assessment notes use the same distinction. Regression tests cover source and exam lessons before answers plus export wording. `npm run check` passed (35 tests, all typechecks and production builds); `git diff --check` passed. |
| 2026-10-09 | Two-step knowledge check | Knowledge-check answers now remain provisional until the learner explicitly submits. Before submission, the learner can change the selected answer, adjust confidence, and reveal progressive hints; once submission starts, the response remains stable for safe retry; selected answers expose visible/ARIA pressed state and keyboard focus styling. After submission, feedback and saved state behave as before. Browser review on an existing Homework 3 session confirmed KaTeX output, choice selection, confidence adjustment, and enabled submit; no answer was submitted. `npm run check` passed (35 tests, typechecks, production builds); `git diff --check` passed. |
| 2026-10-09 | Legacy homework-session source attribution | Sessions missing `sourceMaterialId` can recover assignment context only when marked course-grounded and their saved lesson mentions exactly one imported filename; ambiguous duplicates remain unattributed. A regression test strips the ID, verifies source progress and session reopening, then confirms duplicate names disable inference. The real profile now attributes 1 of 3 older Homework 3 sessions; the other two lack identifying evidence. Updated the homework card to show 1 source-grounded lesson session while keeping mapped topic coverage at 0/6 and checks at 0. Refreshed 37 notes in the configured Obsidian vault; the Homework 3 source note reports 1 lesson session and 0/6 mapped topics started, Obsidian reports 0 unresolved links, and backlinks resolve to the course, assessment, and all 6 mapped topics. `npm run check` passed (35 tests, typechecks, production builds); `git diff --check` passed. |

| 2026-10-09 | Assignment study entry and cross-category progress | Homework cards now have a clear, screen-reader-labeled ‘Study this homework’ action that opens a recommended topic grounded in the assignment; the topic picker remains available. Module, assignment, and exam map cards report lesson-started topic coverage separately from topics with saved checks, and progress bars use lesson coverage. Homework cards distinguish mapped-topic progress from category-level sessions, avoiding false attribution of an old ‘Homework 3’ session to a mapped concept. Added regression cases for coverage and Obsidian export. Live map showed the explicit Homework 3 action and consistent metrics; its source note reports 1 homework-level session, 0/6 mapped topics started, and 0 unresolved vault links after export. `npm run check` passed (36 tests, typechecks, production builds); `git diff --check` passed. A direct live export request briefly returned 500, but an isolated export using the same database and vault configuration succeeded and refreshed all 37 notes. The browser still intermittently shows a stale offline banner after builds although course endpoints respond 200. |

| 2026-10-09 | Professor-scope progress coverage | Saved instructor topic scopes on the Study page now show independent lesson-start and knowledge-check coverage bars, computed from that scope’s own per-topic sessions and attempts. The summary also shows last lesson and last check dates separately; opening a lesson no longer contributes to checked-topic progress. `npm run check` passed (36 tests, workspace typechecks, production builds); `git diff --check` passed. Existing Vite advisory remains: main JS chunk is about 924 kB (>500 kB threshold). |

| 2026-10-09 | Method switching after uncertain checks | Saved answers are now attributed to the method of the active lesson, even if the top-level method selector is changed for a future session. After an incorrect answer, low-confidence correct answer, or two-plus hints, the learner can start a new worked-example or clear-explanation session on the same topic; assignment and exam grounding are retained. The session recap now reports the active lesson’s method. `npm run check` passed (36 tests, typechecks, builds); `git diff --check` passed. The existing large Vite bundle advisory remains (~924 kB). |
| 2026-10-09 | Consistent category progress indicators | Module and assessment cards now show separate lesson coverage and knowledge-check coverage. Homework assessment coverage reads signals only from assignment-linked source materials, while module and exam coverage remain class-wide; homework file cards continue to report source-specific coverage. Updated the map note to state these scopes. Browser review showed both progress bars on module/exam/homework categories, expanded Homework assignments to Homework 3, clicked its recommended-topic action, and verified the study page opened on the selected topic with the Homework 3 source label. The lesson response was mocked; no model call or answer attempt was made. Knowledge check tab rendered separately. `npm run check` passed (36 tests, typechecks, production builds); `git diff --check` passed. The existing Vite chunk-size advisory remains (~924 kB > 500 kB).
| 2026-10-09 | Mobile category progress and Obsidian read-only audit | At 390 px, the progress rows initially forced horizontal overflow; changed them to stack each label/count above its bar. Recheck shows body/document width exactly 390 px, and the assignment tracker fits without clipping. Obsidian CLI confirmed the Homework assignments note links to its two modules, two sources, and seven topics; source backlinks include Course and both source notes; the source note records 1 lesson session and 0/6 mapped topics started; metadata cache reports 0 unresolved links. Read-only vault inspection only; no export write was needed for this UI-only change. Final `npm run check` passed (36 tests, typechecks, production builds); `git diff --check` passed. The existing Vite chunk advisory remains (~924 kB).
| 2026-10-09 | Method-switch browser validation and map mismatch diagnostics | With mocked study-session and attempt endpoints, browser flow confirmed that changing the selector to Quiz first does not relabel the active explanation attempt, and the reinforcement request switches to worked-example while retaining the homework source ID. No model call or database attempt was made. Map validation errors now preserve structured API diagnostics through the client and show an expandable report in the course map; a mocked browser failure displayed material IDs, reference counts, source stats, and omitted passages. Added an API regression case for an unexpected source ID. `npm run check` passed (36 tests, typechecks, production builds); `git diff --check` passed. Existing Vite chunk warning remains (~928 kB > 500 kB).
| 2026-10-09 | Markdown math delimiter support | Math rendering now normalizes LaTeX `\\(...\\)` to inline Markdown math and standalone `\\[...\\]` to a fenced display-math block; inline answer choices keep display delimiters inline, and math-looking text in code spans/fences is preserved. Study generation, adaptive questions, and side-chat prompts now request consistent math delimiters. Added regression coverage for delimiter conversion, decoded control characters, and code preservation. Browser verification with mocked lesson content rendered rho/theta inline and a fraction in KaTeX display mode; no raw TeX commands appeared in rendered text. `npm run check` passed (36 tests, typechecks, production build); `git diff --check` passed. Existing Vite bundle advisory remains (~929 kB > 500 kB).
| 2026-10-09 | Scored versus unscored progress and Obsidian output | Progress now keeps all saved attempts separate from scored correct/incorrect checks across concepts, homework sources, and exam scopes. Course-map and Study views use only scored answers for accuracy, explicitly label unscored attempts, and prioritize a latest ungraded response for review. Obsidian source, topic, and assessment notes now use the same scored denominator. Regression coverage includes mixed scored/unscored attempts in the API and a disposable Obsidian export. `npm run check` passed (36 tests, typechecks, production builds); `git diff --check` passed. A read-only check of the running PHGN 519 profile confirmed the new fields are present; its current saved attempt counts are zero. The existing Vite chunk-size advisory remains (~931 kB > 500 kB).
| 2026-10-09 | Deterministic latest-attempt ordering | Same-millisecond learner attempts now use SQLite row order as a stable tie-break when computing latest outcomes, preventing an older result from appearing as the newest. The Obsidian regression saves a scored and unscored attempt back-to-back and verifies the exported topic uses the scored denominator and latest outcome. Targeted Obsidian tests and full `npm run check` passed (36 tests, typechecks, production builds); `git diff --check` passed. |
| 2026-10-09 | Refreshed live Obsidian study notes | Used the configured local export for PHGN 519; it updated 37 notes after the scored/unscored progress changes. A read-only file audit found 299 wikilinks across the course folder and zero unresolved note targets; the course index has a fresh export timestamp, Homework 3 shows one lesson session and no saved checks, and the generated notes retain their learner-owned `My notes` sections. The Obsidian CLI returned no help output in this locked desktop session, so this was a file-level audit rather than an in-app graph review. The disposable export tests and 36-test full workspace check pass; `git diff --check` passes. |
| 2026-10-09 | Knowledge-check draft restoration | The tab-scoped draft now preserves the selected option, confidence, revealed-hint count, and active Lesson/Knowledge check tab across reloads; draft data clears after a saved attempt and is never counted as progress. Browser verification on the existing PHGN Homework 3 session confirmed the selected answer, 0.75 confidence, and Knowledge check tab restored after reload, while the server still reports zero attempts. The temporary sessionStorage draft was cleared after verification. `npm run check` passed (36 tests, typechecks, production builds); `git diff --check` passed. |
| 2026-10-09 | Assignment progress scoped to homework evidence | Live course-map review confirmed the assignment parent card opens a named, enabled `Homework 3` study action with an optional topic picker; selecting a homework action passes its source material ID into the study route. Fixed the parent assignment coverage to count only topics cited by assignment files, rather than every topic in connected modules: PHGN 519 now shows 6 homework topics, matching the Homework 3 file’s own 6-topic tracker. Exam progress remains class-wide and uses its connected topics. No study session or check was created during this review. `npm run check` passed (36 tests, typechecks, production builds); `git diff --check` passed. |
| 2026-10-09 | Obsidian homework-scope alignment audit | Assignment assessment notes now restrict connected-topic progress to concepts cited by uploaded assignment materials when mapped topics exist; module links remain available for broader context. Added a regression case for a topic connected only through the module. Refreshed the live PHGN 519 vault (37 notes); the Homework assignments note now lists the same six topics as the Homework 3 source note. A file-level vault audit found 0 unresolved wikilinks and balanced generated-section markers in all 37 notes. `npm run check` passed (36 tests, typechecks, production builds); `git diff --check` passed. |
| 2026-10-09 | Preserve selected homework and exam scope into lesson generation | Following the Homework 3 study action now carries its material ID from the route through the Study form into the generation request. The form shows the selected course file and grounding behavior, with a clear-scope action; assessment IDs are preserved the same way. Browser verification intercepted the request and confirmed the Homework 3 topic, method, and material ID in its payload without calling the model. The saved-session list remained unchanged (five existing sessions, zero attempts on each). `npm run check` passed (36 tests, typechecks, production builds); `git diff --check` passed. |
| 2026-10-09 | Append revised instructor topics without losing scope history | Added a PATCH operation and “Add topics to this list” flow for professor scope updates. It appends only new normalized topic names, leaves existing topic rows and their evidence untouched, and reports when all pasted topics already exist. Integration coverage studies an existing topic before appending and confirms its row ID and session count remain intact. A browser-only mocked-scope run verified the UI skips a duplicate and adds a new topic as a separate row; the mock was removed, and live PHGN 519 still has no learner scopes and unchanged Homework 3 progress. `npm run check` passed (36 tests, typechecks, production builds); `git diff --check` passed. |
| 2026-10-09 | Math rendering across course-map review and accepted map | Source summaries, missing-coverage notes, draft module/assessment text, accepted module and topic titles/descriptions, and assignment-linked module labels now use the shared inline MathText renderer. An isolated browser response mock injected bra-ket notation into each course-map surface; six KaTeX renderings appeared and no raw TeX commands remained visible. The mock was removed and the real PHGN course page reloaded. Full `npm run check` passed (36 tests, typechecks, and production builds); `git diff --check` passed. |
| 2026-10-09 | Live Obsidian side-brain refresh and graph audit | Refreshed the configured PHGN 519 vault from the current local profile; the API reported 37 notes written at 2026-10-09T21:11:57.142Z. Obsidian CLI indexed all 37 course notes and reported 0 unresolved links; Homework 3 backlinks include the course, assignment note, its cited modules, and mapped topics. A file-level audit confirmed exactly one generated-section marker pair per note and consistent Homework 3 values (1 homework-level session, 0/6 mapped topics started). No populated personal `My notes` sections were found; existing generated-section preservation is covered by the disposable-vault regression test. |
| 2026-10-09 | Keyboard-accessible lesson and knowledge-check tabs | The study tabs now follow keyboard tab conventions: Left/Right moves and wraps, Home/End jumps to the first/last tab, focus follows the active tab, and only the active tab is in the tab sequence. Both panels remain mounted so each `aria-controls` link resolves, with the inactive panel hidden from view. Mocked browser checks verified keyboard movement, focus, selected state, valid panel relationships, and correct hidden/visible state; the generation request was intercepted, so no session or attempt was persisted. `npm run check` passed (36 tests, typechecks, and production builds); `git diff --check` passed. |
| 2026-10-09 | Consistent study-method history and progress | A shared label now identifies “Quiz first” consistently in session history, method progress, saved-attempt evidence, and session recap. Method progress merges legacy `quiz` attempts with current `retrieval-practice` attempts so historical activity does not split across two bars. Added API regression coverage for both aliases; a mocked browser showed matching Quiz first labels in history and progress. `npm run check` passed (36 tests, typechecks, production builds); `git diff --check` passed. |
| 2026-10-09 | Obsidian study-method progress and end-to-end export | Course notes now include saved knowledge-check counts grouped by study approach, with scored/unscored attempts, confidence signals, last-practiced date, and a small-sample caveat. A disposable-class integration test covers quiz generation, correct answer submission, legacy/current method aggregation, and export of method progress alongside assessment evidence to a temporary vault. Refreshed the configured PHGN 519 vault (37 notes); Obsidian CLI confirmed 0 unresolved links and 36 backlinks to the course index. The real course profile has no saved checks, so its index correctly reports the empty state. `npm run check` passed all workspace typechecks, 37 tests, and production builds; `git diff --check` passed. Build retains the existing large-bundle advisory. |
| 2026-10-09 | Include lesson-only topics in next-study suggestions | The class-wide next-study recommender previously filtered to topics with saved attempts, so a topic with lesson activity but no knowledge check could never be suggested for its first retrieval attempt. It now evaluates all learner concepts, including lesson-only topics; a regression test verifies that an unchecked lesson topic is recommended ahead of already-checked material. `npm run check` passed all workspace typechecks, 38 tests, and production builds; `git diff --check` passed. The existing large-bundle advisory remains. |
| 2026-10-09 | Instructor topic priorities guide study recommendations | Added an importance selector to saved professor-scope topics, persisted through a class-scoped API update, and kept the updated priority visible in the saved scope. Next-topic selection now prefers high-priority topics within the same recommendation reason while still putting topics needing review ahead of untouched topics. Regression coverage checks priority ordering, successful persistence, and invalid-priority rejection; all runs use a disposable class. `npm run check` passed all workspace typechecks, 38 tests, and production builds; `git diff --check` passed. The existing large-bundle advisory remains. |
| 2026-10-09 | Preserve instructor topic priority in Obsidian | Exam-scope topic lines in exported assessment notes now include each topic’s priority. The disposable quiz-to-export integration asserts that a high-priority saved topic appears alongside its scored check result; all 38 tests, workspace typechecks, and production builds pass. `git diff --check` passed; existing bundle-size advisory remains. |
| 2026-10-09 | Follow-up audit of priority continuity | Verified the high-priority topic path from saved instructor scope through recommendation and Obsidian export with disposable data. The live course page briefly showed the offline state even though the API health and course endpoints returned 200; no live learner or Obsidian data was changed during this check. Full workspace checks remain green (38 tests and all builds); `git diff --check` passed. |
| 2026-10-09 | Apply instructor priorities across study scopes | Centralized final recommendation ordering so high-priority topics remain preferred when candidates come from different exams, homework sources, and class progress. Review-needed candidates still outrank untouched topics; priority then breaks ties before recency/context. A regression verifies cross-scope ordering and that sorting does not mutate the caller’s candidates. `npm run check` passed all workspace typechecks, 39 tests, and production builds; `git diff --check` passed. The live API responded normally, but the already-open browser remained on its stale 502 state, so no claim is made about this pass’s browser rendering. Existing large-bundle advisory remains. |
| 2026-10-09 | Disposable browser verification of topic priority | Used a temporary SQLite database/course behind the existing local frontend. The browser showed the per-topic High/Normal/Low selector and the high-priority recommendation; changing Bell states to Low persisted to the temporary API and immediately moved the next recommendation to Partial trace. Deleted the disposable database/course afterward and restored the original PHGN URL. No PHGN records or vault notes were changed. |
| 2026-10-09 | Set priorities while pasting instructor topics | The cleaned professor-list preview now lets the learner choose High, Normal, or Low for each parsed topic before creating or extending an exam scope; saved scopes retain per-topic controls afterward. In a disposable browser run, pasted a numbered three-topic list, set Bell states to High, saved the scope, verified the API profile retained `importance: high`, and confirmed the next-study card recommended Bell states. Removed the temporary DB/course and restored the PHGN URL. `npm run check` passed 39 tests, workspace typechecks, and production builds; `git diff --check` passed. Existing bundle advisory remains. |
| 2026-10-09 | Show topic mix beside study-method results | Method progress now includes a sorted set of topic titles and distinct topic count, shown as an expandable “View topic mix” under each approach and included in Obsidian’s Practice by study approach section. Regression coverage confirms repeated checks on one topic count it once, different topics remain scoped by method, and the disposable quiz export names its topic. Live PHGN method progress remains empty, consistent with its zero saved checks; no live learner or vault data changed. `npm run check` passed all workspace typechecks, 39 tests, and production builds; `git diff --check` passed. The existing large-bundle advisory remains. |
| 2026-10-09 | Track confidence alignment by study approach | Method progress now calculates the average gap between confidence ratings and scored outcomes, with a visible rated-check count and plain-language interpretation (lower is closer to outcomes). Unscored attempts and un-rated answers do not enter the metric; empty groups show no estimate. API regressions verify the calculation, denominator, method grouping, and null empty state; disposable Obsidian integration verifies export. `npm run check` passed workspace typechecks, all 39 tests, and production builds; `git diff --check` passed. Existing large-bundle advisory remains. |
| 2026-10-09 | Explain confidence alignment on the Study page | Added a plain-language definition beside method progress so learners know the confidence gap is the average distance between rated confidence and scored outcomes; lower values indicate closer alignment. Full workspace checks pass (39 tests, typechecks, production builds) and `git diff --check` is clean. Read-only browser verification reached the running app and confirmed the empty library state; no saved courses or learner data were modified. |
| 2026-10-09 | Surface review needs in category progress | Module, exam, and homework progress summaries now show how many topics have a latest result needing review and how many have no saved knowledge check. Review counts use only each topic’s latest outcome; lesson-only topics remain unchecked until a check is saved. Regression coverage verifies the review and unchecked counts while preserving scoped coverage behavior. `npm run check` passed all workspace typechecks, 39 tests, and production builds; `git diff --check` passed. The existing large-bundle advisory remains. |
| 2026-10-09 | Verify category review counts across study scopes | Confirmed category summaries deduplicate repeated displayed topic titles, exclude unrelated topics, count lesson-only topics as unchecked, and flag topics from the latest review-needed outcome. Homework review counts are derived from that assignment’s grounded topic signals. Full workspace checks passed (39 tests, typechecks, and production builds); `git diff --check` passed. |
| 2026-10-09 | Reset confidence for a repeated check | Retrying the same question now resets confidence to the neutral “Somewhat” rating along with the answer and hints, so the next saved attempt records a fresh confidence judgment. Full workspace check passed all 39 tests, typechecks, and builds after one unrelated transient 1-second Codex runner test timeout; `git diff --check` passed. |
| 2026-10-09 | Make knowledge-check feedback confidence-aware | Post-answer guidance now distinguishes a confident miss, an uncertain correct answer, an answer reached with hints, and a confident correct answer. Confident misses get a one-click path back to the lesson; reopened legacy attempts without confidence use neutral feedback. Workspace typechecks, all 39 tests, and production builds passed; the existing large-bundle advisory remains. |
| 2026-10-10 | Align Obsidian category progress with the app | Exported module notes now count any saved attempt toward knowledge-check topic coverage (including unscored attempts), and module/exam-scope notes include topics needing review and topics without checks. Disposable export regressions verify unscored coverage, latest-result review counts, and untouched topics. `npm run check` passed all workspace typechecks, 39 tests, and production builds; `git diff --check` passed. Existing large-bundle advisory remains. |
| 2026-10-10 | Accurate reopened-attempt feedback | Reopened saved answers now use the stored outcome, recorded confidence, and hint count for feedback and reinforcement suggestions. Legacy attempts with no confidence show “confidence not recorded” instead of a fabricated default. `npm run check` passed all workspace typechecks, 39 tests, and production builds; `git diff --check` passed. Existing large-bundle advisory remains. |
| 2026-10-10 | Refresh README feature and limitation summary | Replaced the outdated foundation-only overview with the current study methods, progress signals, instructor topic-list workflow, interactive map, one-way Obsidian export, math rendering, and explicit limits. Documentation review and `git diff --check` passed; no application code changed. |
| 2026-10-10 | Guard Obsidian export against nested symlinks | Export now validates each generated note folder and file under the resolved class folder before writing; symlinked folders/files and non-file targets are rejected. A disposable-vault regression proves a symlinked `sources` folder cannot write outside the vault. `npm run check` passed all workspace typechecks, 40 tests, and production builds; `git diff --check` passed. Existing Vite large-bundle advisory remains. |
| 2026-10-10 | Remove duplicate saved-question retry action | Reopened knowledge checks now show the exact-question retry action once; the saved-attempt feedback already contains the correct retry path. `npm run check` passed all workspace typechecks, 40 tests, and production builds; `git diff --check` passed. Existing large-bundle advisory remains. |
| 2026-10-10 | Verify instructor scope survives course-map refresh | The disposable course-map workflow now creates a high-priority instructor topic scope before accepting a refreshed map and confirms its title, exact topic wording, and priority remain intact after map acceptance and a database-backed service restart. `npm run check` passed all workspace typechecks, 40 tests, and production builds; `git diff --check` passed. |
| 2026-10-10 | Accept semicolon-separated instructor topic lists | The topic parser and preview count now treat semicolons like commas and line breaks, and the paste hint documents all three formats. Parser coverage checks mixed numbered, bulleted, comma-separated, and semicolon-separated entries, including decimal text. `npm run check` passed all workspace typechecks, 40 tests, and production builds; `git diff --check` passed. |
| 2026-10-10 | Verify instructor wording reaches generated practice | Exam-scope integration coverage now inspects the structured prompt input for the exact saved scope title and topic on both initial lesson generation and adaptive next-question generation, and verifies the adaptive instruction preserves instructor wording. `npm run check` passed all workspace typechecks, 40 tests, and production builds; `git diff --check` passed. |
| 2026-10-10 | Keep imported Obsidian wikilinks literal | Extracted source passages now entity-escape Obsidian `[[wikilinks]]` and `![[embeds]]` so source material does not create unintended vault relationships; generated Local Learning Studio links remain active. Disposable export assertions verify link/embed text stays literal. `npm run check` passed all workspace typechecks, 40 tests, and production builds; `git diff --check` passed. |
| 2026-10-10 | Show study-method outcomes by topic | Method progress now includes per-topic attempt counts, scored correct counts, unscored counts, confidence gaps, and last-practiced timestamps. The Study page exposes these in an expandable topic-results list, and Obsidian course notes export the same breakdown. Disposable integration coverage verifies scored and unscored topic rows and export content. `npm run check` passed all workspace typechecks, 40 tests, and production builds; `git diff --check` passed. |
| 2026-10-10 | Include topic recency in method progress views | The expandable Study topic results and Obsidian course export now display each topic's last-practiced date alongside attempts, outcomes, and confidence gap. Updated the export regression assertion to verify the timestamp. `npm run check` passed all workspace typechecks, 40 tests, and production builds; `git diff --check` passed. Existing Vite large-bundle advisory remains. |
| 2026-10-10 | Keep colliding Obsidian note names distinct | Topic and module keys that normalize to the same filename now receive stable short hash suffixes so exports retain separate notes and links. Added disposable-vault regression coverage for colliding topic and module keys. `npm run check` passed all workspace typechecks, 40 tests, and production builds; `git diff --check` passed. Existing Vite large-bundle advisory remains. |
| 2026-10-10 | Make optional study budgets sum exactly | Time-budget topic input now uses the same numbering, bullet, comma, and semicolon cleanup as instructor scope. Minute allocation uses proportional largest remainders, keeps weak topics slightly weighted, and always matches the entered total. Added checks for exact totals, weighting, and very small budgets. `npm run check` passed all workspace typechecks, 41 tests, and production builds; `git diff --check` passed. Existing Vite large-bundle advisory remains. |
| 2026-10-10 | Reject Obsidian class-folder symlinks | Export now rejects a generated class folder that is a symlink, including links to another location inside the vault, and verifies its resolved path stays within the configured notes root. A disposable-vault regression checks the sibling class note remains untouched. `npm run check` passed all workspace typechecks, 42 tests, and production builds; `git diff --check` passed. Existing Vite large-bundle advisory remains. |
| 2026-10-10 | Browser-validate learner planning and exam scope | Ran the web app against an isolated temporary database and exercised the optional budget and instructor topic-list flows in Playwright. The budget showed an exact 11-minute total; mixed numbering, bullets, commas, and semicolons yielded three unique saved topics; raising one topic to high priority updated the next-study recommendation. The clean browser session had no application console errors. Temporary services and database were removed. |
| 2026-10-10 | Fix math wrapping in knowledge-check choices | Browser validation of a saved quantum-information lesson found each answer's math text was inheriting the 25px choice-marker styling, causing equations and prose to wrap into narrow columns. Scoped marker styling to the first child and let the math column fill available width. In a disposable copy, browser checks confirmed readable KaTeX choices, lesson/check tabs, a saved correct attempt, feedback, and updated topic/method progress without a model call. `npm run check` passed all workspace typechecks, 42 tests, and production builds; `git diff --check` passed. Existing Vite large-bundle advisory remains. |
| 2026-10-10 | Validate Obsidian export against a disposable course copy | Exported the current Quantum Information course into an isolated vault from a copy of the local database and files. The export wrote 37 notes with 298 wikilinks and zero missing note targets; a second export preserved learner-authored text and retained one balanced generated section. This found a macOS symlink-path issue in the API's reported folder path; the API now reports the vault-relative path, with regression coverage. `npm run check` passed all workspace typechecks, 42 tests, and production builds; `git diff --check` passed. Existing Vite large-bundle advisory remains. The configured live vault was not modified. |
| 2026-10-10 | Distinguish lesson-only topics in next-study prompts | Recommendations now distinguish topics with lesson sessions but no saved knowledge check from untouched topics. The study dashboard explains that the first check is due, and homework cards invite a first check instead of saying the topic was not practiced. Review-needed topics remain highest priority. Updated recommendation coverage; `npm run check` passed all workspace typechecks, 42 tests, and production builds; `git diff --check` passed. Existing Vite large-bundle advisory remains. |
| 2026-10-10 | Add schedule details to instructor topic scopes | The instructor topic-list form now accepts an optional assessment date/time and available study minutes, persists both with the saved scope, and displays them in the saved scope header. API integration coverage verifies these metadata round-trip through the learner profile. Browser review confirmed the labeled fields, cleaned two-item numbered/bulleted topic preview, no horizontal overflow at 390 px, and zero browser errors; the form was reloaded without saving, so the live class was unchanged. `npm run check` passed all workspace typechecks, 42 tests, and production builds; `git diff --check` passed. Existing Vite large-bundle advisory remains. |
| 2026-10-10 | Make assessment study plans persistent and progress-aware | Reworked the optional budget into a named, saved plan: repeated saves update its assessment date/time budget and append only new topics, while exact title matches link to existing class concepts and preserve their evidence. The saved scope displays local-date deadline status and per-topic suggested minutes; allocations use priority, incorrect/incomplete outcomes, practice coverage, accuracy, and recency, and always total the available minutes. Browser validation used request interception to confirm the exact saved payload, a 30-minute plan rebalance (22/8 minutes under mocked learner signals), and repeat-save behavior (one metadata PATCH with no duplicate create or topic append). Removed mocks and reloaded the real class; only its existing Homework 3 data appeared, with no study data written. Added API, plan-weighting, deadline-boundary, and concept-link coverage. `npm run check` passed all workspace typechecks, 44 tests, and production builds; `git diff --check` passed. Existing Vite large-bundle advisory remains. |
| 2026-10-10 | Export study plans to Obsidian assessment notes | Learner assessment notes now include the deadline status, available study minutes, and per-topic suggested allocation beside topic progress and provenance. Disposable-vault integration coverage verifies the due label, exported budget, and that topic allocations total the saved 90-minute budget. `npm run check` passed all workspace typechecks, 44 tests, and production builds; `git diff --check` passed. Existing Vite large-bundle advisory remains. |
| 2026-10-10 | Schedule daily assessment study sessions | Saved assessment scopes now have an editable daily-minute cap (default 45); plans distribute topic study time over the available days before the exam and show each day's topics, date, and minutes. The UI reports when the deadline is missing/past or the daily cap leaves some minutes unscheduled. Obsidian assessment notes export the same day plan and capacity warning. Tests cover distribution, cap, deadline states, persistence, and export. `npm run check` passed all workspace typechecks, 45 tests, and production builds; `git diff --check` passed. Browser request-interception validation saved a 90-minute scope at 30 minutes/day and showed three 30-minute sessions; mocked data was removed before reloading the live class. Existing Vite large-bundle advisory remains. |
| 2026-10-10 | Preserve professor wording with exam topic scopes | Assessment scopes retain the exact pasted wording separately from cleaned topics, including optional instructor caveats. Wording can be edited after saving and is exported into the matching Obsidian assessment note as inert verbatim text (Obsidian wikilinks remain literal). Browser validation confirmed caveats are not counted as study topics and the form can be discarded without writing to the real class; API/export regressions cover create, edit, preservation across plan updates, and Obsidian escaping. `npm run check` passed all workspace typechecks, 45 tests, and production builds; `git diff --check` passed. Existing Vite large-bundle advisory remains. |
| 2026-10-10 | Add comments anchored to source passages | Course materials now have a “Review & comment” view with page/slide/line-located passages, persistent comments, edit/delete, and an old-extraction state that preserves the prior excerpt instead of shifting a comment to changed text. Obsidian source notes place current comments beside their passage and keep stale comments under their own section; wikilinks in comments stay inert. Browser validation created, edited, and deleted a temporary comment on Homework 3, then confirmed the live annotation list was empty. Disposable API/export tests cover persistence, invalid/cross-class references, stale anchors, and refreshed Obsidian notes. At 390 px the review panel fit its card width; the existing full course page still has horizontal overflow from its wide course map. `npm run check` passed all workspace typechecks, 45 tests, and production builds; `git diff --check` passed. Existing Vite large-bundle advisory remains. |
| 2026-10-10 | Track independent and supported practice by method | Practice-by-approach now separates independently correct scored checks from hinted, assisted, and unknown-independence scored checks, with the same breakdown for each topic. The Study page and Obsidian Course note show the additional signals while retaining warnings that method comparisons are uncertain and do not establish mastery. Learner API and Obsidian export regression assertions cover aggregate and per-topic values. `npm run check` passed workspace typechecks, all 45 tests, and production builds; `git diff --check` passed. Existing Vite large-bundle advisory remains. |
| 2026-10-10 | Improve narrow-screen Obsidian export header | Responsive browser review at 390 px found the Obsidian card title and description squeezed beside the vault status badge. The mobile header now uses a two-column icon/content layout and puts the status badge below the text. Playwright confirmed the content width is no longer squeezed, the document scroll width stays at 390 px, and there are no browser errors or warnings. The course map’s module strip scrolls inside its own region; the document itself has no horizontal overflow in this current build. `npm run check` passed all workspace typechecks, 45 tests, and production builds; `git diff --check` passed. Existing Vite large-bundle advisory remains. |
| 2026-10-10 | Make study-method progress easier to scan | Reworked “Practice by approach” so its explanation spans the panel and each study method appears in its own card; increased mobile summary and topic-result type for readability. On a temporary database copy, browser review at 390 px and 1440 px confirmed all three method cards, expanded per-topic evidence, and no document overflow. Temporary independent, hinted, and assisted attempts were written only to the copied database; no model call was made. `npm run check` passed all workspace typechecks, 45 tests, and production builds; `git diff --check` passed. Existing Vite large-bundle advisory remains. |
| 2026-10-10 | Record outside help during knowledge checks | Added an optional “I used help outside these hints” control; unfinished checks save this choice in the local attempt draft, saved attempts distinguish independent, hinted, and assisted evidence, and reopened answers retain the support label. A correct answer reached with outside help now recommends an unaided transfer check. Browser validation on a temporary database copy confirmed the outside-help choice survives reload, hinted and assisted answers receive separate labels and method/topic counts, and the control fits at 390 px. Obsidian integration coverage verifies assisted method and topic signals in exported Course notes. No model calls or writes to the original database or configured vault were made. `npm run check` passed workspace typechecks, all 45 tests, and production builds; `git diff --check` passed. Existing Vite large-bundle advisory remains. |

| 2026-10-10 | Show correct/total results for supported checks | Method progress now reports correct/total for hinted checks, checks completed with outside help, and checks whose support was not recorded. The same aggregate and per-topic evidence appears on the Study page and in Obsidian Course notes. Integration tests cover successful and missed supported checks, the API contract, and exported wording. `npm run check` passed workspace typechecks, all 45 tests, and production builds; `git diff --check` passed. Existing Vite large-bundle advisory remains. |

| 2026-10-10 | Add a review index to Obsidian source notes | Source notes now summarize the number of passages with current learner comments and provide quick links directly to those passages. Passage anchors are explicit and stable; comment previews escape Obsidian link syntax to keep imported text inert. Disposable-vault regression verifies the summary, working jump anchor, original passage comment, and safe link text. `npm run check` passed all workspace typechecks, all 45 tests, and production builds; `git diff --check` passed. Existing Vite large-bundle advisory remains. |

| 2026-10-10 | Make Obsidian topic notes queryable | Topic notes now export actual Obsidian YAML properties for course identity, stable topic key, practice status, attempt/scored/correct counts, linked modules, and source count. Repeated exports update app-owned fields and preserve learner-added properties. Disposable export regression checks review-needed, not-started, and checked transitions, frontmatter counts, and learner-property preservation. `npm run check` passed all workspace typechecks, all 45 tests, and production builds; `git diff --check` passed. Existing Vite large-bundle advisory remains. |

| 2026-10-10 | Improve mobile instructor topic-list header | At 390px, the Add topic list button was squeezed beside its heading and wrapped every word. The header now stacks on small screens, leaving the control a readable width. Browser review verified 375px content width with no horizontal overflow, opened a saved knowledge-check session without submitting an answer, and confirmed rendered math plus saved outside-help feedback. Captured browser warnings came from an unrelated Chrome extension; no app console errors were recorded. `npm run check` passed workspace typechecks, all 45 tests, and production builds; `git diff --check` passed. Existing Vite large-bundle advisory remains. |

| 2026-10-10 | Distinguish assignment-wide checks from topic progress | Assignment cards now show saved checks that are grounded in a homework source but attached to a generic assignment concept, separate from the accepted topic counters. The card explains that topic coverage only advances for a mapped topic and the topic picker offers the six explicit choices. Live browser review confirmed Homework 3 shows 1/1 correct at assignment level while all six topic trackers remain untouched; expanding the picker did not create an attempt. Refreshed the configured Obsidian vault through the app (37 notes); direct Markdown audit found 21 topic notes with metadata, 319 resolvable internal links, no bad managed-section markers, and the source review index. Obsidian CLI was unavailable because it reported the vault not found; the file audit verified the exported notes directly. `npm run check` passed workspace typechecks, all 45 tests, and production builds; `git diff --check` passed. Existing Vite large-bundle advisory remains. |

| 2026-10-10 | Add closed-book free-recall practice | The study space now offers an open-ended recall method with a typed response, saved draft recovery, and a reference explanation shown after submission. Recall attempts are explicitly ungraded, retained in session history, counted as attempts without inflating scored correctness, and labeled in Obsidian exports. Legacy SQLite method constraints remain compatible. Live UI review confirmed the method picker and its description without creating learner activity; disposable integration coverage verified save/reopen, unscored method progress, and Obsidian export. `npm run check` passed all workspace typechecks, all 46 tests, and production builds; `git diff --check` passed. Existing Vite large-bundle advisory remains. |

| 2026-10-10 | Protect unaided recall and use a true open-response contract | During an unanswered free-recall session, the lesson tab and side chat stay unavailable until the learner saves a response. Free-recall sessions and adaptive follow-ups now have no choices or answer key in their API shape; reopened sessions created by the earlier version discard its unused multiple-choice placeholders. Optional in-app hints are clearly described and remain recorded separately. Integration coverage checks the response lifecycle, follow-up question schema, legacy-session normalization, unscored progress, and Obsidian export. Browser review confirmed formatted quantum equations in an existing lesson and knowledge check with no page console errors. `npm run check` passed all workspace typechecks, all 46 tests, and production builds; `git diff --check` passed. Existing Vite large-bundle advisory remains. |

| 2026-10-10 | Preserve saved learner responses in an Obsidian study journal | Obsidian exports now create a linked Study Journal with each saved prompt, learner response, scored or unscored outcome, method, confidence, hint/support signals, assessment, and linked course sources. Imported wikilinks and generated-section markers in learner responses are neutralized; math delimiters stay in Markdown, and learner notes outside the managed section survive refresh. Integration coverage checks journal links, response content, escaping, and refresh preservation. Refreshed the configured local vault: 38 notes updated. Direct audit of the journal found two saved entries, matching prompt/response sections, preserved math delimiters, balanced managed markers, and the learner notes area; response text was not printed during the audit. `npm run check` passed all workspace typechecks, all 46 tests, and production builds; `git diff --check` passed. Existing Vite large-bundle advisory remains. |

| 2026-10-10 | Repair Obsidian journal math and repeat-export frontmatter | Journal export now applies the same repair for control characters inside LaTeX as the web renderer, so a saved prompt with a stray control character before `\ket` exports as valid `\ket` notation. Topic-note property refresh now accepts and repairs the legacy `---# Heading` boundary created by earlier repeated exports, and regression coverage verifies a refreshed topic note retains valid frontmatter, generated content, and learner-owned metadata. Refreshed the configured local vault successfully (38 notes); direct file audit confirmed the saved prompt no longer contains the stray control character and the affected topic note has a valid YAML boundary. `npm run check` passed workspace typechecks, all 46 tests, and production builds; `git diff --check` passed. Existing Vite large-bundle advisory remains. |

| 2026-10-10 | Split browser pages into route-loaded chunks | The course, study, information, and hand-tracking pages now load on demand with an accessible loading status. The production build separates the ~966 kB initial JavaScript bundle into a ~193 kB app entry plus route and math chunks; no chunk exceeds Vite’s 500 kB warning threshold. Live browser review opened the Study route, reopened a saved lesson, switched to the separate Knowledge check tab, and confirmed the saved Bell-state notation appears as formatted math; the saved attempt was read-only and no new attempt was created. `npm run check` passed all workspace typechecks, all 46 tests, and production builds; `git diff --check` passed. |

| 2026-10-10 | Schedule evidence-based spaced review | Correct checks now receive deterministic 1-, 3-, or 7-day recall intervals based on accuracy, confidence, and independent results; misses and ungraded responses retain their existing remediation paths. Due dates appear in class recommendations and homework/exam topic summaries, and due actions start Quiz first while preserving the course and assessment/material scope. Contract, service, progress-summary, and navigation tests cover interval selection, priorities, due labels, and scoped method routing. `rtk npm run check` passed all workspace typechecks, 62 server tests, 30 web tests, and production builds; `rtk git diff --check` passed. Browser review was not run because the local app ports were already occupied. |

| 2026-10-10 | Add scored topic progress and explainable evidence labels | The class learning trail now shows an accessible accuracy bar for topics with scored checks and keeps ungraded recall/teach-back and lesson-only activity explicitly unmeasured. Counts and percentages use scored attempts only, with inconsistent counts bounded. Cautious evidence labels distinguish no check, unscored or supported practice, some independent evidence, a recent setback, and repeated independent success (at least 3 independent scored checks and 80% accuracy); these are study signals, not mastery claims. Obsidian topic notes export matching `evidence_level` and independent-check YAML fields and show the readable label/counts. Disposable repeat-export coverage verifies progression from a setback to repeated independent success and preservation of a learner-added property. Focused tests cover measured, unmeasured, mixed scored/unscored, out-of-range data, and evidence-label boundaries. `rtk npm run check` passed all workspace typechecks, 62 server tests, 34 web tests, and production builds; `rtk git diff --check` passed. Browser visual review remains pending because the app preview ports are already occupied. |

| 2026-10-10 | Complete class learner-data export and local deletion | Version 2 of the JSON attachment includes course identity, learner profile and assessment scopes, all saved lesson artifacts and attempts, original attempt-to-passage references, method progress, learning patterns/reviews, and source comments. A typed-confirmation delete transaction removes attempts/evidence, lessons, learner scopes/concepts, pattern history, source comments/import markers, and current-browser class drafts; it preserves course source files, the accepted map, other classes, and external Obsidian/downloaded copies. Disposable API tests verify export content, cancellation on wrong confirmation, deletion counts, zero remaining learner records/comments, source preservation, and class isolation; browser-storage tests verify per-class cleanup and blocked-storage handling. `rtk npm run check` passed all workspace typechecks, 63 server tests, 36 web tests, and production builds; `rtk git diff --check` passed. |

| 2026-10-10 | Browser-check learner-data deletion confirmation | On the already-running local app, inspected the course page and removal panel. The confirmation button stayed disabled for a partial phrase, enabled for the exact phrase, and Cancel closed the panel; no delete request was submitted. The page emitted zero browser console errors or warnings. No Obsidian export or source edit was performed. |

| 2026-10-10 | Preserve source provenance in learner-data downloads | Learner export format version 2 now includes course identity and exact attempt `sourceRefs` with both material and passage IDs, alongside the material-ID summary used by the Obsidian journal. Download copy clarifies that original uploaded files remain in the class library. Disposable API coverage verifies class metadata and passage-level attempt references. `rtk npm run check` passed all workspace typechecks, 63 server tests, 36 web tests, and production builds; `rtk git diff --check` passed. |

| 2026-10-10 | Explain assessment study-plan allocations | Assessment scope plans now list the reason behind each topic’s suggested minutes, using shared labels for priority, recent ungraded/unsuccessful responses, lesson-only or untouched topics, scored accuracy, and stale checks. The same breakdown appears in the Obsidian assessment note. Allocation timing accepts a fixed clock for deterministic evidence labels. Contract coverage checks reason boundaries; the disposable Obsidian export asserts its generated explanations. `rtk npm run check` passed all workspace typechecks, 63 server tests, 36 web tests, and production builds; Obsidian export coverage and `rtk git diff --check` passed. |

| 2026-10-10 | Correct missing-date capacity warning | The assessment planner no longer says minutes exceed the daily cap when no exam date exists; that state now asks only for a date. Shared schedule overflow logic keeps the web and Obsidian views consistent and warns only for a dated over-capacity plan. Regression checks cover missing, past, and over-capacity deadlines. Browser verification used a mocked profile, confirmed the explanations and absence of horizontal overflow at 390px, and confirmed no learner record was written. `rtk npm run check` passed all workspace typechecks, 63 server tests, 36 web tests, and production builds; `rtk git diff --check` passed. |

| 2026-10-10 | Align evidence labels and surface repeated low accuracy | Topic evidence status now comes from one shared contracts function used by the Study page and Obsidian export. After at least three scored checks, accuracy below 60% is labeled “Low scored accuracy” even if the latest check was correct; a latest scored setback remains “Needs another look.” Ungraded responses do not overwrite prior scored evidence. Web unit cases and disposable Obsidian export assertions cover these boundaries. Browser review with a mocked profile showed “Low scored accuracy” alongside 40% (2/5), latest correct; no attempt was saved, and the course page was restored after the check. `rtk npm run check` passed all workspace typechecks, 63 server tests, 36 web tests, and production builds; `rtk git diff --check` passed. |

| 2026-10-10 | Recommend quiz-first practice for repeated low accuracy | The next-study selector now elevates topics below 60% across at least three explicitly scored checks, while keeping a latest incorrect answer more urgent and ignoring legacy records without a scored denominator. The Study page explains the signal and offers another quiz; topic actions and homework-map recommendations also start quiz-first. Contract tests cover ranking and denominator boundaries; browser validation with a mocked profile showed the recommendation card and quiz action at 40% (2/5), latest correct. No attempt was saved, and the course page was restored. `rtk npm run check` passed all workspace typechecks, 63 server tests, 37 web tests, and production builds; `rtk git diff --check` passed. |

| 2026-10-10 | Make low-accuracy Obsidian notes actionable | Obsidian topic notes now add a suggested next step to take another quiz when repeated scored checks show low accuracy, matching the Study page recommendation. Disposable export coverage asserts the note text. > npm run typecheck && npm test && npm run build
> npm run typecheck --workspaces --if-present
> tsc -p tsconfig.json --noEmit
> tsc -p tsconfig.json --noEmit
> tsc -b --pretty false
> tsc -p tsconfig.json
> npm run test --workspaces --if-present
> tsx --test test/**/*.test.ts
(node:46264) ExperimentalWarning: SQLite is an experimental feature and might change at any time
(Use `node --trace-warnings ...` to show where the warning was created)
✔ GET /api/health reports the shared API version (310.771875ms)
✔ course library persists a course and its uploaded material (249.485ms)
✔ PDF extraction preserves page-level provenance (551.2135ms)
✔ PDF math layout reconstructs a stacked numerator over a square-root denominator (0.44525ms)
Warning: Indexing all PDF objects
✔ source reprocessing keeps the previous passages when extraction fails (37.763667ms)
✔ original source route refuses non-PDF materials (17.689417ms)
✔ empty extractable sources fail visibly without losing the upload (18.280708ms)
✔ DOCX extraction preserves paragraph provenance and headings (21.724291ms)
✔ PPTX extraction preserves slide provenance (16.92875ms)
✔ invalid Office packages fail visibly without losing the upload (16.87375ms)
✔ legacy passage locators migrate to canonical JSON (15.554708ms)
✔ startup turns interrupted extraction into an explicit failure (12.478917ms)
✔ course creation rejects an empty title (12.536792ms)
✔ unsupported uploads do not create material records (15.04375ms)
(node:46265) ExperimentalWarning: SQLite is an experimental feature and might change at any time
(Use `node --trace-warnings ...` to show where the warning was created)
✔ model router keeps narrow tasks on Luna and synthesis on Terra (4.784167ms)
✔ study generation JSON schema uses only required model-authored fields (7.51675ms)
✔ Codex runner reports local installation and authentication (395.426375ms)
✔ Codex runner selects a model and validates structured output (345.174041ms)
✔ Codex runner rejects execution failures and invalid output (328.864958ms)
✔ Codex runner stops a timed-out run explicitly (32.741166ms)
✔ Codex runner serializes model calls (339.160667ms)
✔ GET /api/codex/status exposes setup readiness (82.031292ms)
✔ course-map.v1 accepts internally consistent source-grounded structure (3.49425ms)
✔ course-map.v1 rejects dangling course and source references (6.570334ms)
✔ source-classification.v1 requires unique, internally grounded sources (0.624208ms)
(node:46267) ExperimentalWarning: SQLite is an experimental feature and might change at any time
(Use `node --trace-warnings ...` to show where the warning was created)
✔ study recommendations prefer nearer upcoming assessments when signals tie (11.169083ms)
✔ study generation exposes a safe CLI diagnostic for troubleshooting (267.421041ms)
✔ professor topic-list parser removes common numbering and bullets and deduplicates case-insensitively (6.913167ms)
✔ professor topic-list parser removes common copied scope headings (0.483917ms)
✔ study budget allocates exactly the available minutes and favors weak topics (0.7535ms)
✔ assessment study plan weights saved evidence and reports deadline timing (0.44025ms)
✔ assessment schedule spreads sessions before the deadline and flags over-capacity time (0.42875ms)
✔ category progress counts only the displayed topics and ignores duplicate titles (0.125583ms)
✔ study coverage distinguishes lesson sessions from saved knowledge checks (0.475458ms)
✔ homework next-topic recommendation prioritizes review, untouched topics, then stale topics (5.853208ms)
✔ spaced recall uses shorter intervals for uncertain evidence and extends after independent success (0.191959ms)
✔ recommendations surface due spaced recall and show the next date before it is due (0.187208ms)
✔ class recommendation distinguishes lesson-only topics and suggests their first knowledge check (0.218625ms)
✔ recommendations ask for an independent check after assisted-only correct attempts (1.494209ms)
✔ cross-scope recommendations preserve review urgency and instructor priority (0.636541ms)
✔ math text preserves TeX and repairs JSON-decoded control characters inside math (3.867875ms)
✔ math text renders recognizable PDF Dirac notation without changing code or delimited math (2.753917ms)
✔ instructor topic lists persist as class-scoped learner assessment topics (104.445417ms)
✔ adding a topic already in an assessment can link its existing class progress (58.695583ms)
✔ study attempts from a learner exam scope update assessment and topic progress (239.998292ms)
✔ learner-data export includes the full class profile, saved sessions, and responses (87.148917ms)
✔ exam topic study selects a matching class source and marks unmatched topics as general knowledge (52.000833ms)
✔ study methods send distinct learning directions (52.841667ms)
✔ error-analysis refuses generated work without four numbered steps (15.22625ms)
✔ error-analysis refuses adaptive work without four numbered steps (17.0265ms)
✔ compare and contrast uses accepted course-map neighbors in initial and adaptive study (52.709417ms)
✔ free recall saves the learner response as ungraded and keeps the method in history (26.118416ms)
✔ teach-back is a distinct open response that persists independently and exports its reference (22.134708ms)
✔ quiz study, saved answer, method progress, and Obsidian export work together in a disposable class (33.891208ms)
✔ assignment study sessions retrieve only the selected course material and return course-grounded content (31.476875ms)
✔ adaptive questions preserve homework and assessment grounding (28.892584ms)
(node:46268) ExperimentalWarning: SQLite is an experimental feature and might change at any time
(Use `node --trace-warnings ...` to show where the warning was created)
✔ learning artifacts preserve drafts, fingerprints, and accepted history (54.537709ms)
(node:46269) ExperimentalWarning: SQLite is an experimental feature and might change at any time
(Use `node --trace-warnings ...` to show where the warning was created)
✔ course sources flow through cached classification, map review, and acceptance (706.841959ms)
(node:46270) ExperimentalWarning: SQLite is an experimental feature and might change at any time
(Use `node --trace-warnings ...` to show where the warning was created)
✔ Obsidian export creates linked class notes and preserves learner-owned text on refresh (779.410958ms)
✔ Obsidian configuration rejects a non-folder vault path (27.993459ms)
✔ Obsidian export refuses a symlinked notes folder without writing outside the vault (7.469709ms)
✔ Obsidian export refuses a class-folder symlink even when it points inside the vault (6.259166ms)
✔ Obsidian source notes link assignments to their accepted topics and assessments (51.194083ms)
ℹ tests 63
ℹ suites 0
ℹ pass 63
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 5224.7705
> tsx --test test/**/*.test.ts test/**/*.test.tsx
✔ assignment and exam topic summaries show due and upcoming spaced recall (24.40425ms)
✔ unscored and missed topics are not mislabeled as scheduled spaced recall (0.123166ms)
✔ low scored accuracy starts quiz-first practice from topic actions (0.077875ms)
✔ instructor topic drafts survive navigation in the same tab and remain class-scoped (4.77375ms)
✔ empty instructor topic forms remove their saved draft (0.199791ms)
✔ malformed draft data cannot break the study page (0.176417ms)
✔ scope append preview separates already-listed topics without changing their order (1.532917ms)
✔ appending duplicate topics can still preserve new professor wording (0.092833ms)
✔ first professor wording does not gain an unnecessary append heading (0.062333ms)
✔ retrying the same append does not duplicate professor wording (0.058875ms)
✔ knowledge dashboard keeps mapped, learner-created, and instructor-scope topics distinct (46.490709ms)
✔ knowledge dashboard recommends revisiting incomplete and unsupported checks (1.157125ms)
✔ knowledge dashboard prioritizes a difficult check and explains its suggestion (1.492666ms)
✔ knowledge topic profile shows independent check evidence separately from overall accuracy (1.841166ms)
✔ learner-data cleanup clears only the selected class drafts in every storage (1.587125ms)
✔ learner-data cleanup tolerates blocked storage writes/removals (0.143834ms)
✔ math content repairs damaged TeX and renders with KaTeX (20.110833ms)
✔ inline professor topics and multi-line formulas use KaTeX (23.272917ms)
✔ inline ket-bra products render as a single valid math expression (2.112375ms)
✔ PDF-style reconstructed Dirac fractions render as math (3.407833ms)
✔ Unicode subscript and superscript ket labels render through KaTeX (5.75925ms)
✔ imported Markdown keeps links and images inert while rendering text (1.963375ms)
✔ ungraded methods show unmeasured states instead of zero-percent score bars (11.826667ms)
✔ scored but supported attempts do not imply independent accuracy is zero (1.3975ms)
✔ observed scored and independent results render separate measured bars (0.805125ms)
✔ source comment summary counts annotated passages separately from comments and stale notes (2.012791ms)
✔ knowledge-check drafts resume across browser restarts and stay course scoped (2.163375ms)
✔ expired knowledge-check drafts are removed from every available storage (0.1125ms)
✔ draft restoration bounds the selected answer, hint count, and response size (0.273416ms)
✔ malformed or non-object saved drafts are ignored without breaking study (0.336875ms)
✔ saving an attempt clears its local and session draft copies (0.12ms)
✔ due-review topic links preserve homework scope and open quiz-first practice (1.056625ms)
✔ unsupported method query values cannot choose a generated study method (0.073916ms)
✔ topic score uses scored checks and keeps ungraded attempts separate (1.530791ms)
✔ topic score is unmeasured until a scored check exists (0.077875ms)
✔ topic score bounds inconsistent server counts (0.067083ms)
✔ topic evidence labels reflect repeated independent results and setbacks (0.157417ms)
ℹ tests 37
ℹ suites 0
ℹ pass 37
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 645.4155
> tsc -p tsconfig.json
> tsc -p tsconfig.json
> tsc -b && vite build
vite v8.1.5 building client environment for production...
[2Ktransforming...✓ 330 modules transformed.
rendering chunks...
computing gzip size...
dist/index.html                                         0.81 kB │ gzip:   0.41 kB
dist/assets/KaTeX_Size3-Regular-CTq5MqoE.woff           4.42 kB
dist/assets/KaTeX_Size4-Regular-Dl5lxZxV.woff2          4.92 kB
dist/assets/KaTeX_Size2-Regular-Dy4dx90m.woff2          5.20 kB
dist/assets/KaTeX_Size1-Regular-mCD8mA8B.woff2          5.46 kB
dist/assets/KaTeX_Size4-Regular-BF-4gkZK.woff           5.98 kB
dist/assets/KaTeX_Size2-Regular-oD1tc_U0.woff           6.18 kB
dist/assets/KaTeX_Size1-Regular-C195tn64.woff           6.49 kB
dist/assets/KaTeX_Caligraphic-Regular-Di6jR-x-.woff2    6.90 kB
dist/assets/KaTeX_Caligraphic-Bold-Dq_IR9rO.woff2       6.91 kB
dist/assets/KaTeX_Size3-Regular-DgpXs0kz.ttf            7.58 kB
dist/assets/KaTeX_Caligraphic-Regular-CTRA-rTL.woff     7.65 kB
dist/assets/KaTeX_Caligraphic-Bold-BEiXGLvX.woff        7.71 kB
dist/assets/KaTeX_Script-Regular-D3wIWfF6.woff2         9.64 kB
dist/assets/KaTeX_SansSerif-Regular-DDBCnlJ7.woff2     10.34 kB
dist/assets/KaTeX_Size4-Regular-DWFBv043.ttf           10.36 kB
dist/assets/KaTeX_Script-Regular-D5yQViql.woff         10.58 kB
dist/assets/KaTeX_Fraktur-Regular-CTYiF6lA.woff2       11.31 kB
dist/assets/KaTeX_Fraktur-Bold-CL6g_b3V.woff2          11.34 kB
dist/assets/KaTeX_Size2-Regular-B7gKUWhC.ttf           11.50 kB
dist/assets/KaTeX_SansSerif-Italic-C3H0VqGB.woff2      12.02 kB
dist/assets/KaTeX_SansSerif-Bold-D1sUS0GD.woff2        12.21 kB
dist/assets/KaTeX_Size1-Regular-Dbsnue_I.ttf           12.22 kB
dist/assets/KaTeX_SansSerif-Regular-CS6fqUqJ.woff      12.31 kB
dist/assets/KaTeX_Caligraphic-Regular-wX97UBjC.ttf     12.34 kB
dist/assets/KaTeX_Caligraphic-Bold-ATXxdsX0.ttf        12.36 kB
dist/assets/KaTeX_Fraktur-Regular-Dxdc4cR9.woff        13.20 kB
dist/assets/KaTeX_Fraktur-Bold-BsDP51OF.woff           13.29 kB
dist/assets/KaTeX_Typewriter-Regular-CO6r4hn1.woff2    13.56 kB
dist/assets/KaTeX_SansSerif-Italic-DN2j7dab.woff       14.11 kB
dist/assets/KaTeX_SansSerif-Bold-DbIhKOiC.woff         14.40 kB
dist/assets/KaTeX_Typewriter-Regular-C0xS9mPB.woff     16.02 kB
dist/assets/KaTeX_Math-BoldItalic-CZnvNsCZ.woff2       16.40 kB
dist/assets/KaTeX_Math-Italic-t53AETM-.woff2           16.44 kB
dist/assets/KaTeX_Script-Regular-C5JkGWo-.ttf          16.64 kB
dist/assets/KaTeX_Main-BoldItalic-DxDJ3AOS.woff2       16.78 kB
dist/assets/KaTeX_Main-Italic-NWA7e6Wa.woff2           16.98 kB
dist/assets/KaTeX_Math-BoldItalic-iY-2wyZ7.woff        18.66 kB
dist/assets/KaTeX_Math-Italic-DA0__PXp.woff            18.74 kB
dist/assets/KaTeX_Main-BoldItalic-SpSLRI95.woff        19.41 kB
dist/assets/KaTeX_SansSerif-Regular-BNo7hRIc.ttf       19.43 kB
dist/assets/KaTeX_Fraktur-Regular-CB_wures.ttf         19.57 kB
dist/assets/KaTeX_Fraktur-Bold-BdnERNNW.ttf            19.58 kB
dist/assets/KaTeX_Main-Italic-BMLOBm91.woff            19.67 kB
dist/assets/KaTeX_SansSerif-Italic-YYjJ1zSn.ttf        22.36 kB
dist/assets/KaTeX_SansSerif-Bold-CFMepnvq.ttf          24.50 kB
dist/assets/KaTeX_Main-Bold-Cx986IdX.woff2             25.32 kB
dist/assets/KaTeX_Main-Regular-B22Nviop.woff2          26.27 kB
dist/assets/KaTeX_Typewriter-Regular-D3Ib7_Hf.ttf      27.55 kB
dist/assets/KaTeX_AMS-Regular-BQhdFMY1.woff2           28.07 kB
dist/assets/KaTeX_Main-Bold-Jm3AIy58.woff              29.91 kB
dist/assets/KaTeX_Main-Regular-Dr94JaBh.woff           30.77 kB
dist/assets/KaTeX_Math-BoldItalic-B3XSjfu4.ttf         31.19 kB
dist/assets/KaTeX_Math-Italic-flOr_0UB.ttf             31.30 kB
dist/assets/KaTeX_Main-BoldItalic-DzxPMmG6.ttf         32.96 kB
dist/assets/KaTeX_AMS-Regular-DMm9YOAa.woff            33.51 kB
dist/assets/KaTeX_Main-Italic-3WenGoN9.ttf             33.58 kB
dist/assets/KaTeX_Main-Bold-waoOVXN0.ttf               51.33 kB
dist/assets/KaTeX_Main-Regular-ypZvNtVU.ttf            53.58 kB
dist/assets/KaTeX_AMS-Regular-DRggAlZN.ttf             63.63 kB
dist/assets/study-progress-Ngnvt50Q.css                29.80 kB │ gzip:   7.97 kB
dist/assets/index-hIIiIlPL.css                         98.30 kB │ gzip:  19.56 kB
dist/assets/jsx-runtime-DUAcabCT.js                     1.06 kB │ gzip:   0.60 kB
dist/assets/HomePage-BCfXuw81.js                        5.43 kB │ gzip:   1.70 kB
dist/assets/react-DEX2qfRi.js                           7.52 kB │ gzip:   2.87 kB
dist/assets/InfoPage-DQ63Qrs6.js                        7.66 kB │ gzip:   2.59 kB
dist/assets/KnowledgePage-CCfh1Efc.js                  14.86 kB │ gzip:   4.14 kB
dist/assets/CoursePage-BMri9YJY.js                     51.15 kB │ gzip:  13.36 kB
dist/assets/StudyPage-BTl2irwa.js                      69.33 kB │ gzip:  17.95 kB
dist/assets/dist-B07zVGNr.js                          100.42 kB │ gzip:  25.82 kB
dist/assets/HandTrackingPage-kUjubWox.js              170.34 kB │ gzip:  51.00 kB
dist/assets/index-Dl7ihLjR.js                         195.42 kB │ gzip:  61.61 kB
dist/assets/study-progress-HYFWFq93.js                397.27 kB │ gzip: 120.25 kB
✓ built in 216ms passed all workspace typechecks, 63 server tests, 37 web tests, and production builds;  passed. |

| 2026-10-10 | Make low-accuracy Obsidian notes actionable | Obsidian topic notes now add a suggested next step to take another quiz when repeated scored checks show low accuracy, matching the Study page recommendation. Disposable export coverage asserts the note text. > npm run typecheck && npm test && npm run build
> npm run typecheck --workspaces --if-present
> tsc -p tsconfig.json --noEmit
> tsc -p tsconfig.json --noEmit
> tsc -b --pretty false
> tsc -p tsconfig.json
> npm run test --workspaces --if-present
> tsx --test test/**/*.test.ts
(node:46885) ExperimentalWarning: SQLite is an experimental feature and might change at any time
(Use `node --trace-warnings ...` to show where the warning was created)
✔ GET /api/health reports the shared API version (354.228542ms)
✔ course library persists a course and its uploaded material (263.775709ms)
✔ PDF extraction preserves page-level provenance (605.561ms)
✔ PDF math layout reconstructs a stacked numerator over a square-root denominator (0.7ms)
Warning: Indexing all PDF objects
✔ source reprocessing keeps the previous passages when extraction fails (107.308958ms)
✔ original source route refuses non-PDF materials (81.99025ms)
✔ empty extractable sources fail visibly without losing the upload (39.388291ms)
✔ DOCX extraction preserves paragraph provenance and headings (31.42925ms)
✔ PPTX extraction preserves slide provenance (27.581167ms)
✔ invalid Office packages fail visibly without losing the upload (24.466625ms)
✔ legacy passage locators migrate to canonical JSON (15.287417ms)
✔ startup turns interrupted extraction into an explicit failure (21.799625ms)
✔ course creation rejects an empty title (18.817291ms)
✔ unsupported uploads do not create material records (19.944333ms)
(node:46886) ExperimentalWarning: SQLite is an experimental feature and might change at any time
(Use `node --trace-warnings ...` to show where the warning was created)
✔ model router keeps narrow tasks on Luna and synthesis on Terra (2.729625ms)
✔ study generation JSON schema uses only required model-authored fields (9.009542ms)
✔ Codex runner reports local installation and authentication (440.419917ms)
✔ Codex runner selects a model and validates structured output (172.342708ms)
✔ Codex runner rejects execution failures and invalid output (393.209584ms)
✔ Codex runner stops a timed-out run explicitly (33.486375ms)
✔ Codex runner serializes model calls (476.63675ms)
✔ GET /api/codex/status exposes setup readiness (141.400042ms)
✔ course-map.v1 accepts internally consistent source-grounded structure (7.298875ms)
✔ course-map.v1 rejects dangling course and source references (5.715291ms)
✔ source-classification.v1 requires unique, internally grounded sources (0.630208ms)
(node:46888) ExperimentalWarning: SQLite is an experimental feature and might change at any time
(Use `node --trace-warnings ...` to show where the warning was created)
✔ study recommendations prefer nearer upcoming assessments when signals tie (22.269ms)
✔ study generation exposes a safe CLI diagnostic for troubleshooting (344.573375ms)
✔ professor topic-list parser removes common numbering and bullets and deduplicates case-insensitively (5.938083ms)
✔ professor topic-list parser removes common copied scope headings (2.530541ms)
✔ study budget allocates exactly the available minutes and favors weak topics (0.892417ms)
✔ assessment study plan weights saved evidence and reports deadline timing (1.401333ms)
✔ assessment schedule spreads sessions before the deadline and flags over-capacity time (2.149ms)
✔ category progress counts only the displayed topics and ignores duplicate titles (0.535542ms)
✔ study coverage distinguishes lesson sessions from saved knowledge checks (0.824625ms)
✔ homework next-topic recommendation prioritizes review, untouched topics, then stale topics (2.780041ms)
✔ spaced recall uses shorter intervals for uncertain evidence and extends after independent success (0.247ms)
✔ recommendations surface due spaced recall and show the next date before it is due (0.52125ms)
✔ class recommendation distinguishes lesson-only topics and suggests their first knowledge check (0.178959ms)
✔ recommendations ask for an independent check after assisted-only correct attempts (0.70675ms)
✔ cross-scope recommendations preserve review urgency and instructor priority (0.238958ms)
✔ math text preserves TeX and repairs JSON-decoded control characters inside math (1.681333ms)
✔ math text renders recognizable PDF Dirac notation without changing code or delimited math (2.157916ms)
✔ instructor topic lists persist as class-scoped learner assessment topics (161.412292ms)
✔ adding a topic already in an assessment can link its existing class progress (166.83975ms)
✔ study attempts from a learner exam scope update assessment and topic progress (154.914208ms)
✔ learner-data export includes the full class profile, saved sessions, and responses (134.60625ms)
✔ exam topic study selects a matching class source and marks unmatched topics as general knowledge (138.074041ms)
✔ study methods send distinct learning directions (139.943083ms)
✔ error-analysis refuses generated work without four numbered steps (75.095208ms)
✔ error-analysis refuses adaptive work without four numbered steps (72.163667ms)
✔ compare and contrast uses accepted course-map neighbors in initial and adaptive study (59.357417ms)
✔ free recall saves the learner response as ungraded and keeps the method in history (28.985ms)
✔ teach-back is a distinct open response that persists independently and exports its reference (28.828125ms)
✔ quiz study, saved answer, method progress, and Obsidian export work together in a disposable class (43.487959ms)
✔ assignment study sessions retrieve only the selected course material and return course-grounded content (39.664083ms)
✔ adaptive questions preserve homework and assessment grounding (50.766292ms)
(node:46889) ExperimentalWarning: SQLite is an experimental feature and might change at any time
(Use `node --trace-warnings ...` to show where the warning was created)
✔ learning artifacts preserve drafts, fingerprints, and accepted history (26.514084ms)
(node:46890) ExperimentalWarning: SQLite is an experimental feature and might change at any time
(Use `node --trace-warnings ...` to show where the warning was created)
✔ course sources flow through cached classification, map review, and acceptance (672.018125ms)
(node:46891) ExperimentalWarning: SQLite is an experimental feature and might change at any time
(Use `node --trace-warnings ...` to show where the warning was created)
✔ Obsidian export creates linked class notes and preserves learner-owned text on refresh (682.983708ms)
✔ Obsidian configuration rejects a non-folder vault path (80.248542ms)
✔ Obsidian export refuses a symlinked notes folder without writing outside the vault (6.880042ms)
✔ Obsidian export refuses a class-folder symlink even when it points inside the vault (4.301542ms)
✔ Obsidian source notes link assignments to their accepted topics and assessments (41.770708ms)
ℹ tests 63
ℹ suites 0
ℹ pass 63
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 5700.33425
> tsx --test test/**/*.test.ts test/**/*.test.tsx
✔ assignment and exam topic summaries show due and upcoming spaced recall (16.263208ms)
✔ unscored and missed topics are not mislabeled as scheduled spaced recall (0.229083ms)
✔ low scored accuracy starts quiz-first practice from topic actions (0.107667ms)
✔ instructor topic drafts survive navigation in the same tab and remain class-scoped (4.088459ms)
✔ empty instructor topic forms remove their saved draft (0.367166ms)
✔ malformed draft data cannot break the study page (0.212208ms)
✔ scope append preview separates already-listed topics without changing their order (3.73725ms)
✔ appending duplicate topics can still preserve new professor wording (0.351709ms)
✔ first professor wording does not gain an unnecessary append heading (0.221ms)
✔ retrying the same append does not duplicate professor wording (0.122375ms)
✔ knowledge dashboard keeps mapped, learner-created, and instructor-scope topics distinct (165.742ms)
✔ knowledge dashboard recommends revisiting incomplete and unsupported checks (2.022583ms)
✔ knowledge dashboard prioritizes a difficult check and explains its suggestion (2.57725ms)
✔ knowledge topic profile shows independent check evidence separately from overall accuracy (1.571208ms)
✔ learner-data cleanup clears only the selected class drafts in every storage (1.51525ms)
✔ learner-data cleanup tolerates blocked storage writes/removals (0.149ms)
✔ math content repairs damaged TeX and renders with KaTeX (17.155542ms)
✔ inline professor topics and multi-line formulas use KaTeX (14.333958ms)
✔ inline ket-bra products render as a single valid math expression (2.263375ms)
✔ PDF-style reconstructed Dirac fractions render as math (6.092041ms)
✔ Unicode subscript and superscript ket labels render through KaTeX (5.097458ms)
✔ imported Markdown keeps links and images inert while rendering text (1.936208ms)
✔ ungraded methods show unmeasured states instead of zero-percent score bars (6.380917ms)
✔ scored but supported attempts do not imply independent accuracy is zero (0.624875ms)
✔ observed scored and independent results render separate measured bars (2.990042ms)
✔ source comment summary counts annotated passages separately from comments and stale notes (2.69875ms)
✔ knowledge-check drafts resume across browser restarts and stay course scoped (4.206833ms)
✔ expired knowledge-check drafts are removed from every available storage (0.157584ms)
✔ draft restoration bounds the selected answer, hint count, and response size (0.340375ms)
✔ malformed or non-object saved drafts are ignored without breaking study (0.320541ms)
✔ saving an attempt clears its local and session draft copies (0.2485ms)
✔ due-review topic links preserve homework scope and open quiz-first practice (4.414333ms)
✔ unsupported method query values cannot choose a generated study method (0.101291ms)
✔ topic score uses scored checks and keeps ungraded attempts separate (1.912334ms)
✔ topic score is unmeasured until a scored check exists (0.08125ms)
✔ topic score bounds inconsistent server counts (0.068583ms)
✔ topic evidence labels reflect repeated independent results and setbacks (0.161708ms)
ℹ tests 37
ℹ suites 0
ℹ pass 37
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 1170.118875
> tsc -p tsconfig.json
> tsc -p tsconfig.json
> tsc -b && vite build
vite v8.1.5 building client environment for production...
[2Ktransforming...✓ 330 modules transformed.
rendering chunks...
computing gzip size...
dist/index.html                                         0.81 kB │ gzip:   0.41 kB
dist/assets/KaTeX_Size3-Regular-CTq5MqoE.woff           4.42 kB
dist/assets/KaTeX_Size4-Regular-Dl5lxZxV.woff2          4.92 kB
dist/assets/KaTeX_Size2-Regular-Dy4dx90m.woff2          5.20 kB
dist/assets/KaTeX_Size1-Regular-mCD8mA8B.woff2          5.46 kB
dist/assets/KaTeX_Size4-Regular-BF-4gkZK.woff           5.98 kB
dist/assets/KaTeX_Size2-Regular-oD1tc_U0.woff           6.18 kB
dist/assets/KaTeX_Size1-Regular-C195tn64.woff           6.49 kB
dist/assets/KaTeX_Caligraphic-Regular-Di6jR-x-.woff2    6.90 kB
dist/assets/KaTeX_Caligraphic-Bold-Dq_IR9rO.woff2       6.91 kB
dist/assets/KaTeX_Size3-Regular-DgpXs0kz.ttf            7.58 kB
dist/assets/KaTeX_Caligraphic-Regular-CTRA-rTL.woff     7.65 kB
dist/assets/KaTeX_Caligraphic-Bold-BEiXGLvX.woff        7.71 kB
dist/assets/KaTeX_Script-Regular-D3wIWfF6.woff2         9.64 kB
dist/assets/KaTeX_SansSerif-Regular-DDBCnlJ7.woff2     10.34 kB
dist/assets/KaTeX_Size4-Regular-DWFBv043.ttf           10.36 kB
dist/assets/KaTeX_Script-Regular-D5yQViql.woff         10.58 kB
dist/assets/KaTeX_Fraktur-Regular-CTYiF6lA.woff2       11.31 kB
dist/assets/KaTeX_Fraktur-Bold-CL6g_b3V.woff2          11.34 kB
dist/assets/KaTeX_Size2-Regular-B7gKUWhC.ttf           11.50 kB
dist/assets/KaTeX_SansSerif-Italic-C3H0VqGB.woff2      12.02 kB
dist/assets/KaTeX_SansSerif-Bold-D1sUS0GD.woff2        12.21 kB
dist/assets/KaTeX_Size1-Regular-Dbsnue_I.ttf           12.22 kB
dist/assets/KaTeX_SansSerif-Regular-CS6fqUqJ.woff      12.31 kB
dist/assets/KaTeX_Caligraphic-Regular-wX97UBjC.ttf     12.34 kB
dist/assets/KaTeX_Caligraphic-Bold-ATXxdsX0.ttf        12.36 kB
dist/assets/KaTeX_Fraktur-Regular-Dxdc4cR9.woff        13.20 kB
dist/assets/KaTeX_Fraktur-Bold-BsDP51OF.woff           13.29 kB
dist/assets/KaTeX_Typewriter-Regular-CO6r4hn1.woff2    13.56 kB
dist/assets/KaTeX_SansSerif-Italic-DN2j7dab.woff       14.11 kB
dist/assets/KaTeX_SansSerif-Bold-DbIhKOiC.woff         14.40 kB
dist/assets/KaTeX_Typewriter-Regular-C0xS9mPB.woff     16.02 kB
dist/assets/KaTeX_Math-BoldItalic-CZnvNsCZ.woff2       16.40 kB
dist/assets/KaTeX_Math-Italic-t53AETM-.woff2           16.44 kB
dist/assets/KaTeX_Script-Regular-C5JkGWo-.ttf          16.64 kB
dist/assets/KaTeX_Main-BoldItalic-DxDJ3AOS.woff2       16.78 kB
dist/assets/KaTeX_Main-Italic-NWA7e6Wa.woff2           16.98 kB
dist/assets/KaTeX_Math-BoldItalic-iY-2wyZ7.woff        18.66 kB
dist/assets/KaTeX_Math-Italic-DA0__PXp.woff            18.74 kB
dist/assets/KaTeX_Main-BoldItalic-SpSLRI95.woff        19.41 kB
dist/assets/KaTeX_SansSerif-Regular-BNo7hRIc.ttf       19.43 kB
dist/assets/KaTeX_Fraktur-Regular-CB_wures.ttf         19.57 kB
dist/assets/KaTeX_Fraktur-Bold-BdnERNNW.ttf            19.58 kB
dist/assets/KaTeX_Main-Italic-BMLOBm91.woff            19.67 kB
dist/assets/KaTeX_SansSerif-Italic-YYjJ1zSn.ttf        22.36 kB
dist/assets/KaTeX_SansSerif-Bold-CFMepnvq.ttf          24.50 kB
dist/assets/KaTeX_Main-Bold-Cx986IdX.woff2             25.32 kB
dist/assets/KaTeX_Main-Regular-B22Nviop.woff2          26.27 kB
dist/assets/KaTeX_Typewriter-Regular-D3Ib7_Hf.ttf      27.55 kB
dist/assets/KaTeX_AMS-Regular-BQhdFMY1.woff2           28.07 kB
dist/assets/KaTeX_Main-Bold-Jm3AIy58.woff              29.91 kB
dist/assets/KaTeX_Main-Regular-Dr94JaBh.woff           30.77 kB
dist/assets/KaTeX_Math-BoldItalic-B3XSjfu4.ttf         31.19 kB
dist/assets/KaTeX_Math-Italic-flOr_0UB.ttf             31.30 kB
dist/assets/KaTeX_Main-BoldItalic-DzxPMmG6.ttf         32.96 kB
dist/assets/KaTeX_AMS-Regular-DMm9YOAa.woff            33.51 kB
dist/assets/KaTeX_Main-Italic-3WenGoN9.ttf             33.58 kB
dist/assets/KaTeX_Main-Bold-waoOVXN0.ttf               51.33 kB
dist/assets/KaTeX_Main-Regular-ypZvNtVU.ttf            53.58 kB
dist/assets/KaTeX_AMS-Regular-DRggAlZN.ttf             63.63 kB
dist/assets/study-progress-Ngnvt50Q.css                29.80 kB │ gzip:   7.97 kB
dist/assets/index-hIIiIlPL.css                         98.30 kB │ gzip:  19.56 kB
dist/assets/jsx-runtime-DUAcabCT.js                     1.06 kB │ gzip:   0.60 kB
dist/assets/HomePage-BCfXuw81.js                        5.43 kB │ gzip:   1.70 kB
dist/assets/react-DEX2qfRi.js                           7.52 kB │ gzip:   2.87 kB
dist/assets/InfoPage-DQ63Qrs6.js                        7.66 kB │ gzip:   2.59 kB
dist/assets/KnowledgePage-CCfh1Efc.js                  14.86 kB │ gzip:   4.14 kB
dist/assets/CoursePage-BMri9YJY.js                     51.15 kB │ gzip:  13.36 kB
dist/assets/StudyPage-BTl2irwa.js                      69.33 kB │ gzip:  17.95 kB
dist/assets/dist-B07zVGNr.js                          100.42 kB │ gzip:  25.82 kB
dist/assets/HandTrackingPage-kUjubWox.js              170.34 kB │ gzip:  51.00 kB
dist/assets/index-Dl7ihLjR.js                         195.42 kB │ gzip:  61.61 kB
dist/assets/study-progress-HYFWFq93.js                397.27 kB │ gzip: 120.25 kB
✓ built in 833ms passed all workspace typechecks, 63 server tests, 37 web tests, and production builds;  passed. |

| 2026-10-10 | Clarify method progress and measured scores | Practice-by-approach cards now pair scored and independent counts with clear percentage bars, explicitly describe unmeasured checks, and clamp inconsistent counts to the measured denominator. Desktop and 390px browser review confirmed the tracker card fits cleanly at both widths; no attempts were submitted. Tracker regressions cover ungraded signals, supported-only checks, measured bars, and inconsistent counts. > npm run typecheck && npm test && npm run build
> npm run typecheck --workspaces --if-present
> tsc -p tsconfig.json --noEmit
> tsc -p tsconfig.json --noEmit
> tsc -b --pretty false
> tsc -p tsconfig.json
> npm run test --workspaces --if-present
> tsx --test test/**/*.test.ts
(node:49173) ExperimentalWarning: SQLite is an experimental feature and might change at any time
(Use `node --trace-warnings ...` to show where the warning was created)
✔ GET /api/health reports the shared API version (432.283583ms)
✔ course library persists a course and its uploaded material (159.720333ms)
✔ PDF extraction preserves page-level provenance (1262.2715ms)
✔ PDF math layout reconstructs a stacked numerator over a square-root denominator (1.712458ms)
Warning: Indexing all PDF objects
✔ source reprocessing keeps the previous passages when extraction fails (80.214583ms)
✔ original source route refuses non-PDF materials (30.886375ms)
✔ empty extractable sources fail visibly without losing the upload (27.959083ms)
✔ DOCX extraction preserves paragraph provenance and headings (128.488833ms)
✔ PPTX extraction preserves slide provenance (44.219791ms)
✔ invalid Office packages fail visibly without losing the upload (33.295708ms)
✔ legacy passage locators migrate to canonical JSON (37.612208ms)
✔ startup turns interrupted extraction into an explicit failure (15.928375ms)
✔ course creation rejects an empty title (16.895084ms)
✔ unsupported uploads do not create material records (14.75875ms)
(node:49174) ExperimentalWarning: SQLite is an experimental feature and might change at any time
(Use `node --trace-warnings ...` to show where the warning was created)
✔ model router keeps narrow tasks on Luna and synthesis on Terra (1.099541ms)
✔ study generation JSON schema uses only required model-authored fields (6.70725ms)
✔ Codex runner reports local installation and authentication (438.871959ms)
✔ Codex runner selects a model and validates structured output (233.169917ms)
✔ Codex runner rejects execution failures and invalid output (725.044875ms)
✔ Codex runner stops a timed-out run explicitly (44.458459ms)
✔ Codex runner serializes model calls (458.06475ms)
✔ GET /api/codex/status exposes setup readiness (243.78225ms)
✔ course-map.v1 accepts internally consistent source-grounded structure (31.742417ms)
✔ course-map.v1 rejects dangling course and source references (6.725125ms)
✔ source-classification.v1 requires unique, internally grounded sources (1.625583ms)
(node:49176) ExperimentalWarning: SQLite is an experimental feature and might change at any time
(Use `node --trace-warnings ...` to show where the warning was created)
✔ study recommendations prefer nearer upcoming assessments when signals tie (8.164167ms)
✔ study generation exposes a safe CLI diagnostic for troubleshooting (464.656833ms)
✔ professor topic-list parser removes common numbering and bullets and deduplicates case-insensitively (6.627708ms)
✔ professor topic-list parser removes common copied scope headings (1.774542ms)
✔ study budget allocates exactly the available minutes and favors weak topics (0.683125ms)
✔ assessment study plan weights saved evidence and reports deadline timing (1.464042ms)
✔ assessment schedule spreads sessions before the deadline and flags over-capacity time (1.148209ms)
✔ category progress counts only the displayed topics and ignores duplicate titles (0.177709ms)
✔ study coverage distinguishes lesson sessions from saved knowledge checks (0.565709ms)
✔ homework next-topic recommendation prioritizes review, untouched topics, then stale topics (8.279542ms)
✔ spaced recall uses shorter intervals for uncertain evidence and extends after independent success (0.444666ms)
✔ recommendations surface due spaced recall and show the next date before it is due (0.663417ms)
✔ class recommendation distinguishes lesson-only topics and suggests their first knowledge check (0.463ms)
✔ recommendations ask for an independent check after assisted-only correct attempts (0.767125ms)
✔ cross-scope recommendations preserve review urgency and instructor priority (0.167833ms)
✔ math text preserves TeX and repairs JSON-decoded control characters inside math (3.914333ms)
✔ math text renders recognizable PDF Dirac notation without changing code or delimited math (4.697417ms)
✔ instructor topic lists persist as class-scoped learner assessment topics (109.53725ms)
✔ adding a topic already in an assessment can link its existing class progress (77.5275ms)
✔ study attempts from a learner exam scope update assessment and topic progress (479.190583ms)
✔ learner-data export includes the full class profile, saved sessions, and responses (128.238958ms)
✔ exam topic study selects a matching class source and marks unmatched topics as general knowledge (167.505292ms)
✔ study methods send distinct learning directions (75.820833ms)
✔ error-analysis refuses generated work without four numbered steps (36.955625ms)
✔ error-analysis refuses adaptive work without four numbered steps (28.720458ms)
✔ compare and contrast uses accepted course-map neighbors in initial and adaptive study (147.359458ms)
✔ free recall saves the learner response as ungraded and keeps the method in history (67.912ms)
✔ teach-back is a distinct open response that persists independently and exports its reference (63.619458ms)
✔ quiz study, saved answer, method progress, and Obsidian export work together in a disposable class (76.998458ms)
✔ assignment study sessions retrieve only the selected course material and return course-grounded content (47.210333ms)
✔ adaptive questions preserve homework and assessment grounding (120.486791ms)
(node:49177) ExperimentalWarning: SQLite is an experimental feature and might change at any time
(Use `node --trace-warnings ...` to show where the warning was created)
✔ learning artifacts preserve drafts, fingerprints, and accepted history (115.859375ms)
(node:49178) ExperimentalWarning: SQLite is an experimental feature and might change at any time
(Use `node --trace-warnings ...` to show where the warning was created)
✔ course sources flow through cached classification, map review, and acceptance (1031.222583ms)
(node:49179) ExperimentalWarning: SQLite is an experimental feature and might change at any time
(Use `node --trace-warnings ...` to show where the warning was created)
✔ Obsidian export creates linked class notes and preserves learner-owned text on refresh (1113.861542ms)
✔ Obsidian configuration rejects a non-folder vault path (76.913291ms)
✔ Obsidian export refuses a symlinked notes folder without writing outside the vault (7.373291ms)
✔ Obsidian export refuses a class-folder symlink even when it points inside the vault (6.611833ms)
✔ Obsidian source notes link assignments to their accepted topics and assessments (131.789333ms)
ℹ tests 63
ℹ suites 0
ℹ pass 63
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 9033.7175
> tsx --test test/**/*.test.ts test/**/*.test.tsx
✔ assignment and exam topic summaries show due and upcoming spaced recall (21.037792ms)
✔ unscored and missed topics are not mislabeled as scheduled spaced recall (0.190541ms)
✔ low scored accuracy starts quiz-first practice from topic actions (0.092ms)
✔ instructor topic drafts survive navigation in the same tab and remain class-scoped (3.526291ms)
✔ empty instructor topic forms remove their saved draft (0.225042ms)
✔ malformed draft data cannot break the study page (0.299375ms)
✔ scope append preview separates already-listed topics without changing their order (1.562208ms)
✔ appending duplicate topics can still preserve new professor wording (0.117458ms)
✔ first professor wording does not gain an unnecessary append heading (0.06675ms)
✔ retrying the same append does not duplicate professor wording (0.095083ms)
✔ knowledge dashboard keeps mapped, learner-created, and instructor-scope topics distinct (82.471292ms)
✔ knowledge dashboard recommends revisiting incomplete and unsupported checks (8.592375ms)
✔ knowledge dashboard prioritizes a difficult check and explains its suggestion (6.956958ms)
✔ knowledge topic profile shows independent check evidence separately from overall accuracy (7.280125ms)
✔ learner-data cleanup clears only the selected class drafts in every storage (1.76725ms)
✔ learner-data cleanup tolerates blocked storage writes/removals (0.177334ms)
✔ math content repairs damaged TeX and renders with KaTeX (17.011333ms)
✔ inline professor topics and multi-line formulas use KaTeX (19.258875ms)
✔ inline ket-bra products render as a single valid math expression (2.14375ms)
✔ PDF-style reconstructed Dirac fractions render as math (3.413ms)
✔ Unicode subscript and superscript ket labels render through KaTeX (4.511ms)
✔ imported Markdown keeps links and images inert while rendering text (1.796916ms)
✔ ungraded methods show unmeasured states instead of zero-percent score bars (7.525708ms)
✔ scored but supported attempts do not imply independent accuracy is zero (1.310458ms)
✔ observed scored and independent results render separate measured bars (0.918042ms)
✔ inconsistent counts cannot render accuracy above 100 percent (0.452041ms)
✔ source comment summary counts annotated passages separately from comments and stale notes (1.562917ms)
✔ knowledge-check drafts resume across browser restarts and stay course scoped (2.627458ms)
✔ expired knowledge-check drafts are removed from every available storage (0.169625ms)
✔ draft restoration bounds the selected answer, hint count, and response size (0.383125ms)
✔ malformed or non-object saved drafts are ignored without breaking study (0.179708ms)
✔ saving an attempt clears its local and session draft copies (0.1095ms)
✔ due-review topic links preserve homework scope and open quiz-first practice (1.427084ms)
✔ unsupported method query values cannot choose a generated study method (0.125083ms)
✔ topic score uses scored checks and keeps ungraded attempts separate (1.686958ms)
✔ topic score is unmeasured until a scored check exists (0.129292ms)
✔ topic score bounds inconsistent server counts (0.108708ms)
✔ topic evidence labels reflect repeated independent results and setbacks (0.238708ms)
ℹ tests 38
ℹ suites 0
ℹ pass 38
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 786.69925
> tsc -p tsconfig.json
> tsc -p tsconfig.json
> tsc -b && vite build
vite v8.1.5 building client environment for production...
[2Ktransforming...✓ 330 modules transformed.
rendering chunks...
computing gzip size...
dist/index.html                                         0.81 kB │ gzip:   0.41 kB
dist/assets/KaTeX_Size3-Regular-CTq5MqoE.woff           4.42 kB
dist/assets/KaTeX_Size4-Regular-Dl5lxZxV.woff2          4.92 kB
dist/assets/KaTeX_Size2-Regular-Dy4dx90m.woff2          5.20 kB
dist/assets/KaTeX_Size1-Regular-mCD8mA8B.woff2          5.46 kB
dist/assets/KaTeX_Size4-Regular-BF-4gkZK.woff           5.98 kB
dist/assets/KaTeX_Size2-Regular-oD1tc_U0.woff           6.18 kB
dist/assets/KaTeX_Size1-Regular-C195tn64.woff           6.49 kB
dist/assets/KaTeX_Caligraphic-Regular-Di6jR-x-.woff2    6.90 kB
dist/assets/KaTeX_Caligraphic-Bold-Dq_IR9rO.woff2       6.91 kB
dist/assets/KaTeX_Size3-Regular-DgpXs0kz.ttf            7.58 kB
dist/assets/KaTeX_Caligraphic-Regular-CTRA-rTL.woff     7.65 kB
dist/assets/KaTeX_Caligraphic-Bold-BEiXGLvX.woff        7.71 kB
dist/assets/KaTeX_Script-Regular-D3wIWfF6.woff2         9.64 kB
dist/assets/KaTeX_SansSerif-Regular-DDBCnlJ7.woff2     10.34 kB
dist/assets/KaTeX_Size4-Regular-DWFBv043.ttf           10.36 kB
dist/assets/KaTeX_Script-Regular-D5yQViql.woff         10.58 kB
dist/assets/KaTeX_Fraktur-Regular-CTYiF6lA.woff2       11.31 kB
dist/assets/KaTeX_Fraktur-Bold-CL6g_b3V.woff2          11.34 kB
dist/assets/KaTeX_Size2-Regular-B7gKUWhC.ttf           11.50 kB
dist/assets/KaTeX_SansSerif-Italic-C3H0VqGB.woff2      12.02 kB
dist/assets/KaTeX_SansSerif-Bold-D1sUS0GD.woff2        12.21 kB
dist/assets/KaTeX_Size1-Regular-Dbsnue_I.ttf           12.22 kB
dist/assets/KaTeX_SansSerif-Regular-CS6fqUqJ.woff      12.31 kB
dist/assets/KaTeX_Caligraphic-Regular-wX97UBjC.ttf     12.34 kB
dist/assets/KaTeX_Caligraphic-Bold-ATXxdsX0.ttf        12.36 kB
dist/assets/KaTeX_Fraktur-Regular-Dxdc4cR9.woff        13.20 kB
dist/assets/KaTeX_Fraktur-Bold-BsDP51OF.woff           13.29 kB
dist/assets/KaTeX_Typewriter-Regular-CO6r4hn1.woff2    13.56 kB
dist/assets/KaTeX_SansSerif-Italic-DN2j7dab.woff       14.11 kB
dist/assets/KaTeX_SansSerif-Bold-DbIhKOiC.woff         14.40 kB
dist/assets/KaTeX_Typewriter-Regular-C0xS9mPB.woff     16.02 kB
dist/assets/KaTeX_Math-BoldItalic-CZnvNsCZ.woff2       16.40 kB
dist/assets/KaTeX_Math-Italic-t53AETM-.woff2           16.44 kB
dist/assets/KaTeX_Script-Regular-C5JkGWo-.ttf          16.64 kB
dist/assets/KaTeX_Main-BoldItalic-DxDJ3AOS.woff2       16.78 kB
dist/assets/KaTeX_Main-Italic-NWA7e6Wa.woff2           16.98 kB
dist/assets/KaTeX_Math-BoldItalic-iY-2wyZ7.woff        18.66 kB
dist/assets/KaTeX_Math-Italic-DA0__PXp.woff            18.74 kB
dist/assets/KaTeX_Main-BoldItalic-SpSLRI95.woff        19.41 kB
dist/assets/KaTeX_SansSerif-Regular-BNo7hRIc.ttf       19.43 kB
dist/assets/KaTeX_Fraktur-Regular-CB_wures.ttf         19.57 kB
dist/assets/KaTeX_Fraktur-Bold-BdnERNNW.ttf            19.58 kB
dist/assets/KaTeX_Main-Italic-BMLOBm91.woff            19.67 kB
dist/assets/KaTeX_SansSerif-Italic-YYjJ1zSn.ttf        22.36 kB
dist/assets/KaTeX_SansSerif-Bold-CFMepnvq.ttf          24.50 kB
dist/assets/KaTeX_Main-Bold-Cx986IdX.woff2             25.32 kB
dist/assets/KaTeX_Main-Regular-B22Nviop.woff2          26.27 kB
dist/assets/KaTeX_Typewriter-Regular-D3Ib7_Hf.ttf      27.55 kB
dist/assets/KaTeX_AMS-Regular-BQhdFMY1.woff2           28.07 kB
dist/assets/KaTeX_Main-Bold-Jm3AIy58.woff              29.91 kB
dist/assets/KaTeX_Main-Regular-Dr94JaBh.woff           30.77 kB
dist/assets/KaTeX_Math-BoldItalic-B3XSjfu4.ttf         31.19 kB
dist/assets/KaTeX_Math-Italic-flOr_0UB.ttf             31.30 kB
dist/assets/KaTeX_Main-BoldItalic-DzxPMmG6.ttf         32.96 kB
dist/assets/KaTeX_AMS-Regular-DMm9YOAa.woff            33.51 kB
dist/assets/KaTeX_Main-Italic-3WenGoN9.ttf             33.58 kB
dist/assets/KaTeX_Main-Bold-waoOVXN0.ttf               51.33 kB
dist/assets/KaTeX_Main-Regular-ypZvNtVU.ttf            53.58 kB
dist/assets/KaTeX_AMS-Regular-DRggAlZN.ttf             63.63 kB
dist/assets/study-progress-Ngnvt50Q.css                29.80 kB │ gzip:   7.97 kB
dist/assets/index-Csa9dwZ3.css                         98.79 kB │ gzip:  19.66 kB
dist/assets/jsx-runtime-DUAcabCT.js                     1.06 kB │ gzip:   0.60 kB
dist/assets/HomePage-BCfXuw81.js                        5.43 kB │ gzip:   1.70 kB
dist/assets/react-DEX2qfRi.js                           7.52 kB │ gzip:   2.87 kB
dist/assets/InfoPage-DQ63Qrs6.js                        7.66 kB │ gzip:   2.59 kB
dist/assets/KnowledgePage-CCfh1Efc.js                  14.86 kB │ gzip:   4.14 kB
dist/assets/CoursePage-BMri9YJY.js                     51.15 kB │ gzip:  13.36 kB
dist/assets/StudyPage-DARYs1Ah.js                      70.05 kB │ gzip:  18.07 kB
dist/assets/dist-B07zVGNr.js                          100.42 kB │ gzip:  25.82 kB
dist/assets/HandTrackingPage-C_xAGWNT.js              170.34 kB │ gzip:  51.00 kB
dist/assets/index-AuMVDgkq.js                         195.42 kB │ gzip:  61.61 kB
dist/assets/study-progress-HYFWFq93.js                397.27 kB │ gzip: 120.25 kB
✓ built in 640ms passed all workspace typechecks, 63 server tests, 38 web tests, and production builds;  passed. |

| 2026-10-10 | Mark small method samples as early signals | Method progress cards now label one or two scored checks as an early signal and state that at least three checks provide a steadier topic-level signal. Regression coverage verifies the threshold at two and three checks. Existing copy cautions that topic and question differences limit method comparisons. > npm run typecheck && npm test && npm run build
> npm run typecheck --workspaces --if-present
> tsc -p tsconfig.json --noEmit
> tsc -p tsconfig.json --noEmit
> tsc -b --pretty false
> tsc -p tsconfig.json
> npm run test --workspaces --if-present
> tsx --test test/**/*.test.ts
(node:54133) ExperimentalWarning: SQLite is an experimental feature and might change at any time
(Use `node --trace-warnings ...` to show where the warning was created)
✔ GET /api/health reports the shared API version (309.8555ms)
✔ course library persists a course and its uploaded material (97.701375ms)
✔ PDF extraction preserves page-level provenance (1107.570208ms)
✔ PDF math layout reconstructs a stacked numerator over a square-root denominator (1.572542ms)
Warning: Indexing all PDF objects
✔ source reprocessing keeps the previous passages when extraction fails (74.49975ms)
✔ original source route refuses non-PDF materials (27.486375ms)
✔ empty extractable sources fail visibly without losing the upload (18.550333ms)
✔ DOCX extraction preserves paragraph provenance and headings (31.806666ms)
✔ PPTX extraction preserves slide provenance (22.271166ms)
✔ invalid Office packages fail visibly without losing the upload (25.062875ms)
✔ legacy passage locators migrate to canonical JSON (15.488041ms)
✔ startup turns interrupted extraction into an explicit failure (20.851583ms)
✔ course creation rejects an empty title (16.605125ms)
✔ unsupported uploads do not create material records (19.22725ms)
(node:54134) ExperimentalWarning: SQLite is an experimental feature and might change at any time
(Use `node --trace-warnings ...` to show where the warning was created)
✔ model router keeps narrow tasks on Luna and synthesis on Terra (2.809291ms)
✔ study generation JSON schema uses only required model-authored fields (17.235833ms)
✔ Codex runner reports local installation and authentication (277.395958ms)
✔ Codex runner selects a model and validates structured output (194.947583ms)
✔ Codex runner rejects execution failures and invalid output (663.415875ms)
✔ Codex runner stops a timed-out run explicitly (30.740375ms)
✔ Codex runner serializes model calls (430.603959ms)
✔ GET /api/codex/status exposes setup readiness (386.492917ms)
✔ course-map.v1 accepts internally consistent source-grounded structure (17.610958ms)
✔ course-map.v1 rejects dangling course and source references (7.239417ms)
✔ source-classification.v1 requires unique, internally grounded sources (1.646541ms)
(node:54136) ExperimentalWarning: SQLite is an experimental feature and might change at any time
(Use `node --trace-warnings ...` to show where the warning was created)
✔ study recommendations prefer nearer upcoming assessments when signals tie (6.577458ms)
✔ study generation exposes a safe CLI diagnostic for troubleshooting (743.267292ms)
✔ professor topic-list parser removes common numbering and bullets and deduplicates case-insensitively (5.385041ms)
✔ professor topic-list parser removes common copied scope headings (0.745042ms)
✔ study budget allocates exactly the available minutes and favors weak topics (0.480208ms)
✔ assessment study plan weights saved evidence and reports deadline timing (2.692833ms)
✔ assessment schedule spreads sessions before the deadline and flags over-capacity time (2.328417ms)
✔ category progress counts only the displayed topics and ignores duplicate titles (0.159958ms)
✔ study coverage distinguishes lesson sessions from saved knowledge checks (0.338875ms)
✔ homework next-topic recommendation prioritizes review, untouched topics, then stale topics (2.20475ms)
✔ spaced recall uses shorter intervals for uncertain evidence and extends after independent success (0.245708ms)
✔ recommendations surface due spaced recall and show the next date before it is due (0.192209ms)
✔ class recommendation distinguishes lesson-only topics and suggests their first knowledge check (0.068291ms)
✔ recommendations ask for an independent check after assisted-only correct attempts (0.214084ms)
✔ cross-scope recommendations preserve review urgency and instructor priority (0.226792ms)
✔ math text preserves TeX and repairs JSON-decoded control characters inside math (4.963041ms)
✔ math text renders recognizable PDF Dirac notation without changing code or delimited math (2.153625ms)
✔ instructor topic lists persist as class-scoped learner assessment topics (163.681458ms)
✔ adding a topic already in an assessment can link its existing class progress (114.801458ms)
✔ study attempts from a learner exam scope update assessment and topic progress (135.672583ms)
✔ learner-data export includes the full class profile, saved sessions, and responses (59.657583ms)
✔ exam topic study selects a matching class source and marks unmatched topics as general knowledge (51.182292ms)
✔ study methods send distinct learning directions (45.853125ms)
✔ error-analysis refuses generated work without four numbered steps (23.694417ms)
✔ error-analysis refuses adaptive work without four numbered steps (21.363625ms)
✔ compare and contrast uses accepted course-map neighbors in initial and adaptive study (114.498917ms)
✔ free recall saves the learner response as ungraded and keeps the method in history (33.095792ms)
✔ teach-back is a distinct open response that persists independently and exports its reference (50.459708ms)
✔ quiz study, saved answer, method progress, and Obsidian export work together in a disposable class (81.13025ms)
✔ assignment study sessions retrieve only the selected course material and return course-grounded content (35.30975ms)
✔ adaptive questions preserve homework and assessment grounding (32.547417ms)
(node:54137) ExperimentalWarning: SQLite is an experimental feature and might change at any time
(Use `node --trace-warnings ...` to show where the warning was created)
✔ learning artifacts preserve drafts, fingerprints, and accepted history (36.573ms)
(node:54138) ExperimentalWarning: SQLite is an experimental feature and might change at any time
(Use `node --trace-warnings ...` to show where the warning was created)
✔ course sources flow through cached classification, map review, and acceptance (850.287833ms)
(node:54139) ExperimentalWarning: SQLite is an experimental feature and might change at any time
(Use `node --trace-warnings ...` to show where the warning was created)
✔ Obsidian export creates linked class notes and preserves learner-owned text on refresh (784.576791ms)
✔ Obsidian configuration rejects a non-folder vault path (75.235958ms)
✔ Obsidian export refuses a symlinked notes folder without writing outside the vault (13.738417ms)
✔ Obsidian export refuses a class-folder symlink even when it points inside the vault (13.894708ms)
✔ Obsidian source notes link assignments to their accepted topics and assessments (117.362417ms)
ℹ tests 63
ℹ suites 0
ℹ pass 63
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 6293.931125
> tsx --test test/**/*.test.ts test/**/*.test.tsx
✔ assignment and exam topic summaries show due and upcoming spaced recall (41.306875ms)
✔ unscored and missed topics are not mislabeled as scheduled spaced recall (0.37875ms)
✔ low scored accuracy starts quiz-first practice from topic actions (0.264542ms)
✔ instructor topic drafts survive navigation in the same tab and remain class-scoped (3.372ms)
✔ empty instructor topic forms remove their saved draft (60.283375ms)
✔ malformed draft data cannot break the study page (1.266792ms)
✔ scope append preview separates already-listed topics without changing their order (3.473917ms)
✔ appending duplicate topics can still preserve new professor wording (0.326459ms)
✔ first professor wording does not gain an unnecessary append heading (0.174292ms)
✔ retrying the same append does not duplicate professor wording (0.297208ms)
✔ knowledge dashboard keeps mapped, learner-created, and instructor-scope topics distinct (88.3715ms)
✔ knowledge dashboard recommends revisiting incomplete and unsupported checks (1.61425ms)
✔ knowledge dashboard prioritizes a difficult check and explains its suggestion (6.989583ms)
✔ knowledge topic profile shows independent check evidence separately from overall accuracy (2.397916ms)
✔ learner-data cleanup clears only the selected class drafts in every storage (1.745667ms)
✔ learner-data cleanup tolerates blocked storage writes/removals (0.167167ms)
✔ math content repairs damaged TeX and renders with KaTeX (21.967709ms)
✔ inline professor topics and multi-line formulas use KaTeX (19.616708ms)
✔ inline ket-bra products render as a single valid math expression (1.9695ms)
✔ PDF-style reconstructed Dirac fractions render as math (4.152167ms)
✔ Unicode subscript and superscript ket labels render through KaTeX (5.000292ms)
✔ imported Markdown keeps links and images inert while rendering text (1.847625ms)
✔ ungraded methods show unmeasured states instead of zero-percent score bars (10.574792ms)
✔ scored but supported attempts do not imply independent accuracy is zero (0.68325ms)
✔ observed scored and independent results render separate measured bars (0.928375ms)
✔ one or two scored checks are marked as an early signal (0.8405ms)
✔ inconsistent counts cannot render accuracy above 100 percent (0.526583ms)
✔ source comment summary counts annotated passages separately from comments and stale notes (2.242875ms)
✔ knowledge-check drafts resume across browser restarts and stay course scoped (3.32375ms)
✔ expired knowledge-check drafts are removed from every available storage (0.273875ms)
✔ draft restoration bounds the selected answer, hint count, and response size (0.32075ms)
✔ malformed or non-object saved drafts are ignored without breaking study (0.292667ms)
✔ saving an attempt clears its local and session draft copies (0.269125ms)
✔ due-review topic links preserve homework scope and open quiz-first practice (1.261916ms)
✔ unsupported method query values cannot choose a generated study method (0.105083ms)
✔ topic score uses scored checks and keeps ungraded attempts separate (1.685541ms)
✔ topic score is unmeasured until a scored check exists (0.119875ms)
✔ topic score bounds inconsistent server counts (0.114458ms)
✔ topic evidence labels reflect repeated independent results and setbacks (0.2425ms)
ℹ tests 39
ℹ suites 0
ℹ pass 39
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 953.507709
> tsc -p tsconfig.json
> tsc -p tsconfig.json
> tsc -b && vite build
vite v8.1.5 building client environment for production...
[2Ktransforming...✓ 330 modules transformed.
rendering chunks...
computing gzip size...
dist/index.html                                         0.81 kB │ gzip:   0.41 kB
dist/assets/KaTeX_Size3-Regular-CTq5MqoE.woff           4.42 kB
dist/assets/KaTeX_Size4-Regular-Dl5lxZxV.woff2          4.92 kB
dist/assets/KaTeX_Size2-Regular-Dy4dx90m.woff2          5.20 kB
dist/assets/KaTeX_Size1-Regular-mCD8mA8B.woff2          5.46 kB
dist/assets/KaTeX_Size4-Regular-BF-4gkZK.woff           5.98 kB
dist/assets/KaTeX_Size2-Regular-oD1tc_U0.woff           6.18 kB
dist/assets/KaTeX_Size1-Regular-C195tn64.woff           6.49 kB
dist/assets/KaTeX_Caligraphic-Regular-Di6jR-x-.woff2    6.90 kB
dist/assets/KaTeX_Caligraphic-Bold-Dq_IR9rO.woff2       6.91 kB
dist/assets/KaTeX_Size3-Regular-DgpXs0kz.ttf            7.58 kB
dist/assets/KaTeX_Caligraphic-Regular-CTRA-rTL.woff     7.65 kB
dist/assets/KaTeX_Caligraphic-Bold-BEiXGLvX.woff        7.71 kB
dist/assets/KaTeX_Script-Regular-D3wIWfF6.woff2         9.64 kB
dist/assets/KaTeX_SansSerif-Regular-DDBCnlJ7.woff2     10.34 kB
dist/assets/KaTeX_Size4-Regular-DWFBv043.ttf           10.36 kB
dist/assets/KaTeX_Script-Regular-D5yQViql.woff         10.58 kB
dist/assets/KaTeX_Fraktur-Regular-CTYiF6lA.woff2       11.31 kB
dist/assets/KaTeX_Fraktur-Bold-CL6g_b3V.woff2          11.34 kB
dist/assets/KaTeX_Size2-Regular-B7gKUWhC.ttf           11.50 kB
dist/assets/KaTeX_SansSerif-Italic-C3H0VqGB.woff2      12.02 kB
dist/assets/KaTeX_SansSerif-Bold-D1sUS0GD.woff2        12.21 kB
dist/assets/KaTeX_Size1-Regular-Dbsnue_I.ttf           12.22 kB
dist/assets/KaTeX_SansSerif-Regular-CS6fqUqJ.woff      12.31 kB
dist/assets/KaTeX_Caligraphic-Regular-wX97UBjC.ttf     12.34 kB
dist/assets/KaTeX_Caligraphic-Bold-ATXxdsX0.ttf        12.36 kB
dist/assets/KaTeX_Fraktur-Regular-Dxdc4cR9.woff        13.20 kB
dist/assets/KaTeX_Fraktur-Bold-BsDP51OF.woff           13.29 kB
dist/assets/KaTeX_Typewriter-Regular-CO6r4hn1.woff2    13.56 kB
dist/assets/KaTeX_SansSerif-Italic-DN2j7dab.woff       14.11 kB
dist/assets/KaTeX_SansSerif-Bold-DbIhKOiC.woff         14.40 kB
dist/assets/KaTeX_Typewriter-Regular-C0xS9mPB.woff     16.02 kB
dist/assets/KaTeX_Math-BoldItalic-CZnvNsCZ.woff2       16.40 kB
dist/assets/KaTeX_Math-Italic-t53AETM-.woff2           16.44 kB
dist/assets/KaTeX_Script-Regular-C5JkGWo-.ttf          16.64 kB
dist/assets/KaTeX_Main-BoldItalic-DxDJ3AOS.woff2       16.78 kB
dist/assets/KaTeX_Main-Italic-NWA7e6Wa.woff2           16.98 kB
dist/assets/KaTeX_Math-BoldItalic-iY-2wyZ7.woff        18.66 kB
dist/assets/KaTeX_Math-Italic-DA0__PXp.woff            18.74 kB
dist/assets/KaTeX_Main-BoldItalic-SpSLRI95.woff        19.41 kB
dist/assets/KaTeX_SansSerif-Regular-BNo7hRIc.ttf       19.43 kB
dist/assets/KaTeX_Fraktur-Regular-CB_wures.ttf         19.57 kB
dist/assets/KaTeX_Fraktur-Bold-BdnERNNW.ttf            19.58 kB
dist/assets/KaTeX_Main-Italic-BMLOBm91.woff            19.67 kB
dist/assets/KaTeX_SansSerif-Italic-YYjJ1zSn.ttf        22.36 kB
dist/assets/KaTeX_SansSerif-Bold-CFMepnvq.ttf          24.50 kB
dist/assets/KaTeX_Main-Bold-Cx986IdX.woff2             25.32 kB
dist/assets/KaTeX_Main-Regular-B22Nviop.woff2          26.27 kB
dist/assets/KaTeX_Typewriter-Regular-D3Ib7_Hf.ttf      27.55 kB
dist/assets/KaTeX_AMS-Regular-BQhdFMY1.woff2           28.07 kB
dist/assets/KaTeX_Main-Bold-Jm3AIy58.woff              29.91 kB
dist/assets/KaTeX_Main-Regular-Dr94JaBh.woff           30.77 kB
dist/assets/KaTeX_Math-BoldItalic-B3XSjfu4.ttf         31.19 kB
dist/assets/KaTeX_Math-Italic-flOr_0UB.ttf             31.30 kB
dist/assets/KaTeX_Main-BoldItalic-DzxPMmG6.ttf         32.96 kB
dist/assets/KaTeX_AMS-Regular-DMm9YOAa.woff            33.51 kB
dist/assets/KaTeX_Main-Italic-3WenGoN9.ttf             33.58 kB
dist/assets/KaTeX_Main-Bold-waoOVXN0.ttf               51.33 kB
dist/assets/KaTeX_Main-Regular-ypZvNtVU.ttf            53.58 kB
dist/assets/KaTeX_AMS-Regular-DRggAlZN.ttf             63.63 kB
dist/assets/study-progress-Ngnvt50Q.css                29.80 kB │ gzip:   7.97 kB
dist/assets/index-AT2UjVZy.css                         98.97 kB │ gzip:  19.68 kB
dist/assets/jsx-runtime-DUAcabCT.js                     1.06 kB │ gzip:   0.60 kB
dist/assets/HomePage-BCfXuw81.js                        5.43 kB │ gzip:   1.70 kB
dist/assets/react-DEX2qfRi.js                           7.52 kB │ gzip:   2.87 kB
dist/assets/InfoPage-DQ63Qrs6.js                        7.66 kB │ gzip:   2.59 kB
dist/assets/KnowledgePage-CCfh1Efc.js                  14.86 kB │ gzip:   4.14 kB
dist/assets/CoursePage-BMri9YJY.js                     51.15 kB │ gzip:  13.36 kB
dist/assets/StudyPage-CZ_i01Z4.js                      70.22 kB │ gzip:  18.14 kB
dist/assets/dist-B07zVGNr.js                          100.42 kB │ gzip:  25.82 kB
dist/assets/HandTrackingPage-4cmQDHfS.js              170.34 kB │ gzip:  51.00 kB
dist/assets/index-Bafxz4rP.js                         195.42 kB │ gzip:  61.61 kB
dist/assets/study-progress-HYFWFq93.js                397.27 kB │ gzip: 120.25 kB
✓ built in 414ms passed all workspace typechecks, 63 server tests, 39 web tests, and production builds;  passed. |

| 2026-10-10 | Align Obsidian topic sample-size cues | Generated Obsidian topic notes now mark one or two scored checks as an early signal and use the same three-check guidance shown in the app. Disposable export tests verify the cue appears below three scored checks, disappears at three or more, and coexists with weak-accuracy recommendations and link-safe refresh. > npm run typecheck && npm test && npm run build
> npm run typecheck --workspaces --if-present
> tsc -p tsconfig.json --noEmit
> tsc -p tsconfig.json --noEmit
> tsc -b --pretty false
> tsc -p tsconfig.json
> npm run test --workspaces --if-present
> tsx --test test/**/*.test.ts
(node:56327) ExperimentalWarning: SQLite is an experimental feature and might change at any time
(Use `node --trace-warnings ...` to show where the warning was created)
✔ GET /api/health reports the shared API version (459.422916ms)
✔ course library persists a course and its uploaded material (440.037417ms)
✔ PDF extraction preserves page-level provenance (847.909375ms)
✔ PDF math layout reconstructs a stacked numerator over a square-root denominator (0.494417ms)
Warning: Indexing all PDF objects
✔ source reprocessing keeps the previous passages when extraction fails (68.682625ms)
✔ original source route refuses non-PDF materials (42.414041ms)
✔ empty extractable sources fail visibly without losing the upload (33.064916ms)
✔ DOCX extraction preserves paragraph provenance and headings (39.884125ms)
✔ PPTX extraction preserves slide provenance (27.735917ms)
✔ invalid Office packages fail visibly without losing the upload (28.052041ms)
✔ legacy passage locators migrate to canonical JSON (14.88475ms)
✔ startup turns interrupted extraction into an explicit failure (14.204208ms)
✔ course creation rejects an empty title (13.989583ms)
✔ unsupported uploads do not create material records (15.43975ms)
(node:56328) ExperimentalWarning: SQLite is an experimental feature and might change at any time
(Use `node --trace-warnings ...` to show where the warning was created)
✔ model router keeps narrow tasks on Luna and synthesis on Terra (3.304625ms)
✔ study generation JSON schema uses only required model-authored fields (22.746041ms)
✔ Codex runner reports local installation and authentication (606.993958ms)
✔ Codex runner selects a model and validates structured output (248.650417ms)
✔ Codex runner rejects execution failures and invalid output (471.966459ms)
✔ Codex runner stops a timed-out run explicitly (231.663167ms)
✔ Codex runner serializes model calls (397.945875ms)
✔ GET /api/codex/status exposes setup readiness (160.198875ms)
✔ course-map.v1 accepts internally consistent source-grounded structure (9.281667ms)
✔ course-map.v1 rejects dangling course and source references (84.625916ms)
✔ source-classification.v1 requires unique, internally grounded sources (44.735708ms)
(node:56330) ExperimentalWarning: SQLite is an experimental feature and might change at any time
(Use `node --trace-warnings ...` to show where the warning was created)
✔ study recommendations prefer nearer upcoming assessments when signals tie (46.450583ms)
✔ study generation exposes a safe CLI diagnostic for troubleshooting (429.561416ms)
✔ professor topic-list parser removes common numbering and bullets and deduplicates case-insensitively (4.366917ms)
✔ professor topic-list parser removes common copied scope headings (1.075166ms)
✔ study budget allocates exactly the available minutes and favors weak topics (0.873459ms)
✔ assessment study plan weights saved evidence and reports deadline timing (0.792125ms)
✔ assessment schedule spreads sessions before the deadline and flags over-capacity time (3.480666ms)
✔ category progress counts only the displayed topics and ignores duplicate titles (0.353333ms)
✔ study coverage distinguishes lesson sessions from saved knowledge checks (0.383ms)
✔ homework next-topic recommendation prioritizes review, untouched topics, then stale topics (1.838666ms)
✔ spaced recall uses shorter intervals for uncertain evidence and extends after independent success (0.107458ms)
✔ recommendations surface due spaced recall and show the next date before it is due (0.235625ms)
✔ class recommendation distinguishes lesson-only topics and suggests their first knowledge check (0.097459ms)
✔ recommendations ask for an independent check after assisted-only correct attempts (0.284708ms)
✔ cross-scope recommendations preserve review urgency and instructor priority (0.096208ms)
✔ math text preserves TeX and repairs JSON-decoded control characters inside math (1.36425ms)
✔ math text renders recognizable PDF Dirac notation without changing code or delimited math (1.636625ms)
✔ instructor topic lists persist as class-scoped learner assessment topics (425.460041ms)
✔ adding a topic already in an assessment can link its existing class progress (128.703416ms)
✔ study attempts from a learner exam scope update assessment and topic progress (292.354583ms)
✔ learner-data export includes the full class profile, saved sessions, and responses (327.981083ms)
✔ exam topic study selects a matching class source and marks unmatched topics as general knowledge (124.692292ms)
✔ study methods send distinct learning directions (114.234625ms)
✔ error-analysis refuses generated work without four numbered steps (29.54875ms)
✔ error-analysis refuses adaptive work without four numbered steps (24.263041ms)
✔ compare and contrast uses accepted course-map neighbors in initial and adaptive study (71.928958ms)
✔ free recall saves the learner response as ungraded and keeps the method in history (106.951167ms)
✔ teach-back is a distinct open response that persists independently and exports its reference (41.170959ms)
✔ quiz study, saved answer, method progress, and Obsidian export work together in a disposable class (36.253667ms)
✔ assignment study sessions retrieve only the selected course material and return course-grounded content (70.656542ms)
✔ adaptive questions preserve homework and assessment grounding (83.619709ms)
(node:56331) ExperimentalWarning: SQLite is an experimental feature and might change at any time
(Use `node --trace-warnings ...` to show where the warning was created)
✔ learning artifacts preserve drafts, fingerprints, and accepted history (44.462167ms)
(node:56332) ExperimentalWarning: SQLite is an experimental feature and might change at any time
(Use `node --trace-warnings ...` to show where the warning was created)
✔ course sources flow through cached classification, map review, and acceptance (1076.641125ms)
(node:56333) ExperimentalWarning: SQLite is an experimental feature and might change at any time
(Use `node --trace-warnings ...` to show where the warning was created)
✔ Obsidian export creates linked class notes and preserves learner-owned text on refresh (1113.191167ms)
✔ Obsidian configuration rejects a non-folder vault path (118.54475ms)
✔ Obsidian export refuses a symlinked notes folder without writing outside the vault (8.383458ms)
✔ Obsidian export refuses a class-folder symlink even when it points inside the vault (18.4165ms)
✔ Obsidian source notes link assignments to their accepted topics and assessments (85.01725ms)
ℹ tests 63
ℹ suites 0
ℹ pass 63
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 8823.279666
> tsx --test test/**/*.test.ts test/**/*.test.tsx
✔ assignment and exam topic summaries show due and upcoming spaced recall (48.21825ms)
✔ unscored and missed topics are not mislabeled as scheduled spaced recall (0.355042ms)
✔ low scored accuracy starts quiz-first practice from topic actions (0.179417ms)
✔ instructor topic drafts survive navigation in the same tab and remain class-scoped (59.1625ms)
✔ empty instructor topic forms remove their saved draft (0.890417ms)
✔ malformed draft data cannot break the study page (0.241125ms)
✔ scope append preview separates already-listed topics without changing their order (2.373833ms)
✔ appending duplicate topics can still preserve new professor wording (0.130292ms)
✔ first professor wording does not gain an unnecessary append heading (0.066458ms)
✔ retrying the same append does not duplicate professor wording (0.083084ms)
✔ knowledge dashboard keeps mapped, learner-created, and instructor-scope topics distinct (58.730583ms)
✔ knowledge dashboard recommends revisiting incomplete and unsupported checks (2.092167ms)
✔ knowledge dashboard prioritizes a difficult check and explains its suggestion (10.421083ms)
✔ knowledge topic profile shows independent check evidence separately from overall accuracy (7.822792ms)
✔ learner-data cleanup clears only the selected class drafts in every storage (3.952333ms)
✔ learner-data cleanup tolerates blocked storage writes/removals (0.18275ms)
✔ math content repairs damaged TeX and renders with KaTeX (24.627792ms)
✔ inline professor topics and multi-line formulas use KaTeX (22.382584ms)
✔ inline ket-bra products render as a single valid math expression (2.050958ms)
✔ PDF-style reconstructed Dirac fractions render as math (3.213083ms)
✔ Unicode subscript and superscript ket labels render through KaTeX (5.503041ms)
✔ imported Markdown keeps links and images inert while rendering text (2.135666ms)
✔ ungraded methods show unmeasured states instead of zero-percent score bars (6.88225ms)
✔ scored but supported attempts do not imply independent accuracy is zero (0.884125ms)
✔ observed scored and independent results render separate measured bars (0.42975ms)
✔ one or two scored checks are marked as an early signal (0.283416ms)
✔ inconsistent counts cannot render accuracy above 100 percent (0.51275ms)
✔ source comment summary counts annotated passages separately from comments and stale notes (2.586833ms)
✔ knowledge-check drafts resume across browser restarts and stay course scoped (2.992208ms)
✔ expired knowledge-check drafts are removed from every available storage (0.12575ms)
✔ draft restoration bounds the selected answer, hint count, and response size (0.148875ms)
✔ malformed or non-object saved drafts are ignored without breaking study (0.116916ms)
✔ saving an attempt clears its local and session draft copies (6.693042ms)
✔ due-review topic links preserve homework scope and open quiz-first practice (1.054958ms)
✔ unsupported method query values cannot choose a generated study method (0.075ms)
✔ topic score uses scored checks and keeps ungraded attempts separate (2.507917ms)
✔ topic score is unmeasured until a scored check exists (0.131375ms)
✔ topic score bounds inconsistent server counts (0.188459ms)
✔ topic evidence labels reflect repeated independent results and setbacks (0.285167ms)
ℹ tests 39
ℹ suites 0
ℹ pass 39
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 877.363542
> tsc -p tsconfig.json
> tsc -p tsconfig.json
> tsc -b && vite build
vite v8.1.5 building client environment for production...
[2Ktransforming...✓ 330 modules transformed.
rendering chunks...
computing gzip size...
dist/index.html                                         0.81 kB │ gzip:   0.41 kB
dist/assets/KaTeX_Size3-Regular-CTq5MqoE.woff           4.42 kB
dist/assets/KaTeX_Size4-Regular-Dl5lxZxV.woff2          4.92 kB
dist/assets/KaTeX_Size2-Regular-Dy4dx90m.woff2          5.20 kB
dist/assets/KaTeX_Size1-Regular-mCD8mA8B.woff2          5.46 kB
dist/assets/KaTeX_Size4-Regular-BF-4gkZK.woff           5.98 kB
dist/assets/KaTeX_Size2-Regular-oD1tc_U0.woff           6.18 kB
dist/assets/KaTeX_Size1-Regular-C195tn64.woff           6.49 kB
dist/assets/KaTeX_Caligraphic-Regular-Di6jR-x-.woff2    6.90 kB
dist/assets/KaTeX_Caligraphic-Bold-Dq_IR9rO.woff2       6.91 kB
dist/assets/KaTeX_Size3-Regular-DgpXs0kz.ttf            7.58 kB
dist/assets/KaTeX_Caligraphic-Regular-CTRA-rTL.woff     7.65 kB
dist/assets/KaTeX_Caligraphic-Bold-BEiXGLvX.woff        7.71 kB
dist/assets/KaTeX_Script-Regular-D3wIWfF6.woff2         9.64 kB
dist/assets/KaTeX_SansSerif-Regular-DDBCnlJ7.woff2     10.34 kB
dist/assets/KaTeX_Size4-Regular-DWFBv043.ttf           10.36 kB
dist/assets/KaTeX_Script-Regular-D5yQViql.woff         10.58 kB
dist/assets/KaTeX_Fraktur-Regular-CTYiF6lA.woff2       11.31 kB
dist/assets/KaTeX_Fraktur-Bold-CL6g_b3V.woff2          11.34 kB
dist/assets/KaTeX_Size2-Regular-B7gKUWhC.ttf           11.50 kB
dist/assets/KaTeX_SansSerif-Italic-C3H0VqGB.woff2      12.02 kB
dist/assets/KaTeX_SansSerif-Bold-D1sUS0GD.woff2        12.21 kB
dist/assets/KaTeX_Size1-Regular-Dbsnue_I.ttf           12.22 kB
dist/assets/KaTeX_SansSerif-Regular-CS6fqUqJ.woff      12.31 kB
dist/assets/KaTeX_Caligraphic-Regular-wX97UBjC.ttf     12.34 kB
dist/assets/KaTeX_Caligraphic-Bold-ATXxdsX0.ttf        12.36 kB
dist/assets/KaTeX_Fraktur-Regular-Dxdc4cR9.woff        13.20 kB
dist/assets/KaTeX_Fraktur-Bold-BsDP51OF.woff           13.29 kB
dist/assets/KaTeX_Typewriter-Regular-CO6r4hn1.woff2    13.56 kB
dist/assets/KaTeX_SansSerif-Italic-DN2j7dab.woff       14.11 kB
dist/assets/KaTeX_SansSerif-Bold-DbIhKOiC.woff         14.40 kB
dist/assets/KaTeX_Typewriter-Regular-C0xS9mPB.woff     16.02 kB
dist/assets/KaTeX_Math-BoldItalic-CZnvNsCZ.woff2       16.40 kB
dist/assets/KaTeX_Math-Italic-t53AETM-.woff2           16.44 kB
dist/assets/KaTeX_Script-Regular-C5JkGWo-.ttf          16.64 kB
dist/assets/KaTeX_Main-BoldItalic-DxDJ3AOS.woff2       16.78 kB
dist/assets/KaTeX_Main-Italic-NWA7e6Wa.woff2           16.98 kB
dist/assets/KaTeX_Math-BoldItalic-iY-2wyZ7.woff        18.66 kB
dist/assets/KaTeX_Math-Italic-DA0__PXp.woff            18.74 kB
dist/assets/KaTeX_Main-BoldItalic-SpSLRI95.woff        19.41 kB
dist/assets/KaTeX_SansSerif-Regular-BNo7hRIc.ttf       19.43 kB
dist/assets/KaTeX_Fraktur-Regular-CB_wures.ttf         19.57 kB
dist/assets/KaTeX_Fraktur-Bold-BdnERNNW.ttf            19.58 kB
dist/assets/KaTeX_Main-Italic-BMLOBm91.woff            19.67 kB
dist/assets/KaTeX_SansSerif-Italic-YYjJ1zSn.ttf        22.36 kB
dist/assets/KaTeX_SansSerif-Bold-CFMepnvq.ttf          24.50 kB
dist/assets/KaTeX_Main-Bold-Cx986IdX.woff2             25.32 kB
dist/assets/KaTeX_Main-Regular-B22Nviop.woff2          26.27 kB
dist/assets/KaTeX_Typewriter-Regular-D3Ib7_Hf.ttf      27.55 kB
dist/assets/KaTeX_AMS-Regular-BQhdFMY1.woff2           28.07 kB
dist/assets/KaTeX_Main-Bold-Jm3AIy58.woff              29.91 kB
dist/assets/KaTeX_Main-Regular-Dr94JaBh.woff           30.77 kB
dist/assets/KaTeX_Math-BoldItalic-B3XSjfu4.ttf         31.19 kB
dist/assets/KaTeX_Math-Italic-flOr_0UB.ttf             31.30 kB
dist/assets/KaTeX_Main-BoldItalic-DzxPMmG6.ttf         32.96 kB
dist/assets/KaTeX_AMS-Regular-DMm9YOAa.woff            33.51 kB
dist/assets/KaTeX_Main-Italic-3WenGoN9.ttf             33.58 kB
dist/assets/KaTeX_Main-Bold-waoOVXN0.ttf               51.33 kB
dist/assets/KaTeX_Main-Regular-ypZvNtVU.ttf            53.58 kB
dist/assets/KaTeX_AMS-Regular-DRggAlZN.ttf             63.63 kB
dist/assets/study-progress-Ngnvt50Q.css                29.80 kB │ gzip:   7.97 kB
dist/assets/index-AT2UjVZy.css                         98.97 kB │ gzip:  19.68 kB
dist/assets/jsx-runtime-DUAcabCT.js                     1.06 kB │ gzip:   0.60 kB
dist/assets/HomePage-BCfXuw81.js                        5.43 kB │ gzip:   1.70 kB
dist/assets/react-DEX2qfRi.js                           7.52 kB │ gzip:   2.87 kB
dist/assets/InfoPage-DQ63Qrs6.js                        7.66 kB │ gzip:   2.59 kB
dist/assets/KnowledgePage-CCfh1Efc.js                  14.86 kB │ gzip:   4.14 kB
dist/assets/CoursePage-BMri9YJY.js                     51.15 kB │ gzip:  13.36 kB
dist/assets/StudyPage-CZ_i01Z4.js                      70.22 kB │ gzip:  18.14 kB
dist/assets/dist-B07zVGNr.js                          100.42 kB │ gzip:  25.82 kB
dist/assets/HandTrackingPage-4cmQDHfS.js              170.34 kB │ gzip:  51.00 kB
dist/assets/index-Bafxz4rP.js                         195.42 kB │ gzip:  61.61 kB
dist/assets/study-progress-HYFWFq93.js                397.27 kB │ gzip: 120.25 kB
✓ built in 351ms passed all workspace typechecks, 63 server tests, 39 web tests, and production builds;  passed. The configured personal vault was not modified. |

| 2026-10-10 | Align Obsidian method progress sample cues | The Obsidian course dashboard now marks methods and their topic-level entries with 1–2 scored checks as an early signal, matching the app and topic notes. Disposable vault tests verify the cue appears at 1/1 and is absent at 3/3. > npm run typecheck && npm test && npm run build
> npm run typecheck --workspaces --if-present
> tsc -p tsconfig.json --noEmit
> tsc -p tsconfig.json --noEmit
> tsc -b --pretty false
> tsc -p tsconfig.json
> npm run test --workspaces --if-present
> tsx --test test/**/*.test.ts
(node:58340) ExperimentalWarning: SQLite is an experimental feature and might change at any time
(Use `node --trace-warnings ...` to show where the warning was created)
✔ GET /api/health reports the shared API version (307.636667ms)
✔ course library persists a course and its uploaded material (178.181375ms)
✔ PDF extraction preserves page-level provenance (393.173084ms)
✔ PDF math layout reconstructs a stacked numerator over a square-root denominator (0.56475ms)
Warning: Indexing all PDF objects
✔ source reprocessing keeps the previous passages when extraction fails (33.846583ms)
✔ original source route refuses non-PDF materials (18.772959ms)
✔ empty extractable sources fail visibly without losing the upload (17.261833ms)
✔ DOCX extraction preserves paragraph provenance and headings (21.905958ms)
✔ PPTX extraction preserves slide provenance (18.814708ms)
✔ invalid Office packages fail visibly without losing the upload (18.403417ms)
✔ legacy passage locators migrate to canonical JSON (13.291667ms)
✔ startup turns interrupted extraction into an explicit failure (13.995542ms)
✔ course creation rejects an empty title (11.74275ms)
✔ unsupported uploads do not create material records (12.80175ms)
(node:58341) ExperimentalWarning: SQLite is an experimental feature and might change at any time
(Use `node --trace-warnings ...` to show where the warning was created)
✔ model router keeps narrow tasks on Luna and synthesis on Terra (3.902375ms)
✔ study generation JSON schema uses only required model-authored fields (5.685708ms)
✔ Codex runner reports local installation and authentication (410.379292ms)
✔ Codex runner selects a model and validates structured output (142.111666ms)
✔ Codex runner rejects execution failures and invalid output (244.829708ms)
✔ Codex runner stops a timed-out run explicitly (29.901417ms)
✔ Codex runner serializes model calls (322.81225ms)
✔ GET /api/codex/status exposes setup readiness (61.629084ms)
✔ course-map.v1 accepts internally consistent source-grounded structure (3.020666ms)
✔ course-map.v1 rejects dangling course and source references (1.275125ms)
✔ source-classification.v1 requires unique, internally grounded sources (0.576667ms)
(node:58343) ExperimentalWarning: SQLite is an experimental feature and might change at any time
(Use `node --trace-warnings ...` to show where the warning was created)
✔ study recommendations prefer nearer upcoming assessments when signals tie (10.35125ms)
✔ study generation exposes a safe CLI diagnostic for troubleshooting (352.252625ms)
✔ professor topic-list parser removes common numbering and bullets and deduplicates case-insensitively (1.984125ms)
✔ professor topic-list parser removes common copied scope headings (0.896125ms)
✔ study budget allocates exactly the available minutes and favors weak topics (0.513833ms)
✔ assessment study plan weights saved evidence and reports deadline timing (0.710791ms)
✔ assessment schedule spreads sessions before the deadline and flags over-capacity time (1.049042ms)
✔ category progress counts only the displayed topics and ignores duplicate titles (0.336541ms)
✔ study coverage distinguishes lesson sessions from saved knowledge checks (1.963208ms)
✔ homework next-topic recommendation prioritizes review, untouched topics, then stale topics (3.268458ms)
✔ spaced recall uses shorter intervals for uncertain evidence and extends after independent success (0.168833ms)
✔ recommendations surface due spaced recall and show the next date before it is due (0.46ms)
✔ class recommendation distinguishes lesson-only topics and suggests their first knowledge check (0.173208ms)
✔ recommendations ask for an independent check after assisted-only correct attempts (0.464833ms)
✔ cross-scope recommendations preserve review urgency and instructor priority (0.13875ms)
✔ math text preserves TeX and repairs JSON-decoded control characters inside math (1.004584ms)
✔ math text renders recognizable PDF Dirac notation without changing code or delimited math (6.033875ms)
✔ instructor topic lists persist as class-scoped learner assessment topics (126.010209ms)
✔ adding a topic already in an assessment can link its existing class progress (23.749875ms)
✔ study attempts from a learner exam scope update assessment and topic progress (63.112083ms)
✔ learner-data export includes the full class profile, saved sessions, and responses (59.7675ms)
✔ exam topic study selects a matching class source and marks unmatched topics as general knowledge (39.917667ms)
✔ study methods send distinct learning directions (36.601667ms)
✔ error-analysis refuses generated work without four numbered steps (15.701167ms)
✔ error-analysis refuses adaptive work without four numbered steps (17.575417ms)
✔ compare and contrast uses accepted course-map neighbors in initial and adaptive study (42.489917ms)
✔ free recall saves the learner response as ungraded and keeps the method in history (29.970708ms)
✔ teach-back is a distinct open response that persists independently and exports its reference (32.380958ms)
✔ quiz study, saved answer, method progress, and Obsidian export work together in a disposable class (41.756708ms)
✔ assignment study sessions retrieve only the selected course material and return course-grounded content (28.869667ms)
✔ adaptive questions preserve homework and assessment grounding (23.808ms)
(node:58344) ExperimentalWarning: SQLite is an experimental feature and might change at any time
(Use `node --trace-warnings ...` to show where the warning was created)
✔ learning artifacts preserve drafts, fingerprints, and accepted history (10.103583ms)
(node:58345) ExperimentalWarning: SQLite is an experimental feature and might change at any time
(Use `node --trace-warnings ...` to show where the warning was created)
✔ course sources flow through cached classification, map review, and acceptance (507.763375ms)
(node:58346) ExperimentalWarning: SQLite is an experimental feature and might change at any time
(Use `node --trace-warnings ...` to show where the warning was created)
✔ Obsidian export creates linked class notes and preserves learner-owned text on refresh (574.82425ms)
✔ Obsidian configuration rejects a non-folder vault path (25.841125ms)
✔ Obsidian export refuses a symlinked notes folder without writing outside the vault (4.019416ms)
✔ Obsidian export refuses a class-folder symlink even when it points inside the vault (5.07375ms)
✔ Obsidian source notes link assignments to their accepted topics and assessments (36.935125ms)
ℹ tests 63
ℹ suites 0
ℹ pass 63
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 3704.721417
> tsx --test test/**/*.test.ts test/**/*.test.tsx
✔ assignment and exam topic summaries show due and upcoming spaced recall (51.112291ms)
✔ unscored and missed topics are not mislabeled as scheduled spaced recall (0.286333ms)
✔ low scored accuracy starts quiz-first practice from topic actions (0.314208ms)
✔ instructor topic drafts survive navigation in the same tab and remain class-scoped (4.3145ms)
✔ empty instructor topic forms remove their saved draft (0.119083ms)
✔ malformed draft data cannot break the study page (0.0875ms)
✔ scope append preview separates already-listed topics without changing their order (3.138708ms)
✔ appending duplicate topics can still preserve new professor wording (0.294708ms)
✔ first professor wording does not gain an unnecessary append heading (0.52175ms)
✔ retrying the same append does not duplicate professor wording (0.073ms)
✔ knowledge dashboard keeps mapped, learner-created, and instructor-scope topics distinct (89.219333ms)
✔ knowledge dashboard recommends revisiting incomplete and unsupported checks (3.479333ms)
✔ knowledge dashboard prioritizes a difficult check and explains its suggestion (4.876375ms)
✔ knowledge topic profile shows independent check evidence separately from overall accuracy (3.310125ms)
✔ learner-data cleanup clears only the selected class drafts in every storage (3.03175ms)
✔ learner-data cleanup tolerates blocked storage writes/removals (0.371667ms)
✔ math content repairs damaged TeX and renders with KaTeX (19.625791ms)
✔ inline professor topics and multi-line formulas use KaTeX (16.568917ms)
✔ inline ket-bra products render as a single valid math expression (1.982667ms)
✔ PDF-style reconstructed Dirac fractions render as math (3.326125ms)
✔ Unicode subscript and superscript ket labels render through KaTeX (5.019791ms)
✔ imported Markdown keeps links and images inert while rendering text (1.925625ms)
✔ ungraded methods show unmeasured states instead of zero-percent score bars (14.019292ms)
✔ scored but supported attempts do not imply independent accuracy is zero (1.555041ms)
✔ observed scored and independent results render separate measured bars (1.502042ms)
✔ one or two scored checks are marked as an early signal (0.592458ms)
✔ inconsistent counts cannot render accuracy above 100 percent (0.722166ms)
✔ source comment summary counts annotated passages separately from comments and stale notes (2.30025ms)
✔ knowledge-check drafts resume across browser restarts and stay course scoped (1.691583ms)
✔ expired knowledge-check drafts are removed from every available storage (0.111042ms)
✔ draft restoration bounds the selected answer, hint count, and response size (0.140042ms)
✔ malformed or non-object saved drafts are ignored without breaking study (0.120042ms)
✔ saving an attempt clears its local and session draft copies (0.102334ms)
✔ due-review topic links preserve homework scope and open quiz-first practice (2.276833ms)
✔ unsupported method query values cannot choose a generated study method (0.205125ms)
✔ topic score uses scored checks and keeps ungraded attempts separate (1.479875ms)
✔ topic score is unmeasured until a scored check exists (0.145333ms)
✔ topic score bounds inconsistent server counts (0.06975ms)
✔ topic evidence labels reflect repeated independent results and setbacks (0.151833ms)
ℹ tests 39
ℹ suites 0
ℹ pass 39
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 746.362
> tsc -p tsconfig.json
> tsc -p tsconfig.json
> tsc -b && vite build
vite v8.1.5 building client environment for production...
[2Ktransforming...✓ 330 modules transformed.
rendering chunks...
computing gzip size...
dist/index.html                                         0.81 kB │ gzip:   0.41 kB
dist/assets/KaTeX_Size3-Regular-CTq5MqoE.woff           4.42 kB
dist/assets/KaTeX_Size4-Regular-Dl5lxZxV.woff2          4.92 kB
dist/assets/KaTeX_Size2-Regular-Dy4dx90m.woff2          5.20 kB
dist/assets/KaTeX_Size1-Regular-mCD8mA8B.woff2          5.46 kB
dist/assets/KaTeX_Size4-Regular-BF-4gkZK.woff           5.98 kB
dist/assets/KaTeX_Size2-Regular-oD1tc_U0.woff           6.18 kB
dist/assets/KaTeX_Size1-Regular-C195tn64.woff           6.49 kB
dist/assets/KaTeX_Caligraphic-Regular-Di6jR-x-.woff2    6.90 kB
dist/assets/KaTeX_Caligraphic-Bold-Dq_IR9rO.woff2       6.91 kB
dist/assets/KaTeX_Size3-Regular-DgpXs0kz.ttf            7.58 kB
dist/assets/KaTeX_Caligraphic-Regular-CTRA-rTL.woff     7.65 kB
dist/assets/KaTeX_Caligraphic-Bold-BEiXGLvX.woff        7.71 kB
dist/assets/KaTeX_Script-Regular-D3wIWfF6.woff2         9.64 kB
dist/assets/KaTeX_SansSerif-Regular-DDBCnlJ7.woff2     10.34 kB
dist/assets/KaTeX_Size4-Regular-DWFBv043.ttf           10.36 kB
dist/assets/KaTeX_Script-Regular-D5yQViql.woff         10.58 kB
dist/assets/KaTeX_Fraktur-Regular-CTYiF6lA.woff2       11.31 kB
dist/assets/KaTeX_Fraktur-Bold-CL6g_b3V.woff2          11.34 kB
dist/assets/KaTeX_Size2-Regular-B7gKUWhC.ttf           11.50 kB
dist/assets/KaTeX_SansSerif-Italic-C3H0VqGB.woff2      12.02 kB
dist/assets/KaTeX_SansSerif-Bold-D1sUS0GD.woff2        12.21 kB
dist/assets/KaTeX_Size1-Regular-Dbsnue_I.ttf           12.22 kB
dist/assets/KaTeX_SansSerif-Regular-CS6fqUqJ.woff      12.31 kB
dist/assets/KaTeX_Caligraphic-Regular-wX97UBjC.ttf     12.34 kB
dist/assets/KaTeX_Caligraphic-Bold-ATXxdsX0.ttf        12.36 kB
dist/assets/KaTeX_Fraktur-Regular-Dxdc4cR9.woff        13.20 kB
dist/assets/KaTeX_Fraktur-Bold-BsDP51OF.woff           13.29 kB
dist/assets/KaTeX_Typewriter-Regular-CO6r4hn1.woff2    13.56 kB
dist/assets/KaTeX_SansSerif-Italic-DN2j7dab.woff       14.11 kB
dist/assets/KaTeX_SansSerif-Bold-DbIhKOiC.woff         14.40 kB
dist/assets/KaTeX_Typewriter-Regular-C0xS9mPB.woff     16.02 kB
dist/assets/KaTeX_Math-BoldItalic-CZnvNsCZ.woff2       16.40 kB
dist/assets/KaTeX_Math-Italic-t53AETM-.woff2           16.44 kB
dist/assets/KaTeX_Script-Regular-C5JkGWo-.ttf          16.64 kB
dist/assets/KaTeX_Main-BoldItalic-DxDJ3AOS.woff2       16.78 kB
dist/assets/KaTeX_Main-Italic-NWA7e6Wa.woff2           16.98 kB
dist/assets/KaTeX_Math-BoldItalic-iY-2wyZ7.woff        18.66 kB
dist/assets/KaTeX_Math-Italic-DA0__PXp.woff            18.74 kB
dist/assets/KaTeX_Main-BoldItalic-SpSLRI95.woff        19.41 kB
dist/assets/KaTeX_SansSerif-Regular-BNo7hRIc.ttf       19.43 kB
dist/assets/KaTeX_Fraktur-Regular-CB_wures.ttf         19.57 kB
dist/assets/KaTeX_Fraktur-Bold-BdnERNNW.ttf            19.58 kB
dist/assets/KaTeX_Main-Italic-BMLOBm91.woff            19.67 kB
dist/assets/KaTeX_SansSerif-Italic-YYjJ1zSn.ttf        22.36 kB
dist/assets/KaTeX_SansSerif-Bold-CFMepnvq.ttf          24.50 kB
dist/assets/KaTeX_Main-Bold-Cx986IdX.woff2             25.32 kB
dist/assets/KaTeX_Main-Regular-B22Nviop.woff2          26.27 kB
dist/assets/KaTeX_Typewriter-Regular-D3Ib7_Hf.ttf      27.55 kB
dist/assets/KaTeX_AMS-Regular-BQhdFMY1.woff2           28.07 kB
dist/assets/KaTeX_Main-Bold-Jm3AIy58.woff              29.91 kB
dist/assets/KaTeX_Main-Regular-Dr94JaBh.woff           30.77 kB
dist/assets/KaTeX_Math-BoldItalic-B3XSjfu4.ttf         31.19 kB
dist/assets/KaTeX_Math-Italic-flOr_0UB.ttf             31.30 kB
dist/assets/KaTeX_Main-BoldItalic-DzxPMmG6.ttf         32.96 kB
dist/assets/KaTeX_AMS-Regular-DMm9YOAa.woff            33.51 kB
dist/assets/KaTeX_Main-Italic-3WenGoN9.ttf             33.58 kB
dist/assets/KaTeX_Main-Bold-waoOVXN0.ttf               51.33 kB
dist/assets/KaTeX_Main-Regular-ypZvNtVU.ttf            53.58 kB
dist/assets/KaTeX_AMS-Regular-DRggAlZN.ttf             63.63 kB
dist/assets/study-progress-Ngnvt50Q.css                29.80 kB │ gzip:   7.97 kB
dist/assets/index-AT2UjVZy.css                         98.97 kB │ gzip:  19.68 kB
dist/assets/jsx-runtime-DUAcabCT.js                     1.06 kB │ gzip:   0.60 kB
dist/assets/HomePage-BCfXuw81.js                        5.43 kB │ gzip:   1.70 kB
dist/assets/react-DEX2qfRi.js                           7.52 kB │ gzip:   2.87 kB
dist/assets/InfoPage-DQ63Qrs6.js                        7.66 kB │ gzip:   2.59 kB
dist/assets/KnowledgePage-CCfh1Efc.js                  14.86 kB │ gzip:   4.14 kB
dist/assets/CoursePage-BMri9YJY.js                     51.15 kB │ gzip:  13.36 kB
dist/assets/StudyPage-CZ_i01Z4.js                      70.22 kB │ gzip:  18.14 kB
dist/assets/dist-B07zVGNr.js                          100.42 kB │ gzip:  25.82 kB
dist/assets/HandTrackingPage-4cmQDHfS.js              170.34 kB │ gzip:  51.00 kB
dist/assets/index-Bafxz4rP.js                         195.42 kB │ gzip:  61.61 kB
dist/assets/study-progress-HYFWFq93.js                397.27 kB │ gzip: 120.25 kB
✓ built in 417ms passed all workspace typechecks, 63 server tests, 39 web tests, and production builds;  passed. |

| 2026-10-10 | Scope sample-size wording to the measured signal | Method-level progress now says three checks give a steadier signal without implying all checks share one topic. Topic-level entries retain the topic-specific wording. Web and server tests verify the distinct copy; > npm run typecheck && npm test && npm run build
> npm run typecheck --workspaces --if-present
> tsc -p tsconfig.json --noEmit
> tsc -p tsconfig.json --noEmit
> tsc -b --pretty false
> tsc -p tsconfig.json
> npm run test --workspaces --if-present
> tsx --test test/**/*.test.ts
(node:59520) ExperimentalWarning: SQLite is an experimental feature and might change at any time
(Use `node --trace-warnings ...` to show where the warning was created)
✔ GET /api/health reports the shared API version (400.299667ms)
✔ course library persists a course and its uploaded material (136.058875ms)
✔ PDF extraction preserves page-level provenance (451.907125ms)
✔ PDF math layout reconstructs a stacked numerator over a square-root denominator (0.544584ms)
Warning: Indexing all PDF objects
✔ source reprocessing keeps the previous passages when extraction fails (33.606958ms)
✔ original source route refuses non-PDF materials (18.117125ms)
✔ empty extractable sources fail visibly without losing the upload (17.588458ms)
✔ DOCX extraction preserves paragraph provenance and headings (22.298333ms)
✔ PPTX extraction preserves slide provenance (17.829792ms)
✔ invalid Office packages fail visibly without losing the upload (16.419583ms)
✔ legacy passage locators migrate to canonical JSON (11.843ms)
✔ startup turns interrupted extraction into an explicit failure (14.223042ms)
✔ course creation rejects an empty title (12.069792ms)
✔ unsupported uploads do not create material records (13.489042ms)
(node:59521) ExperimentalWarning: SQLite is an experimental feature and might change at any time
(Use `node --trace-warnings ...` to show where the warning was created)
✔ model router keeps narrow tasks on Luna and synthesis on Terra (2.088167ms)
✔ study generation JSON schema uses only required model-authored fields (4.911584ms)
✔ Codex runner reports local installation and authentication (382.466333ms)
✔ Codex runner selects a model and validates structured output (216.174458ms)
✔ Codex runner rejects execution failures and invalid output (299.347042ms)
✔ Codex runner stops a timed-out run explicitly (31.589875ms)
✔ Codex runner serializes model calls (323.5565ms)
✔ GET /api/codex/status exposes setup readiness (85.504875ms)
✔ course-map.v1 accepts internally consistent source-grounded structure (4.106958ms)
✔ course-map.v1 rejects dangling course and source references (4.670875ms)
✔ source-classification.v1 requires unique, internally grounded sources (0.618125ms)
(node:59524) ExperimentalWarning: SQLite is an experimental feature and might change at any time
(Use `node --trace-warnings ...` to show where the warning was created)
✔ study recommendations prefer nearer upcoming assessments when signals tie (4.52825ms)
✔ study generation exposes a safe CLI diagnostic for troubleshooting (304.448125ms)
✔ professor topic-list parser removes common numbering and bullets and deduplicates case-insensitively (4.0015ms)
✔ professor topic-list parser removes common copied scope headings (1.737083ms)
✔ study budget allocates exactly the available minutes and favors weak topics (0.510333ms)
✔ assessment study plan weights saved evidence and reports deadline timing (1.133125ms)
✔ assessment schedule spreads sessions before the deadline and flags over-capacity time (1.450958ms)
✔ category progress counts only the displayed topics and ignores duplicate titles (0.210791ms)
✔ study coverage distinguishes lesson sessions from saved knowledge checks (0.903375ms)
✔ homework next-topic recommendation prioritizes review, untouched topics, then stale topics (2.971333ms)
✔ spaced recall uses shorter intervals for uncertain evidence and extends after independent success (0.264125ms)
✔ recommendations surface due spaced recall and show the next date before it is due (0.439667ms)
✔ class recommendation distinguishes lesson-only topics and suggests their first knowledge check (0.210583ms)
✔ recommendations ask for an independent check after assisted-only correct attempts (0.904042ms)
✔ cross-scope recommendations preserve review urgency and instructor priority (0.196958ms)
✔ math text preserves TeX and repairs JSON-decoded control characters inside math (4.20425ms)
✔ math text renders recognizable PDF Dirac notation without changing code or delimited math (3.626208ms)
✔ instructor topic lists persist as class-scoped learner assessment topics (107.895458ms)
✔ adding a topic already in an assessment can link its existing class progress (110.617042ms)
✔ study attempts from a learner exam scope update assessment and topic progress (87.114417ms)
✔ learner-data export includes the full class profile, saved sessions, and responses (56.358083ms)
✔ exam topic study selects a matching class source and marks unmatched topics as general knowledge (53.117708ms)
✔ study methods send distinct learning directions (48.624208ms)
✔ error-analysis refuses generated work without four numbered steps (17.621834ms)
✔ error-analysis refuses adaptive work without four numbered steps (17.140208ms)
✔ compare and contrast uses accepted course-map neighbors in initial and adaptive study (50.294542ms)
✔ free recall saves the learner response as ungraded and keeps the method in history (30.133542ms)
✔ teach-back is a distinct open response that persists independently and exports its reference (26.436333ms)
✔ quiz study, saved answer, method progress, and Obsidian export work together in a disposable class (43.738958ms)
✔ assignment study sessions retrieve only the selected course material and return course-grounded content (35.466708ms)
✔ adaptive questions preserve homework and assessment grounding (32.512958ms)
(node:59525) ExperimentalWarning: SQLite is an experimental feature and might change at any time
(Use `node --trace-warnings ...` to show where the warning was created)
✔ learning artifacts preserve drafts, fingerprints, and accepted history (9.264833ms)
(node:59526) ExperimentalWarning: SQLite is an experimental feature and might change at any time
(Use `node --trace-warnings ...` to show where the warning was created)
✔ course sources flow through cached classification, map review, and acceptance (650.73375ms)
(node:59527) ExperimentalWarning: SQLite is an experimental feature and might change at any time
(Use `node --trace-warnings ...` to show where the warning was created)
✔ Obsidian export creates linked class notes and preserves learner-owned text on refresh (639.579083ms)
✔ Obsidian configuration rejects a non-folder vault path (24.468208ms)
✔ Obsidian export refuses a symlinked notes folder without writing outside the vault (4.870167ms)
✔ Obsidian export refuses a class-folder symlink even when it points inside the vault (4.420125ms)
✔ Obsidian source notes link assignments to their accepted topics and assessments (48.588666ms)
ℹ tests 63
ℹ suites 0
ℹ pass 63
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 4008.848083
> tsx --test test/**/*.test.ts test/**/*.test.tsx
✔ assignment and exam topic summaries show due and upcoming spaced recall (23.269583ms)
✔ unscored and missed topics are not mislabeled as scheduled spaced recall (0.201917ms)
✔ low scored accuracy starts quiz-first practice from topic actions (0.094208ms)
✔ instructor topic drafts survive navigation in the same tab and remain class-scoped (1.74275ms)
✔ empty instructor topic forms remove their saved draft (0.097916ms)
✔ malformed draft data cannot break the study page (0.081084ms)
✔ scope append preview separates already-listed topics without changing their order (1.685792ms)
✔ appending duplicate topics can still preserve new professor wording (0.095042ms)
✔ first professor wording does not gain an unnecessary append heading (0.072625ms)
✔ retrying the same append does not duplicate professor wording (0.055042ms)
✔ knowledge dashboard keeps mapped, learner-created, and instructor-scope topics distinct (58.390625ms)
✔ knowledge dashboard recommends revisiting incomplete and unsupported checks (3.264042ms)
✔ knowledge dashboard prioritizes a difficult check and explains its suggestion (5.046875ms)
✔ knowledge topic profile shows independent check evidence separately from overall accuracy (3.546833ms)
✔ learner-data cleanup clears only the selected class drafts in every storage (1.540292ms)
✔ learner-data cleanup tolerates blocked storage writes/removals (0.144ms)
✔ math content repairs damaged TeX and renders with KaTeX (16.977709ms)
✔ inline professor topics and multi-line formulas use KaTeX (13.967834ms)
✔ inline ket-bra products render as a single valid math expression (1.946167ms)
✔ PDF-style reconstructed Dirac fractions render as math (3.245666ms)
✔ Unicode subscript and superscript ket labels render through KaTeX (5.241666ms)
✔ imported Markdown keeps links and images inert while rendering text (1.826708ms)
✔ ungraded methods show unmeasured states instead of zero-percent score bars (17.890958ms)
✔ scored but supported attempts do not imply independent accuracy is zero (1.477791ms)
✔ observed scored and independent results render separate measured bars (0.88375ms)
✔ one or two scored checks are marked as an early signal (0.65125ms)
✔ inconsistent counts cannot render accuracy above 100 percent (0.754833ms)
✔ source comment summary counts annotated passages separately from comments and stale notes (3.672333ms)
✔ knowledge-check drafts resume across browser restarts and stay course scoped (3.558166ms)
✔ expired knowledge-check drafts are removed from every available storage (0.190042ms)
✔ draft restoration bounds the selected answer, hint count, and response size (0.171291ms)
✔ malformed or non-object saved drafts are ignored without breaking study (0.179916ms)
✔ saving an attempt clears its local and session draft copies (0.1125ms)
✔ due-review topic links preserve homework scope and open quiz-first practice (1.955166ms)
✔ unsupported method query values cannot choose a generated study method (0.251625ms)
✔ topic score uses scored checks and keeps ungraded attempts separate (1.602792ms)
✔ topic score is unmeasured until a scored check exists (0.091417ms)
✔ topic score bounds inconsistent server counts (0.072917ms)
✔ topic evidence labels reflect repeated independent results and setbacks (0.160334ms)
ℹ tests 39
ℹ suites 0
ℹ pass 39
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 703.048792
> tsc -p tsconfig.json
> tsc -p tsconfig.json
> tsc -b && vite build
vite v8.1.5 building client environment for production...
[2Ktransforming...✓ 330 modules transformed.
rendering chunks...
computing gzip size...
dist/index.html                                         0.81 kB │ gzip:   0.41 kB
dist/assets/KaTeX_Size3-Regular-CTq5MqoE.woff           4.42 kB
dist/assets/KaTeX_Size4-Regular-Dl5lxZxV.woff2          4.92 kB
dist/assets/KaTeX_Size2-Regular-Dy4dx90m.woff2          5.20 kB
dist/assets/KaTeX_Size1-Regular-mCD8mA8B.woff2          5.46 kB
dist/assets/KaTeX_Size4-Regular-BF-4gkZK.woff           5.98 kB
dist/assets/KaTeX_Size2-Regular-oD1tc_U0.woff           6.18 kB
dist/assets/KaTeX_Size1-Regular-C195tn64.woff           6.49 kB
dist/assets/KaTeX_Caligraphic-Regular-Di6jR-x-.woff2    6.90 kB
dist/assets/KaTeX_Caligraphic-Bold-Dq_IR9rO.woff2       6.91 kB
dist/assets/KaTeX_Size3-Regular-DgpXs0kz.ttf            7.58 kB
dist/assets/KaTeX_Caligraphic-Regular-CTRA-rTL.woff     7.65 kB
dist/assets/KaTeX_Caligraphic-Bold-BEiXGLvX.woff        7.71 kB
dist/assets/KaTeX_Script-Regular-D3wIWfF6.woff2         9.64 kB
dist/assets/KaTeX_SansSerif-Regular-DDBCnlJ7.woff2     10.34 kB
dist/assets/KaTeX_Size4-Regular-DWFBv043.ttf           10.36 kB
dist/assets/KaTeX_Script-Regular-D5yQViql.woff         10.58 kB
dist/assets/KaTeX_Fraktur-Regular-CTYiF6lA.woff2       11.31 kB
dist/assets/KaTeX_Fraktur-Bold-CL6g_b3V.woff2          11.34 kB
dist/assets/KaTeX_Size2-Regular-B7gKUWhC.ttf           11.50 kB
dist/assets/KaTeX_SansSerif-Italic-C3H0VqGB.woff2      12.02 kB
dist/assets/KaTeX_SansSerif-Bold-D1sUS0GD.woff2        12.21 kB
dist/assets/KaTeX_Size1-Regular-Dbsnue_I.ttf           12.22 kB
dist/assets/KaTeX_SansSerif-Regular-CS6fqUqJ.woff      12.31 kB
dist/assets/KaTeX_Caligraphic-Regular-wX97UBjC.ttf     12.34 kB
dist/assets/KaTeX_Caligraphic-Bold-ATXxdsX0.ttf        12.36 kB
dist/assets/KaTeX_Fraktur-Regular-Dxdc4cR9.woff        13.20 kB
dist/assets/KaTeX_Fraktur-Bold-BsDP51OF.woff           13.29 kB
dist/assets/KaTeX_Typewriter-Regular-CO6r4hn1.woff2    13.56 kB
dist/assets/KaTeX_SansSerif-Italic-DN2j7dab.woff       14.11 kB
dist/assets/KaTeX_SansSerif-Bold-DbIhKOiC.woff         14.40 kB
dist/assets/KaTeX_Typewriter-Regular-C0xS9mPB.woff     16.02 kB
dist/assets/KaTeX_Math-BoldItalic-CZnvNsCZ.woff2       16.40 kB
dist/assets/KaTeX_Math-Italic-t53AETM-.woff2           16.44 kB
dist/assets/KaTeX_Script-Regular-C5JkGWo-.ttf          16.64 kB
dist/assets/KaTeX_Main-BoldItalic-DxDJ3AOS.woff2       16.78 kB
dist/assets/KaTeX_Main-Italic-NWA7e6Wa.woff2           16.98 kB
dist/assets/KaTeX_Math-BoldItalic-iY-2wyZ7.woff        18.66 kB
dist/assets/KaTeX_Math-Italic-DA0__PXp.woff            18.74 kB
dist/assets/KaTeX_Main-BoldItalic-SpSLRI95.woff        19.41 kB
dist/assets/KaTeX_SansSerif-Regular-BNo7hRIc.ttf       19.43 kB
dist/assets/KaTeX_Fraktur-Regular-CB_wures.ttf         19.57 kB
dist/assets/KaTeX_Fraktur-Bold-BdnERNNW.ttf            19.58 kB
dist/assets/KaTeX_Main-Italic-BMLOBm91.woff            19.67 kB
dist/assets/KaTeX_SansSerif-Italic-YYjJ1zSn.ttf        22.36 kB
dist/assets/KaTeX_SansSerif-Bold-CFMepnvq.ttf          24.50 kB
dist/assets/KaTeX_Main-Bold-Cx986IdX.woff2             25.32 kB
dist/assets/KaTeX_Main-Regular-B22Nviop.woff2          26.27 kB
dist/assets/KaTeX_Typewriter-Regular-D3Ib7_Hf.ttf      27.55 kB
dist/assets/KaTeX_AMS-Regular-BQhdFMY1.woff2           28.07 kB
dist/assets/KaTeX_Main-Bold-Jm3AIy58.woff              29.91 kB
dist/assets/KaTeX_Main-Regular-Dr94JaBh.woff           30.77 kB
dist/assets/KaTeX_Math-BoldItalic-B3XSjfu4.ttf         31.19 kB
dist/assets/KaTeX_Math-Italic-flOr_0UB.ttf             31.30 kB
dist/assets/KaTeX_Main-BoldItalic-DzxPMmG6.ttf         32.96 kB
dist/assets/KaTeX_AMS-Regular-DMm9YOAa.woff            33.51 kB
dist/assets/KaTeX_Main-Italic-3WenGoN9.ttf             33.58 kB
dist/assets/KaTeX_Main-Bold-waoOVXN0.ttf               51.33 kB
dist/assets/KaTeX_Main-Regular-ypZvNtVU.ttf            53.58 kB
dist/assets/KaTeX_AMS-Regular-DRggAlZN.ttf             63.63 kB
dist/assets/study-progress-Ngnvt50Q.css                29.80 kB │ gzip:   7.97 kB
dist/assets/index-AT2UjVZy.css                         98.97 kB │ gzip:  19.68 kB
dist/assets/jsx-runtime-DUAcabCT.js                     1.06 kB │ gzip:   0.60 kB
dist/assets/HomePage-BCfXuw81.js                        5.43 kB │ gzip:   1.70 kB
dist/assets/react-DEX2qfRi.js                           7.52 kB │ gzip:   2.87 kB
dist/assets/InfoPage-DQ63Qrs6.js                        7.66 kB │ gzip:   2.59 kB
dist/assets/KnowledgePage-CCfh1Efc.js                  14.86 kB │ gzip:   4.14 kB
dist/assets/CoursePage-BMri9YJY.js                     51.15 kB │ gzip:  13.36 kB
dist/assets/StudyPage-ChOA8VIg.js                      70.21 kB │ gzip:  18.13 kB
dist/assets/dist-B07zVGNr.js                          100.42 kB │ gzip:  25.82 kB
dist/assets/HandTrackingPage-DRD1FhXO.js              170.34 kB │ gzip:  51.00 kB
dist/assets/index-CDIPQblB.js                         195.42 kB │ gzip:  61.62 kB
dist/assets/study-progress-HYFWFq93.js                397.27 kB │ gzip: 120.25 kB
✓ built in 231ms passed all workspace typechecks, 63 server tests, 39 web tests, and production builds;  passed. |

| 2026-10-10 | Source review drafts | Added per-passage browser autosave for source comments with 7-day expiry, restore on review reopen, clear on save/blank, and inclusion in selected-course learner-data cleanup. Full 
> local-learning-studio@0.1.0 check
> npm run typecheck && npm test && npm run build


> local-learning-studio@0.1.0 typecheck
> npm run typecheck --workspaces --if-present


> @local-learning-studio/contracts@0.1.0 typecheck
> tsc -p tsconfig.json --noEmit


> @local-learning-studio/server@0.1.0 typecheck
> tsc -p tsconfig.json --noEmit


> @local-learning-studio/web@0.1.0 typecheck
> tsc -b --pretty false


> local-learning-studio@0.1.0 pretest
> npm run build --workspace @local-learning-studio/contracts


> @local-learning-studio/contracts@0.1.0 build
> tsc -p tsconfig.json


> local-learning-studio@0.1.0 test
> npm run test --workspaces --if-present


> @local-learning-studio/server@0.1.0 test
> tsx --test test/**/*.test.ts

(node:61436) ExperimentalWarning: SQLite is an experimental feature and might change at any time
(Use `node --trace-warnings ...` to show where the warning was created)
✔ GET /api/health reports the shared API version (334.425292ms)
✔ course library persists a course and its uploaded material (327.0595ms)
✔ PDF extraction preserves page-level provenance (530.687291ms)
✔ PDF math layout reconstructs a stacked numerator over a square-root denominator (0.463584ms)
Warning: Indexing all PDF objects
✔ source reprocessing keeps the previous passages when extraction fails (28.965583ms)
✔ original source route refuses non-PDF materials (20.313084ms)
✔ empty extractable sources fail visibly without losing the upload (17.335ms)
✔ DOCX extraction preserves paragraph provenance and headings (25.333084ms)
✔ PPTX extraction preserves slide provenance (17.920083ms)
✔ invalid Office packages fail visibly without losing the upload (19.942916ms)
✔ legacy passage locators migrate to canonical JSON (12.829834ms)
✔ startup turns interrupted extraction into an explicit failure (13.177625ms)
✔ course creation rejects an empty title (14.099625ms)
✔ unsupported uploads do not create material records (13.390208ms)
(node:61437) ExperimentalWarning: SQLite is an experimental feature and might change at any time
(Use `node --trace-warnings ...` to show where the warning was created)
✔ model router keeps narrow tasks on Luna and synthesis on Terra (3.017166ms)
✔ study generation JSON schema uses only required model-authored fields (5.277042ms)
✔ Codex runner reports local installation and authentication (444.511ms)
✔ Codex runner selects a model and validates structured output (305.252708ms)
✔ Codex runner rejects execution failures and invalid output (368.031625ms)
✔ Codex runner stops a timed-out run explicitly (32.582958ms)
✔ Codex runner serializes model calls (317.16425ms)
✔ GET /api/codex/status exposes setup readiness (85.428208ms)
✔ course-map.v1 accepts internally consistent source-grounded structure (3.29525ms)
✔ course-map.v1 rejects dangling course and source references (1.662375ms)
✔ source-classification.v1 requires unique, internally grounded sources (0.6965ms)
(node:61439) ExperimentalWarning: SQLite is an experimental feature and might change at any time
(Use `node --trace-warnings ...` to show where the warning was created)
✔ study recommendations prefer nearer upcoming assessments when signals tie (8.421917ms)
✔ study generation exposes a safe CLI diagnostic for troubleshooting (336.875834ms)
✔ professor topic-list parser removes common numbering and bullets and deduplicates case-insensitively (3.933792ms)
✔ professor topic-list parser removes common copied scope headings (1.096375ms)
✔ study budget allocates exactly the available minutes and favors weak topics (0.43025ms)
✔ assessment study plan weights saved evidence and reports deadline timing (0.735417ms)
✔ assessment schedule spreads sessions before the deadline and flags over-capacity time (0.779166ms)
✔ category progress counts only the displayed topics and ignores duplicate titles (0.146ms)
✔ study coverage distinguishes lesson sessions from saved knowledge checks (0.688666ms)
✔ homework next-topic recommendation prioritizes review, untouched topics, then stale topics (6.838708ms)
✔ spaced recall uses shorter intervals for uncertain evidence and extends after independent success (0.423833ms)
✔ recommendations surface due spaced recall and show the next date before it is due (1.053041ms)
✔ class recommendation distinguishes lesson-only topics and suggests their first knowledge check (0.078333ms)
✔ recommendations ask for an independent check after assisted-only correct attempts (0.706875ms)
✔ cross-scope recommendations preserve review urgency and instructor priority (0.469875ms)
✔ math text preserves TeX and repairs JSON-decoded control characters inside math (2.207417ms)
✔ math text renders recognizable PDF Dirac notation without changing code or delimited math (2.626875ms)
✔ instructor topic lists persist as class-scoped learner assessment topics (271.814625ms)
✔ adding a topic already in an assessment can link its existing class progress (46.540084ms)
✔ study attempts from a learner exam scope update assessment and topic progress (92.399959ms)
✔ learner-data export includes the full class profile, saved sessions, and responses (86.425958ms)
✔ exam topic study selects a matching class source and marks unmatched topics as general knowledge (77.521959ms)
✔ study methods send distinct learning directions (70.643083ms)
✔ error-analysis refuses generated work without four numbered steps (25.221542ms)
✔ error-analysis refuses adaptive work without four numbered steps (22.125167ms)
✔ compare and contrast uses accepted course-map neighbors in initial and adaptive study (56.21125ms)
✔ free recall saves the learner response as ungraded and keeps the method in history (31.292625ms)
✔ teach-back is a distinct open response that persists independently and exports its reference (31.244666ms)
✔ quiz study, saved answer, method progress, and Obsidian export work together in a disposable class (35.924834ms)
✔ assignment study sessions retrieve only the selected course material and return course-grounded content (35.041709ms)
✔ adaptive questions preserve homework and assessment grounding (25.061166ms)
(node:61440) ExperimentalWarning: SQLite is an experimental feature and might change at any time
(Use `node --trace-warnings ...` to show where the warning was created)
✔ learning artifacts preserve drafts, fingerprints, and accepted history (57.012708ms)
(node:61441) ExperimentalWarning: SQLite is an experimental feature and might change at any time
(Use `node --trace-warnings ...` to show where the warning was created)
✔ course sources flow through cached classification, map review, and acceptance (771.314708ms)
(node:61442) ExperimentalWarning: SQLite is an experimental feature and might change at any time
(Use `node --trace-warnings ...` to show where the warning was created)
✔ Obsidian export creates linked class notes and preserves learner-owned text on refresh (866.44625ms)
✔ Obsidian configuration rejects a non-folder vault path (25.197ms)
✔ Obsidian export refuses a symlinked notes folder without writing outside the vault (17.506625ms)
✔ Obsidian export refuses a class-folder symlink even when it points inside the vault (24.592458ms)
✔ Obsidian source notes link assignments to their accepted topics and assessments (75.517417ms)
ℹ tests 63
ℹ suites 0
ℹ pass 63
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 4423.653583

> @local-learning-studio/web@0.1.0 test
> tsx --test test/**/*.test.ts test/**/*.test.tsx

✔ assignment and exam topic summaries show due and upcoming spaced recall (20.515708ms)
✔ unscored and missed topics are not mislabeled as scheduled spaced recall (0.148666ms)
✔ low scored accuracy starts quiz-first practice from topic actions (0.089458ms)
✔ instructor topic drafts survive navigation in the same tab and remain class-scoped (3.385833ms)
✔ empty instructor topic forms remove their saved draft (0.228834ms)
✔ malformed draft data cannot break the study page (0.184959ms)
✔ scope append preview separates already-listed topics without changing their order (1.58575ms)
✔ appending duplicate topics can still preserve new professor wording (0.105834ms)
✔ first professor wording does not gain an unnecessary append heading (0.058334ms)
✔ retrying the same append does not duplicate professor wording (0.108375ms)
✔ knowledge dashboard keeps mapped, learner-created, and instructor-scope topics distinct (60.031375ms)
✔ knowledge dashboard recommends revisiting incomplete and unsupported checks (2.920791ms)
✔ knowledge dashboard prioritizes a difficult check and explains its suggestion (4.00475ms)
✔ knowledge topic profile shows independent check evidence separately from overall accuracy (2.46525ms)
✔ learner-data cleanup clears only the selected class drafts in every storage (2.310209ms)
✔ learner-data cleanup tolerates blocked storage writes/removals (0.402375ms)
✔ math content repairs damaged TeX and renders with KaTeX (18.542625ms)
✔ inline professor topics and multi-line formulas use KaTeX (18.911292ms)
✔ inline ket-bra products render as a single valid math expression (1.929875ms)
✔ PDF-style reconstructed Dirac fractions render as math (2.928333ms)
✔ Unicode subscript and superscript ket labels render through KaTeX (4.228417ms)
✔ imported Markdown keeps links and images inert while rendering text (1.739291ms)
✔ ungraded methods show unmeasured states instead of zero-percent score bars (6.65175ms)
✔ scored but supported attempts do not imply independent accuracy is zero (0.918458ms)
✔ observed scored and independent results render separate measured bars (0.57375ms)
✔ one or two scored checks are marked as an early signal (0.48825ms)
✔ inconsistent counts cannot render accuracy above 100 percent (2.472584ms)
✔ source comment summary counts annotated passages separately from comments and stale notes (2.8455ms)
✔ source comment drafts restore for the same course, source, and passage (0.881208ms)
✔ expired source comment drafts are removed from every storage (0.095541ms)
✔ blanking and saving a source comment clear its browser draft (0.09475ms)
✔ comment drafts remain usable when browser storage is blocked (0.156208ms)
✔ knowledge-check drafts resume across browser restarts and stay course scoped (2.581708ms)
✔ expired knowledge-check drafts are removed from every available storage (0.134625ms)
✔ draft restoration bounds the selected answer, hint count, and response size (0.394458ms)
✔ malformed or non-object saved drafts are ignored without breaking study (0.220334ms)
✔ saving an attempt clears its local and session draft copies (0.233709ms)
✔ due-review topic links preserve homework scope and open quiz-first practice (0.952417ms)
✔ unsupported method query values cannot choose a generated study method (0.075459ms)
✔ topic score uses scored checks and keeps ungraded attempts separate (1.477375ms)
✔ topic score is unmeasured until a scored check exists (0.105791ms)
✔ topic score bounds inconsistent server counts (0.273375ms)
✔ topic evidence labels reflect repeated independent results and setbacks (0.238541ms)
ℹ tests 43
ℹ suites 0
ℹ pass 43
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 695.411375

> local-learning-studio@0.1.0 build
> npm run build --workspace @local-learning-studio/contracts && npm run build --workspace @local-learning-studio/server && npm run build --workspace @local-learning-studio/web


> @local-learning-studio/contracts@0.1.0 build
> tsc -p tsconfig.json


> @local-learning-studio/server@0.1.0 build
> tsc -p tsconfig.json


> @local-learning-studio/web@0.1.0 build
> tsc -b && vite build

vite v8.1.5 building client environment for production...
[2Ktransforming...✓ 331 modules transformed.
rendering chunks...
computing gzip size...
dist/index.html                                         0.81 kB │ gzip:   0.41 kB
dist/assets/KaTeX_Size3-Regular-CTq5MqoE.woff           4.42 kB
dist/assets/KaTeX_Size4-Regular-Dl5lxZxV.woff2          4.92 kB
dist/assets/KaTeX_Size2-Regular-Dy4dx90m.woff2          5.20 kB
dist/assets/KaTeX_Size1-Regular-mCD8mA8B.woff2          5.46 kB
dist/assets/KaTeX_Size4-Regular-BF-4gkZK.woff           5.98 kB
dist/assets/KaTeX_Size2-Regular-oD1tc_U0.woff           6.18 kB
dist/assets/KaTeX_Size1-Regular-C195tn64.woff           6.49 kB
dist/assets/KaTeX_Caligraphic-Regular-Di6jR-x-.woff2    6.90 kB
dist/assets/KaTeX_Caligraphic-Bold-Dq_IR9rO.woff2       6.91 kB
dist/assets/KaTeX_Size3-Regular-DgpXs0kz.ttf            7.58 kB
dist/assets/KaTeX_Caligraphic-Regular-CTRA-rTL.woff     7.65 kB
dist/assets/KaTeX_Caligraphic-Bold-BEiXGLvX.woff        7.71 kB
dist/assets/KaTeX_Script-Regular-D3wIWfF6.woff2         9.64 kB
dist/assets/KaTeX_SansSerif-Regular-DDBCnlJ7.woff2     10.34 kB
dist/assets/KaTeX_Size4-Regular-DWFBv043.ttf           10.36 kB
dist/assets/KaTeX_Script-Regular-D5yQViql.woff         10.58 kB
dist/assets/KaTeX_Fraktur-Regular-CTYiF6lA.woff2       11.31 kB
dist/assets/KaTeX_Fraktur-Bold-CL6g_b3V.woff2          11.34 kB
dist/assets/KaTeX_Size2-Regular-B7gKUWhC.ttf           11.50 kB
dist/assets/KaTeX_SansSerif-Italic-C3H0VqGB.woff2      12.02 kB
dist/assets/KaTeX_SansSerif-Bold-D1sUS0GD.woff2        12.21 kB
dist/assets/KaTeX_Size1-Regular-Dbsnue_I.ttf           12.22 kB
dist/assets/KaTeX_SansSerif-Regular-CS6fqUqJ.woff      12.31 kB
dist/assets/KaTeX_Caligraphic-Regular-wX97UBjC.ttf     12.34 kB
dist/assets/KaTeX_Caligraphic-Bold-ATXxdsX0.ttf        12.36 kB
dist/assets/KaTeX_Fraktur-Regular-Dxdc4cR9.woff        13.20 kB
dist/assets/KaTeX_Fraktur-Bold-BsDP51OF.woff           13.29 kB
dist/assets/KaTeX_Typewriter-Regular-CO6r4hn1.woff2    13.56 kB
dist/assets/KaTeX_SansSerif-Italic-DN2j7dab.woff       14.11 kB
dist/assets/KaTeX_SansSerif-Bold-DbIhKOiC.woff         14.40 kB
dist/assets/KaTeX_Typewriter-Regular-C0xS9mPB.woff     16.02 kB
dist/assets/KaTeX_Math-BoldItalic-CZnvNsCZ.woff2       16.40 kB
dist/assets/KaTeX_Math-Italic-t53AETM-.woff2           16.44 kB
dist/assets/KaTeX_Script-Regular-C5JkGWo-.ttf          16.64 kB
dist/assets/KaTeX_Main-BoldItalic-DxDJ3AOS.woff2       16.78 kB
dist/assets/KaTeX_Main-Italic-NWA7e6Wa.woff2           16.98 kB
dist/assets/KaTeX_Math-BoldItalic-iY-2wyZ7.woff        18.66 kB
dist/assets/KaTeX_Math-Italic-DA0__PXp.woff            18.74 kB
dist/assets/KaTeX_Main-BoldItalic-SpSLRI95.woff        19.41 kB
dist/assets/KaTeX_SansSerif-Regular-BNo7hRIc.ttf       19.43 kB
dist/assets/KaTeX_Fraktur-Regular-CB_wures.ttf         19.57 kB
dist/assets/KaTeX_Fraktur-Bold-BdnERNNW.ttf            19.58 kB
dist/assets/KaTeX_Main-Italic-BMLOBm91.woff            19.67 kB
dist/assets/KaTeX_SansSerif-Italic-YYjJ1zSn.ttf        22.36 kB
dist/assets/KaTeX_SansSerif-Bold-CFMepnvq.ttf          24.50 kB
dist/assets/KaTeX_Main-Bold-Cx986IdX.woff2             25.32 kB
dist/assets/KaTeX_Main-Regular-B22Nviop.woff2          26.27 kB
dist/assets/KaTeX_Typewriter-Regular-D3Ib7_Hf.ttf      27.55 kB
dist/assets/KaTeX_AMS-Regular-BQhdFMY1.woff2           28.07 kB
dist/assets/KaTeX_Main-Bold-Jm3AIy58.woff              29.91 kB
dist/assets/KaTeX_Main-Regular-Dr94JaBh.woff           30.77 kB
dist/assets/KaTeX_Math-BoldItalic-B3XSjfu4.ttf         31.19 kB
dist/assets/KaTeX_Math-Italic-flOr_0UB.ttf             31.30 kB
dist/assets/KaTeX_Main-BoldItalic-DzxPMmG6.ttf         32.96 kB
dist/assets/KaTeX_AMS-Regular-DMm9YOAa.woff            33.51 kB
dist/assets/KaTeX_Main-Italic-3WenGoN9.ttf             33.58 kB
dist/assets/KaTeX_Main-Bold-waoOVXN0.ttf               51.33 kB
dist/assets/KaTeX_Main-Regular-ypZvNtVU.ttf            53.58 kB
dist/assets/KaTeX_AMS-Regular-DRggAlZN.ttf             63.63 kB
dist/assets/study-progress-Ngnvt50Q.css                29.80 kB │ gzip:   7.97 kB
dist/assets/index-AT2UjVZy.css                         98.97 kB │ gzip:  19.68 kB
dist/assets/jsx-runtime-DUAcabCT.js                     1.06 kB │ gzip:   0.60 kB
dist/assets/HomePage-BCfXuw81.js                        5.43 kB │ gzip:   1.70 kB
dist/assets/react-DEX2qfRi.js                           7.52 kB │ gzip:   2.87 kB
dist/assets/InfoPage-DQ63Qrs6.js                        7.66 kB │ gzip:   2.59 kB
dist/assets/KnowledgePage-CCfh1Efc.js                  14.86 kB │ gzip:   4.14 kB
dist/assets/CoursePage-pKPvlRhe.js                     52.35 kB │ gzip:  13.79 kB
dist/assets/StudyPage-D3_589Ln.js                      70.21 kB │ gzip:  18.13 kB
dist/assets/dist-B07zVGNr.js                          100.42 kB │ gzip:  25.82 kB
dist/assets/HandTrackingPage-DExf12Q0.js              170.34 kB │ gzip:  51.00 kB
dist/assets/index-DfgPefKF.js                         195.42 kB │ gzip:  61.61 kB
dist/assets/study-progress-HYFWFq93.js                397.27 kB │ gzip: 120.25 kB

✓ built in 409ms passed. |

| 2026-10-10 | Obsidian managed-note identity repair | Export refreshes managed frontmatter IDs to migrate old formats while preserving learner text. Regression covers stale Topic Progress IDs. Browser draft restore passed. Live vault export updated 39 notes; validation found zero issues across 39 notes and 393 links; Obsidian reports zero unresolved links. Full project checks passed. |
| 2026-10-10 | Map progress independence cue | Shared topic progress descriptions now show independent checks alongside overall scored correctness, keeping assisted success from reading as solo recall. Regression tests cover supported-only, mixed, and legacy signals. All 44 web tests passed; web typecheck, production build, and `git diff --check` passed. |
| 2026-10-10 | Course-map prompt reduction | The model now returns only stable structure and unique passage aliases; the server attaches exact course/material IDs and resolves passage IDs, preventing generated UUID mismatches. The map skill no longer requires rereading repository docs/contracts. Regression confirms aliases, exact server-attached IDs, prompt omission of UUIDs, and rejection of unknown aliases. Full `npm run check` and `git diff --check` passed. No live model call was made, so runtime token savings remain unmeasured. |
| 2026-10-10 | Disposable course-map usage check | Temporary isolated course generated a valid 3-concept/2-module draft. Classification: 2,290 prompt characters, 20,273 input / 453 output tokens; map: 2,356 prompt characters, 20,239 input / 604 output tokens; both uncached. Temporary server, course database, upload, and course files were removed. This confirms material/model calls include a sizable Codex context beyond supplied prompt text; the real course-specific contribution remains unmeasured. |
