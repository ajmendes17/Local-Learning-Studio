---
name: classify-course-sources
description: Classify canonical Local Learning Studio passages by course role, document purpose, and coverage, and identify ambiguity or missing inputs. Use when imported sources have already been deterministically extracted and the application needs semantic intake analysis before course mapping.
---

# Classify Course Sources

1. Read only the supplied course metadata, material records, and canonical
   passages. Do not reopen or re-extract uploaded files.
2. Classify each material and relevant passage by its supported role, such as
   syllabus, schedule, lecture, reading, assignment, study guide, or reference.
3. Preserve every supplied material ID, passage ID, and source location.
4. Separate confident classifications, ambiguous classifications, conflicts,
   and missing expected inputs.
5. Return only the supplied structured-output contract.

Do not invent dates, policies, topics, or source locations. Treat generated
content as non-source material. Propose classifications only; never write
course state directly.
