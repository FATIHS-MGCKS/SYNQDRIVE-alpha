# Scheduler Leader Election (P1.7)

**TYPE:** ARCHITECTURE  
**INTRODUCED_BY:** PR #1430  
**SOURCE:** `backend/src/shared/scheduler-leader/*`, `architecture/P1_7_SCHEDULER_LEADER_ELECTION_FINAL_RESPONSE_2026-08-30.md`

---

## WHAT

Ensures **exactly one** NestJS process globally acts as the **scheduler leader** — the sole producer of singleton cron/interval work (42 `SINGLETON_GLOBAL` schedulers).

**TYPE: FACT** — BullMQ **consumers** run on **all** replicas; only **producers** are leader-guarded.

---

## WHY

**Failure mode prevented:** Duplicate scheduler ticks → duplicate BullMQ enqueues → duplicate reconciliation triggers, duplicate snapshot fanout, duplicate retention mutations, duplicate billing side effects.

**TYPE: DECISION** — Leader election chosen over "run schedulers only on replica A" because:
- Crash of A must not permanently stop all scheduling
- Explicit lease + failover is operable and testable
- Aligns with Redis already required for BullMQ

**Alternatives rejected:**
- PM2 cluster singleton — **deferred** (not current architecture)
- External cron on host — **rejected** (duplicates app lifecycle)
- Database advisory lock only — **deferred** (Redis already canonical for locks)

---

## Mechanism

| Parameter | Value | TYPE |
|-----------|-------|------|
| Redis key | `synqdrive:scheduler:leader` | FACT |
| Backend | `RedisDistributedLockService` SET NX PX + Lua renew/release | FACT |
| Lease TTL | 30000 ms | FACT |
| Renew interval | 10000 ms | FACT |
| Acquire retry | 5000 ms | FACT |
| Token-safe renew/release | YES | INVARIANT |

**Fail-closed:** Redis outage → `SchedulerLeaderGuardService.shouldRun()` false → no singleton ticks.

**Follower behavior:** Skips producer work; metrics `synqdrive_scheduler_skipped_not_leader_total`.

---

## Failover

| Scenario | Expected behavior | Evidence |
|----------|-------------------|----------|
| Graceful stop leader | Release or TTL; follower acquires | VPS probe ~7.9s (DB 15) |
| Crash leader | TTL expiry; survivor acquires | VPS probe ~10.3s |
| Production scale failover | ~32s (stop synqdrive → B leader) | P1.8.2 #1471 |
| Split brain | Prevented by token + TTL | Staging + P1.8.2: leader count max 1 |

**TYPE: INVARIANT** — `LEADER_COUNT_MAX` must never exceed 1 during steady state or controlled failover.

---

## Registry / inventory enforcement

**TYPE: FACT** — `scheduler-leader.registry.ts` enumerates 42 singleton schedulers. Architecture test fails CI if new `@Cron`/`@Interval` producer lacks guard.

**SAFE_DISTRIBUTED** (not leader-only): e.g. `dimo_dtc_bullmq_repeat`, `metrics refresh` (per-replica gauges).

---

## Assumptions

- Redis DB 0 available with low latency
- Clock skew bounded (lease TTL >> network jitter)
- Only one leader key namespace for production

---

## RISK_IF_CHANGED

| Change | Risk |
|--------|------|
| Remove guard from scheduler | Duplicate production side effects |
| Shorten TTL without tuning renew | Leader flapping |
| Per-replica leader keys | Split brain |
| Bypass guard in new scheduler | CI should catch; runtime disaster if not |

---

## Evidence

- Unit: `scheduler-leader-election.service.spec.ts`
- Integration: `scheduler-leader-multi-replica.integration.spec.ts`
- Staging VPS: leader probe in `two-replica-process-validation-probe.mjs`
- Production: P1.8 soak (leader max=1), P1.8.2 (9×5s ticks + failover)

**UNPROVEN:** Leader failover SLO under sustained load at N≈1000.
