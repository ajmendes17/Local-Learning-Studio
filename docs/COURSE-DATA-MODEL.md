# Course Library Data Model

## Design decision

A **course** is the top-level ownership boundary. Every syllabus, reading,
module, assessment, concept, generated artifact, and learner record belongs to
exactly one course.

This matches how students think about their work while preventing accidental
retrieval across classes. It also makes a course independently exportable,
deletable, and rebuildable.

## Core hierarchy

```text
Course
├── Materials
│   ├── Syllabus
│   ├── Lecture notes
│   ├── Readings
│   ├── Assignments
│   └── Study guides
├── Modules
│   ├── Concepts
│   ├── Materials
│   └── Activities
├── Assessments
│   ├── Major exams
│   ├── Quizzes
│   ├── Papers
│   └── Projects
└── Learner state
    ├── Saved study sessions
    ├── Attempts
    ├── Mastery evidence
    └── Review schedule
```

Modules and assessments are peers under a course. An assessment may optionally
refer to a module, but a cumulative final or term project does not need to be
forced into one module.

## Syllabus-derived structure

Uploading a syllabus does not create a separate representation. A future
syllabus analysis run proposes normal `modules` and `assessments` with
`origin = syllabus`.

The implemented review workflow is:

1. Store the syllabus as an immutable material record.
2. Extract text with page or heading provenance.
3. Classify the current source fingerprint with the explicit classification
   skill, then ask Codex for a proposed class structure against a versioned
   schema.
4. Show the proposal for review.
5. Commit accepted modules and assessments in one database transaction.
6. Retain the source references, fingerprint, skill, and model record for
   traceability.

Manual and syllabus-generated records therefore use the same application and
database paths. Users can edit the structure without breaking downstream
features.

## SQLite tables

### `courses`

Stores identity and presentation metadata:

- `id`: UUID primary key
- `title`: required human-readable class name
- `code`: optional catalog code
- `term`: optional semester or date range
- `accent`: constrained presentation token, not arbitrary CSS
- `created_at`, `updated_at`: ISO timestamps

### `materials`

Stores one record per uploaded file:

- `id`: UUID primary key
- `course_id`: required foreign key with cascade deletion
- `original_name`: filename shown to the user
- `stored_name`: collision-safe local filename
- `media_type`, `size_bytes`: upload metadata
- `kind`: syllabus, lecture notes, reading, assignment, study guide, or other
- `status`: stored, processing, ready, or failed
- `error_message`: explicit processing failure detail
- `created_at`: ISO timestamp

Raw files live at:

```text
courses/<course-id>/materials/<material-id>--<safe-original-name>
```

The database stores relative names only. It never accepts an absolute upload
path from the browser.

### `source_passages`

Stores extracted source evidence:

- `id`, `course_id`, `material_id`
- `ordinal`: stable order within one material
- `content`, `content_hash`: normalized text and its SHA-256 hash
- `location_json`: a validated versioned locator containing page, line,
  paragraph, or slide coordinates and optional heading/title context
- `created_at`: extraction timestamp

Passages cascade with their course or material. The application validates the
locator against the shared discriminated-union contract before persistence and
again when reading it. JSON storage lets later OCR add region provenance
without rebuilding the table for every new locator shape.

### `modules`

Stores ordered instructional units:

- `id`, `course_id`
- `title`, optional `description`
- `position`: stable course-local ordering
- `origin`: manual or syllabus

### `assessments`

Stores high-value evaluation events independently from modules:

- `id`, `course_id`
- optional `module_id`
- `title`
- `kind`: major exam, quiz, paper, project, or other
- optional `due_at` and `weight_percent`
- `origin`: manual or syllabus

### `concepts` and `concept_prerequisites`

`concepts` stores course-local knowledge units with a title, description, and
manual or syllabus origin. `concept_prerequisites` stores directed edges
between two concepts in the same course. The runtime contract exists now so a
future accepted `course-map.v1` proposal can be persisted without inventing a
second representation. `concept_learning_objectives` preserves ordered
objectives and `module_concepts` preserves ordered module membership when an
accepted map is applied.

### `learning_artifacts`

Stores reviewable, versioned model output without mixing it into source
evidence or accepted course structure:

- `id`, `course_id`, `kind`, and `schema_version`
- `status`: draft, accepted, or superseded
- `source_fingerprint`: SHA-256 cache key for the exact source projection
- `skill_name` and `model`: execution provenance
- `payload_json`: contract-validated classification or course-map proposal
- `created_at` and optional `accepted_at`

Saving a replacement supersedes only the older draft. An accepted artifact
remains available until another reviewed artifact replaces it.

## Future tables

### Class-scoped learner records (implemented)

Each record belongs to one class. This isolation means a learner can reuse a
topic name in another class without sharing its mastery history. A study space
can start with only an assessment date and topic list; uploaded materials are
optional.

The Study page accepts instructor topic lists pasted as numbered, bulleted,
checkbox, comma-separated, or one-topic-per-line text. It removes list markers,
normalizes whitespace, and drops case-only duplicates while keeping the first
wording. These remain learner-provided scope; they do not become source-verified
course-map claims.

The migration adds nullable `course_id` columns so existing database files
open without destructive rewrites. New API writes require a valid class ID.
Legacy unassigned rows are excluded from class profiles until explicitly
assigned or exported.

- `learner_assessments`: class ID, assessment ID, title, kind, scheduled time, available
  study minutes, and creation/update timestamps.
- `learner_topics`: class, assessment, and topic IDs, optional linked concept ID, title,
  order, importance, and provenance (`learner`, `model`, or `material`).
- `learner_concepts`: class ID, stable class-local concept ID/key, title, description, and timestamps.
- `study_attempts`: class and attempt/concept IDs, optional assessment ID, activity kind,
  prompt, response, reasoning, pre-answer confidence, revealed hint count, learning method,
  outcome, source material/passage references, and timestamp. Source references preserve
  which imported assignment or reading supported a saved answer, allowing source-specific
  progress without replacing the class-wide concept history.
- `study_sessions`: class ID, stable concept ID, requested topic and method, validated generated lesson, question, progressive hints, and timestamp. Saved sessions reopen without a model run. A newly generated question is stored as its own session artifact.
- `mastery_evidence`: class and evidence/attempt/concept IDs, evidence kind, outcome,
  independence (`independent`, `hinted`, `assisted`, or `unknown`), rationale,
  and timestamp. Evidence is appended with its attempt and is not overwritten.

The profile API is class-scoped and projects attempt counts, correct counts, latest
outcome, and last-practiced time per concept, assessment topic, and cited source. Source
topic totals include only concepts with attempts that cite that source; the accepted course
map supplies the denominator for homework topic coverage. These are transparent summaries,
not a calibrated mastery score. Evidence aggregation and promotion thresholds remain
follow-up work.

The following should be added only with their consuming feature:

- `module_concepts` and `module_materials`: many-to-many organization
- `generation_runs`: model, prompt/schema versions, inputs, and result status
- additional `learning_artifacts` kinds for plans, lessons, practice, and
  assessments
- `questions` and `answer_keys`: versioned prompts, grading modes, rubrics,
  deterministic keys, explanations, and source references
- `review_schedule`: explainable next-review decisions

### Learner pattern reviews

The versioned `learner-pattern-review.v1` contract and
`learner-pattern-review.v1` and `review-learning-patterns` are implemented.
Reviews are class-scoped and invoked only at session end or on an explicit
learner request. No continuous, per-answer, timed, or background processing is
used. The `learner_pattern_reviews` table records each result, trigger, model,
and timestamp. The `learner_patterns` projection exposes the current result and
learner status override. Attempts optionally link to their study session so an
end-of-session review can select exact evidence. Every proposal links
supporting and counterexample attempts and retains status rationale; learners
can correct status or dismiss a pattern.

## Integrity rules

- All child records use foreign keys and course-scoped queries.
- Raw material is immutable after upload; replacement creates a new record.
- Generated structure is reviewed before it becomes current course structure.
- A failed file write never creates a successful material record.
- A failed database write removes the just-written file.
- Course list counts are derived from child tables, not separately maintained.
- Deleting a course must remove both database children and its course directory.
- Model-generated facts never become source passages.
- Every model-backed run records its requested model and actual model metadata.
- Deterministic grading never invokes Codex and always references a validated,
  versioned answer key.

## API boundary

The first library API supports:

| Method | Route | Purpose |
|---|---|---|
| `GET` | `/api/courses` | List course cards and derived counts |
| `POST` | `/api/courses` | Create one course |
| `GET` | `/api/courses/:courseId` | Load a course workspace |
| `POST` | `/api/courses/:courseId/materials?kind=...` | Store one course file |
| `GET` | `/api/courses/:courseId/materials/:materialId/passages` | Read course-scoped extracted passages |
| `GET` | `/api/courses/:courseId/learning-artifacts` | Reopen current generated review artifacts |
| `POST` | `/api/courses/:courseId/source-classification` | Generate or reuse semantic source classification |
| `POST` | `/api/courses/:courseId/course-map` | Generate or reuse a course-map draft |
| `POST` | `/api/courses/:courseId/course-map/:artifactId/accept` | Apply a current draft atomically |
| `GET` | `/api/courses/:courseId/learner/profile` | Read this class's assessments and concept evidence summaries |
| `GET` | `/api/courses/:courseId/learner/patterns` | Read this class's current pattern projection and review history |
| `PATCH` | `/api/courses/:courseId/learner/patterns/:patternId` | Correct a pattern status or dismiss it |
| `POST` | `/api/courses/:courseId/learner/pattern-reviews` | Run a bounded class-local review at session end or on request |
| `POST` | `/api/courses/:courseId/learner/assessments` | Create an assessment and ordered topic scope in this class |
| `POST` | `/api/courses/:courseId/learner/concepts` | Create a stable class-local concept |
| `POST` | `/api/courses/:courseId/learner/attempts` | Append a same-class study attempt and evidence record atomically |
| `POST` | `/api/courses/:courseId/learner/study-session` | Generate and persist a lesson and knowledge check with this class's context |
| `GET` | `/api/courses/:courseId/learner/study-sessions` | List recent saved lessons and their aggregate attempt signals |
| `GET` | `/api/courses/:courseId/learner/study-sessions/:sessionId` | Reopen a saved lesson scoped to this class |
| `POST` | `/api/courses/:courseId/learner/study-sessions/:sessionId/next-question` | Generate and save a new question using up to five recent attempts for the same class-local concept |
| `POST` | `/api/courses/:courseId/learner/clarify` | Ask a clarification question within this class |
| `GET` | `/api/obsidian/status` | Read local Markdown-export configuration |
| `POST` | `/api/obsidian/config` | Save an existing vault folder and an in-vault notes folder |
| `POST` | `/api/courses/:courseId/obsidian/export` | Export the accepted map, course assessments, learner topic scopes, and practice counts |

Manual module editing, assessment editing, deletion, and OCR remain explicit
follow-up capabilities.

Obsidian export is configured from the class page with an absolute vault path
and an in-vault folder (default `Codex/Local Learning Studio`). Each class gets
a stable `<course-slug>--<course-id-prefix>/` folder containing `Course.md`,
`modules/`, `topics/`, and `assessments/` notes. Notes link to one another using
vault-relative wikilinks. Topic notes include practice counts; assessment notes
include accepted-map evidence or learner-provided exam scope. Source files are
listed by name and remain in the app's course storage.

Every exported note has a generated section bounded by
`<!-- LLS:GENERATED:START -->` and `<!-- LLS:GENERATED:END -->`. Re-export
replaces only that section and preserves text outside it, including the
`My notes` area. Incomplete or duplicate markers stop the export rather than
overwriting the note. This is a one-way export; edits made inside Obsidian do
not update the app, and Obsidian Sync remains independently managed by Obsidian.
