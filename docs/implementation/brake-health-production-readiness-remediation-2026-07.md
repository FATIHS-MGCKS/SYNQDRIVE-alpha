# Brake Health Production-Readiness Remediation — July 2026

| Field | Value |
|-------|-------|
| **Remediation ID** | `brake-health-production-readiness-remediation-2026-07` |
| **Audit branch** | `audit/brake-health-production-readiness-2026-07` |
| **Audit commit** | `9ff6fc56f199d49d04495b5d4e59b899c4202cd4` |
| **Implementation branch** | `fix/brake-health-production-readiness-2026-07` |
| **Audit report** | `docs/audits/brake-health-production-readiness-2026-07.md` |
| **Findings register** | `docs/audits/data/brake-health-integrity-findings-2026-07.json` |
| **Started** | 2026-07-17 UTC |

---

## Ausgangslage (Audit)

Der Brake-Health-Audit (7 Phasen, Juli 2026) bewertete Architektur, VPS-Integrität, Formeln, DIMO-Signale, historisches Backtesting, Consumer-Verdrahtung und Tests auf einer **6-Fahrzeug-Flotte** (anonymisiert `VEHICLE_001`–`VEHICLE_006`).

**Kernbefunde:**

- **`brake_health_current` initialisiert: 0/6** — Wear-Pipeline in Produktion inaktiv.
- **5 `vehicle_brake_reference_specs`**, aber kein Backfill/Init ausgeführt.
- **355 `trip_driving_impact` / 60d** — Recalc ist No-Op ohne Baseline.
- **0 `brake_evidence`**, **0 `BRAKE_SERVICE`**-Events.
- **Service-Scope** nicht an Init übergeben; Teilservice re-init aller Komponenten (P0-BH-10).
- **Rotor-Breite als Scheiben-Anker** (P0-BH-14).
- **Live DTC nicht in BrakeEvidence** (P0-BH-06).
- **k-Faktor-Kalibrierung / harsh-Brake-Multiplier** nicht verdrahtet (P0-BH-04/05).
- **DIMO `chassisBrake*`**: 0/6 auf LTE_R1; 156 GraphQL-Queries.
- **Backtest: `NOT_ENOUGH_DATA`** — 0 GT-Messungen, MAE/RMSE N/A.
- **44 Findings** (P0: 15 · P1: 22 · P2: 7 · P3: 0); **10 Production-Blocker** im JSON.

**Audit-Urteil:** **`NOT_READY`**

**Git-Basis bei Remediation-Start:**

- Branch `fix/brake-health-production-readiness-2026-07` von Audit-Commit `9ff6fc56` abgezweigt.
- **Keine Code-Abweichung** zum Audit-Abschluss (nur dieses Fortschrittsdokument in Prompt 1).

---

## Production-Readiness-Urteil (Ausgang)

| Kategorie | Urteil |
|-----------|--------|
| **Gesamt** | **`NOT_READY`** |
| A Correctness | NOT_READY |
| B Lifecycle Integrity | NOT_READY |
| C Reference Spec Quality | CONDITIONALLY_READY |
| D Evidence Quality | NOT_READY |
| E Model Validity | NOT_ENOUGH_DATA |
| F Safety | NOT_READY |
| G Reliability | NOT_READY |
| H Observability | NOT_READY |
| I User Experience | CONDITIONALLY_READY |
| J DIMO Signal Readiness | NOT_READY |
| K Test Readiness | CONDITIONALLY_READY |

### Bestätigte P0-Ausgangsprobleme (Production Blocker)

| ID | Titel | Code / Datei |
|----|-------|----------------|
| P0-BH-01 | Zero initialized `BrakeHealthCurrent` fleet-wide | VPS; `brake_health_current` |
| P0-BH-02 | Registration specs without init/backfill | `vehicles.service.ts` → `initializeFromRegistration` |
| P0-BH-04 | k-factor calibration not implemented | `brake-health.service.ts` — kein `calibrateFromMeasurement` |
| P0-BH-05 | `harshBrakeWearMultiplier` not wired in recalculate | `brake-status.ts` vs `recalculate()` |
| P0-BH-06 | Active DTC not ingested into `BrakeEvidence` | Kein Producer `VehicleDtcEvent` → evidence |
| P0-BH-09 | No per-component identity — 4 axle scalars | Prisma `BrakeHealthCurrent` |
| P0-BH-10 | Service scope not passed to init | `brake-lifecycle.service.ts` |
| P0-BH-11 | Spec-fallback fills all components on partial knowledge | `initializeFromRegistration` |
| P0-BH-14 | Rotor width used as disc thickness anchor | `VehicleBrakeReferenceSpec` → `frontDiscAnchorMm` |
| P0-BH-40 | 355 TDI rows but wear model no-op | `DrivingImpactProcessor` + uninitialized BHC |

### Bestätigte P1-Ausgangsprobleme (Auswahl)

| ID | Titel |
|----|-------|
| P1-BH-38 | Rolling 30d VDI fills historical coverage gaps (temporal leakage) |
| P1-BH-41 | 38.5% completed trips without TDI |
| P1-BH-42 | 135 TDI/trip km mismatches |
| P1-BH-45 | VDI `hard_brake_per_100km=0` despite harsh `driving_events` |
| P1-BH-46 | DIMO braking events not ingested (VEHICLE_003: 143 events) |
| P1-BH-47 | All `chassisBrake*` DOCUMENTED_NOT_AVAILABLE on LTE_R1 |
| P1-BH-50 | Spec-only anchor can reach HIGH confidence |
| P1-BH-52 | `hasAlert` dual semantics / rental escalation |
| P1-BH-53 | `COVERAGE_GAP` legacy-only, not in `openAlerts` |
| P1-BH-54 | No Prometheus `brake_*` metrics |

---

## Ist-Datenfluss (Code-Review Prompt 1)

```
registerFromDimo / manual registration
  → VehicleBrakeReferenceSpec (MANUAL / manual_registration)
  → BrakeInitializationWorkflowService.initializeFromRegistration()  [Prompt 3: einziger Init-Owner]
  → BrakeLifecycleService → BrakeHealthCurrent (anchors, isInitialized) + optional BrakeEvidence
  → (kein vehicle_enrichment_jobs BRAKE mehr — Legacy-Jobs nur Diagnose/Runbook)

recordBrakeService / POST brake-health/service
  → VehicleServiceEvent (BRAKE_SERVICE, scope[])
  → BrakeLifecycleService → evidence + initializeFromService / re-anchor
  → BrakeHealthService.recalculate()

AI document confirm (applyBrake)
  → BrakeEvidence (AI_UPLOAD)
  → recalculate()

Trip end → BullMQ driving-impact.compute
  → DrivingImpactService → TripDrivingImpact
  → DrivingImpactProcessor → BrakeHealthService.recalculate() [fire-and-forget]

Hourly @Interval
  → BrakeRecalculationScheduler → recalculate() per initialized vehicle

Read path
  → BrakeHealthService.getSummary() / getDetail()
  → buildCanonicalReadModel() + composeSummaryDto()
  → RentalHealthService.evaluateBrakes() / isRentalBlocked()
  → Booking gate, Fleet UI, Notifications (BRAKE_CRITICAL), BrakeCriticalDetector
```

**Worker / Queue:** `QUEUE_NAMES.DRIVING_IMPACT_COMPUTE` (BullMQ); Brake-Recalc **ohne** eigene Queue (`brake-recalculation.scheduler.ts` inline).

**Kein dediziertes `alerts`-Modul** — Alerts über `computeAlerts` / `openAlerts`, Business Insights (`BrakeCriticalDetector`), Notifications-Registry.

---

## Code-Inventar (gelesen Prompt 1)

| Bereich | Pfad | Anmerkung |
|---------|------|-----------|
| Brake domain | `backend/src/modules/vehicle-intelligence/brakes/` | 16 Dateien (service, lifecycle, evidence, status, config, specs) |
| Driving impact | `backend/src/modules/vehicle-intelligence/driving-impact/` | TDI → brake recalc trigger |
| Trips | `backend/src/modules/vehicle-intelligence/trips/` | Enrichment orchestrator |
| DIMO | `backend/src/modules/dimo/` | Keine Brake-mm-Signale auf Fleet |
| Rental health | `backend/src/modules/rental-health/` | `evaluateBrakes`, `isBrakeBlockWorthy` |
| DTC | `backend/src/modules/vehicle-intelligence/dtc/` | Parallel zu BrakeEvidence (unwired) |
| Notifications | `backend/src/modules/notifications/` | `BRAKE_CRITICAL` projector |
| Vehicles | `backend/src/modules/vehicles/` | Registration, `brakePadPercent` legacy score |
| Schema | `backend/prisma/schema.prisma` | `BrakeHealthCurrent`, `BrakeEvidence`, `VehicleBrakeReferenceSpec` |
| Workers | `backend/src/workers/` | `DrivingImpactProcessor`, `BrakeRecalculationScheduler` |
| Frontend | `frontend/src/rental/` | HealthErrorsView, FleetCondition, vehicle-health-box, insights |

### Relevante Prisma-Migrationen (bestehend, nicht neu)

| Migration | Inhalt |
|-----------|--------|
| `20260413183000_brake_health_canonical_refactor` | `brake_health_current` canonical fields |
| `20260613234000_add_brake_critical_insight_type` | `InsightType.BRAKE_CRITICAL` |
| `20260613234500_brake_evidence_model` | `brake_evidence` + Enums |

**Prompt 1:** Keine neue Migration.

---

## 26 Umsetzungsschritte — Fortschritt

| Prompt | Phase | Ziel | Status | Commit | Migration | Tests | VPS/Staging |
|--------|-------|------|--------|--------|-----------|-------|-------------|
| **1** | Baseline | Implementierungsbaseline, Builds, Tests dokumentieren | ✅ **Done** | *(nach Commit)* | — | siehe unten | — |
| **2** | Safety net | Regressionstests für kritische Brake-Health-Schreibpfade (A–I) | ✅ **Done** | `b1246a88` | — | 6 rot / 4 grün | — |
| **3** | Architektur | Kanonischer Brake-Initialisierungspfad (Variante A) | ✅ **Done** | `ff9ac7a1` | — | 19 neu grün | read-only diag |
| **4** | A — Fleet | Backfill **execute** + Smoke-Recalc | ⏳ Pending | — | — | regression | execute |
| **5** | A — Fleet | Integration: init → trip → recalc → BHC | ⏳ Pending | — | — | integration | optional |
| **6** | B — Lifecycle | Service-`scope[]` an Init/Re-Anchor durchreichen | ⏳ Pending | — | evtl. | scope unit | — |
| **7** | B — Lifecycle | k-Faktoren bei Teilservice erhalten | ⏳ Pending | — | — | k preservation | — |
| **8** | B — Lifecycle | Scope-aware Tests (front/rear pads/discs only) | ⏳ Pending | — | — | lifecycle spec | — |
| **9** | B — Lifecycle | Service + Evidence atomarer (Transaktion) | ⏳ Pending | — | evtl. | integration | — |
| **10** | C — Anchors | Rotor-Breite ≠ Scheiben-Dicke trennen | ⏳ Pending | — | evtl. | anchor plausibility | — |
| **11** | C — Anchors | Disc-Anker-Validierung + Spec-Semantik | ⏳ Pending | — | — | spec regression | — |
| **12** | D — Safety | DTC Poll → `BrakeEvidence` Producer | ⏳ Pending | — | — | DTC spec | VPS read |
| **13** | D — Safety | DTC Clearance → Alert Resolution | ⏳ Pending | — | — | active/cleared | — |
| **14** | D — Safety | ABS Warning als Safety Evidence (kein Wear-%) | ⏳ Pending | — | — | ABS policy | DIMO when avail. |
| **15** | E — Model | `harshBrakeWearMultiplier` in Recalc verdrahten | ⏳ Pending | — | — | harsh brake | — |
| **16** | E — Model | Rolling-Gap Temporal Leakage mindern | ⏳ Pending | — | — | rolling gap | — |
| **17** | E — Model | Disc OEM-Limit / generic 2mm Review | ⏳ Pending | — | config | disc limit | — |
| **18** | F — Calibration | `calibrateFromMeasurement()` Runtime | ⏳ Pending | — | — | calibration | — |
| **19** | F — Calibration | Target-Leakage + Preservation Tests | ⏳ Pending | — | — | leakage | — |
| **20** | G — Consumers | `hasAlert` / `openAlerts` Semantik vereinheitlichen | ⏳ Pending | — | — | info no escalate | — |
| **21** | G — Consumers | Legacy `/brake-status` + fleet `brakePadPercent` | ⏳ Pending | — | — | canonical guard | — |
| **22** | H — Observability | `BrakeHealthObservabilityService` + Prometheus | ⏳ Pending | — | — | metrics spec | Grafana |
| **23** | H — Observability | BullMQ Recalc-Queue + per-vehicle Lock | ⏳ Pending | — | — | concurrency | — |
| **24** | I — Validation | Messkampagne-Vorbereitung (Workshop/Invoice GT) | ⏳ Pending | — | — | — | campaign |
| **25** | I — Validation | Backtest mit echten Messungen re-run | ⏳ Pending | — | — | backtest script | read-only |
| **26** | I — Validation | Confidence-Caps (Spec ≠ HIGH ohne mm) | ⏳ Pending | — | — | confidence | — |
| **27** | J — DIMO | V003 Event-Ingestion + Capability Gating | ⏳ Pending | — | — | DIMO contract | DIMO read |

---

## Baseline (Prompt 1) — 2026-07-17

### Ausgeführte Befehle

| # | Befehl | Verzeichnis | Exit | Ergebnis |
|---|--------|-------------|------|----------|
| 1 | `npm run prisma:validate` | `backend/` | 0 | Schema gültig (1 Warnung `onDelete SetNull`) |
| 2 | `npm run build` | `backend/` | 0 | Nest build OK |
| 3 | `npm test -- --testPathPattern='brake\|rental-health.service.spec'` | `backend/` | 0 | **9 suites, 161 passed** |
| 4 | `npm test` | `backend/` | 0* | **492 passed suites, 4412 passed tests**; **2 suites FAIL (3 tests)** |
| 5 | `npm run build` | `frontend/` | 0 | `tsc -b` + Vite build OK |
| 6 | `npm test` | `frontend/` | 0 | **233 files, 1461 passed**, 1 skipped, 1 todo |
| 7 | `npm test -- brake-health` | `frontend/` | 0 | **1 file, 3 passed** (`brake-health-canonical.test.ts`) |

\*Jest exit code 0 trotz 2 failed suites — dokumentierte Failures unten.

### Testergebnisse Brake-spezifisch

| Suite | Ergebnis |
|-------|----------|
| `brake-health.spec.ts` | PASS |
| `brake-status.spec.ts` | PASS |
| `brake-evidence.spec.ts` | PASS |
| `brake-lifecycle.service.spec.ts` | PASS |
| `brake-registration-regression.spec.ts` | PASS |
| `brake-registration-backfill.service.spec.ts` | PASS |
| `register-brake-baseline.spec.ts` | PASS |
| `brake-critical.detector.spec.ts` | PASS |
| `rental-health.service.spec.ts` | PASS |
| Frontend `brake-health-canonical.test.ts` | PASS (3) |

### Vorhandene Fehler (nicht Brake-bezogen, Baseline — **vor jeder Änderung**)

| Suite | Fehler | Ursache |
|-------|--------|---------|
| `vehicles.controller.status-patch.spec.ts` (2 Tests) | `TypeError: this.vehiclesService.invalidateFleetMapCache is not a function` | Mock `VehiclesService` ohne `invalidateFleetMapCache` |
| `rental-health-notification.spec.ts` (1 Test) | `projectVehicleHealthWarnings` erwartet length 2, received 1 | Test erwartet Modul-Warning + DTC; nur ACTIVE_DTC emittiert |

**Hinweis:** Diese Failures sind **nicht** im Brake-Audit dokumentiert und werden in Prompt 1 **nicht** behoben (keine fachfremden Änderungen).

### Abweichungen zum Audit-Abschluss (`9ff6fc56`)

| Prüfpunkt | Audit | Baseline Prompt 1 |
|-----------|-------|-------------------|
| Brake-Unit-Tests | 161 passed | **161 passed** — identisch |
| Frontend canonical guard | 3 passed | **3 passed** — identisch |
| Fleet `brake_health_current` | 0 initialized | **Nicht erneut an VPS geprüft** (read-only Baseline) |
| Code vs. Audit-Commit | — | **Keine funktionalen Code-Änderungen** |
| Neue Migrationen | — | **Keine** |
| Backend full suite | nicht im Audit | **2 failed suites** (pre-existing, s.o.) |

---

## Verbleibende Risiken

- Fleet-Init ohne supervised VPS-Run kann falsche Spec-Anker materialisieren (P0-BH-14).
- Backfill ohne Scope-Fix kann bei späterem Teilservice Daten zerstören (P0-BH-10).
- Rental-Blocking korrekt im Code, aber **ungetestet in Produktion** (0 BHC).
- DIMO Brake-Signale auf LTE_R1 **nicht nutzbar** — Wear bleibt TDI/Spec-basiert.
- ClickHouse beim Audit unreachable — HF/DI-Qualität unsicher.

---

## Production-Blocker (Go-Live)

1. Fleet initialization / backfill (P0-BH-01/02/40)
2. Scope-aware lifecycle (P0-BH-10/11)
3. Disc anchor semantics (P0-BH-14)
4. DTC → BrakeEvidence (P0-BH-06)
5. Calibration runtime (P0-BH-04)
6. Harsh-brake wiring (P0-BH-05)
7. Historische Validierung (`NOT_ENOUGH_DATA`)
8. Observability vor Scale (P1-BH-54)

---

## Spätere Messkampagne (Prompt 23+)

Ziel: echte Ground-Truth (Workshop-mm, bestätigte Rechnungen) für ≥1 Fahrzeug/Achse, dann:

- `audit-brake-health-backtest.ts` re-run
- MAE/RMSE/Bias berichten (nicht vorher behaupten)
- Confidence-Kalibrierung gegen Messfehler

**Bis dahin:** Spec-Fallback **nicht** als Messung ausweisen.

---

## Safety-Net Regressionstests (Prompt 2) — 2026-07-17

### Neue Artefakte

| Datei | Zweck |
|-------|-------|
| `backend/src/modules/vehicle-intelligence/brakes/brake-lifecycle-test.harness.ts` | In-Memory-Prisma + echte Domain-Services (`BrakeLifecycleService`, `BrakeHealthService`, `BrakeEvidenceService`, `RentalHealthService`) |
| `backend/src/modules/vehicle-intelligence/brakes/brake-lifecycle-regression.spec.ts` | Regressionstests Szenarien A–I (fachliche Invarianten) |
| `backend/src/modules/vehicle-intelligence/brakes/brake-registration-regression.spec.ts` | Refactor: nutzt gemeinsame Harness (keine Verhaltensänderung) |

### Ausgeführte Befehle

| # | Befehl | Ergebnis |
|---|--------|----------|
| 1 | `npm test -- --testPathPattern='brake-lifecycle-regression\|brake-registration-regression'` | **7 passed, 6 failed** (neue Regressionen) |
| 2 | `npm test -- --testPathPattern='brake\|rental-health.service.spec'` | **10 suites: 9 passed, 1 failed**; **171 tests: 165 passed, 6 failed** |

**Hinweis:** Die 6 fehlschlagenden Tests sind **bewusst rot** — sie dokumentieren aktuelle Invarianten-Verletzungen vor Lifecycle-Reparatur. Bestehende Brake-Suites (inkl. `brake-registration-regression`, `rental-health.service.spec`) bleiben grün.

### Szenario-Abdeckung

| ID | Szenario | Tests | Ergebnis | Verletzte Finding(s) |
|----|----------|-------|----------|----------------------|
| **A** | Registrierung: Spec ohne materialisiertes BHC | 2 | ✅ grün | P0-BH-02 (Schutz gegen falsches Init-Signal) |
| **B** | Teilservice `FRONT_PADS` only | 1 | ❌ rot | P0-BH-10, P0-BH-12 — Scope ignoriert; k-Faktoren reset |
| **C** | `INSPECTION_ONLY` ohne Anker-Reset | 1 | ❌ rot | P0-BH-10 — Messung triggert `initializeFromService` |
| **D** | `BRAKE_FLUID_SERVICE` ohne Pad/Disc-Reset | 1 | ❌ rot | P0-BH-10 |
| **E** | Spec-Fallback ≠ reale Messung | 1 | ❌ rot | P1-BH-50 — Spec-only erreicht `confidenceLevel: HIGH` |
| **F** | Service-Event ohne Health-Init | 1 | ✅ grün | Inkonsistenz sichtbar (`brakeLifecycleApplied: false`) |
| **G** | Health ohne Evidence | 1 | ❌ rot | Evidence-Lücke nicht als unvollständig erkennbar |
| **H** | ESTIMATED CRITICAL ohne Hard-Block | 1 | ✅ grün | Rental-Blocking korrekt eingeschränkt |
| **I** | Coverage-Lücke ≠ Verschleiß | 1 | ❌ rot | P1-BH-52 — DB `hasAlert=true` bei info `COVERAGE_GAP` |

### Produktionslogik

**Keine Änderung** an Domain-Services, Migrationen oder VPS-Daten.

---

## Kanonischer Initialisierungspfad (Prompt 3) — 2026-07-17

### Architekturentscheidung: **Variante A — direkter Lifecycle-Pfad**

| Kriterium | Variante A (gewählt) | Variante B (abgelehnt) |
|-----------|----------------------|-------------------------|
| Zuverlässigkeit | Init synchron im Registration-Request; kein verwaister DB-Job ohne Consumer | Neuer BullMQ-Processor nötig; doppelte Wahrheit während Migration |
| Nutzererwartung | Brake-Baseline direkt nach Registrierung verfügbar (wenn Odometer/Spec vorhanden) | Asynchrones Delay; UI müsste Job-Status pollen |
| Transaktionsgrenzen | `BrakeLifecycleService` schreibt Event + BHC im selben Request-Flow | Eventual consistency zwischen Job-Status und BHC |
| Retry / Idempotenz | `BrakeInitializationWorkflowService` prüft `isInitialized` vor erneutem Init | Retry möglich, aber redundant zum bestehenden Lifecycle |
| Betriebsarchitektur | Passt zu bestehendem Muster (Tire: eigene Recalc-Queue; Brake-Init: noch kein async Spec-Fetch) | `WORKER_BRAKE_ENRICHMENT_CONCURRENCY` existierte als Dead Config ohne Queue |
| SynqDrive-Konvention | Wear-Recalc bereits über `trip.driving-impact.compute`; Init gehört in Domain-Lifecycle | Würde parallelen Init-Owner neben `initializeFromRegistration` einführen |

**Audit-Finding P0-BH-03:** 6× `vehicle_enrichment_jobs` mit `jobType=BRAKE`, `status=PENDING`, **kein Processor**.

### Implementierung

| Komponente | Pfad | Rolle |
|------------|------|-------|
| **Autoritativer Init-Owner** | `BrakeInitializationWorkflowService` | Einziger Einstieg für Registration + Backfill-Init |
| Domain-Umsetzung | `BrakeLifecycleService.initializeFromRegistration` | Unverändert; wird nur über Workflow aufgerufen |
| Registration | `VehiclesService.registerFromDimo` | Ruft Workflow statt Lifecycle direkt; **kein neuer BRAKE-Job** |
| Backfill | `BrakeRegistrationBackfillService` | Ruft Workflow (kontrolliert, supervised) |
| Wear-Recalc | `DrivingImpactProcessor` + `BrakeRecalculationScheduler` | Unverändert; kein Init-Owner |

### Entfernte / erhaltene Queue-Pfade

| Pfad | Status nach Prompt 3 |
|------|----------------------|
| `vehicle_enrichment_jobs` `jobType=BRAKE` Producer in `registerFromDimo` | **Entfernt** (keine neuen Jobs) |
| `POST …/enrichment-jobs` mit `jobType=BRAKE` | **Blockiert** (`400 Bad Request`) |
| BullMQ `BRAKE_ENRICHMENT` Queue | **Existiert nicht** (bewusst nicht eingeführt) |
| `trip.driving-impact.compute` → `recalculate()` | **Erhalten** (Wear, nicht Init) |
| `dimo.tire.recalculation` | **Unverändert** (Tire-Analogie nur für Recalc) |
| `vehicle_enrichment_jobs` Tabelle + Enum `BRAKE` | **Erhalten** (Bestandsjobs; keine Migration) |

### Legacy PENDING-Jobs — Umgang

| Aktion | Details |
|--------|---------|
| **Nicht auto-ausführen** | Kein Processor wird für Bestandsjobs gestartet |
| **Read-only Diagnose** | `scripts/ops/diagnose-brake-enrichment-jobs.ts` |
| Klassifikation | `ORPHAN_LEGACY_NO_PROCESSOR`, `SUPERSEDED_ALREADY_INITIALIZED`, `REPLAY_CANDIDATE_VIA_BACKFILL`, `STALE_INCOMPATIBLE`, `COMPLETED_OR_TERMINAL` |
| Replay-kompatibel | Nur via kontrolliertem Ops-Backfill (`backfill-brake-health-from-registration-specs.ts --execute`) |
| Runbook | Jobs mit `SUPERSEDED_ALREADY_INITIALIZED` → manuell `COMPLETED` markieren (separater supervised Prompt); `REPLAY_CANDIDATE` → Backfill dry-run zuerst |

### Tests (Prompt 3)

| Suite | Ergebnis |
|-------|----------|
| `brake-initialization-workflow.service.spec.ts` | **5 passed** — direkte Registration, Idempotenz, Retry, Skip-Pfade |
| `brake-enrichment-job-diagnostics.service.spec.ts` | **5 passed** — Orphan, Superseded, Stale, Multi-Tenant, Dead Letter |
| `enrichment-jobs.service.spec.ts` | **2 passed** — BRAKE-Producer blockiert, BATTERY erlaubt |
| `brake-registration-backfill.service.spec.ts` | **6 passed** — Backfill über Workflow |

```bash
npm test -- --testPathPattern='brake-initialization-workflow|brake-enrichment-job-diagnostics|enrichment-jobs.service|brake-registration-backfill'
# 4 suites, 19 passed
npm run build  # OK
```

---

## Commit-Log (Remediation)

| Prompt | Commit | Message |
|--------|--------|---------|
| 1 | `b12599f5da380f9740a8e44dc6d43f88351bdaa6` | `docs(brakes): establish production readiness remediation baseline` |
| 2 | `b1246a886d62892abd605617f39e007871663994` | `test(brakes): capture brake health lifecycle regressions` |
| 3 | `ff9ac7a1350912e25005de314dfb1eb985c33f69` | `fix(brakes): establish canonical brake initialization workflow` |

---

## Constraints (alle Prompts)

- Keine Produktions-Writes ohne expliziten supervised Prompt
- Keine Brake-Recalculation gegen Produktion in Baseline-Prompts
- Keine DIMO-Schreiboperationen
- Keine Tests abschwächen
- Audit-Artefakte unter `docs/audits/` unverändert lassen (nur Implementation-Docs)
