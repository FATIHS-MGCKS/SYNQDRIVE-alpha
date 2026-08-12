# Phase 3 — E6.0.1 Blueprint Correction & Final Implementation Gate (2026-08)

Docs-only correction of four E6.0 blueprint inconsistencies found in independent
review. NO runtime/test/Prisma/config/flag/VPS change; no cherry-pick/merge; no E6A;
no E7–E9. Only `docs/audits/pr-recovery/**` changed.

## 1. Revision identity

| Ref | SHA |
|-----|-----|
| CURRENT_MAIN_SHA | `a704fdcca76f03703a0816f71a4d11ffdbaf4292` |
| E5_MERGE_ANCESTOR | YES |
| COMMITS_AFTER_E5_COUNT | 0 |
| Audit branch | `audit/evaluations-e6-discovery-2026-08` (`1d3d1028`) |

No material main drift into E1–E6 scope → proceed.

## 2. Independent review findings

1. #798 treated unsupported monetary truth (fixed/maintenance/damage cost, exposure)
   as canonical E6 (`E6_CURRENT_STATE = 42`) — wrong; "current" ≠ canonically
   supported.
2. Generic Money salvage marked `evaluations-format.ts` (`fmtEurMinor`, EUR-hardcoded)
   as `REUSE_AS_IS` — violates no-implicit-EUR.
3. Finance MTD vs selected E4 period not made unambiguous — semantic
   misrepresentation risk.
4. Legacy (dashboard-insights / misuse-cases / raw entities) not cleanly separated
   from canonical E6 analytics.

## 3. E4 Money authority verification (from actual current-main code)

Read `e4/contracts/evaluations-insights.contract.ts`, `e4/domain/evaluations-cost.domain.ts`,
`e4/evaluations-insights.service.ts`.

| Field/concept | E4 canonical support | Money authority | Currency authority | Status behavior | E6 renderable |
|---------------|----------------------|-----------------|--------------------|-----------------|---------------|
| OPERATING_EXPENSES | YES (OrgInvoice INCOMING) | authoritative `EvaluationsMoney` | explicit invoice currency | AVAILABLE/PARTIAL per coverage | YES (money) |
| UNPLANNED_MAINTENANCE (`ServiceCase.actualCostCents`) | NO authoritative money | none (unproven currency/provenance) | none | served **UNAVAILABLE** + reason | STATUS ONLY |
| DAMAGE_REPAIR (`VehicleDamage.repairCostCents`) | NO | none | none | served **UNAVAILABLE** + reason | STATUS ONLY |
| ESTIMATED_FIXED_COSTS (leasing/insurance/tax) | NO — **UNSUPPORTED** | none (no currency/periodicity/effective-date) | none | **UNAVAILABLE**; excluded from totals ("no fabricated accrual") | STATUS ONLY |
| section totalsByCurrency / reportingCurrency / mixedCurrency | YES (OPERATING_EXPENSES only) | per-currency, never blended | explicit | section status/reason | YES |
| Downtime (`maintenanceMs`, `netCapacityMs`, counts) | YES (utilization) | n/a (time/counts) | n/a | `blockedMs` null → UNAVAILABLE | YES (non-money) |
| estimatedExposure | **NONE** (no E1–E5 contract) | none | none | n/a | NO (E8) |

Authoritative conclusion: only OPERATING_EXPENSES cost money is canonical; the other
cost categories are intentionally UNAVAILABLE/UNSUPPORTED and must be rendered as
status, never as amounts.

## 4. #798 reclassification

Corrected counts (evidence-based; supersedes `E6_CURRENT_STATE = 42`):

| Class | Count | Notes |
|-------|------:|-------|
| E6_CANONICAL_RENDERABLE | 18 | OPERATING_EXPENSES money, section currency/status/coverage, downtime durations+counts, period/currency labels |
| E6_STATUS_ONLY | 10 | maintenance/damage/fixed cost amounts + waterfall steps + their category totals → render E4 UNAVAILABLE+reason, no amount |
| UNSAFE_LEGACY_CALCULATION | 6 | client pareto/waterfall/aging/series that sum non-canonical categories; derivedDowntimePct fallback |
| E8_PREDICTIVE | 8 | probability, impact, confidence, exposureMinor/**estimatedExposure**, cellTone, scaleToFive, axis probability, risk-matrix point |
| E9_FORECAST | 5 | quantitativeDeviation FORECAST, forecasts list, isForecast passthroughs |
| GENERIC_VISUAL_PATTERN | 14 | chart shells/tables/empty/formatters/skeletons |

Salvage matrix updated with per-symbol rows carrying `old_classification=E6_CURRENT_STATE`
+ canonical evidence + reason.

## 5. estimatedExposure decision

`estimatedExposure`/`exposureMinor` has **no E1–E5 canonical contract**; it is a risk
estimate synthesized by the shared risk-matrix resolver (probability × impact
allocation). DECISION: **REMOVE from E6**, classify **E8_PREDICTIVE**. It must NOT be
reconstructed from open damage cases, maintenance estimates, invoices, legacy cost
data, or probability×impact. Evidence: shared `evaluations-risk-cost-visualizations.ts`
(`resolveRiskMatrix`, `scaleToFive`, exposure allocation); no cost/finance contract
exposes it.

## 6. Explicit-currency formatting contract

The correct currency-aware formatter ALREADY EXISTS on main:
`frontend/src/rental/lib/finance-insights-adapter.ts` —
`minorToMajorForPresentation(amountMinor, currency)` uses
`getCurrencyMinorUnitExponent` (JPY=0, KWD=3, …) and `formatFinanceMoney` uses the
backend `Money.currency` with `Intl.NumberFormat` (no hardcoded EUR, no hardcoded
/100). MONEY_FORMATTER_DECISION: **REUSE the finance-insights-adapter formatter** as
the E6 Money boundary (extend to a generic `formatMoney({amountMinor, currency,
locale})`); **RECLASSIFY** historical `evaluations-format.ts` `fmtEurMinor` from
`REUSE_AS_IS` → `COPY_FORMATTING_PATTERN_ONLY` (EUR-specific; not the generic
renderer).

Canonical E6 Money rules: currency MUST come from the canonical contract; locale
controls display only and MUST NOT determine currency; no float business arithmetic
on `amountMinor`; mixed currencies never summed; missing currency never defaults to
EUR (render UNAVAILABLE instead).

## 7. Finance MTD / Analytics period contract

Evidence: `evaluations-finance.service.ts` sets `periodType: 'MTD'` (fixed); the E3
endpoint accepts `stationIds` only (no `periodType`). E4/E5 endpoints accept
`periodType` (user-selectable).

| Authority | Value |
|-----------|-------|
| FINANCE_PERIOD_AUTHORITY | FIXED MTD (server) |
| FINANCE_PERIOD_USER_SELECTABLE | NO |
| E4/E5 (ANALYTICS)_PERIOD_USER_SELECTABLE | YES |

Presentation contract: the global period selector governs E4 analytics + E5 quality
ONLY. The Finance & Receivables section MUST carry a persistent, explicit "Monat bis
heute (MTD)" scope label and MUST NOT appear to change with the global selector. E6
MUST NOT recompute E3 finance client-side and MUST NOT hide the difference.
PERIOD_UI_DECISION: Finance section shows its own MTD scope badge; other sections
show the selected period; no forced alignment.

## 8. Legacy analytics separation

| Source | E6 decision | Reason |
|--------|-------------|--------|
| dashboard-insights | KEEP_OUTSIDE_CANONICAL_E6 | operational risk/leakage feed; not an E1–E5 canonical analytics contract; canonical E6 sections source from E4/E5; do not derive quality/freshness from it; keep endpoint (app-wide consumers) |
| misuse-cases | KEEP_IN_PRODUCT_OUTSIDE_E6_CANONICAL_COMPOSITION | separate abuse domain; no canonical owner; not canonical analytics; keep as independent feature; do not delete/modify other consumers |
| raw invoices/customers/bookings/drivers/vehicles | FORBIDDEN_AS_E6_METRIC_SOURCE | no raw-entity recompute fallback for any E1–E5 metric; endpoints remain for non-analytics line-items only |

LEGACY_REMOVAL_BOUNDARY: E6 stops CONSUMING legacy for canonical values where an
E4/E5 replacement exists; it does NOT delete shared endpoints; no legacy fallback and
no second analytics truth.

## 9. Privacy recheck (post legacy removal)

Removing legacy sources must not let E6 reconstruct identity via misuse/customers/
invoices/bookings/cached driver lists. Driver Influence remains server-tier +
server-permitted `driverRef` only. Added gate `CLIENT_SIDE_IDENTITY_RECONSTRUCTION_COUNT = 0`.
No client role/permission→PII, no raw-ID fallback, no driverRef cross-join.

## 10. Quality recheck (post legacy removal)

E6 must never derive quality/freshness/completeness from legacy timestamps or missing
fields when E5 quality is unavailable — render UNAVAILABLE instead. Added gate
`LEGACY_QUALITY_INFERENCE_COUNT = 0` (plus existing CLIENT_SIDE_QUALITY/FRESHNESS
AUTHORITY = 0).

## 11. Canonical API gap recheck

Distinguish true gaps from intentionally-unsupported truth:
- `TRUE_CANONICAL_API_GAP_COUNT = 0`.
- `INTENTIONALLY_UNSUPPORTED_CONCEPT_COUNT = 3` (maintenance cost money, damage cost
  money, fixed cost money — E4 deliberately serves UNAVAILABLE/UNSUPPORTED).
  `estimatedExposure` is NOT counted as unsupported truth; it is out-of-scope
  predictive (E8).

E6 must render the E4 UNAVAILABLE truth for the 3 unsupported cost categories and
MUST NOT create an adapter to manufacture them.

## 12. Backend decision (recomputed)

`BACKEND_DECISION = E6_FRONTEND_ONLY`. Re-evaluated from actual contracts: all
canonical E6 surfaces are served by E1/E3/E4/E5; unsupported cost categories are
rendered as their canonical UNAVAILABLE status (not an API gap); no adapter is
required.

## 13. Final information architecture (reissued)

1. Page Header / Global Controls (period selector governs E4/E5 only) — E1/E2
2. Data Status (E5 overall) — E5
3. Executive Summary (selected period) — E4 summary
4. Strengths & Weaknesses (selected period) — E4
5. Finance & Receivables (persistent MTD scope badge) — E3
6. Fleet Performance / Utilization (selected period) — E4
7. Current Costs & Downtime — E4 (OPERATING_EXPENSES money; maintenance/damage/fixed
   rendered UNAVAILABLE+reason; downtime durations/counts; NO estimatedExposure)
8. Driver Influence (server tier) — E4/E5
9. Data Quality — E5

Excluded: Risks & Forecasts (E8/E9), Actions & Recommendations (E7),
estimatedExposure, legacy dashboard/misuse truth inside canonical sections.

## 14. Updated E6A–E6D plan

- **E6A** Canonical frontend data layer: hooks for E4 summary / E5 quality /
  driver-analysis (+ existing E3 finance, E1 registry); **explicit-currency Money
  formatter (reuse finance-insights-adapter; no EUR default)**; **period semantics
  (E4-selectable vs E3 fixed MTD)**; state preservation; feature-disabled behavior.
- **E6B** IA + canonical core surfaces: Executive, Finance/Receivables (MTD badge),
  Strengths/Weaknesses, Utilization, **canonical Cost/Downtime (OPERATING_EXPENSES
  money only; other categories UNAVAILABLE; no exposure/risk-matrix)**.
- **E6C** E5 Data Quality (render truth, no client derivation/role gate) + Driver
  Influence (privacy-safe server tier).
- **E6D** Legacy E6-source removal (stop consuming dashboard-insights/misuse/raw for
  canonical values; keep endpoints) + responsive + a11y + i18n + E2E/visual + final
  hardening.

## 15. Final hard gates

Existing E6 gates plus the E6.0.1 additions, all = 0:

Money: IMPLICIT_CURRENCY_FORMATTING_COUNT, HARDCODED_EUR_FOR_GENERIC_MONEY_COUNT,
CLIENT_SIDE_CURRENCY_INFERENCE_COUNT, MIXED_CURRENCY_CLIENT_SUM_COUNT,
UNAUTHORIZED_MONEY_RECONSTRUCTION_COUNT.
Period: PERIOD_SCOPE_MISREPRESENTATION_COUNT, FINANCE_PERIOD_RECALCULATION_COUNT,
GLOBAL_FILTER_FALSE_SCOPE_COUNT.
Legacy: LEGACY_NONCANONICAL_ANALYTICS_IN_E6_COUNT, LEGACY_ANALYTICS_FALLBACK_COUNT,
RAW_ENTITY_RECOMPUTATION_FALLBACK_COUNT, SECOND_ANALYTICS_TRUTH_COUNT,
LEGACY_QUALITY_INFERENCE_COUNT.
Privacy: CLIENT_SIDE_PII_AUTHORITY_COUNT, CLIENT_SIDE_IDENTITY_RECONSTRUCTION_COUNT,
RAW_ID_FALLBACK_COUNT.
Quality/state: CLIENT_SIDE_QUALITY_AUTHORITY_COUNT, CLIENT_SIDE_FRESHNESS_AUTHORITY_COUNT,
UNAVAILABLE_RENDERED_AS_ZERO_COUNT, PARTIAL_RENDERED_AS_COMPLETE_COUNT,
UNKNOWN_RENDERED_AS_COMPLETE_COUNT, STALE_HIDDEN_COUNT.
Scope: DUPLICATE_BUSINESS_CALCULATION_COUNT, E7/E8/E9_RUNTIME_SCOPE_COUNT,
SECOND_EVALUATIONS_PAGE_COUNT, NEW_PARALLEL_TRUTH_AUTHORITY_COUNT.

## 16. Remaining unknowns

`IMPLEMENTATION_CRITICAL_UNKNOWN_COUNT = 0`. Non-critical (unchanged from E6.0):
production `EVALUATIONS_ANALYTICS_V2_MODE` value (UNSET/off; honest disabled state
regardless); whether dashboard-insights/misuse remain as complementary operational
surfaces (product decision; kept non-canonical); potential future E4 invoice
line-item drilldown (not required for E6).

## Final decision

E6_READY_FOR_IMPLEMENTATION
