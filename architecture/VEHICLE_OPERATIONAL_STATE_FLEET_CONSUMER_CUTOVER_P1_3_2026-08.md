# Vehicle Operational State — Fleet List / Map Consumer Cutover (P1.3)

| Field | Value |
|-------|-------|
| **Date** | 2026-08-26 |
| **Slice** | P1.3 — first visible consumer cutover (Fleet list + map only) |
| **Prerequisite** | P1.1 `CanonicalVehicleOperationalView`, P1.2 `VehicleOperationalUiProjection` |
| **Related audit** | `docs/audits/vehicle-operational-state-frontend-consumer-ui-projection-audit-2026-08.md` §R |

## Purpose

Cut over Fleet list row, map HUD, map marker tone, and fleet display helpers to the P1.1 → P1.2 canonical projection path. Preserve business vs operational semantics; remove client timestamp operational derivation on Fleet surfaces.

## Canonical path

```
VehicleData (fleet-map store)
  → vehicleDataToFleetMapResponse()
  → mapFleetMapToCanonicalVehicleOperationalView()
  → mapVehicleOperationalUiProjection()
  → Fleet consumers (row / HUD / marker / display)
```

## Module location

```
frontend/src/rental/lib/
  fleet-vehicle-ui-projection.ts      # VehicleData → P1.2 bridge
  fleet-visual-from-projection.ts     # Map marker / visual state from P1.2
  fleet-p1-3-display.ts               # Availability / health / telemetry display from P1.2
  fleet-operational-p1-3-cutover.test.ts
```

## Consumers migrated

| Consumer | Change |
|----------|--------|
| `FleetOperatorRow` | Passes `uiProjection` to `resolveFleetVehicleDisplayState` |
| `FleetMapVehicleStatusHud` | Same |
| `FleetView` | Builds contexts with locale; geojson uses `getUiProjection` |
| `FleetCommandView` | Passes locale to `buildFleetVehicleContexts` |
| `fleet-operator-panel` | `FleetVehicleContext.uiProjection` required; visual via projection |
| `fleetVehicleDisplay` | Projection path bypasses legacy telemetry/health when `uiProjection` set |
| `fleetVisualState` | Delegates to `deriveFleetVisualStateFromUiProjection` when `uiProjection` set |

## Map marker precedence

Highest first (`fleet-visual-from-projection.ts`):

1. Critical / action-required (`attention` CRITICAL/ACTION_REQUIRED, `UNAVAILABLE`, `DEVICE_UNPLUGGED`, `AUTHORIZATION_REQUIRED`)
2. Operationally unavailable → `blocked`
3. Needs verification → `stale`
4. Active business workflow (rented / reserved / maintenance)
5. Available → `ready` (**standby does NOT downgrade**)
6. Unknown / no data

Connectivity offline map tone only when canonical `overallState === OFFLINE` **and** availability is not explicitly `AVAILABLE`.

## Fleet Command filter semantics

`fleet-command-filters.ts` — tabs remain **business workflow** (`operationalState.status`):

| Tab | Domain |
|-----|--------|
| Available / Reserved / Active / Maintenance / Unknown | Business workflow |
| Attention bucket (operator panel) | Mixed: rental block, health, maintenance urgency, no-location, canonical offline |

Connectivity/offline is **not** derived from `isVehicleOffline()` or timestamp heuristics in P1.3 fleet paths.

## Legacy paths retained (non-fleet callers)

- `deriveFleetVisualState()` without `uiProjection` — legacy timestamp path for tests and non-migrated surfaces
- `resolveFleetVehicleDisplayState()` without `uiProjection` — dashboard/detail/booking unchanged

## Expected visible changes

- Map marker tone may differ when legacy 48h offline heuristic disagreed with P0.2 availability/connectivity
- `AVAILABLE` + canonical `STANDBY` stays `ready` (not offline/stale)
- Health badge shows `—` / non-Gut when `healthEvaluation` absent or not evaluable (no false Gut fallback)
- Fleet filter membership unchanged (business tabs); attention bucket uses canonical connectivity for offline

## Out of scope (P1.4+)

- Vehicle Detail header
- Dashboard / Fleet Readiness KPIs
- Booking picker
- Notifications
- Master Admin redesign
- Global legacy cleanup

## Tests

- `fleet-operational-p1-3-cutover.test.ts` — 19 focused scenarios + legacy conflict + cross-surface
- Regression: P1.1 (29), P1.2 (67), fleet-operator-panel, fleetVisualState, fleetVehicleDisplay
