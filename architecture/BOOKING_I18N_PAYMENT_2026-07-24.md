# Booking i18n & payment intent taxonomy (Prompt 32)

Date: 2026-07-24

## Canonical payment intent (wire format)

| Wire value | Prisma enum | DE label (example) | EN label (example) |
|------------|-------------|--------------------|-----------------------|
| `payment_link` | `PAYMENT_LINK` | Zahlungslink per E-Mail | Payment link by email |
| `pay_on_pickup` | `PAY_ON_PICKUP` | Zahlung bei Abholung | Pay on pickup |
| `cash` | `CASH` | Bar | Cash payment |
| `invoice` | `INVOICE` | Rechnung | Invoice / bank transfer |

**Not offered in UI:** `TERMINAL`, `online`, legacy card brands (`Kreditkarte`, etc.)

**Legacy normalization:** Prisma `TERMINAL` → wire `pay_on_pickup`; DB migration normalizes existing rows.

## Frontend modules

- `frontend/src/rental/lib/booking-payment-intent.ts` — stable enum + normalize/parse
- `frontend/src/rental/lib/booking-payment-intent.labels.ts` — i18n labels via `booking.paymentIntent.*`
- `entityMappers.mapApiBooking` — sets `paymentIntent` from API; removes `Kreditkarte` default

## i18n

Planner surfaces (`BookingsPage`, `BookingsToolbar`, `BookingsTableView`, `BookingsTimelineView`, `bookingStatus`) use `useLanguage().t()` with `bookings.*` and `booking.status.*` keys.

Wizard notes use `booking.notes.wizardStationsPayment` template (locale-aware).

## Edit dialog policy

Legacy `BookingsView` edit modal: **payment method select removed** (was never persisted). Insurance still PATCHes when saved.

`BookingEditDialog` (detail dossier): no payment field — intent is not editable post-create in current product scope.

## Backend

- List bookings API returns `paymentIntent` (wire format) via `fromPrismaBookingPaymentIntent`
- Migration `20260724010000_normalize_terminal_payment_intent` — `TERMINAL` → `PAY_ON_PICKUP`

## Tests

```bash
cd frontend && npm test -- booking-payment-intent booking-i18n-payment
```
