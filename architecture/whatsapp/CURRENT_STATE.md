# WhatsApp Business — Current State (partial)

## POST-P6-BOUNDARY-PR2

| Consumer | Before | After |
|----------|--------|-------|
| `WhatsAppAiContextService` | `BookingsService.findDetail` | `WHATSAPP_BOOKING_OPERATIONAL_READ_PORT` |
| `WhatsAppConversationContextService` | `BookingsService.findDetail` | port |
| `WhatsAppAiToolsService` | `BookingsService.findDetail` | port |
| `WhatsAppBookingReminderService` | `BookingsService.findDetail` | port |

**Contract:** `WhatsAppBookingOperationalRead` — field set limited to WhatsApp/runtime needs (not full `BookingDetailDto`).