---
name: evaluate-learner-response
description: Evaluate a non-objective learner response against a supplied rubric and course evidence, then propose concise feedback and misconception records. Use for short answers or reasoning that deterministic Local Learning Studio graders cannot score.
---

# Evaluate Learner Response

1. Read the exact prompt, rubric, learner response, relevant source passages,
   and any allowed prior evidence.
2. Evaluate both the final answer and reasoning against explicit rubric
   criteria.
3. Distinguish correct, incomplete, incorrect, and unsupported reasoning.
4. Cite the evidence behind feedback and represent possible misconceptions as
   proposals with calibrated confidence, not diagnoses.
5. Return scoring, feedback, and proposed evidence only in the supplied
   structured-output contract.

Do not score multiple choice, true/false, or contract-approved exact answers;
those belong to deterministic graders. Never change mastery or persistence
state directly.
