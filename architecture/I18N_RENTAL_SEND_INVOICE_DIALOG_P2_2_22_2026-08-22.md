# P2.2.22 — Rental Send Invoice Dialog Localization

**Date:** 2026-08-22
**Baseline:** `59b01928a09598f36045a61fad031f0e44dcc1fc` (PR #1167 / P2.2.21)

## Scope

| Path | Role |
|------|------|
| `rental/components/invoices/SendInvoiceDialog.tsx` | Send-invoice email dialog UI |
| `rental/lib/send-invoice-i18n.ts` | Presentation adapter |
| `i18n/translations/invoices.send.{en,de}.ts` | +5 canonical keys |

## Locale flow

`useLanguage().{t,locale}` → SendInvoiceDialog chrome; `send-invoice-i18n.ts` builds localized default body template on dialog open.

Reuses `email.send.modal.*` field labels, `common.cancel`, and `email.send.modal.send`.

## Machine freeze

- `SendInvoiceEmailPayload` shape unchanged (`toEmail`, `subject`, `bodyText`, `ccEmails`, `bccEmails`, `documentId`)
- Invoice number via `displayNumber(invoice)` — never translated in logic
- Host-provided `defaultSubject` and `defaultToEmail` unchanged
- Recipient resolution outside dialog scope (InvoiceDetail / useInvoiceDocuments)

## Guardrails

`P222_ENFORCE_CLEAN_EXACT` (2 paths) — 0 findings.

## Tests

`rental-send-invoice-dialog-localization.test.tsx` (10 tests).

## Semantics

Presentation-only. Category E = 0.
