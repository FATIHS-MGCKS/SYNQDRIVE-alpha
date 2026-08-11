# Evaluations E4 — Tenant-Safe Analytics Backend (2026-08-11)

## Changes

- Added the canonical E4 analytics backend under
  `backend/src/modules/evaluations-analytics/e4/`:
  - `domain/` — pure, deterministic, framework-free builders:
    - `evaluations-interval.ts` — half-open interval algebra (clip, union/merge,
      overlap count, subtract/intersect); DST-safe via absolute-instant ms.
    - `evaluations-cost.domain.ts` — cost aggregation: economic-key dedup
      (invoice > recorded > estimate), per-currency money-safe totals, business-
      timestamp period attribution.
    - `evaluations-utilization.domain.ts` — time-weighted utilization
      (netCapacity = eligibleCapacity − downtime; rentedEffective = rented −
      downtime); overlap-safe; ratio ∈ [0,1]; telemetry offline is never
      downtime.
    - `evaluations-detection.domain.ts` — deterministic strength/weakness rules,
      evidence gates, severity ordering, reconciliation (no contradictions).
    - `evaluations-driver.domain.ts` — association-only influence with sample
      gates and a correlation-not-causation disclaimer.
  - `contracts/evaluations-insights.contract.ts` — section envelopes composing E1
    `EvaluationsMetricResponse`/status + stable E4 calculation versions.
  - `evaluations-insights.repository.ts` — tenant-scoped source access (every
    query filtered by `organizationId`) for cost/utilization/driver/bookings.
  - `evaluations-insights.service.ts` — the single E4 orchestration authority;
    reuses E2 scope + E3 finance; per-section failure isolation; station-scope
    fail-closed.
  - `evaluations-insights.controller.ts` — routes under the existing analytics
    namespace `…/evaluations/analytics/insights/*` (no competing API), same
    guards + feature flag + permission.
  - `evaluations-insights.module.ts` — imports analytics + finance modules
    (avoids the finance→analytics cycle).
- Registered `EvaluationsInsightsModule` in `app.module.ts`.
- Registry: activated `ops.fleet_utilization_pct` (`planned` → `active_degraded`)
  as canonically served by E4 (org-scope time-weighted; station-scope fail-
  closed); bumped `EVALUATIONS_METRIC_REGISTRY_VERSION` 1.4.0 → 1.5.0.
- No Prisma schema change (`E4_SCHEMA_MIGRATION_REQUIRED = NO`); no frontend
  change (E6 UI boundary preserved).
- Evidence docs under `docs/audits/pr-recovery/` (reconstruction / authority /
  cost-source matrices + implementation + test reports).

## Architektur

- **Single analytics authority.** `EvaluationsInsightsService` is the one E4
  orchestration truth. Finance is delegated verbatim to the E3
  `EvaluationsFinanceService` (no second revenue/expense/margin/receivables
  truth). Scope/period/timezone are delegated to E2/E1. Money uses the E1/E3
  BigInt money helpers (`PARALLEL_ANALYTICS_TRUTH_COUNT = 0`,
  `E4_FINANCE_REIMPLEMENTATION_COUNT = 0`).
- **Serving path.** authenticated request → E2 `resolveAuthorizedScope`
  (org + station narrowing-only + E1 period) → `EvaluationsInsightsService` →
  E3 finance + E4 capability builders → tenant-scoped repositories → canonical
  source facts → E1-compatible section envelopes.
- **Fail-closed by data reality.** No continuous vehicle→station history →
  station-scoped cost/utilization/driver return UNAVAILABLE (never org fallback).
  No org cost-config → no fabricated cost constants. Missing evidence →
  UNAVAILABLE/omit, never a false zero.
- **Determinism.** All domain builders are pure; `generatedAt` is the only wall-
  clock input; ordering and identifiers are stable
  (`NON_DETERMINISTIC_E4_RESULT_COUNT = 0`).
- **Boundaries.** E5 (Data Quality), E6 (UI), E7 (Recommendations/Actions),
  E8 (Prediction/Forecast), E9 (Forecast UI) are not started; E4 exposes only
  local section coverage and association-only observations.
