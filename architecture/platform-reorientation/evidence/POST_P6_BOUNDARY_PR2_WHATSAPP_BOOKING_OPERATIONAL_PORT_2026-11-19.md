# POST-P6-BOUNDARY-PR2 — WhatsApp booking operational read port

**Base:** `9fef3a9fa2c3b8d5abf3d3e44947e303574b16d1`

| Layer | Artifact |
|-------|----------|
| Core contract | `whatsapp/ports/whatsapp-booking-operational-read.port.ts` |
| Rental adapter | `bookings/whatsapp-booking-operational-read/*` |
| Consumers migrated | 4 WhatsApp services |

**Removed:** direct `BookingsService` injection in WhatsApp module consumers.

**Residual:** document bundle, damages, prisma booking lookup for active-booking resolution.