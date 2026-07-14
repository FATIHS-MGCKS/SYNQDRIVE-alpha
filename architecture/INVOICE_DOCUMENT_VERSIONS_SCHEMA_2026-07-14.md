# Invoice Document Versions — Schema Extension (M0 Schema Phase)

**Status:** Implemented (schema only — no business-logic changes)  
**Datum:** 2026-07-14  
**ADR:** [INVOICE_GENERATED_DOCUMENT_RELATION_ADR_2026-07-14.md](./INVOICE_GENERATED_DOCUMENT_RELATION_ADR_2026-07-14.md)  
**Migration:** `backend/prisma/migrations/20260714200000_invoice_document_versions/`

---

## Summary

Additive Prisma/PostgreSQL extension so `OrgInvoice` can own multiple traceable `GeneratedDocument` versions with persistent generation state. Legacy `OrgInvoice.generatedDocumentId` is preserved and gains an optional FK relation (cache pointer per ADR hybrid A+C).

## Model changes

### `OrgInvoice`

| Addition | Purpose |
|----------|---------|
| `activeGeneratedDocument` relation | FK on existing `generatedDocumentId` → `GeneratedDocument` (ON DELETE SET NULL) |
| `generatedDocuments` collection | Reverse relation via `GeneratedDocument.invoiceId` |
| `@@index([generatedDocumentId])` | Cache pointer lookups |

### `GeneratedDocument`

| Field | Type | Default | Purpose |
|-------|------|---------|---------|
| `invoice` | relation | — | FK `invoiceId` → `OrgInvoice` (ON DELETE SET NULL) |
| `versionNumber` | `Int?` | null | Monotonic version per invoice + documentType |
| `isActiveVersion` | `Boolean` | false | Denormalized active flag (partial unique in DB) |
| `generationStatus` | `String?` | null | Pipeline state (`DOCUMENT_GENERATION_STATUS`) |
| `generationErrorCode` | `String?` | null | Error class / code |
| `lastErrorMessage` | `String?` | null | Last failure message |
| `generationAttemptCount` | `Int` | 0 | Attempt counter |
| `lastGenerationAttemptAt` | `DateTime?` | null | Last attempt timestamp |
| `nextRetryAt` | `DateTime?` | null | Scheduled retry |

Existing fields retained: `status` (document lifecycle), `generatedByUserId` (creator/trigger).

## Constraints & indexes

| Artifact | Enforcement |
|----------|-------------|
| `generated_documents_invoice_id_fkey` | `invoice_id` → `org_invoices(id)` ON DELETE SET NULL |
| `org_invoices_generated_document_id_fkey` | `generated_document_id` → `generated_documents(id)` ON DELETE SET NULL |
| `generated_documents_invoice_type_version_key` | Partial unique: no duplicate `(org, invoice, type, version)` when version set |
| `generated_documents_one_active_per_invoice_type_key` | Partial unique: one `is_active_version = true` per invoice + type |
| Composite query indexes | `(org, invoice, type, status)`, active flag, createdAt, generation retry |

**Org safety:** No composite `(organization_id, invoice_id)` FK — would break ON DELETE SET NULL with required `organization_id`. Tenant validation remains application-level (ADR M1).

## Read path (M1 — implemented)

- [INVOICE_DOCUMENT_READ_PATH_2026-07-14.md](./INVOICE_DOCUMENT_READ_PATH_2026-07-14.md)
- `InvoiceDocumentsReadService` + `InvoicesService.findById` / `findByOrg`
- Canonical load via `invoiceId`; legacy `generatedDocumentId` as validated fallback

## Not in this phase

- Backfill `versionNumber`, `isActiveVersion`, `OrgInvoice.generatedDocumentId` (ADR M2) — tool exists, not auto-run
- `createFromPdf` / `voidDocument` cache sync (ADR M2–M3)
- `FAILED` generation rows on render errors (ADR M5)
- Frontend invoice detail UI

## Diagnostic tool (read-only)

- `backend/scripts/ops/audit-invoice-documents.ts`
- `docs/audit/invoice-document-integrity-audit-2026-07-14.md`
- Run before M2 backfill to baseline inconsistencies per organization.

## Controlled backfill (M2)

- `backend/scripts/ops/backfill-invoice-documents.ts`
- `docs/audit/invoice-document-backfill-2026-07-14.md`
- Dry-run default; `--apply --confirm` for writes. Not for production without audit review.

## Legacy dependencies

- `BookingDocumentBundle.*DocumentId` — booking-scoped pointers unchanged
- `OutboundEmailAttachment.generatedDocumentId` — existing FK unchanged
- `RentalContract.generatedDocumentId`, `BookingDeposit.receiptDocumentId` — unchanged
- Scalar `bookingId` / `customerId` on `GeneratedDocument` — still index-only (no FK)
