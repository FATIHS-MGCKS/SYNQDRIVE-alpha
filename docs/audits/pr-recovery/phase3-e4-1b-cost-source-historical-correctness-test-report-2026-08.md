# Phase 3 – E4.1B Cost Source Authority & Historical Correctness — Test Report (2026-08)

- `TESTED_CODE_SHA` = `c6d93ea9e77312672fa069df721a3ea9fd188d6b`
- `PRE_E4_1B_HEAD` = `9a768fe6bc742e90d8ce44e489120d69f444c72e` (E4.1A ancestor confirmed)
- `CURRENT_MAIN_SHA` = `cefeedfe7dcfd7f682ba5b80fad1fec37d4a6c0f`
- PR `#1024` (OPEN, DRAFT), same branch, no new branch/PR. No schema change.

## Source authority decisions

| Source | Field | Currency provenance | Periodicity | Decision |
|---|---|---|---|---|
| `OrgInvoice` (incoming) | `totalCents` | PROVEN — explicit per-row `currency` | event | Authoritative → `OPERATING_EXPENSES` |
| `ServiceCase` | `actualCostCents` | UNPROVEN — no currency column | event | UNSUPPORTED (`SERVICECASE_COST_CURRENCY_UNPROVEN`) |
| `VehicleDamage` | `repairCostCents` | UNPROVEN — no currency column | event | UNSUPPORTED (`DAMAGE_COST_CURRENCY_UNPROVEN`) |
| `Vehicle.leasing/insurance/tax Cents` | — | UNPROVEN — no currency; display-only EUR | UNKNOWN — no ratified periodicity; no effective-date/version | UNSUPPORTED (`FIXED_COST_PERIODICITY_AND_HISTORY_UNPROVEN`); fake 30-day accrual removed |

Full provenance in `phase3-e4-cost-source-authority-matrix-2026-08.csv`; nested-relation deltas in `phase3-e4-1-correction-authority-matrix-2026-08.csv`.

## Unsupported categories

`ServiceCase`, `VehicleDamage`, and per-vehicle fixed costs are reported as `UNAVAILABLE` categories (with counts of the records that exist) and downgrade the Cost section to `PARTIAL` — never fabricated into a total, a current-reporting-currency amount, or a false zero.

## Tests

### E4 unit + service (always run)

`npx jest src/modules/evaluations-analytics/e4` — **8 suites, 63 passed** (integration ran live in this environment; skips gracefully without `EVALUATIONS_E4_POSTGRES_INTEGRATION=1`).

New/updated cost service specs:
- authoritative invoice cost → `AVAILABLE` (single currency, no unsupported records)
- ServiceCase/Damage/fixed present → `PARTIAL` with per-category `UNAVAILABLE` + explicit reasons; total = only the authoritative invoice amount
- only-unsupported sources → `UNAVAILABLE` (`COST_SOURCES_UNSUPPORTED`)
- no source at all → `UNAVAILABLE` (`NO_COST_SOURCE`)
- mixed EUR/USD → `PARTIAL`, segmented per currency (no false blended total)
- explicit real zero cost retained; missing data ≠ zero

### Real PostgreSQL adversarial (live DB)

`DATABASE_URL=… EVALUATIONS_E4_POSTGRES_INTEGRATION=1 npx jest …/evaluations-insights.tenant-integrity.integration.spec.ts` — **7 passed** against a live Postgres:
- A: ORG_A booking → ORG_B driver dropped (no leak)
- customer-only booking → unattributed
- B: ORG_A Task → ORG_B invoice never enters ORG_A cost; only the authoritative ORG_A invoice counted (3000 EUR); ServiceCase not aggregated
- B2: ServiceCase costs reported UNSUPPORTED (count 2), no authoritative event, no assigned currency
- no double counting: linked ServiceCase never inflates the invoice total
- C: ORG_A booking → ORG_B vehicle excluded from utilization
- E: same-tenant relations still work

### Regression

`npx jest src/modules/evaluations-metrics src/modules/evaluations-analytics src/modules/evaluations-finance` — **31 passed suites, 384 passed, 4 skipped, 0 failed** (E1 Money/Currency/Period, E2 tenant/station, E3 Finance/Multi-Currency, E4.1A repository security, E4 cost domain/service — no regression).

## Quality gates

| Gate | Command | Result |
|---|---|---|
| Backend typecheck | `npx tsc -p tsconfig.build.json --noEmit` | PASS |
| Backend build | `npm run build` | PASS |
| Prisma | `npx prisma validate` | Valid; no schema diff |
| Lint (E4) | `npx eslint "src/modules/evaluations-analytics/e4/**/*.ts"` | PASS |
| Frontend typecheck | `npx tsc -b` | PASS |

Pre-existing global-red CI gates (Typecheck-with-specs in `billing`/`workflows`, `lint:all`, integration/migration `vehicle_trips`, dependency scan, Playwright) remain `PRE_EXISTING_IDENTICAL`/`ENVIRONMENT_SPECIFIC` vs `CURRENT_MAIN_SHA`; none touch E4. `NEW_E4_FAILURE = 0`, `UNKNOWN = 0`.

## Registry

No cost metric is registry-active (cost is a section-local envelope with `cost-model-e4-v2`). `ops.fleet_utilization_pct` unchanged. `ACTIVE_BUT_NOT_CANONICALLY_SERVED = 0`.

## Cost counters

| Counter | Value |
|---|---|
| UNPROVEN_COST_CURRENCY_ACCEPT_COUNT | 0 |
| UNPROVEN_COST_PERIODICITY_ACCEPT_COUNT | 0 |
| CURRENT_COST_CONFIG_RETROACTIVE_HISTORY_COUNT | 0 |
| COST_DOUBLE_COUNT_COUNT | 0 |
| UNPROVEN_COST_ESTIMATE_COUNT | 0 |
| COST_FLOAT_MONEY_COUNT | 0 |
| COST_MIXED_CURRENCY_FALSE_TOTAL_COUNT | 0 |
| COST_IMPLICIT_CURRENCY_COUNT | 0 |
| COST_STATION_ORG_FALLBACK_COUNT | 0 |
| CROSS_TENANT_COST_RELATION_ACCEPT_COUNT | 0 |
| NEW_E4_FAILURE | 0 |
| UNKNOWN | 0 |

## Remaining E4.1C work

- If/when the schema gains a per-row currency for `ServiceCase`/`VehicleDamage` and an effective-dated cost-configuration model with periodicity, recorded and fixed costs can be promoted to authoritative categories with calendar-aware accrual (E1 period/timezone) and validity clipping (mid-period sources) — deferred to E4.1C.
- Station-scoped cost once continuous vehicle→station history exists.
