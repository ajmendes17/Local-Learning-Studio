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
databases, Codex credentials, or process state directly.

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

API additions should begin with a contract and an acceptance test.
