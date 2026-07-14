# Invoice–Document Link Legacy Audit (V4.9.467)

**Date:** 2026-07-14  
**Scope:** Repository-wide audit after invoice document panel + list read-model migration.  
**Policy:** Read-new / write-both; no destructive schema or data changes in this release.

## Canonical model (target)

| Layer | Field / relation | Role |
|-------|------------------|------|
| `OrgInvoice` | `generatedDocumentId` | Active PDF pointer (outgoing invoices) |
| `GeneratedDocument` | `invoiceId` | Canonical FK from document → invoice |
| `BookingDocumentBundle` | `bookingInvoiceDocumentId`, `finalInvoiceDocumentId` | Booking bundle anchors (still required for booking doc lifecycle) |
| `OutboundEmail` | `invoiceId` + attachment `generatedDocumentId` | Invoice send history (V4.9.460+) |

`activeGeneratedDocumentId` **does not exist** in schema or code — renaming deferred until backfill proves redundant naming.

## Usage classification

### Aktiv benötigt

| Symbol / path | Location | Notes |
|---------------|----------|-------|
| `OrgInvoice.generatedDocumentId` | Prisma, `invoice-documents.service`, list read-model, detail DTO | Active pointer; writes via `linkInvoiceToDocument` |
| `GeneratedDocument.invoiceId` | `generated-documents.service`, bundle `renderAndStore`, standalone PDF | Canonical read path in `listForInvoice` OR[0] |
| `activeDocumentId` (DTO) | `invoice-list-item.mapper` | API alias of `generatedDocumentId` for list UI |
| Bundle pointers | `booking-document-bundle.service` `BUNDLE_FIELD` | Booking invoice / final invoice generation |
| `POST …/documents/send-email` | `InvoiceDocumentEmailService` | Primary outbound invoice mail (`INVOICE_SINGLE`) |
| `GET …/documents` panel | `InvoiceDocumentsService` | Detail documents UI |
| `resolveInvoiceSourceType` / `buildInvoiceProvenance` | List + relations mappers | Business provenance from `type` + `documentExtractionId` — **intentional**, not legacy |
| `recordPayment` | `invoices.service` | Canonical payment write path |
| Legacy `GET /invoices` | `InvoicesService.findAll` | Dashboard / Financial Insights only |

### Legacy-Fallback (read-both)

| Symbol / path | Location | Fallback behaviour | Remove when |
|---------------|----------|-------------------|-------------|
| `listForInvoice(…, legacyDocumentId)` | `generated-documents.service` | OR on `id = generatedDocumentId` | All pointers valid + `invoiceId` backfilled |
| `listForInvoice` booking OR | same | `bookingId` + `BOOKING_INVOICE`/`FINAL_INVOICE` | All booking docs have `invoiceId` + pointer set |
| `invoice.generatedDocumentId` in detail | `invoiceDetail.mapper`, `InvoiceDetail.tsx` | Header gate when panel not loaded | Panel always loaded first (already default) |
| `Invoice` type on detail | `invoiceTypes.ts` | Full legacy DTO for detail sub-panels | Future detail read-model (not this release) |

### Ungenutzt (removed in V4.9.467)

| Symbol / path | Action |
|---------------|--------|
| `invoiceListItem.mapper.ts` | **Removed** — list UI uses `InvoiceListItem` directly since V4.9.466 |
| `invoiceListItem.mapper.test.ts` | **Removed** with mapper |

### Gefährlich (do not auto-repair)

| Risk | Mitigation |
|------|------------|
| Cross-tenant bundle/doc mismatch | Audit script flags `BUNDLE_BOOKING_MISMATCH`; no repair script |
| Dropping `generatedDocumentId` before backfill | Would break list filters (`documentStatus=MISSING`) and active doc resolution |
| Removing booking mail flow | `BookingDocumentEmailService` still serves **booking document bundles**, not invoice panel |
| `markPaid` without `recordPayment` audit | `markPaid` delegates to `recordPayment` — keep until payments UI is sole entry |

### Noch von Migration abhängig

| Item | Blocker | Next step |
|------|---------|-----------|
| Remove `listForInvoice` legacy OR branches | Prod backfill of `GeneratedDocument.invoiceId` + pointer consistency | Run `audit-invoice-document-links.ts` per org on staging/prod clone |
| Deprecate `POST …/mark-sent` | External-send workflow still exposed in detail header | Mark deprecated; hide when `sendEmail` capability available (future) |
| Rename `generatedDocumentId` → `activeGeneratedDocumentId` | Prisma migration + dual-read period | Defer — no naming benefit until fallbacks removed |
| Remove `generatedDocumentId` column | Steps 1–7 below all green | Phase-2 release only |

## Seven removal gates (checklist)

1. **Backfill complete** — `audit-invoice-document-links.ts` → `removalReadiness.backfillComplete === true`
2. **Dry-run clean** — no `critical` findings
3. **Reads use new relation** — `listForInvoice` primary path = `invoiceId` (fallback only for flagged rows)
4. **Writes set both** — `createFromPdf` + `linkInvoiceToDocument` set `invoiceId` and `generatedDocumentId`
5. **Tests green** — invoice module + document tests
6. **Prod migration plan** — per-org audit → optional backfill script (not yet implemented)
7. **Rollback** — keep legacy OR reads until phase-2; DB column retained

## Dry-run tooling

```bash
cd backend && npx ts-node -r tsconfig-paths/register scripts/ops/audit-invoice-document-links.ts --org <ORG_UUID>
```

Read-only JSON report; exit `1` if critical inconsistencies.

## Actions taken in V4.9.467

| Action | Status |
|--------|--------|
| Add `audit-invoice-document-links.ts` | Done |
| Remove dead `invoiceListItem.mapper` | Done |
| `@deprecated` JSDoc on `mark-sent`, `mark-paid`, `listForInvoice` legacy params | Done |
| Remove `generatedDocumentId` / bundle pointers | **Deferred** |
| Rename to `activeGeneratedDocumentId` | **Deferred** |
| Remove booking document email service | **Deferred** (separate product surface) |

## Rollback strategy

- Code: revert deprecation comments only — no schema change in this release.
- Data: no mutations; historical `OutboundEmail` and `GeneratedDocument` rows untouched.
- Phase-2: if fallback removal causes regressions, re-enable OR branches in `listForInvoice` (single function).
