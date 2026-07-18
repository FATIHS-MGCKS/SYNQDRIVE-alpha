# Voice AI Staging Provisioning (Prompt 9B)

Date: 2026-07-18

## Orchestration

`backend/scripts/ops/voice-staging-provision.ts` — idempotent 10-step staging provision for `org-voice-staging-e2e` only.

## Code fixes

| Area | Change |
|------|--------|
| Twilio IE1 | `createTwilioAccountsManagementClient` uses parent Auth Token (US Account Admin API) |
| Staging TRIAL | `isVoiceStagingOrganization` bypasses trial purchase block when staging flag on |
| ElevenLabs | Non-`en` agents set `tts.model_id=eleven_turbo_v2_5` |
| Credentials | `persistSubaccountCredentialsToEnvFile` writes `env-json://` ref to host env |

## Known blocker

Parent Twilio account on IE1 realm does not support `accounts.create` — staging subaccount must be created via Console or US-capable parent, then registered.

## Report

`docs/audits/voice-ai-staging-provisioning-report.md`
