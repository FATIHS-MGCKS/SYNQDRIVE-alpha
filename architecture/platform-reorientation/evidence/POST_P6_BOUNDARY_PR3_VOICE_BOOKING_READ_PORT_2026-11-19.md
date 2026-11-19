# POST-P6-BOUNDARY-PR3 — Voice MCP booking read port

**Base:** `7797a712139b34404fbb981b35e14f1ded6decc4`

| Layer | Artifact |
|-------|----------|
| Core contract | `voice-mcp-gateway/ports/voice-booking-read.port.ts` |
| Rental adapter | `bookings/voice-booking-read/*` |
| Consumers migrated | `VoiceMcpToolsService`, `VoiceMcpWriteToolsService` (read paths) |

**Removed:** direct `BookingsService` injection in the two MCP gateway booking consumers.

**Unchanged:** MCP approval, confirmation, rate limits, write orchestration, audit persistence.

**Residual:** CustomersService, TasksService, document/email services (documented P0 follow-ups in audit #2450).