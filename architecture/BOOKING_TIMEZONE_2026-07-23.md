# Booking Timezone Strategy (V4.9.794)

## Source of truth

| Layer | Rule |
|-------|------|
| **Persistence** | All booking instants (`startDate`, `endDate`, handover `performedAt`) stored as UTC ISO-8601 |
| **Org profile** | `Organization.timezone` (IANA, default `Europe/Berlin`) + `language` for display locale |
| **Local input** | Date (`YYYY-MM-DD`) + time (`HH:mm`) or datetime-local values interpreted in **org timezone**, never browser timezone |
| **List windows** | Half-open `[from, to)` overlap filter on the bookings list API |

Browser timezone is never used as business truth. Users in a different browser timezone see org-wall-clock digits in inputs; parsing uses org IANA zone.

## Frontend module

`frontend/src/lib/datetime/`

- `org-timezone.ts` — `resolveOrgTimezone`, `resolveOrgLocale`, `DEFAULT_ORG_TIMEZONE`
- `zoned-instant.ts` — `zonedDateOnly`, `zonedStartOfDayToUtc`, `composeZonedDateTimeToUtc`, half-open ranges
- `booking-datetime.ts` — booking-specific helpers (`bookingLocalDateTimeToIso`, `formatBookingDateTime`, …)
- `useOrgTimezone` hook — loads org profile once per orgId (cached)

### DST handling (`composeZonedDateTimeToUtc`)

- **Spring forward (non-existent local time):** advance to next valid local minute on the same calendar day
- **Fall back (ambiguous hour):** first occurrence (earlier UTC instant)
- **Start of day:** minute scan (mirrors backend `tariff-instant.util.ts`)

## Wired surfaces

| Surface | Change |
|---------|--------|
| New booking wizard (`PeriodStep`, `NewBookingView`) | `todayMin` + ISO composition via org TZ |
| Booking edit (`booking-edit-form`, `BookingEditDialog`, operator sheets) | datetime-local ↔ UTC via org TZ |
| Planner (`useBookingsPlannerData`, `BookingsPage`) | visible `[from, to)` ranges in org TZ |
| Calendar (`BookingsCalendarView`) | day buckets via `zonedDayRange` + half-open overlap |
| Timeline | receives org-zoned `rangeStart` / `rangeEnd` from parent |
| Detail (`bookingDetailUtils`) | `formatDateTime` uses org TZ + locale |
| Handover (`HandoverProtocolDialog`) | optional `performedAt` parsed in org TZ |
| Create payload (`buildBookingCreatePayload`) | requires `timeZone` param |

## API documentation

`GET /api/v1/organizations/:orgId/bookings`

- `from` — inclusive UTC lower bound; filter window is half-open `[from, to)`
- `to` — exclusive UTC upper bound
- Overlap semantics: `startDate < to AND endDate >= from`

Booking create/update bodies accept absolute UTC ISO instants for `startDate` / `endDate`. Clients must convert org-local wall clock to UTC before sending.

## Tests

`frontend/src/lib/datetime/booking-datetime.test.ts` — Europe/Berlin, Europe/London, UTC, midnight, DST spring/fall, half-open intervals, browser-independent parsing.

## Backend reuse

Existing backend utilities unchanged:

- `tariff-instant.util.ts` — `zonedDateOnly`, `zonedStartOfDayToUtc`, `parseBookingInstant`
- `booking-day-window.util.ts` — org calendar day for today pickups/returns
