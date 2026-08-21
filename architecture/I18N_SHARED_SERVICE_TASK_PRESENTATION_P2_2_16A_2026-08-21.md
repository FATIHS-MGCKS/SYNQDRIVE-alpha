# Platform i18n — Shared Service Task Presentation (P2.2.16A)

**Version:** V4.9.938  
**Date:** 2026-08-21  
**Baseline:** `467f47a5` (post–P2.2.15 Vendor Directory)

## Surface

Cross-surface shared service-task presentation utilities consumed by service center, vendor operational tasks, vehicle tasks/detail, and entity task embeds. Does **not** include task timeline sentences (P2.2.16B) or task detail UI shell (P2.2.16C).

## Helper

`lib/tasks/service-task-presentation-i18n.ts`

- `serviceTaskTypeLabel(locale, task)` — locale-aware type label with repair/diagnostics variants
- `serviceTaskTypeLabelForType(locale, type)` — direct ApiTaskType mapping
- `serviceTaskStatusLabel`, `serviceTaskPriorityLabel` — reuse `tasks.filter.status.*` / `tasks.filter.priority.*`
- `serviceBoardColumnLabel`, `serviceBoardEmptyLabel`
- `serviceVehicleLabel`, `serviceContextVehiclePrefix`
- Machine exports: `SERVICE_TASK_TYPE_VALUES`, `SERVICE_TASK_STATUS_VALUES`, `SERVICE_TASK_PRIORITY_VALUES`

## Machine config

`rental/lib/service-task-semantics.ts` — machine-only after P2.2.16A:

- `isServiceMaintenanceTask`, `boardColumnForTask`, `SERVICE_BOARD_COLUMN_IDS`
- `preferredVendorsForVehicle`, `checklistProgress`, `formatCostCents`, `taskSourceLabel`
- Removed: `TASK_*_LABEL_DE`, `taskTypeLabel()` without locale, `buildVehicleLabel()`, `SERVICE_BOARD_COLUMNS` with inline labels

## Keys

+13 EN+DE canonical keys (7720→7733):

- `tasks.type.repairDamage`, `tasks.type.diagnostics`
- `tasks.serviceBoard.*` (6)
- `tasks.vehicleLabel.*` (2)
- `tasks.context.vehiclePrefix`
- `tasks.entity.loadError`, `tasks.entity.duePrefix`

Reused: all `tasks.type.*`, `tasks.filter.status.*`, `tasks.filter.priority.*`, `tasks.vehicleStatus.overdue`

## Guardrails

**P2.2.16A enforce-clean exact (17 paths)** — 0 findings (see scanner `P216A_ENFORCE_CLEAN_EXACT`).

Blind-spot guards: no `TASK_TYPE_LABEL_DE` in `service-task-semantics.ts`; adapter uses `TranslationKey` maps only.

## Shim

Unchanged (29 total; 0 new compat consumers).

## Tests

`lib/tasks/service-task-presentation-localization.test.tsx` (9) — EN/DE type labels, no German leakage under EN, P216A inventory guard.

## Semantics

ApiTaskType/Status/Priority, board column ids, filter values, API payloads unchanged. Presentation only.
