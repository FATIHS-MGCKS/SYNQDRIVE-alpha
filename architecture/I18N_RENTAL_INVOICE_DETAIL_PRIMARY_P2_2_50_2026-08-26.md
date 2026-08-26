# Platform i18n — Rental Invoice Detail Primary (P2.2.50)

**Date:** 2026-08-26  
**Baseline:** `e0aa79d3135866eb9f890c2666165f15a1411c0b` (P2.2.49 merge / PR #1330)  
**Pre-flight:** PR #1335 (read-only; not implementation ancestry)  
**Campaign:** Rental  
**Scope:** Invoice Detail Primary header + relations presentation only

## Boundary

| Path | Role |
|------|------|
| `rental/components/invoices/InvoiceDetailHeader.tsx` | Amount summary, dates, PDF CTA, status/type chrome |
| `rental/components/invoices/InvoiceHeaderMoreMenu.tsx` | More-actions menu labels |
| `rental/components/invoices/InvoiceRelations.tsx` | Relations section heading + template row |
| `rental/components/invoices/invoiceDetail.mapper.ts` | Gate reason presentation; status/type/money/date projection |
| `rental/components/invoices/invoiceRelations.mapper.ts` | Relation labels, fallbacks, permission reasons, period chrome |
| `rental/components/invoices/invoiceUtils.ts` | Locale-threaded amount/date helpers (delegates to invoice-list-i18n) |
| `rental/lib/rental-invoice-detail-primary-i18n.ts` | Bounded presentation adapter (`ridp`) |

**Minimal shell threading:** `InvoiceDetail.tsx` passes `locale` into `buildInvoiceDetailDto` only (no shell chrome localization).

**Excluded:** Secondary (P249), payments (P251), line items, documents (P223), create/send dialogs (P221–P222), tenant billing, financial/tax/payment semantics, action eligibility, routing, PDF generation semantics.

## Runtime flow

`/rental` → `InvoicesPage` → `InvoiceDetail` → `buildInvoiceDetailDto(invoice, { locale, … })` → `InvoiceDetailHeader` / `InvoiceHeaderMoreMenu` / `InvoiceRelations`.

## Locale flow

`useLanguage().locale` → `rental-invoice-detail-primary-i18n.ts` (`ridp`, gate reasons, relation chrome) + `invoice-list-i18n.ts` (status, type, money, date).

## Keys

- **+42** EN+DE `rental.invoice.detail.primary.*` (8760→8802)
  - 20 gate-reason keys (pre-flight §26 HOST PRESENTATION inventory)
  - 22 header/menu/relations/fallback/permission/period keys
- **Reused (~26 call sites):** `invoices.list.status.*`, `invoices.list.type.*`, `invoices.list.col.{total,dueDate,booking,vehicle}`, `invoices.list.emptyValue`, `invoices.create.template.*`, `tasks.entity.{customer,vendor}`, `common.edit`, `common.cancel`

## Frozen semantics

- **Invoice number:** `RE-2026-00421` display/copy/API args unchanged
- **Money:** `totalCents`, `paidCents`, `outstandingCents ?? max(0, total - paid)`, `currency` — calculation owners unchanged; only `formatInvoiceListAmount` locale threading
- **Status/type:** 14 machine statuses + invoice types — IDs, tone, icons, action eligibility unchanged
- **OVERDUE:** API machine status only; no locale-derived overdue
- **Dates:** raw ISO preserved; `formatInvoiceListDate` locale threading only
- **Actions:** callbacks, args, `.allowed` predicates, PDF/document IDs unchanged
- **Relations:** customer/booking/vehicle/vendor raw IDs and navigation callbacks unchanged; dynamic entity names not translated
- **Permissions:** `canReadCustomers` / `canReadBookings` / `canReadFleet` predicates unchanged

## Fixed-locale cleanup

`invoiceUtils.ts` removed hardcoded `Intl.NumberFormat('de-DE')` / `toLocaleDateString('de-DE')`; optional `locale` param defaults to `'de'` for out-of-scope callers.

## Guardrails

`P250_ENFORCE_CLEAN_EXACT` — 7 paths, 0 findings. P249–P216 remain 0.

## Tests

`rental-invoice-detail-primary-localization.test.tsx` — EN/DE render, same-mount locale switch, raw cents/currency, outstanding formula, entity raw preservation, 14 statuses, gate reasons, relations navigation, enforce-clean inventory.

**Category E:** 0

## P251 forecast

**CONFIRMED:** Invoice Payments panel + `invoicePayments.mapper.ts`

## Main drift

`invoice-detail.constants.ts` deleted on current `main` — **not absorbed** (baseline retains file).
