# Task Automation → Workflow Runtime Migration

**Date:** 2026-07-25  
**Phase:** 7 Prompt 33  
**Status:** Bridge implemented — **cutover default `legacy`** (production-safe)

## Goal

Integrate the stable Task Automation catalog into the canonical Workflow Runtime so predefined task rules are triggered through the shared runtime and the `task.create` action adapter — without rebuilding working logic or creating duplicate tasks.

## Architecture

```
TaskAutomationService.safeUpsert()
        │
        ▼
TaskAutomationExecutionRouterService  ◄── TASK_AUTOMATION_WORKFLOW_RUNTIME_MODE
        │
        ├── legacy  → TasksService.upsertByDedup (unchanged)
        ├── shadow  → legacy + WorkflowActionRegistryExecutor.preview('task.create')
        └── cutover → WorkflowActionRegistryExecutor.execute('task.create') only
                              │
                              ▼
              TaskAutomationWorkflowMaterializerService
                              │
              TaskAutomationWorkflowTemplateService (system OrgWorkflow templates)
```

### Traceability

Each catalog rule (`TaskAutomationCatalogKey`) maps 1:1 to a system workflow template stored in `org_workflows`:

| Field | Purpose |
|-------|---------|
| `isTemplate: true` | Marks as template, not a user-editable workflow |
| `category: task_automation_system` | Filter for system templates |
| `systemMetadata.systemTemplate` | `true` — canonical system marker |
| `systemMetadata.catalogRuleId` | Links to `task-automation-rule.catalog` rule id |
| `systemMetadata.catalogKey` | Links to `TaskAutomationCatalogKey` |
| `systemMetadata.templateVersion` | Bridge template revision |

Admin API (`GET /organizations/:orgId/task-automation/rules`) exposes `workflow.templateId`, `workflow.templateName`, and `runtimeMode` so the existing rules UI points at the same source of truth.

## Runtime modes

| Mode | Env value | Behavior |
|------|-----------|----------|
| **legacy** | `legacy` (default) | Direct `upsertByDedup` only — current production behavior |
| **shadow** | `shadow` | Legacy write + workflow `task.create` **preview** (no duplicate writes) |
| **cutover** | `cutover` | Workflow `task.create` **execute** only — legacy upsert skipped |

```bash
# Shadow validation in staging
TASK_AUTOMATION_WORKFLOW_RUNTIME_MODE=shadow

# Full cutover (after shadow validation)
TASK_AUTOMATION_WORKFLOW_RUNTIME_MODE=cutover

# Rollback
TASK_AUTOMATION_WORKFLOW_RUNTIME_MODE=legacy
```

## Reused components

| Component | Role |
|-----------|------|
| `TaskAutomationService` | Booking/document/repair materialization, timing, outbox |
| `TaskAutomationRuleResolverService` | Org overrides, effective priority/timing/checklist |
| `TasksService.upsertByDedup` | Canonical dedup + checklist (legacy + `task.create` adapter) |
| `WorkflowActionRegistryExecutorService` | Policy-gated preview/execute |
| `TaskCreateActionHandler` v1.2.0 | Catalog dedup keys, checklist, automation metadata |
| `task_automation_outbox` | Durable retry — unchanged; replays route through router (no double-write in shadow/cutover) |

## Double-path prevention

1. **Router mutex:** Only one write path per mode — shadow previews never call `upsertByDedup`.
2. **Catalog dedup keys:** Same `dedupKey` (e.g. `booking:prep:{bookingId}`) in legacy and workflow paths.
3. **Outbox replay:** Outbox worker calls `TaskAutomationService` methods → `safeUpsert` → router; cutover skips legacy.
4. **Workflow event outbox:** Bridge calls registry executor directly (not full engine loop) until Phase 7+ event routing is enabled — avoids parallel workflow-run outbox for the same materialization.

## System templates

All 13 materialization catalog keys have entries in `TASK_AUTOMATION_WORKFLOW_TEMPLATE_CATALOG`:

- `BOOKING_PREPARATION`, `BOOKING_PICKUP`, `BOOKING_RETURN`
- `DOCUMENT_PACKAGE_INCOMPLETE`, `INVOICE_PAYMENT_CHECK`
- `VEHICLE_CLEANING_REQUIRED`, `VEHICLE_SERVICE_OVERDUE`
- `VEHICLE_INSPECTION_TUV_DUE`, `VEHICLE_INSPECTION_BOKRAFT_DUE`
- `REPAIR_REQUIRED`, `TIRE_CRITICAL_HEALTH`, `BRAKE_CRITICAL_HEALTH`, `BATTERY_CRITICAL_HEALTH`

Templates are synced per org on first materialization or admin list via `ensureSystemTemplates`.

## Database

Migration `20260725150000_workflow_system_metadata`:

```sql
ALTER TABLE org_workflows ADD COLUMN IF NOT EXISTS system_metadata JSONB;
CREATE INDEX ... ON org_workflows ((system_metadata->>'catalogKey'))
  WHERE is_template = true AND category = 'task_automation_system';
```

## What is NOT changed

- Existing rule catalog definitions and org override schema
- Task automation outbox schema/worker
- Rental `TaskAutomationRulesSection` UI (reads same admin API, gains `workflow` fields)
- Assignment strategies (catalog field — not yet wired to materialization; unchanged)
- Vehicle cleaning tasks (`VehicleCleaningTaskService` — separate path, future bridge)

## Cutover checklist

- [ ] Deploy with `legacy` (default) — zero behavior change
- [ ] Enable `shadow` in staging; compare shadow log vs legacy tasks
- [ ] Verify booking prep/pickup/return, document package, repair dedup
- [ ] Verify org overrides (priority, timing offsets, checklist)
- [ ] Enable `cutover` in staging
- [ ] Monitor `org_workflow_action_runs` for `task.create` from `task_automation_workflow` provenance
- [ ] Production cutover with instant rollback via env

## Tests

`backend/src/modules/workflows/task-automation-bridge/task-automation-workflow-bridge.spec.ts`:

- Booking task materialization (cutover)
- Due date + priority payload
- Checklist (`withChecklist` + explicit document checklist)
- Org override priority flow
- Deduplication (`findActiveByDedup`)
- Legacy / shadow / cutover / rollback modes
- Tenant-isolated system templates
- Cross-tenant vehicle guard

## Files

| Path | Change |
|------|--------|
| `backend/src/config/task-automation-workflow-runtime.config.ts` | Feature flag config |
| `backend/src/modules/workflows/task-automation-bridge/*` | Bridge module |
| `backend/src/modules/tasks/task-automation.service.ts` | Router integration in `safeUpsert` |
| `backend/src/modules/tasks/automation/task-automation-admin.service.ts` | `workflow` + `runtimeMode` on DTO |
| `backend/src/modules/workflows/actions/handlers/task-create.action-handler.ts` | `withChecklist` support |
| `backend/prisma/migrations/20260725150000_workflow_system_metadata/` | `system_metadata` column |
