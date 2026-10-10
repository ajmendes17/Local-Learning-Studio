# Learning Feedback Loops

## Purpose

Local Learning Studio should repeatedly answer three questions:

1. What does this course expect the learner to know?
2. What does the available evidence suggest the learner knows right now?
3. What is the smallest useful next activity?

The system should not compress those answers into one opaque score. It should
retain the evidence, uncertainty, source provenance, and reason for each next
step.

Each loop is scoped to one class. Concept identity, assessments, attempts,
mastery evidence, and method observations do not transfer to another class by
default. A future Obsidian vault mirrors that boundary with a separate folder
per class.

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

Each stage produces durable data for the next stage. Generated lessons are saved
per class and can be reopened; each submitted response appends evidence to that
class profile. Generated material is an artifact, not a source of truth. A
lesson can use general knowledge when course materials are absent. Materials
remain optional for ordinary learning and can be selected later to ground
practice exams or other source-sensitive work.

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

### Confidence- and history-aware first stage (implemented)

The application records confidence and revealed-hint count with each attempt,
then supplies up to five recent attempts for the same class-local concept to
practice generation. Keep the first version explainable:

- Incorrect response: show targeted feedback, then offer another generated
  question on the same concept with a changed surface form or reasoning path.
- Correct with low confidence: affirm the result and offer a fresh check on the
  concept before suggesting a new concept.
- Correct with high confidence and no hints: show the next topic as an option;
  do not auto-advance or declare mastery from one attempt.
- Repeated miss or high hint use: offer a worked example or a clarifying side
  chat before another independent check.
- Repeating the exact question is an optional immediate check after feedback,
  not the default evidence for progress.

The current multiple-choice flow deterministically scores its validated key,
stores confidence and hint use, and requests new practice through
`generate-adaptive-practice` with the bounded recent attempt window. Exact
question retry remains a separate learner-controlled action. Use
`evaluate-learner-response` for short free-response reasoning that needs rubric
interpretation and `plan-remediation` for proposing the smallest next step
from recent evidence. Persistence and objective grading remain application
responsibilities; skills receive only the current concept's bounded evidence
window and do not diagnose stable learner traits from sparse data.

The Study page also shows class-scoped counts of scored checks by method. It
does not rank methods or change recommendations: topic mix and small samples
make raw rates uncertain. Later stages can identify recurring error patterns
across more attempts and let the learner tune how strongly history influences
recommendations. Observed habits must remain revisable, contextual signals
rather than fixed learning-style labels.

### Pattern review (implemented)

Deeper pattern analysis is a bounded review, not a continuously running learner
monitor. Its only planned triggers are an explicit `session-end` review and a
`user-request` review. It never runs after every answer, on a timer, or in the
background. The Study page exposes both triggers, and each saved attempt is
linked to the lesson session that produced it.

Each review receives one class ID, a bounded set of that class's attempt IDs,
and the prior pattern snapshot IDs needed for comparison. Proposals carry a
stable pattern key, kind, class-local concept links, provisional status,
confidence, supporting and counterexample attempt IDs, and a rationale for
any status change. Valid statuses are `emerging`, `reinforced`, `mixed`, and
`weakened`; a model cannot dismiss or delete a pattern. Sparse evidence can
yield `insufficient` or `limited` and no change. Review history should be
append-only in SQLite, with a current projection derived from accepted review
results and learner status overrides. The learner can inspect, correct the
status, or dismiss an observation. Reviews store trigger, supplied evidence,
result, model, and timestamp. They must match the class and exact bounded
attempt window before persistence.

This review currently evaluates recorded attempts; uploading a file does not
yet make lesson or question generation use its passages. Source-grounded study
generation remains a separate follow-up feature.

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

1. Begin directly with a topic; ask for a time budget only when it is useful.
2. Run one retrieval warm-up.
3. Select an objective from course priorities and evidence.
4. Teach only what is needed.
5. Work one guided example or ask a clarifying side-chat question.
6. Answer the knowledge check and record confidence.
7. Give immediate feedback.
8. Append the attempt and keep the lesson available for later.
9. Show transparent topic signals without calling one response mastery.
10. Use a later response to decide whether to continue, revisit, or try another topic.

## Implementation order

1. Source-passage and concept schemas
2. Reviewed syllabus-to-course-map proposal
3. Activity and artifact contracts
4. Attempt, saved lesson, and append-only evidence records
5. Diagnostic conversation state machine
6. Practice generation and solution validation
7. Explainable mastery projection
8. Review scheduler and training-plan revision
9. Data inspection, correction, export, and deletion

## Adaptation rollout

1. **Recent signals:** supply a bounded window of same-concept attempts
   (outcome, confidence, hints, method, timestamp) and offer a new question on
   that concept after a miss or low-confidence success. Keep exact-question
   repetition optional. Reuse `generate-adaptive-practice` for new items and
   `plan-remediation` when recent evidence points to a short explanation or
   worked example; keep objective scoring and persistence deterministic.
2. **Recurring patterns:** once enough evidence exists, identify repeated
   misconception candidates and compare outcomes by activity/method. Show the
   evidence and uncertainty behind each pattern.
3. **Learner control:** expose a simple preference for how strongly prior
   attempts influence recommendations, plus controls to correct or clear
   observations. Never convert these preferences into fixed learning-style
   labels.
