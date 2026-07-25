# Workflow SMS Action Adapter (`sms.send`) — Phase 8

Production workflow action for outbound SMS via **Twilio tenant subaccounts** (SynqDrive parent + org subaccount model). No secrets in workflow definitions.

| Action | Capability | Approval |
|--------|------------|----------|
| `sms.send` | **ENABLED** | REQUIRED |

## Architecture

```
Workflow Runtime
  └─ sms.send → SmsSendActionHandler
       └─ WorkflowSmsSendService
            ├─ OrgSmsConfig (messagingServiceSid / fromPhoneNumberSid)
            ├─ TwilioTenantClientFactory → subaccount REST client
            ├─ SmsConsentService (STOP/START, opt-out)
            ├─ WorkflowSmsCommunicationPolicyService (quiet hours, rate limits)
            └─ outbound_sms + outbound_sms_events (idempotency, MessageSid, status)
```

Status callbacks: `POST /api/v1/webhooks/twilio/message-status`  
Inbound SMS (STOP): `POST /api/v1/webhooks/twilio/sms`

## Config contract

```json
{
  "templateKey": "booking_follow_up",
  "templateVersion": "1.0.0",
  "locale": "de",
  "recipient": { "type": "booking", "bookingId": "..." },
  "params": { "name": "Max", "message": "..." },
  "messageKind": "transactional",
  "respectQuietHours": true,
  "fallbackFromWhatsAppMessageId": "<optional failed WhatsApp message id>",
  "sensitiveFlags": []
}
```

Templates: `booking_follow_up`, `pickup_reminder`, `workflow_operational` (v1.0.0).

## Governance

| Control | Implementation |
|---------|----------------|
| Tenant isolation | All queries scoped by `organizationId` |
| Sender resolution | `OrgSmsConfig.messagingServiceSid` preferred; else `fromPhoneNumberSid` |
| Phone resolution | Customer/Booking entity → E.164 via shared normalizer |
| Opt-out | `SmsConsent` + inbound STOP webhook |
| Quiet hours | Mon–Fri 08:00–20:00 org timezone |
| Contact frequency | Max 3 SMS / phone / 24h |
| Rate limit | Max 20 SMS / org / hour |
| Segments / cost | `estimateSmsSegmentCount` + indicative `estimatedCostUsd` (not billing guarantee) |
| Idempotency | `outbound_sms.send_idempotency_key` unique per org |
| Webhook security | Twilio `X-Twilio-Signature` HMAC + `twilio_webhook_events` replay protection |
| WhatsApp fallback | `fallbackFromWhatsAppMessageId` links to failed `whatsapp_messages` row |
| PII | `maskPhoneNumber` in audit output |
| Dry run | `executor.preview()` |

## Environment variables

| Variable | Purpose |
|----------|---------|
| `TWILIO_ACCOUNT_SID` | Parent account |
| `TWILIO_API_KEY_SID` / `TWILIO_API_KEY_SECRET` | REST auth (IE1/Dublin) |
| `TWILIO_AUTH_TOKEN` | Webhook signature validation |
| `TWILIO_VOICE_WEBHOOK_BASE_URL` | Public base for SMS status callback URLs |
| `TWILIO_SMS_SIMULATE_ENABLED` | Dev simulate sends without Twilio API |
| `VOICE_TWILIO_SUB_<ORG>` | Per-org subaccount credentials (existing voice provisioning) |

## Org setup (database)

`org_sms_config`:
- `is_active = true`
- `messaging_service_sid` **or** `from_phone_number_sid`
- Active Twilio subaccount via `voice_provider_accounts` + secret ref

## Open provider approvals / ops

- Twilio **Messaging Service** or SMS-capable number must be provisioned per org subaccount
- SMS status + inbound webhooks must be reachable on production URL
- Regulatory / A2P registration (country-specific) is **not** automated in this adapter — org-level compliance remains an ops prerequisite
- `TWILIO_SMS_SIMULATE_ENABLED=true` for local/staging without live sends

## Tests

`backend/src/modules/workflows/actions/sms-workflow-action.spec.ts` — 13 cases covering send, duplicate, opt-out, invalid phone, tenant, status callback, duplicate webhook, invalid signature, timeout, approval, quiet hours/frequency, dry-run.

## Related

- `backend/src/modules/sms/`
- `actions/adapters/workflow-sms-send.service.ts`
- `actions/handlers/sms-send.action-handler.ts`
- `docs/integrations/workflow-whatsapp-action-2026-07.md` (channel fallback)
