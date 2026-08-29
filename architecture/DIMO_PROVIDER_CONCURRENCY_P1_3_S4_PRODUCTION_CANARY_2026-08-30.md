# P1.3-S4 — DIMO Provider Production Canary, Rate Smoothing & Rollout Safety

**Date:** 2026-08-30  
**Slice:** P1.3-S4  
**Status:** Implementation complete — **shadow remains production default**  
**Main base SHA:** `794bc77ea5933a47263ddf71c206453d19d57a59` (PR #1427 P1.3-S3 merged)

---

## 1. Executive summary

P1.3-S4 makes DIMO provider enforcement **safe to canary** without enabling global production throttle:

1. **Token-bucket rate smoothing** — replaces per-second boundary bursts with distributed Redis token bucket (same 20/s + burst 5 budget)
2. **Org-scoped canary enforce** — deterministic allowlist via `DIMO_PROVIDER_CANARY_ENFORCE_ORG_IDS`
3. **Rollout state model** — OFF / SHADOW / CANARY_ENFORCE / GLOBAL_ENFORCE derived from existing `DIMO_PROVIDER_LIMITER_MODE`
4. **Enhanced observability** — rollout_state, canary_match, token bucket tokens, admitted requests
5. **Kill switch / rollback** — config-only revert to shadow (no migration, no code deploy)

**Production default after S4: SHADOW** — unchanged.

---

## 2. Phase 0 — Pre-flight

| Check | Result |
|-------|--------|
| **MAIN_BASE_SHA** | `794bc77ea5933a47263ddf71c206453d19d57a59` |
| **PR #1427 present** | YES |
| **Gateway canonical** | YES — `dimo-telemetry-gateway-coverage.spec.ts` |
| **Telemetry bypass** | Auth/triggers/sync only (documented, unchanged) |
| **Priority taxonomy** | P0–P4 canonical (S3) |
| **Redis global limiter** | YES |
| **Retry-After cooldown** | YES — global Redis |
| **Default mode** | shadow |
| **Trip semantics** | unchanged |

---

## 3. S4.1 — Rate smoothing (token bucket)

### Algorithm

| Parameter | Value | Source |
|-----------|-------|--------|
| Refill rate | `rateLimitPerSecond` (default 20/s) | env |
| Bucket capacity | `rateLimitPerSecond + rateBurst` (default 25) | env |
| Redis key | `dimo:provider:limiter:token_bucket` | global |
| Script | `DIMO_PROVIDER_TOKEN_BUCKET_SCRIPT` | atomic Lua |

### Behavior

- Tokens refill continuously: `tokens += elapsedMs * refillRate / 1000`, capped at capacity
- Each admitted request consumes 1 token
- No synchronized second-boundary burst (unlike S2 fixed-window INCR)
- Multi-replica safe — single global bucket
- Budget **not increased** — same 20/s + 5 burst ceiling as S3

### Legacy

`DIMO_PROVIDER_RATE_ALGORITHM=fixed_window` retains S2 per-second counter for rollback/testing.

---

## 4. S4.2 — Canary enforcement

### Rollout states (derived)

| State | Condition |
|-------|-----------|
| **OFF** | `enabled=false` or `mode=off` |
| **SHADOW** | `mode=shadow`, empty canary list |
| **CANARY_ENFORCE** | `mode=shadow` + `DIMO_PROVIDER_CANARY_ENFORCE_ORG_IDS` non-empty |
| **GLOBAL_ENFORCE** | `mode=enforce` |

### Per-request effective mode

```
resolveEffectiveLimiterMode(config, organizationId):
  off → off
  mode=enforce → enforce (global)
  mode=shadow + org in canary list → enforce
  else → shadow
```

### Stable rollout unit

**Organization ID** — available at snapshot processor boundary; threaded via `requestContext.organizationId` on `fetchLatestVehicleSnapshot` → `queryGraphQL` → gateway.

No random sampling. Deterministic org allowlist only.

---

## 5. S4.3 — Observability

| Metric | Labels |
|--------|--------|
| `synqdrive_dimo_provider_requests_total` | operation, mode, **rollout_state**, **canary_match**, status_class, priority |
| `synqdrive_dimo_provider_admitted_requests_total` | operation, mode, rollout_state, canary_match, priority |
| `synqdrive_dimo_provider_token_bucket_tokens_remaining` | mode |
| `synqdrive_dimo_provider_cooldown_active` | (gauge 0/1) |
| (S3 metrics preserved) | admission wait, backpressure, shadow decisions, 403/429/5xx |

No vehicleId/VIN/tripId labels.

---

## 6. S4.4 — Go / No-Go gates

### SHADOW → CANARY_ENFORCE

| Gate | Threshold / criterion |
|------|----------------------|
| Permanent trip loss | **0** (hard invariant) |
| P0/P1 starvation | admission timeout rate for P0/P1 < 0.1% over 24h |
| Admission timeout rate | P3/P4 < 5% over 24h for canary orgs |
| Provider 429 rate | stable or decreasing vs shadow baseline |
| Retry-After frequency | < 1/hour fleet-wide |
| Redis limiter fail-open | < 10/hour |
| Latency p95 | < +15% vs shadow for canary orgs |

### CANARY_ENFORCE → expanded canary

- All above gates green for 7 days
- No reconciliation backlog growth attributable to admission timeouts
- Manual ops approval

### expanded canary → GLOBAL_ENFORCE

- All gates green for 14 days across expanded org set
- Explicit `DIMO_PROVIDER_LIMITER_MODE=enforce` change with change ticket
- **Not enabled by this PR**

**Blocker:** automated production dashboards for all gates are not yet wired — classify as ops follow-up before GLOBAL_ENFORCE.

---

## 7. S4.5 — Kill switch / rollback

| From | To | Config change |
|------|-----|---------------|
| GLOBAL_ENFORCE | SHADOW | `DIMO_PROVIDER_LIMITER_MODE=shadow` |
| CANARY_ENFORCE | SHADOW | Clear `DIMO_PROVIDER_CANARY_ENFORCE_ORG_IDS` |
| Any | OFF | `DIMO_PROVIDER_LIMITER_MODE=off` or `DIMO_PROVIDER_LIMITER_ENABLED=false` |

- No DB migration
- No data repair
- No code redeploy required (env + PM2 restart)
- Fail-open on Redis outage preserved

---

## 8. S4.6 — Test matrix

| # | Proof | Test file |
|---|-------|-----------|
| 1 | Shadow unchanged | `dimo-provider-limiter-s4.spec.ts` |
| 2 | Canary org enforce | `dimo-provider-limiter-s4.spec.ts`, redis integration L |
| 3 | Non-canary shadow | `dimo-provider-limiter-s4.spec.ts` |
| 4 | Deterministic assignment | `dimo-provider-rollout.util.spec.ts` |
| 5 | Multi-replica shared bucket | `dimo-provider-limiter-s4.spec.ts`, redis integration A |
| 6 | No second-boundary burst | `dimo-provider-limiter-s4.spec.ts` |
| 7–9 | P0/P1, P4, cooldown | S3 redis integration I, J (preserved) |
| 10 | Redis fail-open | redis integration H |
| 11–12 | Canary/global rollback | `dimo-provider-limiter-s4.spec.ts` |
| 13–14 | No trip loss, semantics | load matrix + FINAL-3 suites |

Real Redis CI: `npm run test:dimo-provider-limiter:redis`

---

## 9. S4.7 — Adversarial answers

| Question | Answer | Evidence |
|----------|--------|----------|
| A. 1000 vehicles violate budget? | NO under shadow; enforce defers | load matrix N=1000 S3 |
| B. Background starves P0/P1? | NO | redis integration I |
| C. Retry-After retry storm? | NO | global cooldown J |
| D. Replicas multiply rate? | NO | shared token bucket A |
| E. Accidental global enforce? | NO | requires mode=enforce or explicit org list |
| F. Rollback loses trip data? | NO | config-only; schedulers retry |

**PERMANENT_TRIP_LOSS = NO**

---

## 10. Configuration

| Env | Default | Safe range | Production recommendation |
|-----|---------|------------|---------------------------|
| `DIMO_PROVIDER_LIMITER_MODE` | shadow | off/shadow/enforce | **shadow** |
| `DIMO_PROVIDER_RATE_ALGORITHM` | token_bucket | token_bucket/fixed_window | token_bucket |
| `DIMO_PROVIDER_CANARY_ENFORCE_ORG_IDS` | (empty) | UUID list | start empty; add 1–2 pilot orgs |
| (S3 vars unchanged) | — | — | — |

**Rollback value:** `DIMO_PROVIDER_LIMITER_MODE=shadow`, clear canary list.

---

## 11. Files changed

```
backend/src/config/dimo-provider-limiter.config.ts
backend/src/config/dimo-provider-limiter.config.spec.ts
backend/.env.example
backend/src/modules/dimo/dimo-telemetry.service.ts
backend/src/modules/dimo/dimo-telemetry.service.spec.ts
backend/src/modules/dimo/provider/dimo-provider-gateway.service.ts
backend/src/modules/dimo/provider/dimo-provider-gateway.service.spec.ts
backend/src/modules/dimo/provider/dimo-provider-limiter.service.ts
backend/src/modules/dimo/provider/dimo-provider-limiter.types.ts
backend/src/modules/dimo/provider/dimo-provider-limiter.redis-scripts.ts
backend/src/modules/dimo/provider/dimo-provider-limiter.service.spec.ts
backend/src/modules/dimo/provider/dimo-provider-limiter.redis.integration.spec.ts
backend/src/modules/dimo/provider/dimo-provider-limiter-s4.spec.ts
backend/src/modules/dimo/provider/dimo-provider-limiter-s4-load-matrix.spec.ts
backend/src/modules/dimo/provider/dimo-provider-rollout.util.ts
backend/src/modules/dimo/provider/dimo-provider-rollout.util.spec.ts
backend/src/modules/dimo/provider/dimo-provider-metrics.service.ts
backend/src/workers/processors/dimo-snapshot.processor.ts
architecture/DIMO_PROVIDER_CONCURRENCY_P1_3_S4_PRODUCTION_CANARY_2026-08-30.md
architecture/P1_3_S4_PRODUCTION_CANARY_FINAL_RESPONSE_2026-08-30.md
frontend/src/master/components/ChangesView.tsx
frontend/src/master/components/ArchitekturView.tsx
```

---

## 12. Recommendation post-S4

- Wire Go/No-Go dashboards to Prometheus gates
- Pilot canary with 1–2 low-risk orgs
- Monitor 7-day window before expanding
- Do not enable GLOBAL_ENFORCE without explicit ops approval
