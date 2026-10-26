# DESIGN.md

> Project-level frontend design memory for AI agents and humans.
> Update after previews, direction choices, reviews, and repeated implementation lessons.
> Do not paste this document into normal UI — it is internal agent context.

---

## 1. Project in human words

Local Learning Studio helps a learner organize course materials, understand what to study next, and practice with feedback grounded in their sources. It is a personal, local-first workspace that should make study feel clear and manageable.

---

## 2. Core users

- The learner (currently the product owner): needs a clear next study action, useful progress context, and trustworthy links back to course sources.

---

## 3. Core business objects

| Object | What it means to the user | Should appear where | Must not be mixed with |
|---|---|---|---|
| Course | A class and its materials | Course map, study, progress | Keep each course's materials and learner records scoped to that course. |
| Source | A file or passage used to ground learning | Source library, map, lesson annotations | Preserve provenance; distinguish source-grounded work from general knowledge. |
| Module / topic | A structured part of a course | Course map, progress, study | Keep hierarchy understandable; do not flatten into an undifferentiated list. |
| Assessment / exam topics | A requirement or topic list the learner wants to prepare for | Course map, planning, study | Distinguish instructor-provided requirements from inferred course structure. |
| Study activity / attempt | What the learner did and how they answered | Study history, progress | Separate lesson activity from scored knowledge checks; do not overstate mastery. |
| Learning artifact | A saved lesson, practice set, or review item | Study, course materials | Keep durable artifacts connected to their sources and course context. |

---

## 4. Core journeys

| Journey | Entry point | First decision | Success criterion | Recovery path |
|---|---|---|---|---|
| Resume studying | Course home / recent activity | Choose the next useful study action | Learner completes a lesson or practice attempt | Preserve progress and offer a clear retry or alternate topic. |
| Organize a course | Course library | Choose or create a course and add materials | Course map is reviewable and source-linked | Show unsupported or failed extraction clearly with a path to inspect the source. |
| Prepare for an assessment | Course map / exam topic list | Select priorities | Learner practices the selected topics and can review results | Allow editing the topic list and returning to the map. |
| Review progress | Course progress | Choose a topic or module to inspect | Learner understands activity and a useful next step | Label unknown or limited evidence; avoid implying calibrated mastery. |

---

## 5. Product temperament

Choose one or combine deliberately:

- [ ] Developer Precision
- [ ] AI Native Future
- [ ] Enterprise Ops
- [ ] Commerce Trust
- [ ] Content Ops
- [ ] Public Marketing / Consumer Delight

**Why:** Learning is operational, repeated work. The interface should feel calm, precise, encouraging, and source-trustworthy, with enough warmth to invite study but no gamified pressure or false certainty.

---

## 6. Reference systems

| Reference | Borrow | Avoid |
|---|---|---|
| Existing Local Learning Studio interface | Preserve useful interactions and vocabulary during incremental redesign | Do not replace functional flows for visual novelty. |
| Obsidian (optional export destination) | Clear links between notes and source context | Do not imply two-way sync; export is currently one-way. |

---

## 7. UI foundation

| Decision | Choice | Notes |
|---|---|---|
| Framework | React + Vite + TypeScript | Existing application foundation. |
| Component foundation | Existing project components and styles | Inspect before introducing another library. |
| Table / data strategy | Task-oriented course map and lists | Preserve hierarchy and source context. |
| Form strategy | Existing controls with explicit review before committing imported topics | Avoid destructive or ambiguous bulk edits. |
| Storybook | deferred | No current project requirement. |
| Playwright / visual QA | Use existing browser workflow when UI changes warrant it | Check representative desktop and narrow/mobile layouts. |

---

## 8. Visual direction

| Dimension | Decision |
|---|---|
| Density | balanced, with compact data views where course maps need scanning |
| Typography | prioritize long-form lesson readability and clear hierarchy |
| Color tone | calm and focused; semantic colors must remain legible and not carry meaning alone |
| Radius / shadow | follow existing component language; use elevation sparingly |
| Motion | restrained and purposeful |
| Icon style | use existing icon conventions and pair unfamiliar actions with labels |
| Mobile approach | responsive and task-reordered around the current study action |

---

## 8A. Baseline craft norms

Creative direction for this project should preserve:

- Alignment / grid rhythm: keep the main study task and its supporting context aligned; avoid competing panels.
- Spacing scale: use the existing scale consistently and preserve comfortable reading measure.
- Primary / secondary / utility action treatment: one clear study action per surface; secondary actions should not compete.
- Status vs input/control treatment: progress and extraction status are read-only evidence, visually distinct from controls.
- Technical identifier treatment: filenames and extraction details are secondary but accessible for source inspection.
- Tag semantics and overflow: use labels for course/topic meaning, with predictable wrapping or overflow.
- Selected / active state signals: distinguish selected map items from completion or score states.
- Empty-space policy: use empty space to reduce study overload; provide one clear next action when content is absent.

---

## 9. Vocabulary

### User-facing words (use in UI)

- course, source, module, topic, study, practice, review, progress

### Primary UI language

- English (US) for labels, states, actions, and empty/error/success copy

### Internal terms to keep secondary (translate or hide)

| Internal term | Human translation | Where to surface |
|---|---|---|
| Extraction status | Plain-language explanation and next step | Source detail / import flow |
| General knowledge | Clearly state that content is not course-verified | Lesson context |
| Understanding estimate | A clearly labeled, rough percentage derived from recent scored answers | State that recency and small samples make it approximate; never present it as calibrated mastery |

### Agent-only context to keep out of primary UI

This section records patterns to place correctly; it is not a blacklist of exact phrases. A technical phrase may be valid in developer help, diagnostics, or raw details when it helps the user debug.

| Agent / implementation context | Where it belongs instead |
|---|---|
| [Design intent / protocol explanation / implementation contract] | docs / tooltip / diagnostic / code comment |

---

## 10. Page patterns

| Page / surface | Preferred pattern | Hard lines |
|---|---|---|
| Course map | Hierarchical map with module/topic/assessment details and a direct study path | Keep source and assessment context visible without overwhelming the next action. |
| Study session | Focused lesson or practice surface with separate lesson/check areas and clear return path | Avoid mixing lesson reading and scored feedback into one confusing wall. |
| Progress | Topic/module view distinguishing lesson activity from scored attempts | Do not present activity as calibrated mastery. |
| Source library | Course-scoped file list with extraction state and source detail | Failed or unsupported extraction needs a clear recovery path. |

---

## 11. UX principles for this project

Record project-level UX decisions here so future agents do not re-derive them
from scratch on every page.

### Primary task before background explanation

- Course and study pages should surface one clear next action before background explanation.
- Source provenance, scoring meaning, and limitations should be available where they inform a decision, without dominating routine study.
- Architecture, implementation notes, and product manifesto belong in project documentation, not the learner-facing interface.

### Default recovery paths

| State / risk | Default recovery | Notes |
|---|---|---|
| Empty | [Create / import / connect / request access] | |
| Error | [Retry / change input / view details / contact owner] | |
| Permission denied | [Request access / switch account / contact admin] | |
| Destructive action | [Confirm scope / undo / restore] | |
| Long-running action | [Progress / safe cancel / resume / notification] | |

### Mobile task priority

- Put the active study action, lesson, or answer controls first on narrow screens.
- Move secondary source metadata and progress context below or into disclosure when needed.
- Convert map/detail split layouts into a clear list-to-detail or stepwise flow while preserving return navigation.

---

## 12. Anti-patterns to watch for this project

- Confusing activity counts with learning mastery or confidence.
- Losing source provenance or presenting general knowledge as course-verified.
- Showing too many competing study actions at once.

---

## 13. Screenshot / QA requirements

Core pages must capture:

- [ ] Desktop
- [ ] Mobile / narrow study flow
- [ ] Loading state for model-backed work
- [ ] Empty course / no-source state
- [ ] Extraction or generation error state
- [ ] Long lesson / dense course-map state

---

## 14. Change log

| Date | Change | Reason |
|---|---|---|
| 2026-10-14 | Established initial product and UX baseline from README and current product principles | Anchor future overhaul decisions in the existing local-first, source-grounded learning intent. |
