# P1.3 — Global DIMO Provider Budget

**Date:** 2026-08-29  
**Prerequisite:** P1.2 FINAL-6 merged (#1409)  
**Scope:** Redis-backed global provider concurrency for N≈1000 scale path

---

## Architecture fields

| Field | Value |
|-------|-------|
| `GLOBAL_DIMO_BUDGET` | **ENABLED** (`DIMO_GLOBAL_BUDGET_ENABLED=true` default) |
| `GLOBAL_LIMIT_IMPLEMENTATION` | `DimoProviderBudgetService` + `DimoRequestExecutor` |
| `REDIS_PRIMITIVE` | Sorted-set lease registry + Lua atomic acquire/release |
| `LEASE_SEMANTICS` | `ZADD` score=expiryMs; `ZREMRANGEBYSCORE` on acquire; idempotent `ZREM` release |
| `FAILURE_MODE` | **FAIL CLOSED** on Redis outage (`REDIS_UNAVAILABLE`) |
| `RETRY_AFTER_POLICY` | Parse seconds/HTTP-date; cap `DIMO_GLOBAL_RETRY_AFTER_MAX_MS`; provider cooldown after 429 burst |
| `CATEGORY_PRIORITIES` | ACTIVE_TRIP(CRITICAL) > LIVE_SNAPSHOT(HIGH) > RECONCILIATION > POST_TRIP_ENRICHMENT > HEALTH/ENERGY(LOW) > IDENTITY/ADMIN(BACKGROUND) |
| `QUEUE_BACKPRESSURE` | `DimoQueueBackpressureService` — snapshot enqueue defer when waiting > 500 |
| `MULTI_REPLICA_SAFE` | **YES** — shared Redis key `dimo:provider:budget:leases` |
| `CURRENT_PROD_LIMIT` | `DIMO_GLOBAL_MAX_IN_FLIGHT=50` (starting point) |
| `N1000_CERTIFICATION` | **CONDITIONALLY_CERTIFIED** — architecture proven; provider ceiling externally unverified |
| `PROVIDER_CEILING_VERIFIED` | **NO** |

---

## Canonical wrapper

All DIMO HTTP traffic flows through **`DimoRequestExecutor.execute()`** at:

- `DimoTelemetryService` (GraphQL + summary/VIN)
- `DimoAuthService` (auth + token exchange)
- `DimoApiSyncService` (identity GraphQL)
- `DimoTriggersService` (REST triggers API)

Workers set category via `runWithDimoRequestContext()` — **no double acquire** inside nested calls.

---

## Local vs global concurrency

| Control | Role |
|---------|------|
| `WORKER_SNAPSHOT_CONCURRENCY` | Process-local BullMQ worker slots |
| `WORKER_TRIP_TRACKING_CONCURRENCY` | Process-local trip FSM slots |
| `DIMO_GLOBAL_MAX_IN_FLIGHT` | **Global** provider HTTP ceiling (all replicas) |

---

## N≈1000 load model (S1)

| N | Snapshot enqueue/min | Required global c @P50 8s |
|---|---------------------|---------------------------|
| 100 | ~38 | 6 |
| 250 | ~94 | 13 |
| 500 | ~189 | 25 |
| 1000 | ~377 | **51** |

With `DIMO_GLOBAL_MAX_IN_FLIGHT=50`, S1 N=1000 is **architecture-stable** only when combined with tier polling + queue backpressure; **provider quota remains unverified**.

---

## Trip-loss regression

P1.2 FINAL-3/3.1/3.2/6 invariants unchanged. Budget starvation → BullMQ retry + reconciliation repair → **no permanent trip loss**.

---

## Rollback

1. `DIMO_GLOBAL_BUDGET_ENABLED=false` (startup WARN: N≈1000 void)
2. Lower `DIMO_GLOBAL_MAX_IN_FLIGHT`
3. Reduce local worker concurrency
4. Deploy prior release

See `architecture/DIMO_GLOBAL_PROVIDER_BUDGET_P1_3_RUNBOOK_2026-08-29.md`.
