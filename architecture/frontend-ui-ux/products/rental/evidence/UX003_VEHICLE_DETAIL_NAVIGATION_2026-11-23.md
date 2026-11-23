# UX-003 — Rental vehicle detail navigation

**Date:** 2026-11-23  
**Merge:** [#2502](https://github.com/FATIHS-MGCKS/SYNQDRIVE-alpha/pull/2502) → `1362a7a7e7bb0e69d654285f1827773529733ec6`
**Base SHA:** `b4e2761bb6c9cd5f0a6640a4ee5cd519310b72d4` (post UX-001/002 #2501)
**Verification:** CODE + unit tests; Playwright mobile suite exists (`e2e/vehicle-detail-mobile.spec.ts`) — not re-run in agent (no local app session).

## Information architecture

| Check | Result |
|-------|--------|
| Tab count | **9** (not 8 — baseline/backlog corrected) |
| Sync | `VEHICLE_DETAIL_VIEWS`, `VEHICLE_DETAIL_TAB_KEYS`, `VehicleDetailTab` type aligned |
| Functional tabs preserved | Yes |

## Navigation verdicts (by code + existing Playwright contract)

| Viewport | Verdict | Notes |
|----------|---------|-------|
| Mobile | **COMPLIANT** (post-fix) | Horizontal tab scroller; 44px touch targets; overflow-x on tab rail only |
| Tablet | **COMPLIANT** | Same scroller; desktop density at `sm:` |
| Desktop | **COMPLIANT** | All tabs typically visible; scroll still available |

## Accessibility

| Check | Verdict |
|-------|---------|
| `role="tablist"` / `tab` / `tabpanel` | PASS (`vehicle-detail-a11y.ui.test.tsx`) |
| `aria-controls` / `aria-labelledby` | PASS |
| Roving `tabindex` + arrows/Home/End | PASS (`useRovingTablist`) |
| Focus ring | PASS (`focus-visible:ring` on triggers) |

## Confirmed defect (fixed)

| Defect | Fix |
|--------|-----|
| When `activeTab` changes via view state (e.g. last tabs), selected trigger could remain outside horizontal scroll viewport | `scrollActiveVehicleDetailTabIntoView` on `activeTab` change (matches `CustomerDetailTabBar` pattern) |

## Regression tests added

- `vehicle-detail-tab-scroll.test.ts`

## Not changed

Vehicle context, telemetry binder, permissions, i18n keys, nine tab set, backend.