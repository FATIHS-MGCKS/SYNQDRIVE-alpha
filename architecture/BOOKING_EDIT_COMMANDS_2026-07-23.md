# Booking Edit Command Layer (V4.9.793)

## Shared frontend module

`frontend/src/rental/lib/booking-commands/`

| File | Role |
|------|------|
| `booking-edit-form.types.ts` | Shared form state + baseline types |
| `booking-edit-form.utils.ts` | Detail → baseline/form mapping |
| `booking-edit-form.validation.ts` | Client validation (dates, stations, km) |
| `booking-update.command.ts` | `buildBookingUpdateCommand` — diff-only PATCH |
| `booking-mutation.errors.ts` | `formatBookingMutationError` (overlap, 403, version conflict, pricing quote) |

## Mutation hook

`useBookingMutations()` (`frontend/src/rental/hooks/useBookingMutations.ts`)

- `updateBookingFields(baseline, form)` — validates, PATCH, invalidates list + vehicle ops, no optimistic finance
- `cancelBooking` / `markNoShow` — dedicated status commands only

## Wired entry points

| UI path | Behavior |
|---------|----------|
| `BookingEditDialog` (detail) | Shared form + `updateBookingFields` |
| `BookingDossier` cancel/no-show | `useBookingMutations` |
| `BookingsPage` table cancel | `BookingsView` → `cancelBooking` |
| `OperatorBookingFormSheet` edit | `buildOperatorBookingUpdateFromDetail` → shared command |
| Timeline/calendar/drawer | Read-only navigation → detail edit |

## Post-save contract

1. Await `api.bookings.update|cancel|markNoShow`
2. `invalidateBookingsList()`
3. `invalidateVehicleOperationalAfterBookingChange()` when vehicle context changes
4. Caller `refresh()` on detail / close edit dialog

## Removed duplicate logic

- Dead `BookingsView` edit `FormDialog` (local-only customer/vehicle/payment fields)
- `localEdits` / `localCancelled` optimistic overlays on cancel path

## Tests

`booking-commands.test.ts` — validation, patch diff, vehicle gate, error mapping (version conflict, permission, overlap).
