# Workflow Approval Pause-and-Resume (Phase 5 Prompt 22)

Persistent approval gate that pauses a workflow run at a sensitive action, records a canonical `WorkflowApproval`, and resumes the **same** action run after decision — approval does not imply execution success.

## Target flow

```
RUNNING
  → action requires approval
  → ActionRun WAITING_FOR_APPROVAL
  → WorkflowRun WAITING_FOR_APPROVAL
  → approver decides
  → (approve) pre-execution re-check
  → same ActionRun resumed (RUNNING)
  → executeClaimed({ resumedAfterApproval: true })
  → worker continues next action
```

## Data model

| Field | Purpose |
|-------|---------|
| `workflowRunId` | Exact run being paused |
| `actionRunId` | Exact action awaiting decision |
| `workflowVersionId` | Frozen version at request time |
| `requestedByUserId` / `requestedBySystem` | Maker-checker requester |
| `approvedByUserId` / `decidedAt` / `reason` | Decision audit |
| `expiresAt` | TTL (`WORKFLOW_RUNTIME_APPROVAL_TTL_HOURS`, default 72h) |
| `rejectionStrategy` | `CANCEL_RUN`, `SKIP_ACTION`, `EXECUTE_FALLBACK` |
| `makerCheckerRequired` | Requester cannot self-approve when true |
| `legacyOrgWorkflowApprovalId` | Bridge to legacy `OrgWorkflowApproval` |
| `WorkflowApprovalComment` | Audited approval comments |

Approval status lifecycle: `PENDING` → `APPROVED_PENDING_EXECUTION` → `APPROVED` | `REJECTED` | `EXPIRED`.

## Services

| Service | Role |
|---------|------|
| `WorkflowApprovalPauseService` | Create approval on `WAITING_FOR_APPROVAL` execution result; link run/action; prepare notification intent |
| `WorkflowApprovalResumeService` | `approve`, `reject`, `expirePending`, `processExpiredBatch` |
| `WorkflowApprovalPreExecutionValidator` | Re-check version, entity, action relevance before resume |
| `WorkflowApprovalNotificationPrepareService` | Stub intent for existing notification engine (no new providers) |
| `WorkflowApprovalLegacyBridgeService` | Mark or bridge legacy-only approvals |

## Guards

- **Duplicate decision**: optimistic `decide(fromStatus: PENDING)` — conflict if already decided
- **Expiry**: block approve/reject after `expiresAt`; batch expiry applies rejection strategy
- **Cross-tenant**: org-scoped repository + explicit tenant check
- **Maker-checker**: requester cannot approve when `makerCheckerRequired`
- **Approval ≠ success**: approve transitions to `APPROVED_PENDING_EXECUTION`, then executes action; final `APPROVED` only after execution completes

## Pre-execution checks (after approval, before resume)

1. Workflow version still valid / published
2. Entity still present (booking, vehicle, etc.)
3. Action still in frozen definition snapshot
4. Recipient / communication preference — stub hooks for future policy wiring

Failure → `PRE_EXECUTION_FAILED` (no blind execution).

## Rejection strategies

| Strategy | Effect |
|----------|--------|
| `CANCEL_RUN` | ActionRun + WorkflowRun → `CANCELLED` |
| `SKIP_ACTION` | ActionRun → `SKIPPED`, derive run status, `worker.processRun` |
| `EXECUTE_FALLBACK` | ActionRun → `SKIPPED` (fallback executor stub) |

## API

`GET/POST organizations/:orgId/workflow-approvals` — safe list (no sensitive payload), approve, reject, legacy unbridged list.

## Legacy bridge

Existing `OrgWorkflowApproval` rows without canonical link are surfaced as `LEGACY_ONLY` via `WorkflowApprovalLegacyBridgeService`. Migration backfills `workflowVersionId` from linked `WorkflowRun`.

## Tests

`workflow-approval.spec.ts` — approve + exact resume, reject (cancel/skip), expiry, duplicate, maker-checker, cross-tenant, pre-execution failure, safe list, legacy bridge.
