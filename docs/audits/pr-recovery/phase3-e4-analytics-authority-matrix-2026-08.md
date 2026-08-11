# Phase 3 – E4 Analytics Authority Matrix (2026-08)

Purpose: inventory current-main analytics authorities so E4 composes them instead of
creating a second analytics truth. `PARALLEL_ANALYTICS_TRUTH_COUNT` target = 0.

Base main SHA: `cefeedfe7dcfd7f682ba5b80fad1fec37d4a6c0f` (E3 merge, #1022).

## 1. Scope / period / timezone authority (E2 + E1)

| Concern | Owner | File | E4 usage |
|---|---|---|---|
| Org + station authorization, requested-narrowing-only | `EvaluationsAnalyticsScopeService.resolveAuthorizedScope` | `backend/src/modules/evaluations-analytics/evaluations-analytics-scope.service.ts` | E4 orchestration resolves scope **only** through this service; never re-derives station scope |
| Station scope role mapping (Worker/SubAdmin empty = NO_STATIONS, Driver = NO_STATIONS) | `resolveEvaluationsAuthorizedStationScope` | `evaluations-analytics-station-scope.ts` | Inherited via scope service (fail-closed) |
| Canonical period / timezone (`[start, endExclusive)`) | `resolveEvaluationsPeriod`, `resolveEvaluationsTimezone` | `backend/src/modules/evaluations-metrics/evaluations-period.resolver.ts` | E4 uses `scope.period` returned by the scope service (no independent date math) |

## 2. Finance authority (E3) — E4 MUST delegate

| Concern | Owner | File | E4 usage |
|---|---|---|---|
| Revenue / paid revenue / expenses / net result / margin / receivables | `EvaluationsFinanceService.computeFinancialInsights` → `FinancialInsightsResult` | `backend/src/modules/evaluations-finance/evaluations-finance.service.ts` | E4 Analytics Summary **Finance section delegates** here; station-scoped → E3 returns UNAVAILABLE (propagated). `E4_FINANCE_REIMPLEMENTATION_COUNT = 0` |
| Finance metric ids | `EVALUATIONS_FINANCE_METRIC_IDS` | same | E4 reuses these ids; no second finance namespace |
| Money arithmetic (BigInt, no float, currency-safe, no implicit EUR) | `shared/evaluations-finance/evaluations-money.ts` (+ `evaluations-fx.ts`) | shared | E4 Cost Model uses `sumMoneyByCurrency` / `addMoney` for all money |

## 3. Metric / status / response authority (E1)

| Concern | Owner | File | E4 usage |
|---|---|---|---|
| Metric registry (v1.4.0) + `requireEvaluationsMetricDefinition` | `evaluations-metric.registry.ts` | backend | E4 activates only metrics it canonically serves (see registry reconciliation) |
| 6-state status (AVAILABLE/PARTIAL/STALE/UNAVAILABLE/ERROR/NOT_APPLICABLE) + builders | `shared/evaluations-metrics/evaluations-metric-response.builder.ts` | shared | E4 sections/metrics built via these builders; no bespoke status enum |
| `SIGNED_PERCENT`, data coverage, comparison | metric-response contract/validator | shared | E4 utilization %/strength/weakness comparisons reuse these |

## 4. Existing analytics endpoints (reuse namespace, no competing API)

| Route | Owner | Serves today | E4 relationship |
|---|---|---|---|
| `GET /organizations/:orgId/evaluations/analytics/summary` | `EvaluationsAnalyticsController.summary` | Entity-reference aggregate (counts/groups), dark-gated | Kept intact; E4 adds capability routes under the **same namespace** `.../analytics/insights/*` (no `/analytics-v2`, `/summary2`) |
| `GET .../analytics/detail` | same | Entity-reference detail list | Untouched |
| `GET .../evaluations/finance/insights` | E3 finance controller | Canonical finance metrics | E4 delegates finance to its service (not this HTTP route) |

## 5. Existing insight calculators (avoid duplication)

| Capability | Existing owner | File | E4 decision |
|---|---|---|---|
| Low-utilization signal (idle vehicles, lost-revenue estimate) | `LowUtilizationDetector` | `backend/src/modules/business-insights/detectors/low-utilization.detector.ts` | E4 time-weighted utilization is a **distinct interval-based metric**; does not recompute the detector. E4 does not fork the detector |
| Station shortage / availability | `StationShortageDetector` | business-insights | Left as-is; E4 utilization coverage references station scope only |
| Fleet utilization % | Registry `ops.fleet_utilization_pct` (planned, unimplemented) | registry | **E4 becomes the canonical server** → activated (degraded). **E4.1C:** served as coverage-limited `PARTIAL` (scheduled occupancy, unknown blocked, approximate eligibility); calc version bumped `1.0.0 → 2.0.0`; station-scope fails closed |
| Strengths / weaknesses counts | Registry `ops.strengths_count` / `ops.weaknesses_count` (planned) | registry | **E4 becomes canonical server** → activated (degraded: evidence-gated) |
| Cost aggregation | none (only E3 finance expenses) | — | E4 Cost Model is analytical cost (distinct from E3 accounting expense); exposed as section envelope with own calculationVersion |
| Strength/weakness/driver rule engines | none on current main | — | New deterministic rule engines (reimplemented from historical intent) |

## 6. Source schema realities that force fail-closed behavior

- **No continuous vehicle→station history** (only `VehicleStationTransfer` events + current `homeStationId`). → Station-scoped historical utilization/cost **fail closed / PARTIAL** (`CURRENT_STATION_RETROACTIVE_HISTORY_COUNT = 0`, `COST_STATION_ORG_FALLBACK_COUNT = 0`).
- **No org cost-config / depreciation model.** → No fabricated cost constants; missing sources → UNAVAILABLE (`UNPROVEN_COST_ESTIMATE_COUNT = 0`).
- **No separate Driver table** — drivers are `Customer` records (org-scoped via `organizationId`; booking actor via `customerId` / `assignedDriverId` / `BookingAllowedDriver` / `DriverAttribution`). → Driver analysis scopes through `Customer` + org filter (`CROSS_TENANT_DRIVER_ANALYSIS_LEAK_COUNT = 0`).
- **ServiceCase / VehicleDamage have no per-row currency.** → org reporting currency (`OrganizationPaymentAccount.defaultCurrency`) is the documented authority (not implicit EUR); `OrgInvoice.currency` is explicit and may be mixed → per-currency segmentation (`COST_IMPLICIT_CURRENCY_COUNT = 0`, `COST_MIXED_CURRENCY_FALSE_TOTAL_COUNT = 0`).

## 7. Canonical E4 serving path

```
authenticated request (OrgScopingGuard/RolesGuard/PermissionsGuard/FeatureGuard)
  → EvaluationsAnalyticsScopeService.resolveAuthorizedScope (E2 scope + E1 period)
  → EvaluationsAnalyticsInsightsService (single E4 orchestration authority)
    → EvaluationsFinanceService.computeFinancialInsights (E3 finance section)
    → E4 capability services (cost / utilization / strength / weakness / driver)
      → tenant-scoped E4 repositories (explicit organizationId on every query)
        → canonical source facts (Booking, ServiceCase, VehicleDamage, OrgInvoice, Vehicle, Customer)
    → pure deterministic domain builders → E1-compatible section envelopes
```

`PARALLEL_ANALYTICS_TRUTH_COUNT = 0` — one orchestration service; finance delegated to E3; period/scope delegated to E2/E1.
