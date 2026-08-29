# P1.3-S3 — Priority-Aware DIMO Provider Enforcement / Backpressure — Final Response

```
REPORT_FILE = architecture/DIMO_PROVIDER_CONCURRENCY_P1_3_S3_PRIORITY_BACKPRESSURE_2026-08-30.md
FINAL_RESPONSE_FILE = architecture/P1_3_S3_PRIORITY_BACKPRESSURE_FINAL_RESPONSE_2026-08-30.md
MAIN_BASE_SHA = 7261a984ce0d07e97984eb00a9163fd501edc190
IMPLEMENTATION_SHA = c743a5a3a2ec9330e2abeb35b557fb686a56765a
DELIVERY_HEAD_SHA = b977c0ef0f4f3ba2b7a533640fdce6f3ea92388e
BRANCH = cursor/p1-3-s3-priority-backpressure-f21f
PR = pending
CI_STATUS = pending
REDIS_INTEGRATION = yes (CI redis:7-alpine; local skipped without Redis)
DEFAULT_LIMITER_MODE = shadow
ACTIVE_ENFORCEMENT_DEFAULT = false
TRIP_SEMANTICS_CHANGED = false
PERMANENT_TRIP_LOSS_FOUND = false
READY_TO_MERGE = false
READY_FOR_P1_3_S4 = true (after human review + optional enforce canary)
```

---

## Summary

P1.3-S3 delivers the **first real enforcement layer** behind `DimoProviderGateway` while preserving production safety:

- **Canonical priority model** P0–P4 with centralized category mapping
- **Bounded backpressure** via `DimoProviderAdmissionService` (enforce mode only)
- **Priority-aware in-flight admission** with reserved high-priority slots for live traffic
- **Central Retry-After cooldown** in Redis, shared across replicas
- **Shadow mode remains default** — no unexpected production throttling

Trip correctness, snapshot semantics, and reconciliation invariants are **unchanged**.

---

## Phase 0 — Pre-flight

| Check | Result |
|-------|--------|
| Latest `main` | `7261a984ce0d07e97984eb00a9163fd501edc190` |
| S2 merged (PR #1423) | Same SHA on main |
| Gateway coverage | All telemetry HTTP exits via gateway — no new bypass |
| Limiter defaults | shadow, 20/s+burst5, maxInFlight 40 |
| Redis fail-open | Preserved |

---

## Phase 1 — Priority taxonomy

| Priority | Use |
|----------|-----|
| P0_CRITICAL | Active trip tracking |
| P1_LIVE | Live-driving / freshness-critical |
| P2_INTERACTIVE | User-triggered summary/VIN, default GraphQL |
| P3_NORMAL | Snapshot polling |
| P4_BACKGROUND | Reconciliation, enrichment, DTC, sync |

Files: `dimo-provider-priority.model.ts`, `dimo-provider-category.util.ts`  
Tests prove every category resolves to a priority.

---

## Phase 2–3 — Enforcement + backpressure

**Flow:** Gateway → Admission.acquire (enforce) → Limiter.begin → invoke → end(inFlightMember)

| Question | Answer |
|----------|--------|
| Budget exhausted (shadow) | Record WOULD_REJECT; invoke proceeds |
| Budget exhausted (enforce) | Poll with bounded wait; timeout → error |
| Active/live requests | Reserved slots + longer wait + faster poll bias |
| Snapshot polling | P3; may defer to next poll on timeout |
| Background work | P4; shortest wait; existing scheduler retries |
| Max wait expired | `DimoProviderAdmissionTimeoutError` |
| Retry owner | Existing BullMQ/cron — no gateway retry loop |
| PERMANENT_TRIP_LOSS | **NO** |

---

## Phase 4 — Retry-After

HTTP 429 → parse Retry-After → `setProviderCooldown` → future `begin()` returns WOULD_WAIT until expiry. Bounded by `DIMO_PROVIDER_RETRY_AFTER_MAX_SECONDS`.

---

## Phase 5 — Load shedding

Lower-priority work that cannot acquire admission within wait budget surfaces as admission timeout; **existing reconciliation/snapshot schedulers** pick up on next cycle. No parallel scheduling architecture invented.

---

## Phase 6 — Configuration

Updated `backend/.env.example` with S3 vars. Defaults safe; enforce not enabled globally.

---

## Phase 7 — Observability

New metrics: admission wait histogram, backpressure counter, admission timeouts, cooldown activations, priority label on requests. No vehicleId cardinality.

---

## Phase 8 — Redis integration tests

Extended `dimo-provider-limiter.redis.integration.spec.ts`:

- I: P1 admitted when P4 fills cap
- J: Shared Retry-After cooldown across replicas
- K: Enforce wait then grant on release

CI: `npm run test:dimo-provider-limiter:redis` with `redis:7-alpine`.

---

## Phase 9 — Load / chaos matrix

`dimo-provider-limiter-s3-load-matrix.spec.ts` — N=100/250/1000 × S1/S2/S3 scenarios; all report `PERMANENT_TRIP_LOSS=NO`.

---

## Phase 10 — Trip correctness gate

| Suite | Status |
|-------|--------|
| FINAL-3 partial boundary repair | PASS |
| FINAL-3.1 / 3.2 | PASS |
| FINAL-5 / FINAL-6 scale gates | PASS |
| dimo-telemetry-gateway-coverage | PASS |
| dimo-provider unit tests (122) | PASS |

**TRIP_SEMANTICS_CHANGED = NO**

---

## Phase 11 — Security / tenancy

- Redis keys: global provider namespace only — no org/vehicle IDs
- No secrets in keys or logs
- Auth paths intentionally outside gateway (unchanged)

---

## Phase 12 — Documentation

- `architecture/DIMO_PROVIDER_CONCURRENCY_P1_3_S3_PRIORITY_BACKPRESSURE_2026-08-30.md`
- Changes + Architektur updated

---

## Rollback

Set `DIMO_PROVIDER_LIMITER_MODE=shadow` or `off`; redeploy. No migration.

---

## Delivery

- Branch: `cursor/p1-3-s3-priority-backpressure-f21f`
- **Do not merge** — draft PR for human review
- Enforce mode available but **not enabled in production** by this slice

---

## S4 recommendation

Gradual enforce canary, token-bucket rate smoothing, adaptive wait from latency, alerting on admission timeouts by priority.
