# Battery V2 — API Consumer Authority

**Controller:** `vehicle-intelligence.controller.ts`  
**Reconstruction:** CONFIRMED by method-body trace

| Route | Handler source | Authority | Notes |
|-------|----------------|-----------|-------|
| `GET …/battery-health-summary` | `CanonicalBatteryHealthService.getSummary()` | **CANONICAL** | Preferred entry |
| `GET …/battery-health-detail` | `CanonicalBatteryHealthService.getDetail()` | **CANONICAL** | Full DTO |
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

## Field → source mapping (summary endpoint)

| User concept | Canonical path | Legacy fallback |
|--------------|----------------|-----------------|
| LV voltage | `liveState.lv` / measurements | `batteryLatest` in detail |
| LV estimated health | `lv.estimatedHealth` (not SOH) | `BatteryV2Service` scoring |
| HV SOC / energy | `liveState.hv` / `hv` | `HvBatteryHealthService` snapshots |
| Provider SOH | `hv.providerSoh` | Legacy pairwise if flag enabled |
| Shadow capacity/SOH | `hv.capacityAssessment`, `hv.sohAssessment` | Not user-published by default |
| REST features | Shadow measurements | `battery_features.rest60m/rest6h` on v2 route |

## Gaps

- Not every internal worker path traced to HTTP surface
- Master/admin surfaces — **partial** (rental health tab primary consumer)
