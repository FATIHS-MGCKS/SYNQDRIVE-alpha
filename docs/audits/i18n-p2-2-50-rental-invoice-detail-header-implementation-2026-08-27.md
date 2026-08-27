# P2.2.50 — Rental Invoice Detail Primary Header Localization — Implementation Audit

**Date:** 2026-08-27
**Baseline:** `e0aa79d3135866eb9f890c2666165f15a1411c0b`
**Branch:** `cursor/p2250-rental-invoice-detail-primary-header-i18n-3c10`

## Provenance

| Check | Result |
|-------|--------|
| merge-base = baseline | YES |
| rev-list count from baseline | 0 at branch creation |
| #1337 ancestry | NO |
| #1338 ancestry | NO |
| #1335 ancestry | NO |
| Clean reimplementation | YES |

## Scope

### In scope (Header only)

- `InvoiceDetailHeader.tsx`
- `InvoiceHeaderMoreMenu.tsx`
- `invoiceDetail.mapper.ts` (presentation hunks A/B/C only)
- `invoiceUtils.ts` (locale formatter delegation)
- `rental-invoice-detail-header-i18n.ts`
- `InvoiceDetail.tsx` — mechanical `locale` threading

### Out of scope (frozen)

- Relations (`InvoiceRelations.tsx`, `InvoiceRelationRow.tsx`, `invoiceRelations.mapper.ts`) — **DIFF = ZERO**
- P249 Secondary — unchanged
- Payments, Line Items, Documents, Create/Send, Tenant Billing — unchanged

## Key budget (#1338 split)

| Metric | Value |
|--------|-------|
| Target | ≤26 |
| Actual new keys | 26 |
| Namespace | `rental.invoice.detail.header.*` |
| Rejected #1337 namespace | `rental.invoice.detail.primary.*` — not used |
| Dead key `fallback.legacy` | NOT copied |

### New keys (26)

- 1 action: `action.viewPdf`
- 5 menu: `menu.more`, `menu.issue`, `menu.regeneratePdf`, `menu.markSentExternally`, `menu.voidInvoice`
- 20 gate: `gate.*`

### Reused keys

- `invoices.list.status.*` / `invoices.list.type.*`
- `invoices.list.col.total`, `invoices.list.sort.dueDate`, `invoices.create.field.invoiceDate`
- `invoicePayment.summary.paid`, `invoicePayment.summary.outstanding`, `invoicePayment.action.record`
- `common.edit`

## Void/cancel terminology correction

#1337 incorrectly used `common.cancel` (Abbrechen) for invoice void.

**Fix:** `rental.invoice.detail.header.menu.voidInvoice` — DE: **Stornieren**, EN: **Void invoice**.

## Semantic certifications

| Domain | Diff |
|--------|------|
| Financial calculation | ZERO |
| Raw money | ZERO |
| Currency | ZERO |
| Rounding | ZERO |
| Tax | ZERO |
| Payment | ZERO |
| Status/type machine IDs | ZERO |
| Action eligibility | ZERO |
| Callbacks/args | ZERO |
| Category E | 0 |

## P250 enforce-clean boundary

```
rental/components/invoices/InvoiceDetailHeader.tsx
rental/components/invoices/InvoiceHeaderMoreMenu.tsx
rental/components/invoices/invoiceDetail.mapper.ts
rental/components/invoices/invoiceUtils.ts
rental/lib/rental-invoice-detail-header-i18n.ts
```

## P251 handoff

Relations localization deferred to **P2.2.51 — Rental Invoice Relations Localization**.

**P251 FORECAST CONFIRMED** — Relations files untouched; ~9–12 keys estimated for Relations slice.

## Dictionary accounting

| | Baseline | Final |
|--|----------|-------|
| EN | 8760 | 8786 |
| DE | 8760 | 8786 |
| Parity | 100% | 100% |
| Orphans | 0 | 0 |
