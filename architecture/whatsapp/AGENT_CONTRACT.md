# WhatsApp Business — Agent Contract (bootstrap)

- **Domain:** Core — inject `WHATSAPP_BOOKING_OPERATIONAL_READ_PORT`, not `BookingsService`.
- **Customer contact on port:** phone/fullName/customerId for **proactive reminders only** — do not broaden without governance review.
- **Rental adapter:** `bookings/whatsapp-booking-operational-read/` (in-process DI).