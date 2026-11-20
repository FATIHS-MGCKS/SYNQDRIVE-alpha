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

## CI triage (`65d37229f`)

| Failed job | Workflow | Local repro (`HEAD`) | Assessment |
|------------|----------|----------------------|------------|
| Backend R10 unit tests | Trip FSM PR (paths: `vehicle-intelligence/trips/**`) | `npm run test:trip-fsm:production-readiness:r10` — **98/98 pass** (~23s, `--runInBand`) | Job ran ~45m on Actions then failed with no stored log blob — consistent with runner worker kill / timeout, not assertion failure |
| Backend unit tests | Vehicle Detail PR (`backend/**`) | `npm run test:vehicle-detail:verify:unit` — **65/65 pass** (~38s) | Same pattern as PR4 independent review (parallel Jest on `ubuntu-latest`); no PR6-specific assertion identified |

**Action:** doc-only recommit to re-run workflows; no product-code change for CI flakes.