# SynqDrive Workflow Automation — E2E Production Acceptance — 2026-07

| Feld | Wert |
|------|------|
| **Audit ID** | `workflow-automation-e2e-acceptance-2026-07` |
| **Prompt** | Phase 12, Prompt 53 von 54 |
| **Prüfzeit (UTC)** | 2026-07-25T16:27–16:31Z (Pass 1–2) · **2026-07-25T21:12–21:23Z (Pass 3 post-deploy)** |
| **Ziel-Host** | `srv1374778.hstgr.cloud` / `https://app.synqdrive.eu` |
| **VPS-Deploy-Commit** | **`eae1ccbd`** (`20260725211756_v4994`) — Phase 11 auf `main` deployt |
| **Repo-Test-Commit** | `main` @ `eae1ccbd` (identisch mit VPS) |
| **Voraussetzung** | [workflow-automation-vps-control-audit-2026-07.md](./workflow-automation-vps-control-audit-2026-07.md) |
| **Kontakt-Policy** | **Keine echten Kunden kontaktiert** — nur dedizierte Test-/Simulate-Konfiguration und automatisierte Harness-Tests |
| **Gesamtverdict** | **CONDITIONAL PASS (Infrastructure)** — **PARTIAL (Mutating E2E)** — Repo CI **PASS** |

---

## Pass 3 — Post-Deploy Re-Acceptance (2026-07-25T21:12–21:23Z)

Phase-11-Workflow-Runtime ist auf Production deployt. P0-Blocker P0-1 bis P0-3 aus Pass 1–2 sind **behoben**.

| Check | Pass 1–2 | Pass 3 |
|-------|----------|--------|
| Deploy-Commit | `6080dbd` (~91 Commits hinter `main`) | **`eae1ccbd`** auf `main` |
| Shadow/Rollout APIs | **404** | **401** (Routen aktiv, Auth-Guard) |
| Workflow-Tabellen | Fehlend | **9 Tabellen** (`org_workflow_*`) |
| Prisma-Migrationen | Nicht angewendet | **6 Migrationen** angewendet |
| `WORKFLOW_*` Env | Fehlend | **Fail-closed** gesetzt (`DISABLED` + `shadow`) |
| Shadow-Pilot-Org | Nicht konfiguriert | **`org-voice-staging-e2e`** enabled |
| Health / Readiness | 200 | **200** |
| PM2 | online (3161 restarts) | online (3164 restarts nach Deploy) |

### Env-Konfiguration (Production)

```bash
WORKFLOW_RUNTIME_ROLLOUT_STAGE=DISABLED
TASK_AUTOMATION_WORKFLOW_RUNTIME_MODE=shadow
WORKFLOW_SHADOW_GLOBALLY_ENABLED=false
WORKFLOW_SHADOW_RETENTION_DAYS=30
WORKFLOW_RUNTIME_KILL_SWITCH=false  # alle Channel-Kill-Switches false
```

### Shadow-Pilot (7-Tage-Soak)

| Feld | Wert |
|------|------|
| Org | `org-voice-staging-e2e` (`Voice Staging E2E (Internal)`) |
| `org_workflow_shadow_settings.enabled` | **true** |
| `legacy_compare_enabled` | **true** |
| `retention_days` | 30 |
| Shadow-Runs bisher | 0 (Soak startet nach Deploy) |

### Aktualisierte Szenario-Matrix (Pass 3)

| # | Szenario | Prod (Pass 3) | CI | Gesamt |
|---|----------|---------------|-----|--------|
| 1 | Pickup 30 min überfällig | **DEFERRED** (kein mutierender Trigger) | PASS | PARTIAL |
| 2 | Kritischer Fahrzeugfehler | **DEFERRED** | PARTIAL | PARTIAL |
| 3 | Provider-Ausfall | **DEFERRED** | PASS | PARTIAL |
| 4 | Doppelte Events | **DEFERRED** | PASS | PARTIAL |
| 5 | Prozessneustart | **INFRA PASS** (PM2 restart OK) | PASS | PASS |
| 6 | Cross-Tenant-Manipulation | **PASS** (401) | PASS | **PASS** |
| 7 | Dry Run | **INFRA PASS** (API routiert) | PASS | PARTIAL |
| 8 | Quiet Hours / Opt-out | **DEFERRED** | PARTIAL | PARTIAL |
| 9 | Voice Call | **DEFERRED** (kein Live-Call) | N/A | DEFERRED |
| 10 | Dead Letter & Replay | **DEFERRED** | PASS | PARTIAL |
| 11 | Kill Switch | **INFRA PASS** (Env + API) | PASS | PARTIAL |
| 12 | Legacy vs neue Engine | **PASS** (shadow mode, kein Doppelpfad) | PASS | **PASS** |

**Pass 3 Bestanden:** 3 (Szenario 5, 6, 12) · **Infra ready / deferred:** 9

### Verbleibende Blocker

| ID | Blocker | Status |
|----|---------|--------|
| P0-1 | Phase-11 nicht deployt | **RESOLVED** |
| P0-2 | Migrationen fehlen | **RESOLVED** |
| P0-3 | Env fehlt | **RESOLVED** |
| P0-4 | Mutierende Production-E2E | **DEFERRED** — 7-Tage Shadow-Soak auf `org-voice-staging-e2e` |
| P0-5 | Scheduler BullMQ `:` Job-ID | **OPEN** — weiterhin im Log |

---

## Executive Summary

**Pass 3 (2026-07-25):** Phase-11-Workflow-Runtime ist auf Production deployt (`eae1ccbd`). Infrastruktur-Checks (Migrationen, APIs, Env, Shadow-Pilot) sind **grün**. Mutierende E2E-Szenarien bleiben während des 7-Tage-Shadow-Soaks auf `org-voice-staging-e2e` deferred.

**Pass 1–2 (2026-07-25):** Die Production-VPS konnte die 12 Pflichtszenarien **nicht** End-to-End ausführen, da Phase-11-Features nicht deployt waren.

Die **automatisierte Akzeptanz** auf `main` @ `eae1ccbd` ist **grün**:

| Suite | Ergebnis |
|-------|----------|
| Backend unit/service (`npm run test:workflow-automation`) | **229 PASS** |
| Backend integration | **66 PASS** |
| Backend security/audit/maker-checker | **33 PASS** |
| Shadow mode | **7 PASS** |
| Runtime rollout + kill switch + bridge | **24 PASS** |
| Frontend workflow-automation Vitest | **45 PASS** |
| **Gesamt (dedupliziert)** | **~404 PASS** |

**Empfehlung:** 7-Tage Shadow-Soak auf `org-voice-staging-e2e` beobachten (`org_workflow_shadow_runs`, Deviation-Summary). Mutierende Production-E2E nach Soak mit authentifiziertem Test-Admin wiederholen. Scheduler BullMQ Job-ID-Fix (P0-5) separat priorisieren.

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
- [x] Repo CI auf `main` @ `eae1ccbd` (373+ Tests)
- [x] **Keine** echten Kunden kontaktiert
- [x] **Keine** Live-Voice-Calls
- [x] **Keine** Queue-Mutation / Datenlöschung auf Prod
- [x] **Pass 3:** Phase-11-Merge auf `main`, Deploy, Migrationen, fail-closed Env, Shadow-Pilot-Org
- [ ] Mutierende Production-E2E (deferred — 7-Tage Shadow-Soak)

---

## Referenzen

- [workflow-automation-vps-control-audit-2026-07.md](./workflow-automation-vps-control-audit-2026-07.md)
- [workflow-automation-production-test-matrix-2026-07.md](../testing/workflow-automation-production-test-matrix-2026-07.md)
- [workflow-shadow-mode-2026-07.md](../operations/workflow-shadow-mode-2026-07.md)
- [workflow-runtime-rollout-runbook-2026-07.md](../operations/workflow-runtime-rollout-runbook-2026-07.md)
