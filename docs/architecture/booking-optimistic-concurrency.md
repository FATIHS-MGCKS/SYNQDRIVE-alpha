# Booking optimistic concurrency (Prompt 14)

## Version token

`Booking.updatedAt` (`@updatedAt`) is the optimistic-lock token. No separate `version` / `revision` column.

## Contract

All mutating booking commands accept `expectedUpdatedAt` (ISO-8601). The server updates only when the database row still has the same `updatedAt`.

| Route | Method | Body field |
|-------|--------|------------|
| `/organizations/:orgId/bookings/:id` | PATCH | `expectedUpdatedAt` |
| `/organizations/:orgId/bookings/:id` | DELETE (cancel) | `expectedUpdatedAt` |
| `/organizations/:orgId/bookings/:id/no-show` | POST | `expectedUpdatedAt` |
| `/organizations/:orgId/bookings/:id/handover/pickup` | POST | `expectedUpdatedAt` |
| `/organizations/:orgId/bookings/:id/handover/return` | POST | `expectedUpdatedAt` |

## Errors

| HTTP | Code | Meaning |
|------|------|---------|
| 400 | `BOOKING_VERSION_REQUIRED` | `expectedUpdatedAt` missing or invalid |
| 409 | `BOOKING_VERSION_CONFLICT` | Another writer changed the booking; response includes `current` refresh payload |

`current` shape:

```json
{
  "bookingId": "…",
  "updatedAt": "…",
  "status": "CONFIRMED",
  "vehicleId": "…",
  "customerId": "…",
  "startDate": "…",
  "endDate": "…",
  "totalPriceCents": 12000
}
```

## Backend

- `BookingConcurrencyService` — `requireExpectedUpdatedAt`, `optimisticUpdate`, `toRefreshPayload`
- Wired in `BookingsService.update`, `cancel`, `markNoShow`, `BookingsHandoverService.createHandover`

## Frontend

- `bookingMutate` + `handleBookingMutationError` in `frontend/src/rental/lib/booking-version-conflict.ts`
- Callers pass `updatedAt` from the loaded booking/detail DTO
- On success: reload canonical list/detail
- On conflict: keep dialog open, show German refresh toast (no silent last-write-wins)

## Test matrix

- Two concurrent editors → second write gets `409`
- Cancel + edit race → loser gets `409` + `current`
- Pickup + vehicle change race → loser gets `409`
- Retry with stale `expectedUpdatedAt` → `409`
