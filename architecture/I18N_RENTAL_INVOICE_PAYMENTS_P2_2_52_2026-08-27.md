# P2.2.52 — Rental Invoice Payments i18n

**Date:** 2026-08-27
**Baseline:** `f4ff2e8b` (P2.2.51 merge)
**Campaign:** RENTAL

## Scope

Production hardening for Invoice Detail **Payments** card:

- Locale-threaded money/date display via `rental-invoice-payments-i18n.ts`
- Reuses existing 43 `invoicePayment.*` keys + `common.actions`
- **0 new dictionary keys**

## Locale flow

```
useLanguage().locale
  → InvoicePayments / dialogs
  → formatPaymentAmount / formatPaymentRowDate / buildPaymentSummary(..., locale)
  → rental-invoice-payments-i18n.ts
  → formatInvoiceListAmount / formatInvoiceListDate
```

## Hard exclusions

- P251 Relations, P250 Header, P249 Secondary
- Documents, Line Items, Create/Send, Tenant Billing
- Mutation payload, validation predicates, sorting, record gate
- Refund/void/correct actions (unwired)

## Guardrails

`P252_ENFORCE_CLEAN_EXACT` (5 paths) — 0 findings.

## Tests

`rental-invoice-payments-localization.test.tsx` — same-mount DE↔EN, payload freeze, order preservation.

## Next slice

P2.2.53 — Invoice Line Items production hardening.
