# Workflow Automation — Post-Remediation Production Readiness Audit

| Feld | Wert |
|------|------|
| **Audit ID** | `workflow-automation-post-remediation-production-readiness-2026-07` |
| **Prompt** | Phase 12, Prompt 54 von 54 (finaler Kontrollaudit) |
| **Prüfzeit (UTC)** | 2026-07-25T12:34–12:45Z (Pass 1) · **Re-Verifikation 16:47–16:49Z** (Pass 2, unabhängig) |
| **Auditor** | Cursor Cloud Agent (unabhängige Re-Verifikation — frühere PASS-Aussagen nicht übernommen) |
| **Methode** | Code-Inspektion, Testausführung, Build, VPS-SSH (read-only), Health-Checks |
| **Geprüfter Repo-Commit** | `da1e1b61` (Branch `cursor/workflow-post-remediation-audit-2a81`) |
| **Feature-Code-Commit (Workflow Runtime)** | `cursor/workflow-runtime-rollout-2a81` — enthält Phase-11-Artefakte (Shadow, Rollout, Migration) |
| **VPS Deploy-Commit** | `6080dbd2` (`20260725083109_data-auth-rc`) — **~91 Commits hinter `origin/main`** |
| **Voraussetzungs-Audits** | [VPS Control](./workflow-automation-vps-control-audit-2026-07.md), [E2E Acceptance](./workflow-automation-e2e-acceptance-2026-07.md) |
| **Kundenkontakt** | **Keine echten Kunden kontaktiert** |

---

## Executive Summary

Die Workflow-Automation-Remediation (Phase 1–12, Prompts 1–54) liefert eine **kanonische Workflow Runtime** im Repository mit durchgängiger Tenant-Isolation, Transactional Outbox, Idempotenz, Maker-Checker, Policy Engine, Audit/PII-Redaction, Shadow Mode, Controlled Rollout inkl. Kill Switches und dokumentierter Migrationsbrücke. Die **automatisierte Testmatrix** (**373 Tests** — 328 Backend + 45 Frontend) ist vollständig **grün**; Backend- und Frontend-Builds sind **grün**. Typecheck im Verify-Script schlägt wegen **2 vorbestehender AI-Tool-Spec-Fehler** fehl (nicht Workflow-blockierend; `nest build` grün).

**Die produktive VPS (`app.synqdrive.eu`) trägt Phase 11 nicht.** Shadow-, Rollout- und erweiterte Audit-Migrationen fehlen; `WORKFLOW_*`-Env-Variablen sind nicht gesetzt; Kill-Switch-APIs sind nicht live. Damit ist die **aktuelle Produktionsumgebung für einen Workflow-Runtime-Rollout NO-GO**, während der **remedierte Code-Stand CONDITIONAL GO** erhält — unter expliziten Deploy- und Betriebsbedingungen.

### Entscheidung: **CONDITIONAL GO**

| Ebene | Verdict |
|-------|---------|
| **Repository / Remediation-Artefakt** | **CONDITIONAL GO** — bereit für kontrollierten Rollout nach Merge + Deploy |
| **Aktuelle VPS-Produktion (Workflow Runtime)** | **NO-GO** — Phase 11 nicht deployt, Kill Switch fehlt operativ |
| **Gesamt (Production Readiness)** | **CONDITIONAL GO** mit verbindlichen Bedingungen (siehe unten) |

**Begründung:** Keines der 14 harten NO-GO-Kriterien verletzt den **Code-Stand**; auf der **VPS** scheitern mindestens „Kill Switch fehlt“ und „Migration erzeugt Doppelpfade“ (potenziell ohne Env-Router). Ein vollständiger Production-E2E auf der VPS ist blockiert.

---

## Finale Architektur

### Kanonische Runtime (eine Ausführungspfade pro Event)

```
Domain Event (Booking, Invoice, Vehicle, …)
        │
        ▼
TaskAutomationService.safeUpsert()
        │
        ▼
TaskAutomationExecutionRouterService  ◄── TASK_AUTOMATION_WORKFLOW_RUNTIME_MODE
        │                                  WORKFLOW_RUNTIME_ROLLOUT_STAGE (V4.9.861)
        ├── legacy_only    → TasksService.upsertByDedup (Prod-Default)
        ├── shadow_compare → Legacy write + WorkflowDryRun/Shadow (keine Doppelwrites)
        └── workflow_live  → WorkflowEngine → ActionExecutor (Legacy upsert übersprungen)

WorkflowEngineService
        ├── Matcher (Trigger + Scope + Condition Tree)
        ├── State Machine (RUNNING → WAITING_APPROVAL → COMPLETED/FAILED/ABORTED)
        ├── Idempotency (eventKey + workflowId)
        └── assertLiveExecution() — DRY_RUN/SHADOW blockieren Seiteneffekte

WorkflowActionExecutorService
        ├── Policy Engine + Communication Contract
        ├── Maker-Checker Pause (EXTERNAL / AI / CRITICAL)
        └── Channel Adapters (task, notification, WhatsApp preview; Email/SMS/Voice teils Contract)

Transactional Outbox (task_automation_outbox)
        └── BullMQ task.automation → Retry → DEAD_LETTER → Maker-Checker Replay

Shadow Mode (V4.9.860)
        └── org_workflow_shadow_* — Vergleich Legacy vs. Workflow-Plan

Controlled Rollout (V4.9.861)
        └── Stufen DISABLED → … → GENERAL_AVAILABILITY + Kill Switches + Gates
```

### Schlüsselmodule

| Bereich | Pfad |
|---------|------|
| Engine & State Machine | `backend/src/modules/workflows/workflow-engine.service.ts` |
| Dry Run / Safe Default | `workflow-execution-mode.ts`, `workflow-dry-run.service.ts` |
| Outbox | `backend/src/modules/tasks/outbox/*` |
| Migration Bridge | `workflows/migration/*`, `task-automation-bridge/*` |
| Shadow | `workflows/shadow/*` |
| Rollout & Kill Switch | `workflows/rollout/*` |
| Maker-Checker | `workflows/maker-checker/*` |
| Audit & PII | `workflows/audit/*` |
| Policy / Communication | `workflows/communication/*` |
| Frontend | `frontend/src/rental/components/workflow-automation/*` |

### Dokumentations-Inventar (gelesen / synthetisiert)

| Dokument | Status |
|----------|--------|
| Testmatrix | `docs/testing/workflow-automation-production-test-matrix-2026-07.md` |
| Dry Run ADR | `docs/architecture/WORKFLOW_DRY_RUN_2026-07.md` |
| Outbox Ops | `docs/task-automation-outbox-ops.md` |
| Migration | `docs/migrations/task-automation-to-workflow-runtime-2026-07.md` |
| Shadow Mode | `docs/operations/workflow-shadow-mode-2026-07.md` |
| Rollout Runbook | `docs/operations/workflow-runtime-rollout-runbook-2026-07.md` |
| Maker-Checker | `docs/security/workflow-maker-checker-2026-07.md` |
| Audit / AI Transparency | `docs/compliance/workflow-audit-and-ai-transparency-2026-07.md` |
| UI/Mobile | `docs/audits/workflow-automation-ui-mobile-readiness-2026-07.md` |
| VPS Audit | `docs/audits/workflow-automation-vps-control-audit-2026-07.md` |
| E2E Acceptance | `docs/audits/workflow-automation-e2e-acceptance-2026-07.md` |
| Standalone ADR `ADR-WORKFLOW-AUTOMATION-RUNTIME-2026-07.md` | **Nicht im Repo** — Inhalt verteilt auf Architektur-Docs + Testmatrix |
| Standalone Baseline/Remediation-Plan Markdown | **Nicht als Einzeldatei** — Findings in Phasen-Prompts + Testmatrix + Audits |

---

## Behobene ursprüngliche P0/P1/P2-Befunde

### P0 — behoben im Repository

| ID | Ursprünglicher Befund | Remediation | Nachweis |
|----|----------------------|-------------|----------|
| WR-P0-001 | Keine kanonische Workflow Runtime | Engine + Prisma-Schema + Runs/Actions | `workflow-engine.production.spec.ts` |
| WR-P0-002 | Dry Run mit Seiteneffekten | `assertLiveExecution()`, safe-by-default DRY_RUN | `workflow-dry-run.service.spec.ts`, `WORKFLOW_DRY_RUN_2026-07.md` |
| WR-P0-003 | Cross-Tenant-Zugriff möglich | Scope-Evaluator fail-closed, org-scoped Queries | `workflow-security.production.spec.ts`, `workflow-dry-run.service.spec.ts` |
| WR-P0-004 | Events ohne Recovery | Transactional Outbox + BullMQ Retry + DLQ | `task-automation-outbox.spec.ts` |
| WR-P0-005 | Doppelte externe Kontakte | Idempotency-Keys (Outbox + Workflow-Run) | `workflow-engine.production.spec.ts` |
| WR-P0-006 | Approval setzt falsch fort | WAITING_APPROVAL blockiert Folge-Actions | `workflow-engine.production.spec.ts` |
| WR-P0-007 | Kein Maker-Checker | `WorkflowMakerCheckerService`, PENDING_ACTIVATION | `workflow-maker-checker.service.spec.ts` |
| WR-P0-008 | Keine Audit-Spur / PII in Logs | `org_workflow_audit_events`, Redaction | `workflow-audit.service.spec.ts` |
| WR-P0-009 | Migration Doppelpfad | Execution Router Mutex legacy/shadow/cutover | `task-automation-workflow-migration.spec.ts` |
| WR-P0-010 | Kein Kill Switch | `WORKFLOW_RUNTIME_KILL_*` + Rollout Service | `workflow-runtime-rollout.spec.ts` |
| WR-P0-011 | KI ohne Transparenz | `buildAiMessageTransparency()`, Voice Opening Script | `workflow-audit-and-ai-transparency-2026-07.md` |
| WR-P0-012 | Kritische Action ohne Freigabe | Policy + Runtime Approval Gates | `workflow-engine.production.spec.ts` |

### P1 — behoben oder akzeptiert mit Restrisiko

| ID | Befund | Status | Anmerkung |
|----|--------|--------|-----------|
| WR-P1-001 | Email/SMS nicht im LIVE Executor | **Partial** | Contract-Mock + Policy; kein Live-Resend in Workflow-Pfad |
| WR-P1-002 | Voice im Workflow nur Katalog | **Accepted** | Voice AI separater Stack; Twilio-Signatur in `twilio-webhook.service.ts` |
| WR-P1-003 | Timer nur via Task `activatesAt` | **Partial** | Booking-Pipeline getestet; kein generischer Workflow-Delay-Executor |
| WR-P1-004 | Quiet Hours / Opt-out | **Partial** | Contract-Hook; nicht vollständig LIVE |
| WR-P1-005 | Kein Workflow-Monitoring auf Prod | **Offen (Ops)** | Metriken im Code; VPS ohne Workflow-Alerts |
| WR-P1-006 | PM2 3161 Restarts | **Offen (Ops)** | Nicht Workflow-spezifisch; RCA empfohlen |
| WR-P1-007 | `org_workflow_audit_events` fehlt auf VPS | **Deploy-blockiert** | Migration Phase 11 |

### P2 — Restverbesserungen

| ID | Befund | Status |
|----|--------|--------|
| WR-P2-001 | Legacy Builder `window.confirm` | Offen — nicht Primary Path |
| WR-P2-002 | Kein axe/Playwright UI-E2E | Vitest-Contracts only |
| WR-P2-003 | `backend.env` mode 644 auf VPS | Ops-Härtung |
| WR-P2-004 | Kein Alertmanager | Infra-Backlog |
| WR-P2-005 | Per-Action Wall-Clock Timeout | Outbox-Backoff only |

---

## NO-GO-Kriterien — unabhängige Prüfung

| Kriterium | Code (Repo) | VPS (Prod) | Ergebnis |
|-----------|-------------|------------|----------|
| Dry Run erzeugt Seiteneffekt | `assertLiveExecution` in Engine + Executor | Nicht E2E-getestet | **PASS (Code)** |
| Cross-Tenant-Zugriff möglich | Specs + Scope fail-closed | Legacy-only, 0 Workflows | **PASS** |
| Doppelte externe Kundenkontakte | Idempotency + Policy | 0 Runs | **PASS (kein Live-Traffic)** |
| Approval setzt falsch fort | Engine-Tests | N/A | **PASS (Code)** |
| Events ohne Recovery verloren | Outbox + Retry + DLQ | Outbox 0 rows, Queue lag 0 | **PASS** |
| Provider-Webhooks nicht signaturgeprüft | Twilio `validateRequest` | Voice-Modul deployt | **PASS** |
| Secrets in Code/Config/Logs | Secret-Scan in Audit-Service | Log-Muster `password`/`authorization` (P1) | **PASS (Code)** / **WARN (Ops)** |
| Kill Switch fehlt | `WORKFLOW_RUNTIME_KILL_SWITCH` + APIs | **Keine Env, keine Tabellen** | **PASS (Code)** / **FAIL (VPS)** |
| Kritische Tests rot | 373/373 PASS (328 BE + 45 FE) | N/A | **PASS** |
| Kein Rollback | Runbook: `legacy` mode + Stage DISABLED | Nicht konfiguriert | **PASS (Doc)** / **FAIL (VPS aktiv)** |
| Echte Kundenkontakte ohne Policy | Policy Engine + Sandbox | `WHATSAPP_SIMULATE=true` | **PASS** |
| KI kommuniziert ohne Transparenz | AI Transparency Builder | Nicht live getestet | **PASS (Code)** |
| Kritische Action ohne Freigabe | Maker-Checker + Policy | N/A | **PASS (Code)** |
| Migration erzeugt Doppelpfade | Router Mutex | Env fehlt → nur Legacy | **PASS (aktuell)** / **Risiko nach Deploy** |

---

## Noch offene Befunde

### Blocker vor produktivem Workflow-Rollout (P0 Ops)

| ID | Befund | Aktion |
|----|--------|--------|
| OPS-P0-1 | VPS ~91 Commits hinter `main` | Merge + `cloud-agent-deploy.sh` |
| OPS-P0-2 | Migrationen `20260725140000` (Shadow), `20260725160000` (Rollout), Audit fehlen | `prisma migrate deploy` nach Release |
| OPS-P0-3 | Keine `WORKFLOW_*` / `TASK_AUTOMATION_WORKFLOW_RUNTIME_MODE` Env | Runbook Stage `DISABLED` oder `SHADOW` setzen |
| OPS-P0-4 | 0 Workflows auf Test-Org — kein API-E2E | Seed-Pilot-Workflow nach Deploy |
| OPS-P0-5 | Kill Switch operativ nicht verfügbar | Deploy + Env `WORKFLOW_RUNTIME_KILL_SWITCH` testen |

### Hoch (P1)

| ID | Befund |
|----|--------|
| OPS-P1-1 | PM2 Restart-Zähler 3161 — Stabilitäts-RCA |
| OPS-P1-2 | Kein Workflow-spezifisches Alerting (Shadow-Deviation, Outbox-DLQ, Rollout-Gates) |
| OPS-P1-3 | `EMAIL_SIMULATE_ENABLED=false` — risikoreich für Kanal-E2E |
| OPS-P1-4 | Email/SMS LIVE im Workflow-Executor noch Contract-only |

### Mittel (P2)

| ID | Befund |
|----|--------|
| OPS-P2-1 | Legacy UI Builder mit `window.confirm` |
| OPS-P2-2 | Kein automatisierter axe/Playwright für Workflow-UI |
| OPS-P2-3 | `battery.v2` Queue failed=23 (nicht Workflow) |

---

## Testnachweise

### Ausführung 2026-07-25T16:47–16:49Z (Pass 2 — unabhängig)

| Prüfung | Befehl | Ergebnis |
|---------|--------|----------|
| Backend Unit & Service | `npm run test:workflow-automation` | **229/229 PASS** |
| Backend Integration | `npm run test:workflow-automation:integration` | **66/66 PASS** |
| Backend Security/Audit | `npm run test:workflow-automation:security` | **33/33 PASS** |
| Shadow + Rollout | `jest workflow-shadow workflow-runtime-rollout` | **31/31 PASS** (Teilmenge von Unit) |
| Frontend | `vitest workflow-automation/` | **45/45 PASS** |
| **Gesamt (dedupliziert)** | Unit + Integration + Security + Frontend | **373 PASS** |
| Backend Build | `npm run build` | **PASS** |
| Frontend Build | `npm run build` | **PASS** (~12.9 s) |
| Typecheck (verify script) | `tsc` in `test:workflow-automation:verify` | **2 Fehler** in `ai-explain-overdue-return` / `get-vehicle-booking-context` Specs — **nicht Workflow** |

### Ausführung 2026-07-25T12:39–12:45Z (Pass 1)

| Prüfung | Befehl | Ergebnis |
|---------|--------|----------|
| Backend Unit & Service | `npm run test:workflow-automation` | **229/229 PASS** |
| Backend Integration | Teil von `test:workflow-automation:verify` | **66/66 PASS** |
| Frontend | `npm run test:workflow-automation:verify` | **45/45 PASS** |
| **Gesamt Workflow-Matrix** | `test:workflow-automation:verify` | **340 PASS** (verify exit 0) |
| Backend Build | `npm run build` | **PASS** |
| Frontend Build | `npm run build` | **PASS** |
| Typecheck (verify script) | `tsc` in verify | **2 pre-existing Fehler** in `ai-explain-overdue-return` / `get-vehicle-booking-context` Specs — **nicht Workflow-blockierend**; `nest build` grün |

### Szenario-Matrix (42 Minimum)

| Status | Anzahl |
|--------|-------:|
| automated | 31 |
| partial | 8 |
| not-applicable | 3 |

Registry: `backend/src/modules/workflows/testing/workflow-production-readiness.scenarios.ts`

### Schlüssel-Suites

| Suite | Tests | Fokus |
|-------|------:|-------|
| `workflow-engine.production.spec.ts` | 7 | Matcher, Idempotenz, Approval, Partial Failure |
| `task-automation-outbox.spec.ts` | 10+ | Atomic Enqueue, Retry, DLQ, Parallel Workers |
| `workflow-runtime-rollout.spec.ts` | 24 | Stages, Gates, Kill Switch, Maker-Checker |
| `workflow-maker-checker.service.spec.ts` | 15+ | Publish, Approve, Reject, Expiry |
| `workflow-dry-run.service.spec.ts` | 10+ | Keine Seiteneffekte, Policy Block |
| `task-automation-workflow-migration.spec.ts` | 12+ | Migration, Shadow, Cross-Tenant Reject |
| `workflow-mobile-a11y.test.ts` | 8 | Touch 44px, aria, focus return |

---

## VPS-Nachweise

**Prüfzeit:** 2026-07-25T16:49Z (Pass 2, SSH read-only — bestätigt Pass 1)

| Prüfpunkt | Ergebnis |
|-----------|----------|
| Health `GET /api/v1/health` | **200** `status: ok`, uptime ~29552 s |
| Readiness | **200** — postgres, redis, clickhouse, workers, documentExtraction |
| Aktiver Release | `20260725083109_data-auth-rc` |
| Deploy-Commit | `6080dbd2` |
| Shadow API | **404** (nicht deployt) |
| Rollout API | **404** (nicht deployt) |
| `WORKFLOW_*` Env | **NONE** |
| Queue `task.automation` | wait=**0** |
| PM2 `synqdrive` | **online**, Restarts **3161** |
| `WORKFLOW_*` Env | **NONE** |
| Workflow-Tabellen | `org_workflows`, `org_workflow_runs`, `org_workflow_action_runs`, `org_workflow_approvals` — **0 Zeilen** |
| Shadow/Rollout/Audit-Tabellen | **FEHLEN** |
| `task_automation_outbox` | **0 Zeilen**, kein Stale |
| Queue `task.automation` | wait=0, active=0 |
| Sandbox | `WHATSAPP_SIMULATE_ENABLED`, `VOICE_E2E_ALLOW_LIVE_CALLS` gesetzt |
| SSH | `cloud-agent-verify-vps.sh` — **OK** |

**Fazit VPS:** Basis-Infrastruktur stabil; **Workflow Runtime Phase 11 nicht produktiv**.

---

## Compliance-Nachweise

| Anforderung | Implementierung | Status |
|-------------|-----------------|--------|
| **DSGVO Datenminimierung** | Outbox ohne PII; Audit-Redaction | ✅ Code |
| **DSGVO Zweckbindung** | Policy Engine blockiert ohne Consent/Opt-out-Hook | ⚠️ Partial LIVE |
| **Audit Trail** | `org_workflow_audit_events` + `activity_logs` Mirror | ✅ Code / ❌ VPS-Tabelle fehlt |
| **Retention-Klassen** | TECHNICAL 90d, GOVERNANCE ~7y | ✅ Dokumentiert |
| **AI-Transparenz** | `aiTransparency` JSON, Voice Opening Script | ✅ Code |
| **Maker-Checker (Vier-Augen)** | 10 geschützte Operationen | ✅ Code + Tests |
| **RBAC** | `workflow-automation.manage`, Permission Guards | ✅ Tests |
| **ISO-relevant: Zugriffskontrolle** | Org-scoped APIs | ✅ |
| **ISO-relevant: Logging** | Strukturierte Audit-Events, keine Stacks mit PII | ✅ Code |
| **ISO-relevant: Change Management** | Rollout Maker-Checker + Gates | ✅ Code / ❌ VPS |
| **ISO-relevant: Incident Response** | Kill Switch + Rollback Runbook | ✅ Doc / ❌ VPS aktiv |

**Hinweis:** Keine formale ISO-Zertifizierung behauptet. Organisatorische Nachweise (DPIA, Verarbeitungsverzeichnis, Pen-Test) liegen außerhalb dieses Audits.

---

## Performance

| Metrik | Harness (Tier A) | VPS (Tier B) |
|--------|------------------|--------------|
| Event-to-Match | Nicht instrumentiert (In-Memory) | N/A |
| Match-to-Action | Nicht instrumentiert | N/A |
| Timer-Abweichung | Deterministisch (`BOOKING_TASK_FIXED_NOW`) | N/A |
| Outbox Poll | 30s Cron (konfigurierbar) | Aktiv, 0 Backlog |
| Queue-Lag `task.automation` | 0 (Mock) | **0** |
| Test-Suite Backend Unit | ~14 s | — |
| Test-Suite Integration | ~46 s | — |

**Empfehlung:** Nach Deploy Shadow-Soak mit Prometheus-Histogrammen für Engine-Latenz instrumentieren.

---

## Reliability

| Aspekt | Bewertung |
|--------|-----------|
| Transactional Outbox | ✅ At-least-once mit Idempotenz |
| Stale Processing Recovery | ✅ `recoverStaleProcessing` getestet |
| Partial Failure | ✅ Engine markiert FAILED, kein Silent-Success |
| Dead Letter + Replay | ✅ Maker-Checker-gated Replay |
| Process Restart | ✅ Outbox überlebt Restart (Spec) |
| Single Worker Instance | ✅ VPS: 1× Node, keine doppelten Consumer |
| PM2 Instabilität | ⚠️ 3161 historische Restarts — RCA vor Cutover |

---

## Security

| Kontrolle | Status |
|-----------|--------|
| Tenant-Isolation | ✅ Fail-closed Scope + negative Tests |
| RBAC auf Admin/Workflow APIs | ✅ Characterization Tests |
| AI Prompt Injection | ✅ `workflow-security.production.spec.ts` |
| PII Redaction | ✅ Write + Read time |
| Secret Scan vor Persist | ✅ Audit Service |
| Twilio Webhook Signature | ✅ `twilio-signature.util.ts` |
| Dry Run / Shadow keine LIVE Calls | ✅ `assertLiveExecution` |
| Kill Switch | ✅ Code / ❌ VPS |
| Env-Datei Permissions (VPS) | ⚠️ 644 — zu permissiv für Secrets |
| UFW (VPS) | ⚠️ inactive — Hostinger-Firewall extern |

---

## UI und Mobile

| Prüfpunkt | Ergebnis |
|-----------|----------|
| Touch Targets ≥44px | ✅ `workflow-mobile-a11y.test.ts` |
| Responsive 320–1024px | ✅ Card-Layout, kein fixed Table auf Primary Path |
| aria / focus return | ✅ DetailDrawer + Config Drawer |
| Dark/Light | ✅ Bestehendes Theme |
| Dry-Run Panel `aria-live` | ✅ `workflow-simulate.test.ts` |
| Legacy Builder | ⚠️ `window.confirm` — nicht Primary Path |

Referenz: [workflow-automation-ui-mobile-readiness-2026-07.md](./workflow-automation-ui-mobile-readiness-2026-07.md)

---

## Rollback

| Mechanismus | Beschreibung |
|-------------|--------------|
| **Env Rollback** | `TASK_AUTOMATION_WORKFLOW_RUNTIME_MODE=legacy` |
| **Stage Rollback** | `WORKFLOW_RUNTIME_ROLLOUT_STAGE=DISABLED` |
| **Kill Switch** | `WORKFLOW_RUNTIME_KILL_SWITCH=true` (+ per-channel) |
| **Migration Rollback** | `rollbackWorkflowVersion` + `task_automation_workflow_migration_records` |
| **Deploy Rollback** | Vorheriger Release-Symlink + PM2 restart (VPS-Deploy-Script) |
| **VPS aktuell** | Legacy-only — impliziter Rollback-Zustand, aber ohne Phase-11-Controls |

Runbook: `docs/operations/workflow-runtime-rollout-runbook-2026-07.md`

---

## Monitoring

| Signal | Code | VPS |
|--------|------|-----|
| Outbox Metriken | ✅ Prometheus Counters/Gauges | Nicht Workflow-spezifisch alertiert |
| Queue Lag Alerts | ✅ Generic `QueueLagHigh` | Prometheus läuft |
| Shadow Deviation | ✅ Threshold Config | Feature nicht deployt |
| Rollout Gates API | ✅ `GET .../runtime-rollout/gates` | Nicht live |
| Alertmanager | — | ❌ Nicht deployt |
| Health/Readiness | ✅ | ✅ 200 |

---

## Restrisiken

1. **Deploy-Sprung ~91 Commits** — Regressionsrisiko; volle Testmatrix + Staging-Smoke erforderlich.
2. **Kanal-LIVE-Lücken** — Email/SMS im Workflow-Executor noch Contract-only; WhatsApp simuliert auf VPS.
3. **Kein VPS-E2E** — Latenz, Timer-Drift und Provider-Failover nicht live validiert.
4. **PM2 Restart-Historie** — potenzielle OOM/uncaught exceptions unter Last.
5. **Doppelpfad nach Deploy** — ohne explizite Env (`legacy` default) sicher; Cutover nur nach Shadow-Soak.
6. **Organisatorische Compliance** — DPIA/Verzeichnis nicht Gegenstand dieses technischen Audits.

---

## Bedingungen bei CONDITIONAL GO

Die Produktionsfreigabe für **Workflow Runtime Rollout** gilt erst, wenn **alle** Punkte erfüllt sind:

1. **Merge & Deploy** — `main` mit Phase 11 auf VPS (`cloud-agent-deploy.sh`).
2. **Migrationen** — Shadow (`20260725140000`), Rollout (`20260725160000`), Audit-Events angewendet und verifiziert.
3. **Env Initial** — `WORKFLOW_RUNTIME_ROLLOUT_STAGE=DISABLED`, `TASK_AUTOMATION_WORKFLOW_RUNTIME_MODE=legacy`, Kill-Switch-Keys dokumentiert.
4. **Gates grün** — `WORKFLOW_RUNTIME_GATE_TESTS_PASS=true` nach CI; API `GET .../runtime-rollout/gates` alle PASS.
5. **Shadow-Soak** — mindestens 1 Pilot-Org, 7 Tage `shadow_compare`, Deviation < Threshold.
6. **Monitoring** — Workflow-Alerts (Outbox DLQ, Shadow-Deviation, Stage-Changes) in Grafana.
7. **VPS-E2E Wiederholung** — Tier B der [E2E Acceptance](./workflow-automation-e2e-acceptance-2026-07.md) mit Test-Workflows.
8. **PM2 RCA** — Restart-Ursache dokumentiert oder `max_memory_restart` gesetzt.
9. **Rollback-Drill** — Kill Switch + `legacy` mode einmal in Staging/Pilot ausgeführt.

---

## Produktionsfreigabe-Checkliste

- [ ] `main` merged, VPS deployt aktuellen Commit
- [ ] `prisma migrate deploy` — Shadow/Rollout/Audit-Tabellen vorhanden
- [ ] `WORKFLOW_RUNTIME_ROLLOUT_STAGE=DISABLED` gesetzt
- [ ] `TASK_AUTOMATION_WORKFLOW_RUNTIME_MODE=legacy` (bis Shadow freigegeben)
- [ ] Kill-Switch Env-Keys in `backend.env` (default `false`)
- [ ] `npm run test:workflow-automation:verify` auf Release-Commit grün
- [ ] Health + Readiness 200
- [ ] Pilot-Org Shadow aktiviert (nach Gate PASS)
- [ ] Keine Outbox-Stale-Rows >1h
- [ ] Maker-Checker für Stage-Promotion getestet
- [ ] Audit-Events sichtbar in Admin-UI
- [ ] Runbook im Ops-Team verteilt
- [ ] 24h-Monitoring-Schicht benannt

---

## Nachkontrollen

### 24 Stunden nach Deploy

| Check | Aktion |
|-------|--------|
| Health/Readiness | Alle 15 min; Alert bei ≠200 |
| PM2 Restarts | Zähler delta = 0 erwünscht |
| `task.automation` Queue | wait/active/failed |
| Outbox Backlog Gauge | <10 oder erklärt |
| Error-Log Stichprobe | Keine Tokens/PII |
| Migration-Tabellen | Row counts stabil |
| Rollout API Smoke | `GET .../runtime-rollout/settings` 200 |

### 7 Tage (Shadow-Soak)

| Check | Aktion |
|-------|--------|
| Shadow-Deviations | Review `org_workflow_shadow_comparisons` |
| Legacy vs Workflow Plans | Abweichungsrate <5% (konfigurierbar) |
| False-positive Approvals | 0 unerwartete WAITING_APPROVAL |
| Kundenkontakte | 0 LIVE external ohne Approval |
| Gate Re-Check | `P0_TESTS`, `SHADOW_DEVIATION` PASS |

### 30 Tage (Pilot-Review)

| Check | Aktion |
|-------|--------|
| Stage Promotion | Nur mit Maker-Checker + Gates |
| DLQ Rate | Trend stabil oder fallend |
| Audit Retention Job | TECHNICAL_LOG Purge ok |
| Performance P95 | Engine + Outbox unter SLA |
| Rollback-Drill | Dokumentiertes Tabletop |
| Restrisiko-Review | P1/P2 aus diesem Audit schließen oder akzeptieren |

---

## Referenzen

- [workflow-automation-vps-control-audit-2026-07.md](./workflow-automation-vps-control-audit-2026-07.md)
- [workflow-automation-e2e-acceptance-2026-07.md](./workflow-automation-e2e-acceptance-2026-07.md)
- [workflow-automation-production-test-matrix-2026-07.md](../testing/workflow-automation-production-test-matrix-2026-07.md)
- [workflow-runtime-rollout-runbook-2026-07.md](../operations/workflow-runtime-rollout-runbook-2026-07.md)
- [workflow-shadow-mode-2026-07.md](../operations/workflow-shadow-mode-2026-07.md)
- [task-automation-to-workflow-runtime-2026-07.md](../migrations/task-automation-to-workflow-runtime-2026-07.md)

---

*Unabhängiger Post-Remediation-Audit — Phase 12 Prompt 54/54. Keine destruktiven Aktionen auf VPS. Keine echten Kunden kontaktiert.*
