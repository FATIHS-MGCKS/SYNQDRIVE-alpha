# Fleet Readiness UNEVALUABLE Aggregate Notification (P2.4)

**Date:** 2026-08-19  
**Depends on:** P2.3 (`architecture/FLEET_READINESS_AGGREGATE_NOTIFICATION_2026-08.md`)

## 1. Canonical source

```
Cause notifications (connectivity, module, provider failures, …)
        ↓
Canonical RentalHealth snapshot (already computed)
        ↓
VehicleHealth.rental_readiness === 'unevaluable'
        ↓
projectVehicleReadinessEvaluability()
        ↓
VEHICLE_READINESS_UNEVALUABLE (ONE evaluability aggregate per vehicle)
```

P2.4 consumes **only** `rental_readiness` from the existing `getVehicleHealth()` snapshot — no second evaluation, no module rollup, no connectivity event counting.

## 2. Why a new aggregate is needed

`rental_readiness === 'unevaluable'` means the fleet-readiness pipeline cannot confirm ready or not-ready. No existing notification event represents this generic operational consequence.

## 3. Connectivity / data events are causes (audit summary)

| eventType | Role | Necessarily implies `rental_readiness=unevaluable`? | Can unevaluable exist without it? |
|-----------|------|---------------------------------------------------|-----------------------------------|
| `TELEMETRY_OFFLINE` | Cause — telemetry gap | No | Yes |
| `TELEMETRY_SOFT_OFFLINE` | Cause — degraded telemetry | No | Yes |
| `DEVICE_UNPLUGGED` | Cause — device episode | No | Yes |
| `AUTHORIZATION_REQUIRED` | Cause — reauth needed | No | Yes |
| `DATA_SOURCE_DISCONNECTED` | Cause — integration link | No | Yes |
| `DATA_COVERAGE_INSUFFICIENT` | Cause — signal coverage | No | Yes |
| `CONNECTIVITY_STATE_UNKNOWN` | Cause — connectivity state unknown | No | Yes |

**Proof:** RentalHealth can be `unevaluable` from service-compliance provider failure, partial module coverage, or other module pipeline failures without any connectivity notification. Conversely, connectivity alerts can exist while RentalHealth remains fully evaluable (`ready` / `not_ready`).

## 4. Why not `CONNECTIVITY_STATE_UNKNOWN`

| Event | Question answered |
|-------|-------------------|
| `CONNECTIVITY_STATE_UNKNOWN` | How is this vehicle's connectivity state? |
| `VEHICLE_READINESS_UNEVALUABLE` | Can fleet readiness be canonically evaluated? |

These may correlate but are not identical. No deduplication between cause and aggregate.

## 5. Relationship to `VEHICLE_NOT_READY` (P2.3 unchanged)

| `rental_readiness` | `VEHICLE_NOT_READY` | `VEHICLE_READINESS_UNEVALUABLE` |
|--------------------|---------------------|----------------------------------|
| `not_ready` | OPEN | RESOLVE (evaluable) |
| `ready` | RESOLVE | RESOLVE (evaluable) |
| `unevaluable` | **preserve OPEN** (fail-safe) | OPEN |

Allowed: `NOT_READY` OPEN + `UNEVALUABLE` OPEN simultaneously = last confirmed not-ready + current data cannot re-evaluate.

## 6. State machine

| Condition | Action |
|-----------|--------|
| `rental_readiness === 'unevaluable'` | OPEN / REOPEN `VEHICLE_READINESS_UNEVALUABLE` (WARNING) |
| `rental_readiness === 'ready'` or `'not_ready'` | RESOLVE if active fingerprint exists; else no-op |
| `rental_readiness === undefined` | **NO_ASSERTION** — emit nothing; preserve existing OPEN rows |

`ready` and `not_ready` are both **EVALUABLE** states. Missing `rental_readiness` is **not** treated as evaluable — no `?? 'ready'` fallback.

## 7. RentalHealth load failure boundary

When `getVehicleHealth()` throws and `rentalHealth === null`, P2.4 emits **nothing** (same as P2.3). The synthetic `emptyVehicleHealthForDtcOnly()` helper is used only for DTC health warnings — not for aggregate projection.

When a canonical snapshot exists but omits `rental_readiness` (e.g. `buildDegradedVehicleHealth()`), P2.4 also emits **nothing** — **NO_ASSERTION**, not fail-open EVALUABLE.

Existing OPEN `VEHICLE_READINESS_UNEVALUABLE` rows are preserved on projection failure or missing-field snapshots.

## 8. Sync integration

`VehicleHealthNotificationSyncService` sixth stage: `syncVehicleReadinessEvaluabilityAggregate()` — failure-isolated from health/compliance/alerts/readiness stages.

## 9. Registry delta

+1 event type: `VEHICLE_READINESS_UNEVALUABLE`  
Counts: **70 / 27 / 43** (+1 total, +1 FLEET_READINESS)

`producerModule: operations` — same domain taxonomy contract as `VEHICLE_NOT_READY`.

## 10. Future UI grouping (documentation only)

```
BMW 320d — NICHT BEWERTBAR
Causes:
• Telemetrie offline
• Datenquelle getrennt
```

Or with preserved NOT_READY parent:

```
Last confirmed: NOT READY
Status: NICHT BEWERTBAR
```

No UI in P2.4.
