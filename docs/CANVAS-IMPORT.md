# Canvas Course Import

## Purpose

Canvas import discovers course materials through the Canvas API and saves
selected resources as local course materials. Imported files and text snapshots
use the same storage and extraction pipeline as manual uploads. Canvas remains
the source of truth; imports are explicit and do not run in the background.

## Connection

The local server reads `CANVAS_ACCESS_TOKEN` and `CANVAS_BASE_URL` from its
environment. `CANVAS_BASE_URL` is the HTTPS origin of the institution's Canvas
instance. The token must belong to that instance and is sent only to that
origin. Keep credentials in the ignored local `.env` file; never commit them.

This personal-token setup is for local use. A multiuser deployment should use
institution-approved OAuth. See the official
[Canvas authentication documentation](https://developerdocs.instructure.com/services/canvas/oauth2/file.oauth).

## Get or renew a token

1. Sign in to your institution's Canvas site.
2. Open **Account → Settings**.
3. Under **Approved Integrations**, choose **+ New Access Token** (the label
   may vary by institution).
4. Enter a purpose such as `Local Learning Studio`, set the expiration date
   required by your institution, and create the token.
5. Copy the token when Canvas displays it and save it as `CANVAS_ACCESS_TOKEN`
   in the local `.env` file. Treat it like a password; do not put it in source
   files, screenshots, or shared docs.

Canvas's user guide documents the **Account → Settings → Approved Integrations**
flow and token management: [Manage API access tokens](https://community.instructure.com/en/kb/articles/662901-how-do-i-manage-api-access-tokens-in-my-user-account).

If an old token stops working, check its status and expiration
in **Approved Integrations**, then update the local value.

## Import workflow

```text
course URL
  -> preview accessible resources
  -> select resources and a local destination
  -> download or snapshot selected content
  -> save source provenance and process materials
```

The preview discovers course details, syllabus, modules, files, pages, and
assignment instructions when available. It follows pagination, checks access,
and shows locked, unavailable, unsupported, and external resources. Quiz
questions, answers, submissions, grades, and external-provider content are not
retrieved. Solution-labeled resources start unchecked, but labels cannot detect
answers embedded in a document.

Supported original files are PDF, DOCX, PPTX, Markdown, and plain text. Syllabus,
page, and assignment HTML is saved as a deterministic Markdown text snapshot;
external embedded content is not crawled. Unsupported items remain visible in
the preview. See [Source Ingestion](SOURCE-INGESTION.md) for extraction formats,
states, and passage provenance. Image-only PPTX slides without native text are
not transcribed by Canvas import.

## Refresh and source history

Imports require an explicit selection. Unchanged resources reuse their saved
passages. A successfully processed revision becomes active and supersedes its
previous Canvas revision while preserving historical passages for citations.
A failed update preserves the last valid source. Manual materials remain
independent. Refresh does not propagate remote deletions or run on a schedule.

Import progress and per-resource results are persisted locally. The browser can
reopen a job after reload using its job ID; credentials are not stored in the
browser. Interrupted jobs are reported and can be retried through a new preview.

## API

| Method | Route | Purpose |
| --- | --- | --- |
| GET | `/api/canvas/status` | Report connection status without credentials |
| POST | `/api/canvas/preview` | Discover a course and build a resource preview |
| POST | `/api/canvas/imports` | Start selected imports into a local course |
| GET | `/api/canvas/imports/:jobId` | Read persisted progress and results |

Course and resource metadata retain their Canvas source URLs. Mutating routes
validate the request origin. The API token is confined to the configured
institution origin; redirects, private network destinations, and oversized
responses are rejected.

## Verification

Integration tests use synthetic credentials and network fixtures. They cover
pagination, partial access, resource deduplication, downloads, text snapshots,
unchanged and revised sources, failed updates, persisted jobs, invalid targets,
redirects, and private network destinations. Live access depends on the
configured account's permissions and may not expose every course resource.
