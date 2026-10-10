---
name: map-course
description: Propose a source-grounded Local Learning Studio course map containing concepts, prerequisites, objectives, modules, assessments, and passage references. Use when classified course sources must become a reviewable course-map artifact.
---

# Map Course

1. Treat the supplied input and constrained output schema as complete. Do not
   read repository files, contracts, or original uploads; use only this request's
   course metadata, classified sources, and supplied passages.
2. Derive concepts, objectives, modules, assessments, and prerequisite edges
   from explicit source evidence.
3. Treat homework and assignment problems as evidence of topics the course
   assesses or expects learners to practice. Derive concepts and objectives
   from their explicit questions and tasks even when the syllabus omits them.
   Keep those topics grounded in the assignment; do not infer unseen lectures
   or readings.
4. Use stable keys within the proposal. Every source passage has a globally
   unique short `passageKey` alias. Cite that exact alias in each source
   reference; the application will resolve it to the source IDs. Never output
   course IDs, material IDs, passage UUIDs, or invented aliases.
5. Mark ambiguity and missing coverage instead of completing gaps from general
   knowledge.
6. Return only the requested versioned course-map proposal.

Keep the proposal reviewable. Never persist it, treat generated content as a
source, or silently broaden the source set.
