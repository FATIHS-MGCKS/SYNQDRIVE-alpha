# Voice AI Staging Provisioning Report (Prompt 9B)

**Generated:** 2026-07-18  
**Organization:** `org-vo…-e2e` (`VOICE-STAGING-E2E`)  
**Live E2E decision:** **NO-GO**

## Summary

Staging host secrets and feature flags were configured. Provisioning orchestration ran against the staging tenant with cost-incurring actions enabled (`VOICE_AI_PROVISIONING_STAGING_ENABLED=true`). **No live PSTN call was started.**

Automated provisioning **did not complete** due to Twilio IE1 account-admin API limitations and an ElevenLabs German model constraint (latter fixed in code).

## Subscription

| Field | Value |
|-------|-------|
| Status | `TRIAL` |
| Plan | `START` |
| Rollout | `rollout:STAGING` |
| Production billing | No |

## Subaccount

| Field | Value |
|-------|-------|
| Status | **Not provisioned** |
| Region target | `ie1` / `dublin` |
| Blocker | Twilio API `accounts.create` returns `Endpoint is not supported in realm 'ie1'` on parent account |
| Remediation | Create dedicated staging subaccount in Twilio Console (US account admin), then register via `POST .../twilio/credentials/register` with `env-json://` ref — never parent credentials in tenant runtime |

## Regulatory

| Field | Value |
|-------|-------|
| Overall | `UNKNOWN` (no subaccount phone search yet) |
| Manual review | Not paused — proceed after subaccount exists |

## Phone number

| Field | Value |
|-------|-------|
| Status | **Not purchased** |
| Reason | Subaccount prerequisite failed |
| Planned | DE local, voice capability, staging subaccount only |

## Agent / deployment

| Field | Value |
|-------|-------|
| Status | **Deploy failed** (first attempt) |
| Error | Non-English agent requires `eleven_turbo_v2_5` model |
| Code fix | `elevenlabs-provider.adapter.ts` sets `model_id` for non-`en` languages |
| Retry | Re-run `npm run voice:staging:provision -- --apply` after subaccount exists |

## MCP

| Field | Value |
|-------|-------|
| `VOICE_MCP_GATEWAY` | enabled on host |
| Token secret | configured (presence only) |

## Webhooks

| Field | Value |
|-------|-------|
| Public base | `https://app.synqdrive.eu` |
| `ELEVENLABS_WEBHOOK_SECRET` | configured (presence only) |
| `VOICE_WEBHOOK_INGESTION_ENABLED` | recommend `true` on host |

## Readiness

| Check | Result |
|-------|--------|
| Agent draft readiness (post-fix draft) | Pass (escalation/fallback patched) |
| Deploy active | No |
| Test center simulation | Deferred — no live call |
| `VOICE_E2E_ALLOW_LIVE_CALLS` | `false` (correct) |

## Provisioning steps

| Step | Status | Detail |
|------|--------|--------|
| subscription | pass | TRIAL / rollout:STAGING |
| twilio_subaccount | fail | IE1 realm does not support Account Admin API create |
| regulatory | pass | UNKNOWN |
| phone_number | skip | Subaccount missing |
| agent_deploy | fail | EL model constraint (fixed in repo) |
| elevenlabs_import | skip | No number/deployment |
| mcp_webhooks | pass/warn | Secrets present; deploy incomplete |
| test_simulation | skip | Deferred |

## Costs

| Item | Status |
|------|--------|
| Twilio subaccount create | Not charged (failed) |
| Phone number | Not purchased |
| ElevenLabs agent | API calls only (deploy failed) |
| Audit trail | `ActivityLog` cost actions when steps succeed |
| Budget cap | 500¢/month, 100¢/day (staging org policy) |

## Rollback

| Action | Path |
|--------|------|
| Agent rollback | `POST /admin/.../agent-deployment/rollback` |
| Import deactivate | `POST /admin/.../elevenlabs/phone-numbers/:id/deactivate` |
| Subaccount | Manual Twilio console if created |

## Live E2E GO/NO-GO

**NO-GO** — blockers:

1. Staging Twilio subaccount not provisioned (IE1 Account Admin API limitation on parent).
2. German DE phone number not purchased.
3. ElevenLabs agent not deployed to active assignment.
4. Number import / MCP live path not verified end-to-end.

## Next steps

1. Merge code fixes (IE1 management client, staging TRIAL bypass, EL `model_id`, provision script).
2. Create staging subaccount manually in Twilio Console OR migrate parent to US-admin-capable account.
3. Register subaccount credentials to `backend.env` (`VOICE_TWILIO_SUB_ORG_VOICE_STAGING_E2E` JSON ref).
4. Re-run: `VOICE_STAGING_PROVISION_ALLOW_PROD=1 npm run voice:staging:provision -- --apply`
5. Keep `VOICE_E2E_ALLOW_LIVE_CALLS=false` until Master canary with allowlist.

**Explicit non-actions:** No production org touched. No live call started.
