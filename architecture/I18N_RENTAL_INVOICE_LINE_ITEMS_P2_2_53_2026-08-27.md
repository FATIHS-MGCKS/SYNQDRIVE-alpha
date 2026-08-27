# P2.2.53 — Rental Invoice Line Items i18n Architecture

**Date:** 2026-08-27  
**Baseline:** `d92440355178d3f7b0a5cd1417bf0d3c3e7fa5da` (post-P252 merge)  
**Pre-flight:** PR #1354 — Verdict A

## Runtime flow

```
InvoiceDetail
  └─ InvoiceLineItems (useLanguage locale)
       └─ buildInvoiceLineItemsPanel(invoice, t, locale)
            ├─ parseLineInput (financial — frozen)
            ├─ resolveLineItemFallbackDescription (presentation)
            ├─ resolveLineItemUnitDisplayLabel (presentation)
            └─ taxRateLabel (existing keys)
       └─ formatInvoiceMoney / formatUnitTimesPrice → rental-invoice-line-items-i18n.ts
            └─ formatInvoiceListAmount (canonical)
```

## Scope

| Path | Role |
|------|------|
| `InvoiceLineItems.tsx` | Locale threading |
| `invoiceLineItems.mapper.ts` | Presentation params on formatters + panel build |
| `rental-invoice-line-items-i18n.ts` | Adapter (money, unit labels, fallback) |

## Frozen

- `parseLineInput`, `normalizeTaxRate`, `buildTaxBreakdown`, rollup/reconciliation/credit logic
- P252 Payments, P251 Relations, P250 Header, P249 Secondary
- `CreateInvoiceDialog`, Documents, Tenant Billing

## Keys

- **Reused:** 21 `invoiceLineItem.*` (20 wired; `empty` remains dead)
- **New:** 3 (`unit.days`, `unit.hours`, `fallback.description`)
- **8799 → 8802** EN+DE

## Guardrails

`P253_ENFORCE_CLEAN_EXACT` — 3 paths, 0 findings target.

## Tests

`rental-invoice-line-items-localization.test.tsx` — same-mount, raw description, financial fixtures, unit inference.
