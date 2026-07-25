# SynqDrive Operator (mobile/tablet web shell)

Mobile/tablet-oriented field-operations surface at `/operator` inside the existing Vite/React SPA.

**Production-readiness note:** This is a **responsive web shell**, not an installable PWA. There is no web app manifest, no service worker, and no offline mutation queue (see `docs/audits/operator-app-production-readiness-2026-07.md`).

## Entry

- Topbar button **Operator** (rental + master apps), visible when `operator.app.access` is granted (`evaluateOperatorAccess` / `canAccessOperatorApp`).
- Desktop: opens modal with copyable `/operator` URL (`OperatorEntryModal` + `OperatorLinkCard`).
- Mobile/tablet: navigates directly to `/operator`.

## Permissions (UX gates)

Frontend gates are **UX only** — backend RBAC remains authoritative.

| Hook / utility | Path | Role |
|----------------|------|------|
| `useOperatorPermissions()` | `hooks/useOperatorPermissions.ts` | Central `can` / `gate` / `gateFor` for all `operator.*` actions |
| `useOperatorGatedSheet()` | `hooks/useOperatorGatedSheet.ts` | Permission-checked `openSheet` |
| `operatorPermissionGate.utils` | `lib/operatorPermissionGate.utils.ts` | Tab/sheet → action mapping, gate merge |
| `OperatorPermissionGate` | `components/OperatorPermissionGate.tsx` | Conditional render (skip data prefetch) |
| `OperatorGatedActionButton` | `components/OperatorGatedActionButton.tsx` | Accessible disabled actions with `title` / `aria-disabled` |

Registry: `lib/operatorPermissions.ts` (aligned with `backend/.../operator-permission.constants.ts`).

## Tabs

| Tab | View | Primary data |
|-----|------|----------------|
| `today` | `OperatorTodayView` | Today pickups/returns, task buckets, blocked vehicles |
| `scan` | `OperatorScanView` | Text search (plate, vehicle, booking ID) |
| `vehicles` | `OperatorVehiclesView` | Fleet list + quick view |
| `tasks` | `OperatorTasksView` | Open tasks (filtered) |
| `more` | `OperatorMoreView` | Shortcuts (booking, AI upload, tire measure) |

## Wired flows (canonical APIs — no duplicate backends)

All write paths go through existing org-scoped REST APIs:

| Flow | UI entry | Backend domain |
|------|----------|----------------|
| Pickup / return handover | `OperatorHandoverFlow` (6 steps) | `POST .../bookings/:id/handover/pickup|return` |
| Damage capture | `OperatorDamageCaptureFlow` | `POST /vehicles/:id/damages` |
| Booking create/edit/cancel/no-show | Booking sheets | `BookingsController` |
| Tasks (list, create, start, complete, …) | Tasks tab + sheets | `TasksController` |
| AI document upload | `OperatorAiUploadFlow` | Document extraction (`uploadSource: operator_app`) |
| Tire measurement | `OperatorTireMeasureFlow` | Vehicle intelligence tire APIs |
| Pickup verification (manual) | `OperatorPickupCheckSheet` | `customerVerification.submitManualPickupCheck` |
| Booking documents | `OperatorBookingDocumentsPanel` | `documents.listForBooking` |

Provider stack in `OperatorShell.tsx`: `OperatorShellProvider` → `OperatorDamageCaptureProvider` → `OperatorHandoverProvider` → `FleetProvider` → `OperatorDataProvider`.

## Device guard (UX only)

`useIsOperatorDevice` treats viewports ≤1280px or coarse pointer as operator devices.  
Development escape: `VITE_ALLOW_OPERATOR_DESKTOP=true` in `.env.local`.

## Security

`canAccessOperatorApp()` and `OperatorAccessGuard` are **frontend gates only** (role, org, rental `businessType`).  
Backend `OrgScopingGuard`, `RolesGuard`, and `PermissionsGuard` remain authoritative.

## Known gaps (not production-ready claims)

| Gap | Location | Acceptance criterion (future) |
|-----|----------|-------------------------------|
| No PWA install/offline queue | No manifest/SW in `frontend/` | Manifest + SW strategy decided; offline mutations queued or copy explicitly says “retry manually” |
| QR scanner | `OperatorScanView.tsx` — text search only | Camera/QR scan opens vehicle/booking or prefills search |
| QR link generator | `OperatorLinkCard.tsx` — copy URL only | Optional QR render for desktop→device handoff |
| Misleading offline sync copy | `OperatorTodayView.tsx` stale banner (offline branch) | Copy aligned with `OperatorConnectivityBanner` (no auto-sync) or real sync implemented |
| AI upload entity resolution | `OperatorAiUploadReview.tsx` — `showEntityResolution={false}` | Parity with rental review panel where entity binding is required |

## Tests

Unit tests under `frontend/src/operator/**/*.test.ts(x)` (payload/utils/components).  
No dedicated Operator Playwright E2E suite in this repo path yet.

## Further reading

- Audit: `docs/audits/operator-app-production-readiness-2026-07.md`
- Document intake entry: `architecture/DOCUMENT_INTAKE_V2_ENTRY_POINTS_2026-07-17.md`
