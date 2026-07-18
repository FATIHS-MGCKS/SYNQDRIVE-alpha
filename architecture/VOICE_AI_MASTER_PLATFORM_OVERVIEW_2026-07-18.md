# Voice AI — Master platform overview (8A)

**Date:** 2026-07-18  
**Scope:** Master Admin voice control plane — platform status + organization operations center

## Summary

Master Admin **Voice Betriebszentrum** surfaces real-time platform health, operational KPIs, and a filterable organization list. Health states derive from **live provider/runtime probes** and queue/webhook metrics — not environment-variable presence alone.

## Platform status

`VoiceControlPlaneAdminService.getPlatformStatus()` aggregates:

| Signal | Source |
|--------|--------|
| ElevenLabs | `ElevenLabsProviderAdapter.checkHealth()` |
| Twilio IE1 | `TwilioControlPlaneTelephonyService.checkHealth()` (account fetch probe) |
| MCP Gateway | `VOICE_MCP_GATEWAY_ENABLED` runtime flag |
| Webhook ingestion | `VoiceProviderWebhookEvent` counts + BullMQ `voice.webhook.process` backlog/DLQ |
| Operations | `VoiceConversation`, `VoiceUsageEvent`, `VoiceAssistant`, `VoiceProvisioningJob` |

**Health states:** `healthy` | `degraded` | `incident` | `disabled` | `not_configured` — derived via `voice-platform-health.util.ts`.

**Operations KPIs (today):** calls, usage minutes, estimated cost, active voice orgs, failed provisionings.

## Organization list

`listOrganizations()` enriches `VoiceAssistantService.getAdminOverview()` with:

- Subscription plan/status, rollout status
- Masked phone number (`maskCallerNumber` / `VoicePhoneNumber.maskedPhoneNumber`)
- Agent deployment status, provisioning failure flag
- Budget status (`ok` | `near_limit` | `over_limit` | `not_set`)
- Problem status (`ok` | `warning` | `critical` | `incident`)
- Per-org provider health

## Frontend

| Module | Role |
|--------|------|
| `VoicePlatformStatusPanel` | Provider cards, queue/DLQ, incidents, today KPIs |
| `VoiceOrganizationsPanel` | Card grid + filters (plan, rollout, provider, budget, provisioning, incidents) |
| `voice-platform-overview.ops.ts` | Filter logic, health tones, `nextOrgAction`, masking helpers |
| `VoiceAssistantAdminView` | Title "Voice Betriebszentrum"; platform/orgs tabs; 60s auto-refresh |

## Security

- `MASTER_ADMIN` guard on control-plane routes (unchanged)
- Masked phone numbers and IDs only
- No transcripts, secrets, or raw provider payloads in master overview

## Tests

- `voice-platform-health.util.spec.ts` — state derivation
- `voice-control-plane-admin.service.spec.ts` — masking, guard actions, health mocks
- `voice-platform-overview.ops.test.ts` — filters, masking, health tones
- `voice-control-plane-admin.test.ts` — platform status panel render
