# P2.2.51 — Rental Invoice Relations — Implementation Record

**Date:** 2026-08-27
**Baseline:** `fb03d921668701168c5eb31c02524c1d9b187fc9`
**Pre-flight:** PR #1343 (read-only; not merged)
**Branch:** `cursor/p2251-rental-invoice-relations-i18n-3c10`

## Summary

Localized Invoice Detail Relations card presentation via `rental-invoice-relations-i18n.ts` and +13 bounded `rental.invoice.relations.*` keys. Entity raw values, permissions, navigation, and relation order unchanged. `buildInvoiceProvenance` untouched.

## Dictionary accounting

| Metric | Baseline | Final |
|--------|----------|-------|
| EN keys | 8786 | 8799 |
| DE keys | 8786 | 8799 |
| New keys | — | 13 |
| Parity | 100% | 100% |
| Orphans | 0 | 0 |

## Production boundary

| Path | Change |
|------|--------|
| `InvoiceRelations.tsx` | Section + template label via adapter |
| `InvoiceRelationRow.tsx` | Unchanged (consumes localized DTO) |
| `invoiceRelations.mapper.ts` | Relation builders localized; provenance frozen |
| `rental-invoice-relations-i18n.ts` | **NEW** presentation adapter |
| `InvoiceDetail.tsx` | Rebuild `relations` with locale (mapper frozen) |

## Key reuse

| Concept | Strategy |
|---------|----------|
| Customer / Vehicle / Booking / Vendor labels | `bookings.customer`, `bookings.vehicle`, `tasks.entity.booking`, `tasks.entity.vendor` |
| Template names (known IDs) | `invoices.create.template.*` |
| Booking status | `bookingStatusLabel(status, locale)` |
| Custom template ID | Raw |

## Negative certifications

| Surface | Diff |
|---------|------|
| P250 Header | **ZERO** |
| P249 Secondary | **ZERO** |
| `buildInvoiceProvenance` | **ZERO semantic** |
| Payments / Documents / Line Items | **ZERO** |

## Tests

- `rental-invoice-relations-localization.test.tsx` (6 tests)
- P251 enforce-clean guard in `hardcoded-copy-guard.test.ts`
- Existing `InvoiceRelations.test.tsx` + `invoiceRelations.mapper.test.ts` pass

## P252 forecast

Invoice Payments: `InvoicePayments.tsx`, `invoicePayments.mapper.ts`, related dialogs.
