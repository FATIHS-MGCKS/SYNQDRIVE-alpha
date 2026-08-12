# Phase 3 — E6A Canonical Frontend Data Layer — Test Report (2026-08)

TESTED_CODE_SHA: `582cbe0c58e6da09b3f322110a251e41501311b3`
Branch: `integration/evaluations-e6-canonical-frontend-2026-08` (PR #1026, Draft, base main)
Base main (A): `a704fdcca76f03703a0816f71a4d11ffdbaf4292`

## New unit tests

| Suite | Tests | Covers |
|-------|------:|--------|
| `evaluations-money.test.ts` | 11 | EUR/USD/JPY(0-dec)/KWD(3-dec) formatting; same amountMinor differs by currency; missing/invalid currency → null (no EUR default, no /100); mixed-currency partition (never summed); value-bearing status gate |
| `evaluations-canonical.test.ts` | 14 | result mapping AVAILABLE / 404→FEATURE_DISABLED / 403→UNAUTHORIZED / 500+network→ERROR; scope-safe query keys (distinct period, station order-normalized, null vs [], cross-org, dedup, finance ignores period, capability distinct); driver tiers full/pseudonymous/none preserved verbatim |

Result: SUITE_COUNT 2, TEST_COUNT 25, PASSED 25, FAILED 0, SKIPPED 0.

Category mapping to mandated cases (§36–§40):
- Money tests: EUR/USD/JPY/KWD + no-default-EUR + missing-currency + mixed-currency ✓
- Status/period tests: 6-state preserved in transport types (type-level); query-key period/station/capability ✓
- Query-key tests: distinct period/station/capability, dedup same inputs, no cross-org collision ✓
- Privacy tests: piiTier none/pseudonymous/full preserved; no local ID lookup (client performs none) ✓
- Feature-state tests: 404 → FEATURE_DISABLED (never legacy fallback / empty / zero) ✓

## Regression (existing evaluations/finance frontend suites)

`vitest run src/rental/lib/evaluations src/rental/lib/finance-insights-adapter.test.ts
src/rental/lib/financial-insights.serving-path.test.ts
src/rental/components/finance-navigation.test.ts`:
10 files, 92 tests, all passed (includes the 2 new E6A suites). No regression.

## Quality gates (on TESTED_CODE_SHA)

| Gate | Result |
|------|--------|
| frontend typecheck (`tsc -b`) | PASS (0) |
| frontend production build (`vite build`) | PASS |
| targeted lint (6 new E6A files) | PASS (0) |
| `src/lib/api.ts` lint | pre-existing `no-explicit-any` debt only; E6A-added ranges add 0 new errors (baseline-identical) |

Baseline A/B: `api.ts` `no-explicit-any` errors exist identically on `A =
a704fdcc` (main) and `B = 582cbe0c`; classification PRE_EXISTING_IDENTICAL. No
backend gates required (no backend change). `NEW_E6_FAILURE_COUNT = 0`,
implementation-critical `UNKNOWN_COUNT = 0`.

## Counters (all 0 unless noted)

FRONTEND_CONTRACT_DIVERGENCE_COUNT 0; NEW_DUPLICATE_BUSINESS_CALCULATION_COUNT 0;
DUPLICATE_CANONICAL_REQUEST_COUNT 0; N_PLUS_ONE_REQUEST_COUNT 0;
CLIENT_SIDE_QUALITY_SCORE_COUNT 0; CLIENT_SIDE_QUALITY_AUTHORITY_COUNT 0;
CLIENT_SIDE_FRESHNESS_AUTHORITY_COUNT 0; CLIENT_SIDE_PII_AUTHORITY_COUNT 0;
CLIENT_SIDE_IDENTITY_RECONSTRUCTION_COUNT 0; LEGACY_ANALYTICS_FALLBACK_COUNT 0;
LEGACY_NONCANONICAL_ANALYTICS_IN_E6_COUNT 0; RAW_ENTITY_RECOMPUTATION_FALLBACK_COUNT 0;
FEATURE_DISABLED_AS_EMPTY_COUNT 0; FINANCE_PERIOD_RECALCULATION_COUNT 0;
GLOBAL_FILTER_FALSE_SCOPE_COUNT 0; CLIENT_SIDE_STATION_RECONSTRUCTION_COUNT 0;
CACHE_SCOPE_COLLISION_COUNT 0; IMPLICIT_CURRENCY_FORMATTING_COUNT 0;
HARDCODED_EUR_FOR_GENERIC_MONEY_COUNT 0; CLIENT_SIDE_CURRENCY_INFERENCE_COUNT 0;
MIXED_CURRENCY_CLIENT_SUM_COUNT 0; UNAUTHORIZED_MONEY_RECONSTRUCTION_COUNT 0;
STATUS_COLLAPSE_COUNT 0; UNKNOWN_TO_ZERO_ADAPTER_COUNT 0; QUALITY_STATE_COLLAPSE_COUNT 0;
SECOND_EVALUATIONS_PAGE_COUNT 0; E7_RUNTIME_SCOPE_COUNT 0; E8_RUNTIME_SCOPE_COUNT 0;
E9_RUNTIME_SCOPE_COUNT 0; BACKEND_RUNTIME_CHANGE_COUNT 0; PRISMA_CHANGE_COUNT 0;
MIGRATION_CHANGE_COUNT 0; PRODUCTION_CONFIG_CHANGE_COUNT 0; PRODUCTION_DEPLOYMENT_COUNT 0;
NEW_E6_FAILURE_COUNT 0; UNKNOWN_COUNT 0 (implementation-critical).

EXPECTED_INITIAL_REQUEST_COUNT = 2 (E4 summary + E5 quality) for core sections; +1
lazy person-level driver-analysis request.

## E6A.1 Independent Review Correction — Test Report (2026-08-12)

E6A1_TESTED_CODE_SHA: `e26ed3da638d1854656a237a9acceea2c1070e1c`.

New/updated tests in `evaluations-canonical.test.ts`:
- Result mapping: 200→AVAILABLE, 403→UNAUTHORIZED, generic 404→NOT_FOUND (asserts
  NOT `FEATURE_DISABLED`), 500/network→ERROR; plus an invariant test that the mapper
  NEVER emits `FEATURE_DISABLED` for any status (no reliable discriminator).
- Organization lifecycle (pure helpers used by the hooks): `orgFetchState(null|
  undefined|'')`→IDLE, `orgFetchState('org')`→LOADING; `settledResult` returns the
  result only when SETTLED.
- Race safety: `shouldApplyResponse` discards org A response after switching to B,
  discards on removed org (null active key), and guards period/station scope changes.

Counts: `evaluations-canonical.test.ts` 19 tests (was 14), `evaluations-money.test.ts`
11 tests → E6A suites TEST_COUNT 30, PASSED 30, FAILED 0, SKIPPED 0. Focused
regression (evaluations + finance-adapter + finance-navigation): 9 files / 94 tests
passed. Frontend typecheck 0, `vite build` OK, targeted lint 0.

Corrected counters (all 0): `HTTP_404_ALWAYS_FEATURE_DISABLED_COUNT`,
`FEATURE_DISABLED_FALSE_POSITIVE_COUNT`, `STALE_ORGANIZATION_DATA_COUNT`,
`PERMANENT_NULL_ORG_LOADING_COUNT`, `STALE_SCOPE_RESPONSE_OVERWRITE_COUNT`,
`LEGACY_ANALYTICS_FALLBACK_COUNT`, `NEW_DUPLICATE_BUSINESS_CALCULATION_COUNT`,
`CLIENT_SIDE_QUALITY_AUTHORITY_COUNT`, `CLIENT_SIDE_PII_AUTHORITY_COUNT`,
`CLIENT_SIDE_IDENTITY_RECONSTRUCTION_COUNT`, `UNAUTHORIZED_MONEY_RECONSTRUCTION_COUNT`,
`MIXED_CURRENCY_CLIENT_SUM_COUNT`, `UNKNOWN_TO_ZERO_ADAPTER_COUNT`,
`E7/E8/E9_RUNTIME_SCOPE_COUNT`, `BACKEND_RUNTIME_CHANGE_COUNT`, `PRISMA_CHANGE_COUNT`,
`MIGRATION_CHANGE_COUNT`, `PRODUCTION_CONFIG_CHANGE_COUNT`, `PRODUCTION_DEPLOYMENT_COUNT`,
`NEW_E6_FAILURE_COUNT`, `IMPLEMENTATION_CRITICAL_UNKNOWN_COUNT`.
