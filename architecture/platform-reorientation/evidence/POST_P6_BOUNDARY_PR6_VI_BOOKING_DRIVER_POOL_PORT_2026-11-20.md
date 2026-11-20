# POST-P6-BOUNDARY-PR6 — VI booking driver pool port (V-P1-02)

**Base:** `06f4590a76bfea0c7b41d7a7eb90eaec5d7597d7`

| Layer | Artifact |
|-------|----------|
| Core contract | `vehicle-intelligence/ports/vehicle-intelligence-booking-driver-pool.port.ts` |
| Rental adapter | `bookings/vehicle-intelligence-booking-driver-pool/*` |
| Consumers migrated | `DriverAttributionService`, `TripAttributionService`, `CanonicalTripHydrationBatchLoader` (+ `TripAnalyticsCanonicalService` construction) |

**Removed:** direct `booking-allowed-drivers.util` imports from the three Core consumers.

**Unchanged:** pure util policy in Rental; synchronous resolution; batch query count (one `booking.findMany` for driver pools).

**Retained (type-only):** `BookingDriverPool`, `BookingDriverRole` on port.

**Deferred:** VI direct `prisma.booking` reads outside this util boundary.