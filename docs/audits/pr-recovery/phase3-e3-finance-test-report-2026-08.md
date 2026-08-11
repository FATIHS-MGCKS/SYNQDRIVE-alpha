# Phase 3 E3 — Finance Test Report

- `E3_BASE_MAIN_SHA` = `6acdb24eb84986b25789c01fb544645231c53dc5`
- `TESTED_HEAD_SHA` = `24bb9f0b0caf4428e99d384424a0dc6cd4e07f62` (finance implementation commit; evidence commit follows)
- Branch: `integration/evaluations-e3-money-finance-correctness-2026-08`

## Suite results

| Area | Result | Evidence |
|---|---|---|
| Money Domain | PASS | `evaluations-money.spec.ts` (22) |
| Money Precision (BigInt sum, overflow, decimal→minor) | PASS | `evaluations-money.spec.ts` |
| Money Migration | PASS (NOT_REQUIRED; decimal→minor determinism proven) | `evaluations-money.spec.ts`, money-migration report |
| Revenue | PASS | calculator + service specs (Fixture A) |
| Cashflow | PASS | calculator specs (Fixtures A/C) |
| Receivables | PASS | calculator + service specs (Fixture B, partial payment) |
| Result | PASS | calculator spec (net result, margin) |
| Multi-Currency | PASS | `evaluations-fx.spec.ts`, calculator + service specs |
| FX Provenance | PASS | `evaluations-fx.spec.ts` |
| False Zero | PASS | service spec (empty→AVAILABLE 0; no-currency→UNAVAILABLE) |
| Tenant Security | PASS | service spec (cross-tenant read = 0) |
| Station Security | PASS | service spec (station-scoped ⇒ UNAVAILABLE) |
| E1 Regression | PASS | `test:evaluations` (registry, metric-response, period, mirror sync) |
| E2 Regression | PASS | `test:evaluations` (analytics scope/station/tenant/entity-ref) |
| Prisma | PASS | `prisma validate` (dummy DATABASE_URL) — schema valid, no E3 change |
| Backend Build (typecheck) | PASS for E3 files; pre-existing baseline errors elsewhere | see A/B below |

E3 finance suite: **60 passed / 60** (4 suites).
`npm run test:evaluations`: **414 passed / 416**; the 2 failures are in
`business-insights/detectors/tire-critical.detector.spec.ts` (tire pressure —
unrelated to E3) and are byte-identical to base.

## Counters

- `NEW_E3_FAILURE = 0`
- `UNKNOWN = 0`
- `CROSS_TENANT_FINANCE_READ_LEAKAGE_COUNT = 0`
- `CROSS_TENANT_FINANCE_WRITE_LEAKAGE_COUNT = 0` (E3 adds no finance write path)
- `STATION_SCOPE_FINANCE_LEAKAGE_COUNT = 0`
- `MIXED_CURRENCY_FALSE_AGGREGATION_COUNT = 0`
- `IMPLICIT_CURRENCY_DEFAULT_COUNT = 0`
- `FLOAT_MONEY_AUTHORITY_COUNT = 0`
- `DOUBLE_COUNTING_FAILURE_COUNT = 0`
- `FALSE_ZERO_FINANCE_COUNT = 0`

## A/B baseline classification

Global gates that are red were classified by diffing the failing files against
`origin/main`:

| Gate | Failing files | `git diff origin/main` | Classification |
|---|---|---|---|
| Backend production typecheck | `billing/stripe-webhook.characterization.spec.ts`, `billing/stripe-webhook.service.spec.ts`, `workflows/workflow-dry-run.service.spec.ts` | empty (byte-identical) | PRE_EXISTING_IDENTICAL |
| Jest (evaluations run) | `business-insights/detectors/tire-critical.detector.spec.ts` | empty (byte-identical) | PRE_EXISTING_IDENTICAL |
| Prisma migration chain | `vehicle_trips` P3018 | pre-existing (E2 finding) | PRE_EXISTING_MIGRATION_BASELINE |

No E3-authored file appears in any failing gate. `NEW_E3_FAILURE = 0`,
`UNKNOWN = 0`.

## Production safety

- `MERGE_PERFORMED = NO`
- `PRODUCTION_MIGRATION_PERFORMED = NO`
- `PRODUCTION_DEPLOYMENT_PERFORMED = NO`
- `E4_STARTED = NO`
