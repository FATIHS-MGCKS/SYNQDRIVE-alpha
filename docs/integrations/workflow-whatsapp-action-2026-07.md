# Workflow WhatsApp Action Adapters (Phase 8)

Production workflow actions for outbound WhatsApp via the existing **Meta WhatsApp Cloud API** stack (`WhatsAppModule`). No WhatsApp Web automation.

| Action | Capability | Approval |
|--------|------------|----------|
| `whatsapp.template.send` | **ENABLED** | REQUIRED |
| `whatsapp.ai_message.send` | **DISABLED** (until AI pipeline) | REQUIRED |

## Architecture

```
Workflow Runtime
  └─ WorkflowActionRegistryExecutor
       ├─ whatsapp.template.send → WhatsAppTemplateSendActionHandler
       └─ whatsapp.ai_message.send → WhatsAppAiMessageSendActionHandler
            └─ WorkflowWhatsAppSendService
                 ├─ OrgWhatsAppConfig (tenant-scoped, server credentials)
                 ├─ WhatsAppTemplateService → MetaWhatsAppCloudProvider
                 ├─ WhatsAppConsentService (opt-in / STOP)
                 ├─ WhatsAppMessagePolicyService (24h window, template approval)
                 ├─ WorkflowWhatsAppCommunicationPolicyService (quiet hours, rate limits)
                 └─ whatsapp_messages (idempotencyKey, providerMessageId, status)
```

## Config contracts (no secrets in workflow definitions)

### `whatsapp.template.send`

```json
{
  "templateId": "<OrgWhatsAppTemplate.uuid>",
  "language": "de",
  "recipient": { "type": "booking", "bookingId": "..." },
  "variables": { "name": "Max" },
  "messageKind": "transactional",
  "respectQuietHours": true,
  "verifiedDiagnosis": false
}
```

- `templateId` references org-scoped `WhatsAppTemplate` row — **not** Meta credentials.
- Phone resolved from `Customer.phone` / booking customer; optional `toPhone` requires `WORKFLOW_CUSTOMER_CONTACT`.
- Template must be `APPROVED` (or `DRAFT` in non-production).
- Language must match approved template language when explicitly set.

### `whatsapp.ai_message.send`

```json
{
  "recipient": { "type": "customer", "customerId": "..." },
  "message": "<from AI pipeline>",
  "messageKind": "support",
  "appendAiTransparency": true,
  "sensitiveFlags": []
}
```

- Handler `capabilityStatus`: `DISABLED` unless `WORKFLOW_WHATSAPP_AI_MESSAGE_ENABLED=true`.
- Policy matrix capability gate: `DISABLED` until product enables AI pipeline.
- Free-text only inside 24h customer service window (`WhatsAppMessagePolicyService`).
- AI transparency disclaimer appended by default (German).
- `sensitiveFlags` require `runApproved` when capability is enabled.

## Governance

| Control | Implementation |
|---------|----------------|
| Tenant isolation | `organizationId` on all queries; foreign entity → 404 |
| Idempotency | `whatsapp_messages.idempotency_key` unique per workflow action run |
| Opt-in | `WhatsAppConsentService` + explicit opt-in for non-transactional |
| Quiet hours | Mon–Fri 08:00–20:00 org timezone (override: `respectQuietHours: false`) |
| Contact frequency | Max 5 outbound / phone / 24h |
| Rate limit | Max 30 outbound / org / hour |
| PII in audit | `maskPhoneNumber()` in handler audit metadata |
| Dry run | `executor.preview()` — policy-validated, no provider call |
| Approval | Policy `approvalRule: REQUIRED`; execute blocked without `runApproved` |
| Unverified diagnosis | Safety block on critical vehicle triggers (same as email) |

## Delivery status

Workflow output `deliveryStatus`: `PREPARED` | `QUEUED` | `SENT` | `DELIVERED` | `READ` | `FAILED`.

Meta webhook statuses (`accepted`, `sent`, `delivered`, `read`, `failed`) are ingested by `WhatsAppWebhookService`:

- HMAC signature validation (`x-hub-signature-256`)
- Replay protection via `whatsapp_webhook_events.external_event_id`
- Idempotent status updates on `provider_message_id`

## Provider & VPS prerequisites

### Per organization (database)

- `OrgWhatsAppConfig`: `phoneNumberId`, `wabaId`, `isConnected`, `isActive`, `webhookVerifyToken`
- Approved `WhatsAppTemplate` rows linked to Meta template names/languages

### Server environment (never in workflow JSON)

| Variable | Purpose |
|----------|---------|
| `WHATSAPP_CLOUD_ACCESS_TOKEN` | Global Graph API token fallback |
| `WHATSAPP_CLOUD_APP_SECRET` | Webhook HMAC verification |
| `WHATSAPP_TOKEN_<ORG_ID>` | Per-org access token override |
| `WHATSAPP_APP_SECRET_<ORG_ID>` | Per-org app secret override |
| `WHATSAPP_SIMULATE_ENABLED` | Dev inbound simulation |
| `WORKFLOW_WHATSAPP_AI_MESSAGE_ENABLED` | Enable `whatsapp.ai_message.send` handler (future) |

### Meta / VPS

- Webhook URL: `POST /webhooks/whatsapp` on production host (`app.synqdrive.eu`)
- Graph API v21+ reachable from VPS egress
- PM2 backend restart after env changes

## Tests

`backend/src/modules/workflows/actions/whatsapp-workflow-action.spec.ts` covers:

- Template send success
- Dry-run preview
- Missing opt-in (support)
- Invalid phone
- Wrong tenant
- Idempotent duplicate
- Provider timeout
- Unapproved template
- Contact frequency limit
- AI action disabled
- Approval required
- Webhook duplicate status + invalid signature

## Related files

- `actions/adapters/workflow-whatsapp-send.service.ts`
- `actions/handlers/whatsapp-template-send.action-handler.ts`
- `actions/handlers/whatsapp-ai-message-send.action-handler.ts`
- `policies/workflow-action-policy.matrix.ts` (entries for both actions)
- `docs/architecture/workflow-action-adapters-2026-07.md`
