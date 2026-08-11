# Phase 3 – E4 Tenant-Safe Analytics Backend — Test Report (2026-08)

> **E4.1 correction note (2026-08-11).** The original E4 pass reported `E4_READY_FOR_POST_IMPLEMENTATION_AUDIT`; that historical claim is retained below for the audit trail. Subsequent independent audit passes (E4.1A/B/C) corrected defects on the same branch. In particular, the original claim that the Utilization section/metric could be `AVAILABLE` with numeric-zero fields on unavailable/error paths is **SUPERSEDED_BY_E4_1**: utilization is now served as coverage-limited `PARTIAL` (scheduled occupancy, unknown blocked, approximate eligibility) and all unobserved numeric quantities are `null`, never `0`. See `phase3-e4-1-final-source-authority-analytics-acceptance-2026-08.md`.


- `TESTED_CODE_SHA` = `4f5d20d0cfa2570c6f5b2c3d4385e31d86b37902`
- `E4_BASE_MAIN_SHA` = `cefeedfe7dcfd7f682ba5b80fad1fec37d4a6c0f`
- Runner: Jest (backend, ts-jest), Node v22.14.0

## Suites & counts

### E4 suites (`src/modules/evaluations-analytics/e4`)
| Suite | Tests | Result |
|---|---|---|
| `domain/evaluations-interval.spec.ts` | 9 | PASS |
| `domain/evaluations-cost.domain.spec.ts` | 7 | PASS |
| `domain/evaluations-utilization.domain.spec.ts` | 10 | PASS |
| `domain/evaluations-detection.domain.spec.ts` | 11 | PASS |
| `domain/evaluations-driver.domain.spec.ts` | 5 | PASS |
| `evaluations-insights.service.spec.ts` | 8 | PASS |
| **E4 total** | **50** | **PASS** |

Command: `npx jest src/modules/evaluations-analytics/e4` → 6 suites, 50 passed.

### Regression (E1 + E2 + E3 + E4)
Command: `npx jest src/modules/evaluations-metrics src/modules/evaluations-analytics src/modules/evaluations-finance`
- Result: **29 passed suites, 1 skipped suite; 371 passed, 4 skipped, 0 failed.**
- E1: metric registry (version 1.5.0, i18n, snapshot, calc-version sync), period/timezone resolver, metric-response, calculation provenance, shared-contract mirror sync — PASS.
- E2: analytics scope service, station-policy, tenant-isolation, HTTP/input security, validator, feature guard, status authority, entity-reference repository/resolver/write — PASS.
- E3: money, fx, finance calculator, finance controller, registry ownership — PASS.
- No E1/E2/E3 regression from E4 (only registry version bump 1.4.0→1.5.0 + `ops.fleet_utilization_pct` activation).

## Mandatory fixture coverage

- Analytics Summary (STEP 60): authorized org summary; station fail-closed; finance delegated to E3; independent section failure survives; no false zero; no unsafe financial exposure — service spec.
- Cost Model (STEP 61): observed single/multiple categories; linked duplicate deduped; future record excluded; mixed EUR/USD segmented (no false total); explicit zero kept; missing source → UNAVAILABLE (not zero) — cost domain + service spec.
- Utilization (STEP 62): fully/partial/no rental; overlapping rentals ≤100% + flagged; interval before/inside/after; maintenance/blocked reduce capacity; telemetry offline not downtime; denominator zero → null; never >100% — utilization domain + service spec.
- Strength (STEP 63): previous-period improvement; target exceeded; insufficient coverage/vehicles/comparator emits nothing; stable ordering; dedup — detection domain.
- Weakness (STEP 64): deterioration; target miss; severity ordering; no false weakness from missing data; tiny sample; OBSERVATION only; no forecast — detection domain.
- Driver (STEP 65): adequate/insufficient sample; deterministic tie-break; association-only relationship; aggregation before gating; skip insufficient dimension — driver domain.

## Quality gates

| Gate | Command | Result |
|---|---|---|
| Backend typecheck | `npx tsc -p tsconfig.build.json --noEmit` | PASS (exit 0) |
| Backend build | `npm run build` (nest build) | PASS (exit 0) |
| Frontend typecheck | `npx tsc -b` | PASS (exit 0) |
| Prisma | `npx prisma validate` | Valid; no schema diff (`E4_SCHEMA_MIGRATION_REQUIRED = NO`) |
| Lint (E4 files) | `npx eslint "src/modules/evaluations-analytics/e4/**/*.ts"` | PASS (exit 0) |

## Baseline A/B (exact-head CI on PR #1024, `PR_HEAD_SHA = 06def405`)

The repository has pre-existing global-red CI gates. Every failing check was classified against the exact PR head; none touch E4/evaluations files.

| CI check | Result | Classification | Evidence |
|---|---|---|---|
| Backend unit tests | PASS | — | includes all evaluations suites |
| Production build | PASS | — | both workflow runs |
| Prisma validate | PASS | — | no schema change |
| Frontend component tests | PASS | — | — |
| Backend security tests | PASS | — | — |
| Accessibility (axe) | PASS | — | — |
| Typecheck (`tsc -p tsconfig.json`, incl. specs) | fail | PRE_EXISTING_IDENTICAL | 4 errors, all in `src/modules/billing/*.spec.ts` + `src/modules/workflows/workflow-dry-run.service.spec.ts` — files E4 never touched; local candidate `tsc -p tsconfig.json` reproduces exactly these 4 and zero E4/evaluations errors |
| Lint (`npm run lint:all`, whole repo) | fail | PRE_EXISTING_IDENTICAL | `no-control-regex`/`no-fallthrough`/`no-useless-catch`/`no-empty-object-type` in pre-existing files; `eslint src/modules/evaluations-analytics/e4/**` passes clean; passes in the sibling workflow run |
| Backend integration tests | fail | ENVIRONMENT_SPECIFIC | `P3018 relation "vehicle_trips" does not exist` during `prisma migrate deploy` — pre-existing migration chain; E4 adds no migration |
| Migration tests (PostgreSQL) | fail | ENVIRONMENT_SPECIFIC | same `vehicle_trips` migration failure |
| Security / dependency scan | fail | PRE_EXISTING_IDENTICAL | `npm audit` vulnerabilities in existing deps; passes in sibling run |
| Playwright E2E (Vehicle Detail) | fail | PRE_EXISTING/ENVIRONMENT | UI E2E; E4 makes no frontend change |

`CHECK_RUN_HEAD_SHA = 06def405eb7dbe17ea6d6a9e96b305182b6cf1c0` (matches `PR_HEAD_SHA`). No stale check evidence.

`NEW_E4_FAILURE_COUNT = 0`, `UNKNOWN_COUNT = 0`. The E4-relevant gates (backend unit tests incl. evaluations, production build, Prisma validate) are green; the red gates are pre-existing/environment and independent of this change.

## Diff scope audit (STEP 78)

`git diff --name-status cefeedfe…HEAD`: only E4 analytics backend (`e4/**`), the registry activation (3 files), `app.module.ts` registration, and `docs/audits/pr-recovery/` evidence. No E5 DQ, E6 UI, E7 actions, E8 predictive, E9 forecast, or unrelated refactors. `E5_E9_SCOPE_LEAK_COUNT = 0`.

## Final counters

| Counter | Value |
|---|---|
| PARALLEL_ANALYTICS_TRUTH_COUNT | 0 |
| E4_FINANCE_REIMPLEMENTATION_COUNT | 0 |
| UNSAFE_FINANCIAL_EXPOSURE_REINTRODUCTION_COUNT | 0 |
| FALSE_ZERO_ANALYTICS_COUNT | 0 |
| CROSS_TENANT_ANALYTICS_READ_LEAKAGE_COUNT | 0 |
| STATION_SCOPE_ANALYTICS_LEAKAGE_COUNT | 0 |
| ORG_FALLBACK_ON_STATION_SCOPE_COUNT | 0 |
| COST_DOUBLE_COUNT_COUNT | 0 |
| UNPROVEN_COST_ESTIMATE_COUNT | 0 |
| COST_FLOAT_MONEY_COUNT | 0 |
| COST_MIXED_CURRENCY_FALSE_TOTAL_COUNT | 0 |
| COST_IMPLICIT_CURRENCY_COUNT | 0 |
| COST_STATION_ORG_FALLBACK_COUNT | 0 |
| OVERLAPPING_INTERVAL_DOUBLE_COUNT_COUNT | 0 |
| UTILIZATION_OVER_100_COUNT | 0 |
| AVAILABLE_READY_CONFLATION_COUNT | 0 |
| TELEMETRY_OFFLINE_DOWNTIME_MISCLASS_COUNT | 0 |
| CURRENT_STATION_RETROACTIVE_HISTORY_COUNT | 0 |
| STRENGTH_INSUFFICIENT_EVIDENCE_COUNT | 0 |
| WEAKNESS_INSUFFICIENT_EVIDENCE_COUNT | 0 |
| STRENGTH_WEAKNESS_CONTRADICTION_COUNT | 0 |
| DUPLICATE_DETECTION_COUNT | 0 |
| DRIVER_SCOPE_MISMATCH_COUNT | 0 |
| CROSS_TENANT_DRIVER_ANALYSIS_LEAK_COUNT | 0 |
| DRIVER_INSUFFICIENT_SAMPLE_RESULT_COUNT | 0 |
| DRIVER_CAUSAL_CLAIM_COUNT | 0 |
| DRIVER_PARENT_KPI_REIMPLEMENTATION_COUNT | 0 |
| SUMMARY_DIRECT_ENDPOINT_MISMATCH_COUNT | 0 |
| ACTIVE_BUT_NOT_CANONICALLY_SERVED | 0 |
| NON_DETERMINISTIC_E4_RESULT_COUNT | 0 |
| E5_SCOPE_LEAK_COUNT | 0 |
| E6_UI_SCOPE_LEAK_COUNT | 0 |
| E7_SCOPE_LEAK_COUNT | 0 |
| E8_SCOPE_LEAK_COUNT | 0 |
| E8_FORECAST_IMPLEMENTATION_LEAK_COUNT | 0 |
| NEW_E4_FAILURE_COUNT | 0 |
| UNKNOWN_COUNT | 0 |

## Safety

- MERGE_PERFORMED = NO
- PRODUCTION_MIGRATION_PERFORMED = NO
- PRODUCTION_DEPLOYMENT_PERFORMED = NO
- HISTORICAL_DRAFT_PRS_CLOSED = 0
- HISTORICAL_BRANCHES_DELETED = 0
- E5_STARTED = NO, E6_STARTED = NO, E7_STARTED = NO, E8_STARTED = NO, E9_STARTED = NO
