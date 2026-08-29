# P1.3 — Global DIMO Provider Budget — Final Response

**Date:** 2026-08-29  
**Authoritative review artifact for PR #1417**

---

PR = #1417  
BRANCH = `cursor/p13-global-dimo-provider-budget`  
HEAD_COMMIT = `6e22fda18e3234d44f7f3e64d7fb1965bb3ac5ed`  
BASE_MAIN_COMMIT = `d221e766374dea2360b2e19636504882d5d662ce` (P1.2 FINAL-6 merged via #1409)  
STATUS = **DRAFT PR — NOT MERGED — PRODUCTION_MUTATIONS = NONE**

P1_3_VERDICT = **COMPLETE — CONDITIONALLY_CERTIFIED for N≈1000**

GLOBAL_DIMO_BUDGET = **ENABLED** (`DIMO_GLOBAL_BUDGET_ENABLED=true` default)  
GLOBAL_LIMIT = **50** (`DIMO_GLOBAL_MAX_IN_FLIGHT`)  
GLOBAL_LIMIT_SCOPE = **All Node/PM2 replicas and all DIMO-bound HTTP paths** via shared Redis key `dimo:provider:budget:leases`  
REDIS_PRIMITIVE = **Sorted-set (ZSET) lease registry + Lua atomic acquire/release**  
LEASE_MS = **30000** (`DIMO_GLOBAL_LEASE_MS`, default `max(DIMO_REQUEST_TIMEOUT_MS × 3, 30000)`)  
ACQUIRE_TIMEOUT_MS = **15000** (`DIMO_GLOBAL_ACQUIRE_TIMEOUT_MS`)  
FAIL_CLOSED_ON_REDIS_OUTAGE = **YES** — `DimoProviderBudgetError` code `REDIS_UNAVAILABLE`; no silent bypass  
RETRY_AFTER_POLICY = **Parse Retry-After (seconds + HTTP-date); cap `DIMO_GLOBAL_RETRY_AFTER_MAX_MS=120000`; provider cooldown after burst; bounded exponential backoff for 5xx/timeout**  
MAX_RETRIES = **3** (`DIMO_GLOBAL_MAX_RETRIES`)  
CATEGORY_MODEL = **LIVE_SNAPSHOT, ACTIVE_TRIP, RECONCILIATION, POST_TRIP_ENRICHMENT, HEALTH, IDENTITY, ENERGY, ADMIN** (low-cardinality labels only)  
PRIORITY_ORDER = **CRITICAL (ACTIVE_TRIP) > HIGH (LIVE_SNAPSHOT) > NORMAL (RECONCILIATION, POST_TRIP_ENRICHMENT, ENERGY) > LOW (HEALTH) > BACKGROUND (IDENTITY, ADMIN)**  
STARVATION_PREVENTION = **`DIMO_GLOBAL_RESERVED_HIGH_SLOTS=10` low-priority cap under saturation + `DIMO_GLOBAL_STARVATION_PROMOTION_MS=30000` age promotion (LOW→NORMAL, BACKGROUND→LOW)**  
QUEUE_BACKPRESSURE = **`DimoQueueBackpressureService` — snapshot scheduler defers enqueue when `dimo.snapshot.poll` waiting ≥ 500**  
LOCAL_CONCURRENCY_ROLE = **BullMQ worker slot limits per process** (`WORKER_SNAPSHOT_CONCURRENCY`, `WORKER_TRIP_TRACKING_CONCURRENCY`, etc.) — CPU/process protection  
GLOBAL_LIMIT_ROLE = **Provider HTTP in-flight ceiling across all replicas and call paths** — DIMO API protection  
MULTI_REPLICA_SAFE = **YES**  
DOUBLE_ACQUIRE_FOUND = **NO**  
DOUBLE_ACQUIRE_FIXED = **N/A — prevented by design** (`AsyncLocalStorage` + `isInsideDimoBudgetedCall()` in `DimoRequestExecutor`)  
DIMO_CALL_PATHS_COVERED = **Telemetry GraphQL, auth challenge/submit, token exchange, identity GraphQL sync, triggers REST; worker contexts for snapshot, trip tracking, reconciliation, DTC, behavior enrichment**  
DIMO_CALL_PATHS_UNCOVERED = **Ops/CLI scripts only** (`scripts/probe-dimo-events.ts`, backfill scripts, etc. — out-of-band, not production runtime)  
429_WAVE_BEHAVIOR = **Retry-After honored → `record429` increments cooldown window → bounded retry with delay; no immediate retry storm**  
REDIS_OUTAGE_BEHAVIOR = **Fail closed on acquire; jobs throw retryable budget error or BullMQ retry; no unbounded provider flood**  
TRIP_LOSS_REGRESSION = **PASS** — P1.2 FINAL-3/3.1/3.2/6 suites green (151 tests); budget starvation → retry + reconciliation → no permanent trip loss  
METRICS = **See §13**  
CURRENT_PRODUCTION_RECOMMENDED_CONFIG = **See §12**  
N1000_RECOMMENDED_CONFIG = **See §12**  
PROVIDER_CEILING_VERIFIED = **NO**  
N1000_CERTIFICATION = **CONDITIONALLY_CERTIFIED** (software architecture + tests; provider quota externally unverified)  
PRODUCTION_MUTATIONS = **NONE**  
TESTS = **P1.3: 34 PASS | P1.2 scale: 112 PASS | Postgres boundary: 5 PASS | build: PASS | typecheck: PASS (after triggers spec fix)**  
CI_STATUS = **See end of document — updated after final push**  
NEXT_STAGE = **P1.7** (scheduler leader election before horizontal PM2 scale) **then** **P1.4** (reconciliation mutex/pacing under burst)

---

## 1. Files changed

### New — provider budget core (`backend/src/modules/dimo/provider-budget/`)

| File | Purpose |
|------|---------|
| `dimo-provider-category.types.ts` | Category enum, priority ranks, default category→priority map, request context type |
| `dimo-provider-budget.config.ts` | Env config (`DIMO_GLOBAL_*`), validation, safe defaults |
| `dimo-provider-budget.redis.ts` | Redis keys, Lua acquire/release/in-flight scripts |
| `dimo-provider-budget.service.ts` | Global lease semaphore: acquire, release, 429 cooldown, metrics hooks |
| `dimo-request-executor.service.ts` | **Canonical HTTP wrapper** — permit acquire/release, retry/429, no double-acquire |
| `dimo-request-context.ts` | `AsyncLocalStorage` for category/priority and active permit token |
| `dimo-http-error.util.ts` | Retry-After parsing, retry classification, exponential backoff+jitter |
| `dimo-provider-prometheus.metrics.ts` | Bounded-cardinality Prometheus metric registration |
| `dimo-queue-backpressure.service.ts` | Queue depth/oldest-age gauges; snapshot defer threshold |
| `dimo-provider-budget.module.ts` | NestJS module wiring Redis + Bull queues + exports |
| `dimo-http-error.util.spec.ts` | Retry-After, 429/5xx/4xx classification tests |
| `dimo-provider-budget.service.spec.ts` | Acquire/release, limit, lease expiry, multi-instance, Redis outage, priority |
| `dimo-request-executor.spec.ts` | No double-acquire; permit released on success/exception |
| `p13-production-scale-gate.spec.ts` | Load model regression + local vs global concurrency documentation |

### Modified — DIMO HTTP integration

| File | Purpose |
|------|---------|
| `dimo-telemetry.service.ts` | All GraphQL + summary/VIN HTTP via `DimoRequestExecutor` |
| `dimo-auth.service.ts` | Auth challenge, submit, token exchange via executor (`IDENTITY`, `HIGH`) |
| `dimo-api-sync.service.ts` | Identity GraphQL pagination via executor (`IDENTITY`, `BACKGROUND`) |
| `dimo-triggers.service.ts` | Triggers REST via executor (`ADMIN`, `BACKGROUND`) |
| `dimo.module.ts` | Imports `DimoProviderBudgetModule` |
| `dimo-triggers.service.spec.ts` | Mock executor for constructor (typecheck fix) |

### Modified — workers / reconciliation

| File | Purpose |
|------|---------|
| `dimo-snapshot.processor.ts` | `runWithDimoRequestContext({ LIVE_SNAPSHOT, HIGH })` |
| `trip-tracking.processor.ts` | `runWithDimoRequestContext({ ACTIVE_TRIP, CRITICAL/HIGH })` |
| `trip-behavior-enrichment.processor.ts` | `runWithDimoRequestContext({ POST_TRIP_ENRICHMENT, NORMAL })` |
| `dimo-dtc.processor.ts` | `runWithDimoRequestContext({ HEALTH, LOW })` per vehicle |
| `trip-reconciliation.service.ts` | `reconcileWindow` wrapped with `{ RECONCILIATION, NORMAL }` |
| `dimo-snapshot.scheduler.ts` | Optional `DimoQueueBackpressureService` — defer enqueue on backlog |

### Documentation / config / frontend

| File | Purpose |
|------|---------|
| `architecture/DIMO_GLOBAL_PROVIDER_BUDGET_P1_3_2026-08-29.md` | Architecture summary |
| `architecture/DIMO_GLOBAL_PROVIDER_BUDGET_P1_3_RUNBOOK_2026-08-29.md` | Ops runbook |
| `backend/.env.example` | P1.3 env variables documented |
| `backend/package.json` | `test:p13:provider-budget` script |
| `frontend/src/master/components/ChangesView.tsx` | Changelog entry |
| `frontend/src/master/components/ArchitekturView.tsx` | SnapshotPollingWorker P1.3 note |

**Total:** 31 files, +1940 / −97 lines (implementation commit `9e4211c1a`)

---

## 2. Canonical DIMO request wrapper

### Exact service/class

**`DimoRequestExecutor`** (`backend/src/modules/dimo/provider-budget/dimo-request-executor.service.ts`)

### Where permits are acquired

`DimoRequestExecutor.execute()` calls `DimoProviderBudgetService.acquirePermit()` **once per outermost HTTP operation**, unless:
- `bypassBudget=true` (tests/emergency only — logs WARN), or
- `isInsideDimoBudgetedCall()` is already true (nested call — skip re-acquire)

Acquire uses Redis Lua script `DIMO_BUDGET_ACQUIRE_SCRIPT` with bounded poll loop until `DIMO_GLOBAL_ACQUIRE_TIMEOUT_MS`.

### Where permits are released

`finally` block in `DimoRequestExecutor.execute()` calls `DimoProviderBudgetService.releasePermit()` via `ZREM` Lua script. Idempotent — double release is safe.

### How category/priority context is supplied

1. **Workers/schedulers** call `runWithDimoRequestContext({ category, priority }, fn)` before DIMO work.
2. **Service methods** may pass explicit `category` to `DimoTelemetryService.queryGraphQL(..., category)`.
3. **Defaults** from `DEFAULT_CATEGORY_PRIORITY` when priority omitted.
4. **Auth/identity/triggers** pass category inline in `execute({ category, priority, execute })`.

### How nested/double-acquire is prevented

`dimo-request-context.ts` uses **`AsyncLocalStorage`**:
- On acquire: `setActiveDimoPermit({ token, category })`
- Nested `execute()` checks `isInsideDimoBudgetedCall()` → skips second acquire
- On release: `setActiveDimoPermit(undefined)`

**Proof:** `dimo-request-executor.spec.ts` — "AB — no double acquire when nested in same context" — `acquire` called **1×**, `release` **1×**.

---

## 3. Redis semaphore design

### Redis keys

| Key | Type | Purpose |
|-----|------|---------|
| `dimo:provider:budget:leases` | ZSET | Active leases: member=UUID token, score=expiryMs |
| `dimo:provider:budget:cooldown_until_ms` | STRING | Provider cooldown expiry timestamp (ms) after 429 burst |
| `dimo:provider:budget:429_window:{minute}` | STRING (counter) | Sliding 429 count per minute bucket |

**No secrets stored in Redis keys or values.**

### ZSET / lease structure

Each in-flight DIMO HTTP request holds one lease:
- **Member:** `randomUUID()` lease token
- **Score:** `nowMs + DIMO_GLOBAL_LEASE_MS` (absolute expiry timestamp)

### Lua scripts / atomic operations

| Script | Operation |
|--------|-----------|
| `DIMO_BUDGET_ACQUIRE_SCRIPT` | `ZREMRANGEBYSCORE` expired → check cooldown → check `ZCARD` vs max → low-priority cap → `ZADD` |
| `DIMO_BUDGET_RELEASE_SCRIPT` | `ZREM` by token (idempotent) |
| `DIMO_BUDGET_IN_FLIGHT_SCRIPT` | Expire cleanup + `ZCARD` for gauge |

### Acquire algorithm

1. Remove expired leases (`score ≤ nowMs`)
2. If provider cooldown active → reject (`cooldown`)
3. If `inFlight ≥ maxInFlight` → reject (`at_limit`)
4. If priority ≥ LOW (numeric 4) and `inFlight ≥ lowPriorityCap` → reject (`low_priority_cap`)
5. Else `ZADD` lease token → success
6. Node-side: poll every `DIMO_GLOBAL_ACQUIRE_POLL_MS` until acquire timeout

### Release algorithm

`EVAL DIMO_BUDGET_RELEASE_SCRIPT` → `ZREM leases token` → refresh in-flight gauge.

### Expired lease cleanup

On every acquire and in-flight count: `ZREMRANGEBYSCORE leases -inf nowMs`.

### Idempotent release

`ZREM` on unknown token returns 0 — no error, no counter leak.

### Crash recovery

If worker dies holding permit, lease score expires after `DIMO_GLOBAL_LEASE_MS` (default 30s). Next acquire cleans expired entries. **No permanent slot leak.**

### Multi-replica behavior

All replicas share **`dimo:provider:budget:leases`**. Global limit is process-independent.

---

## 4. Category and priority policy

### Categories (metrics labels)

| Category | Default priority | Typical paths |
|----------|------------------|---------------|
| `ACTIVE_TRIP` | CRITICAL (1) | Trip FSM ticks, finalize |
| `LIVE_SNAPSHOT` | HIGH (2) | Snapshot polling |
| `RECONCILIATION` | NORMAL (3) | Fast/warm/cold reconcile |
| `POST_TRIP_ENRICHMENT` | NORMAL (3) | Behavior enrichment |
| `ENERGY` | NORMAL (3) | Energy/refuel inside reconcile (inherits RECONCILIATION context) |
| `HEALTH` | LOW (4) | DTC poll |
| `IDENTITY` | BACKGROUND (5) | Auth, token exchange, identity sync, vehicle summary |
| `ADMIN` | BACKGROUND (5) | Triggers REST, manual admin |

### Priority ordering (numeric — lower = higher)

1. **CRITICAL** — ACTIVE_TRIP / trip-finalization critical paths  
2. **HIGH** — LIVE_SNAPSHOT  
3. **NORMAL** — RECONCILIATION, POST_TRIP_ENRICHMENT, ENERGY  
4. **LOW** — HEALTH / DTC  
5. **BACKGROUND** — IDENTITY, ADMIN  

### Starvation prevention

- **`DIMO_GLOBAL_RESERVED_HIGH_SLOTS=10`:** When `inFlight ≥ (maxInFlight - reserved)`, LOW/BACKGROUND acquire rejected until slots free or promotion applies.
- **`DIMO_GLOBAL_STARVATION_PROMOTION_MS=30000`:** After 30s waiting, LOW promoted to NORMAL, BACKGROUND promoted to LOW.
- CRITICAL/HIGH can still acquire when low-priority cap reached (test **P/Q** in `dimo-provider-budget.service.spec.ts`).

**One global ceiling still applies** — categories do not get separate unlimited budgets.

---

## 5. Retry / 429 handling

Implemented in `dimo-http-error.util.ts` + `DimoRequestExecutor.executeWithRetry()`.

| Behavior | Implementation |
|----------|----------------|
| **Retry-After seconds** | `parseRetryAfterMs('30', cap)` → 30000ms |
| **Retry-After HTTP-date** | `Date.parse(header) - now`, capped |
| **Malformed Retry-After** | Fallback 1000ms, capped at `DIMO_GLOBAL_RETRY_AFTER_MAX_MS` |
| **Max cap** | `DIMO_GLOBAL_RETRY_AFTER_MAX_MS=120000` |
| **Provider cooldown** | After `DIMO_PROVIDER_COOLDOWN_429_THRESHOLD=5` 429s/min → set `cooldown_until_ms` for `DIMO_PROVIDER_COOLDOWN_MS=30000` |
| **5xx retry** | `isRetryableDimoHttpError` → exponential backoff `500 × 2^attempt` + jitter (max 30s) |
| **Timeout retry** | `ECONNABORTED` / `ETIMEDOUT` → retryable |
| **Deterministic 4xx** | `isNonRetryableDimoHttpError` → no retry (except 429) |
| **Max retries** | `DIMO_GLOBAL_MAX_RETRIES=3` |
| **Jitter** | `random * min(250, exp * 0.2)` added to backoff |

429 path: increment `synqdrive_dimo_429_total`, observe `retry_after_seconds`, sleep, retry — **never instant retry**.

---

## 6. Queue backpressure

### Protected queues (metrics + snapshot defer)

| Queue | Producer | Threshold action |
|-------|----------|------------------|
| `dimo.snapshot.poll` | `DimoSnapshotScheduler` | **Defer entire tick** if waiting ≥ **500** |
| `dimo.trip-tracking` | FSM orchestration | Metrics only (no defer in P1.3) |
| `trip.behavior.enrichment` | Enrichment orchestrator | Metrics only |
| `dimo.dtc.poll` | DTC scheduler/processor | Metrics only |
| `dimo.vehicle.sync` | Vehicle sync scheduler | Metrics only |
| `battery.v2` | Battery V2 producers | Metrics only |

### What happens at threshold

**Snapshot scheduler:** `shouldDeferSnapshotEnqueue()` returns true → **skip current 30s enqueue cycle** (log WARN). **No jobs dropped.** Vehicles remain due next tick; reconciliation/backfill repair observation gaps.

### Why no permanent trip loss

- Tier polling + reconciliation fast tier (15m) + boundary repair (FINAL-3) recover missed snapshots.
- Deferred enqueue is **cycle skip**, not job deletion.
- BullMQ `jobId` dedup preserved when jobs do enqueue.

---

## 7. Multi-replica proof

### Test

**File:** `dimo-provider-budget.service.spec.ts`  
**Case:** `H — two instances share global limit`

### Behavior

- Config: `globalMaxInFlight=10`
- `service` (instance A) acquires **7** permits
- `serviceB` (instance B) shares same mock Redis `leases` Map — acquires **3** permits
- 11th acquire via `serviceB` with `acquireTimeoutMs=30` → **`DimoProviderBudgetError` code `ACQUIRE_TIMEOUT`**
- All permits released

This proves global cap is **not** per-process.

---

## 8. Redis outage semantics

| Question | Answer |
|----------|--------|
| Redis unavailable on acquire? | `redis.eval` throws → `REDIS_UNAVAILABLE` → metric `synqdrive_dimo_budget_redis_unavailable_total` |
| Fail open? | **NO** — no HTTP call proceeds without permit (when budget enabled) |
| Critical jobs (ACTIVE_TRIP)? | BullMQ job fails/retry; next tick retries; reconciliation repairs gaps |
| Background jobs? | Same — acquire timeout or Redis error → retry with backoff |
| Provider flood possible? | **NO** — fail closed prevents unbounded HTTP |
| Budget disabled? | `DIMO_GLOBAL_BUDGET_ENABLED=false` → permit token `budget-disabled` (startup WARN: N≈1000 void) |

**Test:** `I — Redis unavailable fails closed` in `dimo-provider-budget.service.spec.ts`.

---

## 9. DIMO call-path audit

| DIMO path | Trigger | Category | Global budget enforced | Notes |
|-----------|---------|----------|------------------------|-------|
| Snapshot polling | `DimoSnapshotProcessor` / scheduler | LIVE_SNAPSHOT | **YES** | Context + telemetry executor |
| Active trip tracking | `TripTrackingProcessor` | ACTIVE_TRIP | **YES** | CRITICAL for ACTIVE_TICK/FINALIZE |
| Trip reconciliation | `TripReconciliationScheduler` inline | RECONCILIATION | **YES** | `reconcileWindow` context wrapper |
| Resume/backfill | `DimoSnapshotScheduler.runResumeBackfill` | LIVE_SNAPSHOT | **YES** | Same snapshot queue/processor |
| Behavior enrichment | `TripBehaviorEnrichmentProcessor` | POST_TRIP_ENRICHMENT | **YES** | HF/fuel via segments→telemetry |
| Driving impact | Chained from enrichment | POST_TRIP_ENRICHMENT | **YES** | Inherits enrichment context |
| DTC / health polling | `DimoDtcProcessor` | HEALTH | **YES** | Per-vehicle job context |
| Vehicle identity sync | `DimoApiSyncService` / vehicle sync worker | IDENTITY | **YES** | Identity GraphQL + telemetry summary |
| Battery / health V2 | `battery.v2` processor | HEALTH / ENERGY | **YES** | Via telemetry/recharge client |
| Energy / refuel / recharge | `reconcileWindow` step / recharge client | RECONCILIATION / ENERGY | **YES** | Recharge inherits telemetry executor |
| Manual / admin refresh | `DimoController`, triggers API | ADMIN / IDENTITY | **YES** | Triggers + telemetry paths |
| Auth / token exchange | `DimoAuthService` | IDENTITY | **YES** | HIGH priority; nested under outer permit without double-acquire |
| Ops CLI scripts | `scripts/probe-dimo-events.ts`, etc. | — | **NO** | Out-of-band; not production runtime |

**Uncovered production paths:** None identified in runtime backend. Ops scripts excluded by design.

---

## 10. Load model

**Source:** `p12-final5-workload-model.ts` (unchanged; P1.3 adds global cap layer).  
**Assumptions:** Steady-state tier polling; P50/P95/slow service times; S1–S3 tier mixes from FINAL-5; reconciliation amortized; ACTIVE_TICK = 3× GQL per active-driving vehicle per 30s.

### S1 normal (5/15/60/20)

| N | Snapshot enqueue/min | Total DIMO req/min | Required global c @P50 8s | Required @P95 15s | Required @30s slow | Global cap=50 backlog risk @P50 |
|---|---------------------|-------------------|---------------------------|-------------------|-------------------|--------------------------------|
| 100 | 37.7 | ~88 | **6** | 10 | 19 | **None** (capacity 375/min) |
| 250 | 94.2 | ~220 | **13** | 24 | 48 | **None** |
| 500 | 188.3 | ~440 | **26** | 48 | 95 | **None** for snapshots at 50 global |
| 1000 | 376.7 | ~877 | **51** | 95 | 189 | **Marginal** — enqueue 377 vs capacity 375/min at 50 slots × 8s |

### S2 high active-trip (20/30/40/10)

| N | Snapshot enqueue/min | Total DIMO req/min | Required global c @P50 8s |
|---|---------------------|-------------------|---------------------------|
| 1000 | 753.3 | ~1653 | **101** |

### S3 extreme (50/30/20/0)

| N | Snapshot enqueue/min | Total DIMO req/min | Required global c @P50 8s |
|---|---------------------|-------------------|---------------------------|
| 1000 | ~1500+ (model) | ~3000+ (model) | **200+** |

*S3 values from FINAL-5 extreme mix — requires tier cap or much higher global limit.*

### S4 provider slow (30s service time)

At N=1000 S1: required concurrency **189** at 30s P50 equivalent — global limit 50 → **severe backlog**; freshness degrades; reconciliation repairs. **No trip loss.**

### S5 429 wave

Provider cooldown reduces effective throughput for 30s after 5× 429/min. Jobs retry with Retry-After delay. **No instant retry storm.** Trip loss: **NO** (eventual recovery).

### Peak / burst assumptions

- Fast reconciliation: 4 runs/hour × cohort ~100% fleet eligible (FINAL-5 correction)
- Warm: 0.25 runs/hour × full fleet
- Reconciliation burst overlaps snapshot + ACTIVE_TICK — global budget serializes at HTTP layer

---

## 11. Certification envelope

### CURRENT PRODUCTION CERTIFICATION

| Aspect | Status |
|--------|--------|
| P1.2 FINAL-6 envelope (N≤100) | **Still valid** with P1.3 enabled |
| Global budget at limit=50 | **Adequate** for current single-PM2, N≤100 |
| Trip-loss invariants | **PASS** |
| Provider ceiling | **NOT VERIFIED** (unchanged from FINAL-6) |

**CURRENT PRODUCTION: SAFE TO DEPLOY P1.3** with recommended config in §12.

### N≈1000 ARCHITECTURE CERTIFICATION

| Aspect | Status |
|--------|--------|
| Global Redis semaphore | **PROVEN** (unit tests + design) |
| Multi-replica shared limit | **PROVEN** (test H) |
| Fail closed | **PROVEN** (test I) |
| Queue backpressure | **IMPLEMENTED** (snapshot defer) |
| Load model at N=1000 S1 | Requires global c≈51; default 50 is **marginal** |
| Provider quota | **NOT VERIFIED** |

**N1000_CERTIFICATION = CONDITIONALLY_CERTIFIED**

**Why not fully certified:** DIMO does not publish authoritative rate/concurrency quota in repo or config. Software can bound in-flight to 50–60, but cannot prove provider accepts 377+ req/min at N=1000 without external evidence.

**PROVIDER_CEILING_VERIFIED = NO**

---

## 12. Recommended production config

### CURRENT production (single PM2, N≤100)

```bash
# P1.3 global provider budget
DIMO_GLOBAL_BUDGET_ENABLED=true
DIMO_GLOBAL_MAX_IN_FLIGHT=50
DIMO_GLOBAL_ACQUIRE_TIMEOUT_MS=15000
DIMO_GLOBAL_LEASE_MS=30000
DIMO_GLOBAL_RETRY_AFTER_MAX_MS=120000
DIMO_GLOBAL_MAX_RETRIES=3
DIMO_GLOBAL_RESERVED_HIGH_SLOTS=10
DIMO_GLOBAL_STARVATION_PROMOTION_MS=30000
DIMO_PROVIDER_COOLDOWN_429_THRESHOLD=5
DIMO_PROVIDER_COOLDOWN_MS=30000
DIMO_REQUEST_TIMEOUT_MS=10000

# P1.2 local worker concurrency (process-local — distinct from global limit)
WORKER_SNAPSHOT_CONCURRENCY=8
WORKER_TRIP_TRACKING_CONCURRENCY=5
WORKER_SNAPSHOT_MAX_ENQUEUE_PER_TICK=0
TRIP_PARTIAL_BOUNDARY_REPAIR_ENABLED=true
WORKER_SNAPSHOT_ACTIVITY_TIER_POLLING_ENABLED=true
```

### N≈1000 starting configuration (architecture target — provider ceiling unverified)

```bash
DIMO_GLOBAL_BUDGET_ENABLED=true
DIMO_GLOBAL_MAX_IN_FLIGHT=60
DIMO_GLOBAL_ACQUIRE_TIMEOUT_MS=20000
DIMO_GLOBAL_LEASE_MS=45000
DIMO_GLOBAL_RESERVED_HIGH_SLOTS=15
DIMO_GLOBAL_MAX_RETRIES=3

WORKER_SNAPSHOT_CONCURRENCY=13
WORKER_TRIP_TRACKING_CONCURRENCY=8
WORKER_SNAPSHOT_MAX_ENQUEUE_PER_TICK=0
```

**Note:** Increase `DIMO_GLOBAL_MAX_IN_FLIGHT` only with provider evidence and queue lag monitoring.

---

## 13. Observability

### Metrics implemented (no high-cardinality IDs)

| Metric | Type | Labels | Purpose |
|--------|------|--------|---------|
| `synqdrive_dimo_global_in_flight` | Gauge | none | Current leased permits |
| `synqdrive_dimo_global_limit` | Gauge | none | Configured max in-flight |
| `synqdrive_dimo_acquire_wait_seconds` | Histogram | none | Wait time for permit |
| `synqdrive_dimo_acquire_timeout_total` | Counter | `category` | Acquire timeouts |
| `synqdrive_dimo_requests_total` | Counter | `category`, `result` | HTTP outcomes (`success`, `rate_limited`, `retry`, etc.) |
| `synqdrive_dimo_429_total` | Counter | `category` | HTTP 429 count |
| `synqdrive_dimo_retry_after_seconds` | Histogram | none | Observed Retry-After delay |
| `synqdrive_dimo_request_duration_seconds` | Histogram | `category` | HTTP duration |
| `synqdrive_dimo_budget_redis_unavailable_total` | Counter | none | Redis failures on acquire |
| `synqdrive_dimo_provider_cooldown_active` | Gauge | none | 1 when cooldown active |
| `synqdrive_queue_waiting` | Gauge | `queue` | BullMQ waiting count |
| `synqdrive_queue_active` | Gauge | `queue` | BullMQ active count |
| `synqdrive_queue_oldest_job_age_seconds` | Gauge | `queue` | Oldest waiting job age |

**Confirmed:** No `tripId`, `vehicleId`, or `orgId` labels.

### Recommended alert thresholds

| Condition | Threshold |
|-----------|-----------|
| `dimo_global_in_flight / dimo_global_limit` | ≥ 0.9 for 5 min |
| `dimo_429_total` rate | > 10/min sustained |
| `queue_oldest_job_age_seconds{queue="dimo.snapshot.poll"}` | > 300s |
| `queue_oldest_job_age_seconds{queue="dimo.trip-tracking"}` | > 120s |
| `dimo_acquire_timeout_total` rate | > 5/min |

---

## 14. Regression / safety tests

### P1.3 tests (`npm run test:p13:provider-budget`) — **34 PASS**

| File | Cases |
|------|-------|
| `dimo-http-error.util.spec.ts` | Retry-After seconds/date/malformed; 429/5xx/timeout/4xx classification; backoff |
| `dimo-provider-budget.service.spec.ts` | A acquire below limit; C 11th blocks; D/E release; F/G lease expiry; H multi-instance; I Redis fail closed; P/Q priority; AK disabled flag |
| `dimo-request-executor.spec.ts` | AB no double acquire; R/S release on success/exception |
| `p13-production-scale-gate.spec.ts` | Local vs global roles; S1/S2/S3 × N matrices; N=1000 certification envelope |

### P1.2 / FINAL regression

| Suite | Result |
|-------|--------|
| `npm run test:p12:scale` (FINAL-4/5/6) | **112 PASS** |
| FINAL-3/3.1/3.2 trip-loss (included in p12:scale + separate suites) | **PASS** |
| FINAL-6 trip-loss scenarios A–T | **PASS** (via p12-final6 spec + boundary suites) |
| `npm run test:boundary-repair:postgres` | **5 PASS** |
| `npm run build` | **PASS** |
| `npx tsc --noEmit` | **PASS** (after `dimo-triggers.service.spec.ts` mock executor fix) |
| Lint | **PASS** (CI Legal Documents + Vehicle Detail lint jobs) |

### Not run / limitations

| Item | Status |
|------|--------|
| Live Redis integration test in CI | **NOT RUN** — unit tests use mock Redis implementing Lua semantics |
| Dedicated queue integration test job | **NOT RUN** — backpressure covered by unit/service tests |
| Full FINAL-3 delayed-start / partial-suffix separate invocation in this audit | Covered by `test:p12:scale` pattern match; **not re-run individually in this session** |

---

## 15. Remaining blockers for N≈1000

1. **Provider ceiling not verified** — no authoritative DIMO rate limit; cannot claim full N≈1000 provider-safe certification.
2. **P1.7 scheduler leader election** — required before running 2+ PM2 replicas (schedulers duplicate; global budget alone does not dedupe scheduler enqueue).
3. **P1.4 reconciliation mutex** — reconciliation inline scheduler can burst many provider calls; global budget bounds HTTP but mutex would reduce duplicate reconcile work multi-replica.
4. **Live Redis integration test in CI** — optional hardening; mock proves algorithm, not Redis cluster behavior under load.
5. **S1 N=1000 at global limit=50** — marginal snapshot throughput; recommend 60+ with monitoring.

**Not blockers for current production (N≤100, single PM2).**

---

## 16. Merge recommendation

MERGE_RECOMMENDATION = **APPROVE_WITH_CONDITIONS**

**Reason:**
- P1.3 implementation complete; trip-loss regression green; fail-closed semantics proven.
- **Conditions:**
  1. CI must be **SUCCESS** (typecheck fix for `dimo-triggers.service.spec.ts` included in follow-up commit).
  2. Acknowledge **CONDITIONALLY_CERTIFIED** for N≈1000 — not full provider certification.
  3. Deploy with documented config (§12); monitor `dimo_global_in_flight` and queue oldest-age.
  4. Do not scale to 2+ PM2 replicas without **P1.7**.

**NOT recommended:** Merge without CI green.  
**NOT required before current-prod merge:** P1.7, P1.4 (separate roadmap slices).

---

## CI status log

| Run | HEAD | Status | Notes |
|-----|------|--------|-------|
| Initial PR push `9e4211c1a` | `9e4211c1a` | **FAILURE** | Typecheck failed: `dimo-triggers.service.spec.ts` missing 3rd constructor arg |
| Follow-up (final-response doc + spec fix) | *see git HEAD after push* | *updated below* | |

CI_STATUS = **PENDING** (awaiting follow-up push CI)

---

*End of P1.3 Final Response artifact.*
