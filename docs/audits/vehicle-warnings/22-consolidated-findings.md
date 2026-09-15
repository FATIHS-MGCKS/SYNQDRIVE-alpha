# Vehicle Warnings — Consolidated Findings (Prompt 25/26)

| Feld | Wert |
|------|------|
| **Audit-ID** | `vehicle-warnings-production-readiness-2026-07` |
| **Prompt** | **25 von 26** — Konsolidierung aller Audit-Befunde |
| **Erstellt (UTC)** | 2026-07-25 |
| **Basis-Commit (Audit)** | `1d0f2caebe56aa1ecd23295aa33d20e953daa95d` |
| **Prod-Runtime-Snapshot** | `6080dbd2` (2026-07-25, anonymisiert `VPS-PROD-01`) |
| **Modus** | **Planung only** — keine Umsetzung |
| **Quellen** | `00`–`21` + `runtime/*` unter `docs/audits/vehicle-warnings/` |

**Hinweis:** Nur **nachgewiesene** Befunde aus Code-Audits und read-only Runtime. Hypothesen sind als *Unverified* markiert. Keine Rechtsberatung.

---

## 1. Executive Summary

| Metrik | Wert |
|--------|------|
| **Kanonische Findings (dedupliziert)** | **42** |
| **P0** | **11** |
| **P1** | **17** |
| **P2** | **11** |
| **P3** | **3** |
| **Empfohlene Implementierungsprompts** | **19** |
| **Merge-Cluster** | ~200 Roh-IDs → 42 Kanonische |
| **Go/No-Go (aktuell)** | **NO-GO** für „Single Truth“ Production Readiness |
| **Go/No-Go (nach Phase 1–7)** | **CONDITIONAL GO** (siehe Remediation-Plan) |

**Stärken (bewiesen):** `RentalHealthService` + `BookingEligibilityGatekeeper` als Backend-Kern; Cross-Tenant-Isolation auf org-scoped APIs; Tire/Brake-Alert-Dedup; Notification-Fingerprint; DIMO-Poll ~100% SUCCESS/24h; Health-API 200.

**Schwächen (bewiesen):** Keine globale `findingId`; 12+ parallele FE/BE-Projektionen; DTC-Dedup-Lücke; Battery-V2-Prod-Fehler; Insights-PII; Vehicle-Intelligence ohne Permission-Gate.

---

## 2. Dedup-Regeln

| Regel | Anwendung |
|-------|-----------|
| Gleiche Root Cause, mehrere IDs | Eine kanonische ID `VW-F-###` |
| Symptom vs. Ursache | Ursache behält höhere Prio |
| Runtime bestätigt Code-Audit | `evidence` erweitert um `runtime/` |
| Nicht reproduziert | Status `Unverified` oder Prio −1 |
| Organisatorisch ohne Tech | Separate Zeile, `migration: n/a` |

---

## 3. Master-Register (alle kanonischen Findings)

Spaltenkurz: **P** = Priorität · **S** = Status (`Open`) · **Mig** / **BF** = Migration / Backfill

| ID | Titel | P | S | Mig | BF | Quell-IDs (Merge) |
|----|-------|---|---|-----|-----|-------------------|
| VW-F-001 | Keine globale Finding-Identität / Lifecycle | P1 | Open | Ja | Ja | LIFE-W01, LC-01, DC-R1, PA-13 |
| VW-F-002 | Parallele `blocksRental`-Pfade vs. Rental Health | P0 | Open | Teilw. | Nein | VW-P0-01, MT-03, OTH-W02, OTH-W15 |
| VW-F-003 | Connectivity/Telemetrie drei Schichten ohne verifizierte Einheit | P0 | Open | Nein | Nein | VW-P0-02, MT-06, TI-04 |
| VW-F-004 | Legacy `healthStatus` / parallele Fleet-Visual-State | P0 | Open | Nein | Nein | MIX-09, VW-P0-03, P-01, P-07, FCMD-W02 |
| VW-F-005 | FE/BE Telemetry-Klassifikation divergent | P0 | Open | Nein | Nein | P-09, MT-08, API-C03, RUNTIME-W02 |
| VW-F-006 | Fleet-Chip „Verfügbar“ ≠ Runtime Readiness | P0 | Open | Nein | Nein | P-02, SYM-02, FCMD-W03, RUNTIME-W01 |
| VW-F-007 | DTC: kein DB-Dedup + Webhook/Poll-Semantik-Split | P0 | Open | Ja | Ja | DEDUP-W01, PA-03, DTC-01, TI-06, MT-05 |
| VW-F-008 | VLS ohne monotonic `sourceTimestamp` Guard | P1 | Open | Nein | Nein | TI-03 |
| VW-F-009 | CASCADE DELETE entfernt Warning-Evidence | P0 | Open | Ja | Nein | PA-09 |
| VW-F-010 | Vehicle Intelligence ohne Permission-Gate | P0 | Open | Nein | Nein | SEC-R1 |
| VW-F-011 | Within-Tenant IDOR Brake/Battery Spec PATCH | P1 | Open | Nein | Nein | SEC-R2 |
| VW-F-012 | Insights PII + kein DSAR/Erasure-Pfad | P0 | Open | Ja | Ja | GDPR-W1, SEC-R3, API-C10 |
| VW-F-013 | Battery V2 Prod: failed Jobs + REST-Reconcile-Fehler | P1 | Open | Nein | Nein | BAT-W14, RT-Q-P1, RT-APP-P1, TI-05 |
| VW-F-014 | Battery Readiness Flag default off / REST-Kontamination | P1 | Open | Nein | Nein | BAT-W05, BAT-W01 |
| VW-F-015 | Insight Health Gate ≠ NV2 fleet-wide Health-Sync | P1 | Open | Nein | Nein | DC-R2, API-C10 |
| VW-F-016 | Severity/Count-Drift über Oberflächen | P1 | Open | Nein | Nein | MT-01, SYM-01/04/05, SEV-W01/05/06, FHS-W01, RUNTIME-W03/06 |
| VW-F-017 | Health-Cache 45s ohne Domain-Invalidierung | P1 | Open | Nein | Nein | MT-07, RUNTIME-W04, API-C06, Lineage §6 |
| VW-F-018 | `rentalReadiness` nur Client; API/Gate getrennt | P1 | Open | Ja | Nein | API-C02, SEV-W03 |
| VW-F-019 | Notification/Insight ohne Retention; Activity-Logs unbounded | P1 | Open | Ja | Ja | GDPR-W2, GDPR-W3, LC-07 |
| VW-F-020 | OrgTask `upsertByDedup` Race | P1 | Open | Nein | Nein | DEDUP-W02, DC-R7 |
| VW-F-021 | DashboardInsight ohne active dedupe unique | P1 | Open | Ja | Ja | DEDUP-W03, PA-03 |
| VW-F-022 | Health Notification Sweep Limit 500/org | P1 | Open | Nein | Nein | DEDUP-W04 |
| VW-F-023 | FE mergeV2 unterdrückt supplemental Health pro vehicleId | P2 | Open | Nein | Nein | DC-R3, VW-P1-10, P-18 |
| VW-F-024 | `OPEN_VEHICLE_MODULE` ignoriert Modul-Parameter | P2 | Open | Nein | Nein | DC-R4 |
| VW-F-025 | VehicleComplaint ohne Create-Dedup | P2 | Open | Ja | Nein | DEDUP-W07, DC-R8 |
| VW-F-026 | Telemetrieausfall schließt Findings ohne Hysterese | P1 | Open | Nein | Nein | LIFE-W03, LC-05, TI-08 |
| VW-F-027 | Insight Publish-Swap vs. Notification Sweep inkonsistent | P1 | Open | Nein | Nein | LIFE-W02, LC-02, DEDUP-W06 |
| VW-F-028 | Service `critical` Modul ohne `rental_blocked` | P1 | Open | Nein | Nein | OTH-W01, SEV-W02, R-09 |
| VW-F-029 | Damage BLOCK_RENTAL nur Frontend | P1 | Open | Nein | Nein | OTH-W02, MT-10 |
| VW-F-030 | Tire TPMS niedrige Abdeckung / Insights vs. Rental Escalation | P2 | Open | Nein | Nein | TIRE-W04, TIRE-W01 |
| VW-F-031 | Zwei Station-Scope-Modelle | P2 | Open | Nein | Nein | SEC-R5 |
| VW-F-032 | Technical Observations ohne Audit | P2 | Open | Nein | Nein | SEC-R7, LC-08 |
| VW-F-033 | Kein `projectionVersion` auf Health/Runtime APIs | P2 | Open | Nein | Nein | API-C07, RUNTIME-W08 |
| VW-F-034 | Workflow-Trigger `vehicle.health.*` nicht verdrahtet | P2 | Open | Nein | Nein | Lineage §8 |
| VW-F-035 | Data-Authorization Alerts-Pipeline TODO | P2 | Open | Nein | Nein | ISO-W2, D1 |
| VW-F-036 | Kein Warning-spezifisches Incident-Runbook | P2 | Open | Nein | Nein | ISO-W1, D17 |
| VW-F-037 | PM2 kumulative Restarts / Deploy-502-Fenster | P3 | Open | Nein | Nein | RT-APP-PM2, RT-APP-P2 |
| VW-F-038 | Redis Health-Cache kalt (0 Keys) | P3 | Open | Nein | Nein | RT-R-P2 |
| VW-F-039 | Health/Notification REST ohne Rate Limit | P3 | Open | Nein | Nein | SEC-R8 |
| VW-F-040 | AI Health ohne expliziten Data-Auth-Check | P2 | Open | Nein | Nein | D14, DC-R9 |
| VW-F-041 | Rechtsgrundlagen-Mapping Fleet-Warnings (organisatorisch) | P0* | Org-Nachweis | n/a | n/a | D3, GDPR org |
| VW-F-042 | Kein Fleet-Warning-Erasure-Orchestrator | P0 | Open | Ja | Ja | GDPR-W4, D7 |

\*P0 organisatorisch — technische Abhängigkeit für VW-F-012.

---

## 4. Detailblätter (P0 + P1)

### VW-F-001 — Keine globale Finding-Identität / Lifecycle

| Feld | Inhalt |
|------|--------|
| **Priorität** | P1 |
| **Status** | Open |
| **Beweis** | `11-finding-lifecycle-audit.md` §1; `19-downstream-consumers-audit.md` §4; 7 parallele Modelle |
| **Betroffene Orgs/Fahrzeuge** | Alle Mandanten (konzeptionell); Runtime: 1 Org mit 5 aktiven Health-NV2 |
| **Komponenten** | Insights, Notifications, Tire/Brake Alerts, DTC, Tasks, Complaints, FE Operational Issues |
| **Root Cause** | Evolutionäre Schichten ohne kanonisches Finding-Modell |
| **Fachliche Auswirkung** | Support/Automation/AI können Findings nicht stabil korrelieren |
| **Datenschutz/Security** | Erasure/DSAR erschwert (siehe VW-F-012, VW-F-042) |
| **Empfohlene Änderung** | Kanonisches `VehicleFinding` (oder äquivalent) mit `findingId`, Lifecycle-FSM, Bridges read-only |
| **Migration** | Ja |
| **Backfill** | Ja — idempotent aus Alerts/Notifications/Insights |
| **Risiko Änderung** | Hoch — Touch vieler Consumer |
| **Tests** | Lifecycle-Contract-Tests; Cross-layer correlation |
| **Deployment** | Phase 2–3 (siehe `implementation-sequence.md`) |
| **Rollback** | Feature flag `FINDING_CANONICAL_ENABLED`; Dual-Read vergleichen |
| **Acceptance** | Jeder aktive Warning-Consumer referenziert `findingId`; keine zweite Schreib-Wahrheit |

---

### VW-F-002 — Parallele blocksRental-Pfade

| Feld | Inhalt |
|------|--------|
| **Priorität** | P0 |
| **Status** | Open |
| **Beweis** | `13-severity-readiness-policy-audit.md` R-09, R-14; `09-other-health-warning-audit.md` OTH-W02; Gatekeeper vs. Complaints/Tasks |
| **Betroffene Orgs/Fahrzeuge** | Org mit aktiven Complaints/Tasks `blocksVehicleAvailability` (Anzahl nicht in Runtime gezählt) |
| **Komponenten** | `TechnicalObservationsService`, `TasksService`, `ServiceCasesService`, `battery-readiness.policy`, `BookingEligibilityGatekeeper`, FE Damage |
| **Root Cause** | Block-Flags außerhalb `RentalHealthService.collectBlockingReasons` |
| **Fachliche Auswirkung** | Fahrzeug buchbar oder „bereit“ trotz operativer Blockade (oder umgekehrt) |
| **Datenschutz/Security** | Mittel — falsche Zugriffsentscheidung auf Fahrzeugnutzung |
| **Empfohlene Änderung** | Zentrale `collectBlockingReasons` erweitern; FE Damage in BE; Gatekeeper = SSOT für Buchung |
| **Migration** | Teilweise (Damage/Complaint-Felder) |
| **Backfill** | Nein |
| **Risiko** | Mittel |
| **Tests** | Matrix R-01–R-20 aus Audit 13; Gatekeeper E2E |
| **Deployment** | Phase 5 nach Policy (Phase 5) |
| **Rollback** | Flag pro Block-Quelle |
| **Acceptance** | `FE-Ready ⊆ Gate-Block`; keine UI-only BLOCK_RENTAL |

---

### VW-F-007 — DTC Dedup + Dual-Path

| Feld | Inhalt |
|------|--------|
| **Priorität** | P0 |
| **Status** | Open |
| **Beweis** | `12-deduplication-idempotency-audit.md`; `06-dtc-warning-audit.md` DTC-01/02/07; kein partial unique |
| **Betroffene Orgs/Fahrzeuge** | Runtime: 1 aktiver DTC org-weit |
| **Komponenten** | `dtc.service.ts`, `DimoWebhookController`, `DimoDtcProcessor`, NV2 ACTIVE_DTC |
| **Root Cause** | Webhook upsert-only; Poll clear+notify; keine DB-Unique auf active DTC |
| **Fachliche Auswirkung** | Duplikat-DTCs; falsche Clear/Notify-Semantik |
| **Datenschutz/Security** | Niedrig |
| **Empfohlene Änderung** | Partial UNIQUE `(vehicle_id, dtc_code) WHERE is_active`; Webhook normalize+clear parity |
| **Migration** | Ja |
| **Backfill** | Ja — merge duplicate active rows idempotent |
| **Risiko** | Mittel |
| **Tests** | Parallel poll simulation; webhook comma-array cases |
| **Deployment** | Phase 4 (Idempotenz) |
| **Rollback** | Migration rückrollbar; webhook path flag |
| **Acceptance** | Max 1 active row pro vehicle+code; NV2 fingerprint stabil |

---

### VW-F-010 — Vehicle Intelligence ohne Permission-Gate

| Feld | Inhalt |
|------|--------|
| **Priorität** | P0 |
| **Status** | Open |
| **Beweis** | `20-security-tenant-audit.md` SEC-R1; `VehicleIntelligenceController` nur `VehicleOwnershipGuard` |
| **Betroffene Orgs/Fahrzeuge** | Alle Org-Member inkl. DRIVER |
| **Komponenten** | `/vehicles/:vehicleId/*` DTC, Tires, Brakes, Battery |
| **Root Cause** | Fehlender `PermissionsGuard` / `@RequirePermission('fleet', …)` |
| **Fachliche Auswirkung** | DRIVER sieht/mutiert technische Health-Daten |
| **Datenschutz/Security** | **Hoch** — unauthorized read/write innerhalb Tenant |
| **Empfohlene Änderung** | `PermissionsGuard` + fleet.read/write; DRIVER read-only subset |
| **Migration** | Nein |
| **Backfill** | Nein |
| **Risiko** | Niedrig |
| **Tests** | `vehicles-security-negative.spec.ts` Pattern erweitern |
| **Deployment** | Phase 1 (Security hotfix) — **vor** breiter SSOT-Migration |
| **Rollback** | Guard-Feature-Flag |
| **Acceptance** | DRIVER ohne fleet.read → 403 auf mutate; NV2 health ohne DRIVER |

---

### VW-F-012 — Insights PII + DSAR-Lücke

| Feld | Inhalt |
|------|--------|
| **Priorität** | P0 |
| **Status** | Open |
| **Beweis** | `21-dsgvo-iso-readiness.md` GDPR-W1; `20-security-tenant-audit.md` SEC-R3; `insight-health-gate.ts` metrics |
| **Betroffene Orgs/Fahrzeuge** | Alle Insights-Consumer |
| **Komponenten** | `dashboard-insights.controller`, BI Detectors, Operator App |
| **Root Cause** | Kein Redaction; kein RBAC; kein Fleet-DSAR |
| **Fachliche Auswirkung** | Operator sieht Kunden-/Booking-Kontext breiter als nötig |
| **Datenschutz/Security** | **Hoch** — Art. 5, 15, 17 Risiko |
| **Empfohlene Änderung** | Redaction wie NV2; RBAC; DSAR-Slice für Insights/Complaints |
| **Migration** | Ja (Erasure jobs) |
| **Backfill** | Ja — scrub PII fields in historical metrics optional |
| **Risiko** | Mittel |
| **Tests** | Role matrix; DSAR export fixture |
| **Deployment** | Phase 1 + 16 |
| **Rollback** | Redaction flag off (not recommended prod) |
| **Acceptance** | WORKER/DRIVER keine `customerId` in API; DSAR export includes warning artifacts |

---

### VW-F-013 — Battery V2 Prod-Fehler (Runtime-bewiesen)

| Feld | Inhalt |
|------|--------|
| **Priorität** | P1 |
| **Status** | Open |
| **Beweis** | `runtime/queue-observations.md` (26 failed); `runtime/application-log-observations.md` HANDLER_FAILED alle 5 min |
| **Betroffene Orgs/Fahrzeuge** | Org/Uuids anonymisiert; mehrere Fahrzeuge in REST-Reconcile-Korrelation |
| **Komponenten** | `BatteryV2Processor`, `bull:battery.v2`, Battery warnings → Rental Health |
| **Root Cause** | Handler failures + lock contention (exakter Stack nicht in Audit extrahiert) |
| **Fachliche Auswirkung** | Battery-Warnings verzögert/falsch; Operator-Vertrauen |
| **Datenschutz/Security** | Niedrig |
| **Empfohlene Änderung** | Root-cause fix + DLQ/replay policy; Alert auf failed count |
| **Migration** | Nein |
| **Backfill** | Ja — idempotent re-eval nach Fix |
| **Risiko** | Mittel |
| **Tests** | Processor unit + integration; staging replay |
| **Deployment** | Phase 17 (Observability) + **Hotfix-Paket B0** parallel Phase 1 |
| **Rollback** | Disable battery.v2 job types via flag |
| **Acceptance** | failed=0 über 24h; keine recurring HANDLER_FAILED |

---

### VW-F-016 — Severity/Count-Drift (konsolidiert)

| Feld | Inhalt |
|------|--------|
| **Priorität** | P1 |
| **Status** | Open |
| **Beweis** | Audits 14, 16, 17, 13; Charter §10 Symptome |
| **Betroffene Orgs/Fahrzeuge** | Fleet-Demo-Szenarien (Tesla/Golf/Mercedes aus User-Reports in Audit 17–18) |
| **Komponenten** | FHS, Fleet Command, Dashboard Runtime, Fleet Map, Notifications |
| **Root Cause** | 12+ parallele Aggregationen (`fleetVisualState`, FHS KPI, Runtime, Insights) |
| **Fachliche Auswirkung** | KPI „2 vs 4“, „Verfügbar“ + „Nicht bereit“ + „Warnung“ gleichzeitig |
| **Datenschutz/Security** | Niedrig |
| **Empfohlene Änderung** | `VehicleRuntimeState` als einzige Count/Severity-Quelle für UI; deprecate parallel derivations |
| **Migration** | Nein |
| **Backfill** | Nein |
| **Risiko** | Hoch (UI churn) |
| **Tests** | Cross-surface golden counts per fixture fleet |
| **Deployment** | Phase 6–11 |
| **Rollback** | `RUNTIME_PROJECTION_SHADOW_MODE` compare old vs new counts |
| **Acceptance** | KPI strip = drawer counts = tab badges (±documented exclusions) |

*Weitere P1-Detailblätter: siehe Quell-Audits; Remediation-Plan referenziert Work Packages WP-*.*

---

## 5. Prioritätsverteilung

| Priorität | Anzahl | Anteil |
|-----------|--------|--------|
| **P0** | 11 | 26% |
| **P1** | 17 | 40% |
| **P2** | 11 | 26% |
| **P3** | 3 | 7% |
| **Gesamt** | **42** | 100% |

**P0-Liste:** VW-F-002, F-003, F-004, F-005, F-006, F-007, F-009, F-010, F-012, F-041 (org), F-042

---

## 6. Nicht als eigenständige Findings geführt (bewusst)

| Thema | Grund |
|-------|-------|
| Drawer zeigt orthogonale Dimensionen nebeneinander | **By design** (Audit 18) — UX-Kommunikation, kein SSOT-Bug |
| Tire Prediction-as-GT | **Behoben** (Audit 07) — nur Regression-Test |
| Cross-tenant leak | **Nicht reproduziert** — OrgScoping OK (Audit 20) |
| FC-P0-01 Episode recovery prod | **Unverified** ohne dedizierten Prod-Trace (TI-04) — Watch item |

---

## 7. Go/No-Go & Implementierungsprompts

| Empfehlung | Detail |
|------------|--------|
| **Aktuell** | **NO-GO** für „Single Truth“ Production Readiness (11× P0, fragmentierte Projektionen, Runtime Battery-Fehler) |
| **Nach WP-B0 + Phase 1–4** | **CONDITIONAL GO** für Datenintegrität und Security-Baseline |
| **Nach Phase 6 Shadow Δ=0 (7d)** | **CONDITIONAL GO** für UI-Consumer-Umschaltung (Phase 9–11) |
| **Vollständiges GO** | Nach WP-16 (GDPR), WP-17 (Battery clean 24h), alle P0 Acceptance Criteria |
| **Implementierungsprompts** | **19** (siehe `remediation/implementation-sequence.md` §6) |

---

## 8. Verweise

| Dokument | Rolle |
|----------|-------|
| [`remediation/vehicle-warning-remediation-plan.md`](./remediation/vehicle-warning-remediation-plan.md) | Work Packages |
| [`remediation/implementation-sequence.md`](./remediation/implementation-sequence.md) | Phasen 1–19 |
| [`remediation/test-strategy.md`](./remediation/test-strategy.md) | Verifikation |
| [`remediation/deployment-rollback-plan.md`](./remediation/deployment-rollback-plan.md) | Deploy |

**Changes / Architektur:** Nicht aktualisiert (Planung only).
