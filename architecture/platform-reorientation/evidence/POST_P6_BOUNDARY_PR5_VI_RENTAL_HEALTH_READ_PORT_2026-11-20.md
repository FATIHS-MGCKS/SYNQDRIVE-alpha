# POST-P6-BOUNDARY-PR5 — VI rental health read port (V-P1-01)

**Base:** `3a6a09f6e217fa755ba4bc323d88a895f103efad`

| Layer | Artifact |
|-------|----------|
| Core contract | `vehicle-intelligence/ports/vehicle-intelligence-rental-health-read.port.ts` |
| Rental adapter | `rental-health/vehicle-intelligence-rental-health-read/*` |
| Consumers migrated | `VehicleHealthTabSummaryService`, `VehicleFileSummaryService` |

**Removed:** direct `RentalHealthService` constructor injection in Core VI consumers (V-P1-01).

**Retained (type-only):** `VehicleHealth`, `HealthState`, `RENTAL_HEALTH_STALE_MS` on Core VI paths — `ALLOWED_IN_PROCESS_TYPE_DEPENDENCY`.

**Composition:** `VehicleIntelligenceModule` imports `VehicleIntelligenceRentalHealthReadModule` (`forwardRef`); adapter `useExisting`; `RentalHealthModule` ↔ VI `forwardRef` cycle unchanged (composition root).

**Out of scope:** V-P1-02 driver-pool util; test harness `RentalHealthService` construction unchanged.