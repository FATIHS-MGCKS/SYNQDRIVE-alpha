# ERD E4 — Durable reconciliation / recovery liveness

**Date:** 2026-09-24  
**Workstream:** Energy Event Detection → EV Recharge Detection (E4)  
**Parent main at start:** `415060c823742dd8b0413f6bfbd6e6de54a01b2b`

## Problem closed

Pre-E4 periodic reconciliation selected fallback-capable vehicles using **`hv.is_charging` only**, while E3 fallback activation accepts SOC plus any corroborating signal (`is_charging`, `cable_connected`, `added_energy`, `charging_power`). Telemetry-capable EVs without `is_charging` could be detectable at runtime yet never receive periodic reconcile jobs. Periodic idempotency keys could also fall back to hidden `Date.now()` when no explicit bucket was supplied.

## Solution

- **Canonical eligibility:** `hv-erd-reconcile-eligibility.policy.ts` — shared by periodic target query and aligned with E3 activation semantics.
- **Periodic target query:** `hv-recharge-reconcile-target.query.ts` — ongoing sessions, native `dimo.segments.recharge`, and fallback telemetry profiles (not is_charging-only).
- **Fair bounded selection:** `hv-recharge-periodic-target.policy.ts` — `periodIndex % partitionCount` rotation with md5 vehicle partitions and SQL-bounded batch selection (E4.1; replaces hash(periodBucket) slice + pre-fairness maxScan truncation).
- **Canonical HV signal keys:** `hv-erd-capability-signal-keys.ts` — shared by registry, HvMethodProfile resolver, E3 fallback corroboration, E4 eligibility (`hv.charging_power` yes; `hv.current_power` not fallback corroboration).
- **Explicit period buckets:** `buildHvRechargePeriodicPeriodBucket(evaluatedAt)` passed into enqueue/idempotency for `PERIODIC` triggers.
- **Flag-off:** `reconcilePeriodic` returns 0 when `BATTERY_V2_HV_RECHARGE_SESSION_ENABLED` is false (no queue churn).
- **Observability:** `synqdrive_erd_e4_liveness_total{reason}` bounded reasons.

## Recovery model (no new ERD queue / table)

| Mechanism | Behavior |
|-----------|----------|
| Scheduler | Existing `BatteryV2ReconciliationScheduler` + leader guard |
| Enqueue | Existing BullMQ `HV_RECHARGE_SESSION_RECONCILE` |
| Retries | 3× exponential (5s base) for transient provider/infra |
| DLQ | Replayable failures block **same** idempotency key only; **next periodic bucket** issues a new key → future recovery without bulk DLQ clear |
| Entity-scoped DLQ clear | Not added in scheduler ticks; same pattern as assessment handoff |
| Worker crash | BullMQ stalled-job semantics (`lockDuration=180s` on Battery V2 worker) + subsequent periodic tick |
| Physical writes | Unchanged E3 advisory lock path |

**ERD_REPLAYABLE_DLQ_RECOVERY_MECHANISM:** `periodic_new_idempotency_bucket_after_replayable_dlq`

## Out of scope (unchanged)

- E5 VEE RECHARGE projection / cutover
- E6 charging-location enrichment
- Production flag enablement
- New ERD recovery persistence table

## E4.1 closure (2026-09-24, PR #1749)

- Removed false fairness: legacy `hash(periodBucket) % 12` and `take: batch×12` candidate truncation could permanently starve eligible vehicles.
- Deterministic bound: `periodIndex = floor(evaluatedAt / reconciliationIntervalMs)`, `activePartition = periodIndex % 12`, within-partition batch rotation via `subRotation = floor(periodIndex / 12)`.
- Max wait ticks (worst case): `partitionCount × ceil(eligibleCount / batchSize)`.
- PostgreSQL gate proves SOC+`hv.charging_power` eligible, SOC+`hv.current_power` only ineligible, and 109+ vehicle fleet coverage.

## E4.2 BullMQ + Redis liveness (2026-09-24, PR #1749)

- Real BullMQ `Queue` / `Worker` / `QueueEvents` on Redis (`erd-e4-reconciliation-liveness.bullmq.redis.integration.spec.ts`).
- CI: job **ERD E4 postgres+redis liveness** → `scripts/test/erd-e4-bullmq-redis-ci.sh` with `TEST_REDIS_PORT`.
- Boundary-repair step 6 remains PostgreSQL-only (no Redis service).

## Validation

- Unit: eligibility, fairness, idempotency policy, producer flag-off
- CI Postgres gate (boundary repair step 6): `ERD_E4_POSTGRES_REDIS_INTEGRATION=1` → postgres integration specs only
- CI Redis/BullMQ gate: `ERD_E4_BULLMQ_REDIS_INTEGRATION=1` + `TEST_REDIS_PORT` → bullmq redis integration spec
- E3 postgres gate (step 5) unchanged

## Reconciliation window

Rolling window remains **31 days** (`HV_RECHARGE_ROLLING_WINDOW_DAYS`) — appropriate for missed recent charge, ongoing sessions, and provider-delayed native segments without unbounded history scans (selection itself is capability/ongoing bounded).
