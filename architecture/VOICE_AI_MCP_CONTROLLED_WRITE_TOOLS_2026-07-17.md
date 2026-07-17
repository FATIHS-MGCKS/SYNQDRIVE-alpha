# Voice AI — Controlled MCP Write Tools (2026-07-17)

## Status

Accepted — Prompt 6B (controlled write actions)

## Context

Prompt 6A delivered a read-only MCP gateway. Voice agents now need **controlled** write capabilities with customer confirmation, staff approval, idempotency, and audit — without exposing destructive business mutations.

## Decision

### Write tools (Phase 6B)

| Tool | Capability | Risk class | Domain action |
|------|------------|------------|---------------|
| `create_callback_request` | `createTask` | `CONFIRMATION_REQUIRED` | `TasksService.createManualTask` |
| `request_document_resend` | `contactCustomer` | `CONFIRMATION_REQUIRED` | `BookingDocumentEmailService.sendBookingDocuments` |
| `create_support_case` | `createTask` | `STAFF_APPROVAL_REQUIRED` | `SupportService.create` |
| `create_task` | `createTask` | `STAFF_APPROVAL_REQUIRED` | `TasksService.createManualTask` |
| `create_customer_note` | `modifyRecords` | `STAFF_APPROVAL_REQUIRED` | `CustomerTimelineService.addEvent` |
| `request_booking_change` | `modifyBooking` | `STAFF_APPROVAL_REQUIRED` | `TasksService.createManualTask` (change request) |

### Prohibited (never exposed)

`cancel_booking`, `change_booking_price`, `refund_payment`, `mark_invoice_paid`, `unlock_vehicle`, `remove_customer_block`, `change_vehicle_assignment`, `delete_customer`

Customer requests map to support case, change request task, or staff approval — never direct mutation.

### Customer confirmation

1. First tool call without `confirmationToken` → `ConfirmationRequired` with structured `actionSummary`, `confirmationToken`, `parameterHash`, `expiresAt` (Redis, single-use, 5 min).
2. Second call with matching token + **exact** parameter hash → proceed.
3. Hash excludes `confirmationToken`; reuse or tampering rejected.

### Staff approval

1. After customer confirmation, `STAFF_APPROVAL_REQUIRED` tools create `VoiceToolExecution` (`PENDING`) + `VoiceApprovalRequest` (`PENDING`, 1 h TTL).
2. High-priority internal task created for operators (`VOICE_MCP_APPROVAL`).
3. **No domain mutation** until staff approves via tenant API:
   - `POST /organizations/:orgId/voice-assistant/mcp-approvals/:approvalId/approve`
   - `POST .../reject`
4. Approver must be `ORG_ADMIN`, `SUB_ADMIN`, or `MASTER_ADMIN` in the same organization.
5. Reject → execution `DENIED`; expiry → `EXPIRED` / execution `CANCELLED`.

### Idempotency

- Key: `{conversationId}:{toolName}:{parameterHash}`
- `VoiceToolExecution` unique on `(organizationId, idempotencyKey)`
- Retries return `already_completed` with stored redacted output — no duplicate tasks/tickets.

### Audit & PII

- Redacted input/output on `VoiceToolExecution`
- No full documents in tool events
- Customer notes sanitized (length limits, blocked injection patterns)
- Speech-safe refs (`taskRef`, `ticketNumber`) — no raw UUIDs in responses

## Module additions

`backend/src/modules/voice-mcp-gateway/`

- `voice-mcp-action-orchestrator.service.ts`
- `voice-mcp-confirmation.service.ts`
- `voice-mcp-approval.service.ts`
- `voice-mcp-write-tools.service.ts`
- `voice-mcp-approval.controller.ts`
- `voice-mcp-risk.registry.ts`

## Out of scope

- Autonomous destructive actions
- Customer UI for approvals
- Live PSTN execution
