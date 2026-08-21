# I18N — Rental Invoice List (P2.2.14)

**Date:** 2026-08-21  
**Baseline:** post–P2.2.13 (`2538942a`)  
**Status:** Implemented

## Summary

Rental Invoice List + Filters surface localized via shared presentation adapter pattern (mirrors P2.2.12 Fines, P2.2.13 Operator Handover).

## Architecture

```
Machine values (status, filter, sort, API params)
        ↓ unchanged
invoice-list-i18n.ts  — labelKey maps, locale formatters
        ↓ translateKey(locale, key)
invoices.list.{en,de}.ts  — canonical dictionary module
        ↓
Invoice list components (Filters, List, KPI, Pagination, Page list mode)
```

## P214 enforce-clean boundary (exact)

- `rental/components/invoices/InvoicesPage.tsx`
- `rental/components/invoices/InvoiceList.tsx`
- `rental/components/invoices/InvoiceListTable.tsx`
- `rental/components/invoices/InvoiceListMobileCards.tsx`
- `rental/components/invoices/InvoiceListPagination.tsx`
- `rental/components/invoices/InvoiceFilters.tsx`
- `rental/components/invoices/InvoiceKpiGrid.tsx`
- `rental/components/invoices/InvoiceKpiCard.tsx`
- `rental/components/invoices/hooks/useInvoices.ts`
- `rental/components/invoices/invoiceListLabels.ts`
- `rental/components/invoices/invoiceConstants.ts` (machine re-exports only)
- `rental/lib/invoice-list-i18n.ts`

## Out of scope (deferred)

- Invoice Detail, payment dialogs, create invoice wizard copy
- `invoiceUtils.ts` STATUS_MAP (detail)
- `invoice-detail.constants.ts` (type map, templates — detail/create)
- Vendors, Insurance, Tenant Billing finance slices

## Semantics freeze

Category E = 0 — no API payload, query param, filter machine key, sort key, or persisted value changes.

## Metrics

| Metric | Value |
|--------|------:|
| P214 scoped scanner (pre → post) | 17 → 0 |
| Hidden presentation literals (pre → post) | ~100 → 0 |
| New canonical keys | +125 |
| Shim total | 29 (unchanged) |

## References

- Pre-flight: `docs/audits/i18n-p2-2-14-preflight-2026-08-21.md`
- Implementation audit: `docs/audits/i18n-p2-2-14-rental-invoice-list-implementation-2026-08-21.md`
- Tests: `frontend/src/rental/components/rental-invoice-list-localization.test.tsx`
