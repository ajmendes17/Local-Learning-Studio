---
name: reconcile-assessments
description: Reconcile course assessment records against exam reviews, syllabi, schedules, and lecture notes. Detect duplicate names for the same assessment, validate topic claims by source, and identify questions that need learner or instructor clarification.
---

# Reconcile Assessments

Use this skill when an assessment's scope is unclear, multiple course-map or
Obsidian entries may describe the same exam, or a learner asks whether a topic
list matches the material covered in class.

1. Inspect the supplied assessment records and relevant course notes. Prefer
   exam-specific review material for exam scope, the syllabus schedule for
   what was planned, and dated lecture notes or instructor announcements for
   what was actually covered. Keep these evidence types distinct.
2. Compare titles, dates, kinds, source references, topics, and wording. Treat
   records as probable duplicates when they refer to the same numbered exam or
   event, especially when their timing or supporting syllabus evidence agrees.
   Do not count duplicate records as independent confirmation.
3. Build a topic comparison with evidence for each claim. Label topics as
   directly supported, consistent with scheduled coverage, plausible but
   unverified, contradicted, or unsupported by supplied evidence. A scheduled
   topic is not proof it was taught or examined.
4. Identify missing or conflicting evidence, including broad topic labels that
   hide several distinct concepts, stale exports, omitted source passages, and
   duplicate assessment entries. State confidence and what evidence would
   resolve material uncertainty.
5. If records appear to describe the same assessment, report them together as
   one assessment with their distinct source claims preserved. Recommend a
   canonical title and a deduplicated topic list, but do not silently merge,
   rename, delete, or rewrite any course or Obsidian data.
6. Ask only focused clarification questions that could change the study scope
   (for example, whether a scheduled topic was covered before the exam). If
   clarification is unavailable, provide a useful provisional scope and label
   the uncertainty rather than blocking the whole result.

Present the result in four parts: (a) duplicate/reconciliation finding,
(b) topic-by-topic evidence comparison, (c) overall accuracy grade with a
brief rubric rationale, and (d) unresolved questions or recommended record
cleanup. Explain the grade against the supplied evidence, not against an
assumed instructor exam.

Never treat model-generated maps or Obsidian exports as primary evidence when
their source material is available. Preserve provenance and distinguish
instructor-provided assessment scope from topics inferred from course-wide
coverage. Do not claim certainty about exam questions, weight, or inclusion
without direct evidence.
