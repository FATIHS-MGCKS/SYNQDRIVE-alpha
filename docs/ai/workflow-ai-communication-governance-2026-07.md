# Workflow AI Communication Governance Pipeline — Phase 8

Controlled AI text generation for workflow customer-contact actions. The LLM **never** calls Twilio, Meta, Resend, or other providers directly.

## Flow (10 steps)

```
1. Domain event (workflow trigger)
2. Purpose allowlist check (event × purpose matrix)
3. Minimal fact collection (allowlisted payload keys + scoped DB reads)
4. Approved prompt template load (versioned catalog)
5. LLM structured generation (Mistral via LlmGatewayService)
6. Fact check (citedFactIds vs source facts, no unverified diagnosis)
7. Safety policy (injection filter, content limits, PII redaction in logs)
8. Human approval gate (risk class / sensitive flags / critical prompts)
9. Send via normal provider adapter (WhatsApp / future email/SMS)
10. Audit (model id, prompt version, cited facts, fallback flag)
```

## Architecture

```
Workflow Action Handler (e.g. whatsapp.ai_message.send)
  └─ WorkflowAiCommunicationPipelineService
       ├─ WorkflowAiCommunicationDataService (allowlisted facts only)
       ├─ WorkflowAiCommunicationSafetyService (injection, limits)
       ├─ WorkflowAiCommunicationFactCheckService
       ├─ LlmGatewayService → Mistral (structured JSON output)
       └─ Static fallback templates on LLM/fact-check failure
  └─ WorkflowWhatsAppSendService (provider send — separate from LLM)
```

## Prompt catalog (v1.0.0)

| Key | Events | Risk | Approval |
|-----|--------|------|----------|
| `vehicle_health_critical_notice` | `vehicle.health.critical`, `vehicle.dtc.critical` | CRITICAL | yes |
| `vehicle_health_warning_notice` | `vehicle.health.warning` | HIGH | no |
| `invoice_reminder` | `invoice.overdue` | HIGH | yes |
| `complaint_acknowledgement` | `customer.complaint.created` | HIGH | yes |
| `booking_follow_up` | `booking.returned`, `booking.completed` | MEDIUM | no |
| `operational_workflow` | `manual.test`, booking events | MEDIUM | no |

## Guardrails

| Control | Implementation |
|---------|----------------|
| No provider calls from LLM | Pipeline returns draft text only |
| No free DB access | `WORKFLOW_AI_EVENT_PAYLOAD_ALLOWLIST` + scoped Prisma reads |
| Tool allowlist | Facts from explicit collectors only (no MCP/DB tools in pipeline) |
| Tenant context | All reads scoped by `organizationId` |
| Prompt versioning | `promptKey` + `promptVersion` must match catalog |
| Model versioning | `modelId` recorded in audit output |
| Temperature / tokens | Fixed defaults (`0.2`, max 512) |
| Structured output | JSON schema: message, citedFactIds, claimsDiagnosis, claimsCertainty |
| No invented diagnosis | Fact check + diagnosis language filter on health events |
| Symptom-only vehicle data | Rental health module reasons marked `symptomOnly` |
| PII minimization | Customer first name only; plate partial mask |
| PII in logs | `WorkflowAiCommunicationSafetyService.redactForLogs` |
| Content limits | 1200 chars message, 400 chars untrusted customer text |
| AI transparency | Disclaimer appended after generation |
| Approval | Critical prompts, sensitive flags, manual message override |
| Fallback template | Static DE/EN templates when LLM or fact check fails |
| Prompt injection | Untrusted text wrapped + filtered; output scanned |
| Dry run | `dryRun: true` → draft only, no provider send |

## Example: `vehicle.health.critical`

Config:

```json
{
  "recipient": { "type": "booking", "bookingId": "..." },
  "promptKey": "vehicle_health_critical_notice",
  "promptVersion": "1.0.0",
  "purpose": "health_notice",
  "locale": "de",
  "respectQuietHours": true
}
```

Pipeline cites only documented alerts from event payload + rental health module reasons. No repair diagnosis. Org admin notification should use separate `notification.in_app.send` action. Voice call (`voice.call.start`) requires separate approval.

## Environment

| Variable | Purpose |
|----------|---------|
| `WORKFLOW_AI_COMMUNICATION_ENABLED=true` | Enable pipeline + `whatsapp.ai_message.send` handler |
| `MISTRAL_API_KEY` | LLM provider (via existing `AiModule`) |
| `AI_PROVIDER=mistral` | Default provider |

## Actions enabled when flag is on

| Action | Status |
|--------|--------|
| `whatsapp.ai_message.send` | **ENABLED** (handler + policy) |
| `email.send` / `sms.send` | Can adopt same pipeline (template keys ready; wire in follow-up) |
| `voice.call.start` | Separate orchestrator path; not LLM-generated speech in v1 |

## Tests

`backend/src/modules/workflows/actions/workflow-ai-communication-pipeline.spec.ts` — 10 cases.
