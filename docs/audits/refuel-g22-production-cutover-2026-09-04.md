# G2.2 Physical Refuel V2 Production Cutover — Audit

**Date:** 2026-09-04  
**Branch:** `cursor/refuel-physical-event-forensics-f21f`  
**PR:** #1531  
**Integration gate head:** `30948d1f1`  
**Epistemic discipline:** `DEPLOYED_TO_PRODUCTION` ≠ `PROVEN_IN_PRODUCTION` until a real post-cutover REFUEL is observed.

## 1. G2.1d final integration gate (release gate — not shadow)

| Gate | Result |
|------|--------|
| PR_CONFLICT_FREE | YES |
| ISOLATED_MIGRATION_CHAIN | PASS |
| POSTGRES_INTEGRATION_RUN | PASS (3/3, 0 skip) |
| REDIS_BULLMQ_INTEGRATION_RUN | PASS (7/7, 0 skip) |
| BULLMQ_FAILED_JOB_RECOVERY_INTEGRATION | PASS |
| BULLMQ_MULTI_REPLICA_RACE_SAFE | YES |
| FULL_MULTI_REPLICA_RECOVERY_E2E | PASS (3/3) |
| TARGETED_REGRESSION | PASS (206/206 unit, 13 integration skipped without env) |
| TYPECHECK_OR_BUILD | PASS |
| PRISMA_VALIDATE | PASS |
| FST_GRAPH_VALIDATOR | PASS |
| EED_GRAPH_VALIDATOR | PASS |
| SHADOW_ROLLOUT_USED | **NO** |

### Isolated infrastructure (VPS Docker PG16 + Redis7, localhost only)

| Field | Value |
|-------|-------|
| TEST_POSTGRES_HOST | 127.0.0.1 |
| TEST_POSTGRES_PORT | 55432 |
| TEST_POSTGRES_DATABASE | `refuel_gate_refuel_g21d_*` (ephemeral) |
| TEST_REDIS_HOST | 127.0.0.1 |
| TEST_REDIS_PORT | 56379 |
| TEST_POSTGRES_IS_PRODUCTION | NO |
| TEST_REDIS_IS_PRODUCTION | NO |
| TEST_POSTGRES_CLEANED | YES |
| TEST_REDIS_CLEANED | YES |

Harness fix: `TEST_POSTGRES_DATABASE` env accepted by `physical-refuel-g21d-final-integration.harness.ts`.

## 2. Merge

| Field | Value |
|-------|-------|
| PR_1531_MERGED | YES |
| MERGE_SHA | `43c9ae6c546d01226c5ae113edd1d0f89f858e7e` |
| POST_MERGE_MAIN_SHA | `43c9ae6c546d01226c5ae113edd1d0f89f858e7e` |

## 3. Production migration (feature OFF)

| Field | Value |
|-------|-------|
| PHYSICAL_REFUEL_RECONCILIATION_V2_ENABLED (pre-migration) | false (unset → default) |
| PRODUCTION_MIGRATION_EXECUTED | YES |
| PRODUCTION_MIGRATION_PASS | YES |

Migrations applied via `prisma migrate deploy` in deploy release `20260904183349_v4994`:

- `20260904120000_vehicle_energy_event_refuel_reconciliation` — APPLIED
- `20260904140000_physical_refuel_g21a_recovery` — APPLIED
- `20260904160000_physical_refuel_g21b_coordinate_retry` — APPLIED
- `20260904180000_physical_refuel_g21c_evidence_fingerprint` — APPLIED
- `20260904193000_physical_refuel_g21d_route_evidence_stabilization` — APPLIED

## 4. Production deployment (feature OFF)

| Field | Value |
|-------|-------|
| PRODUCTION_DEPLOYED | YES |
| PRODUCTION_DEPLOY_SHA | `43c9ae6c546d01226c5ae113edd1d0f89f858e7e` |
| PRODUCTION_DEPLOY_FLAG_OFF | PASS |
| REPLICA_COUNT | 2 (synqdrive:3001, synqdrive-b:3002) |
| SCHEDULER_LEADER | 1 (LEADER/FOLLOWER converged) |

## 5. Direct production activation (no shadow)

| Field | Value |
|-------|-------|
| PHYSICAL_REFUEL_V2_PRODUCTION_ENABLED | YES |
| PHYSICAL_REFUEL_V2_CUTOVER_AT | `2026-09-04T18:40:13.000Z` |
| PHYSICAL_REFUEL_RECONCILIATION_V2_CUTOVER_AT | `2026-09-04T18:40:13.000Z` |
| PHYSICAL_REFUEL_RECONCILIATION_V2_ENABLED | true |
| PHYSICAL_REFUEL_RECONCILIATION_RECOVERY_ENABLED | true |
| ENV_BACKUP | `/opt/synqdrive/shared/backend.env.bak-physical-refuel-v2-20260904184013` |
| Activation mechanism | `vps-enable-physical-refuel-v2-production.sh` |

Post-cutover: new REFUEL observations at/after cutover instant are V2-owned. Legacy pre-cutover events remain legacy-owned. No mass historical reprocess authorized.

## 6. Production health (immediate)

| Field | Value |
|-------|-------|
| PRODUCTION_HEALTH_GATE | PASS |
| PRODUCTION_ROLLBACK_TRIGGERED | NO |
| EXTERNAL_HEALTH | PASS |
| POSTGRES_READINESS | ok (both replicas) |
| REDIS_READINESS | ok (both replicas) |
| CRASH_LOOP | NO |
| PHYSICAL_REFUEL_ERRORS_IN_LOGS | NO (first 2 min) |
| SCHEDULER_STORM | NO |

### Baseline metrics (T+2 min post-activation)

| Metric | Value |
|--------|-------|
| post_cutover_v2_refuels | 0 (no natural REFUEL yet) |
| reconciliation_rows | 0 (table empty at cutover) |

## 7. Production REFUEL validation

| Field | Value |
|-------|-------|
| PRODUCTION_REFUEL_V2_OBSERVED | NO |
| PRODUCTION_REFUEL_V2_VALIDATED | NO |

Watch vehicle: **KS MX 2024** on next natural refuel.

## 8. Rollback readiness

Primary kill switch: `PHYSICAL_REFUEL_RECONCILIATION_V2_ENABLED=false` + rolling restart.

Do not mass-delete reconciliation rows or rewrite production events. Preserve forensic evidence.

## 9. Known limitations

- Route evidence stabilization remains **INFERRED** at 2h horizon (`PHYSICAL_REFUEL_ROUTE_EVIDENCE_STABILIZATION_MS`).
- Concurrent failed-job recovery may log duplicate `enqueued` producer outcomes while BullMQ retains one logical job (observability gap, not duplicate jobs).
- Fleet-wide accuracy not claimed from deployment alone.

## 10. Canonical evidence nodes

- **FST:** `FST-EVID-G22-PRODUCTION-CUTOVER-2026-09-04-001`
- **EED:** `EED-EV-0038`

**Follow-up (2026-09-04 ~T+122m):** `docs/audits/refuel-g22-production-post-cutover-t60-2026-09-04.md` — `FST-EVID-G22-PRODUCTION-POST-CUTOVER-T60-2026-09-04-001`, `EED-EV-0039`.
