# Document Invoice Apply Executor (V4.9.613)

**Date:** 2026-07-17  
**Prompt:** 38/84 — Migrate Invoice Apply to DocumentActionExecutor

## Scope

| Module | Role |
|--------|------|
| `document-invoice-extraction.rules.ts` | Invoice apply gate, line-item builder, `buildInvoiceApplyPayload()` |
| `document-action-planner.invoice-rules.ts` | `assessFinancePlan()` — `CREATE_INVOICE_DRAFT` / `CREATE_CREDIT_NOTE_DRAFT` |
| `executors/create-invoice-document-action.executor.ts` | Incoming invoice + credit note draft executors |
| `invoices.service.ts` | `createFromDocumentExtraction()` — idempotent create + payment task sync |
| Prisma `OrgInvoice.documentExtractionId` | Tenant-unique extraction linkage |

## Rules

1. **Idempotent by extraction** — unique `(organizationId, documentExtractionId)`; retry returns existing invoice.
2. **Vendor + invoice number duplicate check** — blocks apply when same vendor invoice number exists (different extraction).
3. **No blanket 19%** — line items and tax groups built from explicit `lineItems` / `taxLines` / resolved rates only.
4. **Credit notes** — negative totals stored; `CREATE_CREDIT_NOTE_DRAFT` action for credit-note profiles.
5. **Draft for unclear semantics** — `DRAFT` status when amount/tax semantics unclear; `NEEDS_REVIEW` when gate passes.
6. **Result entity ID** — invoice actions store `resultEntityId = invoice.id` on execution record.
7. **Payment task sync** — `InvoicePaymentTaskService.syncPaymentCheckTask` for non-draft incoming invoices on create/retry.
8. **No backfill** — existing invoices without `documentExtractionId` remain unchanged.

## Confirm / apply wiring

- `INVOICE` documents route through `DocumentActionOrchestratorService`.
- Legacy `DocumentExtractionApplyService.applyInvoice()` removed.

## Tests

- `document-invoice-extraction.rules.spec.ts` — tax scenarios + `buildInvoiceApplyPayload`
- `document-action-planner.invoice-rules.spec.ts` — `assessFinancePlan` + duplicate block
- `invoices.service.spec.ts` — retry, parallel race, duplicate vendor number, credit note totals
- `executors/create-invoice-document-action.executor.spec.ts` — executor success, draft, retry, duplicate
