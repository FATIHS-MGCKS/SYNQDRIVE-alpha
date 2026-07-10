# Document Extraction Lifecycle API (V4.9.329)

## Goal

Backend is the single source of truth for upload history and status — browser reload can reconstruct all document extraction state without client-side React state.

## Endpoints

### Organization (inbox / recent uploads)

| Method | Route | Permission |
|--------|-------|------------|
| GET | `/organizations/:orgId/document-extractions` | `document-upload.read` |
| GET | `/organizations/:orgId/document-extractions/:id` | `document-upload.read` |
| GET | `/organizations/:orgId/document-extractions/:id/download` | `document-upload.read` |

Query: `page`, `limit` (max 50), `vehicleId`, `status`, `documentType`, `createdFrom`, `createdTo`, `createdBy`.

Response: `{ data: PublicDocumentExtractionSummaryDto[], meta: { total, page, limit, totalPages } }`

### Vehicle (existing surface, extended)

| Method | Route | Permission |
|--------|-------|------------|
| GET | `/vehicles/:vehicleId/document-extractions` | `document-upload.read` |
| GET | `/vehicles/:vehicleId/document-extractions/:id` | `document-upload.read` |
| GET | `/vehicles/:vehicleId/document-extractions/:id/download` | `document-upload.read` |
| POST | `.../upload` | `document-upload.write` |
| POST | `.../:id/document-type` | `document-upload.write` |
| POST | `.../:id/retry` | `document-upload.write` |
| POST | `.../:id/confirm` | `document-upload.write` |
| POST | `.../:id/cancel` | `document-upload.write` |
| DELETE | `.../:id/file` | `document-upload.write` |

Guards: `OrgScopingGuard` (org routes) / `VehicleOwnershipGuard` (vehicle routes) + `PermissionsGuard`.

## Public DTO

- Full detail: `PublicDocumentExtractionDto` — includes `vehicle`, `allowedActions`, `audit`, extraction/plausibility payloads
- List: `PublicDocumentExtractionSummaryDto` — omits heavy `extractedData` / `confirmedData` / `plausibility`
- Never exposed: `objectKey`, `sourceFileUrl`, `storageProvider`, `_pipeline` OCR cache

## Download

Authenticated streaming via `DocumentStoragePort.getObjectStream` (no presigned URLs — local storage provider). `Cache-Control: no-store`, sanitized `Content-Disposition`. Deleted binary → 404.

## Audit

DB columns: `confirmedById`, `appliedById`, `cancelledById`, `fileDeletedById`, `fileDeletedAt` (+ existing `createdById`).

JSON trail in `plausibility._pipeline`: `documentTypeAudit`, `actionAudit` (stripped from public plausibility; exposed via `audit` object).

## Indexes

- `(organizationId, createdAt)`
- `(vehicleId, createdAt)`
- `(status, updatedAt)`
