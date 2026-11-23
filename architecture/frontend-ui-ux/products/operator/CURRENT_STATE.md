# Current State — Operator UI/UX

**Baseline (2026-11-23):** [`../../evidence/FEUX_FINAL_UI_UX_BASELINE_2026-11-23.md`](../../evidence/FEUX_FINAL_UI_UX_BASELINE_2026-11-23.md) (OPUX section).

**Repository SHA:** `413175e8ca72355764a3d47936ad7eff78d415aa` · **Production:** infra VERIFIED @ `1e6a267c`; auth UI **BLOCKED** (P8, no approved session)  
**Scope:** mobile-first field operator at `/operator/*`.

## Executive summary

Operator is a **compact mobile shell** for day-of operations: bottom navigation, sheet-based flows (handover, damage, booking), and deep links into vehicles/bookings. It reuses Rental **data context** (`RentalProvider`, `FleetProvider`) but **not** Rental sidebar chrome — distinct UX authority (OPUX-DEC-MOBILE-SHELL-001).

## Routing and shell

`OperatorApp.tsx` mounts nested routes into one `OperatorShell`. Desktop users see `OperatorDesktopOnlyNotice` unless device heuristic passes (`useIsOperatorDevice`) — CONFIRMED.

Layout stack:

```
OperatorShellProvider → Handover/Damage providers → FleetProvider → OperatorDataProvider
  → Header + main (tab content) + OperatorBottomNav + ActionSheets
```

## Navigation

Five bottom tabs (`today`, `scan`, `vehicles`, `tasks`, `more`) — see [`inventories/OPERATOR_SCREEN_MATRIX.md`](./inventories/OPERATOR_SCREEN_MATRIX.md).

Deep links and `/operator/scan` route: **CONFIRMED** (code + unit tests, UX-008). Production authenticated refresh on device: **INFERRED** (P8 session blocked).

## Touch and motion

Safe-area aware padding; glass cards (`OperatorGlassCard`); sheets for destructive/confirm actions. **UNKNOWN:** haptic feedback, offline queues.

## Flows (CONFIRMED file-backed)

- Multi-step **handover** (`OperatorHandoverFlow` steps: vehicle, condition, damages, documents, signatures, review).  
- **Damage capture** photo pipeline.  
- **Tire measure** grid.  
- **AI upload** review flow.  
- Booking cancel/no-show sheets.

## Shared dependencies

| Dependency | Coupling |
|------------|----------|
| `theme.css` | Global colors/spacing |
| `components/ui` | Buttons, sheets, inputs |
| `sonner` | Toasts top-center |
| Rental contexts | Org/fleet data — **not** Rental layout |

## Guards

`OperatorAccessGuard` wraps routes; dedicated loading/denied screens.

## Tests

`OperatorTaskCard.test.tsx`, `OperatorConnectivityBanner.test.tsx`, `OperatorTodayTaskFeed.test.tsx` — **CONFIRMED** unit-level; not full visual regression.

## UX-004 (2026-11-23)

`OperatorTodayView` — **verified compliant** with shared `EmptyState` / `ErrorState` / `SkeletonRows` and stale/offline banner; no code change in UX-004 PR. See [`../../evidence/UX004_BOOKINGS_OPERATOR_STATE_2026-11-23.md`](../../evidence/UX004_BOOKINGS_OPERATOR_STATE_2026-11-23.md).

## Responsive contract

Main column `max-w-lg` mobile, `md:max-w-none` — intentional phone-first; not equivalent to Rental desktop fleet density.

## Gaps

OPUX-GAP-PROD-001 Production UI; OPUX-GAP-TOUCH-001 formal touch audit UNKNOWN.

## Non-claims

Operator is **not** a shrunken Rental SPA; field workflows are purpose-built. No Figma linkage.

## Deep link and refresh bridges

`OperatorDeepLinkBridge` and `OperatorHandoverRefreshBridge` synchronize path/query with shell state (CONFIRMED). Routes: index + `scan` + `vehicles/:vehicleId` + `bookings/:bookingId` (UX-008). Contract: [`NAVIGATION_URL_CONTRACT.md`](../../governance/NAVIGATION_URL_CONTRACT.md).