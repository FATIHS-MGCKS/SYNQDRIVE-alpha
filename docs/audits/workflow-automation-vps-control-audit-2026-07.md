# SynqDrive Workflow Automation — VPS Control Audit — 2026-07

| Feld | Wert |
|------|------|
| **Audit ID** | `workflow-automation-vps-control-audit-2026-07` |
| **Prompt** | Phase 12, Prompt 52 von 54 |
| **Prüfzeit (UTC)** | 2026-07-25T12:26–12:30Z |
| **Ziel-Host** | `srv1374778.hstgr.cloud` / `https://app.synqdrive.eu` |
| **Deploy-Release** | `20260725083109_data-auth-rc` |
| **Deploy-Commit** | `6080dbd260b01e8e091f17687799fbb73bde290a` |
| **Commit-Message** | `docs: Prompt 42 re-verification CONDITIONAL GO (14/15 runtime)` |
| **Abstand zu `origin/main` (lokal geprüft)** | **~91 Commits** hinter aktuellem `main` |
| **Geprüfte Repo-Version (lokal)** | `cursor/workflow-runtime-rollout-2a81` (Phase-11-Workflow-Features **nicht** auf VPS) |
| **Audit-Modus** | **Read-only** — keine Daten gelöscht, keine Queues geleert, keine Provider-Aktionen |
| **Gesamtverdict** | **CONDITIONAL NO-GO** — Basis-Infrastruktur stabil; **Workflow Runtime Phase 11 (Shadow/Rollout/Migration) nicht deployt** |

---

## Executive Summary

Die VPS-Basis (NestJS/PM2, PostgreSQL, Redis, BullMQ-Workers im Monolith, TLS, Health/Readiness) ist **betriebsbereit**. Task Automation läuft weiterhin über **Legacy-Pfad** (keine Workflow-Runtime-Env-Flags, keine Shadow-/Rollout-Tabellen, keine produktiven Workflow-Runs).

Der aktive Release-Commit (`6080dbd`) entspricht **nicht** dem Stand von Phase 11 (Shadow Mode, Controlled Rollout, Production Test Matrix, Workflow Migration Bridge in aktueller Form). Vor einem Workflow-Runtime-Rollout sind **Deploy + Migrationen + Env-Konfiguration + Monitoring-Erweiterung** erforderlich.

**Keine destruktiven Aktionen** wurden im Rahmen dieses Audits ausgeführt.

---

## 1. Infrastrukturübersicht

| Komponente | Ist-Zustand |
|------------|-------------|
| **Host** | Ubuntu, 4 vCPU, 15 GiB RAM, 193 GiB Disk (24 % belegt) |
| **Zeit** | UTC (`Etc/UTC`), NTP aktiv, Uhr synchron |
| **Reverse Proxy** | Nginx (`synqdrive`), TLS Let's Encrypt (gültig bis 2026-09-20) |
| **App-Prozess** | PM2 `synqdrive` — **1×** Node (`dist/src/main.js`), Workers **embedded** via `WorkersModule` |
| **Container** | ClickHouse, Prometheus, Grafana (kein Alertmanager) |
| **Daten** | PostgreSQL 16 (localhost), Redis 7.0.15 (localhost) |
| **Monitoring** | Prometheus + Grafana lokal; kein dediziertes Workflow-Alerting nachweisbar |

---

## 2. Deploy- & Release-Stand

| Prüfpunkt | Ergebnis | Details |
|-----------|----------|---------|
| Aktiver Symlink | **INFO** | `/opt/synqdrive/current` → `releases/20260725083109_data-auth-rc` |
| Deploy-Commit | **INFO** | `6080dbd260b01e8e091f17687799fbb73bde290a` |
| Weitere Releases (neuer) | **WARN** | `20260725083117_v4994` existiert, aber **nicht** als `current` verlinkt |
| `origin/main` Drift | **P0** | ~91 Commits hinter lokalem `main`; Phase-11-Workflow-Arbeit nicht live |
| Prisma `migrate status` (Release) | **PASS** | „Database schema is up to date!“ (**280** Migrationen im **deployten** Schema) |
| Shadow-Migration `20260725140000` | **FAIL** | **Nicht** angewendet |
| Rollout-Migration `20260725160000` | **FAIL** | **Nicht** angewendet |
| Workflow-Audit-Migration `20260725140000_workflow_audit_*` | **FAIL** | `org_workflow_audit_events` **fehlt** |

### Angewandte Workflow-relevante Migrationen (DB)

- `20260616140000_workflow_automation_runtime` — Basis-Tabellen `org_workflows`, Runs, Actions, Approvals
- `20260715140100_task_automation_outbox`
- `20260715160000_org_task_automation_rule_overrides`

**Nicht** angewendet (Phase 11): Shadow, Rollout, erweiterte Workflow-Audit-Tabellen.

---

## 3. Prozesse, Worker & Scheduler

| Prüfpunkt | Ergebnis | Details |
|-----------|----------|---------|
| PM2 `synqdrive` | **PASS** | `online`, Uptime ~3 h zum Audit-Zeitpunkt |
| PM2 Restarts (historisch) | **P0** | **3161** Restarts — hohe Instabilität in der Vergangenheit |
| Separate Worker-PM2-Instanz | **INFO** | **Keine** — BullMQ-Consumer laufen im API-Prozess |
| Doppelte Worker | **PASS** | Nur **1** `node … main.js` Prozess |
| `WorkersModule` | **PASS** | Boot-Log: `WorkersModule dependencies initialized` |
| `TaskAutomationOutboxModule` | **PASS** | Geladen; Admin-Route `…/task-automation/outbox/:id/replay` gemappt |
| Nest `ScheduleModule` | **INFO** | In-Process-Scheduler (kein separater Cron-Container) |
| Readiness `workersEnabled` | **PASS** | `true`, Redis Major 7 |

### BullMQ-Queues (Redis, Auszug)

| Queue | wait | active | delayed | failed (Typ) |
|-------|------|--------|---------|----------------|
| `task.automation` | 0 | 0 | 0 | 0 |
| `notification.delivery` | 0 | 0 | 0 | — |
| `voice.webhook.process` | 0 | 0 | 0 | — |
| `dimo.vehicle.sync` | 0 | 0 | 1 | 1 (zset) |
| `battery.v2` | 0 | 0 | 0 | **23** (zset) |

**Queue-Lag Workflow:** `task.automation` **0** — kein akuter Backlog.  
**Stale Jobs:** `battery.v2` failed=23 (nicht Workflow-kritisch, aber Ops-Hinweis).  
**Redis:** 128 connected clients, **19 blocked** (typisch für BullMQ-Worker im Blocking-Modus).

---

## 4. PostgreSQL — Workflow-Tabellen & Outbox

| Tabelle | Status | Zeilen (aggregiert) |
|---------|--------|---------------------|
| `org_workflows` | **PASS** (leer) | 0 |
| `org_workflow_runs` | **PASS** (leer) | 0 |
| `org_workflow_action_runs` | **PASS** (leer) | 0 |
| `org_workflow_approvals` | **PASS** (leer) | 0 |
| `org_workflow_audit_events` | **FAIL** | Tabelle **fehlt** |
| `org_workflow_shadow_*` | **FAIL** | Tabellen **fehlen** |
| `org_workflow_runtime_rollout_settings` | **FAIL** | Tabelle **fehlt** |
| `task_automation_outbox` | **PASS** | 0 Zeilen |
| Stale Outbox (>1 h PENDING/PROCESSING) | **PASS** | 0 |
| Stale Workflow Runs (RUNNING >2 h) | **PASS** | 0 |

**Dead Letter:** Keine separate `task_automation_outbox_dead_letter`-Tabelle; deployed Outbox-Schema hat **kein** `dead_lettered_at` (älterer Stand). Dead-Letter-Verhalten ggf. über `status`/`last_error` — aktuell **0** Einträge.

**PostgreSQL Connections:** 11 gesamt (9 idle, 1 active), `max_connections=100`.

---

## 5. Environment & Secret-Status (nur Präsenz, keine Werte)

**Quelle:** `/opt/synqdrive/shared/backend.env` (644 `root:root`)

| Kategorie | Ergebnis | Details |
|-----------|----------|---------|
| `WORKFLOW_*` / `TASK_AUTOMATION_*` Runtime | **P0 FAIL** | **Keine** Keys in `backend.env` |
| `WORKFLOW_RUNTIME_ROLLOUT_STAGE` | **FAIL** | Nicht gesetzt → fail-closed Default nicht explizit dokumentiert auf VPS |
| `TASK_AUTOMATION_WORKFLOW_RUNTIME_MODE` | **FAIL** | Nicht gesetzt → Legacy-Default im Code |
| `WORKFLOW_SHADOW_GLOBALLY_ENABLED` | **FAIL** | Nicht gesetzt |
| Redis | **PASS** | Host/Port/DB gesetzt; Passwort **leer** (localhost-only) |
| `DATABASE_URL` | **PASS** | Gesetzt (localhost) |
| `CLICKHOUSE_URL` | **PASS** | Gesetzt |
| E-Mail (`RESEND_API_KEY`, `EMAIL_*`) | **PASS** | Keys gesetzt; `EMAIL_SIMULATE_ENABLED` vorhanden |
| WhatsApp | **INFO** | `WHATSAPP_SIMULATE_ENABLED` gesetzt; kein dedizierter Access-Token-Key im Workflow-Audit-Pattern |
| Twilio / Voice | **PASS** | Account/API-Keys + `TWILIO_VOICE_WEBHOOK_BASE_URL` (Host: `app.synqdrive.eu`) gesetzt |
| ElevenLabs | **PASS** | API-Key + Webhook-Secret **gesetzt** |
| Webhook-Signaturen | **MIXED** | Resend/Twilio/ElevenLabs/DIMO/Didit **SET**; `STRIPE_WEBHOOK_SECRET` **EMPTY** |
| Clerk (`CLERK_SECRET_KEY`) | **P1 WARN** | In `backend.env` als **EMPTY** gelistet — App läuft dennoch (Health OK); Quelle ggf. PM2/Runtime-Override prüfen |

**Webhook-Basen (nur Hostname):** `app.synqdrive.eu` für API, DIMO, Didit, Twilio Voice.

**Keine Secret-Werte** in diesem Bericht dokumentiert.

---

## 6. Deployed API-Oberfläche (Workflow)

Boot-Log des laufenden Prozesses zeigt:

| Route-Gruppe | Auf VPS |
|--------------|---------|
| `…/organizations/:orgId/workflows/*` (CRUD, runs, dry-run) | **JA** |
| `…/task-automation/*` (rules, outbox replay) | **JA** |
| `…/workflows/shadow/*` | **NEIN** |
| `…/workflows/runtime-rollout/*` | **NEIN** |
| `…/task-automation/workflow-migration/*` | **NEIN** (nicht im Boot-Log) |

---

## 7. Health, Monitoring, Alerting

| Prüfpunkt | Ergebnis | Details |
|-----------|----------|---------|
| `GET /api/v1/health` | **PASS** | HTTP 200, uptime ~3.8 h |
| `GET /api/v1/health/readiness` | **PASS** | postgres/redis/clickhouse/workers ok |
| Prometheus | **PASS** | Container running (localhost:9090) |
| Grafana | **PASS** | Container running (localhost:3000) |
| Alertmanager | **P2** | **Nicht** deployed |
| Workflow-spezifische Metriken/Alerts | **P1 FAIL** | Kein Nachweis für Shadow-Deviation, Outbox-DLQ, Rollout-Gates auf Prod |
| `WORKFLOW_RUNTIME_MONITORING_ENABLED` | **FAIL** | Nicht konfiguriert |

---

## 8. Sicherheit, Netzwerk, TLS

| Prüfpunkt | Ergebnis | Details |
|-----------|----------|---------|
| PostgreSQL | **PASS** | Nur `127.0.0.1:5432` |
| Redis | **PASS** | Nur `127.0.0.1:6379` |
| Backend API | **INFO** | `*:3001` (hinter Nginx) |
| SSH | **INFO** | `0.0.0.0:22` offen |
| UFW | **P1** | **inactive** — Hostinger-Firewall extern vermutlich, aber Host-Firewall aus |
| TLS Zertifikat | **PASS** | Let's Encrypt, gültig |
| HSTS | **PASS** | `max-age=31536000` |
| CSP (Nginx) | **PASS** | Restriktiv + Didit frame-src |
| App Rate Limits | **INFO** | Nest Throttler aktiv (Header in anderen Audits); Nginx `limit_req` **nicht** in Site-Config |
| Env-Datei Permissions | **P2** | `backend.env` **644** (world-readable für root-owned — für Secrets zu permissiv) |

---

## 9. Logs, PII, Rotation

| Prüfpunkt | Ergebnis | Details |
|-----------|----------|---------|
| PM2 Logs | **INFO** | ~197 MB unter `/root/.pm2/logs/` |
| PM2 logrotate | **PASS** | Modul `pm2-logrotate` online; rotierte Dateien vorhanden |
| PII-Muster (Zählung, kein Export) | **P1** | `password`-Treffer: 42; `authorization`-Treffer: 225 im Out-Log — Stichprobe auf Redaction empfohlen |
| Workflow-Fehler im Error-Log | **INFO** | Nicht exhaustiv ausgewertet (read-only Spot-Check) |

---

## 10. Backup & Restore

| Prüfpunkt | Ergebnis | Details |
|-----------|----------|---------|
| Pre-Deploy DB-Backups | **PASS** | `/opt/synqdrive/shared/backups/*.sql.gz` (z. B. `db-pre-deploy-20260725083117.sql.gz`, ~50 MB) |
| Letztes Backup (Audit-Zeit) | **PASS** | 2026-07-25 08:31 UTC |
| Restore-Nachweis | **INFO** | `pre-local-db-restore-20260622100709.sql.gz` vorhanden; kein aktueller Workflow-Restore-Test dokumentiert |
| Automatisierte Backup-Cron | **P2** | Kein root-crontab; Backups offenbar deploy-getriggert |

---

## 11. Befunde nach Priorität

### P0 — Blocker vor Workflow-Runtime-Rollout

| ID | Befund | Remediation |
|----|--------|-------------|
| P0-1 | Deploy-Commit ~91 Commits hinter `main`; Phase-11-Workflow-Features fehlen | PRs #888–#892 (o. ä.) mergen; `cloud-agent-deploy.sh` ausführen |
| P0-2 | Shadow-/Rollout-/Audit-Migrationen nicht auf Prod-DB | Nach Deploy: `prisma migrate deploy` im Release; Tabellen verifizieren |
| P0-3 | Keine `WORKFLOW_*` / `TASK_AUTOMATION_WORKFLOW_RUNTIME_MODE` Env auf VPS | Runbook `docs/operations/workflow-runtime-rollout-runbook-2026-07.md` — Stage `DISABLED`/`SHADOW` explizit setzen |
| P0-4 | PM2 Restart-Zähler **3161** | Root-Cause-Analyse (OOM, uncaught exceptions); PM2 `max_memory_restart`; Error-Log-Fenster prüfen |

### P1 — Hoch, vor produktivem Pilot

| ID | Befund | Remediation |
|----|--------|-------------|
| P1-1 | `org_workflow_audit_events` fehlt | Migration aus Phase 11 deployen |
| P1-2 | API-Routen Shadow/Rollout/Migration nicht live | Nach Deploy Smoke-Test der neuen Controller |
| P1-3 | Kein Workflow-Monitoring/Alerting (Gates, DLQ, Shadow-Deviation) | Prometheus-Regeln + Grafana-Panels; `WORKFLOW_RUNTIME_MONITORING_ENABLED=true` |
| P1-4 | UFW inactive | Host-Firewall-Policy mit Hostinger abstimmen; minimal SSH/API hardenen |
| P1-5 | `STRIPE_WEBHOOK_SECRET` empty | Billing-Webhook-Signatur konfigurieren oder Scope dokumentieren |
| P1-6 | Log-Muster `password`/`authorization` | Log-Sanitization-Audit; keine Tokens in PM2-Logs |
| P1-7 | `battery.v2` failed=23 | Ops-Review (nicht Workflow, aber Queue-Hygiene) |

### P2 — Mittel / Verbesserungen

| ID | Befund | Remediation |
|----|--------|-------------|
| P2-1 | `backend.env` mode 644 | Auf `600` setzen; Secrets nur root-readable |
| P2-2 | Kein Alertmanager | Alertmanager zu Prometheus-Stack hinzufügen |
| P2-3 | Kein Nginx `limit_req` | Edge Rate-Limits für Webhooks/API evaluieren |
| P2-4 | Kein Swap | Optional kleines Swapfile für OOM-Schutz |
| P2-5 | Release `20260725083117_v4994` nicht aktiv | Klären ob absichtlich; Drift vermeiden |
| P2-6 | Restore-Test nicht für Workflow-Pfad dokumentiert | Tabletop-Restore + Rollback-Drill (Kill Switch) |

---

## 12. Migrationsstatus (Zusammenfassung)

| Bereich | VPS | Erwartet (Repo `main` / Phase 11) |
|---------|-----|-----------------------------------|
| Workflow Basis (`org_workflows` …) | **Angewendet** | Angewendet |
| Task Automation Outbox | **Angewendet** | Angewendet |
| Shadow Mode (`org_workflow_shadow_*`) | **Fehlt** | Erforderlich für Prompt 50 |
| Controlled Rollout (`org_workflow_runtime_rollout_*`) | **Fehlt** | Erforderlich für Prompt 51 |
| Workflow Audit Events | **Fehlt** | Erforderlich für Governance |

---

## 13. Worker- & Queue-Status (Zusammenfassung)

- **Architektur:** Monolith + embedded BullMQ (**kein** separater Worker-Prozess).
- **Workflow-Queue `task.automation`:** Leer, kein Lag.
- **Outbox:** 0 Einträge, kein Stale, kein DLQ-Backlog.
- **Workflow Runs:** 0 produktive Runs — System operiert faktisch im **Legacy Task Automation**-Modus.
- **Doppelpfad-Risiko:** Auf aktuellem Stand **nicht** durch Rollout-Gate abgesichert (Feature nicht deployt); Legacy-only durch fehlende Env.

---

## 14. Secret-Status (Zusammenfassung)

| Secret-Typ | Präsenz | Rotation |
|------------|---------|----------|
| Datenbank | SET (localhost) | Deploy-Backup vorhanden |
| Redis | SET (ohne Passwort) | OK für localhost-only |
| Resend / E-Mail | SET | Webhook-Secret SET |
| Twilio / Voice | SET | Webhook-Base auf Prod-Host |
| ElevenLabs | SET | Webhook-Secret SET |
| DIMO | SET | Webhook-Secret SET |
| Stripe Webhook | **EMPTY** | Nachziehen |
| Workflow Rollout/Shadow | **MISSING** | Nach Feature-Deploy |

**Hinweis:** Secret-Rotationstermine wurden im Audit **nicht** verifiziert (nur Präsenz/Quelle).

---

## 15. Monitoring- & Backup-Status

| Bereich | Status |
|---------|--------|
| Health/Readiness | **Grün** |
| Prometheus/Grafana | **Vorhanden** |
| Workflow-Gates / Shadow-Deviation | **Nicht konfiguriert** |
| Alertmanager | **Fehlt** |
| DB Pre-Deploy Backups | **Aktuell (heute)** |
| Workflow-Rollback-Test | **Nicht nachgewiesen** |

---

## 16. Konkrete Remediation (Reihenfolge)

1. **Merge & Deploy** Phase-11-Workflow-PRs auf `main` → VPS Release mit aktuellem Commit.
2. **Migrationen** anwenden und verifizieren: `org_workflow_shadow_*`, `org_workflow_runtime_rollout_settings`, `org_workflow_audit_events`.
3. **Env setzen** (fail-closed): `WORKFLOW_RUNTIME_ROLLOUT_STAGE=DISABLED`, optional `TASK_AUTOMATION_WORKFLOW_RUNTIME_MODE=legacy`; Shadow-Pilot erst nach Runbook.
4. **PM2-Restart-Analyse** — 3161 Restarts untersuchen vor Last-Pilot.
5. **Monitoring** — Workflow-Metriken (Outbox, `task.automation` failed, Shadow-Deviation) + Alertmanager.
6. **Secrets-Hardening** — `backend.env` chmod 600; `STRIPE_WEBHOOK_SECRET` klären.
7. **Rollback-Drill** — Kill Switch + Stage `DISABLED` testen (ohne Kundenkontakt).
8. **Queue-Hygiene** — `battery.v2` failed Jobs reviewen (read-only Analyse zuerst).

---

## 17. Go / No-Go-Vorbewertung

| Gate | Bewertung |
|------|-----------|
| Infrastruktur stabil (DB/Redis/API) | **GO** |
| Deploy-Stand = Phase-11-Workflow | **NO-GO** |
| Migrationen Shadow/Rollout/Audit | **NO-GO** |
| Env Rollout/Shadow konfiguriert | **NO-GO** |
| Queue/Outbox Workflow-Lag | **GO** (leer) |
| Monitoring für Rollout-Gates | **NO-GO** |
| PM2-Stabilität | **CONDITIONAL** (hohe Restart-Historie) |
| Backup vor Change | **GO** |

### **Gesamt: CONDITIONAL NO-GO**

**Empfehlung:** Workflow-Runtime-Rollout **nicht** auf dem aktuellen VPS-Stand starten. Zuerst Deploy + Migrationen + Env + Monitoring. Danach Shadow-Pilot (`SHADOW`) mit org-spezifischer Aktivierung gemäß Runbook.

---

## 18. Durchgeführte Prüfungen (Checkliste)

- [x] Deploy-Commit / Release / Branch-Drift
- [x] PM2 / Node-Prozesse / Docker
- [x] Backend + embedded Workers
- [x] BullMQ / Redis / Queue-Lag / failed counts
- [x] PostgreSQL / Connections / Migrationen
- [x] Workflow-Tabellen / Outbox / stale Runs
- [x] Doppelte Worker (nicht vorhanden)
- [x] Health / Readiness
- [x] CPU / RAM / Disk
- [x] Env-Präsenz (ohne Secret-Werte)
- [x] Twilio / WhatsApp-Sim / E-Mail / ElevenLabs / Webhooks
- [x] NTP / Zeitzone UTC
- [x] Backups / Restore-Artefakt
- [x] Monitoring (Prometheus/Grafana)
- [x] Firewall / Ports / TLS
- [x] Log-Rotation / PII-Muster-Zählung
- [ ] Keine Provider-Testcalls / keine Queue-Mutation / keine Datenlöschung

---

## Referenzen

- `docs/operations/workflow-shadow-mode-2026-07.md`
- `docs/operations/workflow-runtime-rollout-runbook-2026-07.md`
- `docs/testing/workflow-automation-production-test-matrix-2026-07.md`
- Vorlage: `docs/audits/ai-agent-vps-control-audit-2026-07.md`
