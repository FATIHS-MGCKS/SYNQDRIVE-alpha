# Rental Health — Agent Contract (bootstrap)

Do not wire DS4 shadow or pre-promotion assessment rows into rental health policy without Tires + Driving Intelligence authority updates and negative tests (see Tires `TIRE-INV-NEUTRAL-FALLBACK-001`).

## Core/VI read boundary (POST-P6-BOUNDARY-PR5)

Vehicle Intelligence consumes canonical vehicle health via `VEHICLE_INTELLIGENCE_RENTAL_HEALTH_READ_PORT` (`VehicleIntelligenceRentalHealthReadAdapter` → `RentalHealthService.getVehicleHealth`). Core VI services must not inject `RentalHealthService` directly.
