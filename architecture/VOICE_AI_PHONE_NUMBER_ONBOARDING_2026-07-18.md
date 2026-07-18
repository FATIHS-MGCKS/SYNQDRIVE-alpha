# Voice AI — Professional Phone Number Onboarding (Prompt 6A)

**Date:** 2026-07-18

## Goal

Replace provider-centric telephony wizard with customer-facing managed-service onboarding. No ElevenLabs/Twilio SIDs, API keys, or external purchase prompts in the org UI.

## Paths (A–D)

| Path | ID | Flow |
|------|-----|------|
| A — New SynqDrive number | `new_synqdrive_number` | DE area code search → masked results → preview (dry-run) → explicit paid confirm → Twilio subaccount purchase job |
| B — Forward existing | `forward_existing` | SynqDrive target (masked) + carrier forwarding rules + loop protection + test status |
| C — Port number | `port_number` | Document checklist, DE restrictions, 2–6 week timeline, no instant activation |
| D — SIP/PBX | `sip_pbx` | Enterprise support request only |

## Status machine

`not_started` → `path_selected` → `evidence_required` / `under_review` → `reserved` → `active`  
Failure/suspension: `failed`, `suspended`

Derived from `VoicePhoneNumber.lifecycle`, `VoiceProvisioningJob`, regulatory status, and persisted `voice_assistants.phone_onboarding` JSON.

## Org APIs

`GET/POST/PATCH …/organizations/:orgId/voice-assistant/phone-onboarding/*`

- Wraps `TwilioTenantProvisioningService` (org-scoped, `OrgScopingGuard`)
- Search returns `selectionToken` only — full E.164 resolved server-side
- Purchase requires `confirm: true` + idempotency (no test purchases)
- ActivityLog audit on path select, purchase, forward test, SIP request

## Security

- Organization subaccount only (no parent account list)
- Masked numbers/SIDs in all tenant responses
- Technical provider diagnostics remain under Settings → Diagnostics (readiness checks)

## Frontend

- `VoicePhoneOnboardingPanel` replaces `VoiceTelephonyWizard`
- Mobile accordion for number search results
- DE/EN i18n under `voice.phone.*`

## Tests

- `voice-phone-onboarding.service.spec.ts` — confirmation, path guard, regulatory
- `voice-phone-onboarding.ops.test.ts` — status tones, wizard completion
- No live number purchase in tests (dry-run / mocks only)
