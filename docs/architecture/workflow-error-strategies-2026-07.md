# Workflow Error Strategies & Partial Failures (Phase 5 Prompt 24)

Explicit per-action error strategy model with partial failure visibility, fallback action runs, and compensation for internal actions only.

## Supported strategies

| Strategy | Behavior |
|----------|----------|
| `STOP_WORKFLOW` | `FAILED_PERMANENT`, blocking — run → `FAILED` |
| `CONTINUE` | `FAILED_PERMANENT`, non-blocking — workflow continues |
| `SKIP_ACTION` | `SKIPPED` — action omitted, workflow continues |
| `REQUEST_APPROVAL` | Escalate to `WAITING_FOR_APPROVAL` after failure |
| `EXECUTE_FALLBACK` | Skip primary, materialize fallback `WorkflowActionRun` |
| `RETRY` | `FAILED_RETRYABLE` until `maxAttempts` exhausted |
| `MARK_PARTIAL` | Non-blocking failure with `partialFailure=true` → `PARTIALLY_COMPLETED` |
| `COMPENSATE_PREVIOUS` | Trigger compensation for prior internal actions only |

## Run status outcomes

| Status | When |
|--------|------|
| `COMPLETED` | All required actions succeeded |
| `COMPLETED_WITH_FALLBACK` | Fallback action succeeded after primary failure/skip |
| `PARTIALLY_COMPLETED` | Mixed success + non-blocking/partial failures |
| `FAILED` | Required blocking action permanently failed |

## Compensation rules

- Only `task.create`, `alert.create`, `vehicle.status.update` when explicitly `compensatable: true`
- `notification.prepare` and other external actions: **never compensatable**
- External communication cannot be reliably reversed

## Fallback rules

- Fallback actions get own `WorkflowActionRun` (`isFallbackRun=true`, `parentActionRunId`)
- `WORKFLOW_RUNTIME_MAX_FALLBACK_DEPTH` (default 3) prevents infinite loops
- Idempotent fallback materialization via `{runKey}:fallback:{parentId}:{fallbackKey}`

## Audit

Every strategy application records:
- `appliedErrorStrategy` on `WorkflowActionRun`
- `workflow_runtime_status_transitions.metadata.appliedErrorStrategy`
- `partialFailure` flag for UI distinction

## Dry run

`WorkflowErrorStrategyExplainService.explainFromDefinition(actions)` returns per-action strategy plan with notes (used in matcher explain extensions and operator tooling).

## Example

```
admin.notify → SUCCEEDED
whatsapp.send → FAILED_PERMANENT (EXECUTE_FALLBACK)
sms.send (fallback run) → SUCCEEDED
→ Run: COMPLETED_WITH_FALLBACK
```

## Tests

`workflow-error-strategy.spec.ts` — all strategies, derivation, compensation guard, explain.
