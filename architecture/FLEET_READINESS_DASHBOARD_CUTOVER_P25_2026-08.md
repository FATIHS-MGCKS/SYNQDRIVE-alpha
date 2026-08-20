# Fleet Readiness Dashboard Cutover Backend Gate (P2.5)

**Date:** 2026-08-19  
**Status:** Backend gate complete — READY FOR UI CUTOVER

## attentionScope API projection

```
GET /organizations/:orgId/notifications?attentionScope=FLEET_READINESS|OPERATIONS
GET /organizations/:orgId/notifications/counts?attentionScope=...
```

- Event types from `getNotificationEventTypesByAttentionScope()` only
- Intersects with role visibility, station scope, preferences, status filters
- `attentionScope` not persisted; not in fingerprints

## Shared damage blocking policy

`backend/src/modules/rental-health/damage-rental-health.policy.ts`

- `OPEN` + `rentalImpact ∈ { BLOCK_RENTAL, SAFETY_CRITICAL }`
- Used by `RentalHealthService` and `VehicleDamageNotificationAdapter`

## VEHICLE_DAMAGE_BLOCKING

- Fingerprint: `org|VEHICLE_DAMAGE_BLOCKING|VEHICLE|vehicleId|vehicle_damage_blocking:damageId|v1`
- Coexists with `VEHICLE_NOT_READY` aggregate (no dedup)

## Fail-safe recovery

`vehicle-health-recovery.policy.ts` + ingest sweep eligibility maps

- Module recovery: `state === 'good'` only when RentalHealth loaded
- DTC recovery: successful query + code absent
- Compliance recovery: evaluation succeeded + blocking condition cleared
- Query failure → preserve OPEN notifications

## Full fleet readiness summary

`GET /organizations/:orgId/rental-health/fleet/summary`

- Counts from `rental_readiness` via `RentalHealthSummaryService` batching
- Same vehicle selection scope as fleet list (station access, filters)

## Deferred

- `SERVICE_WINDOW` / `HM_SERVICE_NO_TRACKING` live open producers
- Tire/brake/battery producer rewrites
- Dashboard UI split (Operations vs Fleet Readiness panels)
