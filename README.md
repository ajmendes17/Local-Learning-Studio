# Local Learning Studio

Local Learning Studio is a personal, local-first learning workspace powered by
Codex. It is intended to turn course material into source-grounded plans,
lessons, practice, assessments, and adaptive review without requiring a
separate pay-as-you-go API integration by default.

The app runs locally and combines course materials, an interactive course map,
study sessions, learner progress, and an optional Obsidian export. The
implementation ledger in [PROGRESS.md](./PROGRESS.md) records completed work
and its verification evidence.

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
The server watcher ignores generated contract files so typechecks and builds do
not interrupt API requests. After changing a shared contract, restart the
server to load the rebuilt contract package.

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

## What the app does

- Stores course files and learner records locally, with source locations and
  extraction status recorded for supported PDF, Markdown, text, DOCX, and PPTX
  materials.
- Builds a reviewable, source-grounded course map. Modules, topics, homework,
  and exams appear in an interactive view; selecting a module or assessment
  opens its details and provides a path into study.
- Supports clear explanations, worked examples, quiz-first practice, and
  analogy-based lessons. The lesson and knowledge check have separate tabs;
  checks include hints, confidence ratings, saved attempts, and follow-up
  practice suggestions.
- Lets learners paste an instructor's exam topic list, review the cleaned
  topics, set priorities, and keep the list connected to study and progress.
- Tracks lesson activity separately from knowledge checks, and distinguishes
  scored answers from unscored attempts across topics, modules, and assessments.
  These are transparent activity signals, not calibrated mastery estimates.
- Exports a class knowledge base to a configured Obsidian vault on request.
  Notes link sources, modules, topics, assessments, and study-method progress;
  refreshes preserve learner-owned note sections. Export is one-way: edits in
  Obsidian do not update the app.
- Renders supported mathematical notation as formatted math in study and course
  map content.

Scanned-document OCR, image extraction, two-way Obsidian sync, and calibrated
mastery estimates are not implemented. Study sessions do not require uploaded
notes; when no course material is selected, the app labels the lesson as based
on general knowledge rather than course-verified evidence. See
[SOURCE-INGESTION.md](./docs/SOURCE-INGESTION.md) for extraction limits and
[PROGRESS.md](./PROGRESS.md) for implementation and verification history.
Architecture and workflow details live in [ARCHITECTURE.md](./docs/ARCHITECTURE.md),
[COURSE-DATA-MODEL.md](./docs/COURSE-DATA-MODEL.md), and
[LEARNING-FEEDBACK-LOOPS.md](./docs/LEARNING-FEEDBACK-LOOPS.md).

## Privacy and cost boundary

The intended personal configuration invokes a locally authenticated Codex
installation, so model work uses the user's Codex allowance instead of a
separate API key. This is still cloud model processing, not local inference.
Course content should therefore be treated according to the user's applicable
OpenAI account and data settings.

An API-backed or hosted mode may be added later, but it must remain an explicit
configuration with separate credentials, cost controls, and documentation.
