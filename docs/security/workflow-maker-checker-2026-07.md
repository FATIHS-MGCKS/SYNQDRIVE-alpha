# Workflow Maker-Checker / Four-Eyes Controls (V4.9.852)

**Date:** 2026-07-25  
**Scope:** Dual-control for sensitive workflow definition changes and runtime action approvals.

## Protected operations

| Operation | Trigger |
|-----------|---------|
| `WORKFLOW_PUBLISH_HIGH_CRITICAL` | Activating/publishing workflows with HIGH/CRITICAL sensitivity |
| `WORKFLOW_ACTIVATE_EXTERNAL_AI` | External AI communication actions |
| `WORKFLOW_APPROVE_AI_CALL` | Voice / AI call start |
| `WORKFLOW_BOOKING_CANCEL` | Booking cancellation actions |
| `WORKFLOW_CUSTOMER_BLOCK` | Customer block actions |
| `WORKFLOW_PAYMENT_CHARGE` | Payment/charge actions |
| `WORKFLOW_SENSITIVE_POLICY_CHANGE` | Sensitive communication policy changes |
| `WORKFLOW_SECRET_PROVIDER_CONFIG` | Secret/provider configuration |
| `WORKFLOW_DEAD_LETTER_FORCE_REPLAY` | Force replay of external dead-letter actions |
| `WORKFLOW_RUNTIME_ACTION` | Generic sensitive runtime approval gate |

## Rules

1. **Maker ≠ Checker** — requester cannot approve their own change (unless emergency override).
2. **Last editor ≠ Checker** — last workflow editor cannot approve activation when policy applies.
3. **Reason required** — maker submits `activationReason`; checker submits `reason` on approve/reject.
4. **Invalidation** — edits after a pending request supersede/expire pending approvals.
5. **Expiry** — pending items expire after 72h (`WORKFLOW_MAKER_CHECKER_TTL_MS`).
6. **Checker permission** — `workflow-automation.manage` (ORG_ADMIN bypass).
7. **Org boundaries** — all lookups scoped by `organizationId`.
8. **Master Admin** — platform bypass with audit log when acting cross-tenant or dual-role.
9. **Emergency override** — `workflow-emergency-override.manage` + min 10 char reason + audit log.
10. **Version match** — approved definition hash + workflow version compared at decision time.
11. **Status** — sensitive activations remain `PENDING_ACTIVATION` until checker approval.

## API

### Workflow definition

- `PATCH /workflows/:id` with `status: ACTIVE` + `activationReason` on HIGH/CRITICAL → `PENDING_ACTIVATION` + change request
- `PATCH /workflows/:id/toggle` with `activationReason` when enabling sensitive workflows
- `GET /workflows/:id/change-requests` — list with maker/checker/diff
- `GET /workflows/change-requests/:requestId` — detail
- `POST /workflows/change-requests/:requestId/approve|reject` — checker decision (`decisionVersion` for optimistic locking)

### Runtime actions

- `POST /workflows/action-runs/:actionRunId/approve` — body `{ reason, decisionVersion?, emergencyOverride?, emergencyReason? }`
- `POST /workflows/action-runs/:actionRunId/reject` — body `{ reason }` (required)

## Emergency override

- Permission module: `workflow-emergency-override` (manage only, org admin default)
- Master Admin may override with mandatory detailed reason (logged)
- Cannot be used to silently bypass maker-checker without audit trail
- `emergencyOverride: true` + `emergencyReason` on approve endpoints

## Data model

- `OrgWorkflowChangeRequest` — definition/activation approvals
- Extended `OrgWorkflowApproval` — runtime action approvals with version hash, expiry, maker/checker fields
- `WorkflowStatus.PENDING_ACTIVATION` — awaiting checker before ACTIVE

## Code map

- `backend/src/modules/workflows/maker-checker/*`
- `backend/prisma/migrations/20260725120000_workflow_maker_checker/`
- `workflows.service.ts`, `workflow-action-executor.service.ts`

### Task automation dead-letter

- `POST /task-automation/outbox/:outboxId/replay` — body `{ makerReason }` creates maker-checker change request
- Checker approves via `POST /workflows/change-requests/:requestId/approve` → executes replay

Display for each pending item:

- Maker (createdBy / makerUserId)
- Checker (when decided)
- Status + expiry
- Definition diff (`formatChangeRequest().diff`)

Frontend supplementary hiding is not authoritative — backend enforces all rules.
