# Voice AI Staging Preflight (Prompt 9A)

Date: 2026-07-18

## Summary

Prepares a dedicated internal staging tenant and secure secret/policy prerequisites for real Voice provisioning — without purchasing numbers, deploying agents, or placing calls.

## Components

| Path | Role |
|------|------|
| `backend/src/modules/voice-assistant/staging/voice-staging.constants.ts` | Canonical staging org id/short code |
| `backend/src/modules/voice-assistant/staging/voice-staging-preflight.util.ts` | Secret presence, policy snapshot, GO/NO-GO |
| `backend/scripts/ops/voice-staging-org-bootstrap.ts` | Idempotent synthetic org bootstrap |
| `backend/scripts/ops/voice-staging-preflight-probes.ts` | Runtime probes (JSON, no secret values) |
| `backend/.env.voice-staging.example` | Staging host policy template |
| `docs/audits/voice-ai-staging-preflight.md` | Audit report |

## Security rules

- No secret values in git, DB plaintext, logs, or audit markdown.
- Subaccount credentials referenced via `env-json://` after provisioning only.
- IE1/Dublin Twilio region enforced via env template.

## GO/NO-GO

`deriveProvisioningGoNoGo()` returns NO-GO until staging org exists, required secrets present, staging flags enabled, and live calls remain disabled.
