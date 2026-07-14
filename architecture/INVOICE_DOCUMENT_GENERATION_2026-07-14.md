# Invoice Document Generation — Canonical Write Path (M2 Write)

**Status:** Implemented  
**Datum:** 2026-07-14  
**ADR:** [INVOICE_GENERATED_DOCUMENT_RELATION_ADR_2026-07-14.md](./INVOICE_GENERATED_DOCUMENT_RELATION_ADR_2026-07-14.md)  
**Read path:** [INVOICE_DOCUMENT_READ_PATH_2026-07-14.md](./INVOICE_DOCUMENT_READ_PATH_2026-07-14.md)

---

## Summary

Invoice-linked PDFs (`BOOKING_INVOICE`, `FINAL_INVOICE`) now use `InvoiceDocumentGenerationService` as the single write orchestrator. Version reservation, PROCESSING state, storage, atomic activation, cache pointer sync, audit events, and persistent failure rows replace silent catches on the critical path.

## Flow (12 steps)

1. Load `OrgInvoice` with org scope + type/documentType validation
2. Advisory lock per `(org, invoice, documentType)` — parallel protection
3. Idempotent return if active stored version exists (`force=false`)
4. Reserve version: create `GeneratedDocument` with `generationStatus=PROCESSING`, `objectKey=__generation_pending__`, `isActiveVersion=false`
5. Render PDF via injected callback
6. Store bytes via `DocumentStoragePort`
7. Transaction: set `GENERATED` + `SUCCEEDED`, storage metadata, checksum
8. Deactivate prior active versions; void on `force` regenerate **only after** success
9. Update `OrgInvoice.generatedDocumentId` cache pointer
10. Activity log (`INVOICE` entity)
11. On failure: `FAILED` row with error code, safe message, attempt count, `nextRetryAt` when retryable — **prior active version unchanged**
12. `retryFailed(documentId)` creates new forced version for job retry

## Integration points

| Caller | Path |
|--------|------|
| `BookingDocumentBundleService.renderAndStore` | Routes invoice-linked types through generation service |
| `ensureBookingInvoice` / `generateFinalInvoiceAndDocument` | Pass `force` for regenerate |
| Wizard / booking create | Bundle service; invoice row creation errors logged (booking create) or thrown (bundle ensure) |

## Error codes

`RENDERER_ERROR`, `STORAGE_ERROR`, `DATABASE_ERROR` (retryable); `INTEGRITY_ERROR`, `INVOICE_NOT_FOUND`, `CONCURRENT_GENERATION`, `UNKNOWN_ERROR`.

## Not in scope

- Outbound email changes
- Manual `OUTGOING_MANUAL` PDF generation UI
- Async job worker (retry fields persisted; executor deferred)
- Non-invoice document types (deposit, contract, handover) — unchanged `createFromPdf` path

## Tests

`backend/src/modules/documents/invoice-document-generation.service.spec.ts`
