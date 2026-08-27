# Vehicle Operational State — Frontend Architecture Closure (P1 FINAL)

**Date:** 2026-08-27  
**Baseline main SHA:** `8c5867853357922ca7fe8df7a5353336c14c0e35` (post P1.7 merge)  
**Phase:** P1 FINAL — Global legacy authority cleanup & architecture closure audit  
**PR:** #1339

## Objective

Prove that no productive tenant-facing operational decision derives canonical vehicle state from legacy frontend heuristics (`isVehicleOffline`, timestamp thresholds, legacy `onlineStatus`, legacy `healthStatus` fallbacks).

## Closure verdict

| Gate | Result |
|------|--------|
| Tenant legacy operational authority remaining | **NO** |
| Second readiness authority remaining | **NO** |
| Station Ready / P0.2 consistency | **PASS** |
| Attention ≠ Unavailable | **PASS** |
| Client timestamp connectivity authority (tenant operational) | **NO** |
| Legacy `onlineStatus` authority (tenant operational) | **NO** |
| Legacy `healthStatus` authority (tenant operational) | **NO** |
| P1.1–P1.7 regression | **PASS** |
| Cross-surface operational authority | **PASS** |
| New business semantics introduced | **NO** |
| Vehicle operational state frontend architecture | **CLOSED** |

## Station filter HUD semantics

### `StationFilterOption.ready`

**Meaning:** Count of fleet vehicles in the **business Available workflow** with **P0.2 `operationalAvailability === AVAILABLE`**.

**Authority:** `isStationFilterHudOperationallyReady()` in `dashboard-operational-readiness.ts`:

```
selectOperationalStatus(vehicle) === AVAILABLE
AND isDashboardOperationalAvailabilityReady(vehicle)
```

**Explicitly NOT:** `deriveFleetVisualState().isReady` (map marker presentation).

Ready and Attention are **separate dimensions** — one vehicle may be `ready=1` and `attention=1` simultaneously (e.g. DEVICE_UNPLUGGED + P0.2 AVAILABLE).

### `StationFilterOption.attention`

**Meaning:** Count of vehicles in the Fleet operator Attention bucket (`isFleetAttentionVehicle`).

Uses marker/health/operational urgency signals — **presentation/attention**, not P0.2 availability.

## Operational vs presentation separation

| Dimension | Question answered | Authority |
|-----------|-------------------|-----------|
| **Operational readiness** | Can this vehicle be rented per P0.2 + P1.5? | P0.2 availability, dashboard runtime, booking gate, station ready |
| **Marker / attention** | Should the operator notice this vehicle? | `deriveFleetVisualState` map tone, notifications, station attention |

**Known intentional divergence:** DEVICE_UNPLUGGED + P0.2 AVAILABLE → station ready **yes**, marker blocked **yes**, notification **yes**.

## Dashboard Available popup semantics

**Label:** "Ready" / "Not Ready" (title: "Ready for rental")

**Meaning:** **Ready to Rent** — full P1.5 `deriveIsReadyForRenting` via `isDashboardPopupReadyForRent()` (`vehicleRuntimeStateBuilder`).

Includes: business AVAILABLE, P0.2 AVAILABLE, cleaning Clean, rental health not blocked, runtime blockers — **not** connectivity attention alone.

## Visible behavior report

| Change | Classification | Notes |
|--------|----------------|-------|
| Dashboard Available popup no longer greyed by `isVehicleOffline()` | **A — completion of merged P1.5** | Aligns popup with Ready-to-Rent KPI semantics already merged in P1.5 |
| Station HUD ready count uses P0.2 not marker `visual.isReady` | **A — correction of P1 FINAL blocker** | Fixes second-readiness-authority bug introduced in initial P1 FINAL PR |
| Rendered pixels/counts may differ from pre-P1 state | **Visible alignment = YES** | Accurate — output can differ where legacy heuristics previously contradicted canonical |

**NEW BUSINESS SEMANTICS INTRODUCED:** **NO** — all changes implement already-approved P1.1–P1.7 canonical contracts.

## Production callsite audit (legacy fallback)

### `resolveFleetVehicleDisplayState` (live tenant production)

| Callsite | `uiProjection` |
|----------|----------------|
| `FleetOperatorRow.tsx` | yes (`ctx.uiProjection`) |
| `FleetMapVehicleStatusHud.tsx` | yes |
| `VehicleDetailHeader.tsx` (×3) | yes (`buildFleetVehicleUiProjection`) |
| `vehicle-detail-operational-display.ts` | yes |
| `fleet-operator-panel.ts` (`sortFleetContexts`) | yes |
| `dashboardDrilldownRowDisplay.ts` (handover readiness + reason) | yes (`resolveCanonicalFleetVehicleDisplayState`) |
| `CompactFleetDrawerVehicleRow.tsx` | yes (`resolveCanonicalFleetVehicleDisplayState`) |
| `ActiveRentalDrawerRowCard.tsx` | yes (`resolveCanonicalFleetVehicleDisplayState`) |
| `OperatorVehicleQuickView.tsx` | yes (`resolveCanonicalFleetVehicleDisplayState`) |

**Totals:** live production calls **11** · with canonical `uiProjection` **11** · without **0** (B = 0).

### `deriveFleetVisualState` (live tenant production)

| Callsite | Projection |
|----------|------------|
| `fleet-operator-panel.ts` (`buildFleetVehicleContexts`, attention) | canonical `uiProjection` |
| `fleetVisualState.ts` (`buildFleetMapGeoJson`) | canonical (built internally) |
| `fleetVehicleDisplay.ts` (`resolveCanonicalFleetVehicleDisplayState`) | canonical |
| `fleetVehicleDisplay.ts` line 645 (no-projection fallback) | **0 live consumers** — only tests / direct legacy calls |

**Totals:** live with canonical projection **3 paths** · live no-projection fallback **0**.

### Legacy helper remaining consumers

| Helper | Live tenant operational | Compatibility / display-only |
|--------|-------------------------|------------------------------|
| `isVehicleOffline()` | **0** | Legacy `deriveFleetVisualState` no-projection branch (no live tenant path) |
| `resolveTelemetryFreshness()` | **0** operational | `controlSignalsBuilder` KPI sync buckets; age labels when no `uiProjection` (no live tenant path) |
| `fleetStateBuilder` / `buildFleetBoard` | **0** | `@deprecated` — test-only reference board |
| Legacy `healthStatus` in `resolveFleetVehicleDisplayState` | **0** live handover/fleet paths | Tests + deprecated `fleetStateBuilder` |

**Handover readiness authority:** `resolveCanonicalFleetVehicleDisplayState` → P1.2 `uiProjection` → `healthEvaluation` + P0.2 availability (not legacy `healthStatus` / timestamps).

**Handover reason authority:** same canonical path → `resolveReasonBadgeFromUi` (not legacy `buildReasonBadge`).

Tenant fleet/map/list/detail/booking/dashboard/notification/handover operational paths all pass `uiProjection` or use `resolveCanonicalFleetVehicleDisplayState`.

## Final consumer authority table

| Surface | Business State | Operational Availability | Connectivity | Health | Attention | Legacy Authority Remaining? |
|---------|----------------|--------------------------|--------------|--------|-----------|----------------------------|
| Fleet List | canonical P0.1 | P0.2 via P1.2 | P0.1 runtime | P0.4 evaluability | `attentionState` | **NO** |
| Fleet Map markers | canonical P0.1 | P0.2 via P1.2 | presentation | P0.4 | marker tone | **NO** (presentation) |
| Fleet Station HUD ready | P0.1 Available tab | **P0.2 only** | not a gate | not a gate | separate count | **NO** |
| Vehicle Detail Header | canonical P0.1 | P0.2 via P1.2 | P0.1 runtime | P0.4 evaluability | `attentionState` | **NO** |
| Dashboard Ready to Rent | P0.1 + P0.2 | P0.2 | informational | P0.4 + rental health | canonical attention | **NO** |
| Dashboard Available popup | P0.1 | P1.5 Ready to Rent | not a gate | rental health | — | **NO** |
| Booking Picker | P0.1 | P0.2 gate | not a gate | rental health | — | **NO** |
| Notifications | — | — | `attentionState` | evaluability guards | canonical | **NO** |
| Master Admin | raw DTO | raw | raw | raw | technical | **E — out of scope** |

## Deleted helpers

- `telemetryStateToIssueDraft` — dead code
- `isFleetSignalOutdated` — zero consumers

## Regression evidence

| Suite | Result |
|-------|--------|
| `vehicle-operational-state-p1-final-closure.test.ts` | **21/21** |
| Combined P1.1–P1.7 + operator/dashboard/booking/notification | **400/400** |
| Frontend build (`tsc -b` + vite) | **PASS** |

## Related documents

- `docs/audits/vehicle-operational-state-frontend-consumer-ui-projection-audit-2026-08.md` (§P1 FINAL)
- P1.1–P1.7 architecture cutover records under `architecture/VEHICLE_OPERATIONAL_STATE_*`
