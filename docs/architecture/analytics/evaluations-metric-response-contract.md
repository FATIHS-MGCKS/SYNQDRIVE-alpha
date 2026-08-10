# Evaluations Metric and KPI Response Contract

**Schema version:** 1.0.0
**Scope:** Phase 3 E1 contract foundation

## Canonical response

`shared/evaluations-metrics/evaluations-metric-response.contract.ts` is the shared
backend/frontend authority for metric status, value, period, comparison, coverage,
freshness, calculation version, exclusions, and warnings.

Every response includes:

- stable registry `metricId`;
- `metricKind` (`OBSERVED`, `DERIVED`, `RULE_BASED_ESTIMATE`,
  `STATISTICAL_FORECAST`, or `ML_FORECAST`);
- typed `valueType` and `unit`;
- explicit status;
- UTC `generatedAt` and canonical business period;
- formula `calculationVersion`;
- nullable typed comparison, coverage, and source-freshness metadata;
- non-null exclusion and warning arrays.

## Status semantics

| Status | Value rule |
|---|---|
| `AVAILABLE` | Explicit non-null value; numeric zero is valid. |
| `PARTIAL` | Explicit non-null value plus incomplete `dataCoverage`. |
| `STALE` | Explicit non-null value plus `sourceFreshness.state=STALE`. |
| `UNAVAILABLE` | `value=null`; never a numeric placeholder. |
| `ERROR` | `value=null`; never a numeric placeholder. |
| `NOT_APPLICABLE` | `value=null`; never a numeric placeholder. |

Coverage describes source/record completeness only. It is not confidence or a data
quality score. Freshness describes analytics source age and is not a vehicle
telemetry state.

## Money foundation

Money uses `{ amountMinor, currency }`, where `amountMinor` is a safe integer and
`currency` is an uppercase ISO-4217 code. A money response must use
`valueType=MONEY` and `unit=CURRENCY_MINOR`; currency is never inferred.

This is only the E1 transport foundation. Currency conversion, FX provenance,
historical field migration, reconciliation, and backfill belong to E3.

## Comparison semantics

Comparisons carry typed current/comparison periods, absolute delta, percentage
delta, and status. A zero baseline yields `percentageDelta=null`, never
`Infinity`/`NaN`. Consumers must not recompute comparisons in React components.

## Runtime validation and compatibility

The shared validator is dependency-free and enforces all discriminants and
invariants. Builders require explicit values for available/partial/stale responses
and emit null for unavailable/error/not-applicable responses.

The response contract is additive on current main: no existing API payload or route
is replaced in E1. Existing consumers continue unchanged until later packages bind
their backend services to this contract.
