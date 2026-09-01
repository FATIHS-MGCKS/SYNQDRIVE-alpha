# Reconciliation Execution Mutex (P1.4)

**TYPE:** ARCHITECTURE  
**INTRODUCED_BY:** PR #1435  
**SOURCE:** `backend/src/shared/reconciliation-execution-mutex/*`, `architecture/P1_4_RECONCILIATION_EXECUTION_MUTEX_FINAL_RESPONSE_2026-08-30.md`

---

## WHAT

Per-vehicle Redis mutex ensuring **at most one** reconciliation mutation path executes for a given vehicle scope at a time, across all replicas.

**TYPE: INVARIANT** — Leader election alone is **not** sufficient (leader can enqueue; API paths and multiple workers can still race).

---

## WHY leader election is not enough

| Path | Leader required? | Mutex required? |
|------|------------------|-----------------|
| Scheduler-triggered reconciliation | YES (tick) | YES (execution) |
| API-triggered manual reconcile | NO | YES |
| Event-driven reconciliation | NO | YES |
| BullMQ worker processing | NO (all replicas) | YES |

**Failure mode:** Double reconciliation → duplicate trip writes, conflicting repairs, downstream enrichment duplication.

---

## Lock scope

```
Key: synqdrive:reconciliation:lock:{organizationId}:{vehicleId}:trip
TTL: 120s (30s renew)
```

**TYPE: FACT** — Unrelated vehicles parallelize; same vehicle contends.

---

## Contention behavior

**TYPE: DECISION** — Lock contention is **expected control flow**, not necessarily an error:
- Winner proceeds with mutation
- Loser skips safely (`LOCKED` / contended skip)
- Soak: 335 acquires, 6 contended skips — healthy

**TYPE: INVARIANT** — `RECONCILIATION_DOUBLE_EXECUTION = NO` must hold in production audits.

---

## Redis outage

**TYPE: INVARIANT** — Fail-closed `REDIS_UNAVAILABLE`; no silent bypass.

---

## Idempotency

Mutex complements (does not replace):
- Deterministic job IDs where applicable
- Trip repair idempotency keys
- DIMO segment canonical boundaries (P1.2)

---

## Evidence

| Source | Result |
|--------|--------|
| P1.4 unit/integration tests | same-vehicle concurrency = 1 |
| Staging coordination probe | 2 OS processes, 1 winner |
| P1.8 soak | 0 double execution |
| P1.8.2 production probe (DB 0) | `doubleExecutionFound: false` |

---

## RISK_IF_CHANGED

| Change | Risk |
|--------|------|
| New reconcile entry point without mutex | Duplicate mutations |
| Widen lock scope too broadly | Throughput collapse |
| Narrow lock scope | Same-vehicle races |
| Ignore LOCKED as success | Retry amplification |
