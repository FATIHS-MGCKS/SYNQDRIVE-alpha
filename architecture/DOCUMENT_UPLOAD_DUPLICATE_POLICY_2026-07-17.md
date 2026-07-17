# Document Upload Duplicate Policy (V4.9.620)

**Date:** 2026-07-17  
**Prompt:** 45/84 — Business upload duplicate policy

## Status values

| Status | Meaning |
|--------|---------|
| `UNIQUE` | First org-scoped content anchor for this SHA-256 |
| `EXACT_DUPLICATE` | Detected via content hash (surfaced when blocked) |
| `POSSIBLE_BUSINESS_DUPLICATE` | Invoice/reference hint matches existing org extraction |
| `REUPLOAD_ALLOWED` | Authorized re-upload with `reuploadReason` (≥3 chars) |
| `DUPLICATE_BLOCKED` | Upload rejected; existing extraction returned |

## Pipeline

1. Identify + hash (Prompt 44)
2. `DocumentUploadDuplicateService.assess` — org-scoped exact + business hints
3. If `DUPLICATE_BLOCKED` → HTTP 409, no storage/queue
4. Create extraction record (`uploadDuplicateStatus`, `relatedExtractionId`, `reuploadReason`)
5. If `UNIQUE` → claim `document_extraction_content_anchors` unique `(organizationId, contentSha256)`
6. On anchor conflict (parallel upload) → delete draft row, return 409
7. Storage → queue

## Business duplicate hints (upload multipart)

- `invoiceNumberHint`
- `referenceNumberHint` (Aktenzeichen / report number)
- Org-scoped scan of active extractions' `confirmedData` / `extractedData`

## Re-upload authorization

- `reuploadReason` (min 3 chars)
- optional `relatedExtractionId`
- New record references existing via `relatedExtractionId`
- No auto-delete of canonical document

## Parallel upload safety

`DocumentExtractionContentAnchor` unique constraint on `(organizationId, contentSha256)` — first writer wins.

## API / UI

- Public DTO: `uploadDuplicateStatus`, `relatedExtractionId`, `reuploadReason`, `uploadDuplicate`
- 409 `DOCUMENT_UPLOAD_DUPLICATE_BLOCKED` with `existingExtraction` + `entityLinks`
- Frontend: `DocumentUploadDuplicatePanel`, authorized re-upload flow, business-duplicate warning banner

## Tests

- `document-upload-duplicate.service.spec.ts`
- `document-upload-duplicate.util.spec.ts`
- `document-extraction-upload-duplicate.spec.ts`
- `frontend/src/lib/document-upload-duplicate.test.ts`
- `frontend/src/rental/lib/document-upload-duplicate-flow.test.ts`
