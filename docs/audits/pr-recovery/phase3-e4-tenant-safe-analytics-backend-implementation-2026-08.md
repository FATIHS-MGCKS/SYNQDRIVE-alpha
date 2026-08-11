# Phase 3 – E4 Tenant-Safe Analytics Backend — Implementation Report (2026-08)

## Revision

- `E4_BASE_MAIN_SHA` = `cefeedfe7dcfd7f682ba5b80fad1fec37d4a6c0f` (E3 merge #1022; still main HEAD; `merge-base --is-ancestor` PASS)
- Branch = `integration/evaluations-e4-tenant-safe-analytics-backend-2026-08` (direct from current main)
- `TESTED_CODE_SHA` = `4f5d20d0cfa2570c6f5b2c3d4385e31d86b37902`
- Historical source refs (EVIDENCE ONLY — not cherry-picked): #773 `e65b88db` (summary), #780 `d96ba7a8` (cost), #782 `46f533af` (utilization), #783 `f5cfe0c5` (strength), #784 `32714750` (weakness), #786 `56b9efe2` (driver)

## Reconstruction

See `phase3-e4-source-reconstruction-matrix-2026-08.csv`. Each historical commit was inspected with `git show` and classified per file/hunk. The historical stack was built on a `business-insights` summary that recomputed finance directly, an EUR-only money filter, snapshot fleet utilization, DQ/recommendation leakage, and magnitude-based financial exposure. All of these were classified `REIMPLEMENT_FOR_CURRENT_ARCHITECTURE` / `SECURITY_UNSAFE` / `E5_SCOPE` / `E7_SCOPE` and reconciled against E1–E3. Intent reused: metric identities, formulas, interval semantics, evidence-gate thresholds, driver disclaimer/confounders.

## Canonical Architecture

One orchestration authority (`EvaluationsInsightsService`). Serving path: request → E2 `resolveAuthorizedScope` → E1 period → `EvaluationsInsightsService` → E3 finance + E4 capability builders → tenant-scoped repositories → E1-compatible section envelopes. `PARALLEL_ANALYTICS_TRUTH_COUNT = 0`.

## Analytics Summary

- Endpoint: `GET /organizations/:orgId/evaluations/analytics/insights/summary` (under the existing analytics namespace; guards `OrgScopingGuard`, `RolesGuard`, `PermissionsGuard`, `EvaluationsAnalyticsFeatureGuard`; permission `evaluations:read`). No `/analytics-v2`.
- Composes finance (E3-delegated), cost, utilization, strengths, weaknesses, driver influence.
- E2 scope + E1 period reused verbatim. Section failure isolation: each section is independently AVAILABLE/PARTIAL/UNAVAILABLE/ERROR; a failing section never zeroes others (`isolateAsync`/`isolate`).
- Finance delegation only (no invoice/payment re-query in E4). `E4_FINANCE_REIMPLEMENTATION_COUNT = 0`. No `estimatedFinancialExposure` / `financialImpactEur` (`UNSAFE_FINANCIAL_EXPOSURE_REINTRODUCTION_COUNT = 0`).

## Cost Model

- Categories: `OPERATING_EXPENSES` (incoming invoices, ACTUAL), `UNPLANNED_MAINTENANCE` (ServiceCase REPAIR/DIAGNOSTIC actualCostCents, ACTUAL), `DAMAGE_REPAIR` (VehicleDamage repairCostCents, ACTUAL), `ESTIMATED_FIXED_COSTS` (per-vehicle leasing/insurance/tax pro-rated, ESTIMATED). See `phase3-e4-cost-source-authority-matrix-2026-08.csv`.
- ACTUAL vs ESTIMATED explicit; each category carries formula + sources. Fixed-cost estimate is allowed only because it derives from explicit per-vehicle tenant config; no fabricated constants (`UNPROVEN_COST_ESTIMATE_COUNT = 0`).
- Money: per-currency BigInt aggregation via E1/E3 helpers. No float; no blended cross-currency total (mixed currency → PARTIAL, segmented). No implicit EUR (`COST_FLOAT_MONEY_COUNT`/`COST_MIXED_CURRENCY_FALSE_TOTAL_COUNT`/`COST_IMPLICIT_CURRENCY_COUNT` = 0).
- Double-count protection: economic-key dedup (`extraction:*` shared invoice↔damage; OrgTask-linked invoice key for service cases); invoice fact wins (`COST_DOUBLE_COUNT_COUNT = 0`).
- Period: business timestamp per source (invoiceDate/createdAt, completedAt, repairedAt); no future leak. Formula version `cost-model-e4-v1`.
- Station: no station lineage → station scope UNAVAILABLE, never org fallback (`COST_STATION_ORG_FALLBACK_COUNT = 0`).

## Utilization

- Formula: `utilization = Σ rentedEffective / Σ netCapacity`, `netCapacity = eligibleCapacity − downtime`, `rentedEffective = rented − downtime` (clipped to eligibility & period). Time-weighted, not snapshot. Version `utilization-model-e4-v1`; served metric `ops.fleet_utilization_pct`.
- Interval clipping to `[period.start, period.endExclusive)`; overlapping rentals unioned (`OVERLAPPING_INTERVAL_DOUBLE_COUNT_COUNT = 0`); ratio ≤ 1 by construction (`UTILIZATION_OVER_100_COUNT = 0`).
- Rented time = ACTIVE/COMPLETED bookings only (reserved/cancelled/no-show excluded). Maintenance/blocked from ServiceCase downtime (`blocksRental`); available ≠ ready-to-rent (`AVAILABLE_READY_CONFLATION_COUNT = 0`).
- Telemetry offline is counted informationally only, never downtime (`TELEMETRY_OFFLINE_DOWNTIME_MISCLASS_COUNT = 0`).
- DST: capacity is real elapsed ms of the period (23h/25h days handled). Station history unavailable → station-scoped utilization fails closed (`CURRENT_STATION_RETROACTIVE_HISTORY_COUNT = 0`). Denominator zero / missing lineage → UNAVAILABLE (no manufactured %).

## Strength Detection

- Rules: `HIGH_UTILIZATION` (ORG_TARGET ≥70%), `REVENUE_GROWTH` (PREVIOUS ≥+5%), `LOW_CANCELLATION_RATE` (ORG_TARGET ≤10%, ≥10 outcomes). Each carries ruleId/version/comparatorBasis/evidence/threshold/dimension. Version `strength-detection-e4-v1`.
- Evidence gates (min vehicles, coverage, comparator baseline, min outcomes) → insufficient evidence emits nothing (`STRENGTH_INSUFFICIENT_EVIDENCE_COUNT = 0`). Deterministic ordering + dedup.

## Weakness Detection

- Rules: `UNDERUTILIZATION` (<40%), `DECLINING_REVENUE` (≤−5%), `LOW_MARGIN` (<10%), `HIGH_CANCELLATION_RATE` (>10%). Severity from gap (INFO/WARNING/CRITICAL). Version `weakness-detection-e4-v1`.
- All evidence is OBSERVATION (no ESTIMATE/FORECAST) → E8 not implemented (`E8_FORECAST_IMPLEMENTATION_LEAK_COUNT = 0`). No weakness from missing/zero-from-unavailable/tiny sample (`WEAKNESS_INSUFFICIENT_EVIDENCE_COUNT = 0`). No recommendations (`E7_ACTION_SCOPE_LEAK_COUNT = 0`).
- Reconciliation: disjoint thresholds + assertion → no strength/weakness contradiction (`STRENGTH_WEAKNESS_CONTRADICTION_COUNT = 0`, `DUPLICATE_DETECTION_COUNT = 0`).

## Driver Influence

- Association-only decomposition over parent evidence (attributed counts); never recomputes parent KPIs (`DRIVER_PARENT_KPI_REIMPLEMENTATION_COUNT = 0`). Version `driver-influence-e4-v1`.
- Scope = parent scope (station-scoped parent → driver UNAVAILABLE, `DRIVER_SCOPE_MISMATCH_COUNT = 0`). Driver refs are org-scoped Customer ids from org-scoped rows (`CROSS_TENANT_DRIVER_ANALYSIS_LEAK_COUNT = 0`). Sample gate (min per-driver + min dimension total) → insufficient omitted (`DRIVER_INSUFFICIENT_SAMPLE_RESULT_COUNT = 0`). Disclaimer + confounders; ASSOCIATED_WITH/CORRELATES_WITH only (`DRIVER_CAUSAL_CLAIM_COUNT = 0`). Permission fail-closed via existing `evaluations:read` + E2 scope.

## Tenant Security / Station Scope

- Every repository query carries explicit `organizationId`; payment defense-in-depth pattern reused. `CROSS_TENANT_ANALYTICS_READ_LEAKAGE_COUNT = 0`.
- Requested station scope authorized by E2 (narrows, never widens). Station scope with insufficient lineage fails closed / PARTIAL; never org fallback (`STATION_SCOPE_ANALYTICS_LEAKAGE_COUNT = 0`, `ORG_FALLBACK_ON_STATION_SCOPE_COUNT = 0`).
- No cache introduced (no cross-tenant/cross-station reuse risk).

## E1 / E2 / E3 Integration

- E1: metric-response builders + status + period + registry reused; utilization served metric uses registry `calculationVersion`.
- E2: `EvaluationsAnalyticsScopeService.resolveAuthorizedScope` sole scope authority.
- E3: `EvaluationsFinanceService.computeFinancialInsights` sole finance authority (delegated).

## Registry

- `ops.fleet_utilization_pct` → `active_degraded` (served org-scope, station-scope fail-closed). Registry version 1.4.0 → 1.5.0.
- `ops.strengths_count` / `ops.weaknesses_count` remain `planned` (E4 serves rule-based sections, not the count metric responses). Cost KPIs are section-local envelopes (own `cost-model-e4-v1` version), not registry metrics. `ACTIVE_BUT_NOT_CANONICALLY_SERVED = 0`.

## Performance

- Bounded, aggregated queries: cost/utilization/driver each use a small fixed number of `findMany`/`count` calls bounded by the period window and `organizationId`; no per-vehicle/per-driver N+1 loops. Booking outcomes use `count`. Domain aggregation is O(records). No unbounded historic scans (all filtered by period window).

## Residual Limitations

- Station-scoped cost/utilization/driver are fail-closed (schema lacks continuous vehicle→station history and station-attributed cost) — correct per policy, but limits station drill-down until lineage exists.
- Revenue-growth strength/weakness only emit when the E3 finance metric carries a previous-period comparison; current E3 responses omit comparison, so those rules stay evidence-gated silent in production (safe).

## Explicit Deferrals (E5–E9)

- E5 Data Quality, E6 UI, E7 Recommendations/Actions, E8 Prediction/Forecast, E9 Forecast UI — NOT started. E4 exposes only local section coverage and association-only observations.
