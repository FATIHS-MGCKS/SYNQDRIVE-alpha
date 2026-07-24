# Vehicle Detail Page — UI, Terminology & i18n (2026-07)

## Scope

Prompt 26/36: remove DE/EN mixing on the Vehicle Detail Page; wire existing i18n system; no visual redesign.

## Approach

- New `vehicleDetail.*` translation namespace in `en.ts` / `de.ts`
- Central helpers in `vehicle-detail-i18n.ts` for tabs, telemetry states, map badges/hints, cleaning, device connection
- Reuse existing keys: `vehicle.*`, `status.*`, `fleetConnectivity.lastData.live`, `fleetConnectivity.kpi.standby`, `fleetConnectivity.state.OFFLINE`
- Static test validates all `VEHICLE_DETAIL_I18N_KEYS` exist in EN + DE

## Canonical terminology

| Concept | Key(s) |
|---------|--------|
| Live | `vehicleDetail.telemetry.live` (= `fleetConnectivity.lastData.live`) |
| Standby | `vehicleDetail.telemetry.standby` |
| Soft-offline | `vehicleDetail.telemetry.softOffline` |
| Offline | `vehicleDetail.telemetry.offline` |
| No signal | `vehicleDetail.telemetry.noSignal` |
| Last known position | `vehicleDetail.map.badge.lastKnown` / `vehicleDetail.map.hint.lastKnownShown` |
| No data | `vehicleDetail.health.noData` / `common.noData` |
| Cleaning | `status.clean` / `status.needsCleaning` |
| Operational status | `status.*` via existing operational-state helpers |

## Updated surfaces

- Tab bar (`App.tsx`)
- Header back button, cleaning chip/dropdown (`VehicleDetailHeader`)
- Connection + health badges (`VehicleDetailHeaderBadges`)
- Overview map HUD + position badges (`OverviewLiveMapCard`, `overview-map-position` hint keys)
- Device connection card (`VehicleDeviceConnectionCard`)
- Overview aria + freshness hint (`VehicleOverviewTab`, `VehicleOverviewFreshnessHint`)

## Not in scope (follow-up)

- `VehicleHealthBox` full German/English mix (compliance labels)
- `VehicleServiceContextPanel`, `VehicleRequirementsTab` (already DE-consistent)
- `vehicle-overview-cards.utils` quick-card copy (deprecated row)
- `LiveMapOverview` internal fallbacks when used outside vehicle detail
- `telemetryFreshness.ts` inline locale branching (fleet-wide)

## Tests

```bash
cd frontend && npm test -- vehicle-detail-i18n
```
