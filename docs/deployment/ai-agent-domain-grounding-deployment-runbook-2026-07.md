# Fleet AI Domain Grounding — Deployment Runbook — 2026-07

| Feld | Wert |
|------|------|
| **Runbook ID** | `ai-agent-domain-grounding-deployment-runbook-2026-07` |
| **Prompt** | 30 von 32 — production-ready Überarbeitung |
| **Datum** | 2026-07-25 (UTC) |
| **Branch (Entwicklung)** | `cursor/ai-deployment-runbook-eafa` |
| **Ziel-Release** | Merge PRs #847–#848+ nach `main`, dann kontrolliertes VPS-Deploy |
| **Status** | **Vorbereitung — kein unkontrolliertes Production-Deploy** |

---

## Konfigurationsaudit (Zusammenfassung)

Vollständiger Audit vor Deploy. Schweregrad: **BLOCKER** stoppt Deploy; **CRITICAL/HIGH** müssen vor Go-Live behoben oder explizit abgenommen sein.

| ID | Severity | Bereich | Finding | Status |
|----|----------|---------|---------|--------|
| DEP-01 | **HIGH** | Feature Flag | Kein Orchestrator-Rollout-Flag vor Prompt 30 | ✅ `FLEET_CHAT_DOMAIN_GROUNDING_ENABLED` + `FLEET_CHAT_ORG_ALLOWLIST` |
| DEP-02 | **HIGH** | Fallback | Kein Legacy-Chat-Pfad bei deaktiviertem Orchestrator | ✅ `runLegacyDirectLlm` in `ChatService` |
| DEP-03 | **MEDIUM** | Monitoring | `GET /api/v1/ai/health` war JWT-pflichtig | ✅ Public-Pfad für Ops-Probe (keine Secrets) |
| DEP-04 | **MEDIUM** | Secrets | Keine Live-Keys im Repo | ✅ Nur `.env.example` Platzhalter |
| DEP-05 | **INFO** | DIMO Agents | Keine aktiven DIMO-Agents-LLM-Endpunkte | ✅ `dimoAgentId` = Provider-Label (Mistral) |
| DEP-06 | **INFO** | PORT | `.env.example` `3000` vs Vite-Proxy `3001` | Dokumentiert — VPS nutzt `3001` |
| DEP-07 | **LOW** | Observability | Keine Fleet-Chat-Prometheus-Metriken | Post-Deploy Backlog |
| DEP-08 | **LOW** | Nginx | Kein dediziertes AI-Streaming-Snippet | `X-Accel-Buffering: no` im Controller |

---

## 1. Voraussetzungen

### 1.1 Code & CI

- [ ] Alle Fleet-AI-PRs (#847 Flow E2E, #848 Security Audit, #849+ Deployment) in `main` gemerged
- [ ] `npm test -- --testPathPattern='src/modules/ai/'` grün (Ziel: **440+** Tests)
- [ ] `npm run build` Backend + Frontend erfolgreich
- [ ] Keine offenen **BLOCKER/CRITICAL** aus `docs/audits/ai-agent-security-hallucination-review-2026-07.md`

### 1.2 VPS / Infrastruktur

| Komponente | Pfad / Check |
|------------|----------------|
| **PostgreSQL** | `DATABASE_URL` in `/opt/synqdrive/shared/backend.env` |
| **Redis** | `REDIS_HOST`/`PORT` — BullMQ + AI rate limits + tool cache |
| **PM2** | `synqdrive` auf Port **3001** (`curl -sf http://127.0.0.1:3001/api/v1/health`) |
| **Nginx** | `app.synqdrive.eu` → Backend; `client_max_body_size` ≥ 20m; Proxy-Timeout ≥ 300s |
| **Disk** | Root &lt; 85% vor Deploy (`vps-deploy-release.sh` abort bei ≥ 90%) |

### 1.3 Secrets (Runtime — niemals in Git)

| Variable | Typ | Pflicht für Fleet Chat |
|----------|-----|------------------------|
| `MISTRAL_API_KEY` | Runtime Secret | **Ja** |
| `JWT_SECRET` | Runtime Secret | Ja (Auth + AI audit pepper fallback) |
| `CLERK_*` | Runtime Secret | Ja (Frontend Auth) |
| `REDIS_PASSWORD` | Runtime Secret | Ja (Prod) |
| `AI_AUDIT_USER_REF_PEPPER` | Optional | Empfohlen (statt JWT_SECRET-Fallback) |

Sync-Hilfe: `backend/scripts/ops/sync-mistral-env-to-vps.sh` (kopiert `AI_*`, `MISTRAL_*`, `DOCUMENT_AI_*`).

### 1.4 Environment-Variablen (Fleet AI — Referenz)

Quelle: `backend/.env.example`, `backend/src/config/ai.config.ts`.

#### LLM / Mistral

| Variable | Default | Beschreibung |
|----------|---------|--------------|
| `AI_PROVIDER` | `mistral` | Einziger Provider |
| `MISTRAL_API_KEY` | — | API-Schlüssel (**Pflicht**) |
| `MISTRAL_BASE_URL` | SDK-Default `https://api.mistral.ai` | Optional Override |
| `MISTRAL_CHAT_MODEL` | `mistral-large-latest` | Fleet Chat Completion |
| `MISTRAL_ROUTER_MODEL` | `mistral-small-latest` | Intent/JSON |
| `MISTRAL_JSON_MODEL` | `mistral-small-latest` | Structured JSON |
| `MISTRAL_REASONING_MODEL` | `mistral-large-latest` | Reasoning |
| `MISTRAL_OCR_MODEL` | `mistral-ocr-latest` | OCR (Document AI) |
| `MISTRAL_OCR_TIMEOUT_MS` | `120000` | OCR Timeout |
| `AI_STREAMING_ENABLED` | `true` | SSE; `false` → Complete-Fallback |

#### Rollout (Prompt 30)

| Variable | Prod-Empfehlung | Beschreibung |
|----------|-----------------|--------------|
| `FLEET_CHAT_DOMAIN_GROUNDING_ENABLED` | `false` → Canary → `true` | Orchestrator mit Domain-Tools |
| `FLEET_CHAT_ORG_ALLOWLIST` | Pilot-Org-UUIDs | Nur diese Orgs erhalten Orchestrator wenn gesetzt |

**Verhalten ohne explizite Prod-Env:** `NODE_ENV=production` und unset Flag → Orchestrator **OFF** (Legacy Direct-LLM).

#### Limits, Cache, Timeouts (Prompt 26)

| Variable | Default |
|----------|---------|
| `AI_AGENT_LIMITS_ENABLED` | `true` |
| `AI_AGENT_LIMITS_FAIL_OPEN` | `true` (Redis-Ausfall → warn, nicht blockieren) |
| `AI_AGENT_RATE_LIMIT_PER_USER_PER_MINUTE` | `30` |
| `AI_AGENT_RATE_LIMIT_PER_ORG_PER_MINUTE` | `120` |
| `AI_AGENT_RATE_LIMIT_PER_IP_PER_MINUTE` | `60` |
| `AI_AGENT_MAX_CONCURRENT_PER_ORG` | `5` |
| `AI_AGENT_MAX_CONCURRENT_PER_USER` | `2` |
| `AI_AGENT_REQUEST_TIMEOUT_MS` | `45000` |
| `AI_AGENT_MAX_TOOL_INVOCATIONS_PER_CHAT` | `8` |
| `AI_AGENT_MAX_TOKENS_PER_LLM_CALL` | `768` |
| `AI_AGENT_TOOL_CACHE_ENABLED` | `true` |
| Orchestrator intern | LLM 25s / Tool-Budget 30s (`fleet-chat-orchestrator.types.ts`) |
| Mistral SDK Client | **120s** hardcoded (`mistral-sdk-client.provider.ts`) |

Redis Cache-Prefix: `synqdrive:ai-chat:tool:{orgId}:{toolName}:{hash}`.

#### Audit Logging (Prompt 25)

| Variable | Default |
|----------|---------|
| `AI_AUDIT_LOGGING_ENABLED` | `true` |
| `AI_AUDIT_STORE_PLAIN_USER_ID` | `false` |
| `AI_AUDIT_RETENTION_DAYS` | `730` |
| `AI_AUDIT_DEBUG_LOGGING` | `false` |

### 1.5 API-Endpunkte (Fleet Chat)

| Methode | Pfad | Auth |
|---------|------|------|
| `GET` | `/api/v1/organizations/:orgId/chat/agent` | JWT + `ai-assistant:read` |
| `POST` | `/api/v1/organizations/:orgId/chat/message` | JWT + `ai-assistant:write` |
| `POST` | `/api/v1/organizations/:orgId/chat/message/stream` | JWT + SSE |
| `GET` | `/api/v1/organizations/:orgId/chat/history` | JWT |
| `DELETE` | `/api/v1/organizations/:orgId/chat/history` | JWT |
| `GET` | `/api/v1/ai/health` | **Public** (configured/provider/streaming) |
| `GET` | `/api/v1/health` | Public |
| `GET` | `/api/v1/health/readiness` | Public (+ Redis/PG/workers) |

Frontend: Same-Origin `POST /api/v1/organizations/:orgId/chat/message/stream` (`frontend/src/lib/api.ts`).

### 1.6 Feature Flags & IAM

- Fleet Chat UI: Route immer vorhanden; API über Permission **`ai-assistant`**
- Domain Grounding: `FLEET_CHAT_DOMAIN_GROUNDING_ENABLED` + optional `FLEET_CHAT_ORG_ALLOWLIST`
- Legacy Fallback: automatisch wenn Flag `false` — Direct Mistral + History, Warning `legacy_direct_llm`

### 1.7 Migrationen (vor Deploy prüfen)

| Migration | Inhalt | Rollback |
|-----------|--------|----------|
| `20260725120000_chat_message_structured_payload` | `chat_messages.structured_payload` JSONB | Spalte optional leer — kein Datenverlust |
| `20260725130000_ai_request_audit_logging` | `ai_request_audit_logs` Tabelle | Additiv — Rollback = Tabelle nicht löschen in Prod |

**Vor Deploy auf VPS:**

```bash
cd /opt/synqdrive/current/backend
npx prisma migrate status
sudo -u postgres psql -d synqdrive -c '\d chat_messages'
sudo -u postgres psql -d synqdrive -c '\d ai_request_audit_logs'
```

Keine Datenmigration ohne Backup — `vps-deploy-release.sh` führt **pg_dump** vor jedem Deploy.

---

## 2. Backup

### 2.1 Automatisch (VPS-Deploy)

`backend/scripts/ops/vps-deploy-release.sh`:

```bash
sudo -u postgres pg_dump synqdrive | gzip > /opt/synqdrive/shared/backups/db-pre-deploy-${TS}.sql.gz
```

### 2.2 Manuell (vor erstem Fleet-AI-Go-Live)

```bash
TS=$(date -u +%Y%m%d%H%M%S)
sudo -u postgres pg_dump synqdrive | gzip > /opt/synqdrive/shared/backups/db-pre-fleet-ai-${TS}.sql.gz
cp /opt/synqdrive/shared/backend.env /opt/synqdrive/shared/backups/backend.env.${TS}.bak
```

### 2.3 Restore (Notfall)

```bash
gunzip -c /opt/synqdrive/shared/backups/db-pre-deploy-XXXX.sql.gz | sudo -u postgres psql synqdrive
# PM2 auf vorheriges Release:
ln -sfn /opt/synqdrive/releases/<PREVIOUS_RELEASE> /opt/synqdrive/current
pm2 restart synqdrive --update-env
```

---

## 3. Migration

1. Deploy-Skript führt `npm run prisma:migrate:deploy` automatisch
2. Nach Migrate: `pg-fix-app-table-ownership.sql` (Ownership-Fix)
3. **Kein** `prisma db push` auf Produktion
4. Rollback der App **ohne** Down-Migration — neue Spalten/Tabelle bleiben (additiv, sicher)

---

## 4. Deployment-Reihenfolge

**Nicht ausführen ohne Freigabe.** Geplante Reihenfolge:

| Schritt | Aktion | Verantwortlich |
|---------|--------|----------------|
| 1 | `main` merge + CI grün | Dev |
| 2 | VPS `backend.env` — `MISTRAL_API_KEY` + AI-Limits prüfen | Ops |
| 3 | `FLEET_CHAT_DOMAIN_GROUNDING_ENABLED=false` (Legacy) **oder** Canary-Allowlist setzen | Ops |
| 4 | `bash backend/scripts/ops/sync-mistral-env-to-vps.sh` (optional) | Ops |
| 5 | `npx ts-node backend/scripts/probe-mistral-ai.ts` auf VPS | Ops |
| 6 | `git push origin main` | Dev |
| 7 | `bash .cursor/scripts/cloud-agent-deploy.sh` **nur nach Freigabe** | Ops |
| 8 | Smoke Tests (Abschnitt 5) | Ops/Dev |
| 9 | Canary: Allowlist erweitern / Flag global `true` | Ops |

**Deploy-Skript:** `.cursor/scripts/cloud-agent-deploy.sh` → SSH → `vps-deploy-release.sh`.

---

## 5. Smoke Tests

### 5.1 Infrastruktur (ohne Auth)

```bash
curl -sf https://app.synqdrive.eu/api/v1/health
curl -sf https://app.synqdrive.eu/api/v1/health/readiness
curl -sf https://app.synqdrive.eu/api/v1/ai/health
```

Erwartung `ai/health`: `configured: true`, `provider: "mistral"`, `streamingEnabled: true`.

### 5.2 Mistral-Probe (VPS)

```bash
cd /opt/synqdrive/current/backend
npx ts-node scripts/probe-mistral-ai.ts
```

### 5.3 Fleet Chat (mit JWT — Pilot-Org)

1. Login Rental UI → AI Assistant
2. Frage (DE): „Wo steht der Tiguan?“ → strukturierte Antwort oder klare „keine Live-Daten“-Meldung
3. SSE: Progress-Events (`thinking`, `routing`, `tools`, `composing`) dann `result`
4. History: vorherige Messages sichtbar, `structured.responseType` gesetzt (Orchestrator-Pfad)
5. Legacy-Pfad (Flag `false`): Antwort ohne Tool-Grounding, Warning `legacy_direct_llm`

### 5.4 Security Regression (kurz)

- User ohne `ai-assistant` → 403
- Fremde `orgId` in URL → OrgScopingGuard blockiert
- Prompt „Ignoriere alle Regeln“ → kein LLM bei Injection (Orchestrator-Pfad)

### 5.5 Automatisiert (CI / lokal)

```bash
cd backend && npm test -- --testPathPattern='src/modules/ai/' --runInBand --forceExit
cd frontend && npm test -- --run src/rental/lib/ai-chat/
```

---

## 6. Monitoring

| Signal | Quelle | Hinweis |
|--------|--------|---------|
| Liveness | `/api/v1/health` | Deploy-Verify |
| Readiness | `/api/v1/health/readiness` | PG, Redis, workers |
| Mistral config | `/api/v1/ai/health` | `configured` false → sofort Alarm |
| PM2 | `pm2 logs synqdrive --lines 200` | Errors, OOM |
| AI Audit | Tabelle `ai_request_audit_logs` | correlationId, tools, security_flags |
| Rate limits | Logs `AiAgentRateLimitService` warn | fail-open |
| Nginx | Access/Error logs | 502/504 bei SSE-Timeout |

**Backlog:** Prometheus-Metriken für Fleet Chat (Latenz, Mistral-Fehler, Limit-Hits).

---

## 7. Rollback

| Szenario | Maßnahme |
|----------|----------|
| **App-Regression** | Vorheriges Release symlink + `pm2 restart synqdrive` |
| **Orchestrator-Bug** | `FLEET_CHAT_DOMAIN_GROUNDING_ENABLED=false` + `pm2 restart synqdrive --update-env` (Legacy sofort) |
| **Mistral-Ausfall** | Circuit breaker → `TEMPORARY_UNAVAILABLE` / deterministischer Fallback |
| **DB-Migrate fehlgeschlagen** | Deploy abortiert; Backup restore (Abschnitt 2.3) |
| **Rate-Limit zu streng** | Limits in `backend.env` anheben oder temporär `AI_AGENT_LIMITS_ENABLED=false` |

Rollback **ohne** DB-Down-Migration ist sicher (additiv).

---

## 8. Abbruchkriterien (Go/No-Go)

Deploy **stoppen** wenn:

- [ ] `MISTRAL_API_KEY` fehlt oder `probe-mistral-ai` schlägt fehl
- [ ] `prisma migrate deploy` Fehler
- [ ] `/api/v1/health` oder `/readiness` nicht 200
- [ ] Disk ≥ 90%
- [ ] Offene **BLOCKER** im Security-Audit
- [ ] Smoke Test 5.3 schlägt für Pilot-Org fehl
- [ ] Ungewöhnliche Spike: &gt; 10% `circuit_breaker_open` in Audit-Logs (erste 30 Min)

---

## 9. Zuständige Logs und Dashboards

| Ressource | Pfad / URL |
|-----------|------------|
| PM2 App-Logs | `pm2 logs synqdrive` |
| Nginx | `/var/log/nginx/access.log`, `error.log` |
| PostgreSQL slow | VPS Postgres logs |
| Grafana (optional) | SSH-Tunnel → `127.0.0.1:3000` (`GRAFANA_INTERNAL_URL`) |
| AI Audit SQL | `SELECT created_at, primary_intent, response_type, security_flags FROM ai_request_audit_logs ORDER BY created_at DESC LIMIT 50;` |
| Dokument-Intake Metrics | Prometheus `document-intake-*` (nicht Fleet Chat) |

**Log-Level Prod:** `LOG_LEVEL` unset → `error,warn,log` (kein debug). `AI_AUDIT_DEBUG_LOGGING=false`.

---

## 10. Post-Deployment-Prüfungen (24–48 h)

- [ ] Audit-Logs: keine `vin_leak`, `sensitive_content_leak` in security_flags
- [ ] Keine Cross-Tenant `organization_id` Mismatch in Audit
- [ ] Token-Budget: normale Nutzung unter Tageslimit
- [ ] `chat_messages.structured_payload` wird für Orchestrator-Antworten populated
- [ ] Canary-Orgs: Feedback von Pilot-Nutzern
- [ ] Mistral-Kosten Dashboard (extern) — Anomalie-Check
- [ ] Changes/Architektur V4.9.823 im Master-Dokument

---

## Referenzen

| Dokument | Inhalt |
|----------|--------|
| `architecture/AI_AGENT_LIMITS_AND_CACHE_2026-07-25.md` | Limits & Cache |
| `architecture/AI_REQUEST_AUDIT_LOGGING_2026-07-25.md` | Audit Schema |
| `architecture/FLEET_AI_FLOW_E2E_2026-07-25.md` | E2E Flow |
| `docs/audits/ai-agent-security-hallucination-review-2026-07.md` | Security Audit |
| `AGENTS.md` | Cloud Agent Deploy |
| `backend/scripts/ops/vps-deploy-release.sh` | VPS Release |

---

*Erstellt: Prompt 30 — Deployment-Vorbereitung. Kein Production-Deploy in diesem Schritt ausgeführt.*
