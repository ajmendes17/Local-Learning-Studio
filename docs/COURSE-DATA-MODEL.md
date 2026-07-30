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

The workflow will be:

1. Store the syllabus as an immutable material record.
2. Extract text with page or heading provenance.
3. Ask Codex for a proposed class structure against a versioned schema.
4. Show the proposal for review.
5. Commit accepted modules and assessments in one database transaction.
6. Retain the source material ID and generation record for traceability.

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

## Future tables

The following should be added only with their consuming feature:

- `source_passages`: extracted text with page or heading coordinates and hashes
- `concepts` and `concept_prerequisites`: the course knowledge graph
- `module_concepts` and `module_materials`: many-to-many organization
- `generation_runs`: model, prompt/schema versions, inputs, and result status
- `learning_artifacts`: stored plans, lessons, practice, and assessments
- `attempts`: answers, confidence, hints, and feedback
- `mastery_evidence`: append-only evidence rather than a single opaque score
- `review_schedule`: explainable next-review decisions

## Integrity rules

- All child records use foreign keys and course-scoped queries.
- Raw material is immutable after upload; replacement creates a new record.
- Generated structure is reviewed before it becomes current course structure.
- A failed file write never creates a successful material record.
- A failed database write removes the just-written file.
- Course list counts are derived from child tables, not separately maintained.
- Deleting a course must remove both database children and its course directory.
- Model-generated facts never become source passages.

## API boundary

The first library API supports:

| Method | Route | Purpose |
|---|---|---|
| `GET` | `/api/courses` | List course cards and derived counts |
| `POST` | `/api/courses` | Create one course |
| `GET` | `/api/courses/:courseId` | Load a course workspace |
| `POST` | `/api/courses/:courseId/materials?kind=...` | Store one course file |

Module editing, assessment editing, deletion, extraction, and syllabus analysis
remain explicit follow-up capabilities.

