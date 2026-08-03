# Product Plan

Last updated: 2026-08-03

This document is the durable product and implementation contract for Local
Learning Studio. `PROGRESS.md` records delivery status and verification; the
specialized documents in this directory define detailed subsystem contracts.

## Product goal

Build a macOS-first, local desktop-style web application that turns a user's
course material into source-grounded training plans, lessons, practice,
quizzes, feedback, and adaptive review. The local application invokes the
user's authenticated Codex installation automatically, so the default personal
mode consumes that user's Codex allowance instead of requiring a separate API
key.

Windows support, hosted operation, multi-user accounts, audio/video
transcription, and distraction controls are deferred until the personal macOS
workflow is accepted.

## Settled architecture

- Use a React and TypeScript browser UI with a local Node service.
- Keep SQLite, uploaded sources, normalized evidence, learner records, and
  generated artifacts local.
- Invoke Codex through `codex exec` from the repository root.
- Check the reusable `learning-coach` workflow into
  `.agents/skills/learning-coach` so a clone discovers it without a global
  skill copy.
- Validate every model response against a versioned JSON schema before
  persistence.
- Fail explicitly when Codex, a source extractor, a requested model, or a
  structured response is unavailable.
- Consider Tauri packaging only after the localhost workflow is accepted.
- Split model-backed GUI actions into narrow skills after the Codex runner is
  available; keep deterministic application work out of skills.

## Personal repository boundary

The repository contains the application, skill, schemas, migrations, and empty
directory markers. Each clone owns its personal data:

- `courses/` contains immutable uploaded materials and normalized evidence.
- `data/` contains SQLite databases and other derived learner state.
- `.env` contains machine-local configuration.

These locations remain ignored by Git except for committed `.gitkeep` files.
The application must never require a user's course files, attempts, or learning
profile to be committed. A future export is an explicit user action and must
not change this default.

## Canonical source intake

Preserve each original upload, then convert supported formats into one
canonical, provenance-preserving block model. A block records its source,
location, type, normalized content, content hash, extraction method, and
confidence when applicable.

Target adapters include:

- PDF, Markdown, and plain text;
- Word and PowerPoint;
- common image formats through explicit OCR;
- structured tables where their source format can be represented faithfully.

Audio and video transcription are not part of the first MVP. Unknown or
unextractable files must remain explicit rather than appearing successfully
processed.

Perform deterministic extraction, hashing, deduplication, chunking, and local
search before using Codex. Use Codex only for semantic interpretation such as
diagram explanation, ambiguous extraction review, course mapping, instruction,
assessment generation, and free-response analysis.

## Rate-limit strategy

- Process only new or changed files, identified by content hashes.
- Cache generated artifacts by source hashes, contract version, skill version,
  task type, and model configuration.
- Retrieve the smallest relevant source block set for each run.
- Persist plans, lessons, question banks, solutions, and feedback instead of
  regenerating them when reopened.
- Store compact structured learner evidence rather than replaying an unbounded
  transcript.
- Grade deterministic question types locally.
- Route model-backed tasks to the least expensive model that passes evaluation.
- Keep model names configurable because account availability and model catalogs
  can change.

## Assessment and model routing

The skill describes learning behavior and structured outputs. It does not
select its own runtime model. The local service selects a model for each
`codex exec --model <model>` call.

Initial routing policy:

| Task | Default execution |
|---|---|
| Multiple choice and true/false grading | Deterministic local answer-key check |
| Exact numeric, normalized text, and bounded matching | Deterministic local grader where the contract permits it |
| Short-response grading and misconception extraction | GPT-5.6 Luna |
| Routine explanations or feedback | GPT-5.6 Luna, subject to evaluation |
| Quiz and practice-set creation | GPT-5.6 Terra |
| Course-map and training-plan analysis | GPT-5.6 Terra |
| Difficult synthesis, escalation, or quality audit | GPT-5.6 Sol |

Terra should be the normal high-quality authoring model. Sol is an explicit
escalation rather than the default. Model availability must be checked at
runtime, and an unavailable configured model must produce a visible error
instead of silently changing quality or cost.

Generated objective questions include a validated answer key and explanation.
The GUI grades selections without a model call, records the attempt, and shows
the stored explanation at the configured feedback point. Free responses use a
compact rubric, relevant source blocks, and the learner response rather than
the entire course or history.

## Adaptive training plan

Quiz attempts append learner evidence. Deterministic projections update
concept-level performance and review timing. Codex interprets misconceptions
and revises only affected portions of the training plan.

Every plan revision must:

- preserve the prior version;
- identify the evidence that triggered the change;
- explain the changed priority or activity;
- avoid fixed learning-style labels;
- allow a user override without deleting history.

## Distribution path

For the personal and downloadable modes, each user:

1. installs and authenticates Codex;
2. clones the repository;
3. installs application dependencies;
4. launches the local service and GUI;
5. imports personal course materials;
6. consumes their own Codex allowance.

A plugin or packaged desktop installer may improve distribution later, but it
must preserve repo-local data ownership and explicit model routing.

The proposed skill inventory and migration away from the broad initial skill
are defined in `SKILL-ARCHITECTURE.md`.

## Definition of the personal MVP

The personal MVP is accepted when a macOS user can import supported course
materials, review a source-grounded course map and training plan, complete a
lesson and mixed-format quiz, receive deterministic and model-backed feedback,
observe an explained plan revision, quit, reopen, and continue without
regenerating valid artifacts or exposing personal data to Git.
