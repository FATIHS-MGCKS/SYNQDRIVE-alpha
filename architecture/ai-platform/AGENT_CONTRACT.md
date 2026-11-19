# AI Platform — Agent Contract (partial)

- **Domain:** Core — inject `AI_VEHICLE_BOOKING_CONTEXT_READ_PORT`, not `VehicleBookingContextService`.
- **Retained type-only dependency:** `VehicleBookingOperationalContext` from Rental types file (port return shape + `AiGetVehicleBookingContextData` extension); classification **`ALLOWED_IN_PROCESS_TYPE_DEPENDENCY`** per P4 shared-type precedent; no Rental service import in Core tools.
- **Privacy:** `includeCustomerDisplayName` only when `assertAiCustomerDataAccess` passes — unchanged.
- **Promotion:** AI Platform remains `AUDIT_IN_PROGRESS` until promotion gate is met.