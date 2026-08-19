# Vehicle Alerts Notification V2 (P2.2B)

**Date:** 2026-08-19  
**Depends on:** P2.2A (`architecture/VEHICLE_ALERTS_CANONICAL_SOURCE_2026-08.md`)

## 1. Canonical source

```
HM / OEM telltales
  → DashboardWarningLightsService (read model)
  → projectVehicleAlertNotifications() (P2.2B projector)
  → VehicleAlertsNotificationAdapter
  → NotificationCoreService (OPEN / RESOLVE / REOPEN)
```

Notification V2 does **not** re-parse HM raw signals or recompute limp/oil policy.

## 2. Three event identities

| Event | conditionCode | Severity | blocksRental |
|-------|---------------|----------|--------------|
| `LIMP_MODE_ACTIVE` | `limp_mode_active` | CRITICAL | true |
| `ENGINE_OIL_LEVEL_LOW` | `engine_oil_level_low` | CRITICAL | true |
| `ENGINE_OIL_LEVEL_HIGH` | `engine_oil_level_high` | WARNING | false |

All: `domain=VEHICLE_HEALTH`, `attentionScope=FLEET_READINESS`, `sourceType=HEALTH_ALERT`, `producerModule=vehicle-intelligence`.

Registry delta: **+3 total**, **+3 FLEET_READINESS**, **0 OPERATIONS** (66/23/43 → 69/26/43).

## 3. ACTIVE / CLEARED / UNEVALUABLE

Per cause, derived from canonical telltale lights only:

- **ACTIVE** → ingest open/reopen
- **CLEARED** → explicit resolve (SUCCESS ingest)
- **UNEVALUABLE** → emit nothing; preserve existing OPEN lifecycle

**UNEVALUABLE ≠ CLEARED.** Stale, provider_error, not_connected, no_event_yet, unsupported, and historical-without-confirmed-OFF never resolve an active notification.

## 4. LOW ↔ HIGH transitions

Separate fingerprints and lifecycles:

- LOW active + fresh HIGH → `ENGINE_OIL_LEVEL_LOW` RESOLVED + `ENGINE_OIL_LEVEL_HIGH` OPEN
- HIGH active + fresh LOW → `ENGINE_OIL_LEVEL_HIGH` RESOLVED + `ENGINE_OIL_LEVEL_LOW` OPEN
- OK/off_confirmed → both oil causes may RESOLVE

## 5. Fingerprints

```
{orgId}|{eventType}|VEHICLE|{vehicleId}|{conditionCode}|v1
```

Examples:

- `org|LIMP_MODE_ACTIVE|VEHICLE|veh|limp_mode_active|v1`
- `org|ENGINE_OIL_LEVEL_LOW|VEHICLE|veh|engine_oil_level_low|v1`
- `org|ENGINE_OIL_LEVEL_HIGH|VEHICLE|veh|engine_oil_level_high|v1`

`attentionScope` is not part of the fingerprint.

## 6. Producer ownership

`VehicleHealthNotificationSyncService` (same path as P2.1 service/compliance):

```
NotificationEvaluationService
  → VehicleHealthNotificationSyncService.syncForOrganization()
      ├── projectVehicleHealthWarnings (existing)
      ├── projectServiceComplianceOverdueNotifications (P2.1)
      └── projectVehicleAlertNotifications (P2.2B)
```

Independent of Business Insights policy enablement.

## 7. Sync / reconciliation

`syncVehicleAlertsWarnings()` ingests only explicit ACTIVE/CLEARED adapter sources.

**No absent-fingerprint sweep** (unlike service compliance / battery / DTC). UNEVALUABLE projections emit no sources, so existing OPEN rows persist until confirmed recovery.

## 8. Why unknown/stale does not resolve

Cause may be missing from projection due to data gaps — not proof of recovery. Only `off_confirmed` (limp/oil OK) or opposite oil severity with fresh evaluable signal counts as CLEARED.

## 9. Delivery policy

- Limp + Oil LOW: `DEFAULT_CRITICAL_DELIVERY`
- Oil HIGH: `DEFAULT_IN_APP_DELIVERY`

## 10. Relationship to Rental Health

Rental Health `vehicle_alerts` module remains aggregate ModuleHealth. Notification causes are projected from the **same** DWL read model, not from `modules.vehicle_alerts.state`.

## 11. No aggregate readiness logic

Does not emit `BLOCKED_VEHICLE`, `VEHICLE_NOT_READY`, or connectivity aggregate events.

## 12. Future dashboard projection

Fleet Readiness UI cutover remains separate (audit YELLOW). Notifications are materialized; dashboard attention split is not in P2.2B scope.

## Snapshot loading note

`VehicleHealthNotificationSyncService` may call `DashboardWarningLightsService` per vehicle in addition to `RentalHealthService.getVehicleHealth()` (which also loads DWL). No cross-module snapshot refactor in P2.2B; HM signal group cache amortizes duplicate reads.
