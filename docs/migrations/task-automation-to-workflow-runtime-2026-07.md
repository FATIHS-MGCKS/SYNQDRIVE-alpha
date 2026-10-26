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
| `booking.lifecycle.confirmed.prep` | `[System] Buchung vorbereiten` (`BOOKING_PREPARATION`) | `migrated` / `already_migrated` | `enabled`, offsets, `priority`, assignment, checklist → `task.create` config | `migrates fresh organization catalog rules` | `rollbackWorkflowVersion` + `TASK_AUTOMATION_WORKFLOW_RUNTIME_MODE=legacy` |
| `booking.lifecycle.confirmed.pickup` | `[System] Fahrzeugübergabe (Pickup)` (`BOOKING_PICKUP`) | same | same | same | same |
| `booking.lifecycle.active.return` | `[System] Fahrzeugrücknahme (Return)` (`BOOKING_RETURN`) | same | same | same | same |
| `booking.document.package.review` | `[System] Dokumentenpaket prüfen` (`DOCUMENT_PACKAGE_INCOMPLETE`) | same | checklist overrides in `checklistOverrides` | `preserves checklist overrides in task.create action config` | same |
| `invoice.payment.check` | `[System] Zahlungsprüfung Rechnung` (`INVOICE_PAYMENT_CHECK`) | `requires_remediation` when invalid UUID | invoice timing fields | `marks invalid override as requires remediation` | same |
| `vehicle.cleaning.required` | `[System] Fahrzeugreinigung` (`VEHICLE_CLEANING_REQUIRED`) | same | urgent hours (catalog) | `isolates templates per tenant` | same |
| `insight.service_overdue` | `[System] Service überfällig` (`VEHICLE_SERVICE_OVERDUE`) | same | — | `is idempotent on repeated migration` | same |
| `insight.compliance.tuv_overdue` | `[System] TÜV fällig` (`VEHICLE_INSPECTION_TUV_DUE`) | same | — | same | same |
| `insight.compliance.bokraft_overdue` | `[System] BOKraft fällig` (`VEHICLE_INSPECTION_BOKRAFT_DUE`) | same | — | same | same |
| `insight.health.tire_critical` | `[System] Reifen kritisch` (`TIRE_CRITICAL_HEALTH`) | same | — | same | same |
| `insight.health.brake_critical` | `[System] Bremsen kritisch` (`BRAKE_CRITICAL_HEALTH`) | same | — | same | same |
| `insight.health.battery_critical` | `[System] Batterie kritisch` (`BATTERY_CRITICAL_HEALTH`) | same | — | same | same |
| `vendor.repair.ensure` | `[System] Reparatur erforderlich` (`REPAIR_REQUIRED`) | same | — | `deduplicates via findActiveByDedup on repeat execute` | same |
| `legacy-workflow:{workflowId}` | same workflow row (normalized triggers/actions) | `requires_remediation` when unmappable actions | n/a | legacy workflow scan in `migrateLegacyWorkflows` | `rollbackWorkflowVersion` stored on record |

### Scenario coverage (tests)

| Scenario | Spec |
|----------|------|
| Fresh organization | `migrates fresh organization catalog rules` |
| Org with overrides | `preserves org overrides in workflow enabled state` |
| Partially migrated | `continues partial migration without duplicating completed rules` |
| Repeated migration | `is idempotent on repeated migration` |
| Invalid legacy rule | `marks invalid override as requires remediation` |
| Dry-run | `dry-run analyzes without persisting workflow rows` |
| Cutover | `cutover mode skips legacy and executes task.create` |
| Rollback | `rollback to legacy stops workflow writes` |
| Duplicate execution | `deduplicates via findActiveByDedup on repeat execute` |
| Tenant isolation | `isolates templates per tenant`, `rejects cross-tenant vehicle on execute` |

## Cutover readiness

| Gate | Status |
|------|--------|
| Migration service + API | **Ready** — dry-run/execute, audit tables, rollback mapping |
| Feature flag default | **`legacy`** — zero production behavior change until env change |
| Idempotent backfill | **Verified** — 15 tests PASS |
| Shadow validation path | **Ready** — `TASK_AUTOMATION_WORKFLOW_RUNTIME_MODE=shadow` |
| Cutover path | **Ready** — router mutex + dedup keys; staging validation required |
| Legacy code removal | **Not scheduled** — legacy paths remain behind flag until acceptance |

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

`backend/src/modules/workflows/migration/task-automation-workflow-migration.spec.ts` — **15 tests PASS**

```bash
cd backend && npm test -- --testPathPattern=task-automation-workflow-migration
```

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
