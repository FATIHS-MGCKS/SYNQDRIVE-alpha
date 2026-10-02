# M3.3-HV-H3 — Method-specific descriptive longitudinal trend (2026-09-30)

## Position

H3 V1 is **DESCRIPTIVE_LONGITUDINAL_TREND_ONLY** on **calendar time** (`exposureAxis = CALENDAR_TIME`).

It is **not** a validated degradation model, not ground-truth calibrated, and not customer-safe.

**A negative calendar-time slope is not labeled degradation.**

## Evidence input

H3 consumes **only** `M3_3_HV_H2_LONGITUDINAL_INPUT_REPORT_V1` (no parallel raw reload in the pure model).

Eligible H2 candidates (`eligible`, `VALID`, finite `numericValue`) enter series construction.

## M2 session balancing

Raw M2 observations are **not** fitted directly. One **session median** point per `sessionId` (`M2_SESSION_MEDIAN`).

## M3 / provider

- M3: `VALIDATION_ONLY`, `primaryTrendEligible = false`
- Provider SOH: partitioned by `provider` (no cross-provider pooling)

## Estimator

`THEIL_SEN_MEDIAN_PAIRWISE_SLOPE_V1` — median of pairwise slopes on elapsed days; descriptive intercept/fitted endpoints only within observed range.

## Boundaries

- No customer health score / publication
- No H3 persistence table / automatic runtime
- GT validation anchors → `validationContext[]` only (not regression points)
- `SHADOW_ROLLING_MEDIAN` cross-session shadow → legacy audit context only

## Operator CLI

`npm run battery:hv-h3:trend-report -- --organization-id=... --vehicle-id=... [--evaluation-at=...]`

Production DB requires `BATTERY_HV_H3_ALLOW_PRODUCTION_READONLY=true`.
