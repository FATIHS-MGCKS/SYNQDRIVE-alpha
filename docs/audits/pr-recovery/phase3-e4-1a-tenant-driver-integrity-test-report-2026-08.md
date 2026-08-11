# Phase 3 – E4.1A Tenant Integrity & Driver Attribution — Test Report (2026-08)

- `TESTED_CODE_SHA` = `d398c116ea4bd35acea591bcc78a5bdc3a812fa3`
- `PRE_E4_1A_HEAD` = `0dad3e73c4cced9c0bda5cc6e527423c0fcaabb9`
- `CURRENT_MAIN_SHA` = `cefeedfe7dcfd7f682ba5b80fad1fec37d4a6c0f`
- PR `#1024` (OPEN, DRAFT) — same branch, no new branch/PR. No schema change.

## Scope of change

Runtime: `evaluations-insights.repository.ts` (driver attribution + nested tenant predicates), `evaluations-insights.service.ts` (driver observation shape + unattributed coverage). Tests: repository unit spec, real-PostgreSQL integration spec + harness, service spec mock update. Docs: driver-attribution authority matrix, correction authority CSV, implementation report append, this report.

## Real PostgreSQL adversarial tests

Env-gated (`EVALUATIONS_E4_POSTGRES_INTEGRATION=1`, `DATABASE_URL` → live Postgres, DB-probed with graceful skip). Ran against a dedicated database (`prisma db push`ed schema). Command:

`DATABASE_URL=… EVALUATIONS_E4_POSTGRES_INTEGRATION=1 npx jest …/evaluations-insights.tenant-integrity.integration.spec.ts`

| Case | Adversarial relation | Result |
|---|---|---|
| A | ORG_A booking → ORG_B assigned driver | PASS — foreign driver dropped; `unattributedCount` counts it; no `driverB`/`orgB` id in payload |
| (customer fallback) | ORG_A booking, customer present, no assigned driver | PASS — no observation; unattributed |
| B | ORG_A Task → ORG_B invoice | PASS — foreign invoice never enters cost; ORG_A service case keeps own key & is counted (OPERATING 3000 + MAINTENANCE 5000 = 8000) |
| (same-tenant dedup) | ORG_A Task → ORG_A invoice | PASS — linked cost deduped once (invoice wins) |
| C | ORG_A booking → ORG_B vehicle | PASS — foreign-vehicle booking excluded from utilization; no `vehicleB`/`orgB` in payload |
| E | same-tenant valid relations | PASS — driverA (×5), ORG_A invoice cost, ORG_A vehicle all present (no over-blocking) |

Result: **6 passed, 6 total.**

## Always-run unit coverage (no DB)

`evaluations-insights.repository.spec.ts` (mocked Prisma): no customer fallback; foreign assigned driver dropped; only validated same-tenant assigned driver attributed; query scoped to org + nested tenant select. **4 passed.**

## Suites & counts

| Command | Result |
|---|---|
| `npx jest src/modules/evaluations-analytics/e4` (unit; integration skipped w/o env) | 7 suites, **54 passed**, 6 skipped |
| `…/evaluations-insights.tenant-integrity.integration.spec.ts` (live DB) | **6 passed** |
| `npx jest src/modules/evaluations-metrics src/modules/evaluations-analytics src/modules/evaluations-finance` (E1+E2+E3+E4 regression) | 31 passed suites, **381 passed**, 4 skipped, 0 failed |

## E2 regression (STEP 12)

Included in the regression run: analytics scope service, station-policy (ORG_ADMIN / WORKER assigned / WORKER no-stations / SUB_ADMIN assigned / SUB_ADMIN no-stations / DRIVER / mixed station request), tenant-isolation, HTTP/input security, entity-reference integrity — all PASS. No scope regression.

## E3 regression (STEP 13)

Included: money, fx, finance calculator, finance controller (station fail-closed), registry ownership, Payment→Invoice same-tenant — all PASS. No E3 semantic change.

## E4 driver regression (STEP 14)

Driver domain (association-only, sample gate, deterministic, no causal language, stable ids) + repository (valid same-org driver, foreign driver dropped, no customer fallback, unattributed handling) + service (same parent scope, station fail-closed) — all PASS.

## Quality gates

| Gate | Command | Result |
|---|---|---|
| Backend typecheck | `npx tsc -p tsconfig.build.json --noEmit` | PASS |
| Backend build | `npm run build` | PASS |
| Prisma | `npx prisma validate` | Valid; no schema diff |
| Lint (E4 files) | `npx eslint "src/modules/evaluations-analytics/e4/**/*.ts"` | PASS |

Global-red CI gates (Typecheck-with-specs on `billing`/`workflows`, `lint:all`, integration/migration `vehicle_trips`, dependency scan, Playwright) remain `PRE_EXISTING_IDENTICAL` / `ENVIRONMENT_SPECIFIC` vs `CURRENT_MAIN_SHA`; none touch E4/evaluations. `NEW_E4_FAILURE = 0`, `UNKNOWN = 0`.

## Security counters

| Counter | Value |
|---|---|
| CROSS_TENANT_ANALYTICS_READ_LEAKAGE_COUNT | 0 |
| CROSS_TENANT_DRIVER_ANALYSIS_LEAK_COUNT | 0 |
| CUSTOMER_AS_DRIVER_FALLBACK_COUNT | 0 |
| CROSS_TENANT_COST_RELATION_ACCEPT_COUNT | 0 |
| DRIVER_SCOPE_MISMATCH_COUNT | 0 |
| DRIVER_INSUFFICIENT_SAMPLE_RESULT_COUNT | 0 |
| DRIVER_CAUSAL_CLAIM_COUNT | 0 |
| DRIVER_PARENT_KPI_REIMPLEMENTATION_COUNT | 0 |
| STATION_SCOPE_ANALYTICS_LEAKAGE_COUNT | 0 |
| ORG_FALLBACK_ON_STATION_SCOPE_COUNT | 0 |
| NEW_E4_FAILURE | 0 |
| UNKNOWN | 0 |

## Remaining E4.1B / E4.1C work

- **E4.1B**: integrate canonical `DriverAttribution` (trip-level CONFIRMED/ASSIGNED actual driver) as the primary driver source across driver dimensions; extend driver analytics beyond cancellations (e.g. trip-linked damage attribution) using proven attribution.
- **E4.1C** (candidate): station-scoped cost/utilization once continuous vehicle→station history exists; broaden adversarial fixtures to `BookingAllowedDriver` and handover-actor edge cases.
