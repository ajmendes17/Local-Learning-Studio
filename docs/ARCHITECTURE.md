# Architecture

## System boundary

Local Learning Studio is a local web application. The browser UI talks only to
the local service. The service owns filesystem access, persistence, document
processing, and future Codex execution.

```text
Browser UI
    |
    | /api over localhost
    v
Local service ---- shared contracts
    |
    +---- course source files
    +---- SQLite learner state
    +---- generated artifacts
    `---- locally authenticated Codex
```

## Components

### `apps/web`

Owns presentation and user interaction. It must not read course files,
databases, Codex credentials, or process state directly. The course workspace
shows the deterministic Import → Classify → Review map state, disables model
actions when local Codex is unavailable, and requires explicit acceptance
before a draft becomes active structure.

### `apps/server`

Owns trusted local operations and exposes a narrow API. Its modular extraction
layer converts supported immutable uploads into course-scoped source passages.
Future model calls must be initiated here, validated against versioned
contracts, and persisted only after successful validation.

### `packages/contracts`

Owns data exchanged across boundaries. Zod runtime schemas validate courses,
materials, source locations, concepts, modules, assessments, and the
`course-map.v1` proposal before they cross a boundary.

### `.agents/skills`

Defines nine narrow learning workflows and source-grounding rules for Codex.
They disable implicit invocation so the local service can select the exact
workflow for each GUI action. Application code remains responsible for
authorization, validation, persistence, and error handling.

### Model execution and routing

The skill does not choose a runtime model. The local service owns a typed,
configuration-driven task router and invokes `codex exec --ephemeral` with a
task model, read-only sandbox, repository working root, output schema, and
final-message file. Calls are serialized to protect the user's allowance. The
runner validates the final JSON again with the shared Zod contract and never
silently substitutes another model.

Only action-specific services may call the runner. The HTTP API does not expose
an arbitrary-prompt endpoint.

## Storage

- `courses/` contains user-provided source files and is ignored by Git.
- `data/` contains SQLite databases and is ignored by Git.
- Generated artifacts will be stored with a source hash, schema version,
  generation timestamp, and model/run metadata.

The repository includes only `.gitkeep` files in local data directories.
See [COURSE-DATA-MODEL.md](./COURSE-DATA-MODEL.md) for table ownership,
syllabus-derived structure, and integrity rules.

See [SOURCE-INGESTION.md](./SOURCE-INGESTION.md) for supported formats,
processing states, provenance, and extractor extension points.

See [LEARNING-FEEDBACK-LOOPS.md](./LEARNING-FEEDBACK-LOOPS.md) for the planned
source, diagnosis, instruction, practice, and retention cycles. That document
also defines the separation between generated artifacts and append-only learner
evidence.

Learner records are scoped by `course_id`. The Study surface is nested under a
class workspace (`/courses/:courseId/study`), and all learner profile, attempt,
study-session, and clarification routes use that class ID. The server verifies
the class and rejects concept/assessment references owned by another class.
Obsidian synchronization is planned as a configured vault root with one
class-specific subfolder; no vault files are read or written yet.

See [PRODUCT-PLAN.md](./PRODUCT-PLAN.md) for settled product scope, personal
repository boundaries, rate-limit policy, and the initial model-routing matrix.

See [SKILL-ARCHITECTURE.md](./SKILL-ARCHITECTURE.md) for the implemented
specialized skills and the deterministic boundary around them.

## Failure policy

There are no silent model, source, or persistence fallbacks. An unavailable
Codex process, invalid structured response, failed source extraction, or failed
database write must produce an explicit error and leave the last valid artifact
unchanged.

## Course library API

| Method | Route | Purpose |
|---|---|---|
| `GET` | `/api/health` | Confirm the local service and contract version |
| `GET` | `/api/codex/status` | Check local Codex installation and authentication |
| `GET` | `/api/courses` | List class cards and derived counts |
| `POST` | `/api/courses` | Create a class workspace |
| `GET` | `/api/courses/:courseId` | Load class materials and structure |
| `POST` | `/api/courses/:courseId/materials` | Store one class source |
| `GET` | `/api/courses/:courseId/materials/:materialId/passages` | Read extracted, source-located passages |
| `GET` | `/api/courses/:courseId/learning-artifacts` | Read the current classification and course-map review artifacts |
| `POST` | `/api/courses/:courseId/source-classification` | Classify the current source fingerprint through Luna |
| `POST` | `/api/courses/:courseId/course-map` | Build a source-grounded map through Terra |
| `POST` | `/api/courses/:courseId/course-map/:artifactId/accept` | Transactionally apply a current reviewed map |
| `GET` | `/api/courses/:courseId/learner/profile` | Read only this class's learner profile |
| `POST` | `/api/courses/:courseId/learner/assessments` | Store this class's exam/quiz and topics |
| `POST` | `/api/courses/:courseId/learner/attempts` | Append same-class attempt and evidence |
| `POST` | `/api/courses/:courseId/learner/study-session` | Generate a class-scoped lesson and check |
| `POST` | `/api/courses/:courseId/learner/study-sessions/:sessionId/next-question` | Generate same-concept practice from up to five recent class-scoped attempts |
| `POST` | `/api/courses/:courseId/learner/clarify` | Ask a class-scoped clarification question |

API additions should begin with a contract and an acceptance test.
