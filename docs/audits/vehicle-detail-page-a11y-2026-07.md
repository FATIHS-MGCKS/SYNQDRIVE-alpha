# Vehicle Detail Page — Accessibility Audit (Prompt 28/36)

**Date:** 2026-07-24  
**Scope:** Vehicle Detail Page (`rental/App.tsx` vehicle-detail chrome + tabs + header + trips filters)  
**Constraint:** No visual redesign; reuse existing Radix/design-system patterns.

## Implemented

| Area | Before | After |
|------|--------|-------|
| Tab bar | `role="tab"` buttons without `aria-controls`, no keyboard roving | `VehicleDetailTabBar` + `useRovingTablist` (Arrow/Home/End, roving `tabIndex`) |
| Tab panels | Content not associated with tabs | `VehicleDetailTabPanel` with `role="tabpanel"` + `aria-labelledby` |
| Header dropdowns | Manual div overlays | Radix `DropdownMenu` (escape, focus return, `aria-expanded`/`aria-haspopup`) |
| Trips filters | Manual toggle divs | `VehicleTripsFilterBar` with Radix `Popover` (date) + `DropdownMenu` (driver) |
| Status changes | No screen reader feedback | Polite `aria-live` region in header |
| Motion | `animate-fade-up` always on | `motion-reduce:animate-none` on header |
| Focus | Partial ring styles | Consistent `focus-visible:ring` on tabs, chips, filters |

## Tests

- Unit: `vehicle-detail-a11y.ui.test.tsx` (static tablist/tabpanel markup)
- E2E: `vehicle-detail-a11y.spec.ts` — tab wiring, keyboard nav, dropdown escape/focus, axe (critical/serious), reduced motion class, 320px + 200% zoom, touch targets

## Deferred

- Full i18n for hardcoded EN tab/filter labels (Prompt 26 branch)
- Modal dialogs (cleaning/status warning) — not converted to Radix Dialog in this pass
- Color-contrast axe rule disabled (shared StatusChip token validation via design QA)

## Files

- `frontend/src/rental/lib/vehicle-detail-a11y.ts`
- `frontend/src/rental/components/vehicle-detail/VehicleDetailTabBar.tsx`
- `frontend/src/rental/components/vehicle-detail/VehicleDetailTabPanel.tsx`
- `frontend/src/rental/components/vehicle-detail/VehicleTripsFilterBar.tsx`
- `frontend/src/rental/components/vehicle-detail/VehicleDetailHeader.tsx`
- `frontend/src/rental/App.tsx`
- `frontend/e2e/vehicle-detail-a11y.spec.ts`
