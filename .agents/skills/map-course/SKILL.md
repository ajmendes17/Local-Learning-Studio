---
name: map-course
description: Propose a source-grounded Local Learning Studio course map containing concepts, prerequisites, objectives, modules, assessments, and passage references. Use when classified course sources must become a reviewable course-map artifact.
---

# Map Course

1. Read `docs/COURSE-DATA-MODEL.md`, the applicable contract under
   `packages/contracts`, and only the supplied classified passages.
2. Derive concepts, objectives, modules, assessments, and prerequisite edges
   from explicit source evidence.
3. Use stable keys within the proposal and ensure every reference resolves to
   a supplied course, material, and passage.
4. Mark ambiguity and missing coverage instead of completing gaps from general
   knowledge.
5. Return only the requested versioned course-map proposal.

Keep the proposal reviewable. Never persist it, treat generated content as a
source, or silently broaden the source set.
