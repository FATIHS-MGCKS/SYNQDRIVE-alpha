# Workflow Voice Action Adapter (`voice.call.start`) — Phase 8

Production workflow action for outbound AI voice calls. **Workflows never orchestrate Twilio or ElevenLabs directly** — all calls go through the SynqDrive Voice Orchestrator.

| Action | Capability | Approval |
|--------|------------|----------|
| `voice.call.start` | **ENABLED** | REQUIRED |

## Architecture

```
Workflow Runtime
  └─ voice.call.start → VoiceCallStartActionHandler
       └─ WorkflowVoiceCallStartService
            ├─ WorkflowVoiceCallCommunicationPolicyService (call hours, frequency)
            ├─ SmsConsentService (shared phone opt-out for non-emergency)
            ├─ Approved scenario catalog + tool allowlist
            └─ VoiceCallOrchestrationService.orchestrateOutboundCall()
                 ├─ VoiceCallPolicyService + VoiceBudgetEnforcementService
                 ├─ ElevenLabsProviderAdapter (outbound PSTN)
                 ├─ VoiceMcpTokenService (short-lived tenant MCP bearer)
                 └─ VoiceConversation (idempotency, CallSid, ConvId, workflow metadata)

Post-call: ElevenLabs post-call webhook → VoiceWebhookIngestService → lifecycle finalization
Workflow result: summary/outcome via conversation metadata linkage (no full transcript in workflow output)
```

## Config contract

```json
{
  "scenarioKey": "booking_follow_up",
  "scenarioVersion": "1.0.0",
  "callPurpose": "transactional",
  "recipient": { "type": "booking", "bookingId": "..." },
  "agentVersion": 3,
  "toolAllowlist": ["identify_customer", "find_booking"],
  "maxDurationSeconds": 300,
  "respectCallHours": true,
  "verifiedDiagnosis": false,
  "includeTechnicalDiagnosis": false,
  "sensitiveFlags": []
}
```

### Approved scenarios (v1.0.0)

| Key | Purpose | Max duration | Approval |
|-----|---------|--------------|----------|
| `booking_follow_up` | transactional, support | 300s | optional |
| `invoice_reminder` | transactional, collections | 240s | optional |
| `complaint_resolution` | support | 600s | required |
| `operational_workflow` | transactional, support | 300s | optional |
| `emergency_safety` | emergency | 900s | required + human escalation |

## Governance

| Control | Implementation |
|---------|----------------|
| Tenant isolation | All queries scoped by `organizationId` |
| No provider secrets in workflow config | Agent/deployment resolved from DB |
| Phone resolution | Customer/Booking → E.164 |
| Opt-in / purpose | `SmsConsent` + scenario `callPurpose` allowlist |
| Call hours | Assistant `businessHours` or org default Mon–Fri 09:00–18:00 |
| Contact frequency | Max 2 calls / phone / 24h; 10 / org / hour |
| AI transparency | Required by scenario; stored in conversation metadata |
| Agent version | Active `VoiceAgentDeployment` (optional pin via `agentVersion`) |
| Tool allowlist | Intersection of scenario, assistant permissions, optional config |
| MCP tokens | Issued by orchestrator after live call start (short-lived) |
| Budget / duration | Orchestrator `VoiceBudgetEnforcementService` + scenario max duration |
| Idempotency | `metadata.outboundIdempotencyKey` on `VoiceConversation` |
| Webhook security | ElevenLabs HMAC signature + `VoiceProviderWebhookEvent` replay protection |
| Post-call result | `summary`, `outcome`, `lifecycleState` — transcript not returned to workflow |
| Dry run | Preview builds **Call Plan** only — no orchestrator side effects |
| No auto diagnosis | `includeTechnicalDiagnosis` blocked; sensitive diagnostic flags require human escalation |
| Emergency | `emergency_safety` scenario requires approval; escalates to humans |

## Environment variables (VPS / provider)

| Variable | Purpose |
|----------|---------|
| `VOICE_NATIVE_TWILIO_INTEGRATION=true` | Enable native ElevenLabs–Twilio path |
| `VOICE_AI_PROVISIONING_STAGING_ENABLED=true` | Live provider calls (otherwise orchestrator dry-run) |
| `VOICE_MCP_GATEWAY=true` | MCP tool gateway + per-call tokens |
| `TWILIO_VOICE_WEBHOOK_BASE_URL` | Public base for Twilio/ElevenLabs webhooks |
| `ELEVENLABS_WEBHOOK_SECRET` | Post-call webhook signature validation |
| `VOICE_WEBHOOK_INGESTION_ENABLED=true` | Required in production for post-call processing |
| ElevenLabs API keys | Via existing voice assistant provisioning (not in workflow config) |

## Org setup (database)

- `voice_assistants`: `status=ACTIVE`, `outboundEnabled=true`, `permContactCustomers=true`
- `voice_agent_deployments`: active ElevenLabs deployment with approved version
- `voice_phone_numbers`: Twilio number imported to ElevenLabs (`ASSIGNED`)
- `voice_budget_policies` / subscription: operational for outbound

## Open provider approvals / ops

1. ElevenLabs agent deployed per org with post-call + MCP URLs configured
2. Twilio subaccount + number imported to ElevenLabs for org
3. Regulatory/country outbound calling compliance (not automated)
4. Production webhook reachability on `TWILIO_VOICE_WEBHOOK_BASE_URL`
5. Workflow resume on post-call completion (event bridge) — metadata linkage in place; durable workflow timer/event wiring is follow-up

## Tests

`backend/src/modules/workflows/actions/voice-workflow-action.spec.ts` — 14 cases covering call request, duplicate, opt-out, quiet hours, budget, foreign tenant, orchestrator unavailable, timeout, dry run, approval, post-call summary, webhook duplicate, invalid signature.
