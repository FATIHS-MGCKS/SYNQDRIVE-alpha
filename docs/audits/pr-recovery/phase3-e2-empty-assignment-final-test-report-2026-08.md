# Phase 3 E2.4 — Empty Assignment Fail-Closed & Final SHA Closure Test Report

## Revision

- `BASE_MAIN_SHA` = `ab554722a2e6e9ed8e4263310bd2bddf9b62445a`
- `PRE_E2_4_HEAD` = `0eedf4ab2e07db64983eaa8949512122e729b008`
- `TESTED_CODE_SHA` = `8c7d35939c13ede108d0f2c4d2768acaf79f61b8`
- `FINAL_PR_HEAD_SHA` = the docs-only evidence commit that carries this report on
  `integration/evaluations-e2-tenant-analytics-foundation-2026-08`. A commit
  cannot embed its own hash; the full 40-char value, together with
  `CHECK_RUN_HEAD_SHA`, `BRANCH_HEAD_EQUALS_PR_HEAD`, and
  `CHECK_HEAD_EQUALS_PR_HEAD`, is stated in the PR body and the run's final
  status output and is the immediate child of `TESTED_CODE_SHA`.
- `POST_TEST_CODE_CHANGES` = DOCS_ONLY (the only commit after `TESTED_CODE_SHA`
  changes files under `docs/` only; proven by
  `git diff --name-status TESTED_CODE_SHA..FINAL_PR_HEAD_SHA`).

## Role matrix (canonical, fail-closed)

| Role | default station authority | assigned-only | all-stations | no-stations | empty assignment |
|---|---|---|---|---|---|
| MASTER_ADMIN | ALL_STATIONS (targeted org; platform authority) | no | yes | no | ALL |
| ORG_ADMIN | ALL_STATIONS (own org) | no | yes | no | ALL (no over-correction) |
| SUB_ADMIN | ASSIGNED_STATIONS | yes | via explicit `stationScope='ALL'` only | yes | **NO_STATIONS** |
| WORKER | ASSIGNED_STATIONS | yes | via explicit `stationScope='ALL'` only | yes | **NO_STATIONS** |
| DRIVER | NO_STATIONS | no | no | yes | NO_STATIONS |
| inactive / non-member | NO_STATIONS | no | no | yes | NO_STATIONS |

## Empty assignment semantics

`stationIds = null | undefined | []` and `stationScope = null` for a
station-restricted role resolve to **NO_STATIONS**, never ALL. `null`
(ALL_STATIONS) is strictly distinct from `[]` (NO_STATIONS). Explicit
`stationScope = 'ALL'` remains a deliberate all-stations grant.

## V2 ON/OFF equivalence

Every role/empty-assignment case yields the same authorized population with the
Stations-V2 flag ON and OFF. The evaluations path no longer consumes the flag for
authorization. `FEATURE_FLAG_SCOPE_ESCALATION_COUNT = 0`.

## Data-level leakage tests

Through the real repository query:

- Empty-assignment WORKER → summary aggregateTotal 0, detail totalCount 0, no
  groups (no station-A or station-B data).
- Assigned WORKER [A] → only A (1 row).
- ORG_ADMIN → A + B (2 rows).

## Cross-tenant regression

ORG_A actor + ORG_B station → DENY (V2 ON and OFF). READ and WRITE cross-tenant
leakage = 0.

## Referential integrity regression (E2.2)

Foreign target, foreign owner, owner/target mismatch, station/org mismatch, and
the real-DB cross-tenant write test all PASS; 0 cross-tenant persisted rows.

## Build / CI

- Focused E2 suites: **12 suites, 134 tests pass**; +4 gated DB-integration tests
  pass against disposable PostgreSQL 16.
- Backend production typecheck PASS; full typecheck 0 new errors (4 pre-existing
  baseline fixtures); ESLint PASS; `prisma validate` PASS; `nest build` PASS.
- Current-head GitHub CI: red checks are `PRE_EXISTING_IDENTICAL` (typecheck
  fixtures, repo lint, migration P3018, dependency audit, Vehicle Detail
  Playwright); classification recorded in the final status.

## Final metrics

- `DRIVER_SCOPE_ESCALATION_COUNT` = 0
- `WORKER_EMPTY_SCOPE_ESCALATION_COUNT` = 0
- `SUBADMIN_EMPTY_SCOPE_ESCALATION_COUNT` = 0
- `FEATURE_FLAG_SCOPE_ESCALATION_COUNT` = 0
- `INTRA_TENANT_STATION_LEAKAGE_COUNT` = 0
- `CROSS_TENANT_STATION_LEAKAGE_COUNT` = 0
- `READ_CROSS_TENANT_LEAKAGE_COUNT` = 0
- `WRITE_CROSS_TENANT_LEAKAGE_COUNT` = 0
- `NEW_E2_FAILURE_COUNT` = 0
- `UNKNOWN_COUNT` = 0

## Production migration

`PRODUCTION_MIGRATION_PERFORMED = NO`. No schema change in E2.4.
