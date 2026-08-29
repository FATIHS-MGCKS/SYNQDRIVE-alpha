# P1.3-S4 — DIMO Provider Production Canary, Rate Smoothing & Rollout Safety

**Date:** 2026-08-30  
**Slice:** P1.3-S4 (readiness closure)  
**Status:** Implementation complete — **shadow remains production default**  
**Main base SHA:** `dc9ab567d16d62ef118e4fbd076747c9f91eba18` (PR #1428 P1.3-S4 merged)

---

## 1. Executive summary

P1.3-S4 makes DIMO provider enforcement **safe to canary** without enabling global production throttle:

1. **Token-bucket rate smoothing** — distributed Redis token bucket (20/s + burst 5); no per-second boundary burst
2. **Deterministic canary enforce** — org allowlist, vehicle allowlist, stable percent hash by `vehicleId` (fallback `organizationId`)
3. **Rollout states** — OFF / SHADOW / CANARY_ENFORCE / GLOBAL_ENFORCE
4. **Production observability** — Prometheus counters/gauges/histograms + structured JSON logs
5. **GO/NO-GO gates** — concrete thresholds for staged rollout
6. **One-action rollback** — config-only revert to shadow (no migration)

**Production default after S4: SHADOW** — global enforce NOT enabled.

---

## 2. Phase 0 — Pre-flight

| Check | Result |
|-------|--------|
| **MAIN_BASE_SHA** | `dc9ab567d16d62ef118e4fbd076747c9f91eba18` |
| **Gateway canonical** | YES — `dimo-telemetry-gateway-coverage.spec.ts` |
| **Default mode** | shadow |
| **Trip semantics** | unchanged |
| **PERMANENT_TRIP_LOSS** | NO |

---

## 3. S4.1 — Rate smoothing (token bucket)

### Verdict

The S2/S3 **fixed-window per-second INCR** could admit up to `capacity` requests at each second boundary (burst-edge). **S4 default `token_bucket` eliminates this** — tokens refill continuously; max burst = `rateLimitPerSecond + rateBurst` (default 25) regardless of wall-clock alignment.

| Parameter | Value |
|-----------|-------|
| Refill rate | 20/s (env) |
| Capacity | 25 (20+5) |
| Redis key | `dimo:provider:limiter:token_bucket` |
| Rollback algorithm | `DIMO_PROVIDER_RATE_ALGORITHM=fixed_window` |

Multi-replica safe — single global bucket via atomic Lua.

---

## 4. S4.2 — Canary enforcement

### Rollout states

| State | Condition |
|-------|-----------|
| **OFF** | `enabled=false` or `mode=off` |
| **SHADOW** | `mode=shadow`, no canary targeting active |
| **CANARY_ENFORCE** | `mode=shadow` + (org allowlist OR enabled percent/vehicle targeting) |
| **GLOBAL_ENFORCE** | `mode=enforce` |

### Deterministic targeting (no random per-request)

Priority order in `resolveCanaryEnforcement()`:

1. Global `mode=enforce` → enforce all
2. Org in merged allowlist (`DIMO_PROVIDER_ENFORCE_CANARY_ORG_IDS` ∪ legacy `DIMO_PROVIDER_CANARY_ENFORCE_ORG_IDS`)
3. Vehicle in `DIMO_PROVIDER_ENFORCE_CANARY_VEHICLE_IDS` when `DIMO_PROVIDER_ENFORCE_CANARY_ENABLED=true`
4. Percent bucket: `stableCanaryHashPercent(vehicleId ?? organizationId) < DIMO_PROVIDER_ENFORCE_CANARY_PERCENT` when enabled
5. Else shadow

Same vehicle/org → same bucket across processes/replicas (FNV-1a % 100).

### Configuration

| Env | Default | Purpose |
|-----|---------|---------|
| `DIMO_PROVIDER_ENFORCE_CANARY_ENABLED` | `false` | Opt-in for percent/vehicle canary |
| `DIMO_PROVIDER_ENFORCE_CANARY_PERCENT` | `0` | Stable hash percent [0,100) |
| `DIMO_PROVIDER_ENFORCE_CANARY_ORG_IDS` | (empty) | Org allowlist |
| `DIMO_PROVIDER_ENFORCE_CANARY_VEHICLE_IDS` | (empty) | Vehicle allowlist |
| `DIMO_PROVIDER_CANARY_ENFORCE_ORG_IDS` | (empty) | Legacy alias (merged) |

`organizationId` + `vehicleId` threaded from snapshot processor → telemetry → gateway.

---

## 5. S4.3 — Observability

### Prometheus metrics

| Metric | Labels / notes |
|--------|----------------|
| `synqdrive_dimo_provider_requests_total` | operation, mode, rollout_state, canary_match, status_class, priority |
| `synqdrive_dimo_provider_admitted_requests_total` | admitted (not would-reject) |
| `synqdrive_dimo_provider_would_reject_total` | operation, mode, decision_type, priority |
| `synqdrive_dimo_provider_enforce_deny_total` | admission timeout denials |
| `synqdrive_dimo_provider_canary_requests_total` | canary_match, canary_reason |
| `synqdrive_dimo_provider_canary_enforced_requests_total` | canary_reason |
| `synqdrive_dimo_provider_in_flight` | mode |
| `synqdrive_dimo_provider_rate_budget_usage` | mode, rollout_state |
| `synqdrive_dimo_provider_token_bucket_tokens_remaining` | mode |
| `synqdrive_dimo_provider_cooldown_active` | 0/1 |
| `synqdrive_dimo_provider_cooldown_remaining_seconds` | seconds |
| `synqdrive_dimo_provider_http_429_total` | operation |
| `synqdrive_dimo_provider_http_403_total` | operation |
| `synqdrive_dimo_provider_http_5xx_total` | operation |
| `synqdrive_dimo_provider_timeouts_total` | operation |
| `synqdrive_dimo_provider_admission_wait_seconds` | histogram |
| `synqdrive_dimo_provider_admission_timeouts_total` | priority, reason |
| `synqdrive_dimo_provider_backpressure_total` | priority, reason |
| `synqdrive_dimo_provider_cooldown_total` | Retry-After activations |

### Structured logging (`dimo-provider-limiter-log.util.ts`)

JSON logs (throttled 60s per event key):

- `canary_selected` — org/vehicle/percent match
- `enforce_admission_timeout`
- `provider_429` / `cooldown_activation`
- `provider_403_persistent`
- `redis_fail_open`
- `limiter_disabled`

---

## 6. GO / NO-GO gates (concrete thresholds)

### GO — advance to next rollout stage

| Gate | Threshold |
|------|-----------|
| Permanent trip loss | **0** events (hard invariant) |
| Trip enrichment failure rate (canary cohort) | ≤ baseline + **0.5%** absolute over 24h |
| Provider HTTP 429 rate (fleet) | ≤ **0.5%** of provider requests / 1h |
| Admission timeout rate (canary enforced) | P0/P1 < **0.1%**; P2–P4 < **5%** / 24h |
| P0/P1 gateway p95 latency | ≤ shadow baseline + **15%** |
| Redis limiter fail-open | < **10** events / 1h |
| Provider 403 rate | ≤ baseline + **0.1%** absolute / 24h |
| Snapshot queue age p95 | ≤ **120s** (no sustained growth > **2×** baseline) |

### NO-GO — rollback recommendation

| Signal | Threshold |
|--------|-----------|
| Sustained 429 spike | > **2%** of requests for **15 min** |
| Sustained admission timeouts | P0/P1 > **0.5%** for **1h** OR P2–P4 > **10%** for **1h** |
| P0/P1 starvation | p95 wait > **30s** or timeout rate > **0.5%** |
| Redis instability | fail-open > **50/h** or alternating fail-open/recover > **5 cycles/h** |
| Trip/enrichment failures | > baseline + **1%** absolute for **4h** |
| Provider 403 anomaly | > baseline + **0.5%** absolute for **1h** |
| Queue backlog | age p95 > **300s** for **30 min** |

---

## 7. Staged rollout runbook (document only — do not execute in agent)

### Stage 0 — Baseline (current production)

```bash
DIMO_PROVIDER_LIMITER_MODE=shadow
DIMO_PROVIDER_ENFORCE_CANARY_ENABLED=false
DIMO_PROVIDER_ENFORCE_CANARY_PERCENT=0
# clear org/vehicle allowlists
pm2 restart synqdrive-backend
```

Observe **24h**. All gates green.

### Stage 1 — 1–5% canary

```bash
DIMO_PROVIDER_LIMITER_MODE=shadow
DIMO_PROVIDER_ENFORCE_CANARY_ENABLED=true
DIMO_PROVIDER_ENFORCE_CANARY_PERCENT=5
pm2 restart synqdrive-backend
```

Observe **48h**. Single replica topology (CURRENT_PROD_REPLICAS=1).

### Stage 2 — 10–25% canary

Only if Stage 1 GO gates pass:

```bash
DIMO_PROVIDER_ENFORCE_CANARY_PERCENT=25
pm2 restart synqdrive-backend
```

Observe **7 days**.

### Stage 3 — 50% canary

```bash
DIMO_PROVIDER_ENFORCE_CANARY_PERCENT=50
pm2 restart synqdrive-backend
```

Observe **7 days**.

### Stage 4 — 100% enforce (fleet envelope)

**Requires explicit ops approval + change ticket:**

```bash
DIMO_PROVIDER_LIMITER_MODE=enforce
DIMO_PROVIDER_ENFORCE_CANARY_ENABLED=false
DIMO_PROVIDER_ENFORCE_CANARY_PERCENT=0
pm2 restart synqdrive-backend
```

**Not enabled by this slice.**

---

## 8. Rollback (one action)

```bash
DIMO_PROVIDER_LIMITER_MODE=shadow
DIMO_PROVIDER_ENFORCE_CANARY_ENABLED=false
DIMO_PROVIDER_ENFORCE_CANARY_PERCENT=0
unset DIMO_PROVIDER_ENFORCE_CANARY_ORG_IDS
unset DIMO_PROVIDER_ENFORCE_CANARY_VEHICLE_IDS
unset DIMO_PROVIDER_CANARY_ENFORCE_ORG_IDS
pm2 restart synqdrive-backend
```

- No DB migration
- No stale Redis state blocks traffic (leases expire; cooldown optional TTL)
- Enforcement stops after config reload/restart

---

## 9. Test matrix

| Area | Test file |
|------|-----------|
| Canary hash / rollout | `dimo-provider-canary-hash.util.spec.ts`, `dimo-provider-rollout.util.spec.ts` |
| Gateway canary | `dimo-provider-limiter-s4.spec.ts`, `dimo-provider-gateway.service.spec.ts` |
| Chaos / failure | `dimo-provider-limiter-s4-chaos.spec.ts` |
| Load / trip safety | `dimo-provider-limiter-s4-load-matrix.spec.ts`, FINAL-3 suites |
| Real Redis | `dimo-provider-limiter.redis.integration.spec.ts` (incl. test M percent determinism) |

```bash
cd backend && npm test -- --testPathPattern="dimo-provider|dimo-telemetry|partial-boundary-repair" --runInBand
cd backend && npm run test:dimo-provider-limiter:redis
```

**PERMANENT_TRIP_LOSS = NO**

---

## 10. Recommendation for P1.3-S5

- Wire Prometheus alerts to GO/NO-GO thresholds
- Grafana dashboards: canary cohort vs shadow baseline
- Pilot Stage 1 with `ENFORCE_CANARY_PERCENT=5` in staging first
- Do not enable GLOBAL_ENFORCE without Stage 1–3 evidence + ops sign-off
