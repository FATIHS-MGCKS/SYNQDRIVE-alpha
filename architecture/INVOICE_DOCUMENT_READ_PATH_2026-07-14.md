# Invoice Document Read Path — Canonical Relations (M1 Read)

**Status:** Implemented (backend read only)  
**Datum:** 2026-07-14  
**ADR:** [INVOICE_GENERATED_DOCUMENT_RELATION_ADR_2026-07-14.md](./INVOICE_GENERATED_DOCUMENT_RELATION_ADR_2026-07-14.md)  
**Schema:** [INVOICE_DOCUMENT_VERSIONS_SCHEMA_2026-07-14.md](./INVOICE_DOCUMENT_VERSIONS_SCHEMA_2026-07-14.md)

---

## Summary

Backend read access for invoice PDFs now resolves documents via the canonical `GeneratedDocument.invoiceId` relation (ADR hybrid **C**), with `OrgInvoice.generatedDocumentId` as a validated legacy cache fallback (**A**). No write-path or frontend changes in this phase.

## Components

| Module | Role |
|--------|------|
| `InvoiceDocumentsReadService` | Single/batch Prisma queries; builds `InvoiceDocumentsViewDto` |
| `invoice-document-read.util.ts` | Active resolution, lifecycle mapping, integrity filter, sort |
| `invoice-document-read.types.ts` | `InvoiceDocumentSummaryDto`, read options |
| `InvoicesService.findById` | Detail: `documents[]`, `activeDocumentId`, `documentCacheMismatch` |
| `InvoicesService.findByOrg` | List: canonical `generatedDocumentId` + `activeDocumentId` (no full `documents` array) |

## Active document resolution (ADR C + A)

1. Load all `GeneratedDocument` rows for `organizationId` + (`invoiceId` OR legacy `generatedDocumentId`).
2. Filter integrity: same org; `invoiceId` null or matches invoice; exclude cross-org rows.
3. Filter by expected `documentType` for `OrgInvoice.type`.
4. Among non-VOID/non-FAILED statuses:
   - Prefer exactly one `isActiveVersion = true`.
   - Else newest by `versionNumber` desc, then `createdAt` desc.
5. If still empty: validate legacy cache pointer (`generatedDocumentId`) — type match, active status, storage key present, invoice link compatible.

`generatedDocumentId` in API responses is set to `activeDocumentId ?? legacy cache` for backward compatibility.

## Document lifecycle labels

| `lifecycle` | Meaning |
|-------------|---------|
| `ACTIVE` | Resolved active version |
| `REPLACED` | Superseded non-void row |
| `FAILED` | `status=FAILED` or `generationStatus=FAILED` |
| `VOIDED` | `status=VOID` |
| `GENERATING` | Pending/processing generation or draft without storage |

Documents are ordered by `versionNumber` asc, then `createdAt` asc.

## API additions (`GET .../invoices/:id`)

Additive fields on invoice detail (existing fields unchanged):

- `activeDocumentId`
- `documentCacheMismatch` (cache ≠ canonical active)
- `documents[]` — summaries with authorized `downloadPath` only (no raw storage URLs)
- `lastError` omitted unless `includeInternalErrors` (internal use)

List endpoint adds `activeDocumentId`; `generatedDocumentId` now reflects canonical resolution.

## Performance

- Detail: one `GeneratedDocument.findMany` per invoice.
- List: one batch query per org via `getDocumentsForInvoicesBatch`.
- No N+1 per invoice row.

## Tests

- `invoice-document-read.util.spec.ts`
- `invoice-documents-read.service.spec.ts`
- `invoice-document-link.baseline.spec.ts` (canonical resolution)
- `invoices.service.baseline.spec.ts` (mocked read service)

## Not in this phase

- PDF generation / cache write sync
- Frontend invoice detail UI
- Outbound email invoice endpoint
- Removing `OrgInvoice.generatedDocumentId` column
