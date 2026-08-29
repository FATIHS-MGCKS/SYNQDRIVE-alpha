# P1.3-S2 — Redis-Backed DIMO Provider Limiter (Shadow Mode)

**Date:** 2026-08-29  
**Slice:** P1.3-S2  
**Status:** Implementation complete — shadow mode default, enforcement disabled  
**Main base SHA:** `87bbaf8bfb035ffef94e1019d3aa5a32e3b75efa` (includes PR #1420 P1.3-S1)

---

## 1. Executive summary

P1.3-S2 introduces a **process-independent, Redis-backed global DIMO provider limiter** behind the canonical `DimoProviderGateway`. The limiter models both:

1. **Global request-rate budget** (per-second counter with burst)
2. **Global in-flight concurrency budget** (ZSET leases with TTL)

**Default mode is `shadow`:** all provider requests execute unchanged; the limiter records what *would* have happened under enforcement. Redis failures **fail-open** — telemetry is never blocked in shadow mode.

No trip FSM, snapshot cadence, reconciliation, or retry semantics were changed.

---

## 2. Pre-flight verification

| Item | Value |
|------|-------|
| **MAIN_BASE_SHA** | `87bbaf8bfb035ffef94e1019d3aa5a32e3b75efa` |
| **PR #1420 present** | YES — merged as `87bbaf8bf` |
| **GATEWAY_COVERAGE_BEFORE_S2** | All `DimoTelemetryService` `client.post` exits routed via `DimoProviderGateway` (3 paths: `postGraphQL`, `fetchVehicleSummary`, `fetchVehicleVin`) |
| **ANY_BYPASS_FOUND** | Auth/token (`DimoAuthService`), triggers/webhooks, ops scripts — intentional non-telemetry paths; documented tech debt |
| **ANY_BYPASS_FIXED** | None required for S2 — telemetry hot path already canonical |

Static guard: `backend/src/modules/dimo/dimo-telemetry-gateway-coverage.spec.ts`

---

## 3. Architecture components

```
DimoTelemetryService
        │
        ▼
DimoProviderGateway          ← canonical telemetry HTTP authority
        │
        ├── DimoProviderLimiterService   (Redis Lua: rate + in-flight)
        ├── DimoProviderMetricsService   (Prometheus)
        └── invoke() → axios client
```

| Component | File | Role |
|-----------|------|------|
| Gateway | `dimo-provider-gateway.service.ts` | Orchestrates limiter begin/end, metrics, invoke |
| Config | `dimo-provider-limiter.config.ts` | Env parsing, bounds validation |
| Limiter | `dimo-provider-limiter.service.ts` | Redis coordination |
| Lua scripts | `dimo-provider-limiter.redis-scripts.ts` | Atomic rate + in-flight |
| Types | `dimo-provider-limiter.types.ts` | Decisions, categories, priorities |
| Metrics | `dimo-provider-metrics.service.ts` | Prometheus counters/gauges/histogram |
| HTTP classifier | `dimo-provider-http-classifier.ts` | 403/429/5xx/timeout + Retry-After |
| Category util | `dimo-provider-category.util.ts` | Operation → category/priority |

---

## 4. Redis algorithm

### 4.1 Key namespace

| Key | Pattern | TTL |
|-----|---------|-----|
| Rate bucket | `dimo:provider:limiter:rate:{epochSecond}` | 3s (EXPIRE on first INCR) |
| In-flight ZSET | `dimo:provider:limiter:inflight` | 120s PEXPIRE (refreshed on acquire) |

### 4.2 Rate limit (per-second)

Lua script: `INCR` counter, compare to `rateLimitPerSecond + rateBurst`.

- Decision: `allow` or `would_reject`
- Always increments counter (measures demand even when over budget)

### 4.3 In-flight concurrency

Lua script:

1. `ZREMRANGEBYSCORE` expired leases (`score <= nowMs`)
2. `ZCARD` → count active leases
3. If `count >= maxInFlight` → `would_reject` (no lease acquired)
4. Else `ZADD` lease with `score = expiryMs`
5. On request completion: `ZREM` lease (idempotent)

**Shadow and enforce both skip lease acquisition on `would_reject`** — shadow still executes the HTTP call but does not inflate global in-flight accounting for requests that would have been rejected.

### 4.4 Redis operations per provider request

| Phase | Operations |
|-------|------------|
| `begin` | 2× `EVAL` (rate + in-flight) in parallel |
| `end` | 1× `EVAL` (release) in `finally` |

**Total: 3 Redis round trips per request** (2 parallel + 1 sequential release).

---

## 5. Configuration

| Env | Default | Description |
|-----|---------|-------------|
| `DIMO_PROVIDER_LIMITER_ENABLED` | derived | `false` only if explicit; else `true` when mode ≠ off |
| `DIMO_PROVIDER_LIMITER_MODE` | `shadow` | `off` \| `shadow` \| `enforce` |
| `DIMO_PROVIDER_RATE_LIMIT_PER_SECOND` | `20` | Internal safety budget (below Core 25/s) |
| `DIMO_PROVIDER_RATE_BURST` | `5` | Burst allowance |
| `DIMO_PROVIDER_MAX_IN_FLIGHT` | `40` | Internal protective in-flight cap |
| `DIMO_PROVIDER_INFLIGHT_LEASE_MS` | `45000` | Lease TTL for crash recovery |

### 5.1 Documented vs internal budget

| Concept | Value | Source |
|---------|-------|--------|
| DIMO Core documented rate ceiling | **25 req/s** per API service per client host | DIMO FAQ (Phase 0 audit) |
| Internal safety budget | **20 req/s + burst 5 = 25 peak** | Config default — matches ceiling at peak burst but sustained rate is 20/s, leaving headroom below documented 25/s sustained |
| Published DIMO max in-flight | **Unknown** | No authoritative provider quota found (Phase 0) |

**Justification for 20/s sustained:** leaves 20% headroom below documented 25/s for transient spikes handled by burst; avoids operating at provider ceiling.

---

## 6. Shadow semantics

| Mode | Rate decision | In-flight decision | HTTP invoke | Lease acquired on reject |
|------|---------------|-------------------|-------------|--------------------------|
| `off` | BYPASS | BYPASS | Always | N/A |
| `shadow` | Evaluated | Evaluated | **Always** | No |
| `enforce` | Evaluated | Evaluated | Only if both ALLOW | No |

**Shadow is provably non-behavioral:**

- Same `invoke()` args and return value
- Same error propagation
- No artificial delay
- No rejection
- Redis outage → `ERROR_FAIL_OPEN` → request proceeds

---

## 7. Fail-open / fail-closed policy

| Scenario | S2 (shadow) | Future enforce |
|----------|---------------|----------------|
| Redis unavailable | **Fail-open** — request proceeds, `redisFailOpen=true`, metric + warn log | Architecture supports explicit policy choice in S3 |
| Rate would_reject | Record only | Reject before invoke (when enforce) |
| In-flight would_reject | Record only | Reject before invoke (when enforce) |

---

## 8. Operation classification & priority

### Categories (`DimoProviderRequestCategory`)

`telemetry_graphql`, `snapshot`, `active_trip_tracking`, `reconciliation_segments`, `recharge_segments`, `dtc`, `vehicle_sync`, `enrichment`, `vehicle_summary`, `vehicle_vin`, `other`

### Priority classes (`DimoProviderRequestPriority`)

| Priority | Examples | S3 use |
|----------|----------|--------|
| P0_CRITICAL | Active live trip tracking | Last to throttle |
| P1_HIGH | Snapshot for active/recent, boundary repair | High |
| P2_NORMAL | Regular snapshot polling | Normal |
| P3_BACKGROUND | DTC, enrichment, non-urgent sync | First to delay |

S2 records priority on gateway params; enforcement by priority deferred to S3.

---

## 9. HTTP observability

- **403:** classified as `forbidden` — non-retryable, distinct metric; no limiter loop
- **429:** `rate_limited` + `Retry-After` parsed when present (for S3 backpressure)
- **5xx:** `server_error`
- **Timeout:** `timeout` (axios `ECONNABORTED` / message match)

Metrics use bounded labels: `operation`, `mode`, `decision`, `status_class` — no VIN/vehicleId/tripId/orgId.

---

## 10. Prometheus metrics

| Metric | Type | Labels |
|--------|------|--------|
| `synqdrive_dimo_provider_requests_total` | Counter | operation, mode, status_class |
| `synqdrive_dimo_provider_in_flight` | Gauge | mode |
| `synqdrive_dimo_provider_shadow_decisions_total` | Counter | operation, decision_type, decision |
| `synqdrive_dimo_provider_rate_budget_usage` | Gauge | mode |
| `synqdrive_dimo_provider_limiter_redis_errors_total` | Counter | — |
| `synqdrive_dimo_provider_http_429_total` | Counter | operation |
| `synqdrive_dimo_provider_http_403_total` | Counter | operation |
| `synqdrive_dimo_provider_http_5xx_total` | Counter | operation |
| `synqdrive_dimo_provider_timeouts_total` | Counter | operation |
| `synqdrive_dimo_provider_request_duration_seconds` | Histogram | operation, status_class |

---

## 11. S3 transition path

Shadow → enforce backpressure:

1. `DIMO_PROVIDER_LIMITER_MODE=enforce`
2. Gateway rejects when `WOULD_REJECT` (rate or in-flight)
3. Priority-aware queueing/delay (S3) using `wouldDelayMs` estimation
4. Consume `Retry-After` from provider 429 for adaptive backoff
5. 403 remains non-retryable

---

## 12. Load model results (deterministic P1.2 workload model)

Internal budget: **25/s peak** (20 + burst 5). Documented Core ceiling: **25/s**.

| N | Scenario | Demand req/s | Would-reject % (25/s budget) |
|---|----------|--------------|------------------------------|
| 100 | S1 normal | 1.27 | 0% |
| 100 | S2 busy | 3.62 | 0% |
| 100 | S3 extreme | 7.71 | 0% |
| 250 | S1 | 3.26 | 0% |
| 250 | S2 | 9.05 | 0% |
| 250 | S3 | 19.28 | 0% |
| 1000 | S1 | 12.74 | 0% |
| 1000 | S2 | 36.18 | 30.9% |
| 1000 | S3 | 77.13 | 67.6% |

**N≤250 certified envelope:** demand stays within 25/s in all scenarios.  
**N=1000:** S2/S3 exceed internal and documented ceilings — enforcement would require backpressure (S3).

*Deterministic model only — not provider latency simulation.*

---

## 13. Tests

| Suite | Coverage |
|-------|----------|
| `dimo-provider-limiter.service.spec.ts` | 2-replica rate sharing, global in-flight, duplicate release, fail-open, enforce lease skip |
| `dimo-provider-gateway.service.spec.ts` | Shadow non-behavioral parity, enforce rejection |
| `dimo-provider-limiter-shadow-model.spec.ts` | N=100/250/1000 × S1/S2/S3 workload model |
| `dimo-provider-http-classifier.spec.ts` | 403/429/5xx/timeout/Retry-After |
| `dimo-provider-limiter.config.spec.ts` | Env bounds validation |
| `dimo-telemetry-gateway-coverage.spec.ts` | Gateway bypass guard |
| P1.2 regression | `p12-final*`, `dimo-snapshot*`, `partial-boundary-repair.final3*` — PASS |

**Distributed Redis proof:** PARTIAL — in-memory Redis mock simulates 2 replicas atomically; no dedicated Redis integration test container in CI yet.

---

## 14. Security / failure review

| Risk | Mitigation |
|------|------------|
| Key collision | Namespaced `dimo:provider:limiter:*` |
| Stale leases | ZREMRANGEBYSCORE on acquire + lease expiry score |
| Double release | ZREM idempotent |
| Malformed env | Bounded parse with safe defaults |
| Metric cardinality | Bounded operation enum only |
| Accidental enforce | Default `shadow`; enforce requires explicit env |
| Sensitive data in logs | No VIN/tokenId in metric labels |

---

## 15. Rollback

1. Set `DIMO_PROVIDER_LIMITER_MODE=off` (or `DIMO_PROVIDER_LIMITER_ENABLED=false`)
2. Redeploy — gateway reverts to BYPASS with zero Redis limiter calls
3. No schema migration required

---

## 16. Remaining risks & S3 prerequisites

- Real Redis integration tests under multi-replica CI
- Priority-aware enforcement and delay queue
- Provider `Retry-After` driven backoff
- Route remaining non-telemetry DIMO HTTP through gateway if desired
- N=1000 certification still blocked until S3 enforcement + backpressure

---

## 17. Files changed

```
backend/src/config/dimo-provider-limiter.config.ts
backend/src/config/dimo-provider-limiter.config.spec.ts
backend/src/modules/dimo/provider/dimo-provider-limiter.types.ts
backend/src/modules/dimo/provider/dimo-provider-limiter.redis-scripts.ts
backend/src/modules/dimo/provider/dimo-provider-limiter.service.ts
backend/src/modules/dimo/provider/dimo-provider-limiter.service.spec.ts
backend/src/modules/dimo/provider/dimo-provider-limiter-shadow-model.spec.ts
backend/src/modules/dimo/provider/dimo-provider-metrics.service.ts
backend/src/modules/dimo/provider/dimo-provider-http-classifier.ts
backend/src/modules/dimo/provider/dimo-provider-http-classifier.spec.ts
backend/src/modules/dimo/provider/dimo-provider-category.util.ts
backend/src/modules/dimo/provider/dimo-provider-gateway.service.ts
backend/src/modules/dimo/provider/dimo-provider-gateway.service.spec.ts
backend/src/modules/dimo/provider/dimo-provider-gateway.types.ts
backend/src/modules/dimo/dimo.module.ts
backend/src/modules/dimo/dimo-telemetry.service.spec.ts
backend/.env.example
frontend/src/master/components/ChangesView.tsx
frontend/src/master/components/ArchitekturView.tsx
architecture/DIMO_PROVIDER_CONCURRENCY_P1_3_S2_REDIS_SHADOW_LIMITER_2026-08-29.md
architecture/P1_3_S2_REDIS_SHADOW_LIMITER_FINAL_RESPONSE_2026-08-29.md
```
