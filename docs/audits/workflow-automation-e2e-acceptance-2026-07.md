# Workflow Automation — End-to-End Production Acceptance — 2026-07

| Feld | Wert |
|------|------|
| **Audit ID** | `workflow-automation-e2e-acceptance-2026-07` |
| **Prompt** | Phase 12, Prompt 53 von 54 |
| **Prüfzeit (UTC)** | 2026-07-25T12:30–12:34Z |
| **Voraussetzung** | [workflow-automation-vps-control-audit-2026-07.md](./workflow-automation-vps-control-audit-2026-07.md) |
| **Ziel-Host** | `srv1374778.hstgr.cloud` / `https://app.synqdrive.eu` |
| **Deploy-Commit (VPS)** | `6080dbd2` (~91 Commits hinter Repo-`main`) |
| **Repo-Teststand** | `main` / Workflow-Automation-Verify auf Workspace-HEAD |
| **Test-Org (VPS)** | `VOICE_E2E_ORG_ID` gesetzt (Präfix `org-voic…`, **1** Org-Row, **0** Workflows) |
| **Sandbox** | `WHATSAPP_SIMULATE_ENABLED=true`, `VOICE_E2E_ALLOW_LIVE_CALLS=false` |
| **Kundenkontakt** | **Keine echten Kunden kontaktiert** — keine Live-PSTN, keine Prod-Workflow-Triggers mit Kundendaten |
| **Gesamtverdict** | **CONDITIONAL FAIL** — CI-Harness **PASS**; **VPS Production E2E BLOCKED** |

---

## Executive Summary

Die **automatisierte Acceptance-Suite** (229 Backend-Unit + 66 Integration + 45 Frontend = **340 Tests**, alle **PASS**) deckt die Pflichtszenarien auf **Harness-/Sandbox-Ebene** ab (dedizierte Fixture-Orgs `org-a`/`org-b`, In-Memory-Outbox, Contract-Mocks, keine Live-Provider).

Eine **vollständige Production-E2E-Ausführung auf der VPS** ist zum Prüfzeitpunkt **nicht möglich**, weil:

1. Phase-11-Workflow-Runtime (Shadow, Rollout, Migration-Bridge) **nicht deployt** ist.
2. **0** `org_workflows` / **0** `org_workflow_runs` auf Prod (inkl. Test-Org).
3. `VOICE_E2E_ALLOW_LIVE_CALLS=false` — Voice-Szenario nur als Security/Contract, nicht als Live-Call.
4. `EMAIL_SIMULATE_ENABLED=false` auf VPS — kein risikofreier E-Mail-Live-Test.

**Empfehlung:** Nach Deploy von Phase 11 + expliziter Sandbox-Env (`EMAIL_SIMULATE_ENABLED=true`) die VPS-E2E-Matrix wiederholen.

---

## Testmethodik

| Tier | Beschreibung | Ausgeführt |
|------|--------------|------------|
| **A — CI Harness** | `npm run test:workflow-automation:verify` (Backend + Frontend), dedizierte Fixture-Tenants, keine Netzwerk-Provider | **JA** |
| **B — VPS Infra Smoke** | Read-only Queue/DB/Flags, Auth-Guard-Probes, Voice-Preflight Security-Bundle | **JA** |
| **C — VPS Live Workflow E2E** | API-Trigger mit Test-Org, Timer, WhatsApp, Voice PSTN | **NEIN** (blockiert) |

**Befehle (Tier A):**

```bash
cd backend && npm run test:workflow-automation:verify   # 295 Tests PASS
cd frontend && npm run test:workflow-automation:verify  # 45 Tests PASS
```

---

## Messwerte (Tier A + B)

| Metrik | Tier A (Harness) | Tier B (VPS Prod) |
|--------|------------------|-------------------|
| Test-Suite-Laufzeit (Backend unit) | ~54 s (229 Tests) | — |
| Integration-Harness | ~42 s (66 Tests) | — |
| Frontend | ~0.9 s (45 Tests) | — |
| `workflow-engine.production.spec.ts` | 184 ms / 7 Tests | N/A |
| `task-automation-outbox.spec.ts` | 18.8 s / 10 Tests | N/A |
| `workflow-runtime-rollout.spec.ts` | 15.5 s / 24 Tests | Feature nicht auf VPS |
| Event-to-Match-Latenz | Nicht instrumentiert (In-Memory) | N/A |
| Match-to-Action-Latenz | Nicht instrumentiert | N/A |
| Timer-Abweichung | Deterministisch (`BOOKING_TASK_FIXED_NOW`) | N/A |
| Queue-Lag `task.automation` | 0 (Mock) | **0** |
| Retry-Dauer (Outbox) | Exponential backoff in Spec | N/A |
| Delivery Status | Contract mock | N/A |
| Duplicate Rate | Idempotency Specs PASS | **0** Runs |
| Dead-Letter-Rate (Outbox) | Spec: DLQ after max attempts | **0** Outbox-Rows |
| Worker Recovery | `recoverStaleProcessing` PASS | Workers enabled (readiness) |
| Fehlercodes | Siehe Szenarien | Health 200 |

---

## Szenario 1 — Pickup 30 Minuten überfällig

| Feld | Inhalt |
|------|--------|
| **Voraussetzungen** | Fixture-Org `org-booking-task-a`; Booking `CONFIRMED`; Pickup-Zeit +30 min; `BOOKING_TASK_FIXED_NOW` |
| **Schritte** | (A) `syncBookingPickupTiming` zweimal; (A) `computeBookingPickupTiming` bei +30 min; (B) VPS Queue/Outbox-Snapshot |
| **Erwartet** | Overdue erkannt; Priority `HIGH`; kein Duplikat-Task; Timer/Re-Check idempotent; WhatsApp/Webhook/Admin nur mit Sandbox-Provider |
| **Tatsächlich (A)** | Priority `HIGH`, genau 1 Pickup-Task nach Doppel-Sync; Timing-Util `isOverdue=true` |
| **Tatsächlich (B)** | Kein Live-Trigger; `task.automation` Queue 0; Outbox 0 |
| **Belege** | `booking-task.pipeline.integration.spec.ts` („escalates overdue pickup…"); `workflow-production-readiness.spec.ts` Szenario 13 |
| **PASS/FAIL** | **PASS (A)** / **BLOCKED (B)** — WhatsApp/Status-Webhook/Admin-Fallback nicht als Live-E2E auf VPS |
| **Offene Abweichung** | Voller Kanal-Pfad (WhatsApp + Webhook + Admin) nur Contract-Mock; kein Prod-End-to-End |

---

## Szenario 2 — Kritischer Fahrzeugfehler

| Feld | Inhalt |
|------|--------|
| **Voraussetzungen** | Workflow mit `workflow.approval.request` + Folge-Action; LIVE-Modus; Org-Scope |
| **Schritte** | Engine `executeWorkflow` mit Approval-Action; Dry-Run für externe Kanäle |
| **Erwartet** | Event → Match; interne Admin-Meldung; KI-Entwurf mit Approval; kein Kundenkontakt ohne Freigabe; keine erfundene Diagnose |
| **Tatsächlich (A)** | Run `WAITING_APPROVAL`; Folge-`task.create` **nicht** ausgeführt; Policy/EXTERNAL risk in Catalog |
| **Tatsächlich (B)** | 0 Workflows auf Test-Org; kein Live-Event |
| **Belege** | `workflow-engine.production.spec.ts` (approval pause); `workflow-communication-contract.spec.ts` |
| **PASS/FAIL** | **PARTIAL PASS (A)** / **BLOCKED (B)** |
| **Offene Abweichung** | Vollständiger KI-Entwurf + Kundenkontakt-Pfad nicht LIVE im Executor; nur Preview/Approval-Mechanik getestet |

---

## Szenario 3 — Provider-Ausfall

| Feld | Inhalt |
|------|--------|
| **Voraussetzungen** | Outbox-Row `PENDING`; Executor wirft Fehler |
| **Schritte** | Processor: Fail → Retry → Success bzw. Max-Attempts → DLQ |
| **Erwartet** | Retry mit Backoff; Fallback/Partial Failure dokumentiert |
| **Tatsächlich (A)** | `records initial failure and schedules retry`; `completes on successful retry`; `dead-letters after max attempts` |
| **Tatsächlich (B)** | Nicht live injiziert |
| **Belege** | `task-automation-outbox.spec.ts` |
| **PASS/FAIL** | **PASS (A)** / **NOT RUN (B)** |
| **Offene Abweichung** | Workflow-native `notification.prepare` Fallback nur Preview (Szenario 21 partial) |

---

## Szenario 4 — Doppelte Events

| Feld | Inhalt |
|------|--------|
| **Voraussetzungen** | Gleicher `idempotencyKey` / Dedup-Key |
| **Schritte** | Doppelter `executeWorkflow`; Doppelter `syncBookingPickupTiming` |
| **Erwartet** | Genau eine Action / ein Task |
| **Tatsächlich (A)** | Zweiter Run: gleiche Run-ID, kein zweiter Task-Write; Pickup-Task count = 1 |
| **Tatsächlich (B)** | 0 Workflow-Runs |
| **Belege** | `workflow-engine.production.spec.ts` (idempotency); `booking-task.pipeline.integration.spec.ts` |
| **PASS/FAIL** | **PASS (A)** / **N/A (B)** |
| **Offene Abweichung** | — |

---

## Szenario 5 — Prozessneustart (WAITING / Approval / Retry)

| Feld | Inhalt |
|------|--------|
| **Voraussetzungen** | Outbox `PROCESSING` stale; Approval `WAITING_APPROVAL` Run |
| **Schritte** | `recoverStaleProcessing`; Approval-Run bleibt pausiert bis Entscheidung |
| **Erwartet** | Recovery ohne Doppel-Ausführung; Approval-Zustand überlebt Restart-Konzept |
| **Tatsächlich (A)** | Stale PROCESSING → zurück auf PENDING; Approval-Test stoppt vor Folge-Actions |
| **Tatsächlich (B)** | PM2 Restart-Historie hoch (3161); kein Live-Restart-Test während Approval |
| **Belege** | `task-automation-outbox.spec.ts`; `workflow-engine.production.spec.ts` |
| **PASS/FAIL** | **PASS (A)** / **NOT RUN (B)** |
| **Offene Abweichung** | Kein Live-PM2-Kill während WAITING_APPROVAL (bewusst vermieden) |

---

## Szenario 6 — Cross-Tenant-Manipulation

| Feld | Inhalt |
|------|--------|
| **Voraussetzungen** | `org-a` vs `org-b`; Cross-tenant Replay-Versuch |
| **Schritte** | Condition eval pro Payload; Outbox executor cross-tenant booking |
| **Erwartet** | Vollständig blockiert |
| **Tatsächlich (A)** | Conditions isoliert; `rejects cross-tenant booking replay` |
| **Tatsächlich (B)** | Test-Org existiert isoliert; keine fremden Workflow-Runs |
| **Belege** | `workflow-security.production.spec.ts`; `task-automation-outbox.spec.ts`; `booking-task.pipeline` Tenant-Isolation |
| **PASS/FAIL** | **PASS (A)** / **PASS (B smoke)** |
| **Offene Abweichung** | — |

---

## Szenario 7 — Dry Run

| Feld | Inhalt |
|------|--------|
| **Voraussetzungen** | `WorkflowExecutionMode.DRY_RUN` / DryRunService |
| **Schritte** | `planWorkflow`; Executor ohne LIVE |
| **Erwartet** | Keine Tasks, Runs, Approvals, Queue-Writes |
| **Tatsächlich (A)** | Kein `upsertByDedup`; LIVE wirft; PII maskiert im Plan |
| **Tatsächlich (B)** | API `POST …/dry-run` nicht gegen Test-Org ausgeführt (kein Workflow); Route im deployten Build vorhanden |
| **Belege** | `workflow-dry-run.service.spec.ts` |
| **PASS/FAIL** | **PASS (A)** / **NOT RUN (B)** |
| **Offene Abweichung** | Prod-API-Dry-Run nicht ausgelöst (0 Workflows) |

---

## Szenario 8 — Quiet Hours und Opt-out

| Feld | Inhalt |
|------|--------|
| **Voraussetzungen** | Recipient mit `quietHoursActive` / `optedOut` |
| **Schritte** | `filterDeliverableRecipients` |
| **Erwartet** | Externe Kanäle blockiert/verschoben; In-App erlaubt |
| **Tatsächlich (A)** | Quiet hours: nur `in_app`; Opt-out: nur `in_app` |
| **Tatsächlich (B)** | Nicht live getestet |
| **Belege** | `workflow-communication-contract.spec.ts` Szenarien 31–32 |
| **PASS/FAIL** | **PASS (A)** / **NOT RUN (B)** |
| **Offene Abweichung** | Keine vollständige Quiet-Hours-Engine auf Prod (Policy-Hook-Stufe) |

---

## Szenario 9 — Voice Call (Orchestrator, Testnummer, AI-Hinweis, Post-Call Webhook)

| Feld | Inhalt |
|------|--------|
| **Voraussetzungen** | `VOICE_E2E_ORG_ID` auf VPS; `VOICE_E2E_ALLOW_LIVE_CALLS=false`; Voice-Security-Bundle |
| **Schritte** | (A) Contract: `voice.call.start` CRITICAL; (B) Voice preflight security tests auf VPS; **kein** Live-Call |
| **Erwartet** | Orchestrator-Pfad nur mit Testnummer + Flag; Post-Call Webhook; AI-Disclosure |
| **Tatsächlich (A)** | Risk CRITICAL + Maker-Checker sensitivity PASS |
| **Tatsächlich (B)** | Live calls **disabled**; Voice security Jest bundle **PASS** (11 Suites); kein PSTN |
| **Belege** | `workflow-communication-contract.spec.ts`; VPS `voice-staging-preflight.sh` (security subset) |
| **PASS/FAIL** | **PARTIAL PASS** — **FAIL** für Live Voice E2E |
| **Offene Abweichung** | Workflow→Voice-Orchestrator-Brücke nicht als Prod-E2E; separater Voice-Stack |

---

## Szenario 10 — Dead Letter und kontrolliertes Replay

| Feld | Inhalt |
|------|--------|
| **Voraussetzungen** | Outbox max attempts; Admin replay API |
| **Schritte** | DLQ nach Retries; `task-automation/outbox/:id/replay` (Spec) |
| **Erwartet** | DLQ-Status; kontrolliertes Replay ohne Seiteneffekt-Leak |
| **Tatsächlich (A)** | `dead-letters after max attempts`; Admin replay Spec PASS |
| **Tatsächlich (B)** | Outbox **0** Rows; Replay-Route im Boot-Log gemappt |
| **Belege** | `task-automation-outbox.spec.ts`; `task-automation-admin.service.spec.ts` |
| **PASS/FAIL** | **PASS (A)** / **NOT RUN (B)** |
| **Offene Abweichung** | Kein Live-DLQ auf Prod |

---

## Szenario 11 — Kill Switch

| Feld | Inhalt |
|------|--------|
| **Voraussetzungen** | Rollout-Service mit global/org/provider Kill Switches |
| **Schritte** | `setKillSwitch`; `canExecuteLiveAction`; Resolver `legacy_only` |
| **Erwartet** | Neue Actions blockiert; In-Flight-Konzept; Audit |
| **Tatsächlich (A)** | 24 Tests PASS in `workflow-runtime-rollout.spec.ts` |
| **Tatsächlich (B)** | **0** `runtime-rollout` Routes; keine Env-Flags; Tabelle fehlt |
| **Belege** | `workflow-runtime-rollout.spec.ts`; VPS-Audit P0-2/P0-3 |
| **PASS/FAIL** | **PASS (A, Repo HEAD)** / **FAIL (B)** |
| **Offene Abweichung** | Kill Switch nicht auf Prod deployt |

---

## Szenario 12 — Legacy- und neue Engine (keine Doppel-Ausführung)

| Feld | Inhalt |
|------|--------|
| **Voraussetzungen** | Router-Modi legacy / shadow / cutover; Rollout single-path |
| **Schritte** | `TaskAutomationExecutionRouterService.route` je Modus; Rollout bridge tests |
| **Erwartet** | Entweder Legacy **oder** Workflow-Live **oder** Shadow-Compare — nie beides |
| **Tatsächlich (A)** | legacy: nur `legacyExecute`; shadow: legacy+preview; cutover: nur workflow; Rollout: no double path |
| **Tatsächlich (B)** | Legacy-only (kein `TASK_AUTOMATION_WORKFLOW_RUNTIME_MODE` gesetzt); 0 Workflow-Runs |
| **Belege** | `task-automation-workflow-migration.spec.ts`; `workflow-runtime-rollout.spec.ts` |
| **PASS/FAIL** | **PASS (A)** / **PASS (B implicit legacy-only)** |
| **Offene Abweichung** | Rollout-Gate nicht auf VPS — Doppelpfad-Risiko nach Deploy ohne Flags |

---

## Zusammenfassung PASS/FAIL

| # | Szenario | Tier A (Harness) | Tier B (VPS Prod) |
|---|----------|------------------|-------------------|
| 1 | Pickup 30 min überfällig | **PASS** | **BLOCKED** |
| 2 | Kritischer Fahrzeugfehler | **PARTIAL** | **BLOCKED** |
| 3 | Provider-Ausfall | **PASS** | NOT RUN |
| 4 | Doppelte Events | **PASS** | N/A |
| 5 | Prozessneustart | **PASS** | NOT RUN |
| 6 | Cross-Tenant | **PASS** | **PASS** (smoke) |
| 7 | Dry Run | **PASS** | NOT RUN |
| 8 | Quiet Hours / Opt-out | **PASS** | NOT RUN |
| 9 | Voice Call | **PARTIAL** | **FAIL** (live disabled) |
| 10 | Dead Letter / Replay | **PASS** | NOT RUN |
| 11 | Kill Switch | **PASS** | **FAIL** |
| 12 | Legacy vs neue Engine | **PASS** | **PASS** (legacy-only) |

### Bestandene Szenarien (Tier A vollständig)

3, 4, 5, 6, 7, 8, 10, 12 (+ Teile von 1, 2, 9)

### Fehlgeschlagene / blockierte Szenarien (Production E2E)

| Szenario | Grund |
|----------|--------|
| 1 (VPS live) | Kein Workflow-Trigger; WhatsApp/Webhook nicht live |
| 2 (VPS live) | 0 Workflows |
| 9 (Voice live) | `VOICE_E2E_ALLOW_LIVE_CALLS=false` |
| 11 (Kill Switch VPS) | Rollout-Feature nicht deployt |

---

## P0-Blocker (Production Acceptance)

| ID | Blocker |
|----|---------|
| P0-1 | VPS-Deploy ~91 Commits hinter `main` — Phase-11-Workflow-Runtime fehlt |
| P0-2 | Shadow/Rollout-Migrationen + APIs nicht auf Prod |
| P0-3 | Keine Workflow-Runtime-Env (`WORKFLOW_*`, `TASK_AUTOMATION_WORKFLOW_RUNTIME_MODE`) |
| P0-4 | **0** Workflows auf dedizierter Test-Org — kein API-E2E möglich |
| P0-5 | `EMAIL_SIMULATE_ENABLED=false` — unsicher für Kanal-E2E auf Prod |
| P0-6 | `VOICE_E2E_ALLOW_LIVE_CALLS=false` — Voice-E2E bewusst gesperrt |

---

## Go / No-Go Acceptance

| Kriterium | Ergebnis |
|-----------|----------|
| CI Harness (340 Tests) | **GO** |
| VPS Production E2E (12 Pflichtszenarien live) | **NO-GO** |
| Keine echten Kunden kontaktiert | **Bestätigt** |
| Sandbox-Flags respektiert | **JA** (`WHATSAPP_SIMULATE=true`, Voice live off) |

### **Gesamt: CONDITIONAL FAIL**

**Nächster Schritt:** Deploy Phase 11 → Migrationen → Sandbox-Env → Wiederholung Tier B mit Test-Org-Workflows und instrumentierten Latenz-Metriken.

---

## Referenzen

- [workflow-automation-vps-control-audit-2026-07.md](./workflow-automation-vps-control-audit-2026-07.md)
- [workflow-automation-production-test-matrix-2026-07.md](../testing/workflow-automation-production-test-matrix-2026-07.md)
- [workflow-runtime-rollout-runbook-2026-07.md](../operations/workflow-runtime-rollout-runbook-2026-07.md)
