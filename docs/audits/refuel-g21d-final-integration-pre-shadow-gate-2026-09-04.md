# G2.1d Physical Refuel Final Integration Pre-Shadow Gate — Audit

**Date:** 2026-09-04  
**Starting PR head:** `bc1b5ae82c3b8336885146a5a3563bf04afab51f`  
**Main sync target:** `8a11477bd73daa31ef558684662c4c3f1c6041e0`  
**Post-sync head:** `972d815aa` (merge commit) + integration harness commits  
**PR:** #1531 (DRAFT, conflict-free after sync)  
**Branch:** `cursor/refuel-physical-event-forensics-f21f`

Epistemic status: **CONFIRMED / PROVEN_BY_INTEGRATION_TEST** — not PROVEN_IN_PRODUCTION.

## 1. Main sync

| Field | Value |
|-------|-------|
| PRE_SYNC_HEAD | `bc1b5ae82` |
| SYNC_TARGET_MAIN_SHA | `8a11477bd73daa31ef558684662c4c3f1c6041e0` |
| PR_DRAFT_BEFORE_SYNC | YES |
| PR_MERGEABLE_BEFORE_SYNC | CONFLICTING |
| PR_MERGEABLE_AFTER_SYNC | MERGEABLE |
| PR_STILL_DRAFT | YES |
| PR_MERGED | NO |

### Merge conflicts

| File | OURS (PR #1531) | THEIRS (main / RD004-B) | Resolution | DATA_LOST |
|------|-----------------|-------------------------|------------|-----------|
| `frontend/src/master/components/ChangesView.tsx` | G2.1d + physical-refuel G1/G2 entries | RD004-B DI-EV-0035B.6.1–B entries | Inserted RD004-B block after G2.1d; preserved all physical-refuel entries | NO |

`ArchitekturView.tsx` auto-merged; both G2.1d and RD004-B entries present.

## 2. Isolated infrastructure proof

Docker daemon unavailable in Cloud Agent VM. Used **localhost-isolated** services with unique credentials — not production.

| Field | Value |
|-------|-------|
| POSTGRES_HOST | `127.0.0.1` |
| POSTGRES_PORT | `5432` |
| POSTGRES_DATABASE | `synqdrive_g21d_final_test` |
| POSTGRES_CONTAINER | N/A (local PostgreSQL 16 service) |
| REDIS_HOST | `127.0.0.1` |
| REDIS_PORT | `56379` |
| REDIS_CONTAINER | N/A (ephemeral `redis-server` on `/tmp/synqdrive-g21d-final-redis`) |
| POSTGRES_IS_PRODUCTION | **NO** |
| REDIS_IS_PRODUCTION | **NO** |
| PRODUCTION_INFRA_TOUCHED | **NO** |

Safety: `DATABASE_URL` targets dedicated test DB only; blocked hosts (`srv1374778`, `app.synqdrive.eu`, etc.) rejected by harness.

## 3. Migration chain

Mechanism: `bash scripts/test/prisma-migrate-deploy-resilient.sh` with `PRISMA_MIGRATE_EPHEMERAL_RECOVERY=1`.

| Migration | Result |
|-----------|--------|
| `20260904120000_vehicle_energy_event_refuel_reconciliation` | APPLIED |
| `20260904140000_physical_refuel_g21a_recovery` | APPLIED |
| `20260904160000_physical_refuel_g21b_coordinate_retry` | APPLIED |
| `20260904180000_physical_refuel_g21c_evidence_fingerprint` | APPLIED |
| `20260904193000_physical_refuel_g21d_route_evidence_stabilization` | APPLIED |

G2.1d columns verified: `route_evidence_fingerprint`, `route_evidence_stabilization_until`.

**ISOLATED_MIGRATION_CHAIN = PASS**

## 4. PostgreSQL integration

`PHYSICAL_REFUEL_RECONCILIATION_POSTGRES_INTEGRATION=1`

| Case | Result |
|------|--------|
| PG1 same-vehicle serialization | PASS |
| PG2 different-vehicle parallelism | PASS |
| PG3 G2.1d SR4 multi-replica lock | PASS |

| Metric | Value |
|--------|-------|
| POSTGRES_INTEGRATION_SUITES | 1 |
| POSTGRES_INTEGRATION_TESTS | 3 |
| POSTGRES_INTEGRATION_PASS | 3 |
| POSTGRES_INTEGRATION_FAIL | 0 |
| POSTGRES_INTEGRATION_SKIP | 0 |

## 5. Redis / BullMQ integration

`PHYSICAL_REFUEL_BULLMQ_INTEGRATION=1` — isolated Redis port 56379, dedicated queue prefix.

| Case | Result |
|------|--------|
| BQ-REAL-1 WAITING dedupe | PASS |
| BQ-REAL-2 DELAYED dedupe | PASS |
| BQ-REAL-3 crash-window dedupe | PASS |
| BQ-REAL-4 FAILED job real recovery | PASS |
| BQ-REAL-5 terminal DB FAILED not retried | PASS |
| BQ-REAL-6 COMPLETED not reprocessed | PASS |
| BQ-REAL-RACE concurrent failed-job recovery | PASS (1 logical job; both producers may report `enqueued`, BullMQ converges) |

**BULLMQ_FAILED_JOB_RECOVERY_INTEGRATION = PASS**

## 6. Full multi-replica recovery E2E

`PHYSICAL_REFUEL_MULTI_REPLICA_INTEGRATION=1`

| Case | Result |
|------|--------|
| Same vehicle concurrent recovery → one BullMQ job | PASS |
| Different vehicles parallel progress | PASS |
| Two scheduler instances same vehicle | PASS |

**FULL_MULTI_REPLICA_RECOVERY_E2E = PASS**

## 7. Post-sync regression

Pattern: `physical-refuel|fuel-station-enrichment-producer|fuel-station-enrichment-recovery|energy-events-g21`

| Metric | Value |
|--------|-------|
| DEFAULT_TARGETED_RUN_SUITES | 20 passed, 3 skipped (integration suites without env flags) |
| DEFAULT_TARGETED_RUN_PASS | 206 |
| DEFAULT_TARGETED_RUN_FAIL | 0 |
| DEFAULT_TARGETED_RUN_SKIP | 13 (10 integration + 3 describe.skip) |

## 8. Build / validators

| Gate | Result |
|------|--------|
| TYPECHECK_OR_BUILD | PASS |
| PRISMA_VALIDATE | PASS |
| FST_GRAPH_VALIDATOR | PASS |
| EED_GRAPH_VALIDATOR | PASS |

## 9. Feature flag safety

| Assertion | Result |
|-----------|--------|
| PHYSICAL_REFUEL_RECONCILIATION_V2_ENABLED default | `false` |
| FEATURE_FLAG_DEFAULT_OFF | YES |
| FLAG_OFF_REGRESSION_PASS | YES |
| PRODUCTION_FEATURE_ENABLED | NO |
| PRODUCTION_MIGRATION_EXECUTED | NO |
| PRODUCTION_MUTATED | NO |
| PRODUCTION_DEPLOYED | NO |

## 10. Production safety

All production safety assertions hold. No deploy, no flag enable, no production DB/Redis mutation.

## 11. Canonical evidence nodes

- **FST:** `FST-EVID-G21D-FINAL-PRE-SHADOW-INTEGRATION-2026-09-04-001`
- **EED:** `EED-EV-0037`

## 12. G2.2 authorization

Integration gate **PASS**. G2.2 shadow rollout remains **NOT authorized** pending independent human verification — do not enable flag or deploy from this gate turn.

## 13. Remaining risks

- Concurrent failed-job recovery may report duplicate `enqueued` producer outcomes while BullMQ retains one logical job (observability gap, not duplicate jobs).
- Integration used localhost Postgres/Redis, not Docker-named containers (daemon unavailable).
- Prisma client/schema drift on `vehicles.front_weight_distribution_pct` — harness uses raw SQL for org/vehicle seeding.
