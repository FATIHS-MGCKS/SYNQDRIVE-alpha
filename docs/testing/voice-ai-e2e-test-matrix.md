# Voice AI — E2E Test Matrix

**Stand:** 2026-07-17 · Prompt 10B  
**Source of truth (code):** `backend/src/modules/voice-assistant/voice-staging-e2e.matrix.ts`  
**Scenario count:** 28

---

## 1. Grundregeln

| Regel | Umsetzung |
|-------|-----------|
| Keine Produktionsorganisation | `VOICE_E2E_ORG_ID` = dedizierte Staging-Org; `VOICE_E2E_FORBIDDEN_ORG_IDS` |
| Keine echten Kundendaten | Synthetische Kunden in Staging-Org |
| Live PSTN nur mit Doppel-Gate | `VOICE_E2E_ALLOW_LIVE_CALLS=true` **und** `VOICE_E2E_ALLOWLIST_E164` |
| Staging-Provisioning | `VOICE_AI_PROVISIONING_STAGING_ENABLED=true` |
| CI vs. Staging trennen | CI = gemockte Unit/Matrix/Playwright; Live = manuell |
| Wenige kurze Calls | Max. ~4 Calls pro Staging-Lauf |

---

## 2. Umgebung

### 2.1 Variablen (`backend/.env`)

```bash
# Staging voice stack
VOICE_NATIVE_TWILIO_INTEGRATION=true
VOICE_MCP_GATEWAY=true
VOICE_AI_PROVISIONING_STAGING_ENABLED=true
VOICE_MCP_TOKEN_SECRET=<dedicated-secret>
TWILIO_REGION=ie1
TWILIO_EDGE=dublin
TWILIO_VOICE_WEBHOOK_BASE_URL=https://<staging-host>

# E2E safety (manual live calls only)
VOICE_E2E_ORG_ID=org-voice-staging-e2e
VOICE_E2E_FORBIDDEN_ORG_IDS=org-prod-main
VOICE_E2E_ALLOW_LIVE_CALLS=false          # true only during §4 manual run
VOICE_E2E_ALLOWLIST_E164=+49170...,+49800...
```

### 2.2 Preflight

```bash
bash backend/scripts/ops/voice-staging-preflight.sh
# CI without public URL:
VOICE_PREFLIGHT_SKIP_WEBHOOK_PROBE=1 bash backend/scripts/ops/voice-staging-preflight.sh
```

### 2.3 Automatisierte Suites

```bash
cd backend && npm run test:voice:security
cd backend && npm run test:voice:staging-e2e
cd frontend && npm run test:voice:e2e
```

---

## 3. Szenario-Übersicht

| ID | Key | Tier | CI | Live | Area |
|----|-----|------|----|------|------|
| 1 | preflight-branch-migrations | preflight | ✓ | | preflight |
| 2 | preflight-feature-flags | preflight | ✓ | | preflight |
| 3 | preflight-twilio-ie1-webhooks | preflight | | | preflight |
| 4 | provisioning-subaccount-status | integration-mock | ✓ | | provisioning |
| 5 | agent-deploy-readiness | integration-mock | ✓ | | agent |
| 6 | phone-number-import-assign | integration-mock | ✓ | | telephony |
| 7 | mcp-read-tools | ci-mock | ✓ | | mcp |
| 8 | mcp-controlled-writes | ci-mock | ✓ | | mcp |
| 9 | webhook-signatures | ci-mock | ✓ | | webhooks |
| 10 | event-correlation | ci-mock | ✓ | | webhooks |
| 11 | usage-ledger-dedup | unit | ✓ | | billing |
| 12 | budget-limit-enforcement | integration-mock | ✓ | | protection |
| 13 | cross-tenant-negative | ci-mock | ✓ | | data |
| 14 | live-inbound-greeting | e2e-manual-live | | ✓ | telephony |
| 15 | live-inbound-booking-fallback | e2e-manual-live | | ✓ | telephony |
| 16 | live-outbound-user | e2e-manual-live | | ✓ | telephony |
| 17 | live-outbound-no-answer | e2e-manual-live | | ✓ | telephony |
| 18 | provider-elevenlabs-down | e2e-manual-failure | ✓ | | resilience |
| 19 | provider-twilio-error | e2e-manual-failure | ✓ | | resilience |
| 20 | mcp-timeout-retry | ci-mock | ✓ | | resilience |
| 21 | webhook-dlq-replay | integration-mock | ✓ | | webhooks |
| 22 | failed-transfer-budget | integration-mock | ✓ | | protection |
| 23 | data-conversation-record | ci-mock | ✓ | | data |
| 24 | data-tool-audit-privacy | ci-mock | ✓ | | data |
| 25 | canary-staging-org | e2e-manual-live | ✓ | | canary |
| 26 | canary-test-org-flags | e2e-manual-live | | | canary |
| 27 | rollback-flags-agent-number | integration-mock | ✓ | | rollback |
| 28 | control-plane-ui-master | integration-mock | ✓ | | ui |

---

## 4. Manuelle Live-Calls (Staging)

**Voraussetzung:** `VOICE_E2E_ALLOW_LIVE_CALLS=true`, Allowlist gesetzt, Staging-Agent deployed.

### §4.1 Inbound — Begrüßung & Kundenerkennung

1. Von erlaubtem Handset Staging-DID anrufen
2. Begrüßung innerhalb 3s
3. Synthetischen Kunden nennen (Staging-Datensatz)
4. Erwartung: MCP read `lookup_customer` auditiert in Control Plane

### §4.2 Inbound — Buchung & Fallback

1. Buchungsnummer abfragen
2. Unbekannte Frage stellen
3. Erwartung: Mitarbeiter-Transfer oder kontrollierter Fallback (kein Hang)

### §4.3 Outbound — User-initiiert

1. Rental Voice UI oder API `POST .../calls/outbound` mit Idempotency-Key
2. Ziel = Allowlist-Nummer
3. Gespräch < 60s; auflegen
4. `VoiceConversation` COMPLETED; Usage ≥ 1 Minute (grace rules)

### §4.4 Outbound — No Answer / Busy / Max Duration

1. Allowlist-Nummer nicht annehmen → No Answer
2. Optional: besetzte Leitung simulieren
3. Max-Duration-Policy prüfen (Protection)
4. Kosten in Master Billing sichtbar; keine Doppelbuchung

---

## 5. Providerstörungen (manuell / teilweise automatisiert)

### §5.1 ElevenLabs nicht erreichbar

- Staging: API-Key temporär ungültig **nur in isoliertem Test** oder Provider-Mock
- Erwartung: degradierter Inbound, Metrik `synqdrive_voice_provider_errors_total`, kein Secret-Leak

### §5.2 Twilio Fehler

- Falsche Signatur → 401, kein Conversation-Write
- Erwartung: `synqdrive_voice_webhook_signature_invalid_total`

### §5.3 MCP Timeout

- Automatisiert: rate-limit + resilience specs
- Manuell: `VOICE_MCP_TOOL_TIMEOUT_MS` niedrig setzen → Tool-Fehler auditiert

### §5.4 DLQ & Replay

1. Event absichtlich failing (invalid payload in staging)
2. DLQ sichtbar in Control Plane
3. Replay mit Begründung nach Fix

### §5.5 Transfer-Fehler & Budget

- Transfer auf ungültiges Ziel → FAILED outcome, Audit
- Budget 100 % → Outbound blockiert, Inbound-Degradation per Policy

---

## 6. Datenprüfung

### §6.1 Conversation & Korrelation

- [ ] Genau ein `VoiceConversation` pro abgeschlossenem Call
- [ ] `twilioCallSid` und `elevenLabsConversationId` gesetzt und korreliert
- [ ] `lifecycleState` monoton (kein Rücksprung)
- [ ] Outcome plausibel (COMPLETED / NO_ANSWER / FAILED)

### §6.2 Tool Executions & Privacy

- [ ] `VoiceToolExecution` je MCP-Aufruf
- [ ] Keine API-Keys in DB/UI/Logs
- [ ] Telefonnummern maskiert in Master UI
- [ ] Retention-Job aktiv (`VOICE_RETENTION_ENABLED`)

---

## 7. Canary

### §7.1 Staging-Organisation

- Nur `VOICE_E2E_ORG_ID`
- 24–72h Monitoring laut Release-Runbook

### §7.2 Testorganisation

- Eine explizit benannte Org
- Tenantweise Flags — kein globaler Big-Bang

---

## 8. Rollback

### §8.1 Automatisiert abgedeckt

- Control Plane rollback API
- Feature-Flag-Orchestrierung in Tests

### §8.2 Manuell

1. Flags aus
2. Agent-Version zurück
3. Nummernzuordnung prüfen (nicht freigegeben)
4. Laufende Gespräche kontrolliert beenden

---

## 9. CI-Kommandos (Zusammenfassung)

```bash
cd backend && npm run audit:voice-secrets
cd backend && npm run test:voice:security
cd backend && npm run test:voice:staging-e2e
cd frontend && npm run test:voice:e2e
git diff --check
```

---

## 10. Verweise

- Readiness: `architecture/VOICE_AI_PRODUCTION_READINESS_REPORT_2026-07-17.md`
- Release: `docs/runbooks/voice-ai-production-release.md`
- Incidents: `docs/runbooks/voice-incidents.md`
- E2E config: `backend/src/modules/voice-assistant/e2e/voice-e2e.config.ts`
