# SynqDrive Workflow Automation — E2E Production Acceptance — 2026-07

| Feld | Wert |
|------|------|
| **Audit ID** | `workflow-automation-e2e-acceptance-2026-07` |
| **Prompt** | Phase 12, Prompt 53 von 54 |
| **Prüfzeit (UTC)** | 2026-07-25T16:27–16:31Z |
| **Ziel-Host** | `srv1374778.hstgr.cloud` / `https://app.synqdrive.eu` |
| **VPS-Deploy-Commit** | `6080dbd260b01e8e091f17687799fbb73bde290a` (`20260725083109_data-auth-rc`) |
| **Repo-Test-Commit** | `cursor/workflow-runtime-rollout-2a81` (Phase-11-Workflow-Stand, **nicht** auf VPS) |
| **Voraussetzung** | [workflow-automation-vps-control-audit-2026-07.md](./workflow-automation-vps-control-audit-2026-07.md) |
| **Kontakt-Policy** | **Keine echten Kunden kontaktiert** — nur dedizierte Test-/Simulate-Konfiguration und automatisierte Harness-Tests |
| **Gesamtverdict** | **FAIL (Production E2E)** — **PASS (Repo CI Harness)** auf Feature-Branch |

---

## Executive Summary

Die **Production-VPS** kann die 12 Pflichtszenarien der neuen Workflow Runtime **nicht** End-to-End ausführen: Phase-11-Features (Shadow, Rollout, Migration Bridge, erweiterte Audit-Tabellen) sind **nicht deployt** (`CONDITIONAL NO-GO` aus Prompt 52). Legacy Task Automation läuft; `org_workflows` / `org_workflow_runs` sind leer.

Die **automatisierte Akzeptanz** auf dem Repo-Stand `cursor/workflow-runtime-rollout-2a81` ist **grün**:

| Suite | Ergebnis |
|-------|----------|
| Backend unit/service (`npm run test:workflow-automation`) | **229 PASS** |
| Backend integration | **66 PASS** |
| Backend security/audit/maker-checker | **33 PASS** |
| Shadow mode | **7 PASS** |
| Runtime rollout + kill switch + bridge | **24 PASS** |
| Frontend workflow-automation Vitest | **45 PASS** |
| **Gesamt (dedupliziert)** | **~404 PASS** |

**Empfehlung:** Production-E2E erst nach Deploy Phase 11 + Migrationen + Env-Konfiguration wiederholen. Bis dahin gilt Repo-CI als Nachweis der fachlichen Korrektheit; VPS nur für Legacy-Pfad und Sicherheits-Gates.

### Testorganisation & Sandbox (Production)

| Ressource | Konfiguration | Verwendung |
|-----------|---------------|------------|
| `VOICE_E2E_ORG_ID` | **SET** in `backend.env` | Dedizierte Voice-Staging-Org (Präfix `org-voic…`, 1 Task in DB) |
| `WHATSAPP_SIMULATE_ENABLED` | **SET** | Kein echter WhatsApp-Versand |
| `EMAIL_SIMULATE_ENABLED` | **SET** | Kein echter E-Mail-Versand |
| `VOICE_E2E_ALLOW_LIVE_CALLS` | **SET** | Live-Calls nur mit Allowlist; **kein Testanruf ausgeführt** |
| Produktive Kunden-Orgs | `faa710c9…` (36 Tasks) | **Nicht** für E2E verwendet — nur aggregierte Zählung |

---

## Messwerte (Production VPS, read-only)

| Metrik | Wert | Quelle |
|--------|------|--------|
| Event-to-Match-Latenz | **n/a** | 0 Workflow-Runs; Engine nicht aktiv |
| Match-to-Action-Latenz | **n/a** | 0 Workflow-Action-Runs |
| Timer-Abweichung | **n/a** | Keine Workflow-Timer-Tabelle auf VPS |
| Queue-Lag `task.automation` | **0** | Redis `LLEN bull:task.automation:wait` |
| Retry-Dauer (Outbox) | **n/a** | 0 Outbox-Einträge |
| Delivery Status | **n/a** | Kein Workflow-Delivery auf Prod |
| Duplicate Rate | **n/a** | Keine Events ausgelöst |
| Dead-Letter-Rate (Outbox) | **0 %** | 0 Zeilen in `task_automation_outbox` |
| Worker Recovery | **PASS** | Readiness `workersEnabled: true` |
| Scheduler-Fehlercode | `Custom Id cannot contain :` | BullMQ Job-ID mit `:` (P1 aus VPS-Audit) |
| API Health Latenz | **~60 ms** | `GET /api/v1/health` HTTPS |
| Unauth Workflow API | **401** | Tenant-Guard aktiv |

---

## Szenario-Matrix (12 Pflichtszenarien)

Legende: **Prod** = Live-VPS E2E · **CI** = Repo-Harness auf Feature-Branch

| # | Szenario | Prod | CI | Gesamt |
|---|----------|------|-----|--------|
| 1 | Pickup 30 min überfällig | BLOCKED | PASS | **FAIL** |
| 2 | Kritischer Fahrzeugfehler | BLOCKED | PARTIAL | **FAIL** |
| 3 | Provider-Ausfall | BLOCKED | PASS | **FAIL** |
| 4 | Doppelte Events | BLOCKED | PASS | **FAIL** |
| 5 | Prozessneustart | BLOCKED | PASS | **FAIL** |
| 6 | Cross-Tenant-Manipulation | PASS | PASS | **PASS** |
| 7 | Dry Run | BLOCKED | PASS | **FAIL** |
| 8 | Quiet Hours / Opt-out | BLOCKED | PARTIAL | **FAIL** |
| 9 | Voice Call | BLOCKED | N/A | **FAIL** |
| 10 | Dead Letter & Replay | BLOCKED | PASS | **FAIL** |
| 11 | Kill Switch | BLOCKED | PASS | **FAIL** |
| 12 | Legacy vs neue Engine | PASS | PASS | **PASS** |

**Bestanden:** 2 · **Fehlgeschlagen/Blockiert:** 10

---

## Szenario 1 — Pickup 30 Minuten überfällig

| Feld | Inhalt |
|------|--------|
| **Voraussetzungen** | Booking mit geplantem Pickup; Task-Automation-Regel `booking.pickup.timing`; WhatsApp-Simulate; kein echter Kundenkontakt |
| **Schritte (Prod)** | 1) VPS-Audit: keine aktiven Workflows 2) Outbox leer 3) Kein mutierender Booking-Trigger auf Prod-Org |
| **Schritte (CI)** | `computeBookingPickupTiming` +30 min → `workflow-production-readiness.spec.ts`; `booking-task.pipeline.integration.spec.ts` |
| **Erwartet** | Timer/Re-Check eskaliert Priorität; WhatsApp nur im Simulate-Modus; Status-Webhook; Admin-Fallback-Task |
| **Prod — tatsächlich** | Workflow-Engine nicht aktiv; nur Legacy-Task-Pfad theoretisch möglich — **nicht** auf Prod-Testorg ausgelöst |
| **CI — tatsächlich** | Priorität `HIGH` nach 30 min; nicht `CRITICAL` vor 24 h — **PASS** |
| **Belege** | `workflow-production-readiness.spec.ts` Szenario 13; `booking-task.pipeline.integration.spec.ts` (24.7 s suite PASS) |
| **Ergebnis** | Prod: **BLOCKED** · CI: **PASS** · Gesamt: **FAIL** |
| **Abweichung** | P0: Phase-11-Runtime nicht auf VPS; WhatsApp/Status-Webhook im Workflow-Pfad nicht live testbar |

---

## Szenario 2 — Kritischer Fahrzeugfehler

| Feld | Inhalt |
|------|--------|
| **Voraussetzungen** | DIMO/Health-Event; Org-Admin-Benachrichtigung; KI-Entwurf mit Approval; kein erfundener Diagnose-Text |
| **Schritte (Prod)** | API `workflows/*` → 401 ohne JWT; keine konfigurierten Workflows |
| **Schritte (CI)** | `workflow-engine.production.spec.ts` (Approval pause); `workflow-dry-run.service.spec.ts` (Policy); `workflow-security.production.spec.ts` (Injection) |
| **Erwartet** | Event → Match → interne Meldung → KI-Entwurf → Approval-Gate → Kundenkontakt nur nach Freigabe; Diagnose nur aus Daten |
| **Prod — tatsächlich** | Keine Workflow-Runs; Approval-API nicht E2E auf Prod getestet |
| **CI — tatsächlich** | Approval-Pause/Resume PASS; AI-Injection blockiert PASS; LIVE Kundenkontakt-Kanal **nicht** im Executor — **PARTIAL** |
| **Belege** | `workflow-engine.production.spec.ts`; `workflow-security.production.spec.ts` |
| **Ergebnis** | Prod: **BLOCKED** · CI: **PARTIAL** · Gesamt: **FAIL** |
| **Abweichung** | E-Mail/WhatsApp LIVE im Workflow-Executor noch contract-only (Matrix #24–25 partial) |

---

## Szenario 3 — Provider-Ausfall

| Feld | Inhalt |
|------|--------|
| **Voraussetzungen** | Simulierter Provider-Fehler; Retry/Backoff; Fallback; Partial Failure |
| **Schritte (CI)** | `task-automation-outbox.spec.ts` (retry → DLQ); `workflow-engine.production.spec.ts` (partial failure) |
| **Schritte (Prod)** | Kein Workflow-Action-Run ausgelöst |
| **Erwartet** | Exponential Backoff; Partial Failure isoliert; Fallback in Preview |
| **Prod — tatsächlich** | Nicht ausführbar |
| **CI — tatsächlich** | Retry nach Fehler PASS; Dead-letter nach max attempts PASS; Partial failure PASS |
| **Belege** | `task-automation-outbox.spec.ts` Zeilen Processor retry/DLQ; `workflow-engine.production.spec.ts` |
| **Ergebnis** | Prod: **BLOCKED** · CI: **PASS** · Gesamt: **FAIL** |

---

## Szenario 4 — Doppelte Events

| Feld | Inhalt |
|------|--------|
| **Voraussetzungen** | Gleiches Domain-Event zweimal; Idempotency-Key |
| **Schritte (CI)** | `workflow-engine.production.spec.ts` — duplicate run skipped |
| **Schritte (Prod)** | 0 Runs — Dedup nicht live verifiziert |
| **Erwartet** | Genau eine Action / ein Run |
| **CI — tatsächlich** | `Skipping duplicate workflow run evt:dup:…` — **PASS** |
| **Belege** | `workflow-engine.production.spec.ts`; Outbox `claimForProcessing` idempotent |
| **Ergebnis** | Prod: **BLOCKED** · CI: **PASS** · Gesamt: **FAIL** |

---

## Szenario 5 — Prozessneustart

| Feld | Inhalt |
|------|--------|
| **Voraussetzungen** | Zustand WAITING / Approval / Retry während Neustart |
| **Schritte (CI)** | Outbox `recoverStaleProcessing`; Shadow idempotent persistence; Rollout in-flight kill-switch test |
| **Schritte (Prod)** | PM2 Uptime ~7.8 h; kein kontrollierter Restart während Test (read-only Policy) |
| **Erwartet** | Outbox recovers PROCESSING → PENDING; Approvals überleben Restart |
| **CI — tatsächlich** | Stale recovery PASS; Shadow dedup PASS; Kill switch preserves settings PASS |
| **Prod — tatsächlich** | Restart-Drill **nicht** ausgeführt (destruktiv) |
| **Belege** | `task-automation-outbox.spec.ts`; `workflow-shadow.spec.ts`; `workflow-runtime-rollout.spec.ts` In-flight |
| **Ergebnis** | Prod: **BLOCKED** · CI: **PASS** · Gesamt: **FAIL** |
| **Abweichung** | Prod Restart-Test bewusst ausgelassen; PM2 3161 historische Restarts (P0 VPS-Audit) |

---

## Szenario 6 — Cross-Tenant-Manipulation

| Feld | Inhalt |
|------|--------|
| **Voraussetzungen** | Org A versucht Org-B-Ressourcen |
| **Schritte (Prod)** | `GET …/organizations/org-voice-staging-e2e/workflows` ohne JWT → **401** |
| **Schritte (CI)** | `workflow-security.production.spec.ts`; Outbox cross-tenant reject; Rollout foreign tenant not found |
| **Erwartet** | Vollständig blockiert |
| **Prod — tatsächlich** | Unauthenticated → 401 — **PASS** |
| **CI — tatsächlich** | Tenant isolation + cross-tenant booking replay rejected — **PASS** |
| **Belege** | HTTPS 401; `TaskAutomationOutboxExecutorService — tenant scope`; `workflow-runtime-rollout.spec.ts` |
| **Ergebnis** | **PASS** |

---

## Szenario 7 — Dry Run

| Feld | Inhalt |
|------|--------|
| **Voraussetzungen** | Workflow Dry-Run API / Service |
| **Schritte (Prod)** | `POST …/dry-run` → 404 (Route nicht auf deploytem Stand für Test-Pfad) |
| **Schritte (CI)** | `workflow-dry-run.service.spec.ts` — `executed: false`, keine LIVE actions |
| **Erwartet** | Keinerlei Seiteneffekte |
| **CI — tatsächlich** | Dry-run plan without execution — **PASS** |
| **Prod — tatsächlich** | Endpoint nicht E2E auf Prod verifiziert (404 auf unauth test URL) |
| **Belege** | `workflow-dry-run.service.spec.ts`; Shadow `executed: false` |
| **Ergebnis** | Prod: **BLOCKED** · CI: **PASS** · Gesamt: **FAIL** |

---

## Szenario 8 — Quiet Hours und Opt-out

| Feld | Inhalt |
|------|--------|
| **Voraussetzungen** | Quiet-hours Policy; Recipient opt-out |
| **Schritte (CI)** | `workflow-communication-contract.spec.ts` Szenarien 31–32 |
| **Schritte (Prod)** | Nicht ausführbar — kein Workflow-LIVE |
| **Erwartet** | Externer Versand blockiert/verschoben; In-App erlaubt |
| **CI — tatsächlich** | Contract-Mock PASS — **PARTIAL** (kein voller Quiet-Hours-Engine) |
| **Belege** | Matrix #31–32 `partial`; `workflow-communication-contract.spec.ts` |
| **Ergebnis** | Prod: **BLOCKED** · CI: **PARTIAL** · Gesamt: **FAIL** |

---

## Szenario 9 — Voice Call

| Feld | Inhalt |
|------|--------|
| **Voraussetzungen** | SynqDrive Voice Orchestrator; `VOICE_E2E_ORG_ID`; Testnummer; AI-Hinweis; Post-Call Webhook |
| **Schritte** | **Kein Live-Anruf** — Policy + `VOICE_E2E_ALLOW_LIVE_CALLS` nur geprüft (Präsenz) |
| **Erwartet** | Testanruf nur an Allowlist; Webhook-Verarbeitung |
| **Prod — tatsächlich** | Config SET; Voice-Org existiert (`org-voic…`, 1 Task); **kein Anruf ausgeführt** |
| **CI — tatsächlich** | Workflow-Matrix #27 `not-applicable` — Voice separater Stack |
| **Belege** | VPS `backend.env` Präsenz; `docs/testing/voice-ai-e2e-test-matrix.md` |
| **Ergebnis** | Prod: **BLOCKED** (nicht ausgeführt) · CI: **N/A** · Gesamt: **FAIL** |
| **Abweichung** | Voice E2E erfordert dedizierten Staging-Lauf mit JWT + Allowlist — außerhalb read-only Audit |

---

## Szenario 10 — Dead Letter und kontrolliertes Replay

| Feld | Inhalt |
|------|--------|
| **Voraussetzungen** | Outbox max attempts; Admin replay API |
| **Schritte (CI)** | `task-automation-outbox.spec.ts` dead-letter; `task-automation-admin.service.spec.ts` replay |
| **Schritte (Prod)** | Outbox 0 Zeilen; Replay-Route im Boot-Log vorhanden (VPS-Audit) |
| **Erwartet** | DLQ nach max retries; kontrolliertes Replay nur Admin |
| **CI — tatsächlich** | DLQ + replay PASS |
| **Prod — tatsächlich** | Kein Live-DLQ; Replay nicht mutierend getestet |
| **Belege** | `task-automation-outbox.spec.ts`; VPS-Audit §3 TaskAutomationOutboxModule |
| **Ergebnis** | Prod: **BLOCKED** · CI: **PASS** · Gesamt: **FAIL** |

---

## Szenario 11 — Kill Switch

| Feld | Inhalt |
|------|--------|
| **Voraussetzungen** | Global/Org/Provider Kill Switches; Rollout-Gate |
| **Schritte (Prod)** | `GET …/workflows/runtime-rollout/settings` → **404** (nicht deployt) |
| **Schritte (CI)** | `workflow-runtime-rollout.spec.ts` — global/org/provider kill; audit on toggle |
| **Erwartet** | Neue Actions blockiert; In-Flight-Einstellungen erhalten |
| **CI — tatsächlich** | 24 Tests PASS inkl. kill switch + channel flags |
| **Prod — tatsächlich** | API fehlt — **BLOCKED** |
| **Belege** | `workflow-runtime-rollout.spec.ts` describe kill switches |
| **Ergebnis** | Prod: **BLOCKED** · CI: **PASS** · Gesamt: **FAIL** |

---

## Szenario 12 — Legacy und neue Engine (keine Doppelausführung)

| Feld | Inhalt |
|------|--------|
| **Voraussetzungen** | `TASK_AUTOMATION_WORKFLOW_RUNTIME_MODE`; Rollout stage; Shadow gate |
| **Schritte (Prod)** | Keine Workflow-Env → effektiv **Legacy-only**; 0 Workflow-Runs; Legacy Tasks vorhanden |
| **Schritte (CI)** | `workflow-runtime-rollout.spec.ts` bridge: `workflow_live` ohne legacy execute; `shadow_compare` legacy once + preview only |
| **Erwartet** | Kein Doppelpfad bei Shadow/Cutover |
| **Prod — tatsächlich** | Legacy-only durch fehlende Runtime — **kein Doppelrisiko** (Feature fehlt) — **PASS** |
| **CI — tatsächlich** | Bridge tests PASS |
| **Belege** | VPS-Audit §13; `task-automation-execution-router` in rollout spec |
| **Ergebnis** | **PASS** |
| **Abweichung** | Prod PASS nur weil neue Engine nicht aktiv — nicht weil Bridge live verifiziert |

---

## P0-Blocker (Production Go-Live)

| ID | Blocker | Remediation |
|----|---------|-------------|
| P0-1 | Phase-11-Workflow **nicht auf VPS** (~91 Commits Drift) | Merge PRs #888–#893; `cloud-agent-deploy.sh` |
| P0-2 | Shadow/Rollout/Audit-Migrationen fehlen | `prisma migrate deploy` + Tabellen-Check |
| P0-3 | Keine `WORKFLOW_*` / `TASK_AUTOMATION_WORKFLOW_RUNTIME_MODE` Env | Runbook Stage `DISABLED`/`SHADOW` setzen |
| P0-4 | Production-E2E der 12 Szenarien **nicht** durchführbar | Nach Deploy Acceptance **wiederholen** mit `VOICE_E2E_ORG_ID` |
| P0-5 | Scheduler BullMQ `:` Job-ID (1933×/Log) | Sanitizer deployen — blockiert Outbox-Enqueue zuverlässig |

---

## Zusammenfassung Messwerte (CI Harness)

| Metrik | Beobachtung (Harness) |
|--------|------------------------|
| Event-to-Match | In-memory engine &lt; 50 ms (kein Wall-Clock-SLA dokumentiert) |
| Idempotency duplicate skip | Logged in `workflow-engine.production.spec.ts` |
| Outbox retry backoff | Exponential, config-driven |
| Shadow persistence idempotency | Same shadow run ID on duplicate |
| Rollout kill switch | `legacy_only` + `killSwitchActive` flags |
| Frontend simulate UI | 8 tests `workflow-simulate.test.ts` |

---

## Durchgeführte Aktionen

- [x] VPS-Control-Audit als Voraussetzung gelesen
- [x] Read-only VPS-Checks (Health, API 401/404, Queue, DB counts, Simulate-Flags)
- [x] Repo CI auf `cursor/workflow-runtime-rollout-2a81` (404 Tests)
- [x] **Keine** echten Kunden kontaktiert
- [x] **Keine** Live-Voice-Calls
- [x] **Keine** Queue-Mutation / Datenlöschung auf Prod
- [ ] Mutierende Production-E2E (bewusst deferred bis Deploy)

---

## Referenzen

- [workflow-automation-vps-control-audit-2026-07.md](./workflow-automation-vps-control-audit-2026-07.md)
- [workflow-automation-production-test-matrix-2026-07.md](../testing/workflow-automation-production-test-matrix-2026-07.md)
- [workflow-shadow-mode-2026-07.md](../operations/workflow-shadow-mode-2026-07.md)
- [workflow-runtime-rollout-runbook-2026-07.md](../operations/workflow-runtime-rollout-runbook-2026-07.md)
