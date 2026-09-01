# Battery V2 — API Consumer Authority

**Controller:** `vehicle-intelligence.controller.ts`  
**Reconstruction:** CONFIRMED by method-body trace

| Route | Handler source | Authority | Notes |
|-------|----------------|-----------|-------|
| `GET …/battery-health-summary` | `CanonicalBatteryHealthService.getSummary()` | **CANONICAL** | Preferred entry |
| `GET …/battery-health-detail` | `CanonicalBatteryHealthService.getDetail()` | **CANONICAL** | Full `CanonicalBatteryDto` |
| `GET …/battery-health/latest` | Canonical + `BatteryV2Service.getV2Health()` | **MIXED** | Compat `_canonical` hint |
| `GET …/battery-health/v2` | `BatteryV2Service` + `vehicleLatestState` | **LEGACY** | `battery_features` |
| `GET …/battery-health` | `BatteryHealthService.findByVehicle()` | **LEGACY** | Snapshots |
| `GET …/battery-health/trend` | `BatteryHealthService.getSohTrend()` | **LEGACY** | Trend |
| `GET …/hv-battery-status` | `HvBatteryHealthService` | **COMPAT** | Prefer canonical HV slice |
| `GET …/battery-health/lv-rest-shadow-summary` | `LvRestShadowSummaryService` | **DIAGNOSTIC** | Internal shadow |
| `GET …/battery-health/lv-start-proxy-diagnostic` | `LvStartProxyDiagnosticService` | **DIAGNOSTIC** | Internal |
| `…/battery-reference-capacity` | `VehicleBatteryReferenceCapacityController` | **CANONICAL** | CRUD reference capacity |

## Aggregators (canonical)

| Service | Battery source |
|---------|----------------|
| `RentalHealthService` | `CanonicalBatteryHealthService` + `mapRentalBatteryModule` |
| `HealthSummaryService` | `fetchCanonicalBatterySummarySafe()` |

## Field → source mapping (detail DTO — `CanonicalBatteryDto`)

| User concept | Canonical path | Notes |
|--------------|----------------|-------|
| LV voltage | `liveState.lv.values` / `lv.liveVoltage` | Live vs resting snapshot |
| LV estimated health | `lv.assessment` (not SOH) | Behavioral score |
| HV SOC / energy (live) | `liveState.hv.values.socPercent`, `.currentEnergyKwh` | Live telemetry slice |
| **Live provider SOH signal** | `liveState.hv.values.providerSohPercent` | Raw/unresolved provider % — **not** conflict-resolved |
| **Selected HV SOH** | `hv.providerSoh.percent` | Conflict-resolved; authority in `hv.providerSoh.source` (`PROVIDER` \| `DOCUMENT` \| `MANUAL` \| `CAPACITY_ESTIMATE`) |
| Shadow capacity | `hv.capacityAssessment` | Cross-session shadow |
| Shadow SOH gate | `hv.sohAssessment` | Separate from selected SOH |
| REST features | Shadow measurements / `lv.latestQualifiedRest` | Legacy `battery_features` on v2 route only |

**Important:** `hv.providerSoh` is the canonical DTO carrier for **selected** HV SOH, despite the property name suggesting provider-only evidence. Always read `.source` to determine actual authority.

**Not on `CanonicalBatteryDto`:** `canonical.hv.healthPercent` does not exist. Summary endpoint may expose `healthPercent` at the summary wrapper level — that is a separate projection, not the canonical DTO contract.

## Field → source mapping (summary endpoint)

| User concept | Canonical path | Legacy fallback |
|--------------|----------------|-----------------|
| LV voltage | `liveState.lv` / measurements | `batteryLatest` in detail |
| LV estimated health | `lv.estimatedHealth` (not SOH) | `BatteryV2Service` scoring |
| HV SOC / energy | `liveState.hv` / `hv` | `HvBatteryHealthService` snapshots |
| Selected HV SOH | `hv.providerSoh` (check `.source`) | Legacy pairwise if flag enabled |
| Live provider SOH | `liveState.hv.values.providerSohPercent` | Latest state / evidence raw value |
| Shadow capacity/SOH | `hv.capacityAssessment`, `hv.sohAssessment` | Not user-published by default |

## Gaps

- Not every internal worker path traced to HTTP surface
- Master/admin surfaces — **partial** (rental health tab primary consumer)
- `BAT-V2-GAP-HV-SELECTED-SOH-DTO-NAMING-001` — `providerSoh` field name vs multi-source `.source`
