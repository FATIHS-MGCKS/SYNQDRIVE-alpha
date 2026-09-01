# Battery V2 — HV Charge Sessions

**Flag:** `BATTERY_V2_HV_RECHARGE_SESSION_ENABLED`  
**Reconstruction:** CONFIRMED from `hv-recharge-session-reconcile.service.ts`, `hv-charge-session-persist.service.ts`

## Authority precedence

```
Native DIMO recharge segment (when capability available)
  authoritative_over
Telemetry poll fallback session (when segments unavailable)
```

When native segment ingested, overlapping fallback sessions are **superseded** (`hv-fallback-charge-session.supersede.ts`):

- Metadata records `supersededBySegmentFingerprint`, `supersededAt`
- Fallback row remains as historical evidence; `isOngoing: false`
- Double-counting prevented by fingerprint uniqueness + overlap detection

## Triggers

| Trigger | Path |
|---------|------|
| Snapshot classify | `HvRechargeSessionReconcileProducer` |
| Periodic reconcile | `HV_RECHARGE_SESSION_RECONCILE` job |
| Segment fingerprint | Single-segment ingest |

## Lifecycle

1. Check flag + DIMO token + HV method profile `rechargeSegmentsAvailable`
2. If segments **unavailable** → `HvFallbackChargeSessionDetectorService.detectAndPersistForVehicle()`
3. If available → `HvChargeSessionIngestService` fetches DIMO segments (31-day lookback default)
4. Persist via `HvChargeSessionPersistService.persistRechargeSegment()`
5. On native persist → supersede overlapping fallback sessions
6. `HvCapacityShadowProducerService.maybeEnqueueAfterSessionPersist()` when session changes

## Idempotency

- Session key: `hv-session:{vehicleId}:{segmentFingerprint}`
- Unique: `(vehicleId, idempotencyKey)` and `(vehicleId, segmentFingerprint)`

## Session eligibility metadata

- `capacityShadowEligible` — required for M2 session observations
- `capacityValidationEligible` — required for M3 validation

## Fallback allowed when

- `dimo.segments.recharge` capability not available (NOT_LISTED, error, etc.)
- Reconcile explicitly logs and delegates to fallback detector

## Unknown / gaps

- Multi-replica concurrent reconcile races — mitigated by vehicle lock (`hv` scope) when Redis available
- Historical fallback rows after supersession — retained; capacity shadow recompute behavior on supersede **partially traced**
