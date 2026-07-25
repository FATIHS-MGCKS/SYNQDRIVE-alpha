# Task Automation → Workflow Runtime Migration

**Date:** 2026-07-25  
**Phase:** 11 Prompt 48  
**Status:** Migration service implemented — **runtime default `legacy`** (production-safe)

## Goal

Controlled, idempotent migration of existing Task Automation catalog rules (plus org overrides) and legacy workflow UI rules into per-organization **system workflow templates** backed by the canonical Workflow Runtime — without duplicate task execution and without overwriting operator customizations.

## Architecture

```
TaskAutomationService.safeUpsert()
        │
        ▼
TaskAutomationExecutionRouterService  ◄── TASK_AUTOMATION_WORKFLOW_RUNTIME_MODE
        │
        ├── legacy  → TasksService.upsertByDedup (unchanged)
        ├── shadow  → legacy + WorkflowActionPreview (no duplicate writes)
        └── cutover → WorkflowActionExecutor task.create (legacy upsert skipped)
                              │
                              ▼
              TaskAutomationWorkflowMaterializerService
                              │
              TaskAutomationWorkflowTemplateService (system OrgWorkflow templates)

TaskAutomationWorkflowMigrationService (backfill / idempotency / audit)
        │
        ├── catalog rules → system templates + override mirror
        ├── legacy OrgWorkflow rows → canonical trigger/action normalization
        └── task_automation_workflow_migration_records (rollback mapping)
```

## Runtime modes

| Mode | Env value | Behavior |
|------|-----------|----------|
| **legacy** | `legacy` (default) | Direct `upsertByDedup` only — current production behavior |
| **shadow** | `shadow` | Legacy write + workflow **preview** (no duplicate writes) |
| **cutover** | `cutover` | Workflow `task.create` **execute** only — legacy upsert skipped |

```bash
# Shadow validation in staging
TASK_AUTOMATION_WORKFLOW_RUNTIME_MODE=shadow

# Full cutover (after shadow validation)
TASK_AUTOMATION_WORKFLOW_RUNTIME_MODE=cutover

# Rollback
TASK_AUTOMATION_WORKFLOW_RUNTIME_MODE=legacy
```

## Migration API

`POST /organizations/:orgId/task-automation/workflow-migration/run`

```json
{ "mode": "dry-run" }
{ "mode": "execute", "forceBaselineSync": false }
```

- `GET .../workflow-migration/latest` — last run stats + details
- `GET .../workflow-migration/records` — per-rule mapping rows (rollback)

## Mapping table

| Legacy Rule | New Template | Status | Override | Test | Rollback |
|-------------|--------------|--------|----------|------|----------|
| `booking.lifecycle.confirmed.prep` | `[System] Buchung vorbereiten` (`BOOKING_PREPARATION`) | Migrated on execute; idempotent via migration records | `enabled`, timing offsets, `priority`, assignment, checklist → workflow `enabled` + `task.create` config | `migration.spec.ts` fresh org + overrides | `rollbackWorkflowVersion` + env `legacy` |
| `booking.lifecycle.confirmed.pickup` | `[System] Fahrzeugübergabe (Pickup)` | same | same | same | same |
| `booking.lifecycle.active.return` | `[System] Fahrzeugrücknahme (Return)` | same | same | same | same |
| `booking.document.package.review` | `[System] Dokumentenpaket prüfen` | same | checklist items preserved in payload path | explicit checklist test | same |
| `invoice.payment.check` | `[System] Zahlungsprüfung Rechnung` | same | invoice timing fields | invalid UUID → `requires_remediation` | same |
| `vehicle.cleaning.required` | `[System] Fahrzeugreinigung` | same | urgent hours (catalog) | tenant isolation | same |
| `insight.service_overdue` | `[System] Service überfällig` | same | — | repeated migration idempotent | same |
| `insight.compliance.tuv_overdue` | `[System] TÜV fällig` | same | — | same | same |
| `insight.compliance.bokraft_overdue` | `[System] BOKraft fällig` | same | — | same | same |
| `insight.health.tire_critical` | `[System] Reifen kritisch` | same | — | same | same |
| `insight.health.brake_critical` | `[System] Bremsen kritisch` | same | — | same | same |
| `insight.health.battery_critical` | `[System] Batterie kritisch` | same | — | same | same |
| `vendor.repair.ensure` | `[System] Reparatur erforderlich` | same | — | cutover dedup test | same |
| `legacy-workflow:{workflowId}` | same workflow row (normalized triggers/actions) | `requires_remediation` when unmappable actions | n/a | legacy workflow scan | `rollbackWorkflowVersion` |

## Traceability fields

| Field | Purpose |
|-------|---------|
| `org_workflows.system_metadata` | System template marker + catalog linkage |
| `systemMetadata.systemTemplate` | `true` |
| `systemMetadata.catalogRuleId` | Legacy rule id |
| `systemMetadata.catalogKey` | `TaskAutomationCatalogKey` |
| `systemMetadata.userCustomized` | Skip overwrite on re-migration |
| `task_automation_workflow_migration_records.legacy_rule_id` | Rollback key |
| `task_automation_workflow_migration_records.workflow_id` | New WorkflowDefinition id |
| `task_automation_workflow_migration_records.rollback_workflow_version` | Version before migration |

## Double-path prevention

1. **Router mutex:** Only one write path per mode — shadow previews never call `upsertByDedup`.
2. **Catalog dedup keys:** Same `dedupKey` in legacy and workflow paths; `findActiveByDedup` short-circuits cutover.
3. **Outbox replay:** Routes through `safeUpsert` → router (cutover skips legacy).
4. **Migration idempotency:** Unique `(organizationId, legacyRuleId)` — repeated runs → `already_migrated`.

## Cutover checklist

- [ ] Deploy with `legacy` (default) — zero behavior change
- [ ] Run migration `dry-run`, review `requires_remediation`
- [ ] Run `execute` migration per org
- [ ] Enable `shadow` in staging; compare shadow log vs legacy tasks
- [ ] Verify booking prep/pickup/return, document package, repair dedup
- [ ] Verify org overrides (priority, timing offsets, checklist)
- [ ] Enable `cutover` in staging
- [ ] Production cutover with instant rollback via env

## Tests

`backend/src/modules/workflows/migration/task-automation-workflow-migration.spec.ts`

## Files

| Path | Change |
|------|--------|
| `backend/prisma/migrations/20260725180000_task_automation_workflow_migration/` | `system_metadata` + migration audit tables |
| `backend/src/config/task-automation-workflow-runtime.config.ts` | Feature flag |
| `backend/src/modules/workflows/task-automation-bridge/*` | Bridge + templates |
| `backend/src/modules/workflows/migration/*` | Backfill service + admin API |
| `backend/src/modules/tasks/task-automation.service.ts` | Router integration |
| `backend/src/modules/workflows/workflow-action-executor.service.ts` | Catalog `task.create` support |

## What is NOT changed

- Task automation catalog definitions and org override schema (legacy path remains)
- Task automation outbox schema/worker
- Legacy code paths are feature-flagged, not deleted
