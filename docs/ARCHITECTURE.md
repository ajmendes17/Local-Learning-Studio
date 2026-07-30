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

Owns data exchanged across boundaries. Types should become versioned runtime
schemas before model-generated data or user files enter the system.

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

## Failure policy

There are no silent model, source, or persistence fallbacks. An unavailable
Codex process, invalid structured response, failed source extraction, or failed
database write must produce an explicit error and leave the last valid artifact
unchanged.

## Initial API

| Method | Route | Purpose |
|---|---|---|
| `GET` | `/api/health` | Confirm the local service and contract version |

API additions should begin with a contract and an acceptance test.

