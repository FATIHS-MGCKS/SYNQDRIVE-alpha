# Post-#1445 Production Validation Protocol (Phase 4)

**Hypothesis:** `BAT-V2-HYP-POST-1445-SOAK-001`  
**Readiness:** PRODUCTION_VALIDATION_ONLY  
**Runtime changes:** None

## Objective

Determine whether #1445 liveness fixes eliminate REST stall class on **natural** post-deploy trips — without backfill, manufactured sessions, or data mutation.

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

## Pass criteria (single natural trip)

| Behavior | PASS | PARTIAL | FAIL | INCONCLUSIVE |
|----------|------|---------|------|--------------|
| Session arms within 30m of trip end | ✓ | delayed >30m | no session | trip not suitable |
| REST_60M reaches terminal state | COMPLETED/MISSED | stuck ENQUEUED recovered | permanent ENQUEUED+DLQ | insufficient telemetry |
| No orphan ENQUEUED without live job | ✓ | recovered via reconcile | stuck | — |
| Measurement when telemetry exists | ✓ | MISSED with valid reason | fabricated zero | no REST window |
| PENDING_EVALUATION resolves | ✓ | — | permanent | — |

## Production confidence (not single trip)

Recommend **minimum 10 natural ICE/HEV trips** across ≥3 vehicles with REST shadow ON, over **14 days**, before upgrading hypothesis to INFERRED success. Rationale: #1445 addressed deploy-interrupt and anchor classes — recurrence may be vehicle-specific or telemetry-sparse.

**Do not** invent a fleet-wide percentage without data.

## Sample size rationale

- 10 trips: catches common path at ~95% if per-trip success ≥70% (binomial)
- 14 days: covers weekend parking + weekday commute diversity
- Expand if any FAIL in first 5

## What this does NOT validate

- LV publication chain (handoffs still missing)
- Stage 2 cutover safety
- Multi-replica deploy (separate scaling workstream)

## Query plan (read-only — when authorized)

```sql
-- Illustrative; adapt to prod schema
SELECT v.id, t.id, t."endTime", s.id, s."anchorAt"
FROM "Trip" t
JOIN "Vehicle" v ON ...
LEFT JOIN "BatteryLvRestSession" s ON ...
WHERE t.status = 'COMPLETED' AND t."endTime" > :deploy_1445_at
ORDER BY t."endTime" DESC LIMIT 50;
```

## GRAPH IDS

Hypothesis remains until evidence recorded as `BAT-V2-EVID-PROD-*`.
