# Workflow Action Adapters — Production Internal Actions (V4.9.841)

Phase 7 Prompt 31 — production-ready internal workflow action adapters on top of the Workflow Action Registry.

## Implemented adapters

| Action | Risk | Permission | Notes |
|--------|------|------------|-------|
| `task.create` | LOW | `WORKFLOW_EXECUTE` | `TasksService.upsertByDedup`, links booking/vehicle/customer |
| `notification.in_app.send` | LOW | `WORKFLOW_EXECUTE` | `NotificationCoreService.ingestCandidate`, whitelisted templates |
| `approval.request` | MEDIUM | `WORKFLOW_EXECUTE` | `WorkflowActionApprovalService` — single pause gate |
| `booking.flag` | MEDIUM | `WORKFLOW_EXECUTE` | `extrasJson.workflowFlags` — enum flags only |
| `vehicle.status.update` | HIGH | `WORKFLOW_VEHICLE_WRITE` | Transition matrix + `RentalHealthService` gate |
| `email.send` | MEDIUM | `WORKFLOW_CUSTOMER_CONTACT` | `OutboundEmailPolicyService` + Resend via `WorkflowEmailSendService` |
| `whatsapp.template.send` | HIGH | `WORKFLOW_CUSTOMER_CONTACT` | Meta Cloud API via `WorkflowWhatsAppSendService` + org templates |
| `whatsapp.ai_message.send` | CRITICAL | `WORKFLOW_CUSTOMER_CONTACT` | **DISABLED** until AI pipeline; free-text + transparency disclaimer |
| `sms.send` | HIGH | `WORKFLOW_CUSTOMER_CONTACT` | Twilio subaccount via `WorkflowSmsSendService`, templates, fallback link |

## Cross-cutting adapter infrastructure

- **Typed config** — `adapters/workflow-action-adapter.types.ts`
- **Audit** — `WorkflowActionAuditService` (structured logger + `auditId`)
- **Approval gate** — `WorkflowActionApprovalService` (idempotent per `actionRunId`)
- **Booking flags** — `workflow-booking-flag.util.ts`
- **Vehicle policy** — `workflow-vehicle-status.policy.ts`
- **Notification templates** — `workflow-notification-templates.ts`
- **Email templates** — `workflow-email-templates.ts` (`booking_follow_up`, `invoice_reminder`, `workflow_operational`)
- **Email send service** — `workflow-email-send.service.ts` (org identity, idempotency, attachments, delivery status)
- **WhatsApp send service** — `workflow-whatsapp-send.service.ts` (template + AI paths, consent, quiet hours, idempotency)
- **WhatsApp communication policy** — `workflow-whatsapp-communication-policy.service.ts`
- **SMS send service** — `workflow-sms-send.service.ts` (Twilio tenant, templates, segments, WhatsApp fallback link)
- **Recipient roles** — `workflow-recipient-role.util.ts`

Each handler implements: validate, authorize, preview (dry-run), execute, classifyError, timeout/retry/idempotency via `BaseWorkflowActionHandler`.

## Executor integration

`WorkflowActionExecutorService` skips the legacy pre-approval gate for `WORKFLOW_APPROVAL_GATE_ACTIONS` (`approval.request`, `workflow.approval.request`) so approval actions do not double-create gates.

## Deprecated / disabled

| Action | Status |
|--------|--------|
| `notification.prepare` | DEPRECATED — superseded by `notification.in_app.send` |
| `workflow.approval.request` | DEPRECATED alias of `approval.request` |
| `ai.suggest_action` | ENABLED but `requiresApproval` + executor pre-gate |
| `alert.create` | ENABLED (not part of Prompt 31 minimum) |

## Tests

`workflow-action-adapters.spec.ts` — success, duplicate/idempotent replay, foreign tenant, invalid entity, dry-run preview, permission, approval gate, rental-block, audit.

## Module wiring

`WorkflowActionRegistryModule` imports `TasksModule`, `NotificationsModule`, `RentalHealthModule`, `OutboundEmailModule`, `WhatsAppModule`, `SmsModule`.

See also: `docs/integrations/workflow-whatsapp-action-2026-07.md`, `docs/integrations/workflow-sms-action-2026-07.md`.
