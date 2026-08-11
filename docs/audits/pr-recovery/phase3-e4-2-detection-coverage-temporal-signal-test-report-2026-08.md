# Phase 3 – E4.2 Detection Coverage & Temporal Signal — Test Report (2026-08)

- `TESTED_CODE_SHA` = `f11b56d859bedcfdaf38ad189b76f52373464335`
- `PRE_E4_2_HEAD` = `f25b1d72f69b01f7b191050b4607ebd953510495` (E4.1C ancestor confirmed)
- `CURRENT_MAIN_SHA` = `cefeedfe7dcfd7f682ba5b80fad1fec37d4a6c0f`
- PR `#1024` (OPEN, DRAFT), same branch. No schema change.

## Scope of change

Runtime: `contracts/evaluations-insights.contract.ts` (detection dimension fields, telemetry snapshot field, detection calc `v3`), `evaluations-insights.service.ts` (per-dimension source gating, coverage roll-up, telemetry temporal handling, stale-comment fix), `evaluations-insights.repository.ts` (class-doc correction). Tests: service spec (E4.2 suite). Docs: detection input authority matrix + reports.

## Detection input authority

Per-rule source status / coverage / evidence gates: `phase3-e4-detection-input-authority-matrix-2026-08.csv`. Every rule accepts only an `AVAILABLE` source dimension; a PARTIAL/UNAVAILABLE dimension is skipped with a recorded reason and never contributes AVAILABLE evidence.

## New tests (STEP 28)

| Test | Result |
|---|---|
| PARTIAL utilization → no fully-AVAILABLE HIGH_UTILIZATION (section PARTIAL, UTILIZATION skipped) | PASS |
| PARTIAL utilization (30%) → no fully-AVAILABLE UNDERUTILIZATION | PASS |
| AVAILABLE utilization signal still yields HIGH_UTILIZATION (detection domain rule test) | PASS |
| Skipped utilization dimension → detection section PARTIAL | PASS |
| Empty items + skipped dimension → PARTIAL (not AVAILABLE) | PASS |
| Historical period ignores current `latestState.online` (telemetry null, snapshotAsOf null) | PASS |
| Current telemetry snapshot does not change utilization calculation | PASS |
| Summary preserves detection PARTIAL status | PASS |

## Suites & counts

| Command | Result |
|---|---|
| `npx jest src/modules/evaluations-analytics/e4` (+ registry) | 9 suites, **96 passed** (incl. live-Postgres integration) |
| `npx jest src/modules/evaluations-metrics src/modules/evaluations-analytics src/modules/evaluations-finance` | 31 passed suites, **392 passed**, 4 skipped, 0 failed |

## A/B/C regression

- **E4.1A** (tenant/driver): foreign driver, customer≠driver, Task→foreign invoice, foreign vehicle, sample gates — PASS (real-Postgres adversarial spec).
- **E4.1B** (cost): currency provenance, unknown ServiceCase/Damage currency, fixed-cost periodicity, historical config, dedup, mixed currency, station scope — PASS.
- **E4.1C** (utilization/detection): UNAVAILABLE/ERROR ≠ zero, PARTIAL utilization, blocked unknown, eligibility coverage, scheduled occupancy, DST 23h/25h, overlap union, ≤100%, platform-threshold labeling — PASS.

## E1/E2/E3 regression

E1 (registry v1.6.0, calc-version sync shared↔backend, status/PARTIAL, period/timezone, money, mirror) · E2 (tenant/station security) · E3 (money/fx/finance/receivables/multi-currency) — PASS, no regression.

## Quality

| Gate | Result |
|---|---|
| Backend typecheck | PASS |
| Backend build (`nest build`) | PASS |
| Prisma validate | Valid; no schema diff |
| Lint (E4) | PASS |
| Frontend typecheck (`tsc -b`) | PASS |

Pre-existing global-red CI gates vs `CURRENT_MAIN_SHA` (Typecheck-with-specs `billing`/`workflows`, `lint:all`, integration/migration `vehicle_trips`, dependency scan, Playwright) = `PRE_EXISTING_IDENTICAL` / `ENVIRONMENT_SPECIFIC`; none touch E4. `NEW_E4_FAILURE = 0`, `UNKNOWN = 0`.

## Calculation version review

| Capability | Old | New | Bumped | Reason |
|---|---|---|---|---|
| Strength Detection | `strength-detection-e4-v2` | `strength-detection-e4-v3` | YES | PARTIAL sources no longer accepted as full evidence; coverage roll-up (E4.2) |
| Weakness Detection | `weakness-detection-e4-v2` | `weakness-detection-e4-v3` | YES | Same as strength |
| Utilization / Cost / Driver / Summary | unchanged | unchanged | NO | No semantic change this pass |

Registry: detection is section-local (no registry metric) → no registry version change. `ops.fleet_utilization_pct` unchanged (2.0.0). `ACTIVE_BUT_NOT_CANONICALLY_SERVED = 0`.

## Counters

New (E4.2): `PARTIAL_INPUT_TO_AVAILABLE_DETECTION_COUNT` = 0, `DETECTION_COVERAGE_STATUS_UPGRADE_COUNT` = 0, `FALSE_COMPLETE_EMPTY_DETECTION_COUNT` = 0, `CURRENT_TELEMETRY_AS_HISTORICAL_FACT_COUNT` = 0, `SUMMARY_DETECTION_STATUS_UPGRADE_COUNT` = 0, `TELEMETRY_OFFLINE_DOWNTIME_MISCLASS_COUNT` = 0.

Recomputed prior critical counters — all 0: FALSE_ZERO_ANALYTICS, PARTIAL_TO_AVAILABLE_STATUS_UPGRADE, SYNTHETIC_BLOCKED_ZERO, CROSS_TENANT_ANALYTICS_READ_LEAKAGE, CROSS_TENANT_DRIVER_ANALYSIS_LEAK, CUSTOMER_AS_DRIVER_FALLBACK, CROSS_TENANT_COST_RELATION_ACCEPT, UNPROVEN_COST_CURRENCY_ACCEPT, UNPROVEN_COST_PERIODICITY_ACCEPT, CURRENT_COST_CONFIG_RETROACTIVE_HISTORY, COST_DOUBLE_COUNT, COST_MIXED_CURRENCY_FALSE_TOTAL, UTILIZATION_OVER_100, UNPROVEN_ELIGIBILITY_FULL_COVERAGE, FAKE_ORGANIZATION_TARGET, STRENGTH_INSUFFICIENT_EVIDENCE, WEAKNESS_INSUFFICIENT_EVIDENCE, STRENGTH_WEAKNESS_CONTRADICTION, DRIVER_CAUSAL_CLAIM, ACTIVE_BUT_NOT_CANONICALLY_SERVED, E5/E6/E7/E8/E9_SCOPE_LEAK, NEW_E4_FAILURE, UNKNOWN.

## Residual limitations / deferrals

Unchanged from E4.1: recorded/fixed costs and actual-possession utilization remain unsupported pending schema (per-row currency, effective-dated cost config, actual handover/return, eligibility/station history); trip-level `DriverAttribution` deferred. Because utilization is structurally PARTIAL, utilization-based detection rules are skipped and detection sections are PARTIAL until actual-possession utilization exists. E5–E9 not started.
