# Workflow Run State Machine (Phase 5 Prompt 20)

Persistent state machine for canonical `WorkflowRun` / `WorkflowActionRun` execution.

## Components

| Component | Role |
|-----------|------|
| `WorkflowRunOrchestratorService` | Atomic run creation from matcher result + envelope |
| `WorkflowRunOrchestratorRepository` | Transactional run/snapshot/action-run materialization |
| `WorkflowRunWorkerService` | Claim, execute, heartbeat, stale recovery, max-duration guard |
| `WorkflowRunRuntimeService` | Run status transitions with optimistic locking |
| `WorkflowActionRunRuntimeService` | Action status transitions + run derivation |
| `WorkflowRuntimeStatusAuditService` | Append-only `workflow_runtime_status_transitions` |
| `workflow-runtime-status.transitions` | Central transition guards |
| `workflow-run-status.derivation` | Terminal run status from action aggregates |
| `WorkflowRuntimeActionExecutorAdapter` | Bridges to existing `WorkflowActionExecutorService` |

## Flow

```
Matcher match
  → Orchestrator.createRunFromMatch (idempotent)
    → policy snapshot (contentHash dedupe)
    → WorkflowRun + ExecutionSnapshot
    → WorkflowActionRun[] ordered by actionIndex
    → RUNNING
  → Worker.processRun
    → find next executable action (prior steps terminal)
    → claimForExecution (optimistic lock + lease)
    → execute with heartbeat
    → completeExecution + audit transition
    → deriveAndApplyRunStatus
```

## Locking strategy

- **Optimistic locking** via `lockVersion` on `workflow_runs` and `workflow_action_runs`
- **Claim lease** via `claimedByWorkerId` + `leaseExpiresAt` on action runs
- **Heartbeat** renews `leaseExpiresAt` and `lastHeartbeatAt` while RUNNING
- **Stale recovery** resets expired RUNNING claims to `FAILED_RETRYABLE`
- **No duplicate execution**: claim uses `updateMany` with status + lease preconditions

## Status model

### Run statuses
`PENDING` → `RUNNING` → terminal (`COMPLETED`, `PARTIALLY_COMPLETED`, `FAILED`, `CANCELLED`, `SKIPPED`) or wait states (`WAITING`, `WAITING_FOR_APPROVAL`)

### Action statuses
`PENDING` → `RUNNING` → `SUCCEEDED` | `FAILED_RETRYABLE` | `FAILED_PERMANENT` | `WAITING` | `WAITING_FOR_APPROVAL` | `SKIPPED` | `CANCELLED`

## Configuration (`workflowRuntime`)

| Env | Default | Purpose |
|-----|---------|---------|
| `WORKFLOW_RUNTIME_ACTION_LEASE_MS` | 60000 | Action claim lease |
| `WORKFLOW_RUNTIME_ACTION_HEARTBEAT_MS` | 15000 | Heartbeat interval |
| `WORKFLOW_RUNTIME_STALE_RUNNING_MS` | 120000 | Stale RUNNING threshold |
| `WORKFLOW_RUNTIME_MAX_ACTION_ATTEMPTS` | 5 | Retry budget |
| `WORKFLOW_RUNTIME_MAX_RUN_DURATION_MS` | 86400000 | Max run lifetime |

## Not yet wired

- Outbox dispatch still uses legacy `WorkflowEngineService` — orchestrator integration is next
- Approval resume after human decision
- `WorkflowTimer` scheduler for WAITING resume
- BullMQ dedicated workflow-run queue (worker is service-level; poll externally)

## Tests

`workflow-run-state-machine.spec.ts` + `workflow-runtime-status.spec.ts` — 45 tests covering transitions, derivation, orchestration, worker claim/conflict, stale recovery, tenant isolation.
