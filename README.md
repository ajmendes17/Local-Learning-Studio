# Local Learning Studio

Local Learning Studio is a personal, local-first learning workspace powered by
Codex. It is intended to turn course material into source-grounded plans,
lessons, practice, assessments, and adaptive review without requiring a
separate pay-as-you-go API integration by default.

This repository currently contains the runnable project foundation. Product
features are intentionally tracked as milestones in [PROGRESS.md](./PROGRESS.md)
rather than represented as finished.

## Product principles

- Keep course material and learner records local by default.
- Ground explanations and generated work in identifiable source material.
- Adapt from demonstrated performance, not fixed "learning style" labels.
- Save durable course maps and learning artifacts instead of regenerating them.
- Fail explicitly when sources, Codex, or structured outputs are unavailable.
- Keep the interface focused: one clear study action at a time.

## Repository layout

```text
.
├── .codex/skills/learning-coach/  # Project-local Codex workflow
├── apps/
│   ├── server/                    # Local Fastify service
│   └── web/                       # React + Vite interface
├── packages/contracts/            # Shared TypeScript contracts
├── courses/                       # Local source material (ignored)
├── data/                          # Local databases (ignored)
├── docs/
│   ├── ARCHITECTURE.md            # Boundaries and data flow
│   ├── COURSE-DATA-MODEL.md       # Course hierarchy and storage contract
│   └── LEARNING-FEEDBACK-LOOPS.md # Adaptive learning-system blueprint
└── PROGRESS.md                    # Completed work and backlog
```

## Prerequisites

- Node.js 22 or newer
- npm 10 or newer
- Codex installed and authenticated for future AI-backed workflows

The installed Codex application is not yet invoked by the starter service.
That integration is deliberately scheduled after the structured contracts and
course-ingestion pipeline are defined.

## Start locally

```bash
cp .env.example .env
npm install
npm run dev
```

Open [http://localhost:4317](http://localhost:4317). Vite proxies `/api`
requests to the local service at `http://127.0.0.1:4318`.

## Verify the project

```bash
npm run check
```

The check runs TypeScript validation, server tests, and production builds for
all workspaces.

## Current scope

The foundation includes:

- A responsive course-library homepage
- A “How it works” information page describing the planned learning loops
- Clickable class cards and per-class workspaces
- A class-creation workflow
- Per-class PDF, Markdown, text, DOCX, and PPTX uploads
- SQLite-backed course and material records
- Shared runtime contracts for courses, materials, modules, and assessments
- Explicit local file separation under `courses/<course-id>/materials`
- A project-local `learning-coach` skill
- Architecture, data-model, and progress documentation

Document extraction, syllabus analysis, module and assessment editing, Codex
execution, lesson generation, practice, and mastery tracking are not
implemented yet. See [PROGRESS.md](./PROGRESS.md) for their order and
acceptance criteria.

## Privacy and cost boundary

The intended personal configuration invokes a locally authenticated Codex
installation, so model work uses the user's Codex allowance instead of a
separate API key. This is still cloud model processing, not local inference.
Course content should therefore be treated according to the user's applicable
OpenAI account and data settings.

An API-backed or hosted mode may be added later, but it must remain an explicit
configuration with separate credentials, cost controls, and documentation.
