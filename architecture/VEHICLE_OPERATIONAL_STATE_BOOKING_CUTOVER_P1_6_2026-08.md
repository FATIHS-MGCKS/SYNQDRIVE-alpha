# Vehicle Operational State — Booking / Rental Eligibility Cutover (P1.6)

| Field | Value |
|-------|-------|
| **Date** | 2026-08-26 |
| **Slice** | P1.6 — Booking picker / rental eligibility cutover |
| **Prerequisite** | P1.1 contract, P1.2 UI projection, P1.3 Fleet, P1.4 Vehicle Detail, P1.5 Dashboard |
| **Related audit** | `docs/audits/vehicle-operational-state-frontend-consumer-ui-projection-audit-2026-08.md` §U |

## Purpose

Cut booking vehicle eligibility and picker presentation to canonical P0.2 `operationalAvailability`. Remove client timestamp / `onlineStatus` / `isVehicleOffline()` as operational booking gates. Preserve booking-window semantics separately from current Dashboard readiness.

## Canonical path

```
VehicleData (fleet-map store)
  → readBookingOperationalAvailability()
  → evaluateBookingOperationalGate()        # P0.2 pass/fail
  → evaluateBookingVehicleEligibility()     # + business, health, tariff, window, rules
  → resolveBookingVehiclePreflight()        # picker / submit guards
  → VehiclePickerStep / NewBookingView / BookingsView edit
```

## Module location

```
frontend/src/rental/lib/
  booking-vehicle-eligibility.ts            # P1.6 pure eligibility adapter
  booking-vehicle-preflight.ts              # Picker presentation + hard-block mapping
  booking-operational-p1-6-cutover.test.ts  # Truth table + cross-surface
```

## Eligibility domains (conjunction)

| Domain | Authority | Booking rule |
|--------|-----------|--------------|
| **A. Business workflow** | `operationalState` / explicit block | BLOCKED/UNKNOWN/unreliable = fail; MAINTENANCE/RENTED/RESERVED = caution only when otherwise eligible |
| **B. Operational availability** | P0.2 `operationalAvailability` | AVAILABLE = pass; NEEDS_VERIFICATION/UNAVAILABLE/UNKNOWN/absent = fail |
| **C. Booking conflicts** | Interval overlap on vehicle | Independent of operational gate |
| **D. Rental rules** | Station/category/permissions | `rentalRuleBlockReason` when wired |
| **E. Rental health** | `rental_blocked` / unverified | Hard block via rental health API |
| **F. Tariff** | Price catalog | No active tariff = hard block |

## Operational gate invariant

```
operationalAvailability AVAILABLE + telemetry STANDBY/SOFT_OFFLINE/OFFLINE => operational PASS
operationalAvailability AVAILABLE + AUTHORIZATION_REQUIRED/DEVICE_UNPLUGGED => operational PASS (P0.2 decides)
operationalAvailability NEEDS_VERIFICATION/UNAVAILABLE/UNKNOWN/absent => operational FAIL
legacy isVehicleOffline() + canonical AVAILABLE => operational PASS
fresh telemetry + canonical UNAVAILABLE => operational FAIL
```

Connectivity timestamps are **not** independently authoritative for booking eligibility.

## Booking window vs current readiness

Dashboard “Ready to Rent” evaluates **current** operative readiness. Booking picker may evaluate a **future** window:

- `ACTIVE_RENTED` now + non-overlapping future window → may be selectable (caution + conflict check)
- Overlap with incompatible booking → `booking_conflict` domain (precedence #1)

Do **not** equate `isReadyToRent === true` with future bookability.

## Denial reason precedence

1. Booking conflict / requested interval unavailable
2. Explicit business / maintenance / manual block
3. Rental health blocked / unverified
4. Canonical operational UNAVAILABLE
5. Canonical NEEDS_VERIFICATION
6. Operational UNKNOWN / absent
7. No tariff
8. Status unreliable
9. Rental rule restriction

Presentation uses P1.2 projection labels for operational denials (`buildFleetVehicleUiProjection`).

## Create / edit / preflight coverage

| Flow | Adapter |
|------|---------|
| New booking picker (`VehiclePickerStep`) | `resolveBookingVehiclePreflight` |
| New booking step gate / select handler | `isBookingVehicleHardBlocked` |
| Bookings edit modal / inline save | `isBookingVehicleHardBlocked` (operational gate; health when available on create path) |
| Operator booking sheet | Out of scope — operator fleet rows lack `operationalAvailability`; backend authoritative |

UI preflight is **advisory**. Backend `BookingsService` remains authoritative for conflicts and business rules at submit.

## Legacy paths bypassed (Booking P1.6)

- `isVehicleOffline()` — removed from `booking-vehicle-preflight.ts`
- `resolveTelemetryFreshness()` — not used on booking eligibility path
- `onlineStatus` / `lastSignal` / `signalAgeMs` — not used for operational gate
- Dashboard `rentalReadiness` / `vehicleRuntimeStateBuilder` — not imported by booking path

## Remaining P1.7+ consumers

- Notifications offline generation
- Master Admin redesign
- Global legacy helper deletion (`controlSignalsBuilder`, `derivePredictiveOperationsInsights` timestamp paths)
- Operator booking sheet canonical gate (needs fleet-map operational fields on operator vehicle DTO)

## Tests

| Suite | Result |
|-------|--------|
| P1.6 focused | 26/26 |
| booking-vehicle-preflight | 8/8 |
| P1.5 regression | dashboard bundle |
| P1.4–P1.1 regression | unchanged suites |
| Build/typecheck | PASS |
