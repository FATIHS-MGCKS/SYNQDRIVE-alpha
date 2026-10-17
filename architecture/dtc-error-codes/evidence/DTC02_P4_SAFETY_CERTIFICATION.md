# DTC-02 P4 — safety & fallback certification (repository)

**Date:** 2026-10-17  
**Epistemic:** `CONFIRMED` for unit/BullMQ shadow isolation tests; PostgreSQL reconciliation when `DTC_01B_PG_INTEGRATION=1`; **NOT_DEPLOYED**; deferral **NOT ENABLED**.

## Safety certification matrix (summary)

| Scenario | Certified behavior | False clear | Episode corruption | Starvation | Legacy 3h |
|----------|-------------------|-------------|-------------------|------------|-----------|
| Missing provider capability | Planner fallback / legacy next | N/A (shadow) | No apply path | Bounded min interval on accelerate | Preserved |
| Missing successful check | Accelerate shadow proposal ≤ legacy | No | No | Min interval | Preserved |
| Stale source-head / success | Fallback, no defer beyond legacy | No | No | Accelerate ≤ legacy | Preserved |
| Partial webhook | `allowClears=false` | **Blocked** | Upsert only | N/A | Preserved |
| Duplicate webhook | No apply (DUPLICATE) | **Blocked** | No-op | N/A | Preserved |
| OOO webhook | STALE, no apply | **Blocked** | No | N/A | Preserved |
| Provider 403/timeout | Planner fallback / accelerate | No | No | Min interval | Preserved |
| Invalid shadow config | Shadow skipped, fan-out unchanged | No | No | N/A | Preserved |
| Shadow batch error | Caught in runtime + processor hook; enqueue already done | No | No | N/A | Preserved |
| Offboarded | Excluded from planner | No | Admission skip | N/A | Preserved |
| Concurrent poll/webhook | Advisory lock (01B PG) | **Blocked** when partial | Single head | N/A | Preserved |
| BullMQ/workers disabled | `canEnqueueQueue` skip (pre-existing) | No | No | N/A | Preserved |

Automated: `dtc-02-safety-certification.matrix.spec.ts`, `dimo-dtc.processor.shadow-cert.spec.ts`, `dtc-02-p4.postgres.integration.spec.ts`.

## Source-trust reconciliation

Pure classifier: `assessDtc02SourceTrustSurface` — read-only, no repair.

Detects: missing head, head/VLS poll skew, outbox backlog, partial-after-complete watermarks, episode/VLS list mismatch, stale success timestamp.

## Future deferral policy (design only)

Module: `dtc-02-future-deferral-policy.ts`

- `DTC_02_ADAPTIVE_DEFERRAL_ENABLED` must remain **false** in P4.
- Eligibility requires production webhook reliability evidence (not claimed).
- Proposed P5 max extra deferral: **1h** beyond legacy next tick (`DTC02_P5_MAX_EXTRA_DEFERRAL_MS`).
- Freshness SLO: **2h** (`DTC02_P5_FRESHNESS_SLO_MS`).
- Fallback deadline: `lastSuccess + 3h + 1h` cap.
- Kill switch: disable shadow + deferral env flags; invalid allowlist fails closed.

## P5 pilot prerequisites (activation blockers)

1. Production webhook delivery + capability evidence per vehicle cohort.
2. Observed vs projected poll savings study on shadow metrics.
3. Source-trust divergence rate near zero on pilot allowlist.
4. Owner-approved enablement of `DTC_02_ADAPTIVE_DEFERRAL_ENABLED` + enqueue cutover PR.
5. CI + disposable PostgreSQL certification green on pilot branch.

## Known limitations

- P3 planner cannot produce positive poll reduction (defer beyond legacy) until P5 policy enabled.
- Shadow allowlist size uncapped (pilot discipline required).
- No automatic production repair of head/VLS divergence.

## Validation

```bash
cd backend && npm test -- --testPathPatterns='dtc-02-(safety|p4|future|source-trust)|dimo-dtc.processor.shadow'
cd backend && DTC_01B_PG_INTEGRATION=1 DATABASE_URL=… npm test -- dtc-02-p4.postgres
```
