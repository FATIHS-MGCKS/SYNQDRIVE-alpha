# SynqDrive Fleet AI — VPS Control Audit — 2026-07

| Feld | Wert |
|------|------|
| **Audit ID** | `ai-agent-vps-control-audit-2026-07` |
| **Prompt** | 31 von 32 |
| **Prüfzeit (UTC)** | 2026-07-25T02:54–02:56Z |
| **Ziel-Host** | `srv1374778.hstgr.cloud` / `https://app.synqdrive.eu` |
| **Deploy-Release** | `20260724231659_v4994` |
| **Deploy-Commit** | `62aaf1fe8541840fcb7a5d05836ae0abeea3a9aa` |
| **Commit-Message** | `fix(build): restore dist/src/main.js output path for production PM2` |
| **Geprüfte Repo-Version (lokal)** | `cursor/ai-deployment-runbook-eafa` (Fleet-AI-PRs **nicht** auf VPS) |
| **Gesamtverdict** | **CONDITIONAL FAIL** — Infrastruktur stabil; **Fleet AI Domain Grounding nicht deployt** |

---

## Executive Summary

Die VPS-Infrastruktur (PostgreSQL, Redis, Mistral, TLS, CORS, SPA-Auslieferung) ist **betriebsbereit**. Der produktiv laufende Commit entspricht **`main` vor Fleet-AI-Merge** — **ohne** Orchestrator, Domain-Tools, AI-Audit-Tabelle, `structured_payload`, Rollout-Flags und AI-Agent-Limits-Env.

Authenticated Fleet-Chat-Smoke-Tests (Standort, Health, Überfälligkeit, …) sind auf Prod **nicht ausführbar** für den neuen Orchestrator-Pfad. Lokal: **75 Integration-/Audit-Tests PASS** (`chat.flow.integration` + security-hallucination).

**Remediation-Hotfix-Versuch:** Dist-Patch `auth.guard.js` für public `ai/health` → **Syntax-Fehler → sofortiger Rollback aus Backup** (App wieder `online`). Permanente Lösung: Deploy Release mit PR #849+.

---

## 1. Deploy- & Build-Stand

| Prüfpunkt | Ergebnis | Details |
|-----------|----------|---------|
| Deploy-Commit | **PASS** | `62aaf1fe` (short: `62aaf1f`) |
| Branch (Release-Clone) | **PASS** | `main` shallow clone in Release-Dir |
| Backend-Version (`package.json`) | **PASS** | `0.1.0` |
| `dist/src/main.js` | **PASS** | vorhanden |
| Frontend SPA `index.html` | **PASS** | Asset-Bundle `index-BRSIn0NA.js` |
| Fleet-AI-Orchestrator im Release | **FAIL** | Kein `fleet-chat-orchestrator.service.ts` |
| Erwarteter Fleet-AI-Stand | **FAIL** | PRs #847–#849 nicht in `main`/VPS |

---

## 2. Prozesse & Container

| Prüfpunkt | Ergebnis | Details |
|-----------|----------|---------|
| PM2 `synqdrive` | **PASS** (nach Restore) | `online`, ~344 MB RAM, PID stabil |
| PM2 Restarts (historisch) | **WARN** | ↺ **2836** — hohe Historie; aktuelle Uptime nach Audit ~3h+ |
| Docker ClickHouse | **PASS** | Up 7d (healthy) |
| Docker Prometheus/Grafana | **PASS** | Up 8d / 18h |
| CPU Load | **PASS** | load ~1.2; ClickHouse ~9% CPU |
| Memory | **PASS** | 15 Gi total, ~13 Gi available |
| Disk `/` | **PASS** | 18% used (34G / 193G) |

---

## 3. Datenbank & Migrationen

| Prüfpunkt | Ergebnis | Details |
|-----------|----------|---------|
| `prisma migrate status` | **PASS** | „Database schema is up to date!“ (265 migrations) |
| `chat_messages` | **PASS** | Tabelle existiert; **10** Messages |
| `organization_chat_agents` | **PASS** | **1** Agent |
| `chat_messages.structured_payload` | **FAIL** | Spalte **nicht** vorhanden (Migration `20260725120000` nicht deployt) |
| `ai_request_audit_logs` | **FAIL** | Tabelle **nicht** vorhanden (Migration `20260725130000` nicht deployt) |
| Letzte angewandte Migration (Sample) | **INFO** | z. B. `20260717230000_brake_health_snapshots` |

---

## 4. Redis & Queues

| Prüfpunkt | Ergebnis | Response |
|-----------|----------|----------|
| Redis PING | **PASS** | `PONG` |
| Readiness Redis | **PASS** | ~1–2 ms |
| AI tool cache keys `synqdrive:ai-chat:*` | **INFO** | Keine Keys (Orchestrator nicht aktiv) |
| BullMQ `document.extraction` wait/active | **PASS** | 0 / 0 |
| BullMQ andere (battery.v2) | **INFO** | Jobs vorhanden (nicht Fleet-AI) |

---

## 5. AI- & Telemetrie-Provider

| Prüfpunkt | Ergebnis | Response / Latenz |
|-----------|----------|-------------------|
| `MISTRAL_API_KEY` gesetzt | **PASS** | Key non-empty (Wert nicht geloggt) |
| `probe-mistral-ai.ts` | **PASS** | ok, provider mistral, **~269 ms** |
| `AI_PROVIDER` / `AI_STREAMING` | **PASS** | gesetzt in `backend.env` |
| `AI_AGENT_*` Limits | **FAIL** | **Keine** Vars in Prod-`backend.env` |
| `FLEET_CHAT_*` Rollout | **FAIL** | **Nicht** gesetzt |
| DIMO webhook health | **PASS** | HTTP 200, ~2.7 ms lokal |
| Legacy DIMO Agents LLM routes | **PASS** | Keine `dimo/agents` in `dist` |

---

## 6. Endpunkte & Health

| Endpoint | Ergebnis | HTTP | Latenz (öffentlich) |
|----------|----------|------|---------------------|
| `GET /api/v1/health` | **PASS** | 200 | ~0.56 s |
| `GET /api/v1/health/readiness` | **PASS** | 200 | postgres/redis/workers/docExtraction ok |
| `GET /api/v1/ai/health` | **FAIL** | **401** | ~0.30 s — JWT required (Fix in PR #849, nicht deployt) |
| `POST …/chat/message` (ohne JWT) | **PASS** | **401** | ~26 ms — korrekte Ablehnung |
| `POST …/chat/message/stream` (ohne JWT) | **PASS** | **401** | Tenant-Guard aktiv |

Readiness Details (anonymisiert): `workersEnabled: true`, `mistralOcrConfigured: true`, `aiExtractionConfigured: true`, `waitingJobs: 0`.

---

## 7. Reverse Proxy, TLS, CORS, CSP

| Prüfpunkt | Ergebnis | Details |
|-----------|----------|---------|
| TLS / HSTS | **PASS** | `Strict-Transport-Security: max-age=31536000` |
| CSP (App) | **PASS** | Helmet CSP in API-Responses |
| CSP (Nginx HTML) | **PASS** | `default-src 'self'`, Didit `frame-src` |
| CORS Prod-Origin | **PASS** | `Access-Control-Allow-Origin: https://app.synqdrive.eu` |
| Global Rate Limit Headers | **PASS** | `X-RateLimit-Limit-global: 200` |
| Fleet-AI org/user limits | **FAIL** | Nicht deployt / nicht konfiguriert |
| SSE `X-Accel-Buffering` | **BLOCKED** | Orchestrator/SSE-Pfad nicht auf Prod-Code |

---

## 8. Frontend-Auslieferung

| Prüfpunkt | Ergebnis | Details |
|-----------|----------|---------|
| SPA Root `/` | **PASS** | 200, ~0.28 s |
| Rental SPA | **PASS** | 200 |
| JS Bundle | **PASS** | `/assets/index-BRSIn0NA.js` 200 |
| Source Maps öffentlich | **PASS** | Keine `.map` Dateien auf Disk; URL 200 = SPA-Fallback (HTML) |
| `VITE_SOURCEMAP` | **PASS** | unset auf VPS |
| Fleet-AI UI-Komponenten | **FAIL** | Structured chat UI nicht im deployten Bundle-Stand |

---

## 9. Logging & Audit

| Prüfpunkt | Ergebnis | Details |
|-----------|----------|---------|
| Secrets in PM2-Logs (Stichprobe) | **PASS** | Keine API-Keys/Bearer in gefilterter Stichprobe |
| Scheduler Errors | **WARN** | `Custom Id cannot contain :` alle ~30 s |
| BatteryV2 worker failures | **WARN** | `HANDLER_FAILED` (ein Vehicle, anonymisierte IDs) |
| `ai_request_audit_logs` | **FAIL** | Tabelle fehlt |
| Tenant-Isolation (unauth chat) | **PASS** | 401 ohne JWT |

---

## 10. Smoke Tests — Produktion (HTTPS)

| Szenario | Ergebnis | Hinweis |
|----------|----------|---------|
| Standort (Domain Tool) | **BLOCKED** | Orchestrator nicht deployt; kein Test-JWT |
| Telemetriezustand | **BLOCKED** |同上 |
| Health Summary | **BLOCKED** |同上 |
| Überfällige Rückgabe | **BLOCKED** |同上 |
| Kombinierte Anfrage | **BLOCKED** |同上 |
| Fehlende Berechtigung | **PARTIAL PASS** | Unauth → 401 (erwartet) |
| Unbekanntes Fahrzeug | **BLOCKED** | Auth + Orchestrator nötig |
| Provider-Ausfall / Mock | **PARTIAL PASS** | Mistral live OK (~269 ms); kein Orchestrator-Failover getestet |

### Smoke Tests — Lokal (CI-äquivalent, Repo-Stand)

| Suite | Ergebnis | Tests |
|-------|----------|-------|
| `chat.flow.integration.spec.ts` | **PASS** | 27×de/en Flows |
| `fleet-chat-security-hallucination-audit.spec.ts` | **PASS** | 20 Security/Halluzination |
| **Gesamt** | **PASS** | **75** |

---

## 11. Angewandte Remediation (dieses Audit)

| Aktion | Ergebnis | Dokumentation |
|--------|----------|---------------|
| Dist-Hotfix `auth.guard.js` für `ai/health` | **REVERTED** | Sed-Patch brach Node-Syntax → Backup `*.bak-vps-audit-20260725` restored; PM2 `online` |
| Fleet-AI Deploy | **NICHT ausgeführt** | Bewusst — erfordert Merge + `cloud-agent-deploy.sh` |

---

## 12. Offene Risiken & notwendige Remediation

| ID | Severity | Risiko | Remediation |
|----|----------|--------|-------------|
| VPS-01 | **BLOCKER** | Fleet AI nicht auf Prod | Merge #847–#849 → `main` → kontrolliertes VPS-Deploy |
| VPS-02 | **CRITICAL** | DB-Migrationen Fleet AI fehlen | `prisma migrate deploy` mit Release (structured_payload + audit) |
| VPS-03 | **HIGH** | `ai/health` 401 öffentlich | Deploy PR #849 (`auth.guard` public path) — **kein** Dist-Patch |
| VPS-04 | **HIGH** | `AI_AGENT_*` nicht in Prod-env | Nach Deploy: Limits aus Runbook in `backend.env` |
| VPS-05 | **HIGH** | Rollout-Flags fehlen | `FLEET_CHAT_DOMAIN_GROUNDING_ENABLED` Canary per Runbook |
| VPS-06 | **MEDIUM** | PM2 Restart-Historie ↺2836 | Root-Cause-Analyse (vor Fleet-AI-Deploy) |
| VPS-07 | **MEDIUM** | Scheduler `Custom Id cannot contain :` | BullMQ Job-ID-Sanitizer / Battery-V2-Korrelation |
| VPS-08 | **LOW** | Keine Fleet-Chat-Prometheus-Metriken | Post-Go-Live Backlog |

---

## 13. PASS/FAIL-Matrix (Kurz)

| Bereich | Verdict |
|---------|---------|
| Infrastruktur (PG, Redis, Disk, RAM) | **PASS** |
| Mistral Erreichbarkeit | **PASS** |
| TLS / CORS / CSP | **PASS** |
| Legacy Chat DB | **PASS** |
| Fleet AI Code auf VPS | **FAIL** |
| Fleet AI DB Schema | **FAIL** |
| Fleet AI Smoke (Prod) | **FAIL / BLOCKED** |
| Fleet AI Smoke (lokal) | **PASS** |
| Public `ai/health` Monitoring | **FAIL** |
| Source Maps / Debug | **PASS** |

**Gesamt: CONDITIONAL FAIL** — Go-Live für Domain-Grounded Fleet AI **nach** Deploy + Migration + Canary + authentisierten Prod-Smokes.

---

## 14. Referenzen

- `docs/deployment/ai-agent-domain-grounding-deployment-runbook-2026-07.md`
- `docs/audits/ai-agent-security-hallucination-review-2026-07.md`
- Release-Pfad VPS: `/opt/synqdrive/releases/20260724231659_v4994`

---

*Keine Secrets in diesem Bericht. Alle IDs in Logs anonymisiert oder als Counts.*
