# Battery V2 — Consumer Decision Surfaces (Phase 3)

**Reconstruction maturity:** SUBSTANTIAL (primary paths traced; master live battery UNCONSUMED)

## Decision surface definition

For each consumer: what battery authority is read, what gate/threshold applies, what side effect occurs, and whether the result is user-visible.

## Canonical read surfaces

| Surface | Authority | Input | Gate | User-visible result |
|---------|-----------|-------|------|---------------------|
| `battery-health-summary` | **CANONICAL** | `CanonicalBatteryHealthService.getSummary` | `isEv`, freshness | Health tab, vehicle box |
| `battery-health-detail` | **CANONICAL** | Full `CanonicalBatteryDto` | same | Detail cards |
| `RentalHealthService` | **CANONICAL** | Summary + `mapRentalBatteryModule` | readiness flag | Module badge, rental block |
| `HealthSummaryService` / AI Health Care | **CANONICAL** | `fetchCanonicalBatterySummarySafe` | — | Agent narrative input |
| `VehicleOperationalProjection` | **CANONICAL** | Rental health `modules.battery` | — | Fleet row evidence |

## Alerts, tasks, notifications (parallel channels)

| Surface | Authority | Policy | Side effect | ≠ rental block? |
|---------|-----------|--------|-------------|-----------------|
| `BatteryCriticalDetector` | **CANONICAL** | `evaluateBatteryAlerts` | Dashboard insight | Yes |
| `BatteryTaskService` | **CANONICAL** | `evaluateBatteryTasks` | `orgTask` upsert | Yes (`blocksVehicleAvailability: false`) |
| `VehicleHealthNotificationSync` | **CANONICAL** | Rental health module projection | Notification V2 event | Separate from insights |
| `evaluateBatteryReadiness` | **CANONICAL** | STABLE pub + evidence | `rental_blocked` | Only when readiness flag ON |

**Phase 3 finding:** Three parallel user-visible channels (insights, notifications, tasks) share canonical upstream data but use **different policy layers**.

## Legacy / mixed / diagnostic

| Surface | Class | Notes |
|---------|-------|-------|
| `battery-health/v2` | **LEGACY** | `battery_features` |
| `battery-health/trend` | **LEGACY** | Snapshots |
| `battery-health/latest` | **MIXED** | Canonical + legacy compat |
| `hv-battery-status` | **COMPAT** | Prefer canonical HV slice |
| LV rest shadow summary | **DIAGNOSTIC** | Internal |
| Master `HealthTrackingView` | **DIAGNOSTIC** | Architecture docs only |
| Master live battery panel | **UNCONSUMED** | No `useBatteryHealthQuery` |

## Frontend (rental — CONFIRMED)

| Component | Authority |
|-----------|-----------|
| `useBatteryHealthQuery` / `useHealthTabBatteryData` | **CANONICAL** |
| `BatteryLv/HvSummaryCard`, view-models | **CANONICAL** |
| `FleetConditionView` | **CANONICAL** |
| Dashboard insights / action queue | **MIXED** (insights + notifications) |

## Operator

| Component | Class |
|-----------|-------|
| `useOperatorOperationalAlerts` | **CANONICAL** (insights feed) |
| Operator battery health panel | **UNCONSUMED** |

## Missing-data behavior

Canonical consumers use `dataQuality` slices and freshness bundles — per-field in view-model builders. Shadow assessments do not auto-publish; UI should not show shadow % as workshop SOH.

## Gaps

- `BAT-V2-GAP-CONSUMER-READ-001` — refined: master/operator live battery **UNCONSUMED**; not UNKNOWN for rental primary path
- Insight → Notification V2 live ingest for `BATTERY_CRITICAL` — mapper exists; runtime uses rental-health sync instead
