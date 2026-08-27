# Platform i18n — Rental Invoice Detail Header (P2.2.50)

**Date:** 2026-08-27
**Baseline:** `e0aa79d3135866eb9f890c2666165f15a1411c0b` (P2.2.49 merge)
**Campaign:** Rental
**Scope:** Invoice Detail Primary **Header** presentation only

## Provenance

- **Rejected:** PR #1337 (combined Header + Relations) — closed without merge
- **Split authority:** PR #1338 key-budget reassessment — Header first, Relations deferred to P2.2.51
- **Pre-flight:** PR #1335 target analysis
- **No ancestry** from #1337, #1338, #1335 implementation branches

## Boundary

| Path | Role |
|------|------|
| `rental/components/invoices/InvoiceDetailHeader.tsx` | Header chrome host |
| `rental/components/invoices/InvoiceHeaderMoreMenu.tsx` | More-actions menu |
| `rental/components/invoices/invoiceDetail.mapper.ts` | Header DTO projection (gate reasons, labels, formatters) |
| `rental/components/invoices/invoiceUtils.ts` | Locale-aware formatter delegation |
| `rental/lib/rental-invoice-detail-header-i18n.ts` | Header presentation adapter |
| `rental/components/invoices/InvoiceDetail.tsx` | Mechanical `locale` threading into mapper only |

**Excluded (P251 handoff):** `InvoiceRelations.tsx`, `InvoiceRelationRow.tsx`, `invoiceRelations.mapper.ts`, Secondary (P249), Payments, Line Items, Documents, Create/Send, Tenant Billing, backend/API.

## Locale flow

`useLanguage().locale` → `InvoiceDetail` (threading) → `buildInvoiceDetailDto({ locale })` → `rental-invoice-detail-header-i18n.ts` (`ridh`, gate reasons) + `invoice-list-i18n` (status/type/money/date).

## Keys

- **+26** EN+DE `rental.invoice.detail.header.*` (8760→8786)
- **Reused:** `invoices.list.status.*`, `invoices.list.type.*`, `invoices.list.col.total`, `invoices.list.sort.dueDate`, `invoices.create.field.invoiceDate`, `invoicePayment.summary.paid/outstanding`, `invoicePayment.action.record`, `common.edit`
- **Void/cancel fix:** `menu.voidInvoice` (Stornieren / Void invoice) — **not** `common.cancel`

## Frozen semantics

- Machine status/type IDs, tone, icons unchanged
- `totalCents`, `paidCents`, `outstandingCents ?? max(0, total - paid)`, `currency` unchanged
- Invoice number raw display (e.g. `RE-2026-00421`) unchanged
- Action eligibility, permissions, callbacks, PDF args unchanged
- OVERDUE remains machine/API status — no date derivation
- Tax/payment/financial calculation diff = 0

## Guardrails

`P250_ENFORCE_CLEAN_EXACT` — 5 paths, 0 findings.

## Tests

`rental-invoice-detail-header-localization.test.tsx` — EN/DE render, same-mount menu locale switch, statuses/types, money/outstanding, void terminology, gate reasons, callbacks.

**Category E:** 0

## Next slice

**P2.2.51** — Rental Invoice Relations Localization
