# Vehicle Operational State Engine — Testmatrix (Prompt 9/43)

**Date:** 2026-07-15  
**Scope:** Pure unit tests — no database, no Prisma, no HTTP.  
**Implementation under test:** `deriveCanonicalOperationalState` / `buildVehicleOperationalStateFromEngineInput` in `backend/src/modules/vehicles/domain/vehicle-operational-state.builder.ts`  
**Test file:** `backend/src/modules/vehicles/domain/vehicle-operational-state.engine.matrix.spec.ts`  
**Fixtures:** `backend/src/modules/vehicles/domain/vehicle-operational-state.engine.test-fixtures.ts`

---

## Evaluation baseline

| Parameter | Value |
|-----------|-------|
| `evaluationAt` | `2026-07-15T12:00:00.000Z` |
| `organizationTimezone` | `Europe/Berlin` |
| Vehicle raw status (default) | `AVAILABLE` |

Reservation-window boundaries are **not** computed in the engine (Prompt 8 scope). Cases 3–4 assume the **input mapper / query layer** has already classified bookings into `nextBooking` vs `reservationWindowBooking`.

---

## Matrix (20 required cases)

| # | Scenario | Input signal | Expected `operationalState` | Expected `reason` | Notes |
|---|----------|--------------|----------------------------|-------------------|-------|
| 1 | No booking, no blockade | Empty booking slots | `AVAILABLE` | `NO_ACTIVE_OR_UPCOMING_WINDOW` | Baseline idle |
| 2 | CONFIRMED in 2 weeks | `nextBooking` only | `AVAILABLE` | `NO_ACTIVE_OR_UPCOMING_WINDOW` | KS FH 660E pattern |
| 3 | CONFIRMED tomorrow, window not open | `nextBooking` (phase `future`) | `AVAILABLE` | `NO_ACTIVE_OR_UPCOMING_WINDOW` | Window calc is upstream |
| 4 | Pickup day, handover open | `reservationWindowBooking` | `RESERVED` | `PICKUP_WINDOW_ACTIVE` | `effectiveFrom`/`Until` from booking |
| 5 | Active rental | `activeBooking` | `ACTIVE_RENTED` | `ACTIVE_BOOKING` | |
| 6 | ACTIVE + reservation window | Both refs set | `ACTIVE_RENTED` | `ACTIVE_BOOKING` | §15.4 prio 4 > 5 |
| 7 | Return completed | All slots `null` | `AVAILABLE` | `NO_ACTIVE_OR_UPCOMING_WINDOW` | Terminal booking omitted |
| 8 | Cancelled booking | All slots `null` | `AVAILABLE` | `NO_ACTIVE_OR_UPCOMING_WINDOW` | Cancelled booking omitted |
| 9 | Maintenance | `maintenanceState.isMaintenance` | `MAINTENANCE` | `MAINTENANCE_ACTIVE` | |
| 10 | Hard block | `blockingState.level = hard` | `BLOCKED` | `HARD_BLOCK_ACTIVE` | Legacy label `Maintenance` |
| 11 | Maintenance + future booking | Maintenance + `nextBooking` | `MAINTENANCE` | `MAINTENANCE_ACTIVE` | `nextBooking` preserved in context |
| 12 | Active rented + soft warning | ACTIVE + soft block + `TELEMETRY_STALE` | `ACTIVE_RENTED` | `ACTIVE_BOOKING` | Soft block does not change main status |
| 13 | Data DEGRADED | `dataQualityState = DEGRADED` | `UNKNOWN` | `BOOKING_STATE_INCONSISTENT` | Fail-closed |
| 14 | Data UNAVAILABLE | `dataQualityState = UNAVAILABLE` | `UNKNOWN` | `BOOKING_DATA_UNAVAILABLE` | Booking context cleared |
| 15 | Raw `RENTED` ghost | `rawStatus = RENTED`, no active | `UNKNOWN` | `RAW_STATUS_INCONSISTENT` | Ghost warning logged |
| 16 | Raw `RESERVED` ghost | `rawStatus = RESERVED`, no window | `UNKNOWN` | `RAW_STATUS_INCONSISTENT` | |
| 17 | Unknown raw enum | `rawStatus = BROKEN_STATUS` | `UNKNOWN` | `UNKNOWN_STATUS_VALUE` | |
| 18 | Multiple future bookings | `nextBooking` + `futureBookingCount = 2` | `AVAILABLE` | `NO_ACTIVE_OR_UPCOMING_WINDOW` | Count does not change status |
| 19 | Effective window | ACTIVE rental | `ACTIVE_RENTED` | `ACTIVE_BOOKING` | `effectiveFrom` = pickupAt |
| 20 | Reliability pairing | RESERVED, RELIABLE | `RESERVED` | `PICKUP_WINDOW_ACTIVE` | `isReliable = true` |

Additional coverage in the same file:

- `dataQualityState` ↔ `isReliable` pairings (DEGRADED, UNAVAILABLE, RELIABLE)
- Undefined booking slices → `UNKNOWN` / `BOOKING_DATA_UNAVAILABLE`

---

## Bug fixed during Prompt 9

**Case 6 — ACTIVE + reservation window:** Prompt 8 incorrectly treated simultaneous `activeBooking` and `reservationWindowBooking` as `BOOKING_STATE_INCONSISTENT` → `UNKNOWN`. Architecture §15.4 requires **`ACTIVE_RENTED` (priority 4 > 5)**. Fixed in `detectBookingInconsistency`.

---

## Remaining untested edge cases

These are intentionally **out of scope** for Prompt 9 (no DB, prepared inputs only):

| Area | Gap | Planned prompt |
|------|-----|----------------|
| Reservation window calculation | `startOfCalendarDay` in org TZ, window start/end from `booking.startDate` | Input-mapper / query layer |
| `buildBookingContextMap` integration | Real Prisma booking rows → engine input | Later pipeline prompt |
| `ACTIVE_WITHOUT_PICKUP_PROTOCOL` | Fail-closed with readable bookings | Handover query integration |
| `MULTIPLE_ACTIVE_BOOKINGS` | Conflict resolution | Booking aggregation |
| Maintenance during ACTIVE (parallel occupancy) | `bookingContext.activeBooking` + `MAINTENANCE` main status | UI parallel-signals (§15.3) |
| Hard block during ACTIVE | Same as above for `BLOCKED` | §15.3 |
| `parallelSignals` / `currentOccupancy` snapshot fields | Not in engine output yet | API migration prompts |
| Rental readiness chain | Separate from operational state | Health integration |
| Legacy `buildVehicleStateEngineInput` path | Maps all reserved DTO → `reservationWindowBooking` (V1 mapper) | Prompt for window-aware mapper |
| Timezone edge cases | DST transitions, non-Europe/Berlin orgs | Dedicated TZ tests |
| `effectiveFrom` for RESERVED | Uses `pickupAt` proxy, not computed `reservationWindowStart` | After window calc lands |
| Interval bookability (§5) | `INTERVAL_*` codes | Booking conflict layer |
| Persisted raw status migration | `RENTED`/`RESERVED` DB cleanup | Migration prompt |

---

## Running tests

```bash
cd backend
npm test -- --testPathPattern="vehicle-operational-state"
npx tsc --noEmit
```

Expected: all `vehicle-operational-state*.spec.ts` suites green, zero type errors.
