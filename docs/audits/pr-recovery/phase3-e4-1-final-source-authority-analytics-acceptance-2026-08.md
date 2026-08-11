# Phase 3 – E4.1 Final Source Authority & Analytics Acceptance (2026-08)

Consolidated acceptance for the E4 tenant-safe analytics backend after the three
correction passes A (tenant/driver), B (cost source), C (utilization/detection),
on branch `integration/evaluations-e4-tenant-safe-analytics-backend-2026-08`,
Draft PR #1024 → `main`.

## Revision

| Ref | SHA |
|---|---|
| `BASE_MAIN_SHA` | `cefeedfe7dcfd7f682ba5b80fad1fec37d4a6c0f` |
| E4 initial pass head | `4f5d20d0…` (runtime) / `06def405…`, `0dad3e73…` (evidence) |
| `PRE_E4_1A_HEAD` | `0dad3e73c4cced9c0bda5cc6e527423c0fcaabb9` |
| A code SHA (E4.1A) | `d398c116ea4bd35acea591bcc78a5bdc3a812fa3` |
| B code SHA (E4.1B) | `c6d93ea9e77312672fa069df721a3ea9fd188d6b` |
| C / `TESTED_CODE_SHA` (E4.1C) | `ce9dfaeb4be75788825609962ba76fa02aa6b04d` |

## A / B / C results

- **A — Tenant Integrity & Driver Attribution:** removed customer-as-driver fallback; validated same-tenant assigned driver; damage.customerId not a driver; same-tenant Task→Invoice; nested tenant predicates; real-Postgres adversarial tests. PASS.
- **B — Cost Source Authority:** only explicit-currency invoices are authoritative; ServiceCase/Damage currency and fixed-cost periodicity/effective-date UNPROVEN → UNSUPPORTED categories, section PARTIAL; removed fake 30-day accrual and retroactive reporting currency. PASS.
- **C — Utilization/Detection Semantics:** no false-zero (numeric fields `number|null`); PARTIAL preserved; blocked unknown (no synthetic 0); eligibility not overstated; scheduled≠actual occupancy; platform-rule threshold labeling. PASS.

## Driver

Association-only over parent evidence; org-scoped `Customer` refs; validated same-tenant assigned driver only (contract customer never the driver); foreign driver dropped; sample-gated; disclaimer + confounders; no causal claims; no parent-KPI reinvention. Trip-level `DriverAttribution` remains deferred.

## Cost

Authoritative source = `OrgInvoice` (explicit per-row currency). ServiceCase/Damage/fixed costs reported UNSUPPORTED (unproven currency/periodicity/effective-date) → section PARTIAL, never €0. Per-currency BigInt money (no float/implicit EUR/false blended total). Station scope fails closed. Double-count safe.

## Utilization

Time-weighted, interval clip + overlap union, DST-safe, ≤100%. `occupancyBasis: SCHEDULED` (booking start/end, not actual possession). `blockedMs` always `null` (no authoritative blocked source). Coverage-limited → served as `PARTIAL` (`ops.fleet_utilization_pct`, calc `2.0.0`). UNAVAILABLE/ERROR → all numeric fields `null`. Telemetry-offline never downtime; available≠ready.

## Strength / Weakness

Deterministic, evidence-gated, stable ids/ordering, dedup, no contradiction. Fixed thresholds labeled `PLATFORM_RULE_THRESHOLD` (never `ORGANIZATION_TARGET`); previous-period comparisons labeled `PREVIOUS_COMPARABLE_PERIOD`. OBSERVATION only (no ESTIMATE/FORECAST → no E8 leak). No recommendations (no E7 leak).

## Summary

Composes E3-delegated finance + E4 sections; per-section failure isolation; child PARTIAL/UNAVAILABLE/ERROR preserved (no status upgrade, no unavailable→0). Direct endpoints reconcile with summary sections.

## Repository security

Every query tenant-scoped by `organizationId`; nested tenant predicates for `assignedDriver`, booking `vehicle`, damage `vehicle`; `ServiceCase` (scalar `vehicleId`) safe via org filter + map-join. Real-Postgres adversarial suite proves no cross-tenant driver/cost/vehicle leakage.

## Registry

`ops.fleet_utilization_pct` = `active_degraded`, calc `2.0.0` (coverage-limited PARTIAL, org-scope; station fail-closed) — truthfully served. `ops.strengths_count` / `ops.weaknesses_count` remain `planned` (E4 serves rule sections, not the count metrics). Cost is a section-local envelope (`cost-model-e4-v2`). Registry version `1.6.0`. `ACTIVE_BUT_NOT_CANONICALLY_SERVED = 0`.

## Calculation version review (STEP 31)

| Capability | Old E4 version | New | Bumped | Reason |
|---|---|---|---|---|
| Cost | `cost-model-e4-v1` | `cost-model-e4-v2` | YES | Source set narrowed to invoices; currency/periodicity/historical-accrual/dedup semantics changed (E4.1B) |
| Utilization (section) | `utilization-model-e4-v1` | `utilization-model-e4-v2` | YES | Scheduled-occupancy, unknown blocked, approximate eligibility, PARTIAL/null semantics (E4.1C) |
| Utilization (registry `ops.fleet_utilization_pct`) | `1.0.0` | `2.0.0` | YES | Materially different served semantics; mirrored in shared calc-version resolver; registry `1.5.0→1.6.0` |
| Strength | `strength-detection-e4-v1` | `strength-detection-e4-v2` | YES | Comparator relabeled PLATFORM_RULE_THRESHOLD (E4.1C) |
| Weakness | `weakness-detection-e4-v1` | `weakness-detection-e4-v2` | YES | Comparator relabeled PLATFORM_RULE_THRESHOLD (E4.1C) |
| Driver | `driver-influence-e4-v1` | `driver-influence-e4-v1` | NO | Tenant hardening only (A); no formula/output semantic change |
| Summary | `analytics-summary-e4-v1` | `analytics-summary-e4-v1` | NO | Composition unchanged; child semantics propagated |

## Test counts (on `TESTED_CODE_SHA`)

| Scope | Command | Result |
|---|---|---|
| E4 (unit + service + live-Postgres integration) | `npx jest src/modules/evaluations-analytics/e4` (+ registry spec) | 9 suites, **90 passed** |
| E1+E2+E3+E4 regression | `npx jest src/modules/evaluations-metrics src/modules/evaluations-analytics src/modules/evaluations-finance` | 31 passed suites, **386 passed**, 4 skipped, 0 failed |

E4 suites: cost domain, interval, utilization domain, detection domain, driver domain, service, repository (mocked), **real-Postgres tenant-integrity integration (7 cases incl. driver/cost/vehicle adversarial + blocked-source)**.

E1 regression: registry (v1.6.0), calc-version sync (shared↔backend), metric-response/status/PARTIAL, period/timezone, money, mirror integrity — PASS.
E2 regression: scope service, station-policy, tenant-isolation, HTTP security, entity-reference, E4 adversarial repository — PASS.
E3 regression: money, fx, calculator, finance controller (station fail-closed), registry ownership, JPY/KWD (money spec) — PASS.

## Quality

| Gate | Result |
|---|---|
| Backend typecheck (`tsc -p tsconfig.build.json --noEmit`) | PASS |
| Backend build (`nest build`) | PASS |
| Prisma validate | Valid; no schema diff (`E4_SCHEMA_MIGRATION_REQUIRED = NO`) |
| Lint (E4 + metrics) | PASS |
| Frontend typecheck (`tsc -b`) | PASS |

## Baseline A/B classification

Pre-existing global-red CI gates vs `BASE_MAIN_SHA`: Typecheck-with-specs (`billing`/`workflows`), `lint:all`, integration/migration (`vehicle_trips` P3018), dependency scan, Playwright E2E — all `PRE_EXISTING_IDENTICAL` / `ENVIRONMENT_SPECIFIC`; none touch E4/evaluations. E4-relevant gates green (backend unit tests incl. evaluations, production build, Prisma validate). `NEW_E4_FAILURE_COUNT = 0`, `UNKNOWN_COUNT = 0`.

## Final counters (all 0)

PARALLEL_ANALYTICS_TRUTH_COUNT, E4_FINANCE_REIMPLEMENTATION_COUNT, UNSAFE_FINANCIAL_EXPOSURE_REINTRODUCTION_COUNT, FALSE_ZERO_ANALYTICS_COUNT, PARTIAL_TO_AVAILABLE_STATUS_UPGRADE_COUNT, SYNTHETIC_BLOCKED_ZERO_COUNT, CROSS_TENANT_ANALYTICS_READ_LEAKAGE_COUNT, CROSS_TENANT_DRIVER_ANALYSIS_LEAK_COUNT, CUSTOMER_AS_DRIVER_FALLBACK_COUNT, CROSS_TENANT_COST_RELATION_ACCEPT_COUNT, STATION_SCOPE_ANALYTICS_LEAKAGE_COUNT, ORG_FALLBACK_ON_STATION_SCOPE_COUNT, UNPROVEN_COST_CURRENCY_ACCEPT_COUNT, UNPROVEN_COST_PERIODICITY_ACCEPT_COUNT, CURRENT_COST_CONFIG_RETROACTIVE_HISTORY_COUNT, COST_DOUBLE_COUNT_COUNT, UNPROVEN_COST_ESTIMATE_COUNT, COST_FLOAT_MONEY_COUNT, COST_MIXED_CURRENCY_FALSE_TOTAL_COUNT, COST_IMPLICIT_CURRENCY_COUNT, COST_STATION_ORG_FALLBACK_COUNT, OVERLAPPING_INTERVAL_DOUBLE_COUNT_COUNT, UTILIZATION_OVER_100_COUNT, AVAILABLE_READY_CONFLATION_COUNT, TELEMETRY_OFFLINE_DOWNTIME_MISCLASS_COUNT, CURRENT_STATION_RETROACTIVE_HISTORY_COUNT, CURRENT_ELIGIBILITY_STATE_RETROACTIVE_HISTORY_COUNT, UNPROVEN_ELIGIBILITY_FULL_COVERAGE_COUNT, FAKE_ORGANIZATION_TARGET_COUNT, STRENGTH_INSUFFICIENT_EVIDENCE_COUNT, WEAKNESS_INSUFFICIENT_EVIDENCE_COUNT, STRENGTH_WEAKNESS_CONTRADICTION_COUNT, DUPLICATE_DETECTION_COUNT, DRIVER_SCOPE_MISMATCH_COUNT, DRIVER_INSUFFICIENT_SAMPLE_RESULT_COUNT, DRIVER_CAUSAL_CLAIM_COUNT, DRIVER_PARENT_KPI_REIMPLEMENTATION_COUNT, SUMMARY_DIRECT_ENDPOINT_MISMATCH_COUNT, ACTIVE_BUT_NOT_CANONICALLY_SERVED, NON_DETERMINISTIC_E4_RESULT_COUNT, E5_SCOPE_LEAK_COUNT, E6_UI_SCOPE_LEAK_COUNT, E7_SCOPE_LEAK_COUNT, E8_SCOPE_LEAK_COUNT, E8_FORECAST_IMPLEMENTATION_LEAK_COUNT, E9_SCOPE_LEAK_COUNT, NEW_E4_FAILURE_COUNT, UNKNOWN_COUNT = **0**.

## Residual limitations / deferrals

- Recorded (ServiceCase/Damage) and fixed costs remain UNSUPPORTED until the schema adds per-row currency + an effective-dated cost-configuration model.
- Utilization is scheduled-occupancy + coverage-limited PARTIAL until actual handover/return possession and vehicle eligibility/station history are tracked.
- Trip-level `DriverAttribution` (actual-driver) integration deferred.
- E5 (Data Quality), E6 (UI), E7 (Recommendations/Actions), E8 (Predictive/Forecast), E9 (Forecast UI) — NOT started.

## Final decision

`E4_READY_FOR_POST_IMPLEMENTATION_AUDIT`.
