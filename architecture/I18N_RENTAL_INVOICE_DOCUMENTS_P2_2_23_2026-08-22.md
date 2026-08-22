# P2.2.23 — Rental Invoice Documents Panel Localization

**Date:** 2026-08-22
**Baseline:** `80dbba83d8f7d93db1beba695d5b4d4229925cb0` (PR #1172 / P2.2.22)

## Scope

| Path | Role |
|------|------|
| `rental/components/invoices/InvoiceDocuments.tsx` | Invoice detail documents panel UI |
| `rental/lib/invoice-documents-i18n.ts` | Presentation adapter + locale-aware datetime |
| `rental/components/invoices/invoiceDocuments.mapper.ts` | `formatDateTime` locale threading only |
| `i18n/translations/invoices.documents.{en,de}.ts` | +29 canonical keys |

## Locale flow

`useLanguage().{t,locale}` → InvoiceDocuments panel states (EMPTY, GENERATING, FAILED, ACTIVE, delivery history); `invoice-documents-i18n.ts` formats timestamps via `getFormattingLocale`.

Reuses `common.download`, `common.retry`, `invoices.list.emptyValue`.

## Machine freeze

- `panelState`, document/delivery status codes, `documentId`, `emailId` unchanged
- Backend `statusLabel`, `channelLabel`, `documentTypeLabel`, `errorMessage`, capability `reason` strings displayed as dynamic data (Category B)
- Filenames, URLs, MIME, file sizes from backend unchanged
- Callbacks: `onPreview`, `onDownload`, `onGenerate`, `onSendEmail`, `onRetryGeneration`, `onRetryDelivery` unchanged

## Guardrails

`P223_ENFORCE_CLEAN_EXACT` (3 paths) — 0 findings.

## Tests

`rental-invoice-documents-localization.test.tsx` (11 tests).

## Semantics

Presentation-only. Category E = 0.

## Dedup regression note

Scanner deduplication exposed latent P2.2.4 enforce-clean debt for identical loading copy in `CompanySections.tsx`; fixed with one-line reuse of `invoices.documents.loading` to preserve global enforce-clean = 0.
