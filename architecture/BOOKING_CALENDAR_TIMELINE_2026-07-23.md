# Booking Calendar & Timeline Fixes (V4.9.795)

## Problems fixed

| Issue | Fix |
|-------|-----|
| Week showed 8 days | `zonedWeekRange` ends after exactly 7 org calendar days; timeline markers use `iterHalfOpenZonedDays` with `< end` |
| Browser-local drift | All grid/marker math uses org IANA timezone helpers |
| No timeline navigation | `timelineAnchorDateOnly` + ‹/› controls + arrow-key header |
| Fetch ≠ visible window | `resolvePlannerVisibleRange` shared by hook + page |
| Nested day/booking clicks | Day number and booking chips are sibling controls; `pointerdown` stops propagation |
| Selection conflation | `selectedCalendarDay` and `selectedBookingId` are separate state |
| Week start | `resolveWeekStartsOn(locale)` — Monday (de-DE), Sunday (en-US) |

## Modules

- `frontend/src/lib/datetime/planner-range.ts` — week/month shifts, calendar grid, day iteration
- `frontend/src/rental/lib/bookings-planner-range.utils.ts` — `resolvePlannerVisibleRange`
- `frontend/src/rental/components/bookings/bookingPlannerOverlap.ts` — half-open overlap + clip

## Half-open semantics

- Planner window: `[from, to)` UTC instants
- Booking overlap: `start < windowEnd && end > windowStart`
- Timeline bar clip: omit when `clipEnd <= clipStart`

## Tests

- `planner-range.test.ts` — 7-day week, DST weeks, month/year navigation
- `bookings-planner-range.utils.test.ts` — fetch window per view
- `bookingPlannerOverlap.test.ts` — adjacent bookings, touch propagation
