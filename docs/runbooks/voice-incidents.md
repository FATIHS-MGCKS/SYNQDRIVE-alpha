# Voice AI Incidents — On-Call Runbook

Operational runbook for SynqDrive Voice AI (staging/production). No secret values are stored in this document.

## Quick signals

| Signal | Where to look |
|--------|----------------|
| Platform health | Master Admin → Voice AI Control Plane → Plattformstatus |
| Webhook DLQ / replay | Control Plane → Webhooks & Events |
| Queue backlog | Prometheus `synqdrive_voice_webhook_backlog`, Grafana SynqDrive Ops |
| MCP errors | `synqdrive_voice_mcp_errors_total` |
| Protection blocks | `synqdrive_voice_protection_blocks_total` |

Reachability probe (read-only): `backend/scripts/ops/twilio-webhook-reachability.sh`

---

## 1. Provider outage (ElevenLabs / Twilio)

**Symptoms:** Provider health degraded, call failures, provisioning stuck, elevated `synqdrive_voice_provider_errors_total`.

**Steps:**
1. Confirm incident in Control Plane → Plattformstatus (ElevenLabs, Twilio IE1).
2. Check provider status pages; do not rotate secrets unless compromise is confirmed.
3. Pause new outbound campaigns org-by-org via protection overrides only with documented reason.
4. If inbound must stay up: verify Twilio webhook URL + signature config (`TWILIO_AUTH_TOKEN`, `TWILIO_VOICE_WEBHOOK_BASE_URL`).
5. After recovery: replay failed webhooks from Control Plane (reason required).

---

## 2. Webhook failure / signature errors

**Symptoms:** `VoiceWebhookSignatureFailures` alert, 401 on `/webhooks/*`, `synqdrive_voice_webhook_signature_invalid_total` increasing.

**Steps:**
1. Verify reverse proxy forwards `X-Forwarded-Proto` and original path (Twilio).
2. Confirm `TWILIO_AUTH_TOKEN` / `ELEVENLABS_WEBHOOK_SECRET` match provider console — rotate via env/VPS secret sync, never commit.
3. Run `twilio-webhook-reachability.sh` from ops host.
4. Inspect redacted events in Control Plane (no raw transcripts).
5. Replay individual events after fixing root cause (`POST .../control-plane/webhook-events/:id/replay`).

---

## 3. Credential rotation

**Scope:** Twilio subaccount secrets (`env-json://` refs), MCP token secret, ElevenLabs API/webhook secrets.

**Steps:**
1. Generate new secret in provider console.
2. Update VPS/runtime env (`backend/scripts/ops/sync-twilio-env-to-vps.sh` for Twilio where applicable).
3. Deploy config reload — **do not** paste secrets into git or DB plaintext fields.
4. Restart is not required for this runbook step in normal deploy flow; follow standard VPS deploy if needed.
5. Validate: MCP token mint, test inbound webhook, check startup logs for `Voice secret check … configured` (values never logged).

---

## 4. Phone number issues

**Symptoms:** Regulatory pending, ElevenLabs import failures, masked number shows disconnected.

**Steps:**
1. Control Plane → Telefonnummern / Org Workspace → masked number + regulatory status.
2. Twilio regulatory: `GET .../twilio/regulatory-status` (master).
3. Reconnect: secure action «Nummer neu verbinden» (ElevenLabs import + assign) with idempotency key.
4. Audit trail: Control Plane → Audit & Sicherheit.

---

## 5. Agent rollback

**Symptoms:** Bad deployment, elevated tool errors, readiness failures.

**Steps:**
1. Org Workspace → Agent Deployment diff/readiness.
2. Execute rollback via Control Plane (confirm + audit).
3. Verify active deployment version and MCP tool allowlist.
4. Monitor `synqdrive_voice_mcp_errors_total` for 15 minutes.

---

## 6. Budget / abuse incident

**Symptoms:** `VoiceProtectionBlocksSpike`, outbound blocked, concurrent limit errors.

**Steps:**
1. Control Plane → Organisation → usage/billing + protection audit.
2. Confirm legitimate usage vs abuse signals (no PII in metrics).
3. Time-boxed master override only via `admin/voice-assistant/protection/.../overrides` with reason + expiry.
4. Suspend org only with explicit confirm + reason if warranted.

---

## 7. Privacy deletion / retention

**Symptoms:** GDPR erasure request, retention policy change.

**Steps:**
1. Active deployment `privacyRetention` defines transcript/summary/provider payload windows.
2. Nightly job: `VoiceRetentionScheduler` (04:15 UTC) — disable via `VOICE_RETENTION_ENABLED=false` only for emergency.
3. Manual purge: `VoiceRetentionService.purgeOrganization(orgId)` from ops script/console.
4. Master admin content access remains off by default (`masterAdminContentAccess: false`).
5. Log all master admin access via protection audit + control plane audit events.

---

## Escalation

- Queue worker down: check `voice.webhook.process` in BullMQ / PM2 workers
- Redis unavailable: MCP replay protection and concurrent reservations degrade — see voice protection module logs (structured, no PII)
- ClickHouse: optional for voice; voice state is PostgreSQL — do not modify ClickHouse for voice incidents
