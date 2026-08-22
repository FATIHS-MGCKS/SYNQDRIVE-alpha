# P2.2.20 — Rental Parts & Accessories View localization — Implementation audit

**Date:** 2026-08-22

**Program baseline SHA:** `9b714458088accf6bf240f3287070d67caab2474` (post–P2.2.19 / PR #1155)

**Implementation branch:** `cursor/p2220-rental-parts-accessories-i18n-3c10`
**Pre-flight audit:** PR #1161 (audit-only — not modified)

## Provenance

Independent P2.2.20 post-P219 pre-flight verdict **A — GO**. Implementation branched directly from verified baseline `9b714458`. P2.2.19 global enforce-clean closure and all prior frozen boundaries preserved.

## Exact production scope (`P220_ENFORCE_CLEAN_EXACT`)

| Path | Role |
|------|------|
| `rental/components/PartsAccessoriesView.tsx` | 5-step wizard + product detail drawer — full presentation migration |
| `rental/lib/parts-accessories-i18n.ts` | Presentation adapter (category/sort/availability/fitment label maps, locale formatters) |

Supporting (outside enforce-clean exact boundary but required):

| Path | Role |
|------|------|
| `i18n/translations/partsAccessories.{en,de}.ts` | Canonical dictionary module (+68 net keys) |
| `i18n/translations/en.ts`, `de.ts` | Spread `partsAccessoriesEn` / `partsAccessoriesDe` modules |
| `scripts/i18n-hardcoded-scan.mjs` | `P220_ENFORCE_CLEAN_EXACT` boundary |
| `i18n/hardcoded-copy-guard.test.ts` | P220 enforce-clean + blind-spot grep guards |
| `rental/components/rental-parts-accessories-localization.test.tsx` | EN/DE/runtime locale tests |

**Explicitly not modified:** Master PartsAccessoriesAdminView, other rental finance surfaces, operator surfaces, global `locale === 'de'` cleanup (~80 files).

## Hidden-literal remediation

Pre-flight: ~25 scanner-visible PartsAccessoriesView findings + scanner-blind presentation literals (`STEP_LABELS`, `CATEGORY_META`, availability/fitment badge maps, fixed `de-DE` price formatting, wizard chrome, sort options, authorization copy, detail drawer labels).

Remediated classes:

- Hardcoded page title/subtitle, wizard step labels, vehicle/category/provider/authorization/results/detail chrome
- Category/availability/fitment/sort label maps → `labelCategory`, `labelAvailability`, `labelFitment`, `labelSortOption` with `TranslationKey` metadata
- Fixed `de-DE` price formatting → `formatPartsPrice()` via `partsFormattingLocale()`
- Sort `<option value={machineValue}>` preserves machine keys; display labels localized
- Reused `nav.partsAccessories`, `common.back`, `common.cancel`, `common.details`

## Key audit

| Classification | Count | Detail |
|----------------|-------|--------|
| New `partsAccessories.*` module keys | **68** | `partsAccessories.{en,de}.ts` |
| Reused canonical keys (call sites) | **4** | `nav.partsAccessories`, `common.back`, `common.cancel`, `common.details` |
| Net canonical delta | **+68** | 8122 → **8190** |
| EN/DE parity | **100%** | 8190 / 8190 |
| Orphans | **0** | All keys referenced in component or i18n adapter |
| Duplicate candidates | **0** | No parallel parts taxonomy created |

## Machine-semantic verification (Category E = 0)

Preserved unchanged:

- `PARTS_CATEGORY_VALUES` (`TIRES`, `PARTS`, `ACCESSORIES`)
- `PARTS_SORT_VALUES` (`relevance`, `price_asc`, `price_desc`)
- Availability/fitment machine status strings for API/product payloads
- Search params: `vehicleId`, `providerKey`, `category`, `correlationId`, `sortBy`, `page`, `pageSize`
- Provider/product dynamic data (names, descriptions, SKUs, prices as numbers, disclosure body)
- Filter predicates, sort comparators, stock/price calculations

## Prior freezes

P219, P218, P217, P216A/B1/B2/C1/C2A/C2B enforce-clean debt remain **0**.

## Validation

- `npm run i18n:check` — PASS
- `npm run build` — PASS
- `git diff --check 9b714458...HEAD` — PASS
- P220 = 0, global enforce-clean = 0
