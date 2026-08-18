# Master Admin Dashboard Render Fix

## Changes

- Fixed infinite re-render on Master Admin default dashboard (`/master?view=dashboard`).
- Root cause: unstable `useSyncExternalStore` snapshot object in `operational-cache.ts`.
- Added stable `OperationalDashboardSnapshot` with monotonic `revision`.
- Added render regression tests with production-shaped operational fixture.

## Architecture

```
GET /api/v1/admin/dashboard/operational
  → operational-cache (stable snapshot + revision)
  → useMasterDashboardOperational (useSyncExternalStore)
  → MasterDashboardView (section render; partial null-safe)
```

Finding `UI-DASH-RENDER-P1-001` — frontend render contract only; backend operational DTO unchanged.
