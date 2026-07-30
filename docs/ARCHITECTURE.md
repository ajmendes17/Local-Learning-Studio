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

Owns trusted local operations and exposes a narrow API. Future model calls must
be initiated here, validated against versioned contracts, and persisted only
after successful validation.

### `packages/contracts`

Owns data exchanged across boundaries. Zod runtime schemas validate course,
material, module, and assessment records before they cross the API boundary.

### `.codex/skills/learning-coach`

Defines the reusable learning workflow and source-grounding rules for Codex.
Application code remains responsible for authorization, validation,
persistence, and error handling.

## Storage

- `courses/` contains user-provided source files and is ignored by Git.
- `data/` contains SQLite databases and is ignored by Git.
- Generated artifacts will be stored with a source hash, schema version,
  generation timestamp, and model/run metadata.

The repository includes only `.gitkeep` files in local data directories.
See [COURSE-DATA-MODEL.md](./COURSE-DATA-MODEL.md) for table ownership,
syllabus-derived structure, and integrity rules.

See [LEARNING-FEEDBACK-LOOPS.md](./LEARNING-FEEDBACK-LOOPS.md) for the planned
source, diagnosis, instruction, practice, and retention cycles. That document
also defines the separation between generated artifacts and append-only learner
evidence.

## Failure policy

There are no silent model, source, or persistence fallbacks. An unavailable
Codex process, invalid structured response, failed source extraction, or failed
database write must produce an explicit error and leave the last valid artifact
unchanged.

## Course library API

| Method | Route | Purpose |
|---|---|---|
| `GET` | `/api/health` | Confirm the local service and contract version |
| `GET` | `/api/courses` | List class cards and derived counts |
| `POST` | `/api/courses` | Create a class workspace |
| `GET` | `/api/courses/:courseId` | Load class materials and structure |
| `POST` | `/api/courses/:courseId/materials` | Store one class source |

API additions should begin with a contract and an acceptance test.
