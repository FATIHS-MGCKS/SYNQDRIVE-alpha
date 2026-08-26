# Vehicle Operational State — Vehicle Detail Header / Connectivity Cutover (P1.4)

| Field | Value |
|-------|-------|
| **Date** | 2026-08-26 |
| **Slice** | P1.4 — Vehicle Detail header + connectivity presentation only |
| **Prerequisite** | P1.1 `CanonicalVehicleOperationalView`, P1.2 `VehicleOperationalUiProjection`, P1.3 fleet bridge |
| **Related audit** | `docs/audits/vehicle-operational-state-frontend-consumer-ui-projection-audit-2026-08.md` §S |

## Purpose

Cut over Vehicle Detail operational/connectivity presentation to the same P1.1 → P1.2 canonical path used by Fleet list/map (P1.3). Fleet row, map HUD, and Vehicle Detail header must agree on availability, connectivity, and health evaluability semantics.

## Canonical path

```
VehicleData (fleet-map store — selected vehicle)
  → mapFleetStoreVehicleToCanonicalVehicleOperationalView()
  → mapVehicleOperationalUiProjection(audience: org_admin)
  → vehicle-detail-operational-display.ts
  → VehicleDetailHeader / VehicleConnectionBadge / VehicleHealthChip / OverviewLiveMapCard badge
```

## Module location

```
frontend/src/rental/lib/
  vehicle-detail-operational-display.ts       # Detail connectivity + fleet display bridge
  vehicle-detail-operational-p1-4-cutover.test.ts
```

Reuses P1.3 helpers: `fleet-vehicle-ui-projection.ts`, `fleet-p1-3-display.ts`, `fleetVehicleDisplay.ts`.

## Consumers migrated

| Consumer | Change |
|----------|--------|
| `VehicleConnectionBadge` | Removed `useVehicleLiveMapStore` + `resolveTelemetryFreshness`; uses `resolveVehicleDetailConnectivityPresentation()` |
| `VehicleHealthChip` | Uses `resolveHealthDisplayFromUi()` when `healthEvaluation` present on vehicle |
| `VehicleDetailHeader` | Readiness chip via `buildFleetVehicleUiProjection()` + `resolveFleetVehicleDisplayState({ uiProjection })` |
| `OverviewLiveMapCard` | Map HUD badge from `resolveVehicleDetailMapTrackingBadge()` — position provenance only |

## Badge semantics (header)

| Dimension | Source |
|-----------|--------|
| Business workflow (readiness dropdown) | Existing manual block / maintenance / business status |
| Operational availability | `ui.availability` via `resolveAvailabilityBadgeFromUi` |
| Connectivity | `ui.connectivity` / critical `overallState` precedence |
| Health evaluability | `ui.health` via `resolveHealthDisplayFromUi` |

`useVehicleLiveMapStore` remains for GPS/map polling only — **not** operational connectivity authority on Vehicle Detail.

## Legacy removed from Vehicle Detail path

- `onlineStatus` operational authority in `VehicleConnectionBadge`
- `resolveTelemetryFreshness()` in header connectivity badge
- Client 24h/48h threshold derivation for operational offline/standby in header badge
- False Gut from legacy `healthStatus` when canonical `healthEvaluation` is present

## Informational timestamps (allowed)

`formatLastTelemetry()` on `connectivityRuntime.lastTelemetryAt` — display only, does not derive operational state.

## Legacy paths retained (other surfaces)

- `useVehicleLiveMapStore` poll fields — GPS/HUD/map position modes
- `resolveTelemetryFreshness`, `isVehicleOffline` — dashboard, booking, notifications unchanged
- Rental-health API modules in Health tab — not broadly rewritten

## Expected visible changes

- Connection badge aligns with Fleet list telemetry/connectivity (e.g. STANDBY not forced Offline on old `lastSeenAt`)
- `AUTHORIZATION_REQUIRED` / `DEVICE_UNPLUGGED` shown even when legacy `onlineStatus=ONLINE`
- Health chip shows evaluability labels (`Eingeschränkt bewertbar`, `Nicht bewertbar`) instead of false Gut
- Overview map tracking badge uses position-mode labels (`live` / last known / signal issue / no tracking); connectivity remains in header badge

### P1.4 semantic hardening (PR #1324 follow-up)

| Fix | Detail |
|-----|--------|
| Map position vs connectivity | `resolveVehicleDetailMapTrackingBadge()` is position-provenance only; no longer reads canonical connectivity |
| Critical visual tone | `toneToDotClass` / `toneToLabelClass` map P1.2 `critical` → `--status-critical` (not `--status-nodata`) |
| i18n | `vehicleDetail.mapBadge.*` keys for position badge labels |

P1.4 tests: **33/33** (added 12 position vs connectivity + critical tone tests).

---

## Remaining consumers (P1.5+)

- Dashboard Fleet Readiness / runtime board
- Booking picker / preflight offline gates
- Notifications generation
- Global legacy helper deletion

## Tests

- `vehicle-detail-operational-p1-4-cutover.test.ts` — 33 focused tests (14 scenarios + 4 legacy conflicts + 3 cross-surface + 12 position/connectivity hardening)
- `connectivity-cross-surface-regression.test.ts` — P1.4 vehicle detail canonical path section
