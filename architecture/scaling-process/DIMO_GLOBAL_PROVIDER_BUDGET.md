# DIMO Global Provider Budget (P1.3)

**TYPE:** ARCHITECTURE  
**INTRODUCED_BY:** PR #1417  
**SOURCE:** `backend/src/modules/dimo/provider-budget/*`, `architecture/P1_3_GLOBAL_DIMO_PROVIDER_BUDGET_FINAL_RESPONSE_2026-08-29.md`

---

## WHAT

A **global** Redis-backed semaphore limiting **in-flight DIMO provider HTTP requests** across all Node processes and replicas.

**TYPE: INVARIANT** — Limit is **not** multiplied by replica count.

---

## WHY per-worker concurrency is insufficient

**TYPE: DECISION**

BullMQ `WORKER_*_CONCURRENCY` limits jobs per process. With 2 replicas, effective job parallelism doubles. Each job may issue multiple DIMO HTTP calls. Without a global ceiling, **provider in-flight** can exceed DIMO rate limits → 429 waves, retry storms, trip pipeline degradation.

**Failure mode addressed:** Provider saturation and 429 amplification under horizontal scale.

---

## Mechanism

| Component | Role |
|-----------|------|
| `DimoRequestExecutor` | Canonical wrapper — acquire permit, HTTP, release |
| Redis ZSET leases | `dimo:provider:budget:leases` |
| Lua scripts | Atomic acquire/release, stale lease expiry |
| `AsyncLocalStorage` | Prevents double-acquire in nested calls |
| Categories | LIVE_SNAPSHOT, ACTIVE_TRIP, RECONCILIATION, etc. |
| Priority | CRITICAL > HIGH > NORMAL > LOW > BACKGROUND |
| Starvation prevention | Reserved high slots + age promotion |

**Defaults (FACT):**

- `DIMO_GLOBAL_BUDGET_ENABLED=true`
- `DIMO_GLOBAL_MAX_IN_FLIGHT=50`
- `DIMO_GLOBAL_LEASE_MS=30000`
- Fail-closed on Redis outage

**429 handling:** Parse `Retry-After`, cooldown metric, bounded backoff.

---

## Local vs global

| Layer | Limits | Scope |
|-------|--------|-------|
| BullMQ concurrency | CPU / process job slots | Per replica |
| DIMO global budget | Provider HTTP in-flight | **All replicas** |

**TYPE: INVARIANT** — Both layers required; neither replaces the other.

---

## Queue backpressure

**TYPE: FACT** — `DimoQueueBackpressureService` can defer snapshot scheduler enqueue when `dimo.snapshot.poll` waiting ≥ 500.

---

## Multi-replica evidence

| Phase | Result |
|-------|--------|
| Jest multi-instance tests | No double acquire; limit enforced |
| Staging VPS (DB 15) | 10/13 workers — no breach |
| Production soak P1.8 | in-flight max ≤1, 0 breaches |
| P1.8.2 scale (DB 0) | limit=50, probe max 45/50, no breach |

---

## LIMITATIONS

```
PROVIDER_CEILING_VERIFIED = NO
N1000_CERTIFICATION = CONDITIONAL
```

**TYPE: OPEN_QUESTION** — Actual DIMO provider quota at N≈1000 fleet not externally verified in production soak.

---

## Incident: Prometheus duplicate metric (related)

Deploy `85c3cd8e0` registered duplicate gauge `synqdrive_dimo_provider_cooldown_active` from two services. Hotfix `3874360e0` renamed to `synqdrive_dimo_global_budget_cooldown_active`.

**Lesson:** Full `AppModule` boot check (`SYNQDRIVE_BOOT_CHECK=1`) now prevents promotion. See FAILURE_AND_RECOVERY_MODEL.md.

---

## RISK_IF_CHANGED

| Change | Risk |
|--------|------|
| Bypass executor for new DIMO HTTP path | Unbudgeted provider calls |
| Per-replica budget counters | Effective limit × N replicas |
| Disable fail-closed on Redis outage | Provider flood |
| Raise limit without provider validation | 429 storms |
