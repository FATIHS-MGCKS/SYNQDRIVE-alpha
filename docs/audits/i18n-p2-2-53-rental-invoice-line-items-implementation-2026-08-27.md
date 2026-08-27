# P2.2.53 — Rental Invoice Line Items Implementation Evidence

**Date:** 2026-08-27  
**Baseline:** `d92440355178d3f7b0a5cd1417bf0d3c3e7fa5da`  
**Pre-flight:** PR #1354 (Verdict A)

## Summary

Production hardening for Invoice Detail Line Items: locale-threaded money formatting, localized inferred unit labels, localized fallback description. Financial calculation symbols unchanged.

## Changed paths

1. `frontend/src/rental/lib/rental-invoice-line-items-i18n.ts` — NEW adapter
2. `frontend/src/rental/components/invoices/invoiceLineItems.mapper.ts` — locale on presentation fns
3. `frontend/src/rental/components/invoices/InvoiceLineItems.tsx` — locale threading
4. `frontend/src/i18n/translations/en.ts` — +3 keys
5. `frontend/src/i18n/translations/de.ts` — +3 keys
6. `frontend/src/i18n/hardcoded-copy-guard.test.ts` — P253 enforce-clean
7. `frontend/src/rental/components/rental-invoice-line-items-localization.test.tsx` — NEW (8 tests)
8. `architecture/I18N_RENTAL_INVOICE_LINE_ITEMS_P2_2_53_2026-08-27.md`
9. `frontend/src/master/components/ArchitekturView.tsx` — bookkeeping
10. `frontend/src/master/components/ChangesView.tsx` — bookkeeping

## Certifications

- FINANCIAL CALCULATION DIFF = ZERO
- TAX CALCULATION DIFF = ZERO
- QUANTITY CALCULATION DIFF = ZERO
- ROUNDING DIFF = ZERO
- CREDIT/DISCOUNT CLASSIFICATION DIFF = ZERO
- DYNAMIC DESCRIPTION TRANSFORMATION DIFF = ZERO (user text raw)
- EMPTY LINE ITEMS BEHAVIOR = UNCHANGED

## Dictionary

| Metric | Before | After |
|--------|-------:|------:|
| EN | 8799 | 8802 |
| DE | 8799 | 8802 |
| New keys | — | 3 |

## P254 forecast

Tenant Billing subsection (17 scanner findings) — strongest next bounded Rental target.
