# Phase 3 – E4 Post-Merge Verification (2026-08)

Independent final merge audit, controlled squash merge, and post-merge
verification of PR #1024 (Evaluations Recovery E4 – Tenant-Safe Analytics
Backend) into `main`.

## Revision identity

| Ref | SHA |
|---|---|
| `PRE_MERGE_MAIN_SHA` (E3) | `cefeedfe7dcfd7f682ba5b80fad1fec37d4a6c0f` |
| `E4_PR_HEAD_SHA` / `CURRENT_E4_SHA` | `75c773b9525ce8c103f68bf16ba84eeb35b3df28` |
| `E4_TESTED_CODE_SHA` (E4.2 runtime/test) | `f11b56d859bedcfdaf38ad189b76f52373464335` |
| `E4_MERGE_SHA` (squash) | `960365a9b095a54f4656947ac2067a104e56bd8a` |
| `POST_MERGE_MAIN_SHA` | `960365a9b095a54f4656947ac2067a104e56bd8a` |
| squash parent | `cefeedfe7dcfd7f682ba5b80fad1fec37d4a6c0f` (exactly one) |
| source branch | `integration/evaluations-e4-tenant-safe-analytics-backend-2026-08` — retained |

Audited-code lineage: `E4_TESTED_CODE_SHA` is an ancestor of `E4_PR_HEAD_SHA`; the only commits after the tested SHA are docs/audit evidence (`RUNTIME_CHANGE_AFTER_TESTED_SHA_COUNT = 0`, `TEST_CHANGE_AFTER_TESTED_SHA_COUNT = 0`). Squash diff = 38 files, all within scope (E4 `e4/**`, E1 registry integration, shared+mirror calc-versions, `app.module.ts`, architecture record, `docs/audits/pr-recovery/**`); no surprise files. `E5_E9_SCOPE_LEAK_COUNT = 0`, `UNRELATED_SCOPE_LEAK_COUNT = 0`.

## Merge evidence

- PR #1024 — state `MERGED`, `mergedAt = 2026-08-11T22:00:01Z`, `url = https://github.com/FATIHS-MGCKS/SYNQDRIVE-alpha/pull/1024`.
- Method: normal GitHub **squash** merge (`gh pr merge 1024 --squash`). **No `--admin` bypass.** No manual push to main. No local merge.
- Squash structure: exactly one parent = `PRE_MERGE_MAIN_SHA`; `POST_MERGE_MAIN_SHA == E4_MERGE_SHA`; reachable from `origin/main`.
- Source branch retained (still at `75c773b9…`).

## Pre-merge tests (worktree/workspace at `E4_PR_HEAD_SHA`)

- E1+E2+E3+E4 focused regression: `npx jest src/modules/evaluations-metrics src/modules/evaluations-analytics src/modules/evaluations-finance` → 31 passed suites, **392 passed, 4 skipped, 0 failed**.
- E4 suites (unit + service + real-Postgres integration + registry): 9 suites, **96 passed** (from E4.2 acceptance at the same runtime SHA).
- Backend typecheck PASS · Nest build PASS · Prisma valid (no schema diff) · E4 lint PASS · frontend typecheck PASS.
- Exact-head CI (`CHECK_RUN_HEAD_SHA = 75c773b9…`): E4-relevant gates green (Backend unit tests, Production build, Prisma validate, Frontend component tests, Backend security tests, Accessibility). `NEW_E4_FAILURE = 0`, `UNKNOWN = 0`.

## Post-merge tests (detached at `E4_MERGE_SHA = 960365a9`)

- E1+E2+E3+E4 focused regression: **392 passed, 4 skipped, 0 failed** on merged main.
- Includes: PostgreSQL adversarial repository suite (tenant/driver/cost/vehicle), Cost provenance, Utilization PARTIAL/false-zero, DST/overlap, Detection coverage, historical telemetry, Driver tenant safety.
- Backend typecheck PASS · Nest build PASS · Prisma valid · E4 lint PASS · frontend typecheck PASS.
- `NEW_POST_MERGE_E4_FAILURE = 0`.

## Analytics audit (re-confirmed on merged main)

- **Architecture:** one canonical path (E2 scope → E1 period → `EvaluationsInsightsService` → E3 finance where applicable → E4 capability services/repositories). `PARALLEL_ANALYTICS_TRUTH_COUNT = 0`, `E4_FINANCE_REIMPLEMENTATION_COUNT = 0`.
- **Tenant / Driver (E4.1A):** no customer-as-driver fallback; foreign `assignedDriver` rejected (nested tenant proof); Task→foreign invoice rejected; foreign vehicle/person fail closed; association-not-causation; sample gates active.
- **Cost (E4.1B):** only explicit-currency invoices are authoritative; ServiceCase/Damage unknown currency and fixed-cost periodicity/effective-date UNSUPPORTED → PARTIAL; no retroactive reporting currency; no fake 30-day month; dedup tenant-safe; per-currency segmented; station never falls back to org total.
- **Utilization (E4.1C):** UNAVAILABLE/ERROR → null (no false zero); PARTIAL preserved; blocked unknown (no synthetic 0); scheduled occupancy (not actual possession); incomplete eligibility reduces coverage; telemetry offline ≠ downtime; available ≠ ready; overlap union; ≤100%; DST 23h/25h.
- **Detection (E4.2):** PARTIAL source dimensions are skipped (recorded), never fully-AVAILABLE evidence; sections expose evaluated/skipped dimensions and roll up to PARTIAL; empty items + skipped dimension stays PARTIAL; strength/weakness `v3`; registry agrees.
- **Temporal telemetry:** current `latestState.online` surfaced only for a live period (`telemetrySnapshotAsOf`), `null` for historical periods; never affects utilization math.
- **Registry:** `ops.fleet_utilization_pct` `active_degraded` calc `2.0.0` (registry `1.6.0`, mirrored calc-version resolver); truthfully served. `ACTIVE_BUT_NOT_CANONICALLY_SERVED = 0`.

## Baseline classification

Global-red CI gates vs `PRE_MERGE_MAIN_SHA` (Typecheck-with-specs `billing`/`workflows`, `lint:all`, integration/migration `vehicle_trips` P3018, dependency scan, Playwright E2E) are `PRE_EXISTING_IDENTICAL` / `ENVIRONMENT_SPECIFIC`; none touch E4/evaluations (locally reproduced exactly 4 billing/workflows tsc errors, zero in E4). `NEW_POST_MERGE_E4_FAILURE = 0`, `UNKNOWN = 0`.

## Final counters (all 0)

POST_MERGE_CROSS_TENANT_ANALYTICS_LEAKAGE_COUNT, POST_MERGE_CROSS_TENANT_DRIVER_LEAKAGE_COUNT, POST_MERGE_COST_TENANT_RELATION_ACCEPT_COUNT, POST_MERGE_FALSE_ZERO_ANALYTICS_COUNT, POST_MERGE_PARTIAL_STATUS_UPGRADE_COUNT, POST_MERGE_SYNTHETIC_BLOCKED_ZERO_COUNT, POST_MERGE_UNPROVEN_COST_CURRENCY_COUNT, POST_MERGE_UNPROVEN_COST_PERIODICITY_COUNT, POST_MERGE_COST_DOUBLE_COUNT, POST_MERGE_PARTIAL_INPUT_TO_AVAILABLE_DETECTION_COUNT, POST_MERGE_FALSE_COMPLETE_EMPTY_DETECTION_COUNT, POST_MERGE_DETECTION_STATUS_UPGRADE_COUNT, POST_MERGE_CURRENT_TELEMETRY_AS_HISTORICAL_FACT_COUNT, POST_MERGE_ACTIVE_BUT_NOT_CANONICALLY_SERVED, NEW_POST_MERGE_E4_FAILURE, UNKNOWN = **0**.

## Safety

- `PRODUCTION_MIGRATION_PERFORMED = NO`
- `PRODUCTION_DEPLOYMENT_PERFORMED = NO`
- `HISTORICAL_DRAFT_PRS_CLOSED = 0`
- `HISTORICAL_BRANCHES_DELETED = 0`
- `E5_STARTED = NO`

## Final decision

`E4_COMPLETED`.
