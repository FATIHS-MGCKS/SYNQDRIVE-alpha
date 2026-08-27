# P2.2.52 — Rental Invoice Payments — Implementation Record

**Date:** 2026-08-27
**Baseline:** `f4ff2e8b22ede182a57433076a0e0c03f504dd78`
**Pre-flight:** PR #1348
**Branch:** `cursor/p2252-rental-invoice-payments-i18n-3c10`

## Summary

Hardened Invoice Payments locale threading via `rental-invoice-payments-i18n.ts`. Reused all 43 existing `invoicePayment.*` keys and `common.actions` for table aria. **0 new dictionary keys.**

## Dictionary accounting

| Metric | Baseline | Final |
|--------|----------|-------|
| EN keys | 8799 | 8799 |
| DE keys | 8799 | 8799 |
| New keys | — | 0 |
| Parity | 100% | 100% |

## Production boundary

| Path | Change |
|------|--------|
| `InvoicePayments.tsx` | Locale threading; `common.actions` aria |
| `InvoicePaymentDetailDialog.tsx` | Locale-threaded formatters |
| `RecordPaymentDialog.tsx` | Locale-threaded outstanding hint |
| `invoicePayments.mapper.ts` | `locale` param on format/summary helpers |
| `rental-invoice-payments-i18n.ts` | **NEW** formatter adapter |

## Negative certifications

| Surface | Diff |
|---------|------|
| P251 Relations | **ZERO** |
| P250 Header | **ZERO** |
| P249 Secondary | **ZERO** |
| Mutation/payload | **ZERO semantic** |
| Refund/void/correct | **ZERO** (not added) |

## P253 forecast

Invoice Line Items: `InvoiceLineItems.tsx`, `invoiceLineItems.mapper.ts`.
