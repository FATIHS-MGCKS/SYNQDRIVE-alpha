# Phase 3 E2.3 — Station Scope Authority Correction & Final CI Closure Test Report

## Tested revision

- `BASE_MAIN_SHA` = `ab554722a2e6e9ed8e4263310bd2bddf9b62445a`
- `PRE_E2_3_HEAD` = `63dc29d4efb06b6bb63ab0399ac7fbc12e3d521d`
- `TESTED_CODE_SHA` = `6f578c6b3e7a15d545eb2c96ea2d07adb2da7984`
- `FINAL_PR_HEAD_SHA` = (evidence commit; recorded in the final status)
- `CHECK_RUN_HEAD_SHA` = (current-head CI; recorded in the final status)

## Authority

- Canonical source: `docs/architecture/stations-v2-permissions.md` (PG-01…PG-05)
  + `computeEffectiveAccess` (`backend/src/modules/users/policies/effective-access-engine.ts`)
  + EVAL-ADR-007.
- Feature flag role: `stationsScopeV2Enabled` governs rollout/implementation only.
  It is **not** an authorization authority and never widens the station scope.
- Station scope authority: derived from actor role + `membership.stationScope` /
  `membership.stationIds` via the canonical engine with the V2 scope path forced
  on.

## Role matrix

| Role | organizationScope | stationScope | allStations | assignedOnly | noStations | platformOverride |
|---|---|---|---|---|---|---|
| MASTER_ADMIN | targeted org (explicit) | ALL | yes | no | no | platform authority |
| ORG_ADMIN | own org | ALL | yes | no | no | no |
| SUB_ADMIN | own org | ASSIGNED | no | yes | no | no |
| WORKER | own org | ASSIGNED | no | yes | no | no |
| DRIVER / non-member / inactive | own org | NONE | no | no | yes | no |

## ON/OFF matrix (feature-flag independence)

| Case | V2 ON | V2 OFF | Equivalent? |
|---|---|---|---|
| WORKER assigned [A], no filter | scope=[A] | scope=[A] | YES |
| WORKER assigned [A], request A | allow | allow | YES |
| WORKER assigned [A], request B (unassigned) | DENY | DENY | YES |
| WORKER assigned [A], request [A,B] | DENY | DENY | YES |
| SUB_ADMIN assigned [A,B], no filter | [A,B] | [A,B] | YES |
| ORG_ADMIN, no filter | ALL_STATIONS | ALL_STATIONS | YES |
| Cross-tenant station | DENY | DENY | YES |

Evidence: `evaluations-analytics.station-policy.spec.ts` (parametrized ON/OFF via
`STATIONS_V2_FLAGS_TEST_DEFAULT`), plus an explicit ON≡OFF equivalence assertion.

## Repository data tests

Same-org data at station A and station B (`evaluations-analytics.tenant-isolation.spec.ts`):

- ORG_ADMIN → summary/detail include A + B (2 rows).
- WORKER assigned A → summary/detail include only A (1 row); B never returned.

Proves the corrected authorized scope is actually enforced in the repository
query, not just in the scope object.

## Cross-tenant tests

- ORG_A actor + ORG_B station → DENY (ON and OFF).
- Repository reads always org-scoped; write gate rejects cross-tenant owner/target
  (E2.2 suites re-run green).

## Intra-tenant privilege tests

- WORKER assigned A, V2 OFF, no station filter → no station-B data. This is the
  central regression of this pass and passes.

## Final results

- `STATION_SCOPE_AUTHORITY` = PASS
- `V2_ON_AUTHORIZATION` = PASS
- `V2_OFF_AUTHORIZATION` = PASS
- `FEATURE_FLAG_SCOPE_ESCALATION_COUNT` = 0
- `INTRA_TENANT_STATION_LEAKAGE_COUNT` = 0
- `CROSS_TENANT_STATION_LEAKAGE_COUNT` = 0
- `NEW_E2_FAILURE_COUNT` = 0
- `UNKNOWN_COUNT` = 0

## E2 core regression (unchanged by this pass)

Target/owner tenant integrity, DB cross-tenant write (0 rows), HTTP security,
unknown-query, input bounds, summary/detail, migration validation: all PASS. No
schema change. Production migration performed: NO.

## Suite execution

- `npx jest --runInBand src/modules/evaluations-analytics` (+ mirror sync):
  **12 suites, 116 tests pass**, 1 suite (4 tests) skipped by default (gated DB
  integration).
- Gated DB integration (`EVALUATIONS_E2_DB_INTEGRATION=1` + disposable PG 16):
  **4/4 pass**.
- Backend production typecheck PASS; full typecheck 0 new errors; ESLint PASS;
  `prisma validate` PASS; `nest build` PASS.

## SHA evidence

- `PR_HEAD_EQUALS_BRANCH_HEAD` = (recorded in final status after push)
- `CHECK_HEAD_EQUALS_PR_HEAD` = (recorded in final status)
- `POST_TEST_CODE_CHANGES` = DOCS_ONLY (only reports change after `TESTED_CODE_SHA`)

## E2.4 — Empty assignment fail-closed (correction)

The E2.3 role matrix above is retained; E2.4 hardens the "no valid assignment"
case, which previously could resolve to ALL for station-restricted roles via the
central engine's empty→ALL fallback. Corrected role-first, fail-closed:

- `DRIVER_ACTIVE_TEST` = PASS → NO_STATIONS (even with an assignment present).
- `WORKER_NO_ASSIGNMENT_TEST` = PASS → NO_STATIONS (`stationIds []`/`null`,
  `stationScope null`, and `undefined` legacy fields).
- `SUB_ADMIN_NO_ASSIGNMENT_TEST` = PASS → NO_STATIONS.
- WORKER/SUB_ADMIN with a valid assignment → ASSIGNED_STATIONS (unchanged).
- ORG_ADMIN with empty legacy fields → ALL_STATIONS (no over-correction).
- inactive member → NO_STATIONS.

ON/OFF equivalence holds for the empty-assignment case (NO_STATIONS in both).
Data level: an empty-assignment WORKER sees zero records (summary 0 / detail 0 /
no groups). Evidence: `evaluations-analytics.station-policy.spec.ts`,
`evaluations-analytics-scope.service.spec.ts`,
`evaluations-analytics.tenant-isolation.spec.ts`. See
`phase3-e2-empty-assignment-final-test-report-2026-08.md` for full metrics and
SHAs.
