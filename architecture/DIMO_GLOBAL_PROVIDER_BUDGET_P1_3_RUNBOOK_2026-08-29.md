# DIMO Global Provider Budget — P1.3 Runbook

**Date:** 2026-08-29

---

## 1. Architecture

Redis-backed global lease semaphore (`dimo:provider:budget:leases`) shared across all Node/PM2 replicas. Canonical HTTP wrapper: `DimoRequestExecutor`.

## 2. Configuration

| Variable | Default | Description |
|----------|---------|-------------|
| `DIMO_GLOBAL_BUDGET_ENABLED` | `true` | Master switch |
| `DIMO_GLOBAL_MAX_IN_FLIGHT` | `50` | Global concurrent DIMO HTTP slots |
| `DIMO_GLOBAL_ACQUIRE_TIMEOUT_MS` | `15000` | Max wait for permit |
| `DIMO_GLOBAL_LEASE_MS` | `30000` | Lease TTL (crash recovery) |
| `DIMO_GLOBAL_RETRY_AFTER_MAX_MS` | `120000` | Cap parsed Retry-After |
| `DIMO_GLOBAL_MAX_RETRIES` | `3` | HTTP retry attempts |
| `DIMO_GLOBAL_RESERVED_HIGH_SLOTS` | `10` | Reserved for CRITICAL/HIGH under saturation |
| `DIMO_GLOBAL_STARVATION_PROMOTION_MS` | `30000` | Promote LOW/BACKGROUND after wait |
| `DIMO_PROVIDER_COOLDOWN_429_THRESHOLD` | `5` | 429s/min before cooldown |
| `DIMO_PROVIDER_COOLDOWN_MS` | `30000` | Cooldown duration |

## 3. Current-production recommended settings

```bash
DIMO_GLOBAL_BUDGET_ENABLED=true
DIMO_GLOBAL_MAX_IN_FLIGHT=50
WORKER_SNAPSHOT_CONCURRENCY=8
WORKER_TRIP_TRACKING_CONCURRENCY=5
```

## 4. N≈1000 recommended starting settings

```bash
DIMO_GLOBAL_MAX_IN_FLIGHT=60
WORKER_SNAPSHOT_CONCURRENCY=13
WORKER_TRIP_TRACKING_CONCURRENCY=8
DIMO_GLOBAL_RESERVED_HIGH_SLOTS=15
```

Tune using `synqdrive_dimo_global_in_flight` and queue oldest-job-age metrics.

## 5. Rollout

1. Deploy with budget enabled (default).
2. Watch `synqdrive_dimo_acquire_timeout_total` and queue lag.
3. Increase `DIMO_GLOBAL_MAX_IN_FLIGHT` only with provider evidence.

## 6. Metrics

- `synqdrive_dimo_global_in_flight`
- `synqdrive_dimo_global_limit`
- `synqdrive_dimo_acquire_wait_seconds`
- `synqdrive_dimo_acquire_timeout_total{category}`
- `synqdrive_dimo_requests_total{category,result}`
- `synqdrive_dimo_429_total{category}`
- `synqdrive_queue_waiting{queue}`
- `synqdrive_queue_oldest_job_age_seconds{queue}`

## 7. 429 response

- Retry-After honored (capped).
- Provider cooldown after burst.
- Jobs retry via BullMQ; no trip loss.

## 8. Redis outage

**FAIL CLOSED** — `REDIS_UNAVAILABLE` / `ACQUIRE_TIMEOUT`; jobs retry; no unbounded provider flood.

## 9. Queue backlog

Snapshot scheduler defers enqueue when `dimo.snapshot.poll` waiting ≥ 500. Reconciliation repairs observation gaps.

## 10. Lowering concurrency

Reduce `DIMO_GLOBAL_MAX_IN_FLIGHT` before local worker concurrency when provider pressure rises.

## 11. Rollback

`DIMO_GLOBAL_BUDGET_ENABLED=false` or prior release. Do not disable trip tracking unless emergency.

## 12. Multi-replica notes

Limit is global — two replicas share one Redis counter. Do not multiply limit by replica count.

## 13. Certification limits

**CONDITIONALLY_CERTIFIED** for N≈1000 architecture. **Provider ceiling unverified.**

## 14. Provider ceiling uncertainty

DIMO does not publish authoritative rate limits in-repo. Certification covers software correctness, not provider quota.

---

## Alert thresholds (runbook)

| Condition | Threshold |
|-----------|-----------|
| Global in-flight | ≥ 90% limit for 5 min |
| 429 rate | > 10/min sustained |
| Snapshot oldest job age | > 300s |
| Trip-tracking oldest job age | > 120s |
| Acquire timeout rate | > 5/min |
