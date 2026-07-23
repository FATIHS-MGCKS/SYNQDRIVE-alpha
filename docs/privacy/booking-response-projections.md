# Booking response projections (V4.9.793)

Explicit response DTOs replace raw Prisma serialization for booking read surfaces.

## DTOs

| DTO | Surface | Purpose |
|-----|---------|---------|
| `BookingListItemDto` | `GET /bookings` (default) | Paginated list rows with lean handover summaries |
| `BookingCalendarItemDto` | `GET /bookings?view=calendar` | Calendar/agenda — no finance/km fields |
| `BookingTimelineItemDto` | `GET /bookings/:id/timeline` | Merged activity/tasks/handover events |
| `BookingDetailDto` | `GET /bookings/:id/detail` | Aggregated booking file |
| `BookingFinanceDto` | Detail section | Price/deposit/invoice aggregates |
| `BookingHandoverDto` | Detail section | Pickup/return sides without signature blobs |
| `BookingAuditDto` | Detail + timeline | Activity log entries |

## Forbidden in list/calendar payloads

- Signature blobs (`*SignatureDataUrl`)
- Storage paths (`objectKey`)
- Stripe/provider refs (`stripe*`, `checkoutUrl`)
- Internal org id
- Free-text `notes`, `insuranceOptions`, `extras` on list rows
- Legacy `dailyRate` scalar

List responses keep backward-compatible `pickupProtocol` / `returnProtocol` keys with **lean stubs** (id, kind, performedAt, odometer, fuel, protocolCompleted only).

## Permission-based redaction (detail)

Resolved via `BookingReadContextService` → `BookingDetailProjectionService`:

| Permission | Effect |
|------------|--------|
| `customers.read` | Full customer PII; otherwise name + id only |
| `invoices.read` / `payments.read` | `finance` section |
| `payments.read` | Full payment card; otherwise summary counts only |
| `payments-settings.manage` | Stripe session/intent/charge ids |
| `booking_eligibility.review` | `rentalEligibility` block |
| `legal-documents-audit.read` / `data-authorization.read` | `audit.items` + timeline endpoint |
| `booking.signature.read` | Signature reference ids on handover sides |

## Customer scope

When `customerScopeId` is set on the authenticated actor, list queries are auto-filtered and detail/timeline return 404 for other customers' bookings.

## Contract tests

`backend/src/modules/bookings/read-model/booking-response.contract.spec.ts` asserts forbidden fields and measurable list payload reduction.
