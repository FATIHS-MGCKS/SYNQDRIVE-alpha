# Post-#1445 Production Validation Protocol (Phase 4)

**Hypothesis:** `BAT-V2-HYP-POST-1445-SOAK-001`  
**Readiness:** PRODUCTION_VALIDATION_ONLY  
**Runtime changes:** None

## Objective

Determine whether #1445 liveness fixes eliminate REST stall class on **natural** post-deploy trips — without backfill, manufactured sessions, or data mutation.

**This protocol provides INITIAL SMOKE EVIDENCE for liveness — not STRONG PRODUCTION VALIDATION.**

## Authoritative persistence models (Prisma)

| Concept | Prisma model / enum | Notes |
|---------|---------------------|-------|
| Trip | `VehicleTrip` | `tripStatus = COMPLETED`; anchor = `endTime` |
| LV REST session | `BatteryMeasurementSession` | `type = BatteryMeasurementSessionType.LV_REST_WINDOW` |
| REST measurement | `BatteryMeasurement` | Types `REST_60M` / `REST_6H` |
| Session anchor | `BatteryMeasurementSession.idempotencyKey` | Trip-end anchor ms encoded in key |
| REST target metadata | `BatteryMeasurementSession.metadata` | JSON — target status timeline |

**Do not use** conceptual names `Trip`, `BatteryLvRestSession`, or `anchorAt` — they are not Prisma fields.

## Trip eligibility (exposure preconditions)

A trip counts toward post-#1445 evidence **only** when exposure is known. Classify each candidate:

| Status | Meaning |
|--------|---------|
| **ELIGIBLE** | All preconditions verified |
| **INELIGIBLE** | Failed precondition — exclude from evidence |
| **EXPOSURE_UNKNOWN** | Deployment/flag exposure not verified — do not count as clean negative evidence |

### Minimum preconditions (verify/record per trip)

| # | Precondition |
|---|--------------|
| 1 | Trip `endTime` after relevant #1445 deploy SHA was **actually running** on target environment |
| 2 | `BATTERY_V2_REST_SHADOW_ENABLED` (or documented equivalent) was **ON** for vehicle/org |
| 3 | `VehicleTrip.tripStatus = COMPLETED` with authoritative `endTime` |
| 4 | REST session opening path was eligible (trip-finalization or documented reconciliation) |
| 5 | REST_60M target opportunity existed (record separately from REST_6H) |
| 6 | REST_6H opportunity recorded separately when applicable |
| 7 | Telemetry availability recorded **separately** from lifecycle liveness |

Trips with **EXPOSURE_UNKNOWN** must not be used to claim liveness success or failure.

## Observation capture (per eligible trip)

| Field | Source |
|-------|--------|
| vehicleId | `VehicleTrip.vehicleId` |
| tripId | `VehicleTrip.id` |
| tripEndAt | `VehicleTrip.endTime` |
| sessionId | `BatteryMeasurementSession.id` where `type = LV_REST_WINDOW` |
| session idempotencyKey | Anchor component for `lv-rest-open:{vehicleId}:{anchorMs}` |
| REST target ids | Session `metadata` — REST_60M / REST_6H |
| target status timeline | ENQUEUED → RUNNING/PENDING_EVALUATION → COMPLETED/MISSED |
| Bull job ids | Queue inspection (read-only) |
| DLQ entries | `battery.v2` failed set cardinality + sample |
| reconciliation runs | Logs if available |
| lock contention | `BatteryV2VehicleLockContendedError` in logs |
| replica identity | PM2 instance if observable |
| final measurement | `BatteryMeasurement` REST row |
| assessment row | If exists (may be absent pre-PKG-01) |
| eligibility status | ELIGIBLE / INELIGIBLE / EXPOSURE_UNKNOWN |

Record **actual session-arm latency** descriptively (`VehicleTrip.endTime` → `BatteryMeasurementSession.createdAt`). Do not treat 30m as session-opening SLA — 30m is REST **target retry grace**, not session-arm SLA.

## Outcome dimensions (do not collapse)

| Dimension | Question |
|-----------|------------|
| **LIFECYCLE_LIVENESS** | Did session + targets reach terminal lifecycle without unexplained stall? |
| **MEASUREMENT_QUALIFICATION** | Was a valid REST measurement produced when telemetry supported it? |
| **ASSESSMENT_AVAILABILITY** | Assessment row exists (may be N/A pre-PKG-01) |
| **RECOVERY_BEHAVIOR** | Reconcile/DLQ/restart recovered stuck states? |

A legitimate **MISSED** target may be: **LIFECYCLE_LIVENESS PASS** + **MEASUREMENT NOT AVAILABLE** (telemetry gap) — not an overall FAIL.

## Pass criteria (single eligible trip)

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
| **Initial smoke** | First observation after #1445 | ≥10 **ELIGIBLE** natural ICE/HEV trips, ≥3 vehicles, 14 days — **smoke only** |
| **Strong validation** | Upgrade hypothesis beyond UNKNOWN | Plan by failure mode: REST_60M/REST_6H exposure opportunities, multi-day parking patterns, reconciliation/restart exposure, multi-replica when relevant — sample size derived from target failure rate, not fixed "10 = 95%" |

Expand sample if any **liveness FAIL** in first tranche.

## What this does NOT validate

- LV publication chain (handoffs still missing)
- Stage 2 cutover safety
- Multi-replica deploy (separate scaling workstream)
- Statistical proof of fleet-wide reliability from 10 trips

## Query plan (PSEUDO-QUERY — adapt to verified production schema)

**DO NOT EXECUTE VERBATIM.** Adapt table/column names to verified Prisma mappings.

```typescript
// Illustrative Prisma-style plan — operator must verify schema
await prisma.vehicleTrip.findMany({
  where: {
    tripStatus: 'COMPLETED',
    endTime: { gt: deploy1445At },
  },
  include: {
    batteryMeasurementSessions: {
      where: { type: 'LV_REST_WINDOW' },
    },
  },
  orderBy: { endTime: 'desc' },
  take: 50,
});
```

Equivalent SQL pseudo-shape (adapt joins):

```sql
-- PSEUDO-QUERY: DO NOT EXECUTE VERBATIM
SELECT vt.id, vt.end_time, bms.id, bms.idempotency_key, bms.metadata
FROM vehicle_trips vt
JOIN battery_measurement_sessions bms
  ON bms.trip_id = vt.id AND bms.type = 'LV_REST_WINDOW'
WHERE vt.trip_status = 'COMPLETED'
  AND vt.end_time > :deploy_1445_at
ORDER BY vt.end_time DESC
LIMIT 50;
```

## GRAPH IDS

Hypothesis remains until evidence recorded as `BAT-V2-EVID-PROD-*`. Not PRODUCTION_VALIDATED.
