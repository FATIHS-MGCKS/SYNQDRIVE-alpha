# Workflow Action Registry (Phase 7 Prompt 30)

Central, typed, server-side registry for workflow action handlers. Replaces the distributed `switch` in `WorkflowActionExecutorService`.

## Architecture

```
WorkflowEngineService
  → WorkflowActionExecutorService (legacy adapter)
    → WorkflowActionRegistryExecutorService
      → WorkflowActionRegistryService.resolve(type, version?)
        → WorkflowActionHandler (validate → authorize → preview/execute)
```

## Handler interface

Each handler exposes:

| Field / method | Purpose |
|----------------|---------|
| `type` | Canonical action type (`task.create`, …) |
| `version` | Semver for migrations (`1.0.0`) |
| `capabilityStatus` | `ENABLED` \| `DISABLED` \| `DEPRECATED` \| `EXPERIMENTAL` |
| `configSchema` | Declarative schema — no secrets |
| `riskClass` | `LOW` → `CRITICAL` — cannot be downgraded by client |
| `requiredPermission` | RBAC gate in `authorize()` |
| `requiresApproval` | Metadata; runtime gate in executor adapter |
| `validate()` | Config + tenant context |
| `authorize()` | Permission check |
| `preview()` | Side-effect-free dry run |
| `execute()` | Idempotent side effects |
| `classifyError()` | Retry/transient mapping |
| `compensate()` | Optional rollback (e.g. vehicle status) |
| `timeoutPolicy` / `retryPolicy` / `idempotencyPolicy` | Execution policies |

## Execution context

```typescript
{
  organizationId, workflowRunId, actionRunId,
  event, workflowSnapshot, policySnapshot,
  actor | systemIdentity, correlationId,
  secretsResolver,  // never reads secrets from config
  logger            // PII-redacted
}
```

## Rules enforced

- Unknown action types → `UNKNOWN_ACTION` rejection
- Duplicate `type@version` registration → `DUPLICATE_REGISTRATION`
- `DISABLED` capability → blocked before preview/execute
- Client `riskClass` downgrade → `RISK_DOWNGRADE`
- Preview never calls Tasks/Prisma write paths
- Execute uses existing dedup keys (`upsertByDedup`)

## Registered actions (v1.0.0)

| Type | Risk | Permission |
|------|------|------------|
| `task.create` | LOW | `WORKFLOW_EXECUTE` |
| `alert.create` | MEDIUM | `WORKFLOW_EXECUTE` |
| `notification.prepare` | LOW | `WORKFLOW_EXECUTE` |
| `vehicle.status.update` | HIGH | `WORKFLOW_VEHICLE_WRITE` |
| `email.send` | MEDIUM | `WORKFLOW_CUSTOMER_CONTACT` |
| `workflow.approval.request` | MEDIUM | `WORKFLOW_EXECUTE` |
| `ai.suggest_action` | CRITICAL | `WORKFLOW_AI_SUGGEST` |

## Module layout

```
backend/src/modules/workflows/actions/
  workflow-action-registry.service.ts      # controlled init via OnModuleInit
  workflow-action-registry.executor.service.ts
  handlers/*.action-handler.ts
  workflow-action-registry.module.ts
```

## Remaining switch logic

- `workflow-definition.validator.ts` — action type allowlist (`WORKFLOW_ACTION_TYPES`) for publish-time validation; should stay aligned with registry
- `workflow-engine.service.ts` — trigger/scope matching (not action dispatch)
- Approval pre-gate in `WorkflowActionExecutorService` for `requiresApproval` flag on action def

Future Phase 6+ runtime (`workflow.delay`, canonical `WorkflowActionRun` executor) should delegate to the same registry.
