# EXP-021 S4A — PostgreSQL CI wiring + dormant deploy readiness seal (2026-09-28)

| Field | Value |
|-------|-------|
| **Evidence ID** | DI-EVID-EXP021-S4A-POSTGRES-CI-001 |
| **Slice** | `S4A_POSTGRES_CI_WIRING_AND_DORMANT_DEPLOY_READINESS` |
| **Epistemic** | CONFIRMED (local + workflow definition); CI run on PR pending exact-head |
| **Production effect** | None (read-only baseline unchanged) |

## PostgreSQL test inventory

| TEST_FILE | TEST_COUNT | REQUIRES_POSTGRES | MULTI_CONNECTION | COVERAGE | `test:di:s4a:postgres` | GitHub CI (after this PR) |
|-----------|------------|-------------------|------------------|----------|------------------------|---------------------------|
| `di-v0-s4a-migration.postgres.integration.spec.ts` | 10 | YES | YES (lock waiters M03/M04) | M01–M08 migration safety | YES | YES (`s4a-postgres-integration` workflow) |
| `di-v0-s4a-races.postgres.integration.spec.ts` | 51 | YES | YES (`newS4aClient()` per actor; barrier gate) | R01–R25 fixtures, K01–K18 kill races, KS1–KS3, tenancy, immutability, boundary-revert | YES | YES |

**Totals:** 61 Postgres tests, 51 race/concurrency-class tests (25 R + 18 K + 8 supplemental).

### Race / migration mapping (authority)

- **K01–K18:** `fixtures.killRaces` — each has dedicated `it('fails closed under the DB kill row…')` (18/18).
- **R01–R25:** `fixtures.races` — each has `it('matches the contract fixture expectation')` (25/25).
- **Lease/fencing/takeover/stale epoch/S2 atomic:** embedded in R* fixtures + KS1–KS3 + K* steps.
- **Tenancy:** fixture block + DB scope triggers (migration M07 + race tenancy test).
- **Primary uniqueness / supersession:** R01, R10, R11, R24, boundary-revert test.

## CI job

- **Workflow:** `.github/workflows/s4a-postgres-integration.yml`
- **Job name:** `S4A PostgreSQL integration`
- **Postgres:** `postgres:16-alpine` service (CI major **16**; Production Hostinger PostgreSQL **16** — parity YES)
- **Command:** `npm run test:di:s4a:postgres:ci` → `DI_V0_S4A_POSTGRES_REQUIRED=1` + bootstrap + jest (61-test fail-closed count)
- **Unavailable Postgres:** bootstrap/psql/jest **FAIL** (`POSTGRES_UNAVAILABLE_BEHAVIOR=FAIL`, no skip)
- **Production secrets:** none (`PRODUCTION_DB_ACCESS=NO`)

### Required-check status

| Flag | Value |
|------|-------|
| `S4A_POSTGRES_JOB_EXISTS` | YES |
| `S4A_POSTGRES_JOB_RUNS_ON_RELEVANT_PRS` | YES (path filters on S4A, S2 shadow persistence, Prisma S4A migration, contract) |
| `S4A_POSTGRES_JOB_REQUIRED` | **Operator action:** add check name **S4A PostgreSQL integration** to branch protection required contexts (agent cannot set GitHub branch protection) |

## Local flake runs (CI-equivalent script)

| Run | Duration | Result |
|-----|----------|--------|
| 1 | ~95s wall | PASS (61/61) |
| 2 | ~95s wall | PASS (61/61) |
| 3 | ~94s wall | PASS (61/61) |

`CI_FLAKE_OBSERVED=NO` on this seal run.

## Dormant deploy readiness (re-seal, no deploy)

| Check | Result |
|-------|--------|
| Runtime callers | 0 |
| Migration backfill / canonical rewrite | 0 |
| Empty-S2 guard | Present in migration SQL |
| `lock_timeout` | 5s bounded |
| Control-row mutex blocks dormant deploy | NO (no callers) |
| Boundary-revert blocks dormant deploy | NO (no work items created) |
| Deserializer / native / provider gaps block empty table creation | NO |
| **DORMANT_MIGRATION_DEPLOY_READINESS** | **READY** (schema-only deploy path; operator decision still required) |

## Deploy gate transition

| Before | After (this PR) |
|--------|-----------------|
| `DO_NOT_DEPLOY_S4A_MIGRATION_TO_PRODUCTION` **ACTIVE** | `S4A_DORMANT_MIGRATION_DEPLOY_GATE=READY_FOR_SEPARATE_OPERATOR_DEPLOY_DECISION` |

**Not** `DEPLOY_NOW`. Operator must still choose deploy; S4B/S4C/runtime remain unauthorized.

## P2 preserved (unchanged)

P2-2 boundary-revert (before S4B), P2-3 control-row mutex (before S4C scale-up), P2-4 T13 registry (before S4B), P2-5 container naming (before contract bump), P2-6 ON UPDATE CASCADE (before tiny activation), plus historical S4 gaps (deserializer, native readiness, provider backpressure, etc.).

**Closed in this slice only:** P2-1 POSTGRES_CI_WIRING (`DI-GAP-S4A-POSTGRES-CI-WIRING-001`).
