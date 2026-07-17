# Voice AI — Production Release Runbook

**Stand:** 2026-07-17 · Prompt 10B  
**Audience:** Master Admin / Platform Ops  
**Prerequisite docs:** `architecture/VOICE_AI_PRODUCTION_READINESS_REPORT_2026-07-17.md`, `docs/runbooks/voice-incidents.md`

> This runbook does **not** authorize production deployment by itself. Execute only with explicit release mandate and after staging E2E sign-off.

---

## 1. Release principles

| Rule | Detail |
|------|--------|
| No big-bang | Tenant-wise feature flags; staging org first |
| No production customer data | Staging org + one approved test org only |
| Live PSTN gated | `VOICE_AI_PROVISIONING_STAGING_ENABLED=true` + `VOICE_E2E_ALLOW_LIVE_CALLS=true` + `VOICE_E2E_ALLOWLIST_E164` |
| No accidental number release | Rollback keeps Twilio number assigned; verify in control plane |
| Migrations | Forward-only; rollback = feature flags + agent version, not schema down |

---

## 2. Pre-release checklist

```bash
# From repo root
bash backend/scripts/ops/voice-staging-preflight.sh
# Optional: skip public webhook probe in air-gapped CI
VOICE_PREFLIGHT_SKIP_WEBHOOK_PROBE=1 bash backend/scripts/ops/voice-staging-preflight.sh
```

Verify in Master Admin → Voice AI Control Plane:

- [ ] Plattformstatus: ElevenLabs, Twilio IE1, MCP, Webhooks green
- [ ] Queue backlog ≈ 0
- [ ] Staging org readiness 100 %
- [ ] Phone number masked, `elevenLabsAssigned=true`
- [ ] No active incidents

Env (staging / canary host):

```bash
VOICE_NATIVE_TWILIO_INTEGRATION=true
VOICE_MCP_GATEWAY=true
VOICE_AI_PROVISIONING_STAGING_ENABLED=true
VOICE_MCP_TOKEN_SECRET=<dedicated-secret>
TWILIO_REGION=ie1
TWILIO_EDGE=dublin
VOICE_E2E_ORG_ID=org-voice-staging-e2e
VOICE_E2E_FORBIDDEN_ORG_IDS=<prod-org-ids>
# Live calls only when executing §4 of test matrix:
# VOICE_E2E_ALLOW_LIVE_CALLS=true
# VOICE_E2E_ALLOWLIST_E164=+49...,+49...
```

---

## 3. Canary phase 0 — staging org only

**Duration:** 24–72 hours  
**Scope:** `VOICE_E2E_ORG_ID` only

| Step | Action |
|------|--------|
| 1 | Confirm flags enabled on staging VPS only |
| 2 | Deploy agent via Control Plane (idempotency key) |
| 3 | Run inbound + outbound allowlisted smoke (≤4 short calls total) |
| 4 | Verify one `VoiceConversation` per call; `twilioCallSid` + `elevenLabsConversationId` populated |
| 5 | Verify `VoiceUsageEvent` dedup (no double minutes) |
| 6 | Monitor `synqdrive_voice_webhook_backlog`, `synqdrive_voice_mcp_errors_total` |

### Abort criteria (phase 0)

| Metric | Threshold | Action |
|--------|-----------|--------|
| Webhook signature invalid rate | > 5 / 15 min | Stop; fix secrets / proxy |
| MCP error rate | > 10% of tool calls / 1 h | Rollback agent |
| DLQ count 24h | > 20 | Pause; replay after fix |
| Budget false blocks | Any on staging org | Fix policy before widen |

---

## 4. Canary phase 1 — test organization

**Prerequisite:** Phase 0 pass  
**Scope:** One explicitly selected test org (not production customers)

| Step | Action |
|------|--------|
| 1 | Document test `organizationId` in change ticket |
| 2 | Enable voice flags for tenant only (org-level provisioning) |
| 3 | Provision subaccount + import number |
| 4 | Deploy agent; confirm MCP URL on agent |
| 5 | Limited inbound/outbound per test matrix §4 |
| 6 | Review audit tab — tool executions, no raw secrets |

### Abort criteria (phase 1)

Same as phase 0, plus:

- Cross-tenant data in conversation → **immediate rollback + incident**
- Unredacted PII in logs → **pause retention off; fix redaction**

---

## 5. Production enablement (after GO)

Only when readiness report §9 is **GO**:

1. Merge feature branch to `main`
2. Standard VPS deploy (`cloud-agent-deploy.sh`)
3. Enable flags **per org** via control plane — never global blast
4. Post-deploy: `twilio-webhook-reachability.sh` against production `APP_URL`
5. 24h hypercare: on-call reviews Grafana voice panels

**Do not** set `VOICE_E2E_ALLOW_LIVE_CALLS=true` in production.

---

## 6. Rollback procedure

### 6.1 Fast rollback (minutes)

| Order | Action |
|-------|--------|
| 1 | Disable `VOICE_NATIVE_TWILIO_INTEGRATION` / `VOICE_MCP_GATEWAY` for affected org(s) |
| 2 | Control Plane → Agent Deployments → **Rollback** (confirm + audit reason) |
| 3 | Verify active deployment version decremented |
| 4 | Confirm phone number still assigned (not released) |
| 5 | Monitor active calls — allow in-flight to complete or transfer to fallback |

### 6.2 Data rollback

- Schema migrations: **no down** — forward fix only
- Webhook DLQ: replay after root-cause fix, not mass delete
- Usage ledger: do not delete; issue adjustment via billing ops if incorrect metering proven

### 6.3 Communication

- Internal: #ops + change ticket
- Customers: only if production impact — use support template (no technical secret detail)

---

## 7. Post-release verification

- [ ] Health `GET /api/v1/health` 200
- [ ] Twilio voice + status webhooks 200
- [ ] ElevenLabs post-call webhook 2xx
- [ ] Prometheus scraping `synqdrive_voice_*`
- [ ] No increase in `VoiceProtectionAuditEvent` abuse blocks

---

## 8. References

- Test matrix: `docs/testing/voice-ai-e2e-test-matrix.md`
- Incidents: `docs/runbooks/voice-incidents.md`
- Matrix source: `backend/src/modules/voice-assistant/voice-staging-e2e.matrix.ts`
- E2E safety: `backend/src/modules/voice-assistant/e2e/voice-e2e.config.ts`
