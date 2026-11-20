# POST-P6-BOUNDARY-PR4 — AI vehicle booking context read port

**Base:** `f0bc8aacddaf9d5e5b8f79eb23d2ed2708a126a8`

| Layer | Artifact |
|-------|----------|
| Core contract | `ai/ports/ai-vehicle-booking-context-read.port.ts` |
| Rental adapter | `bookings/ai-vehicle-booking-context-read/*` |
| Consumer migrated | `AiGetVehicleBookingContextTool` |

**Removed:** direct `VehicleBookingContextService` injection in Core AI tool.

**Retained (type-only):** `VehicleBookingOperationalContext` in port + tool DTO extension.

**Unchanged:** AI permission gates, evidence builder, Prisma vehicle display enrichment.