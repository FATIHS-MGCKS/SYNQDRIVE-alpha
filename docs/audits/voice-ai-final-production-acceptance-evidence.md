# Voice AI Final Production Acceptance — Anonymized Evidence

**Date:** 2026-07-18  
**Related:** `architecture/VOICE_AI_FINAL_PRODUCTION_ACCEPTANCE_2026-07-18.md`

All identifiers masked. No secrets, transcripts, or full E.164 values.

---

## Deployment snapshot

```json
{
  "originMain": "ffcb3e0c",
  "vpsRelease": "20260718004214_v4994",
  "vpsCommit": "ac856881",
  "deployMatch": false,
  "publicHealth": "200",
  "pm2Synqdrive": "online"
}
```

---

## Runtime flags (presence / value only)

| Key | Value |
|-----|-------|
| `VOICE_NATIVE_TWILIO_INTEGRATION` | `true` |
| `VOICE_MCP_GATEWAY` | `true` |
| `VOICE_WEBHOOK_INGESTION_ENABLED` | **`false`** |
| `VOICE_AI_PROVISIONING_STAGING_ENABLED` | `true` |
| `VOICE_E2E_ALLOW_LIVE_CALLS` | `false` |
| `VOICE_E2E_ORG_ID` | `org-vo…-e2e` |
| `TWILIO_REGION` | `ie1` |
| `TWILIO_EDGE` | `dublin` |
| `ELEVENLABS_WEBHOOK_SECRET` | configured (redacted) |
| `VOICE_LEGACY_DIAGNOSTIC_CALLS` | unset → false |

---

## Database counts (VPS, 2026-07-18T03:27Z)

```json
{
  "global": {
    "voiceConversations": 0,
    "voiceUsageEvents": 0,
    "voiceToolExecutions": 0,
    "voiceProviderAccounts": 0,
    "voicePhoneNumbers": 0,
    "voiceAgentDeployments": 2
  },
  "stagingOrg": {
    "subscription": { "status": "TRIAL", "planReference": "rollout:STAGING" },
    "conversations": 0,
    "deployments": [
      { "version": 1, "status": "FAILED", "failedAt": "2026-07-18T03:20:52.888Z" },
      { "version": 0, "status": "DRAFT" }
    ],
    "assistant": {
      "status": "DRAFT",
      "connectionStatus": "NOT_CONFIGURED",
      "telephonyEnabled": false
    }
  }
}
```

---

## Live call evidence

| Field | Inbound | Outbound |
|-------|---------|----------|
| Twilio Call SID | — | — |
| ElevenLabs Conversation ID | — | — |
| SynqDrive `VoiceConversation` id | — | — |
| MCP `VoiceToolExecution` | — | — |
| Post-call webhook event | — | — |
| `VoiceUsageEvent` | — | — |
| Outcome | — | — |

**No live calls executed during 10A or 10B audits.**

---

## Automated test summary

| Suite | Tests | Result |
|-------|-------|--------|
| `test:voice:security` | 49 | PASS |
| `test:voice:staging-e2e` | 39 | PASS |
| `audit:voice-secrets` | scan | PASS |
| Voice control plane Vitest | 19 | PASS |

---

## MCP public probe

```
POST /api/v1/mcp/voice/org-vo…-e2e
→ 401 Missing MCP bearer token
```

---

## Prior phase decisions

| Phase | Decision |
|-------|----------|
| 9A Preflight | GO with gaps |
| 9B Provisioning | NO-GO |
| 10A Real staging E2E | **NO-GO** |
| 10B Final production | **NO-GO** |
