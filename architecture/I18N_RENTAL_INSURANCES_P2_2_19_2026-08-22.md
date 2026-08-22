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
