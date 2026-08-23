# P2.2.27 — Operator Vehicle Quick View Open Tasks Localization

**Date:** 2026-08-23  
**Baseline:** `9f87c3d793fa1f8c784df1d03e230c803ae5c740` (PR #1198 / P2.2.26)  
**Pre-flight:** PR #1202 (verdict B — split, QV-G selected)

## Scope (QV-G only)

| Path | Role |
|------|------|
| `operator/components/OperatorVehicleQuickViewTasks.tsx` | Extracted Open Tasks section + task row |
| `operator/lib/operator-vehicle-quick-view-i18n.ts` | Presentation adapter |
| `operator/components/OperatorVehicleQuickView.tsx` | Host wiring (tasks block replaced) |
| `i18n/translations/operator.vehicleQuickView.tasks.{en,de}.ts` | +4 canonical keys |

## Locale flow

`useLanguage().locale` → `OperatorVehicleQuickViewTasks` → `operator-vehicle-quick-view-i18n.ts` for section chrome; reuses `service-task-presentation-i18n` for status/priority and `status.overdue` for overdue chip.

## Machine freeze

- `task.id`, `task.title`, `task.description` unchanged (dynamic data not translated)
- `task.status`, `task.priority`, `task.isOverdue` machine values unchanged
- `task.dueDate` sort semantics unchanged (not rendered in QV-G)
- `openSheet` callbacks unchanged (`task-create`, `task-detail` with same args)
- No expand/collapse in QV-G (N/A)
- Parent Quick View sections outside tasks block unchanged

## Guardrails

`P227_ENFORCE_CLEAN_EXACT` (2 paths) — 0 findings.

## Remaining Quick View residual

~20 scanner findings remain in `OperatorVehicleQuickView.tsx` (header, actions, health, tire entry, footer) — intentional; future QV slices.

## Tests

`operator-vehicle-quick-view-tasks-localization.test.tsx` — EN/DE render, locale switch, navigation, sort order, machine label maps.

## Semantics

Presentation-only. Category E = 0.
