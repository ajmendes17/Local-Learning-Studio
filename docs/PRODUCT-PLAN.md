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

The initial product is optimized for its owner. Each class has its own
knowledge base: concepts, assessments, attempts, evidence, and learning-method
observations are scoped to one class and do not silently merge with similarly
named concepts in another class. Obsidian is the intended editable, inspectable
companion, with one folder per class under a configured vault root. The app
remains responsible for structured evidence and learning workflows. Sync must
preserve local data ownership, expose provenance and uncertainty, and never
turn a generated note or a single answer into a mastery claim. Vault setup,
sync direction, and conflict behavior remain implementation work.

## Settled architecture

- Use a React and TypeScript browser UI with a local Node service.
- Keep SQLite, uploaded sources, normalized evidence, learner records, and
  generated artifacts local.
- Invoke Codex through `codex exec` from the repository root.
- Check narrow workflows into `.agents/skills` so a clone discovers them
  without global skill copies.
- Validate every model response against a versioned JSON schema before
  persistence.
- Fail explicitly when Codex, a source extractor, a requested model, or a
  structured response is unavailable.
- Consider Tauri packaging only after the localhost workflow is accepted.
- Invoke model-backed GUI actions through narrow skills; keep deterministic
  application work out of skills.
- Build one learner profile per class, with evidence-backed concept states and
  learning-method outcomes kept separate between classes.
- Treat Obsidian as a human-readable, user-editable companion, with a separate
  class folder, stable class-local links, and explicit sync/conflict rules.

## Personal repository boundary

The repository contains the application, skill, schemas, migrations, and empty
directory markers. Each clone owns its personal data:

- `courses/` contains immutable uploaded materials and normalized evidence.
- `data/` contains SQLite databases and other derived learner state.
- `.env` contains machine-local configuration.
- An Obsidian vault is user-owned; integration must use a configured vault and
  must not assume the vault is inside this repository. Each class gets its own
  subfolder; class notes and learner state remain separate by default.

These locations remain ignored by Git except for committed `.gitkeep` files.
The application must never require a user's course files, attempts, or learning
profile to be committed. A future export is an explicit user action and must
not change this default.

## Canonical source intake

Course materials are optional context, not a prerequisite for learning
support. The learner can start with a goal such as preparing for an exam, enter
the exam time and topics (or paste an instructor-provided topic outline), and
ask for a plan. Use model knowledge to propose a topic breakdown or explain a
topic when materials are absent. Clearly distinguish learner-provided scope,
model-suggested topics, and claims grounded in uploaded materials; never imply
that generated coverage is verified against an instructor's exam without a
source. Materials can be added later to refine explanations and evidence.

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

An exam or quiz is a planning anchor with a scheduled time and an editable set
of topics linked to the learner's knowledge graph. The plan budget is derived
from time remaining, available study time, topic importance/scope, prerequisites,
and current evidence/uncertainty. It should distribute attention across the
full requested scope, prioritize high-risk gaps proportionally, reserve time
for mixed review and breaks where appropriate, and explain its allocation.
The learner can change the schedule, topics, priorities, and available time;
replanning preserves prior versions and explains the difference. The system
must make a useful first plan without requiring uploads, while labeling
unverified topic assumptions for learner review.

Every plan revision must:

- preserve the prior version;
- identify the evidence that triggered the change;
- explain the changed priority or activity;
- avoid fixed learning-style labels;
- allow a user override without deleting history.

Each class learner profile should aggregate evidence for that class without
collapsing it into an unexplained score or merging state across classes. Each
concept view should distinguish
demonstrated knowledge, uncertainty, and unassessed gaps, and link back to
source material and attempts. Learning-method observations (for example,
worked examples or retrieval practice) should record the context and outcomes
that support them, alongside the learner's own assessment of usefulness. These
are provisional, revisable preferences, not fixed learning-style labels.

Obsidian sync should present each class profile as a navigable knowledge tree
inside that class's own folder, with stable class-local note identities and
backlinks among concepts, course materials, evidence, assessments and their
topic lists, and learning-method observations. Define ownership for generated sections versus
user-authored content, and handle edits, renames, deletions, and conflicts
without silently discarding either side. Keep the app database as the source of
structured learning evidence; Obsidian is an editable companion and an
explicit source of learner-authored reflections where supported. The proposed
folder shape is `<configured-vault>/Local Learning Studio/<course-id>--<slug>/`;
there is no shared cross-class concept folder by default.

## Distribution path

For the personal and downloadable modes, each user:

1. installs and authenticates Codex;
2. clones the repository;
3. installs application dependencies;
4. launches the local service and GUI;
5. optionally imports personal course materials, or starts with an exam/quiz
   date and topics;
6. consumes their own Codex allowance.

A plugin or packaged desktop installer may improve distribution later, but it
must preserve repo-local data ownership and explicit model routing.

The implemented skill inventory and migration away from the broad initial
skill are defined in `SKILL-ARCHITECTURE.md`.

## Definition of the personal MVP

The personal MVP is accepted when a macOS user can open a class-specific study
space, create an exam or quiz with a scheduled time and topics without first
importing materials, review and adjust a time-budgeted plan connected only to
that class's persistent knowledge profile,
optionally add sources for stronger grounding, complete lessons and mixed
practice with confidence-aware feedback, see knowledge and learning-method
evidence update and the plan adapt with an explanation, then quit, reopen, and
continue without losing records or exposing personal data to Git. Obsidian
provides a separate inspectable class folder for the knowledge profile,
assessments, topics, and learner-authored reflections.


## Default study loop decision

The default class Study flow starts from a learner-named topic without requiring
materials or a time budget. It saves each generated lesson and knowledge check
inside that class, appends every checked response to class-local evidence, and
lets the learner reopen recent lessons. The interface shows answer counts and
latest outcomes as evidence signals, not mastery claims.

Course materials remain optional for this everyday flow. A later source-grounded
practice-exam mode can explicitly select uploaded materials to generate and
validate exam-specific coverage.
