# Operator — Screen Matrix (mobile field UI)

**Audited SHA:** `413175e8ca72355764a3d47936ad7eff78d415aa`  
**Route base:** `/operator/*` → `OperatorApp.tsx` → `OperatorShell`  
**Device gate:** `useIsOperatorDevice()` — desktop shows `OperatorDesktopOnlyNotice` (CONFIRMED).

## Primary tabs (bottom nav)

| Tab id | View component | Purpose | Epistemic | Source |
|--------|----------------|---------|-----------|--------|
| today | `OperatorTodayView` | day plan / feed | CONFIRMED | `OperatorShell.tsx` |
| scan | `OperatorScanView` | QR/barcode entry | CONFIRMED | |
| vehicles | `OperatorVehiclesView` | fleet quick access | CONFIRMED | |
| tasks | `OperatorTasksView` | work orders | CONFIRMED | |
| more | `OperatorMoreView` | secondary links | CONFIRMED | |

Context: `OperatorShellContext` holds `activeTab`; `OperatorBottomNav` switches tabs.

## Deep links (CONFIRMED)

| Path | Behavior |
|------|----------|
| `/operator` | shell default tab |
| `/operator/vehicles/:vehicleId` | `OperatorDeepLinkBridge` resolves vehicle context |
| `/operator/bookings/:bookingId` | booking handover sheets |
| `*` | redirect `/operator` |

## Overlay / sheet flows (CONFIRMED file inventory)

| Flow | Entry | Shared deps |
|------|-------|-------------|
| Handover | `OperatorHandoverFlow` + steps | Rental `FleetProvider`, patterns |
| Damage capture | `OperatorDamageCaptureFlow` | camera/photo steps |
| Booking sheets | `OperatorBooking*Sheet` | `sonner` toasts |
| AI upload | `OperatorAiUploadFlow` | shared ingestion pattern |
| Tire measure | `OperatorTireMeasureFlow` | field grid UI |

## Guards and access

- `OperatorAccessGuard` + loading/denied screens (`OperatorAccessLoadingScreen`, `OperatorAccessDeniedScreen`).  
- Consumes **RentalProvider** for org context (CONFIRMED coupling to Rental domain context, not Rental chrome).

## Touch / responsive (CONFIRMED)

- `min-h-[100dvh]`, safe-area padding on main + bottom nav (`env(safe-area-inset-bottom)`).  
- `max-w-lg` column on mobile; widens at `md`.  
- `OperatorGlassCard` surface — shared token + local styling.  
- **UNKNOWN:** touch target mm audit, offline mode.

## States

Connectivity banner (`OperatorConnectivityBanner`); task cards with tests (`OperatorTaskCard.test.tsx`) — test evidence **CONFIRMED** for card, not full E2E UI.

## Shared vs Operator-local

| Shared | Operator-local |
|--------|----------------|
| `components/ui/*`, some patterns | `operator/components/*`, handover/damage flows |
| `theme.css` | Bottom nav layout |
| Rental context providers | Shell header |