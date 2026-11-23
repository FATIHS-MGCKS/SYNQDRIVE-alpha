# UX-004 — Bookings planner & Operator Today state consistency

**Date:** 2026-11-23  
**Scope:** Rental `BookingsPage` + Operator `OperatorTodayView` (presentation only)  
**Status:** IMPLEMENTED (repository); not merged/deployed by this record alone.

## Confirmed defects (pre-remediation)

| Surface | Issue | Severity |
|---------|--------|----------|
| Rental bookings planner | Primary loading used custom `loader-2` spinner instead of shared `SkeletonRows` | P1 |
| Rental bookings planner | Fatal fetch error replaced entire surface; no partial-error path when list cache exists | P1 |
| Rental bookings planner | Empty state did not distinguish **zero bookings** vs **zero filter matches** (copy only implied filters) | P2 |
| Rental bookings planner | Custom inline error banner duplicated `ErrorState` retry layout | P2 |
| Rental bookings planner | Background reload did not signal refresh while keeping visible rows | P2 |
| Operator Today | — | **Already compliant** (see below) |

## Remediation applied

### Rental (`BookingsPage` + `BookingsView`)

- Introduced `bookingsPageState.utils.ts` — pure decisions for initial loading, fatal vs partial error, empty dataset vs filter-empty, view visibility.
- **Initial loading:** `SkeletonRows` (no spinner).
- **Fatal error:** shared `ErrorState` + existing retry copy when no cached rows.
- **Partial error:** compact `ErrorState` above cached planner content (timeline/table/calendar).
- **Empty:** `bookings.noBookings` vs `bookings.planner.emptyTitle` via `bookingsPlannerEmptyVariant`.
- **Refresh:** `listRefreshing` from `BookingsView.loadBookings` when cache exists; status line + table `loading={refreshing}`.

### Operator (`OperatorTodayView`)

No code changes. Verified existing pattern stack:

| State | Pattern |
|-------|---------|
| Initial loading | `SkeletonRows` when no renderable snapshot |
| Fully empty day | `EmptyState` compact |
| Fatal error | `ErrorState` when error and no renderable content |
| Partial bookings error | Secondary `ErrorState` compact; main feed preserved |
| Offline/stale | `OperatorTodayStaleBanner` with retry |
| Populated | Task feed + handover sections unchanged |

Decision helpers in `operatorTodayView.utils.ts` already encode loading vs fatal error vs stale banner (covered by unit tests).

## Tests added

- `bookingsPageState.utils.test.ts`
- `BookingsPage.ui.test.tsx` (initial skeleton, fatal/partial error, empty variants, refresh banner)

## Regression targets (manual / CI)

- Rental: Vitest suites above + `npm run build`
- Operator: existing `operatorTodayView.utils.test.ts`

## Backlog

UX-004 → **DONE** in `UI_UX_IMPROVEMENT_BACKLOG_2026-11-23.md`. Next: UX-005.