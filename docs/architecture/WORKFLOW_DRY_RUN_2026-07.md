# Workflow Dry Run — Execution Plan Mode

**Status:** Accepted (2026-07)  
**ADR:** `docs/architecture/ADR-WORKFLOW-AUTOMATION-RUNTIME-2026-07.md`  
**Remediation:** WR-P0-007 (accelerated to Phase 2, Prompt 4)

## Problem

`POST /organizations/:orgId/workflows/:id/test` previously called `WorkflowEngineService.executeWorkflow()` in LIVE mode. That created real `OrgWorkflowRun` records and executed actions (tasks, vehicle updates, approval rows) — unacceptable for simulation.

## Solution

Introduce an explicit **execution mode** with two values:

| Mode | Purpose | Side effects |
|------|---------|--------------|
| `DRY_RUN` | Simulation, manual test, UI preview | **None** — returns execution plan only |
| `LIVE` | Production event processing | Full persistence and action execution |

Safe-by-default: internal helpers default to `DRY_RUN` when mode is omitted (`resolveExecutionMode`). LIVE mode must be passed explicitly and is guarded by `assertLiveExecution()`.

## API

### Dry run (preferred)

```
POST /api/v1/organizations/:orgId/workflows/:id/dry-run
Body: { payload?, entityType?, entityId? }
Response: WorkflowExecutionPlan
```

### Test (backward compatible)

```
POST /api/v1/organizations/:orgId/workflows/:id/test
```

Delegates to dry run. Returns:

```json
{
  "executed": false,
  "message": "Dry run completed — no actions were executed...",
  "plan": { /* WorkflowExecutionPlan */ },
  "runIds": [],
  "runs": []
}
```

Legacy `runIds` / `runs` are always empty. Clients should use `plan`.

## Execution plan shape

- `executionMode`: `DRY_RUN`
- `executed`: `false`
- `workflowVersion`, `workflowId`, `workflowName`
- `event`: normalized type + sanitized payload (PII masked, secrets stripped)
- `scope`: pass/fail with reason (fail-closed for unknown scope types)
- `conditions`: per-condition results
- `plannedActions`: ordered list with `riskClass`, `requiresApproval`, `preview`, `validationErrors`
- `skippedActions`: actions blocked by scope/conditions
- `policyBlockers`, `validationErrors`, `wouldCreateApprovals`

## Architecture

```
WorkflowsController
  ├─ POST :id/dry-run → WorkflowsService.dryRunWorkflow
  └─ POST :id/test    → WorkflowsService.testWorkflow (wraps dry run)

WorkflowDryRunService.buildExecutionPlan
  ├─ evaluateWorkflowScope (fail-closed)
  ├─ evaluateWorkflowConditions
  └─ WorkflowActionPreviewService.previewAction (per action, no I/O side effects)

WorkflowEngineService.executeWorkflow (LIVE only)
  └─ WorkflowActionExecutorService.execute (assertLiveExecution)
```

### Action preview handlers

Each supported action type has a side-effect-free preview in `WorkflowActionPreviewService`:

- `task.create` — validates title, describes would-create OrgTask
- `alert.create` — describes alert task
- `vehicle.status.update` — org-scoped vehicle lookup, no `update`
- `notification.prepare` — masked recipients, no task/create
- `workflow.approval.request` / `ai.suggest_action` — human gate metadata

Unknown action types return `status: ERROR` in the plan.

### PII and secrets

`workflow-preview.util.ts`:

- `maskEmail`, `maskPhone` on preview payloads
- `sanitizePreviewRecord` strips keys matching secret patterns (`apiKey`, `token`, `password`, …)

## What dry run never does

- Create `OrgWorkflowRun` / `OrgWorkflowActionRun` / `OrgWorkflowApproval`
- Call `TasksService.upsertByDedup`
- Update vehicles, bookings, or approvals
- Enqueue BullMQ jobs or outbox events
- Contact external providers (email, SMS, WhatsApp, voice)

## LIVE mode entry points

Only these paths may pass `executionMode: LIVE`:

- `WorkflowEngineService.processEvent` (domain events)
- Future: approval resume after human decision (not in scope for Prompt 4)

## Frontend

`WorkflowAutomationView` uses `api.workflows.dryRun()` and shows an explicit banner: **Dry run — no actions were executed**.

## Tests

`backend/src/modules/workflows/workflow-dry-run.service.spec.ts` covers:

1. No task creation in dry run
2. No vehicle mutation
3. No notification persistence
4. No workflow run / approval rows
5. LIVE mode still executes when explicit
6. Unknown actions → ERROR in plan
7. Cross-tenant vehicle not resolved

## Remaining risks

- Approval resume after approve still does not re-execute actions (pre-existing MVP gap)
- `notification.prepare` in LIVE mode still creates draft tasks (by design); external channel actions not yet implemented
- Event hooks for health/DTC/invoice overdue not fully wired (separate backlog item)
