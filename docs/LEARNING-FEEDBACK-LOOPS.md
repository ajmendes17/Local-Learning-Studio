# Learning Feedback Loops

## Purpose

Local Learning Studio should repeatedly answer three questions:

1. What does this course expect the learner to know?
2. What does the available evidence suggest the learner knows right now?
3. What is the smallest useful next activity?

The system should not compress those answers into one opaque score. It should
retain the evidence, uncertainty, source provenance, and reason for each next
step.

## The linked loop

```text
Course sources
      |
      v
Course map and objectives
      |
      v
Conversation + diagnostic evidence
      |
      v
Lesson, example, or guided practice
      |
      v
Independent response + confidence
      |
      v
Feedback + proposed mastery evidence
      |
      v
Delayed review and retention evidence
      |
      `--------------------> next activity
```

Each stage produces durable data for the next stage. Generated material is an
artifact, not a source of truth.

## Loop 1: Source grounding

### Input

- Syllabus
- Lecture notes and slides
- Readings
- Assignments and study guides
- User-confirmed course structure

### Process

1. Extract passages with file, page, slide, or heading provenance.
2. Propose modules, concepts, prerequisites, objectives, and assessments.
3. Ask the user to review syllabus-derived structure before applying it.
4. Track the source passages that support each course-map claim.

### Output

- Reviewed course map
- Concept graph
- Module and assessment structure
- Source index
- Missing or contradictory source warnings

### Feedback

User corrections update the course map while preserving the proposal and its
source. Model-generated explanations never become source passages.

## Loop 2: Learner diagnosis

### Input

- Learner goal and deadline
- Self-reported confidence
- Short explanation in the learner's own words
- Low-stakes diagnostic questions
- Existing attempts and delayed-review results

### Process

Ask the smallest set of questions needed to distinguish likely states. Prefer
one explanation or representative problem over a long placement test. Compare
confidence with demonstrated reasoning.

### Output

- Initial evidence for relevant concepts
- Likely prerequisite gaps
- Explicit unknowns
- Recommended starting activity

### Feedback

A conversation can create evidence, but not a verdict. “I understand this” is
a preference or claim until paired with recall, explanation, or application.

## Loop 3: Instruction

### Input

- Current objective
- Relevant source passages
- Known prerequisite evidence
- Recent errors and hint history
- User presentation preferences

### Process

Choose the smallest intervention that can unblock progress:

- concise explanation;
- analogy or contrasting example;
- worked example;
- one orienting question;
- progressive hint;
- prerequisite refresher.

### Output

- Source-grounded lesson or explanation
- Worked example with reasoning
- Guided question
- One clear transition to learner action

### Feedback

The learner explains, predicts, or completes a step. The system uses the
response to decide whether to continue, change representation, revisit a
prerequisite, or move to independent practice.

## Loop 4: Practice and assessment

### Input

- Target concepts and objectives
- Source-grounded examples
- Difficulty and independence target
- Prior attempts and common error patterns

### Process

1. Generate a problem against a versioned contract.
2. Generate and validate its solution separately.
3. Grade multiple choice, true/false, and contract-approved exact answers
   locally against the validated stored key.
4. Route short responses to the configured lightweight grading model with only
   the rubric, response, and relevant source blocks.
5. Collect the answer, reasoning, confidence, and hint use.
6. Distinguish correct, incorrect, incomplete, and unsupported reasoning.
7. Provide concise feedback before another attempt or explanation.

### Output

- Practice set, quiz, or example assessment
- Attempt record
- Feedback
- Proposed misconception and mastery evidence

### Feedback

Correct answers with weak reasoning, heavy hints, or low confidence do not mean
the same thing as independent, well-explained answers. Repeated items should
vary surface details without changing the targeted concept.

## Loop 5: Retention and planning

### Input

- Append-only mastery evidence
- Time since last successful retrieval
- Course deadlines and assessment weights
- Available study time
- User priorities and overrides

### Process

Balance urgency, prerequisites, weakness, and forgetting risk. Schedule delayed
retrieval rather than treating same-session success as durable mastery.

### Output

- Explainable next activity
- Review queue
- Updated training plan proposal
- Weak-point summary

### Feedback

Delayed performance confirms, weakens, or complicates prior evidence. The user
can override the next activity without erasing history.

Quiz completion automatically proposes a training-plan revision. Persist the
prior version and show the evidence and rationale for every changed priority,
review date, prerequisite, or activity.

## Conversation model

Conversations should be purposeful and short. The assistant can ask:

- “What are you preparing for, and when?”
- “Explain this idea as if you were teaching it.”
- “Which step feels uncertain?”
- “How confident are you before checking?”
- “Would you prefer another example or an independent problem?”
- “What made the incorrect option seem plausible?”

Store structured observations from the conversation, not an unbounded chat
transcript as the learner model. The original transcript may be retained only
under an explicit retention policy.

## Evidence model

Each evidence record should contain:

- course and concept IDs;
- activity and attempt IDs;
- evidence kind: recall, explanation, application, recognition, or retention;
- outcome and rubric dimensions;
- confidence before feedback;
- hint count and strongest hint level;
- independence level;
- source and artifact versions;
- timestamp;
- optional misconception code;
- system rationale;
- user correction or override.

Mastery is a derived view over evidence. It is not directly edited by a model.

## Artifact model

Store generated content separately from learner evidence:

- course maps;
- training plans;
- lessons;
- explanations;
- worked examples;
- practice sets;
- quizzes;
- feedback;
- review recommendations.

Every artifact should include schema version, source references, generation
metadata, and supersession state. Invalid generations never replace the last
valid artifact.

## Guardrails

- Do not assign a fixed learning-style label.
- Do not infer mastery from one answer or self-report.
- Do not hide uncertainty or missing source support.
- Do not reveal full solutions before the configured hint progression.
- Do not let generated material become course evidence.
- Do not change learner state without validating the proposed evidence record.
- Do not overwrite history when the learner corrects the system.
- Do let the learner inspect, correct, export, and delete their data.

## Typical study session

1. Confirm the goal and available time.
2. Run one retrieval warm-up.
3. Select an objective from course priorities and evidence.
4. Teach only what is needed.
5. Work one guided example.
6. Ask for independent practice and confidence.
7. Give feedback tied to the learner's reasoning.
8. Record proposed evidence after validation.
9. Summarize the weak point and schedule delayed review.
10. Explain why the next activity was chosen.

## Implementation order

1. Source-passage and concept schemas
2. Reviewed syllabus-to-course-map proposal
3. Activity and artifact contracts
4. Attempt and append-only evidence records
5. Diagnostic conversation state machine
6. Practice generation and solution validation
7. Explainable mastery projection
8. Review scheduler and training-plan revision
9. Data inspection, correction, export, and deletion
