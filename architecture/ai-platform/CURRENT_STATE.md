# AI Platform — Current State (partial)

## POST-P6 boundary PR4 (2026-11-19)

| Consumer | Before | After |
|----------|--------|-------|
| `AiGetVehicleBookingContextTool` | `VehicleBookingContextService` | `AI_VEHICLE_BOOKING_CONTEXT_READ_PORT` |

AI execution guards unchanged (`assertAiToolExecutionAllowed`, booking/vehicle/customer access).