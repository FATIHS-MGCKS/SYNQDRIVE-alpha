# P1.3-S3 — Priority-Aware DIMO Provider Enforcement / Backpressure

**Date:** 2026-08-30  
**Slice:** P1.3-S3  
**Status:** Implementation complete — **shadow mode remains production default**  
**Main base SHA:** `7261a984ce0d07e97984eb00a9163fd501edc190` (PR #1423 P1.3-S2 merged)

---

## 1. Executive summary

P1.3-S3 adds the **first real enforcement layer** behind the canonical `DimoProviderGateway`:

1. **Canonical priority taxonomy** (P0–P4) with centralized category mapping
2. **Priority-aware distributed admission** (rate + in-flight + reserved high-priority slots)
3. **Bounded backpressure** via `DimoProviderAdmissionService` (enforce mode only)
4. **Central Retry-After cooldown** stored in Redis and honored on future admissions
5. **Production-grade observability** (admission wait, backpressure, cooldown, priority labels)

**Default mode remains `shadow`:** no production throttling unless `DIMO_PROVIDER_LIMITER_MODE=enforce` is explicitly set.

No trip FSM, snapshot cadence, reconciliation semantics, or canonical trip invariants were changed.

---

## 2. Pre-flight verification

| Item | Value |
|------|-------|
| **MAIN_BASE_SHA** | `7261a984ce0d07e97984eb00a9163fd501edc190` |
| **S2 merged (PR #1423)** | `7261a984c` |
| **Gateway coverage** | All `DimoTelemetryService` `client.post` exits via `DimoProviderGateway` — guard: `dimo-telemetry-gateway-coverage.spec.ts` |
| **New bypass after S2** | None |
| **Limiter default** | `shadow`, 20/s + burst 5, maxInFlight 40, reservedHigh 12 |
| **Redis fail-open** | Preserved from S2 |

---

## 3. Architecture flow

```
DimoTelemetryService / call sites
        │
        ▼
DimoProviderGateway
        │
        ├── resolve category + default priority (or explicit override)
        ├── DimoProviderAdmissionService.acquire()  ← bounded wait (enforce only)
        │         └── poll loop → DimoProviderLimiterService.begin()
        ├── invoke() → axios
        ├── classify HTTP (429/403/5xx/timeout)
        ├── setProviderCooldown on 429
        ├── metrics
        └── limiter.end(inFlightMember) in finally
```

### Components

| Component | File | Role |
|-----------|------|------|
| Gateway | `dimo-provider-gateway.service.ts` | Orchestration, cooldown on 429, lease release |
| Admission | `dimo-provider-admission.service.ts` | Bounded wait/backpressure in enforce mode |
| Limiter | `dimo-provider-limiter.service.ts` | Redis rate + in-flight + cooldown check |
| Priority model | `dimo-provider-priority.model.ts` | Canonical P0–P4 ranks, inflight member encoding |
| Category map | `dimo-provider-category.util.ts` | Operation/category → priority |
| Config | `dimo-provider-limiter.config.ts` | Env parsing, per-priority wait budgets |
| Lua scripts | `dimo-provider-limiter.redis-scripts.ts` | Atomic rate, priority in-flight, cooldown |
| Metrics | `dimo-provider-metrics.service.ts` | Prometheus counters/histograms |
| HTTP classifier | `dimo-provider-http-classifier.ts` | 403/429/5xx/timeout + Retry-After parse |

---

## 4. Priority taxonomy

| Priority | Enum | Rank | Typical traffic |
|----------|------|------|-----------------|
| P0 / CRITICAL | `P0_CRITICAL` | 0 | Active-trip tracking |
| P1 / LIVE | `P1_LIVE` | 1 | Live-driving / freshness-critical telemetry |
| P2 / INTERACTIVE | `P2_INTERACTIVE` | 2 | User-triggered vehicle summary/VIN, default GraphQL |
| P3 / NORMAL | `P3_NORMAL` | 3 | Snapshot polling / normal connected refresh |
| P4 / BACKGROUND | `P4_BACKGROUND` | 4 | Reconciliation, enrichment, DTC, sync |

Mapping is centralized in `defaultProviderPriority()` and exported as `PROVIDER_CATEGORY_PRIORITY_MAP`.  
Tests: `dimo-provider-priority.model.spec.ts`, `dimo-provider-category.util` via gateway coverage.

Legacy S2 aliases (`p1_high`, `p2_normal`, `p3_background`) normalize via `normalizeProviderPriority()`.

---

## 5. Backpressure semantics

### When provider budget is exhausted

| Mode | Behavior |
|------|----------|
| **shadow** | Record `WOULD_REJECT` / `WOULD_WAIT`; **invoke proceeds** (S2 parity) |
| **enforce** | Admission polls with bounded wait; on timeout → `DimoProviderAdmissionTimeoutError` |

### By traffic class

| Class | On contention |
|-------|----------------|
| **P0/P1 live** | Reserved in-flight slots; shorter poll bias; longer wait budget |
| **P2 interactive** | Standard wait budget |
| **P3 snapshot** | May wait; defers to next poll cycle on timeout (existing scheduler) |
| **P4 background** | Shortest wait budget; reconciliation/enrichment retried by existing BullMQ/cron |

### Max wait expired

- Throws `DimoProviderAdmissionTimeoutError` (typed, includes category/priority/reason)
- **No duplicate retry loop in gateway** — existing schedulers own retry/defer
- **PERMANENT_TRIP_LOSS = NO** — reconciliation and snapshot tiers recover observation gaps

### Cancellation

- `AbortSignal` on gateway params aborts admission loop
- `finally` releases `inFlightMember` — no lease leak

---

## 6. Retry-After / provider backoff

On HTTP 429:

1. `classifyDimoProviderHttpError` parses `Retry-After` (integer seconds; HTTP-date compatible path in classifier)
2. `DimoProviderLimiterService.setProviderCooldown(seconds, maxSeconds)` stores global cooldown in Redis
3. `begin()` checks cooldown → returns `WOULD_WAIT` with `wouldDelayMs`
4. Pathological values clamped by `DIMO_PROVIDER_RETRY_AFTER_MAX_SECONDS` (default 120s)
5. Metric: `synqdrive_dimo_provider_cooldown_total`

403 remains classified for observability only — connectivity degradation workstream unchanged.

---

## 7. Redis key model

| Key | Pattern | Purpose | TTL |
|-----|---------|---------|-----|
| Rate | `dimo:provider:limiter:rate:{epochSecond}` | Global req/s counter | 3s |
| In-flight | `dimo:provider:limiter:inflight` | ZSET `rank:leaseId` → expiry ms | 120s PEXPIRE |
| Cooldown | `dimo:provider:limiter:cooldown` | Provider-wide 429 backoff end (epoch ms) | Retry-After bounded |

**Tenancy:** keys are global provider budgets — no vehicleId/orgId in keys (no cross-tenant data leakage).

---

## 8. Configuration

| Env | Default | Notes |
|-----|---------|-------|
| `DIMO_PROVIDER_LIMITER_MODE` | `shadow` | `off` \| `shadow` \| `enforce` |
| `DIMO_PROVIDER_RATE_LIMIT_PER_SECOND` | 20 | Internal safety budget |
| `DIMO_PROVIDER_RATE_BURST` | 5 | Burst allowance |
| `DIMO_PROVIDER_MAX_IN_FLIGHT` | 40 | Global concurrent provider calls |
| `DIMO_PROVIDER_INFLIGHT_LEASE_MS` | 45000 | Stale lease recovery |
| `DIMO_PROVIDER_RESERVED_HIGH_PRIORITY_SLOTS` | 12 (auto min 1, max 30% cap) | P0/P1 lane when at cap |
| `DIMO_PROVIDER_MAX_WAIT_MS` | 5000 | Base enforce wait |
| `DIMO_PROVIDER_MAX_WAIT_MS_P0`…`P4` | derived | Per-priority overrides |
| `DIMO_PROVIDER_ADMISSION_POLL_MIN_MS` | 25 | Poll floor |
| `DIMO_PROVIDER_ADMISSION_POLL_MAX_MS` | 250 | Poll ceiling |
| `DIMO_PROVIDER_RETRY_AFTER_MAX_SECONDS` | 120 | Cooldown clamp |

Startup log prints effective mode and budgets (`DimoProviderGateway.onModuleInit`).

---

## 9. Observability

| Metric | Labels |
|--------|--------|
| `synqdrive_dimo_provider_requests_total` | operation, mode, status_class, **priority** |
| `synqdrive_dimo_provider_admission_wait_seconds` | operation, priority, outcome |
| `synqdrive_dimo_provider_backpressure_total` | operation, priority, reason |
| `synqdrive_dimo_provider_admission_timeouts_total` | operation, priority, reason |
| `synqdrive_dimo_provider_cooldown_total` | operation |
| (S2 metrics preserved) | in-flight, shadow decisions, 403/429/5xx, redis fail-open |

No vehicleId labels — low cardinality only.

---

## 10. Test matrix

### Unit / model

- `dimo-provider-admission.service.spec.ts` — bounded wait, timeout, poll bias
- `dimo-provider-priority.model.spec.ts` — taxonomy + inflight members
- `dimo-provider-gateway.service.spec.ts` — shadow parity, enforce timeout, 429 cooldown
- `dimo-provider-limiter.service.spec.ts` — distributed semantics mock
- `dimo-provider-limiter-s3-load-matrix.spec.ts` — N=100/250/1000 × S1/S2/S3, PERMANENT_TRIP_LOSS=NO

### Real Redis CI (`redis:7-alpine`, `DIMO_PROVIDER_LIMITER_REDIS_INTEGRATION=1`)

| Proof | Test |
|-------|------|
| Shared rate budget (2 replicas) | A, C-rate |
| Shared in-flight (2 replicas) | B, C |
| Release + stale lease recovery | D, E, F |
| Shadow non-blocking | G |
| Redis fail-open | H |
| **P1 not starved by P4** | I |
| **Shared Retry-After cooldown** | J |
| **Enforce admission wait → grant** | K |

### Trip correctness regression

- FINAL-3 / 3.1 / 3.2 partial boundary repair — PASS
- FINAL-5 / FINAL-6 scale gates — PASS
- `dimo-telemetry-gateway-coverage.spec.ts` — PASS

---

## 11. Failure semantics

| Failure | Behavior |
|---------|----------|
| Redis unavailable | Fail-open (S2 policy); metric `limiter_redis_errors_total` |
| Admission timeout | Typed error; scheduler retries later |
| 429 + Retry-After | Global cooldown; all replicas honor |
| Worker restart | Stale in-flight leases expire via TTL |
| enforce + shadow coexist | shadow never blocks; enforce blocks only when configured |

---

## 12. Rollback procedure

1. Set `DIMO_PROVIDER_LIMITER_MODE=shadow` (immediate — non-blocking)
2. Or `DIMO_PROVIDER_LIMITER_MODE=off` / `DIMO_PROVIDER_LIMITER_ENABLED=false`
3. Redeploy — no schema migration required
4. Redis keys are ephemeral; safe to `DEL dimo:provider:limiter:*` if needed

---

## 13. Known limitations

- Rate limit is per-second bucket (not token-bucket smooth refill) — acceptable for S3; S4 may refine
- Enforce mode not enabled in production by this slice — requires ops validation
- Load matrix is deterministic model-based; not full latency simulation
- 403 connectivity degradation not auto-remediated (separate workstream)

---

## 14. Recommendation for S4

- Gradual enforce rollout with per-category flags
- Token-bucket or sliding-window rate smoothing
- Adaptive wait budgets from observed provider latency
- Dashboards/alerts on admission timeout rate by priority
- Canary enforce on single worker replica before fleet-wide

---

## 15. Files changed (S3)

```
backend/src/config/dimo-provider-limiter.config.ts
backend/src/config/dimo-provider-limiter.config.spec.ts
backend/.env.example
backend/src/modules/dimo/dimo.module.ts
backend/src/modules/dimo/dimo-telemetry.service.spec.ts
backend/src/modules/dimo/provider/dimo-provider-admission.service.ts
backend/src/modules/dimo/provider/dimo-provider-admission.service.spec.ts
backend/src/modules/dimo/provider/dimo-provider-admission.errors.ts
backend/src/modules/dimo/provider/dimo-provider-priority.model.ts
backend/src/modules/dimo/provider/dimo-provider-priority.model.spec.ts
backend/src/modules/dimo/provider/dimo-provider-category.util.ts
backend/src/modules/dimo/provider/dimo-provider-gateway.service.ts
backend/src/modules/dimo/provider/dimo-provider-gateway.service.spec.ts
backend/src/modules/dimo/provider/dimo-provider-gateway.types.ts
backend/src/modules/dimo/provider/dimo-provider-limiter.service.ts
backend/src/modules/dimo/provider/dimo-provider-limiter.service.spec.ts
backend/src/modules/dimo/provider/dimo-provider-limiter.types.ts
backend/src/modules/dimo/provider/dimo-provider-limiter.redis-scripts.ts
backend/src/modules/dimo/provider/dimo-provider-limiter.redis.integration.spec.ts
backend/src/modules/dimo/provider/dimo-provider-limiter-s3-load-matrix.spec.ts
backend/src/modules/dimo/provider/dimo-provider-metrics.service.ts
architecture/DIMO_PROVIDER_CONCURRENCY_P1_3_S3_PRIORITY_BACKPRESSURE_2026-08-30.md
architecture/P1_3_S3_PRIORITY_BACKPRESSURE_FINAL_RESPONSE_2026-08-30.md
frontend/src/master/components/ChangesView.tsx
frontend/src/master/components/ArchitekturView.tsx
```
