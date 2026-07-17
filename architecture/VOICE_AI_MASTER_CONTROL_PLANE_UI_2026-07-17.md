# Voice AI Master Admin Control Plane UI (2026-07-17)

## Scope

Master Admin surface for Voice AI operations, support, provisioning, and cost control. Replaces the legacy `VoiceAssistantAdminView` overview-only screen.

## Backend

Base path: `GET|POST /api/v1/admin/voice-assistant/control-plane/*`

| Endpoint | Purpose |
|----------|---------|
| `GET .../platform-status` | ElevenLabs, Twilio IE1, MCP gateway, webhook queue/DLQ, latency, incidents |
| `GET .../organizations` | Enriched org list (plan, minutes, budget, concurrency, errors) |
| `GET .../organizations/:orgId/workspace` | Provisioning jobs, masked numbers, agent draft/diff, billing |
| `GET .../phone-numbers` | Masked numbers only — no SIDs or secrets |
| `GET .../webhook-events` | Redacted diagnostics — no full transcripts |
| `GET .../audit-events` | Protection, tool approval, tool execution audit merge |
| `POST .../organizations/:orgId/suspend` | Requires `confirm` + `reason` |
| `POST .../webhook-events/:eventId/replay` | Requires `confirm` + `reason` + optional Idempotency-Key |
| `POST .../organizations/:orgId/agent-deployment/deploy` | Idempotent deploy |
| `POST .../organizations/:orgId/agent-deployment/rollback` | Requires `confirm` |

All routes: `@Roles('MASTER_ADMIN')` via `RolesGuard`.

Related existing routes reused from UI:
- `admin/voice-assistant/billing/*`
- `admin/voice-assistant/organizations/:orgId/twilio/*`
- `admin/voice-assistant/organizations/:orgId/elevenlabs/*`

## Frontend

- `frontend/src/master/components/VoiceAssistantAdminView.tsx` — 8-tab control plane
- `frontend/src/master/components/voice-control-plane/*` — navigation, secure action dialog
- `frontend/src/lib/api.ts` — `api.voiceAssistant.admin.controlPlane.*`

Secure write actions use `VoiceSecureActionDialog`: explicit checkbox confirmation, mandatory reason, idempotency keys where supported, toast feedback.

## Security

- No full transcripts, unmasked phone numbers, or provider secrets in default master views
- No free-form provider ID inputs
- Cross-tenant data only via master admin APIs (org-scoped workspace loads validate org id)

## Tests

- `backend/src/modules/voice-assistant/admin/voice-control-plane-admin.service.spec.ts`
- `frontend/src/master/components/voice-control-plane/voice-control-plane-admin.test.ts`
