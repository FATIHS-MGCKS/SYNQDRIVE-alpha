# UX-008 — Operator deep-link contract closeout

**Date:** 2026-11-23  
**Base SHA:** `5b7dd55af` (post #2506)

## Confirmed defect (fixed)

| Defect | Fix |
|--------|-----|
| `resolveOperatorDeepLink` recognized `/operator/scan` but `OperatorApp.tsx` had no `scan` route — wildcard redirected to `/operator` | Registered `<Route path="scan" element={<OperatorShell />} />` |

## Additional hygiene

| Issue | Fix |
|-------|-----|
| Returning to bare `/operator` left stale vehicle/booking focus from prior path deep links | `OperatorDeepLinkBridge` clears focus on home when no query intent |
| `?tab=` non-scan tab left scan-only path focus | Tab intent clears vehicle/booking focus when `tab !== 'scan'` |

## Precedence (unchanged)

1. Path `vehicleId` / `bookingId`
2. Query `vehicleId` / `bookingId`
3. Query `q` (scan search)
4. Query `tab` (whitelist)
5. Path suffix `/scan`

## Regression tests added

- `operator-app-route-matching.test.ts` — `matchRoutes` mirrors `OperatorApp` children
- `OperatorDeepLinkBridge.test.tsx` — vehicle path, `/operator/scan`, home focus clear, tab clear
- `operatorRoutes.test.ts` — `buildOperatorScanPathUrl`

## Verdicts

| Check | Verdict |
|-------|---------|
| Route matching | PASS — includes `/operator/scan` |
| Vehicle deep link | PASS — path → scan tab + vehicle id |
| Booking deep link | PASS — same pattern (resolver tests) |
| Scan route | PASS — registered |
| Tab / query | PASS — existing resolver tests + bridge |
| Unknown path | PASS — `*` → `/operator` replace |
| Guards | UNCHANGED — `OperatorAccessGuard`, device gate |
| Back/Forward | PARTIAL — React Router history; no global operator URL tab sync (documented UX-006) |

## Refresh restoration

Path params (`vehicles/:id`, `bookings/:id`, `/scan`) restore via `OperatorShellProvider` initial `resolveOperatorDeepLink` + bridge on navigation.