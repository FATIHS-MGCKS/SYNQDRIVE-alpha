# Voice AI Staging IE1 Remediation (2026-07-18)

## Problem

Twilio parent account on **IE1 realm** blocks programmatic APIs:

- `accounts.create` (subaccount provisioning)
- `availablePhoneNumbers` / number purchase via REST

## Remediation shipped

| Component | Path |
|-----------|------|
| Credential import service | `TwilioTenantProvisioningService.importSubaccountCredentials` |
| IE1 env resolver | `voice-staging-twilio-import.util.ts` |
| Ops script | `npm run voice:staging:import-subaccount -- --apply` |
| Provision fallback | `voice-staging-provision.ts` auto-import on IE1 block |

### Env options (staging org only)

1. **Console subaccount (preferred):** `VOICE_STAGING_TWILIO_SUBACCOUNT_SID` + `VOICE_STAGING_TWILIO_AUTH_TOKEN`
2. **Parent fallback (temporary):** `VOICE_STAGING_TWILIO_USE_PARENT_ACCOUNT=true` + parent `TWILIO_ACCOUNT_SID` / `TWILIO_AUTH_TOKEN`

Credentials persist to `VOICE_TWILIO_SUB_<ORG>` in `backend.env` as `env-json://`.

## VPS execution result (2026-07-18)

| Step | Status |
|------|--------|
| Subaccount import (parent fallback) | **PASS** |
| Agent deploy v2 | **ACTIVE** |
| Phone number (API purchase) | **FAIL** — IE1 `availablePhoneNumbers` blocked |
| ElevenLabs import | skipped (no number) |

## Remaining manual step

Purchase a **DE voice** number in **Twilio Console** (IE1 account), then register via Master Control Plane or a follow-up import script.

After number + EL import: enable `VOICE_WEBHOOK_INGESTION_ENABLED=true`, run 10A live canary with allowlist.
