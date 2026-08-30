# P1.7 — Scheduler Leader Election Runbook

**Date:** 2026-08-30  
**Scope:** Single-active scheduler producer across PM2 replicas  
**Prerequisite:** P1.2 FINAL-6 (#1409), P1.3 global DIMO budget (#1417)

---

## 1. Architecture

```
Replica A ─┐
Replica B ─┼─> Redis key synqdrive:scheduler:leader (SET NX PX + token)
Replica C ─┘
              ↓
        one scheduler LEADER
              ↓
   @Cron/@Interval singleton producers (guarded)
              ↓
          BullMQ enqueue
              ↓
   workers on ALL replicas (unchanged)
              ↓
   DimoRequestExecutor → P1.3 global DIMO Redis budget
```

**One global scheduler leader** guards all `SINGLETON_GLOBAL` Nest schedulers. BullMQ repeat schedulers (`DimoDtcScheduler`, `DimoVehicleSyncScheduler`) use Redis-backed `upsertJobScheduler` and are **SAFE_DISTRIBUTED**.

---

## 2. Redis lease semantics

| Property | Value |
|----------|-------|
| Key | `synqdrive:scheduler:leader` |
| Primitive | `SET key token NX PX leaseMs` |
| Renew | Lua compare-and-`PEXPIRE` (same token only) |
| Release | Lua compare-and-`DEL` (same token only) |
| Ownership truth | **Redis TTL**, not local wall clock |

Implementation reuses `RedisDistributedLockService` (token-safe acquire/extend/release).

---

## 3. Configuration

| Env | Default | Description |
|-----|---------|-------------|
| `SCHEDULER_LEADER_ELECTION_ENABLED` | `true` | Master switch |
| `SCHEDULER_LEADER_LEASE_MS` | `30000` | Lease TTL |
| `SCHEDULER_LEADER_RENEW_INTERVAL_MS` | `10000` | Leader renew cadence |
| `SCHEDULER_LEADER_ACQUIRE_INTERVAL_MS` | `5000` | Follower retry cadence |

**Validation (fail-fast at boot):**
- `renewInterval < leaseMs` with ≥2000ms margin
- `leaseMs >= 5000`
- `acquireInterval > 0`

When `SCHEDULER_LEADER_ELECTION_ENABLED=false`: process acts as leader; logs `MULTI_REPLICA_SCHEDULERS_UNSAFE`.

---

## 4. Startup behavior

1. Validate config
2. Log: enabled, lease/renew/acquire intervals, owner id (`hostname:pid:uuid`)
3. If enabled: role `FOLLOWER` → immediate acquire attempt → periodic acquire/renew timers
4. If disabled: role `LEADER` (single-replica compatible)

---

## 5. Leader / follower roles

| Role | Scheduler producers | BullMQ workers |
|------|--------------------|----------------|
| **LEADER** | Executes guarded ticks | Processes jobs |
| **FOLLOWER** | Skips guarded ticks (`synqdrive_scheduler_skipped_not_leader_total`) | Processes jobs |
| **UNKNOWN** | Skips (fail closed) | Processes jobs |

---

## 6. Failover

| Event | Behavior |
|-------|----------|
| Leader crash | Lease expires after `SCHEDULER_LEADER_LEASE_MS`; follower acquires within `+ acquireInterval` |
| Graceful shutdown | Leader releases lease (token-validated); follower may acquire on next interval |
| Renew failure | Immediate demotion to follower; no new guarded ticks |

**Worst-case crash failover bound:** `leaseMs + acquireIntervalMs` = **35s** (defaults).

**Best-case graceful failover:** ~`acquireIntervalMs` = **5s**.

---

## 7. Redis outage

| Phase | Behavior |
|-------|----------|
| Acquire | Fail closed — no leadership |
| Renew | Demote — stop trusted leadership |
| Release | TTL recovers; shutdown not blocked |

No bypass when Redis is unavailable.

---

## 8. Metrics (bounded labels)

| Metric | Labels |
|--------|--------|
| `synqdrive_scheduler_leader_status` | none (0/1 gauge) |
| `synqdrive_scheduler_leader_acquire_total` | `result` |
| `synqdrive_scheduler_leader_renew_total` | `result` |
| `synqdrive_scheduler_leader_changes_total` | `to_role` |
| `synqdrive_scheduler_skipped_not_leader_total` | `scheduler` (static enum) |
| `synqdrive_scheduler_tick_total` | `scheduler`, `result` |

---

## 9. Diagnosing no leader

1. Check `/api/v1/health` readiness → `schedulerLeader.details.role`
2. If all replicas `FOLLOWER`: Redis contention or lease held by dead process until TTL
3. Verify Redis connectivity from all replicas
4. Inspect `synqdrive_scheduler_leader_acquire_total{result="contended"}`

---

## 10. Diagnosing flapping

1. Compare `renew_total{result="lost"}` vs `leader_changes_total`
2. Ensure `renewInterval << leaseMs` (default 10s / 30s)
3. Check Redis latency / evictions
4. Do **not** shorten lease below 5s

---

## 11. Rollback

1. Set `SCHEDULER_LEADER_ELECTION_ENABLED=false` (logs unsafe warning)
2. Redeploy single replica (current production model)
3. No Redis key migration required — TTL clears stale lease

---

## 12. Single-replica config

Defaults work unchanged: one process acquires leader immediately. Guard overhead is one boolean check per tick.

---

## 13. Multi-replica rollout (design only — do not enable prod replicas yet)

1. Deploy P1.7 with `replicas=1`
2. Verify `synqdrive_scheduler_leader_status=1` on sole instance
3. Restart → verify reacquisition
4. Staging: scale to 2 replicas → exactly one leader metric = 1
5. Observe queue depth + P1.3 DIMO in-flight
6. Only then consider production `replicas=2`

---

## 14. Residual overlap window

Between lease TTL expiry and failed renew on the old leader, the demoted process may still believe it is leader for **at most one renew interval**. Already-running handler bodies may complete; **new** guarded ticks stop after demotion. Downstream BullMQ job IDs remain idempotent.

---

## 15. P1.4 boundary

| P1.7 solves | P1.4 will solve |
|-------------|-----------------|
| Duplicate **scheduled** reconciliation / snapshot enqueue from multi-replica schedulers | Reconciliation **execution mutex** across manual/API/job overlap |

Leader election ≠ reconciliation mutex.

---

## Scheduler classification summary

See `backend/src/shared/scheduler-leader/scheduler-leader.registry.ts` for the canonical `SINGLETON_GLOBAL_SCHEDULER_NAMES` list (40 schedulers).

**SAFE_DISTRIBUTED:** `dimo_dtc_bullmq_repeat`, `dimo_vehicle_sync_bullmq_repeat`  
**REPLICA_LOCAL:** metrics refresh cron jobs (per-process Prometheus gauges)

---

## P1.3 interaction

Leader election dedupes **scheduler producers**. P1.3 `DimoProviderBudgetService` caps **provider HTTP concurrency**. Do not conflate the two layers.
