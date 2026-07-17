# Document Extraction Archive Read Model (V4.9.652)

**Date:** 2026-07-17  
**Prompt:** 77/84 — Canonical org-wide document archive inbox

## Scope

| Module | Role |
|--------|------|
| `DocumentExtractionArchiveIndex` (Prisma) | Denormalized tenant-scoped query index (1:1 with `VehicleDocumentExtraction`) |
| `document-extraction-archive-index.materializer.ts` | Builds index row + controlled `searchText` (no raw OCR) |
| `document-extraction-archive-index.service.ts` | Upsert + lazy org backfill |
| `document-extraction-archive-query.util.ts` | Filter builder + pagination |
| `document-extraction-archive.mapper.ts` | Public archive list DTO + `canDownload` |
| `GET /organizations/:orgId/document-extractions/archive` | Canonical archive read API |

## Filters (all tenant-scoped via `organizationId`)

| Query param | Index column |
|-------------|--------------|
| `status` | `status` |
| `documentCategory` | `documentCategory` |
| `documentSubtype` | `documentSubtype` |
| `vehicleId` | `vehicleId` |
| `bookingId` | `bookingId` |
| `customerId` | `customerId` |
| `driverId` | `driverId` |
| `vendorId` | `vendorId` |
| `uploadedBy` | `createdById` |
| `uploadedFrom` / `uploadedTo` | `uploadedAt` |
| `fileName` | `sourceFileName` (contains, case-insensitive) |
| `invoiceNumber` | `invoiceNumber` |
| `caseReference` | `caseReference` |
| `actionStatus` | `actionStatus` |
| `followUpStatus` | `followUpStatus` |
| `q` | `searchText` (controlled metadata only) |

## Response fields

- Document identity + taxonomy (`documentCategory`, `documentSubtype`, `effectiveDocumentType`)
- `status`
- `acceptedEntityLinks` (confirmed links only)
- `actionSummary` / `followUpSummary`
- `uploader`, timestamps (`uploadedAt`, `appliedAt`, `updatedAt`, `documentDate`)
- `canDownload` (malware scan + lifecycle action gate)

## Rules

1. **Pagination** — `page` (default 1), `limit` (default 20, max 50).
2. **Tenant scope** — every query includes `organizationId` from route; `OrgScopingGuard` + `document-upload.read`.
3. **No raw OCR in fulltext** — `searchText` excludes `rawText`, `ocrText`, `pageText`, IBAN, VIN, plate, tax/id numbers.
4. **Indices** — btree on org + filter columns; GIN `pg_trgm` on `search_text`.
5. **Lazy backfill** — list endpoint indexes up to 25 unindexed org rows per request.

## Index sync lifecycle

Archive index upsert after:

- Processor reaches `READY_FOR_REVIEW`
- `saveReview` / action-plan preferences
- Entity link updates
- Confirm / apply / retry-failed-actions
- Follow-up accept / dismiss

## Tests

- `document-extraction-archive-index.materializer.spec.ts`
- `document-extraction-archive-query.util.spec.ts`
- `document-extraction-archive-index.service.spec.ts`
- `document-extraction-archive.perf.spec.ts`
