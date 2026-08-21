# P2.2.12 — Rental Fines localization — Implementation audit

**Date:** 2026-08-21  
**Program baseline SHA:** `26d5e442f43097981f0c19d5a200c410f9d09793` (post–P2.2.11 / PR #1095)  
**Implementation branch:** `cursor/p2212-rental-fines-i18n-3c10`  
**Pre-flight audit:** PR #1097 (audit-only — not merged, not used as baseline)

## Provenance

Independent P2.2.12 pre-flight verdict **A — GO**. Implementation branched directly from verified program tip `26d5e442`. P2.2.7B, P2.2.8, P2.2.9, P2.2.10, and P2.2.11 frozen boundaries preserved.

## Exact production scope (`P212_ENFORCE_CLEAN_EXACT`)

| Path | Role |
|------|------|
| `rental/components/FinesView.tsx` | Rental fines list, create form, detail — full presentation migration |
| `rental/lib/fines-i18n.ts` | Presentation adapter (status/offense label maps, locale formatters) |

Supporting (outside enforce-clean exact boundary but required):

| Path | Role |
|------|------|
| `i18n/translations/fines.{en,de}.ts` | Canonical dictionary module (+82 net keys; 11 legacy `fines.*` migrated from inline `en.ts`/`de.ts`) |
| `i18n/translations/en.ts`, `de.ts` | Spread `finesEn` / `finesDe` modules |
| `scripts/i18n-hardcoded-scan.mjs` | `P212_ENFORCE_CLEAN_EXACT` boundary |
| `i18n/hardcoded-copy-guard.test.ts` | P212 enforce-clean + blind-spot grep guards |

**Explicitly not modified:** invoice list/detail, vendors, insurance, tenant billing, master finance, operator surfaces.

## Hidden-literal remediation

Pre-flight: ~35 scanner-visible Fines findings + ~60 blind-spot presentation literals (status maps, offense `<option>` labels, KPI helpers, fixed `de-DE` formatting).

Remediated classes:

- Hardcoded German page title, filters, table headers, form labels, detail sections, empty/error copy
- `STATUS_MAP` / `OFFENSE_TYPES` German labels stored in machine state → `labelFineStatus` / `labelFineOffenseType` with `TranslationKey` metadata
- Fixed `de-DE` date/currency formatting → `finesFormattingLocale()` (`en-US` / `de-DE`)
- Offense `<option value={offenseType}>` preserves German persisted machine values; display labels localized

## Key audit

| Classification | Count | Detail |
|----------------|-------|--------|
| Legacy `fines.*` keys wired (pre-existing in dictionary) | **11** | `fines.title`, `searchPlaceholder`, `uploadFine`, `totalFines`, `openFines`, `totalAmount`, `points`, `fineNumber`, `noFines`, `uploadNotice`, `drivingBan` |
| New `fines.*` module keys | **82** | `fines.{en,de}.ts` (status, offense display, filters, form, detail, metrics) |
| Reused non-fines canonical keys (call sites) | **7** | `common.back`, `common.cancel`, `common.save`, `common.edit`; `tasks.filter.status.DONE`, `IN_PROGRESS`, `OPEN` |
| Net canonical delta | **+82** | 7210 → **7292** |
| EN/DE parity | **100%** | 7292 / 7292 |

## Scanner accounting (recomputed)

| Metric | Pre-P2.2.12 (`26d5e442`) | After implementation | Delta |
|--------|--------------------------|----------------------|-------|
| Global findings | 1875 | **1854** | −21 |
| Rental | 586 | **565** | −21 |
| Master | 1049 | 1049 | 0 |
| Operator | 180 | 180 | 0 |
| P212 enforce-clean (2 paths) | 35 | **0** | clean |
| P211 enforce-clean | 0 | 0 | preserved |
| P210 enforce-clean | 0 | 0 | preserved |
| P29 enforce-clean | 0 | 0 | preserved |
| P28 enforce-clean | 0 | 0 | preserved |
| P27B enforce-clean | 0 | 0 | preserved |
| Canonical EN keys | 7210 | **7292** | +82 |
| Canonical DE keys | 7210 | **7292** | +82 |

**Note:** Global/rental delta (−21) is less than pre-flight P212 estimate (35) because baseline inventory counted FinesView scanner rows that partially overlap rental module aggregation; P212 scoped inventory is **0** post-implementation.

## Machine-semantic verification (Category E = 0)

Preserved unchanged:

- `FINE_STATUS_VALUES` (`NEW`, `UNDER_REVIEW`, …)
- `FINE_OFFENSE_TYPE_VALUES` (German strings as persisted `offenseType` API values)
- Filter state `'all'` + status enum strings
- `optionalContextType: 'FINE'`, document intake `sourceSurface: 'fines_page'`
- API calls: `api.fines.list`, `stats`, `get`, `create`, `update`, `uploadImage`
- Amount cents, currency codes, IDs, query params, status comparisons
- Search/filter logic (same fields; presentation-only label changes)

## Shim accounting

| Metric | Before | After |
|--------|--------|-------|
| Shim total | 29 | 29 |
| Production compat | 18 | 18 |
| Test compat | 11 | 11 |
| New compat consumers | 0 | 0 |

## Tests

| Suite | Result |
|-------|--------|
| `rental-fines-localization.test.tsx` | 9/9 PASS |
| `hardcoded-copy-guard.test.ts` (incl. P212 + blind spots) | 24/24 PASS |
| `npm run i18n:check` | PASS (7292/7292) |
| `npm run build` | PASS |
| `git diff --check` | PASS |

Coverage includes: EN/DE list render, title/filters/table headers, empty state hints, machine status/offense/filter values, locale-aware amount/date formatting, P212 enforce-clean, blind-spot guards, no translation-key leakage.

## Verdict

**A — IMPLEMENTATION COMPLETE — READY FOR INDEPENDENT P2.2.12 RE-AUDIT**
