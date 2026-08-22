# P2.2.21 — Rental Create Invoice Dialog Localization

**Date:** 2026-08-22  
**Baseline:** `6413a3dd68dce6b9d0db6346a2ae9245821d22fb` (PR #1163 / P2.2.20)

## Scope

| Path | Role |
|------|------|
| `rental/components/invoices/CreateInvoiceDialog.tsx` | 3-step create wizard UI |
| `rental/lib/create-invoice-i18n.ts` | Presentation adapter |
| `i18n/translations/invoices.create.{en,de}.ts` | +40 canonical keys |

## Locale flow

`useLanguage().{t,locale}` → CreateInvoiceDialog chrome; `create-invoice-i18n.ts` resolves type/template labels and `formatCreateInvoiceAmount`.

## Machine freeze

- Types: `OUTGOING_MANUAL`, `INCOMING_VENDOR`
- Template IDs: `standard`, `booking`, `damage`, `extra`
- VAT rate: `19` (`CREATE_INVOICE_VAT_RATE`)
- Currency: `EUR`
- API: `api.invoices.create`, `api.invoices.uploadFile` payload shape unchanged

## Guardrails

`P221_ENFORCE_CLEAN_EXACT` (2 paths) — 0 findings.

## Tests

`rental-create-invoice-dialog-localization.test.tsx` (13 tests).

## Semantics

Presentation-only. Category E = 0.
