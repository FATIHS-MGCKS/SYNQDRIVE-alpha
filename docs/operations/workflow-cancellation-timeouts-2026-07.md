# Workflow Cancellation, Timeouts & Stale Runs (Phase 5 Prompt 23)

Operations guide for controlled workflow cancellation, action timeouts, and stale run recovery.

## Cancellation

### Who can cancel

| Actor | Source | API / trigger |
|-------|--------|---------------|
| Authorized user | `USER_REQUEST` | `POST organizations/:orgId/workflow-runs/:runId/cancel` |
| System policy | `MAX_RUN_DURATION` | Scheduler when `startedAt + WORKFLOW_RUNTIME_MAX_RUN_DURATION_MS` exceeded |
| Org lock | `ORG_ARCHIVED` / `ORG_SUSPENDED` | Scheduler batch for locked organizations |

### Cancellation rules

1. **Terminal runs** cannot be cancelled again (`WORKFLOW_RUN_ALREADY_TERMINAL`).
2. **Cross-tenant** access is denied at repository + service layer.
3. **Completed actions** (`SUCCEEDED`, `FAILED_PERMANENT`, etc.) are preserved — only non-terminal actions are terminated.
4. **Cancellable action statuses**: `PENDING`, `RUNNING`, `WAITING`, `WAITING_FOR_APPROVAL`, `FAILED_RETRYABLE`.
5. **No new actions** start after run → `CANCELLED` (worker checks terminal status before claim).
6. **Audit data** is append-only — cancellation writes transitions, never deletes history.
7. **Parallel cancel**: optimistic `lockVersion` on run; conflict → `WORKFLOW_RUNTIME_LOCK_CONFLICT`.

### Provider handoff rule

If a `RUNNING` action has `providerReference` set (provider already accepted work):

- Action → `FAILED_PERMANENT` with `errorCategory: PROVIDER_UNCLEAR`
- **Not** marked `CANCELLED` — we do not claim safe stop when provider state is unknown

### Cancellation metadata (WorkflowRun)

| Field | Purpose |
|-------|---------|
| `cancelledAt` | When cancellation completed |
| `cancelledByUserId` | User actor (null for SYSTEM) |
| `cancelledByActorType` | `USER` / `SYSTEM` / `WORKER` |
| `cancelReason` | Human-readable reason |

Status API: `GET organizations/:orgId/workflow-runs/:runId/status`

## Action timeouts

| Config | Default | Purpose |
|--------|---------|---------|
| `WORKFLOW_RUNTIME_ACTION_TIMEOUT_MS` | 120000 | Per-action execution timeout |
| `WORKFLOW_RUNTIME_MIN_ACTION_TIMEOUT_MS` | 5000 | Lower bound (clamped) |
| `WORKFLOW_RUNTIME_MAX_ACTION_TIMEOUT_MS` | 600000 | Upper bound (clamped) |
| `WORKFLOW_RUNTIME_MAX_ACTION_ATTEMPTS` | 5 | Retry budget |

### Timeout outcome

| Condition | Result |
|-----------|--------|
| Timeout + attempts remain | `FAILED_RETRYABLE` → scheduled retry |
| Timeout + attempts exhausted | `FAILED_PERMANENT` |
| Provider unclear response | `FAILED_PERMANENT`, `PROVIDER_UNCLEAR`, no auto-retry |

## Run duration limit

| Config | Default |
|--------|---------|
| `WORKFLOW_RUNTIME_MAX_RUN_DURATION_MS` | 86400000 (24h) |

Exceeded runs are cancelled via `WorkflowRunCancellationService` (cascade to actions, approvals, timers).

## Stale runs

| Config | Default | Behavior |
|--------|---------|----------|
| `WORKFLOW_RUNTIME_STALE_RUNNING_MS` | 120000 | Threshold for stale `RUNNING` detection |
| `WORKFLOW_RUNTIME_ACTION_LEASE_MS` | 60000 | Worker claim lease |
| `WORKFLOW_RUNTIME_ACTION_HEARTBEAT_MS` | 15000 | Lease renewal interval |

### Stale recovery procedure

1. Scheduler (`WorkflowRuntimeSchedulerService`) runs every 60s when `WORKFLOW_RUNTIME_SCHEDULER_ENABLED=true`.
2. `recoverStaleRunningActions` finds `RUNNING` actions with expired lease or old `startedAt`.
3. Stale claim → `FAILED_RETRYABLE`, lease cleared, `timeoutAt` cleared.
4. Worker picks up retry on next `processRun` / timer fire.

### Scheduler maintenance batch

Each poll cycle:

1. Recover stale `RUNNING` actions
2. Expire pending approvals
3. Cancel runs exceeding max duration
4. Fire due `WorkflowTimer` entries (retry backoff)
5. Cancel active runs for `ARCHIVED` / `SUSPENDED` organizations

## Timer deactivation

On cancellation, all `SCHEDULED` `WorkflowTimer` rows for the run, action, or approval are set to `CANCELLED` with `cancelledAt`.

## Operational checklist

### Investigate stuck run

1. `GET .../workflow-runs/:runId/status` — check run + action summary
2. Inspect `workflow_runtime_status_transitions` for the run
3. Check action `leaseExpiresAt`, `timeoutAt`, `providerReference`
4. If provider state unknown → do **not** assume cancellation stopped external side effects

### Force cancel (authorized)

```
POST /api/v1/organizations/:orgId/workflow-runs/:runId/cancel
{ "reason": "Operational abort — booking voided" }
```

### Disable scheduler (maintenance)

```
WORKFLOW_RUNTIME_SCHEDULER_ENABLED=false
```

## Remaining provider limits

- No provider status polling / reconciliation job yet
- `executeWithTimeout` cannot abort in-flight HTTP — best-effort only
- Provider unclear state requires manual ops follow-up when `providerReference` is set
- `EXECUTE_FALLBACK` rejection from approvals remains stub
