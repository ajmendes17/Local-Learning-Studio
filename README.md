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
├── .agents/skills/                # Narrow project-local learning workflows
├── apps/
│   ├── server/                    # Local Fastify service
│   └── web/                       # React + Vite interface
├── packages/contracts/            # Shared TypeScript contracts
├── courses/                       # Local source material (ignored)
├── data/                          # Local databases (ignored)
├── docs/
│   ├── ARCHITECTURE.md            # Boundaries and data flow
│   ├── COURSE-DATA-MODEL.md       # Course hierarchy and storage contract
│   ├── LEARNING-FEEDBACK-LOOPS.md # Adaptive learning-system blueprint
│   ├── PRODUCT-PLAN.md             # Durable product decisions and MVP scope
│   ├── SKILL-ARCHITECTURE.md       # Specialized model-backed workflows
│   └── SOURCE-INGESTION.md         # Extraction states and provenance
└── PROGRESS.md                    # Completed work and backlog
```

## Prerequisites

- Node.js 22.13 or newer
- npm 10 or newer
- Codex installed and authenticated for AI-backed workflows

The local service verifies the Codex CLI and its saved authentication through
`GET /api/codex/status`. Model-backed actions use non-interactive, ephemeral,
read-only runs with schema-validated output. There is intentionally no generic
prompt endpoint.

## Start locally

```bash
cp .env.example .env
npm install
npm run dev
```

Open [http://localhost:4317](http://localhost:4317). Vite proxies `/api`
requests to the local service at `http://127.0.0.1:4318`.

To try the hand-tracking proof of concept, open **Hand demo** in the app and
choose **Turn camera on**. Allow camera access when prompted. The MediaPipe
model is stored in `apps/web/public/models`; the MediaPipe browser runtime is
loaded from jsDelivr when the demo starts. Camera frames are processed in the
browser and are not sent to the local service.

With the camera on, choose **Calibrate pointing** and hold a pointing gesture
at each highlighted browser corner until it captures. The demo pauses and waits
for your aim to change before moving on. The saved mapping reports browser
viewport quadrants for pointing, open-hand, and fist poses, using the palm's
direction for the latter two. It does not map macOS desktop coordinates.
Detected poses other than pointing and open hand currently default to closed
fist. The live pointing grid highlights the selected quadrant, shows the
smoothed coordinate estimate, and keeps the four calibration targets visible.
After calibration, choose **Expand grid** to fill the browser viewport while
you inspect the tracking.

`DATABASE_PATH` and `COURSE_ROOT` can override the default local storage
locations in `.env`, which is useful for isolated verification or alternate
local libraries. `CODEX_MODEL_LUNA`, `CODEX_MODEL_TERRA`, and
`CODEX_MODEL_SOL` can override the task-router defaults.

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
- Canvas course preview and selected import into new or existing classes, with source links and duplicate-safe explicit refresh
- Markdown, plain-text, text-PDF, DOCX, and PPTX extraction into source passages
- Page, line, paragraph, slide, and heading provenance with passage hashes
- Explicit extraction states and visible failure reasons
- SQLite-backed course and material records
- Class-scoped learner assessments, topics, concepts, attempts, and append-only
  mastery evidence, with class-local learner API routes
- A direct study space inside each class with Codex-generated explanations,
  worked examples, quiz-first practice, immediate feedback, clarification chat,
  and optional time budgeting
- Shared runtime contracts for courses, sources, concepts, course-map
  proposals, modules, and assessments
- Explicit local file separation under `courses/<course-id>/materials`
- Nine explicitly invoked, project-local learning skills
- A serialized Codex runner with configurable Luna, Terra, and Sol routing
- A local Codex installation/authentication readiness endpoint
- Cached source classification through the explicit Luna workflow
- Cached, source-grounded course-map drafts through the explicit Terra workflow
- Transactional acceptance into modules, concepts, objectives, and assessments
- A responsive in-course review workflow showing source roles, map freshness,
  warnings, modules, assessments, model provenance, and regeneration controls
- Architecture, data-model, and progress documentation

OCR, Obsidian vault synchronization, reusable generated lesson history,
course-material retrieval inside the direct study session, and calibrated
mastery thresholds are not implemented yet. See
[SOURCE-INGESTION.md](./docs/SOURCE-INGESTION.md) for the current extraction
boundary and [PROGRESS.md](./PROGRESS.md) for implementation order and
acceptance criteria. Settled product and model-routing decisions live in
[PRODUCT-PLAN.md](./docs/PRODUCT-PLAN.md), with the implemented narrow skill split
in [SKILL-ARCHITECTURE.md](./docs/SKILL-ARCHITECTURE.md).

For the Canvas connection and import workflow, see
[CANVAS-IMPORT.md](./docs/CANVAS-IMPORT.md). Configure `CANVAS_ACCESS_TOKEN` and
`CANVAS_BASE_URL` in the local environment; tokens stay on the server. A
multiuser deployment should use institution-approved OAuth.

## Privacy and cost boundary

The intended personal configuration invokes a locally authenticated Codex
installation, so model work uses the user's Codex allowance instead of a
separate API key. This is still cloud model processing, not local inference.
Course content should therefore be treated according to the user's applicable
OpenAI account and data settings.

An API-backed or hosted mode may be added later, but it must remain an explicit
configuration with separate credentials, cost controls, and documentation.
