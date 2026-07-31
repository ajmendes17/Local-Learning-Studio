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
| Word (`.docx`) | Yes | Not yet | material remains `stored` |
| PowerPoint (`.pptx`) | Yes | Not yet | material remains `stored` |
| Scanned/image PDF | Yes | Not yet | material becomes `failed`; OCR required |

The format matrix is intentionally explicit. The service does not invent text
or silently report success when a document has no selectable content.

## Passage model

Each passage stores:

- the owning `course_id` and `material_id`;
- a stable course-material order;
- normalized source text;
- a SHA-256 content hash;
- either a page range or a line range with an optional Markdown heading;
- its extraction timestamp.

The raw file remains authoritative. Passage hashes make later generation inputs
auditable and allow future reprocessing to identify changed source evidence.

Long paragraphs and PDF pages are divided into bounded passages. A split never
changes the source locator: every resulting passage retains the page or line
range from which it came.

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

DOCX and PPTX extraction should follow the same interface and provenance
contract. OCR should be a separate, explicit operation because it changes the
quality and confidence properties of the extracted evidence.
