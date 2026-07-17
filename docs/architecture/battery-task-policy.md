# Battery Task Policy (V4.9.567)

Automatic battery task materialization on top of the central Task Domain V2 and existing Insight→Task bridge.

## Allowed task intents

| Intent | Title | Task type |
|--------|-------|-----------|
| `battery.task.lv_professional_check` | 12V-Batterie professionell prüfen | `BATTERY_CHECK` |
| `battery.task.warning_light_diagnostic` | Battery-Warnleuchte diagnostizieren | `BATTERY_CHECK` |
| `battery.task.bms_workshop_report` | BMS-/Werkstattbericht hinterlegen | `DOCUMENT_REVIEW` |
| `battery.task.reference_capacity_confirm` | Referenzkapazität bestätigen | `DOCUMENT_REVIEW` |

## Rules

- Task only from actionable alert (`battery-alert.policy`) or confirmed reference-capacity need
- No task from manual measurement alert alone (confirmed evidence path)
- No task from HV shadow capacity gate alone
- Semantic dedup: `battery_task:{vehicleId}:{taskIntent}`
- Legacy dedup `battery_critical:{vehicleId}` documented for migration
- Auto-resolve when triggering condition clears or result confirmed
- Links: `vehicleId`, `alertId`, optional `serviceCaseId`, `documentId`

## Alert → task mapping

| Alert rule | Task intent |
|------------|-------------|
| `battery.alert.warning_light` | `warning_light_diagnostic` |
| `battery.alert.safety_dtc` | `lv_professional_check` |
| `battery.alert.lv_publication_stable` | `lv_professional_check` |
| `battery.alert.workshop_finding` | `bms_workshop_report` |
| `battery.alert.manual_measurement` | *(no task)* |

Reference capacity task is evaluated separately from canonical HV summary (unverified/missing reference, not shadow-only gate).

## Integration

| Module | Role |
|--------|------|
| `battery-task.policy.ts` | `evaluateBatteryTasks()`, `shouldAutoResolveBatteryTask()` |
| `battery-task.service.ts` | Materialization, linking, auto-resolve |
| `insight-task-bridge.service.ts` | Routes `BATTERY_CRITICAL` to `BatteryTaskService` |
| `task-automation-rule.catalog.ts` | `BATTERY_CRITICAL_HEALTH` dedup template |
| `vehicle-battery-reference-capacity.service.ts` | Auto-resolve on verify |

## Auto-resolve

| Intent | When |
|--------|------|
| LV professional check | Alert cleared / publication good / measured OK |
| Warning light | Warning light cleared |
| BMS workshop report | Workshop resolved / document confirmed |
| Reference capacity | Reference verified |

Stale insight tasks still close via `closeStaleInsightTasks` when `battery_task:*` keys disappear from the active run.

Tests: `battery-task.policy.spec.ts`, `battery-task.service.spec.ts`.
