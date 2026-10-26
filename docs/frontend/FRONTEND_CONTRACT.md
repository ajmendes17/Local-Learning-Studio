# FRONTEND_CONTRACT.md

> Project-specific frontend guardrails for AI agents and reviewers.
> This is not a universal style law — tailor every section to this project.
> Rules may only be broken with a written product reason (see Exceptions).

---

## Hard red lines

These apply on all surfaces with no exceptions:

- Do not expose secrets, tokens, private URLs, or sensitive identifiers by default.
- Dangerous or destructive actions require confirmation or an undo mechanism.
- Every core async surface must have loading, empty, and error states.
- Technical states must be translated into human language in primary UI.
- Agent-only context, implementation reasoning, and design intent must not appear as primary UI copy.
- Long text, IDs, paths, and JSON must not break layout.
- Mobile view must preserve the primary task.
- Do not paste README, architecture, or product manifesto into operational UI.

---

## Business-object boundaries

| Object A | Object B | Rule |
|---|---|---|
| Source evidence | General-knowledge content | Label the distinction wherever grounding status affects trust. |
| Lesson activity | Scored knowledge-check attempt | Show separate measures and never combine them as mastery. |
| Instructor assessment topics | Generated course-map topics | Preserve each item origin and review status. |

---

## Allowed UI foundations

- Existing React + Vite + TypeScript components and styles are the default foundation; inspect and reuse before adding a component library.

---

## Page behavior defaults

| Surface | Default pattern | Hard line |
|---|---|---|
| Course map | Hierarchical course structure with focused detail and study entry | Keep source links and instructor-topic provenance clear. |
| Study | Focused lesson or practice flow with a visible return path | Separate lesson and scored-check states. |
| Progress | Course/topic activity, scored attempts, and a rough understanding estimate | Label the estimate as recency-weighted and approximate; never claim it is calibrated mastery. |
| Source library | Course-scoped list with extraction detail | Every failure has a useful next step. |

---

## UX behavior defaults

- Every core page must make the first decision and primary action obvious.
- Information order follows the user task, not the database schema or route tree.
- Browse, inspect, edit, and commit are separate responsibilities unless there is a product reason.
- Optional, advanced, diagnostic, or raw technical detail uses progressive disclosure.
- Error, empty, permission denied, destructive-action, and long-running states include recovery or next-step copy.
- Mobile layouts may reorder, collapse, or replace desktop sections to preserve the primary task.
- Keyboard focus order follows the task flow; dialogs, drawers, and menus must have clear labels and escape paths.

---

## Baseline craft floor

These rules protect clarity without restricting creative direction:

- Alignment, spacing, and panel rhythm must look intentional.
- Empty space must either support hierarchy or be removed; no unfinished leftover regions.
- Primary, secondary, and utility actions must be visually distinct.
- Actions must sit near the content they operate on.
- Read-only status indicators must not look like editable inputs.
- Navigation tabs and display-only status indicators must not share the same visual treatment.
- User-facing labels are primary; endpoints, paths, IDs, status codes, JSON keys, filenames, hashes, and version strings are secondary.
- Numeric precision, tag styling, separators, selected states, and overflow behavior must be consistent inside the same component family.

---

## Copy rules

These are product-context rules, not string blacklists. Technical copy is allowed when it directly helps the user complete this page's task; otherwise demote it to help, tooltip, diagnostics, raw details, docs, or code comments.

1. First human words, then terminology.
2. First conclusion, then detail.
3. First action, then raw data.
4. Page headers state the task — not the product manifesto.
5. Primary UI copy says what happened and what to do next — not why the agent designed the panel.
6. The product's primary language owns labels, states, and actions; protocol/API words are secondary unless the page is explicitly an API reference.

---

## Status translation table

| Internal state | User-facing label | Explanation / next step |
|---|---|---|
| Source not extracted | Could not read this file yet | Try a supported format or inspect the source details. |
| No selected course source | Using general knowledge | This lesson is not verified against your course materials. |
| Codex unavailable | Study tools temporarily unavailable | Reconnect Codex or use available course content and saved materials. |

---

## Visual QA gates

Before merging any change to a core page:

- [ ] Desktop screenshot acceptable
- [ ] Mobile screenshot acceptable
- [ ] Empty state acceptable
- [ ] Error state acceptable
- [ ] Long-text / dense-data state acceptable
- [ ] Modal or drawer state acceptable (if applicable)

---

## Agent instruction handoff

Keep this document as the detailed source of frontend rules. `AGENTS.md` should contain only a short pointer, for example:

```text
Before broad frontend UI/UX changes, read:

- docs/frontend/DESIGN.md
- docs/frontend/FRONTEND_CONTRACT.md

For new or substantially refactored pages, create or update a PAGE_BRIEF.md near the route/component or under docs/frontend/pages/. Do not duplicate long frontend checklists in AGENTS.md.
```

Update `AGENTS.md` only when installing or changing repository-level frontend governance, not after every page edit.

---

## Exceptions

A rule may be broken only with a written product reason:

```text
Rule broken:
Why this product / page needs it:
How usability is preserved:
Approved by:
```
