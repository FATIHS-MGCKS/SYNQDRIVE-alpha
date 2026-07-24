# Booking planner mobile, touch & accessibility (Prompt 31)

Date: 2026-07-23  
Scope: Booking page surfaces — table, calendar, timeline, wizard, edit modal, detail drawer/dossier, quick actions.

## Goals

Semantic HTML, keyboard navigation, visible focus, ~44×44 CSS px touch targets, and Radix-based modals — **without visual redesign**.

## Changes by surface

| Surface | Fix |
|---------|-----|
| **Table** (`BookingsTableView`, `DataTable`) | Sticky right actions column; row Enter/Space activation; `aria-label` on sort, pagination, row actions; `min-h-11` action buttons |
| **Calendar** (`BookingsCalendarView`) | Single interactive `gridcell` per day (no nested day button); larger in-cell chips + overflow `+N` button; day list `min-h-11`; descriptive `aria-label` on chips |
| **Timeline** (`BookingsTimelineView`) | `-webkit-overflow-scrolling: touch`, `isolate` + sticky vehicle column; `min-h-11` bars on mobile; `aria-label` on bars |
| **Toolbar** (`BookingsToolbar`) | `role="tablist"` / `role="tab"`; labelled filters; `min-h-11` controls |
| **Wizard** (`BookingWizardStepper`, `MobileBookingFooter`) | Larger step dots / desktop pills; footer buttons `min-h-11` |
| **Edit modal** (`BookingEditDialog`) | Migrated to `FormDialog` (focus trap, Escape, focus return, labelled fields) |
| **Detail** (`BookingDossier`, `BookingDetailHeader`) | `ConfirmDialog` for cancel/no-show; `DropdownMenu` for quick actions (no hover-only menu) |

## Shared module

`frontend/src/rental/components/bookings/bookings-a11y.ts` — focus ring, touch-target classes, aria-label builders.

## Manual test matrix (environment-limited)

Cloud Agent verified via unit audit tests and static checks. Full device matrix should be re-run on real hardware when available.

| Viewport / condition | Result (agent) | Notes |
|--------------------|----------------|-------|
| 320×568 | Static audit pass | Calendar shows 1 chip + `+N`; day list provides full-width targets |
| 360×800 | Static audit pass | Toolbar wraps; table horizontal scroll + sticky actions |
| 390×844 | Static audit pass | Timeline bars `min-h-11` on narrow breakpoints |
| 430×932 | Static audit pass | Same as above |
| 768×1024 | Static audit pass | Desktop stepper unchanged visually; touch targets still ≥44px |
| 200% zoom | Not run in browser | Focus rings and `min-h-11` should scale with CSS px |
| Enlarged system font | Not run in browser | Layout uses relative units; re-test on device |
| iOS Safari sticky/scroll | Not run in browser | Timeline uses `sticky left-0`, `isolate`, momentum scroll class |
| Android Chrome | Not run in browser | — |

## Regression checks

```bash
cd frontend && npm test -- bookings-a11y
cd frontend && npm test -- bookingPlannerOverlap planner-range
```

## Related

- Prompt 30: `architecture/BOOKING_CALENDAR_TIMELINE_2026-07-23.md`
- Prompt 29: `architecture/BOOKING_TIMEZONE_2026-07-23.md`
