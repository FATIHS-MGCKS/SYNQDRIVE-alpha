# Workflow Approval Interim Safeguards (Phase 2)

**Date:** 2026-07-25  
**Status:** Interim — until Phase 5 pause-and-resume state machine  
**P0 Safety Gate:** Approval must not imply action completion

## Problem

The workflow approval path was incomplete: approving an action could mark the action run as `SUCCESS` with `executedAfterApproval: false`, falsely implying the workflow completed while the underlying action never resumed.

Until Phase 5 delivers a persistent pause-and-resume state machine, approvals must be treated as **decisions only**, not execution.

## Interim safeguards (implemented)

### Distinct approval status

| Entity | Pending | Approved (interim) | Rejected | Expired |
|--------|---------|-------------------|----------|---------|
| `OrgWorkflowApproval` | `PENDING` | `APPROVED_PENDING_EXECUTION` | `REJECTED` | `EXPIRED` |
| `OrgWorkflowActionRun` | `WAITING_APPROVAL` | `APPROVED_PENDING_EXECUTION` | `FAILED` | `FAILED` |
| `OrgWorkflowRun` | `WAITING_APPROVAL` | `WAITING_APPROVAL` (unchanged) | `FAILED` | `FAILED` |

**Rule:** Approval ≠ action completed. A waiting run stays `WAITING_APPROVAL`.

### Legacy visibility

Approvals previously marked `APPROVED` without resume are backfilled to `APPROVED_PENDING_EXECUTION` (migration `20260725130000_workflow_approval_interim`).

### Activation block

Workflows containing approval-gated actions cannot be set to `ACTIVE` while `WORKFLOW_APPROVAL_RESUME_SUPPORTED === false`.

Approval-gated actions:

- `workflow.approval.request`
- `ai.suggest_action`
- any action with `requiresApproval: true`

Enforced in `validateWorkflowDefinition` and `toggleStatus`.

### Duplicate / foreign / self-approval protection

| Guard | Error code |
|-------|------------|
| Action run not found (wrong org) | `WORKFLOW_APPROVAL_NOT_FOUND` |
| Already decided | `WORKFLOW_APPROVAL_ALREADY_DECIDED` |
| Not pending | `WORKFLOW_APPROVAL_NOT_PENDING` |
| Foreign tenant | `WORKFLOW_APPROVAL_FOREIGN_TENANT` |
| Self-approval (creator or triggerer) | `WORKFLOW_APPROVAL_SELF_APPROVAL_FORBIDDEN` |
| Missing approver role | `WORKFLOW_APPROVAL_INSUFFICIENT_PERMISSION` |
| Expired (72h TTL) | `WORKFLOW_APPROVAL_EXPIRED` |

Approver roles: `ORG_ADMIN`, `SUB_ADMIN`, `MASTER_ADMIN`.

### Audit fields

Stored on `OrgWorkflowApproval`:

- `approvedByUserId`
- `decidedByName`
- `reason` (comment on approve, rejection reason on reject)
- `decidedAt`
- `expiresAt` (default 72h from creation)

### Expired approvals

Expired pending approvals are atomically marked `EXPIRED`; action run and workflow run fail with a clear message.

### No silent resume fallback

`approveActionRun` does **not** re-enter the executor or mark runs `SUCCESS`. Output includes:

```json
{
  "approved": true,
  "executedAfterApproval": false,
  "resumeSupported": false,
  "interimPhase": true
}
```

## API

```
POST /organizations/:orgId/workflows/action-runs/:actionRunId/approve
Body: { "comment"?: string }

POST /organizations/:orgId/workflows/action-runs/:actionRunId/reject
Body: { "reason"?: string }
```

Structured error responses include `code` from `WORKFLOW_APPROVAL_ERROR_CODES`.

## UI

- `APPROVED_PENDING_EXECUTION` shown as **Approved — pending execution** (amber), not Success.
- Detail view banner when runs are waiting or interim-approved.
- Builder blocks activation for approval-gated workflows; save button disabled when `ACTIVE` would be invalid.

## Deliberately not implemented (Phase 5)

- Persistent pause-and-resume state machine
- Automatic action execution after approval
- Workflow run progression past approval gate
- `WORKFLOW_APPROVAL_RESUME_SUPPORTED` remains `false`

## Tests

| Scenario | Spec file |
|----------|-----------|
| Approve → `APPROVED_PENDING_EXECUTION`, run stays waiting | `workflow-approval-interim.service.spec.ts` |
| Duplicate approval | same |
| Foreign tenant | same |
| Self-approval | same |
| Expired approval | same |
| Rejection + audit | same |
| Insufficient permission | same |
| Activation policy | `workflow-approval-interim.util.spec.ts`, `workflows.service.spec.ts` |

## Changed files

**Backend**

- `workflow-approval-interim.util.ts` / `.service.ts`
- `workflow-approval-interim.*.spec.ts`
- `workflows.service.ts`, `workflows.controller.ts`, `workflows.module.ts`
- `workflow-definition.validator.ts`, `workflow-action-executor.service.ts`
- `dto/workflow.dto.ts`
- `prisma/schema.prisma`, migration `20260725130000_workflow_approval_interim`

**Frontend**

- `WorkflowAutomationView.tsx`, `lib/api.ts`

**Docs**

- This file

## P0 Safety Gate

**PASS** when:

1. Approval never marks action run `SUCCESS` without execution.
2. Workflow run does not auto-complete after approval.
3. Legacy approvals are visibly `APPROVED_PENDING_EXECUTION`.
4. Approval-gated workflows cannot activate without resume.
5. Duplicate, foreign, self, expired, and permission failures return explicit errors.
6. UI does not show false success.
