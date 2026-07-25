# Workflow Action Run Execution (Phase 5 Prompt 21)

Each workflow action is a standalone persistent, idempotent execution step bound to the frozen run snapshot.

## ActionRun execution model

| Field | Purpose |
|-------|---------|
| `workflowActionId` | Stable action ID from workflow version |
| `actionKey` / `actionIndex` | Stable ordering identity |
| `status` | Own lifecycle per action |
| `attemptCount` / `maxAttempts` | Retry budget |
| `startedAt` / `finishedAt` | Execution window |
| `nextAttemptAt` | Scheduled retry |
| `timeoutAt` | Per-action deadline |
| `idempotencyKey` | Org-scoped dedupe (`{runKey}:action:{index}`) |
| `inputSnapshot` | Frozen config at materialization — no secrets |
| `resultSummary` | Minimized success output for audit/UI |
| `errorCode` / `errorCategory` / `errorSummary` | Structured failure |
| `providerReference` | Opaque external ID (taskId, etc.) |
| `blockingOnFailure` | Whether permanent failure blocks subsequent actions |

## Execution context

`WorkflowActionExecutionContext` carries:
- `organizationId`
- `event` (from run input, not live envelope)
- `run` (with `definitionSnapshot`)
- `policy` (from `WorkflowPolicySnapshot`)
- `actionSnapshot` (from frozen definition — never live version)
- `actor`

## Flow

```
Worker claims action (lease + timeoutAt)
  → WorkflowActionRunExecutorService.executeClaimed
    → idempotency check (SUCCEEDED → replay)
    → ensure inputSnapshot
    → execute via adapter (snapshot-bound)
    → classify errors
    → atomic persist (resultSummary, sanitized output, audit)
    → derive run status
```

## Retry and timeout rules

| Category | Auto-retry | Notes |
|----------|------------|-------|
| `RETRYABLE` | Yes, if `attemptCount < maxAttempts` | Connection, rate limit, 502/503 |
| `TIMEOUT` | Yes, if attempts remain | `WORKFLOW_RUNTIME_ACTION_TIMEOUT_MS` |
| `PERMANENT` | No | Validation, not found, unsupported |
| `PROVIDER_UNCLEAR` | **Never** | Submitted but unconfirmed — no blind resend |
| `TENANT_VIOLATION` | No | Cross-tenant access denied |

Backoff: exponential via `computeWorkflowOutboxBackoffMs`.

## Non-blocking failures

When `blockingOnFailure = false`, a `FAILED_PERMANENT` action does not block subsequent actions. Run may end as `PARTIALLY_COMPLETED`.

## Process restart

`findOpenActionRuns` discovers `PENDING`, `RUNNING`, `FAILED_RETRYABLE`, `WAITING`, `WAITING_FOR_APPROVAL` for worker resume.

## Tests

`workflow-action-run-executor.spec.ts` — 19 tests covering idempotency, classifier, secrets, cross-tenant, non-blocking, restart discovery.
