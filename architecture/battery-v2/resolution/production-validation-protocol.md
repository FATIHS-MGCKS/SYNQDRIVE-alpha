# Post-#1445 Production Validation Protocol (Phase 4)

**Hypothesis:** `BAT-V2-HYP-POST-1445-SOAK-001`  
**Readiness:** PRODUCTION_VALIDATION_ONLY  
**Runtime changes:** None

## Objective

Determine whether #1445 liveness fixes eliminate REST stall class on **natural** post-deploy trips — without backfill, manufactured sessions, or data mutation.

**This protocol provides INITIAL SMOKE EVIDENCE for liveness — not STRONG PRODUCTION VALIDATION.**

## Observation capture (per natural trip)

| Field | Source |
|-------|--------|
| vehicleId | Trip record |
| tripId | COMPLETED trip |
| tripEndAt | Authoritative anchor |
| sessionId | `BatteryLvRestSession` |
| session anchor ms | Idempotency key component |
| REST target ids | REST_60M / REST_6H metadata |
| target status timeline | ENQUEUED → RUNNING/PENDING_EVALUATION → COMPLETED/MISSED |
| Bull job ids | Queue inspection (read-only) |
| DLQ entries | `battery.v2` failed set cardinality + sample |
| reconciliation runs | Logs if available |
| lock contention | `BatteryV2VehicleLockContendedError` in logs |
| replica identity | PM2 instance if observable |
| final measurement | `BatteryMeasurement` REST row |
| assessment row | If exists (may be absent pre-PKG-01) |

Record **actual session-arm latency** descriptively (trip end → session created). Do not treat 30m as session-opening SLA — 30m is REST **target retry grace**, not session-arm SLA.

## Outcome dimensions (do not collapse)

| Dimension | Question |
|-----------|------------|
| **LIFECYCLE_LIVENESS** | Did session + targets reach terminal lifecycle without unexplained stall? |
| **MEASUREMENT_QUALIFICATION** | Was a valid REST measurement produced when telemetry supported it? |
| **ASSESSMENT_AVAILABILITY** | Assessment row exists (may be N/A pre-PKG-01) |
| **RECOVERY_BEHAVIOR** | Reconcile/DLQ/restart recovered stuck states? |

A legitimate **MISSED** target may be: **LIFECYCLE_LIVENESS PASS** + **MEASUREMENT NOT AVAILABLE** (telemetry gap) — not an overall FAIL.

## Pass criteria (single natural trip)

| Behavior | LIVENESS | MEASUREMENT | Notes |
|----------|----------|-------------|-------|
| Session created by trip-finalization or reconciliation path | PASS / PARTIAL / FAIL | — | Record latency; no fixed SLA |
| REST_60M reaches terminal state | PASS | PASS if COMPLETED with valid measurement | MISSED may be liveness PASS |
| No orphan ENQUEUED without live job | PASS | — | |
| PENDING_EVALUATION resolves | PASS | — | |

## Sample planning (not convenience statistics)

**Do not** claim "10 trips ≈ 95% reliability."

If per-trip failure probability were 30%, observing **zero failures in 10 trips** yields approximate 95% **upper bound** on failure rate ≈ 30% (rule of three: `3/n`). That demonstrates absence of **frequent** failure in a small sample — not strong validation.

| Tranche | Purpose | Minimum guidance |
|---------|---------|------------------|
| **Initial smoke** | First observation after #1445 | ≥10 natural ICE/HEV trips, ≥3 vehicles, 14 days — **smoke only** |
| **Strong validation** | Upgrade hypothesis beyond UNKNOWN | Plan by failure mode: REST_60M/REST_6H exposure opportunities, multi-day parking patterns, reconciliation/restart exposure, multi-replica when relevant — sample size derived from target failure rate, not fixed "10 = 95%" |

Expand sample if any **liveness FAIL** in first tranche.

## What this does NOT validate

- LV publication chain (handoffs still missing)
- Stage 2 cutover safety
- Multi-replica deploy (separate scaling workstream)
- Statistical proof of fleet-wide reliability from 10 trips

## Query plan (read-only — when authorized)

Session/target liveness queries on existing schema — illustrative:

```sql
SELECT v.id, t.id, t."endTime", s.id, s."anchorAt"
FROM "Trip" t
JOIN "Vehicle" v ON ...
LEFT JOIN "BatteryLvRestSession" s ON ...
WHERE t.status = 'COMPLETED' AND t."endTime" > :deploy_1445_at
ORDER BY t."endTime" DESC LIMIT 50;
```

## GRAPH IDS

Hypothesis remains until evidence recorded as `BAT-V2-EVID-PROD-*`. Not PRODUCTION_VALIDATED.
