# Source Ingestion

## Purpose

Source ingestion converts an immutable course upload into small, traceable
passages that later learning workflows can retrieve. Extracted passages are
source evidence. They are never model-generated content and never learner
evidence.

## Processing contract

```text
upload
  -> immutable file stored under its course
  -> material record created
  -> supported extractor selected
  -> passages stored in one transaction
  -> material marked ready
```

Every upload has one explicit state:

- `stored`: the original is safe, but no extractor exists for its format.
- `processing`: extraction has started and has not committed a result.
- `ready`: all extracted passages committed successfully.
- `failed`: extraction failed; the original remains available and the material
  carries a user-visible reason.

Extraction replaces all passages for a material in one transaction. A failure
clears partial passages and cannot appear as a successful import.
If the service restarts while a material is `processing`, startup marks it
`failed` with an interruption reason instead of leaving an indefinite state.

## Supported formats

| Format | Upload | Extraction | Provenance |
|---|---:|---:|---|
| Markdown (`.md`) | Yes | Yes | heading and line range |
| Plain text (`.txt`) | Yes | Yes | line range |
| Text PDF (`.pdf`) | Yes | Yes | page number |
| Word (`.docx`) | Yes | Yes | paragraph range and active heading |
| PowerPoint (`.pptx`) | Yes | Yes | slide number and first text title |
| Scanned/image PDF | Yes | Not yet | material becomes `failed`; OCR required |
| Common images (`.jpg`, `.jpeg`, `.png`, `.heic`) | Planned | Not yet | OCR region and confidence |

The format matrix is intentionally explicit. The service does not invent text
or silently report success when a document has no selectable content.

## Passage model

Each passage stores:

- the owning `course_id` and `material_id`;
- a stable course-material order;
- normalized source text;
- a SHA-256 content hash;
- a validated JSON locator with a page, line, paragraph, or slide range and
  optional heading/title context;
- its extraction timestamp.

The raw file remains authoritative. Passage hashes make later generation inputs
auditable and allow future reprocessing to identify changed source evidence.

Long paragraphs, PDF pages, Word sections, and slides are divided into bounded
passages. A split never changes the source locator: every resulting passage
retains the source range from which it came.

## Office extraction

DOCX and PPTX use one deterministic OOXML path:

1. Read the ZIP package locally.
2. Decompress only `word/document.xml` or slide XML files, excluding embedded
   media and unrelated package parts.
3. Enforce a bounded extracted-XML size.
4. Parse XML in document order.
5. Normalize Word paragraphs or PowerPoint slide text into canonical passages.
6. Persist validated paragraph/slide provenance in the same transaction used by
   other extractors.

Word heading styles become passage heading context. PowerPoint uses the first
non-empty text element as the slide title while retaining all slide text in the
passage. Speaker notes, diagrams without text, and image-only slides require a
future explicit extractor; they are not silently interpreted.

## Retrieval boundary

Passages are available only through a course-scoped route:

```text
GET /api/courses/:courseId/materials/:materialId/passages?offset=0&limit=100
```

The route returns `404` if the material does not belong to that course.
Responses include a total count and accept a bounded limit of at most 200, so a
large source never requires one unbounded API response.
Downstream generation contracts cite both `materialId` and `passageId`; they
must never retrieve passages from another class.

## Next extractors

OCR should be a separate, explicit operation because it changes the quality and
confidence properties of the extracted evidence.

Audio and video transcription are explicitly deferred beyond the first MVP.
The extractor registry should remain extensible without claiming arbitrary
binary files were successfully understood.
