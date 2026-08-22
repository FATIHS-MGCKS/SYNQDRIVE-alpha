# P2.2.19 — Rental Insurances View localization — Implementation audit

**Date:** 2026-08-22

**Program baseline SHA:** `d645343f8e449037b5c9507457dc9b6d7926a61f` (post–P2.2.18 / PR #1148)

**Implementation branch:** `cursor/p2219-rental-insurances-view-i18n-3c10`
**Pre-flight audit:** PR #1153 (audit-only — not modified)

## Provenance

Independent P2.2.19 post-closure residual discovery verdict **A — GO**. Implementation branched directly from verified baseline `d645343f`. P2.2.18 global enforce-clean closure and all prior frozen boundaries preserved.

## Exact production scope (`P219_ENFORCE_CLEAN_EXACT`)

| Path | Role |
|------|------|
| `rental/components/InsurancesView.tsx` | Fleet insurance overview, 8-step inquiry wizard, detail drawer — full presentation migration |
| `rental/lib/insurances-i18n.ts` | Presentation adapter (status/purpose/time-range label maps, locale formatters) |

Supporting (outside enforce-clean exact boundary but required):

| Path | Role |
|------|------|
| `i18n/translations/insurances.{en,de}.ts` | Canonical dictionary module (+197 net keys) |
| `i18n/translations/en.ts`, `de.ts` | Spread `insurancesEn` / `insurancesDe` modules |
| `scripts/i18n-hardcoded-scan.mjs` | `P219_ENFORCE_CLEAN_EXACT` boundary |
| `i18n/hardcoded-copy-guard.test.ts` | P219 enforce-clean + blind-spot grep guards |
| `rental/components/rental-insurances-localization.test.tsx` | EN/DE/runtime locale tests |

**Explicitly not modified:** Master InsurancesAdminView, other rental finance surfaces, operator surfaces, global `locale === 'de'` cleanup (~80 files).

## Hidden-literal remediation

Pre-flight: ~55 scanner-visible InsurancesView findings + scanner-blind presentation literals (status maps, inquiry purpose options, historical/live data groups, KPI helpers, fixed `de-DE` formatting, wizard step chrome).

Remediated classes:

- Hardcoded page title, KPI labels, search/filter/sort chrome, table actions, empty/error copy
- Status/purpose/time-range/reporting/aggregation label maps → `labelInsuranceStatus`, `labelInquiryPurpose`, etc. with `TranslationKey` metadata
- Fixed `de-DE` date formatting → `insurancesFormattingLocale()` (`en-US` / `de-DE`)
- Filter `<option value={machineValue}>` preserves machine enums; display labels localized
- 8-step inquiry wizard (vehicle select, insurers, purpose, historical data, time range, live data, review, submit) fully localized

## Key audit

| Classification | Count | Detail |
|----------------|-------|--------|
| New `insurances.*` module keys | **197** | `insurances.{en,de}.ts` (overview, wizard, detail, status, filters, KPI, empty, submit) |
| Reused non-insurances canonical keys (call sites) | **0** | All scoped copy uses dedicated `insurances.*` namespace |
| Net canonical delta | **+197** | 7925 → **8122** |
| EN/DE parity | **100%** | 8122 / 8122 |
| Orphans | **0** | All keys referenced in component or i18n adapter |
| Duplicate candidates | **0** | No parallel insurance taxonomy created |

**Note:** 197 keys exceeds pre-flight estimate (45–60) because the full 8-step inquiry wizard, historical/live data option matrices, and detail drawer were in scope within `InsurancesView.tsx` (single bounded file). Two orphan keys removed post re-audit (`missing.noRecord`, `detail.since`).

## Scanner accounting (recomputed)

| Metric | Pre-P2.2.19 (`d645343f`) | After implementation | Delta |
|--------|--------------------------|----------------------|-------|
| Global findings | 1718 | **1665** | −53 |
| Rental | 487 | **434** | −53 |
| Master | 1049 | 1049 | 0 |
| Operator | 156 | 156 | 0 |
| InsurancesView scanner rows | 55 | **0** | clean |
| P219 enforce-clean (2 paths) | 55 | **0** | clean |
| P218 enforce-clean | 0 | 0 | preserved |
| P217 enforce-clean | 0 | 0 | preserved |
| P216A/B1/B2/C1/C2A/C2B enforce-clean | 0 | 0 | preserved |
| Global enforce-clean debt | 0 | **0** | preserved |
| Canonical EN keys | 7925 | **8122** | +197 |
| Canonical DE keys | 7925 | **8122** | +197 |

## Machine-semantic verification (Category E = 0)

Preserved unchanged:

- `INSURANCE_STATUS_VALUES` (`ACTIVE`, `EXPIRING_SOON`, `EXPIRED`, `MISSING`, `PENDING_INQUIRY`)
- `INQUIRY_PURPOSE_VALUES` (e.g. `quote_standard`, `contract_optimization`)
- `TIME_RANGE_VALUES`, `REPORTING_FREQUENCY_VALUES`, `AGGREGATION_LEVEL_VALUES`
- Filter state `'all'` + status enum strings
- API calls: `api.insurances.overview`, `partners`, `disclosure`, `submitInquiry`
- Provider names, policy numbers, VINs, license plates, disclosure body from API
- Search/filter/sort logic (same fields; presentation-only label changes)
- Inquiry submission payload structure and machine field values
- Permission gates and navigation callbacks

## Filter matrix (frozen)

| Filter | Visible label key | Machine value | Behavior |
|--------|-------------------|---------------|----------|
| Status (all) | `insurances.filters.allStatuses` | `all` | unchanged |
| Status (active) | `insurances.status.ACTIVE` | `ACTIVE` | unchanged |
| Status (expiring) | `insurances.status.EXPIRING_SOON` | `EXPIRING_SOON` | unchanged |
| Status (expired) | `insurances.status.EXPIRED` | `EXPIRED` | unchanged |
| Status (missing) | `insurances.status.MISSING` | `MISSING` | unchanged |
| Status (pending) | `insurances.status.PENDING_INQUIRY` | `PENDING_INQUIRY` | unchanged |

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
| `rental-insurances-localization.test.tsx` | 10/10 PASS |
| `hardcoded-copy-guard.test.ts` (incl. P219 + blind spots) | 68/68 PASS |
| `npm run i18n:check` | PASS (8122/8122) |
| `npm run build` | PASS |
| `git diff --check` | PASS |

Coverage includes: EN/DE overview render, title/KPIs/filters/table headers, status labels, empty states, search placeholder, action labels, runtime locale switch, locale-aware date formatting, machine filter/status values, dynamic provider/policy/vehicle data preservation, P219 enforce-clean, blind-spot guards, no translation-key leakage.

## Deferred broader residuals

- Master InsurancesAdminView and other rental finance surfaces remain in global scanner inventory (1665 findings)
- Global `locale === 'de'` ternary cleanup (~80 files) explicitly out of scope
- P2.2.20+ slices not started

## Verdict

**A — IMPLEMENTATION COMPLETE — READY FOR INDEPENDENT P2.2.19 RE-AUDIT**

`npm run i18n:check` = PASS
GLOBAL ACTIVE I18N ENFORCE-CLEAN DEBT = 0
