---
name: review-learning-patterns
description: Review a bounded, same-class history of study attempts for provisional learning patterns, only at session end or when the learner requests a review.
---

# Review Learning Patterns

1. Run only when the application explicitly invokes this skill with trigger
   `session-end` or `user-request`. Never run during an answer, continuously,
   on a timer, or as a background process.
2. Review only the supplied attempts and prior pattern snapshot for the one
   supplied class. Cite evidence only by the supplied attempt IDs.
3. Treat patterns as contextual observations, not diagnoses or fixed learning
   styles. Consider methods and confidence only when the supplied outcomes
   support a comparison.
4. Require repeated, reasonably comparable evidence before proposing a
   recurring pattern. A single answer, one session with one knowledge check,
   self-report alone, or conflicting sparse evidence should produce
   `insufficient` or `limited` evidence and no confident status change.
5. Preserve counterexamples. Distinguish a new observation from a change in
   an existing pattern. Explain status changes and include both supporting and
   counterexample attempt IDs where present.
6. Use only `emerging`, `reinforced`, `mixed`, and `weakened` for proposal
   status. Do not dismiss, delete, or permanently label a pattern; dismissal
   and corrections belong to learner-controlled application actions.
7. Return only the supplied `learner-pattern-review.v1` structured contract.
   The application validates, stores append-only review history, and updates a
   current projection. This skill never writes to storage.
