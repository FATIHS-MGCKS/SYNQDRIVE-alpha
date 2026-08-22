# I18N — Rental Insurances View (P2.2.19)

**Date:** 2026-08-22
**Status:** Implemented

## Summary

Fleet Insurances overview + inquiry wizard localized via shared presentation adapter (`insurances-i18n.ts`) and `insurances.{en,de}.ts` dictionary modules.

## Architecture

```
Machine values (status, inquiry purpose, time range, API payloads)
        ↓ unchanged
insurances-i18n.ts — labelKey maps, locale formatters
        ↓ translateKey(locale, key)
insurances.{en,de}.ts — canonical dictionary module
        ↓
InsurancesView.tsx (overview, wizard, detail drawer)
```

## Boundary

- `rental/components/InsurancesView.tsx`
- `rental/lib/insurances-i18n.ts`
- `i18n/translations/insurances.{en,de}.ts`

## Preserved

- API filter/sort keys and inquiry submission payloads
- Dynamic insurer names, policy numbers, VINs, disclosure body from API
- `INSURANCE_STATUS_VALUES`, `INQUIRY_PURPOSE_VALUES`, `TIME_RANGE_VALUES` as machine enums
- Filter predicate `'all'` + status string comparisons unchanged

## Key growth

7925 → 8124 (+199 EN+DE). Full inquiry wizard scope within single view file.

## Guardrails

- `P219_ENFORCE_CLEAN_EXACT`: `InsurancesView.tsx`, `insurances-i18n.ts` — 0 findings
- Blind-spot guards: status maps, filter options, KPI labels, `locale === 'de'` patterns
- Global enforce-clean debt remains 0; P218/P217/P216 freezes preserved

## Tests

`rental-insurances-localization.test.tsx` — 10 tests (EN/DE, runtime switch, date formatting, machine values, dynamic data preservation).
