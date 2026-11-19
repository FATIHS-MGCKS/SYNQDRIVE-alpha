# Communication Center — Agent Contract (bootstrap)

- **Domain:** Core platform — do not inject Rental `BookingsService` in Communication providers.
- **Booking facts:** use `COMMUNICATION_BOOKING_SNAPSHOT_READ_PORT` or future narrowly scoped ports.
- **Rental adapters:** live under `bookings/` (composition-root in-process DI).
- **Multi-tenant:** all port calls must pass `organizationId`; adapters must preserve `findDetail` org scoping.