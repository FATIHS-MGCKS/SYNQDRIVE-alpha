# Document Intake Three-Tab Hub (V4.9.653)

**Date:** 2026-07-17  
**Prompt:** 78/84 — Structured document page: Upload · To review · Archive

## UX structure

| Tab | URL `documentTab` | Purpose |
|-----|-------------------|---------|
| **Hochladen** | `upload` | Canonical `useDocumentUploadPage` / `useDocumentIntakeFlow` upload + inline review when active |
| **Zu prüfen** | `review` | Org review inbox from archive read model + detail drill-in |
| **Archiv** | `archive` | Paginated archive list with filters, search, audit trail summary |

## URL state (source of truth)

Query params via `document-intake-navigation.ts`:

- `documentTab` — `upload` \| `review` \| `archive` (default `upload`)
- `extractionId` — opens review detail for a specific extraction
- `archiveQ` — persisted archive search text

No local React tab history as canonical navigation; `popstate` syncs shell.

## Review inbox reasons

Client classification in `document-review-inbox.util.ts` over `PublicDocumentExtractionArchiveItem`:

| Reason | Trigger |
|--------|---------|
| `unclear_type` | `AWAITING_DOCUMENT_TYPE` |
| `entity_assignment_open` | open entity resolution |
| `required_fields_missing` | schema missing required fields (detail record) |
| `plausibility_conflict` | plausibility BLOCKER/WARNING |
| `action_preview_open` | action plan not confirmed / preview pending |
| `apply_failed` | failed or partial apply |
| `follow_up_open` | open follow-up suggestions |

`useDocumentReviewInbox` scans paginated `listArchiveByOrg` and filters review candidates.

## Archive tab

`useDocumentArchiveList` → `GET /organizations/:orgId/document-extractions/archive`

- Filters: status, follow-up status, controlled fulltext (`q` / `archiveQ`)
- Row: status, links, action/follow-up summaries, download, **audit trail** (`buildDocumentArchiveAuditTrail`)
- Pagination + empty states + dark/light + i18n (`docUpload.tab.*`, `docUpload.review.*`, `docUpload.archive.*`)

## Removed / deprecated

- Right-sidebar “Letzte Uploads” as primary navigation on `DocumentUploadView` (replaced by review + archive tabs)

## Frontend tests

- `document-intake-navigation.test.ts`
- `document-review-inbox.util.test.ts`
- `document-archive-audit.util.test.ts`
- `document-upload-page.test.tsx` (three-tab shell)
- `document-upload-ui-coverage.test.ts` (source guards)
