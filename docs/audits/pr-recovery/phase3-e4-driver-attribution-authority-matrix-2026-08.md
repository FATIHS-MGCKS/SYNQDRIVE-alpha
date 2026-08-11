# Phase 3 – E4 Driver Attribution Authority Matrix (2026-08, E4.1A)

Purpose: classify every candidate "driver" source so E4 never conflates the
contract customer, an authorized driver, an assigned driver, and the actual
driver. These roles are kept distinct and are never collapsed.

Classifications: `CONTRACT_CUSTOMER` · `AUTHORIZED_DRIVER` · `ASSIGNED_DRIVER` ·
`ACTUAL_DRIVER` · `UNKNOWN`.

| Source (model.field) | Relation / tenant field | Role classification | Same-tenant proof available? | E4.1A usage |
|---|---|---|---|---|
| `Booking.customerId` → `Customer` | `organizationId` on Booking + Customer | `CONTRACT_CUSTOMER` | Yes (Customer.organizationId) | **Never** used as driver. No customer→driver fallback (`CUSTOMER_AS_DRIVER_FALLBACK_COUNT = 0`) |
| `Booking.assignedDriverId` → `Customer` (rel `BookingAssignedDriver`) | plain id; nested `assignedDriver.organizationId` | `ASSIGNED_DRIVER` | Yes — validated via nested `assignedDriver.organizationId === orgId` | Used for the `BOOKING_CANCELLATIONS` dimension **only when same-tenant**; foreign → UNATTRIBUTED |
| `BookingAllowedDriver.customerId` (role PRIMARY/ADDITIONAL) → `Customer` | `organizationId` on join + Customer | `AUTHORIZED_DRIVER` | Yes | Not used as actual driver in E4.1A (authorization to drive ≠ drove). Deferred |
| `DriverAttribution.driverId` (attributionType CONFIRMED_DRIVER / ASSIGNED_DRIVER) → `Customer` | `organizationId` + `driver` relation | `ACTUAL_DRIVER` (canonical) | Yes (org-scoped; confidence + source recorded) | Canonical actual-driver authority for **trip-level** attribution. Cancelled/no-show bookings have no trip, so not applicable to the current dimensions; full integration deferred to **E4.1B** |
| `DriverAttribution.customerId` (BOOKING_CUSTOMER_ONLY) | — | `CONTRACT_CUSTOMER` | Yes | Not a driver; excluded |
| `DriverAttribution.attributionType` = VEHICLE_ONLY / TIME_WINDOW_MATCH / STAFF_MOVEMENT / UNKNOWN | — | `UNKNOWN` | — | Not treated as a named actual driver |
| `VehicleDamage.customerId` → `Customer` | `organizationId` on damage + Customer | `CONTRACT_CUSTOMER` (liable party) | Yes | **Never** used as actual driver. Damage stays UNATTRIBUTED for driver-specific analytics; still contributes to non-driver cost analytics |
| `BookingHandoverProtocol` (PICKUP/RETURN actor) | via booking | `UNKNOWN` (handover performer, not proven driver) | — | Not used as driver source |
| Trip/telemetry driver mapping (`DriverAttribution` from driving intelligence) | `organizationId` | `ACTUAL_DRIVER` where CONFIRMED | Yes | Canonical for E4.1B trip-level attribution |

## Attribution priority (E4)

1. `DriverAttribution` with `attributionType ∈ {CONFIRMED_DRIVER, ASSIGNED_DRIVER}` and adequate confidence (org-scoped, `driver` same-tenant) — canonical actual driver. *Applies to trip-linked analytics; deferred to E4.1B for the current dimensions which are not trip-linked.*
2. Validated same-tenant `Booking.assignedDriverId` (`assignedDriver.organizationId === orgId`) — assigned driver.
3. Otherwise → **UNATTRIBUTED** (never the contract customer).

The contract customer is never promoted to driver merely because no assigned/actual driver exists. Unattributed events are reported (coverage `excludedRecords`) and are **not** redistributed to named drivers.
