# Vehicle Raw Status — Ghost-State Diagnosis Contract

Fleet Status V2 (Prompt 15) derives **operational state from booking truth**, not from the persisted `Vehicle.status` column. Legacy raw values `RENTED` and `RESERVED` are **never silently demoted to Available**.

This document defines which inconsistencies the **future ops/diagnosis script** must detect and surface. The derivation engine already emits structured signals; the script should reconcile DB state against booking lifecycle data.

## Operational derivation rules (reference)

| Raw `Vehicle.status` | Booking context (RELIABLE) | Operational status | `operationalState.reason` |
|------------------------|----------------------------|--------------------|---------------------------|
| `RENTED` | Active rental consistent | `ACTIVE_RENTED` | `ACTIVE_BOOKING` |
| `RENTED` | No active rental | `UNKNOWN` | `RAW_STATUS_INCONSISTENT` |
| `RESERVED` | Reservation window active | `RESERVED` | `PICKUP_WINDOW_ACTIVE` |
| `RESERVED` | No window (and no active rental) | `UNKNOWN` | `RAW_STATUS_INCONSISTENT` |
| `RENTED` / `RESERVED` | Booking data `DEGRADED` / `UNAVAILABLE` | `UNKNOWN` | `BOOKING_DATA_UNAVAILABLE` |
| `AVAILABLE` | Active rental | `ACTIVE_RENTED` | `ACTIVE_BOOKING` (+ mismatch diagnostic) |
| `AVAILABLE` | Reservation window | `RESERVED` | `PICKUP_WINDOW_ACTIVE` (+ mismatch diagnostic) |

**No automatic DB write.** No self-healing in the derivation path.

## Signals emitted today

### `diagnosticReasons` (engine output)

| Code | When |
|------|------|
| `RAW_STATUS_LEGACY_RENTED` | Persisted raw status is `RENTED` |
| `RAW_STATUS_LEGACY_RESERVED` | Persisted raw status is `RESERVED` |
| `RAW_STATUS_INCONSISTENT` | Raw vs booking truth mismatch (ghost legacy or AVAILABLE mismatch) |
| `BOOKING_QUERY_FAILED` / `BOOKING_PARTIAL_RESULT` / … | Fail-closed booking load (see Prompt 14) |

### `rawVehicleStatus.diagnosticCodes`

| Code | When |
|------|------|
| `LEGACY_RENTED_PERSISTED` | Raw enum `RENTED` |
| `LEGACY_RESERVED_PERSISTED` | Raw enum `RESERVED` |
| `CONFLICTS_WITH_OPERATIONAL_STATE` | `RAW_STATUS_INCONSISTENT` or raw AVAILABLE mismatch |

### Structured logs (`VehiclesService.deriveFleetStatusContext`)

| `kind` | When |
|--------|------|
| `ghost_legacy_persisted` | Raw `RENTED`/`RESERVED` without matching booking (RELIABLE) → UNKNOWN |
| `raw_available_mismatch` | Raw `AVAILABLE` but operational ACTIVE_RENTED or RESERVED |
| `legacy_raw_unreliable_booking` | Raw `RENTED`/`RESERVED` + booking `DEGRADED`/`UNAVAILABLE` |

Log fields: `organizationId`, `vehicleId`, `rawStatus`, `operationalStatus`, `reasonCode`.

## Diagnosis script — required detections

The script should flag vehicles for operator review (not auto-fix) when:

### 1. Ghost Active Rented (`GHOST_ACTIVE_RENTED`)

- **DB:** `Vehicle.status = RENTED`
- **Booking truth:** No reliable active rental (`ACTIVE` + pickup evidence + open return, per active-rental policy)
- **Engine today:** `UNKNOWN` + `RAW_STATUS_INCONSISTENT`
- **Suggested action:** Verify booking/handover data; align raw status or complete/cancel stale booking

### 2. Ghost Reserved (`GHOST_RESERVED`)

- **DB:** `Vehicle.status = RESERVED`
- **Booking truth:** No reservation window booking and no active rental
- **Engine today:** `UNKNOWN` + `RAW_STATUS_INCONSISTENT`
- **Suggested action:** Verify upcoming PENDING/CONFIRMED in pickup window; align raw or booking

### 3. Stale Available with active rental (`AVAILABLE_WITH_ACTIVE_BOOKING`)

- **DB:** `Vehicle.status = AVAILABLE`
- **Booking truth:** Reliable active rental
- **Engine today:** `ACTIVE_RENTED` + `RAW_STATUS_INCONSISTENT` diagnostic
- **Suggested action:** Update raw to reflect rental or investigate phantom ACTIVE booking

### 4. Stale Available with reservation window (`AVAILABLE_WITH_RESERVATION_WINDOW`)

- **DB:** `Vehicle.status = AVAILABLE`
- **Booking truth:** Reliable reservation window
- **Engine today:** `RESERVED` + `RAW_STATUS_INCONSISTENT` diagnostic
- **Suggested action:** Update raw to RESERVED or fix window booking

### 5. Legacy raw with unreliable booking data (`LEGACY_RAW_BOOKING_UNAVAILABLE`)

- **DB:** `Vehicle.status IN (RENTED, RESERVED)`
- **Booking load:** `DEGRADED` or `UNAVAILABLE`
- **Engine today:** `UNKNOWN` + `BOOKING_DATA_UNAVAILABLE` (not `RAW_STATUS_INCONSISTENT`)
- **Suggested action:** Fix booking query/handover/station issues first; re-run diagnosis

### 6. Consistent legacy raw (informational)

- **DB:** `RENTED` with matching active rental, or `RESERVED` with matching window
- **Engine today:** Operational matches booking; legacy tags only (`RAW_STATUS_LEGACY_*`)
- **Suggested action:** Optional migration to stop writing legacy raw values; not an inconsistency

## Query sketch for diagnosis script

Per organization:

1. Load vehicles with `status IN ('RENTED', 'RESERVED', 'AVAILABLE')`.
2. Batch-load booking context via `assembleBookingContextMap` / `resolveBookingStateForVehicle` (same as fleet list).
3. Run `buildVehicleOperationalStateFromEngineInput` per vehicle.
4. Classify using `operationalState.reason`, `diagnosticReasons`, and `rawVehicleStatus.diagnosticCodes` per tables above.
5. Emit report rows: `vehicleId`, `licensePlate`, `rawStatus`, `operationalStatus`, `reasonCode`, `diagnosticReasons`, `classification`.

## Explicit non-goals

- Do **not** downgrade ghost states to Available in API responses.
- Do **not** auto-update `Vehicle.status` in the derivation path.
- Do **not** treat `BOOKING_DATA_UNAVAILABLE` as proof of ghost state — booking data must be reliable before inferring raw inconsistency.

## Tests

- `vehicle-raw-status.guard.spec.ts` — unit rules 1–7
- `vehicle-operational-state.builder.spec.ts` — integration via engine
- `vehicle-operational-state.engine.matrix.spec.ts` — matrix cases 15–16 (ghost legacy)
- `vehicles.service.spec.ts` — structured warn logging
