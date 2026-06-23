# Voice Assistant (ElevenLabs)

Org-scoped AI voice assistant with telephony, conversations, and Master Admin monitoring.

## Required environment

| Variable | Description |
|----------|-------------|
| `ELEVENLABS_API_KEY` | Server-side ElevenLabs API key. Never exposed to the frontend. Without it, provider checks fail and activation/sync are blocked. |

## Activation prerequisites

`POST /organizations/:orgId/voice-assistant/activate` runs `computeReadiness(forActivation: true)` and rejects with `400` when not ready.

Typical required items:

- Assistant name, system prompt, voice, greeting
- Escalation or fallback configured
- ElevenLabs configured on the server (`ELEVENLABS_API_KEY`)
- Agent provisioned on first successful activation
- Phone number assigned when telephony/inbound is enabled

The frontend disables **Activate** until `readiness.ready` is true (deactivate remains available when already active).

## Telephony status

`computeTelephonyStatus` reports operational states: provider not connected, agent not provisioned, no phone number, assigned but inactive, ready for inbound, or telephony disabled. Inbound cannot be enabled without an assigned phone number (validated on `PATCH telephony-settings`).

## Test Center

`POST .../test-session` returns a structured session (`ready` | `blocked`). The signed WebSocket URL is only in `developerDetails` for optional dev use — not a production operator surface. Live transcripts during tests are not synthesized; use ElevenLabs test UI via the signed URL when a session is ready.

## Security

- Tenant routes: `OrgScopingGuard` + `RolesGuard`; `organizationId` comes from the URL only, never from the request body.
- Master routes: `GET|POST /admin/voice-assistant/*` — `MASTER_ADMIN` only.
- Caller numbers are masked in conversation APIs; Master Admin detail omits full transcripts.
- Conversation sync deduplicates per organization (`organizationId` + provider conversation id).
