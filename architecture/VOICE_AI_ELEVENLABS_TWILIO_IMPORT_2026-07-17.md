# Voice AI — ElevenLabs Twilio Number Import & Assign (2026-07-17)

| Field | Value |
|-------|-------|
| **Status** | **IMPLEMENTED (Prompt 4B)** |
| **ADR** | `architecture/VOICE_AI_PRODUCTION_ARCHITECTURE_ADR_2026-07-17.md` §4.2 |

## Master-admin routes

`admin/voice-assistant/organizations/:orgId/elevenlabs/phone-numbers/:phoneNumberId/*`

- `GET import-readiness`
- `POST import-and-assign` (idempotent job `ELEVENLABS_NUMBER_IMPORT`)
- `POST deactivate` (unassign, keep number)

## Credential policy

ElevenLabs native integration requires **subaccount Account SID + Auth Token** (official docs). API keys alone are rejected. Parent account credentials are never passed to ElevenLabs.

Subaccount auth token is stored only in the secret store (`authToken` field on subaccount credential JSON).

## Import statuses

`NOT_IMPORTED` → `IMPORTING` → `IMPORTED` → `ASSIGNED` (or `FAILED`)

Protected refs: Twilio SID in `protectedExternalRef`, ElevenLabs `phone_number_id` in `protectedElevenLabsRef`.

## Safety

- `VOICE_AI_NATIVE_TELEPHONY` + `VOICE_AI_PROVISIONING_STAGING_ENABLED` gate live provider calls
- `confirm=true` + `idempotency-key` required
- Assignment rollback on failure; Twilio number never auto-released
