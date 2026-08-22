# I18N — Rental Parts & Accessories View (P2.2.20)

**Date:** 2026-08-22
**Status:** Implemented

## Summary

Rental Parts & Accessories search wizard localized via shared presentation adapter (`parts-accessories-i18n.ts`) and `partsAccessories.{en,de}.ts` dictionary modules.

## Architecture

```
Machine values (category, sort, availability, fitment, API payloads)
        ↓ unchanged
parts-accessories-i18n.ts — labelKey maps, locale formatters
        ↓ translateKey(locale, key)
partsAccessories.{en,de}.ts — canonical dictionary module
        ↓
PartsAccessoriesView.tsx (5-step wizard, product detail drawer)
```

## Boundary

- `rental/components/PartsAccessoriesView.tsx`
- `rental/lib/parts-accessories-i18n.ts`
- `i18n/translations/partsAccessories.{en,de}.ts`

## Preserved

- API search/disclosure/confirm payloads and sort query values
- Dynamic provider names, product titles/brands/sellers, disclosure body from API
- `PARTS_CATEGORY_VALUES`, `PARTS_SORT_VALUES` as machine enums
- Vehicle/customer assignment and permission behavior unchanged

## Key growth

8122 → 8190 (+68 EN+DE). Full wizard + detail drawer scope within single view file.

## Guardrails

- `P220_ENFORCE_CLEAN_EXACT`: `PartsAccessoriesView.tsx`, `parts-accessories-i18n.ts` — 0 findings
- Blind-spot guards: category maps, sort options, availability/fitment badges, KPI/wizard labels, `de-DE` patterns
- Global enforce-clean debt remains 0; P219/P218/P217/P216 freezes preserved

## Tests

`rental-parts-accessories-localization.test.tsx` — 10 tests (EN/DE, runtime switch, price formatting, machine values, dynamic data preservation).
