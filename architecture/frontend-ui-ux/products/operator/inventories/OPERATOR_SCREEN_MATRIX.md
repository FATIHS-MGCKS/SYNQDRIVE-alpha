# Operator — Screen Matrix (mobile field UI)

**Audited code SHA:** `413175e8ca72355764a3d47936ad7eff78d415aa`  
**Router:** `frontend/src/operator/OperatorApp.tsx` (`/operator`, `/operator/vehicles/:vehicleId`, `/operator/bookings/:bookingId`)  
**Shell:** `frontend/src/operator/OperatorShell.tsx`  
**Device gate:** `frontend/src/operator/hooks/useIsOperatorDevice.ts` → `OperatorDesktopOnlyNotice` (`operator/components/OperatorDesktopOnlyNotice.tsx`)

## Primary tabs (bottom nav)

| Tab id | View | Source path |
|--------|------|-------------|
| today | `OperatorTodayView` | `operator/views/OperatorTodayView.tsx` |
| scan | `OperatorScanView` | `operator/views/OperatorScanView.tsx` |
| vehicles | `OperatorVehiclesView` | `operator/views/OperatorVehiclesView.tsx` |
| tasks | `OperatorTasksView` | `operator/views/OperatorTasksView.tsx` |
| more | `OperatorMoreView` | `operator/views/OperatorMoreView.tsx` |

**Tab chrome:** `operator/components/OperatorBottomNav.tsx`  
**State:** `operator/context/OperatorShellContext.tsx`

## Deep links & query contract (CONFIRMED)

| Entry | Resolution | Source |
|-------|------------|--------|
| `/operator` | default tab in shell | `OperatorApp.tsx` index route |
| `/operator/vehicles/:vehicleId` | `resolveOperatorDeepLink` → `type: vehicle` → activates `scan` tab + vehicle id | `operator/lib/operatorRoutes.ts`, `operator/components/OperatorDeepLinkBridge.tsx` |
| `/operator/bookings/:bookingId` | booking focus on `scan` tab | same |
| `?q=` on `/operator` | scan query | `operator/lib/operatorRoutes.ts` |
| `?tab=` | one of `today` \| `scan` \| `vehicles` \| `tasks` \| `more` | `operator/lib/operatorRoutes.ts` |
| `pathname.endsWith('/scan')` | forces scan tab | `operator/lib/operatorRoutes.ts` |
| unknown path | redirect `/operator` | `OperatorApp.tsx` |

**Builders:** `buildOperatorVehicleUrl`, `buildOperatorBookingUrl`, `buildOperatorScanQueryUrl` in `operator/lib/operatorRoutes.ts`

## Overlay / sheet flows

| Flow | Source |
|------|--------|
| Handover | `operator/handover/OperatorHandoverFlow.tsx` |
| Damage capture | `operator/damages/OperatorDamageCaptureFlow.tsx` |
| Booking sheets | `operator/components/OperatorBookingDetailSheet.tsx`, `operator/bookings/OperatorBookingFormSheet.tsx` |
| AI upload | `operator/ai-upload/OperatorAiUploadFlow.tsx` |
| Tire measure | `operator/tire-measure/OperatorTireMeasureFlow.tsx` |

## Guards & context

| Piece | Source |
|-------|--------|
| Access guard | `operator/components/OperatorAccessGuard.tsx` |
| Loading / denied | `operator/components/OperatorAccessLoadingScreen.tsx`, `operator/components/OperatorAccessDeniedScreen.tsx` |
| Rental org context | `rental/RentalContext.tsx` via `OperatorApp.tsx` |

## Mobile layout (CONFIRMED from shell grep)

- `min-h-[100dvh]`, safe-area `env(safe-area-inset-bottom)` on main + bottom nav
- `max-w-lg` mobile column; widens at `md`
- `OperatorGlassCard` — `operator/components/OperatorGlassCard.tsx`

## States & tests

- Connectivity: `operator/components/OperatorConnectivityBanner.tsx`
- Task card unit test: `operator/tasks/OperatorTaskCard.test.tsx` (**CONFIRMED** test file exists)

## Epistemic summary

| Area | Status |
|------|--------|
| Routing + deep links | CONFIRMED (source read) |
| Handover E2E UI | UNKNOWN (no browser run) |
| Touch target mm audit | UNKNOWN |
| Offline mode | UNKNOWN |