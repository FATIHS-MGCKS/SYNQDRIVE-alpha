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
| **3** | Architektur | Kanonischer Brake-Initialisierungspfad (Variante A) | ✅ **Done** | `b892b605` | — | 19 neu grün | read-only diag |
| **4** | Registration | Brake-Health-Ausgangszustand bei Fahrzeugregistrierung | ✅ **Done** | `e8e62310` | — | 39 grün | — |
| **5** | A — Fleet | Read-only Baseline-Backfill-Kandidaten-Audit | ✅ **Done** | `a30ea31d` | — | 13 grün | read-only |
| **6** | B — Lifecycle | Komponenten-Installationsperioden (`BrakeComponentInstallation`) | ✅ **Done** | `39c7e176` | `20260717140000` | 18 grün | — |
| **7** | B — Lifecycle | Zentraler `BrakeComponentLifecycleService` | ✅ **Done** | `7617ba59` | — | 36 grün | — |
| **8** | A — Fleet | Backfill **execute** + Smoke-Recalc | ⏳ Pending | — | — | regression | execute |
| **8** | A — Fleet | Integration: init → trip → recalc → BHC | ⏳ Pending | — | — | integration | optional |
| **8** | B — Lifecycle | Service-`scope[]` an Init/Re-Anchor durchreichen | ⏳ Pending | — | evtl. | scope unit | — |
| **8** | B — Lifecycle | k-Faktoren bei Teilservice erhalten | ⏳ Pending | — | — | k preservation | — |
| **9** | B — Lifecycle | Scope-aware Tests (front/rear pads/discs only) | ⏳ Pending | — | — | lifecycle spec | — |
| **10** | B — Lifecycle | Service + Evidence atomarer (Transaktion) | ⏳ Pending | — | evtl. | integration | — |
| **11** | C — Anchors | Rotor-Breite ≠ Scheiben-Dicke trennen | ⏳ Pending | — | evtl. | anchor plausibility | — |
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

## Brake-Health bei Registration (Prompt 4) — 2026-07-17

### Ziel

Gültige Fahrzeugregistrierung erzeugt einen **nachvollziehbaren Brake-Ausgangszustand**. „Bremsen neu“ ≠ gemessene Dicke; fehlende Baseline bleibt sichtbar; kein stiller Teilfehler.

### Architektur

```
registerFromDimo (VehiclesService)
  → BrakeRegistrationService.processRegistrationBrakes()
    → validateRegistrationBrakeInput() — Odometer, mm, Datum, Plausibilität
    → VehicleBrakeReferenceSpec.create (wenn eligible)
    → BrakeInitializationWorkflowService.initializeFromRegistration()
      → BrakeLifecycleService → BrakeHealthCurrent (+ optional BrakeEvidence)
  → { vehicle, brakeRegistration }  (RegisterFromDimoResult)
```

**Teilfehler-Policy:** Fahrzeugregistrierung **läuft weiter**; Brake-Init-Fehler werden revisionssicher markiert (`brakeBaselineStatus: FAILED` / `INITIALIZATION_REQUIRED`, `BrakeHealthCurrent.isInitialized: false`, `baselineWarnings`).

### Registration-Ausgänge (A–D)

| Status | Bedeutung | `evidenceSource` | BHC |
|--------|-----------|-------------------|-----|
| **A** `DOCUMENTED_REPLACEMENT` | Neue Bremsen dokumentiert/bestätigt | `DOCUMENTED_REPLACEMENT` | materialisiert; nominale Neudicke aus Spec, **nicht** als Messung |
| **B** `MEASURED` | Echte Dicke gemessen | `MEASURED` | materialisiert; Mess-Evidence verknüpft |
| **C** `NO_BASELINE` / `INITIALIZATION_REQUIRED` | Zustand unbekannt / Spec ohne Odometer | `NONE` / `SPEC_ONLY` | kein 100-%-Wear; keine erfundene aktuelle Dicke |
| **D** `SPEC_ONLY` | Nur Reference Spec | `SPEC_ONLY` | operative Verschleißbaseline fehlt; Messung/Bestätigung erforderlich |

### API-Antwort (`RegisterFromDimoResult`)

```typescript
{
  vehicle: Vehicle;
  brakeRegistration: {
    brakeHealthInitialized: boolean;
    brakeBaselineStatus: RegistrationBrakeBaselineStatus;
    evidenceSource: 'MEASURED' | 'DOCUMENTED_REPLACEMENT' | 'SPEC_ONLY' | 'NONE';
    requiresMeasurement: boolean;
    requiresSpecConfirmation: boolean;
    initializationError: string | null;
    specCreated: boolean;
    message: string;
  };
}
```

### Neue / geänderte Artefakte

| Datei | Rolle |
|-------|-------|
| `brake-registration.service.ts` | Kanonischer Registration-Brake-Orchestrator |
| `registration-brake-outcome.ts` | Outcome-Typen A–D + `deriveRegistrationBrakeResult()` |
| `register-brake-baseline.ts` | `validateRegistrationBrakeInput()` (Server-Validierung) |
| `register-from-dimo-result.dto.ts` | Explizites Response-DTO |
| `vehicles.service.ts` | Brake-Logik delegiert; Rückgabe `{ vehicle, brakeRegistration }` |

### Abgedeckte Registration-Pfade

| Pfad | Status |
|------|--------|
| `POST …/register-from-dimo` (Web, Operator, API) | ✅ vollständig |
| Import / Non-registered → Registered (über register-from-dimo) | ✅ |
| Manuelle Bestätigung / NEW ohne mm | ✅ `DOCUMENTED_REPLACEMENT` |
| AI/OCR (`applyBrake` / `recordService`) | unverändert — eigener Lifecycle-Pfad |
| `VehiclesService.create()` / HM_ONLY | kein Brake-Init (unverändert) |

### Tests (Prompt 4)

| Suite | Szenarien |
|-------|-----------|
| `registration-brake-outcome.spec.ts` | dokumentiert neu, gemessen, unbekannt, spec-only, failed |
| `brake-registration.service.spec.ts` | fehlender Odometer, ungültige mm, fehlende Spec, Retry, Teilfehler, Cross-Tenant |
| `register-brake-baseline.spec.ts` | Validierung mm/Odometer/Datum |
| `brake-registration-regression.spec.ts` | Regression Harness (grün) |
| `brake-registration-backfill.service.spec.ts` | Backfill unverändert grün |

```bash
npm test -- --testPathPattern='brake-registration|registration-brake-outcome|register-brake-baseline|brake-registration-regression'
# 5 suites, 39 passed
npm run build  # OK
```

---

## Read-only Baseline-Backfill-Audit (Prompt 5) — 2026-07-17

### Ziel

Bestandsfahrzeuge **ohne** `BrakeHealthCurrent` oder **ohne belastbare Baseline** komponentenweise klassifizieren — **keine Produktionsdaten ändern**.

### Artefakte

| Datei | Rolle |
|-------|-------|
| `scripts/ops/audit-brake-health-baseline-candidates.ts` | Thin CLI (read-only) |
| `brake-baseline-candidate-audit.ts` | Pure Klassifikation + Markdown |
| `brake-baseline-candidate-audit.loader.ts` | Rohdaten → Audit-Input |
| `brake-baseline-candidate-audit.service.ts` | Prisma-Loader (read-only) |
| `brake-baseline-candidate-audit.safety.ts` | Prod/Remote-DB-Guard |
| `docs/audits/brake-health-baseline-backfill-candidates-2026-07.md` | Anonymisierter Bericht (Fixture-Lauf) |
| `docs/audits/data/brake-health-baseline-backfill-candidates-2026-07.json` | JSON-Artefakt |

### Kandidaten-Klassen (pro Komponente)

`EXACT_MEASURED` · `CONFIRMED_REPLACEMENT` · `HIGH_CONFIDENCE_DOCUMENTED` · `SPEC_ONLY` · `REGISTRATION_ASSERTION_ONLY` · `CONFLICTING_DATA` · `NO_SAFE_BASELINE`

Komponenten: `FRONT_PADS`, `REAR_PADS`, `FRONT_DISCS`, `REAR_DISCS` — **keine** Vollbaseline aus Teilsignal.

### Analysierte Signale pro Fahrzeug

BHC · Reference Spec · Registration State · Odometer-Historie · Service Events · bestätigte Dokumente · Brake Evidence · PENDING BRAKE Jobs · Trips · DTCs · Alerts

### Odometer-Anker

Exakter Wert am Baseline-Zeitpunkt · nächster Provider-Wert · Registration/Service-Odometer · Konflikte · Rücksprünge

### Ausführung

```bash
# Fixture-Bericht (CI / ohne DB)
npx ts-node -r tsconfig-paths/register scripts/ops/audit-brake-health-baseline-candidates.ts --fixtures-only

# Datenbank (supervised, read-only)
BRAKE_HEALTH_AUDIT_ALLOW_REMOTE=1 npx ts-node -r tsconfig-paths/register scripts/ops/audit-brake-health-baseline-candidates.ts --allow-remote-db
```

### Tests

```bash
npm test -- --testPathPattern='brake-baseline-candidate-audit'
# 13 passed
```

Szenarien: echte Messung · bestätigter Austausch · Spec-only · unklare Registration · Teilservice · widersprüchliche Daten · kein Odometer · PENDING Job · kein sicherer Kandidat.

---

## Komponenten-Installationsperioden (Prompt 6) — 2026-07-17

### Ziel

Skalare Brake-Lifecycle-Semantik um **nachvollziehbare Komponenten-Installationsperioden** ergänzen. `BrakeHealthCurrent` bleibt unverändert als Read Model.

### Neues additives Modell

| Artefakt | Rolle |
|----------|-------|
| `BrakeComponentInstallation` | Historische Installationsperioden pro Komponente |
| `BrakeComponentInstallationService` | Install / Remove / Retire mit Invarianten |
| `brake-component-installation.invariants.ts` | Pure Validierung (Tenant, Odometer, Active-Unique) |
| Migration `20260717140000_brake_component_installation_lifecycle` | Additive Tabelle + Partial-Unique-Index |

### Komponenten & Status

- **Types:** `FRONT_PADS`, `REAR_PADS`, `FRONT_DISCS`, `REAR_DISCS`
- **Status:** `ACTIVE`, `REMOVED`, `UNKNOWN_HISTORY`, `RETIRED`
- **Anchor Source:** `MEASURED`, `DOCUMENTED_REPLACEMENT`, `SPEC_NOMINAL`, `REGISTRATION_ASSERTION`, `UNKNOWN`

### Invarianten

- Max. eine `ACTIVE` Installation je `vehicleId` + `componentType` (Partial Unique Index)
- `removedAt` ≥ `installedAt`
- `removedOdometerKm` ≥ `installedOdometerKm` (außer dokumentiertem Reset)
- `organizationId` konsistent mit Fahrzeug
- Service/Evidence/Spec-Referenzen: `onDelete: Restrict` (revisionssicher)

### Bewusst nicht enthalten

- Kein Backfill bestehender `BrakeHealthCurrent`-Daten in Installationen
- Keine Entfernung skalarer BHC-Felder
- `REAR_DRUMS` / `PARKING_BRAKE_COMPONENT` (keine bestehende Domain-Unterstützung)

### Tests

```bash
npm test -- --testPathPattern='brake-component-installation'
# 18 passed
npm run prisma:validate  # OK
npm run build            # OK
```

---

## Zentraler Komponenten-Lifecycle (Prompt 7) — 2026-07-17

### Ziel

Alle Brake-Komponenten-Mutationen laufen zentral über `BrakeComponentLifecycleService` — atomar, scope-bewusst, idempotent.

### Operationen

| Methode | Zweck |
|---------|-------|
| `installComponent` | Erstinstallation einer Komponente |
| `replaceComponent` | Supersede + neue Installation im expliziten Scope |
| `removeComponent` | Aktive Installation schließen (`REMOVED`) |
| `registerMeasuredBaseline` | Gemessene Baseline + Evidence |
| `registerDocumentedReplacement` | Dokumentierter Austausch (nicht als Messung) |
| `correctInstallation` | Korrektur ohne Supersede |
| `getActiveInstallation` | Read-Pfad |

### Transaktionsinhalt

1. Alte Installation schließen (bei Replace)
2. Neue Installation anlegen
3. `VehicleServiceEvent` verknüpfen
4. `BrakeEvidence` verknüpfen (bei Messung)
5. `BrakeHealthCurrent.applyScopedComponentAnchors()` — **nur** explizite Komponenten
6. Audit-Log im Result (`auditLog[]`)

### Scope-Regeln

- `FULL_BRAKE_SERVICE` erfordert **expliziten** Scope — kein Auto-Expand auf alle 4
- `FRONT_PADS` allein verändert nie `REAR_*` oder Discs
- Front-Achse: `front_pads` + `front_discs` erlaubt
- Alle 4 nur wenn explizit im Scope

### Neue Artefakte

| Datei | Rolle |
|-------|-------|
| `brake-component-lifecycle.service.ts` | Zentraler Mutation-Owner |
| `brake-component-lifecycle.scope.ts` | Scope-Normalisierung + Validierung |
| `brake-component-lifecycle.types.ts` | Commands / Results |
| `brake-health.service.ts` | `applyScopedComponentAnchors()` |

### Tests

```bash
npm test -- --testPathPattern='brake-component-lifecycle|brake-component-installation'
# 36 passed
```

---

## Scoped Brake Service (Prompt 8) — 2026-07-17

### Ziel

P0-Fix: Teilservices dürfen `BrakeHealthCurrent` nicht global zurücksetzen. Scope ist serverseitig verpflichtend bei Austausch.

### Scope-Matrix (`brake-service-scope.matrix.ts`)

| Profil | Komponenten |
|--------|-------------|
| `INSPECTION_ONLY` | keine Installation |
| `BRAKE_FLUID_SERVICE` | keine Pad-/Disc-Änderung |
| `FRONT_PADS_REPLACED` | `FRONT_PADS` |
| `REAR_PADS_REPLACED` | `REAR_PADS` |
| `FRONT_DISCS_REPLACED` | `FRONT_DISCS` |
| `REAR_DISCS_REPLACED` | `REAR_DISCS` |
| `FRONT_PADS_AND_DISCS` | `FRONT_PADS` + `FRONT_DISCS` |
| `REAR_PADS_AND_DISCS` | `REAR_PADS` + `REAR_DISCS` |
| `FULL_BRAKE_SERVICE` | nur explizit übermittelte Komponenten |

### Verhalten `BrakeLifecycleService.recordService`

- **Inspection / Fluid:** nur Historie + optionale Evidence; keine Anchor-/Installationsänderung
- **Austausch:** scoped `initializeFromService` / `applyScopedComponentAnchors` — Spec-Fallback nur für bestätigte Scope-Komponenten
- **K-Faktoren / Alerts / Calibration:** unberührte Komponenten bleiben erhalten
- **Evidence-Lücke:** fehlgeschlagener Evidence-Write → Baseline-Warning; `dataBasis` ohne Evidence nicht `MEASURED`
- **Coverage-Gap:** `hasAlert` nur bei `warning`/`critical`, nicht bei `info`

### API-Validierung

- `ValidateBrakeServiceScopePipe` auf `POST brake-health/initialize` und `POST brake-health/service`

### Tests

```bash
npm test -- --testPathPattern='brake-lifecycle|brake-service-scope|brake-health.spec'
# 85 passed (Regression A–I grün)
```

---

## Atomic Brake Service Application (Prompt 9) — 2026-07-17

### Ziel

P0-Fix: Keine inkonsistenten Teilzustände zwischen Service Event, Component Installation, Evidence und `BrakeHealthCurrent`. Eine erfolgreiche Service-Anwendung ist atomar; Nebenwirkungen (Recalc, Alerts, Notifications) erst nach Commit.

### Transaktionsgrenzen (vorher)

| Schritt | bisherige Grenze | Risiko |
|---------|------------------|--------|
| Service Event | eigener Persist | Event ohne Application |
| Installation supersede/create | teils außerhalb TX | halbe Installation |
| Evidence | eigener Write | Health ohne Evidence |
| `BrakeHealthCurrent` | separater Upsert + Recalc | Reset ohne Vorgang |
| Recalc / Alerts | inline | vor Commit sichtbar |

### Zentraler Orchestrator

`BrakeServiceApplicationService.apply()` — einziger Mutation-Owner für API/AI-Service-Pfad:

```
BrakeLifecycleService.recordService()
  → BrakeServiceApplicationService.apply()
       ├─ Tenant-Check (organizationId + vehicleId)
       ├─ Idempotency-Claim (brake_service_applications)
       ├─ $transaction:
       │    Service Event (PENDING → APPLIED | HISTORY_ONLY)
       │    alte Installationen schließen + neue anlegen (scoped)
       │    BrakeEvidence
       │    BrakeHealthCurrent (applyScopedComponentAnchorsInTx)
       │    Application-Status + resultJson
       │    Outbox enqueue (RECALCULATE, RESOLVE_ALERTS, NOTIFY)
       └─ post-commit: BrakeServiceOutboxService.processForApplication()
```

Bei TX-Fehler: vollständiger Rollback; Compliance-`vehicle_service_events` mit `brakeApplicationStatus=FAILED` und `brake_service_applications.status=FAILED` (nachvollziehbarer Fehler, idempotenter Retry).

### Schema (Migration `20260717150000_brake_service_application_atomic`)

- **`brake_service_applications`**: Idempotency-Inbox, unique `(organization_id, vehicle_id, idempotency_key)`
- **`brake_service_outbox`**: Post-Commit-Nebenwirkungen (`RECALCULATE`, `RESOLVE_ALERTS`, `NOTIFY`)
- **`vehicle_service_events.brake_application_status`**: `PENDING | PROCESSING | APPLIED | HISTORY_ONLY | FAILED`

### Idempotency Key

`brake:{organizationId}:{vehicleId}:{clientRequestId|externalDocumentId|explicitKey}` — Request-Hash verhindert Key-Reuse mit abweichendem Payload (`ConflictException`).

### Fehlerverhalten

| Fehlerszenario | Verhalten |
|----------------|-----------|
| Evidence / Health / Installation in TX | Rollback aller fachlichen Writes |
| Compliance | FAILED-Event + FAILED-Application bleiben |
| Retry gleicher Key | idempotent, keine doppelten Installationen |
| Outbox nach Commit | Recalc asynchron; NOTIFY bewusst No-Op (Queue später) |

### Betroffene Dateien

| Datei | Rolle |
|-------|-------|
| `brake-service-application.service.ts` | Atomarer Orchestrator |
| `brake-service-outbox.service.ts` | Post-Commit Recalc/Alerts |
| `brake-service-application.domain.ts` | Idempotency + Request-Hash |
| `brake-lifecycle.service.ts` | Dünner Delegate |
| `brake-health.service.ts` | `applyScopedComponentAnchorsInTx()` |

### Tests

```bash
npm test -- --testPathPattern='brake-lifecycle|brake-service-application|brake-service-scope|brake-health.spec'
# 92 passed
```

Abgedeckt: voller Erfolg, Cross-Tenant, Doppelrequest, Payload-Mismatch, Evidence-Rollback, Health-Retry, Outbox-Recalc, keine doppelten Installationen bei Replay.

---

## Brake Reference Spec Provenance (Prompt 10) — 2026-07-17

### Ziel

P0-Fix: `frontRotorWidth`/`rearRotorWidth` dürfen nicht ungeprüft als Scheiben-Nominaldicke dienen. Nominal Thickness, Quelle, Confidence und Bestätigung sind revisionssicher.

### Schema (Migration `20260717160000_brake_reference_spec_provenance`)

- **Nominalfelder:** `frontPadNominalThicknessMm`, `rearPadNominalThicknessMm`, `frontDiscNominalThicknessMm`, `rearDiscNominalThicknessMm`
- **Evidence-Kategorie je Komponente:** `BrakeReferenceSpecEvidenceCategory` (`MANUFACTURER_CONFIRMED` … `LEGACY_UNVERIFIED`)
- **Provenance:** `sourceUrl`, `sourcePartNumber`, `sourceProvider`, `sourceRetrievedAt`, `sourceConfidence`, `userConfirmedAt`, `userConfirmedBy`, `semanticMappingVersion`
- **Legacy:** `frontRotorWidth`/`rearRotorWidth` bleiben erhalten, werden als `LEGACY_UNVERIFIED` markiert

### Domain (`brake-reference-spec.domain.ts`)

| Regel | Verhalten |
|-------|-----------|
| Source Priority | `MANUFACTURER_CONFIRMED` > `USER_CONFIRMED` > `PART_CATALOG_CONFIRMED` > … > `LEGACY_UNVERIFIED` |
| Anchor-Eligibility | `AI_ESTIMATED`, `LEGACY_UNVERIFIED`, `UNKNOWN` → kein Spec-Fallback-Anchor |
| Plausibilität | Pads 2–25 mm, Discs 15–40 mm (getrennte Bereiche) |
| Legacy Rotor Width | Adapter markiert `LEGACY_UNVERIFIED`, kein Disc-Nominal-Backfill |
| AI | niemals auto-bestätigt; Disc-Nominal aus AI wird abgelehnt |

### Runtime

`resolveAnchorEligibleThicknessForInstallation()` in `BrakeHealthService`, `BrakeServiceApplicationService` und Audit-Loader — nur bestätigte Nominaldicke als Anchor.

### Tests

```bash
npm test -- --testPathPattern='brake-reference-spec|register-brake-baseline|brake-registration|brake-lifecycle|brake-service-application|brake-baseline-candidate-audit|brake-health.spec'
# 139 passed
```

---

## Component-Specific Wear Thresholds (Prompt 11) — 2026-07-17

### Ziel

P0-Fix: Keine generische 2-mm-Scheibenabnutzung als sicherheitsrelevante Wahrheit. Critical/Warning basieren auf bauteilspezifischen, bestätigten Mindestwerten.

### Schema (Migration `20260717170000_brake_wear_thresholds`)

- `frontPadMinimumThicknessMm`, `rearPadMinimumThicknessMm`, `frontDiscMinimumThicknessMm`, `rearDiscMinimumThicknessMm`
- `thresholdSource` (`BrakeWearThresholdSource`), `thresholdConfidence`, `thresholdConfirmedAt`

### Semantik-Trennung

| Konzept | Feld / Quelle |
|---------|----------------|
| Nominal thickness | `*NominalThicknessMm` |
| Current measured | Evidence / `currentMeasuredThicknessMm` |
| Operational warning | `warningThresholdMm` (konservativer, getrennt) |
| Manufacturer minimum | `*MinimumThicknessMm` + `thresholdSource` |
| Safety critical | `criticalThresholdMm` nur bei `confirmed` |

### Domain (`brake-wear-threshold.domain.ts`)

- `resolveComponentWearThreshold()` — Pad/Disc und Front/Rear getrennt
- Disc ohne bestätigtes Minimum: `thresholdMissing=true`, keine Health/Remaining-Projektion
- AI/LEGACY_DEFAULT: kein measured CRITICAL hard block
- API: `componentThresholds[]` mit `warningThresholdMm`, `criticalThresholdMm`, `source`, `confirmed`, `thresholdMissing`

### Condition Engine

- `classifyMeasuredThicknessWithThresholds()` — nur bestätigte Minima für CRITICAL
- `BrakeHealthService` Wear-Model und Alerts nutzen `resolveComponentWearThreshold()`

### Tests

```bash
npm test -- --testPathPattern='brake-wear-threshold|brake-health.spec|brake-lifecycle|brake-service-application'
# 167 passed
```

---

## Controlled Component Baseline Backfill (Prompt 12) — 2026-07-17

### Ziel

Kontrolliertes Backfill-Werkzeug für bestehende Fahrzeuge und Brake-Komponenten. Standard: **DRY RUN**. Apply nur mit expliziten Guards. **Nicht gegen Produktion ausgeführt in diesem Prompt.**

### Apply-Layer

| Datei | Rolle |
|-------|-------|
| `brake-baseline-backfill-apply.ts` | Plan, Report-Hash, Apply-Request-Validierung |
| `brake-baseline-backfill-apply.safety.ts` | Prod/Remote-Guards für Apply |
| `brake-baseline-backfill.service.ts` | Orchestrierung → `BrakeComponentLifecycleService` |
| `audit-brake-health-baseline-candidates.ts` | Erweitert um Apply-Modus (DRY RUN default) |

### Auto-apply Policy

| Klasse | Auto |
|--------|:----:|
| `EXACT_MEASURED` | ✓ |
| `CONFIRMED_REPLACEMENT` | ✓ |
| `HIGH_CONFIDENCE_DOCUMENTED` | ✓ nur HIGH + gemessene Dicke + sauberer Odometer |
| `SPEC_ONLY` / `REGISTRATION_ASSERTION_ONLY` / `CONFLICTING_DATA` / `NO_SAFE_BASELINE` | ✗ |

### Apply-Guards

`--apply` erfordert: `organizationId` oder `vehicleId`, `--confirm-backup`, `--expected-report-hash`, `--confirm-git-ref`, `--confirm-schema-version`, `--operator`, `--reason`, `--max-batch-size`.

### Idempotenz

- Report-Hash schützt vor veraltetem Plan
- Idempotency-Key pro Komponente (`brake-baseline-backfill:<fingerprint>`)
- Re-Apply = No-op, keine doppelten Installationen

### Runbook

[`docs/runbooks/brake-health-component-baseline-backfill.md`](../runbooks/brake-health-component-baseline-backfill.md)

### Tests

```bash
npm test -- --testPathPattern='brake-baseline-backfill|brake-baseline-candidate-audit'
# 33 passed
```

---

## Authoritative TripDrivingImpact Coverage (Prompt 13) — 2026-07-17

### Ziel

Brake Health rechnet auf vollständiger, konsistenter `TripDrivingImpact`-Datenbasis mit kanonischer Distanz, Fingerprint-Idempotenz und sichtbarer Coverage-Klassifikation.

### Kanonische Distanzquelle

`VehicleTrip.distanceKm` zum Compute-Zeitpunkt → `authoritativeDistanceKm` (Policy `trip-distance-km-v1`).

### Neue TDI-Felder (Migration `20260717180000_trip_driving_impact_authoritative_coverage`)

- `authoritativeDistanceKm`, `sourceVersion`, `sourceFingerprint`
- `analysisStatus` (`PENDING|COMPLETE|PARTIAL|UNSUPPORTED|FAILED|STALE`)
- `calculatedAt`, `sourceCompleteness`, `tripDistanceKmAtSource`, `distanceDiscrepancyKm`

### Idempotenz

- Gleicher `sourceFingerprint` → No-op, keine Brake-Recalculation
- Geänderte Trip-Distanz → `STALE`, Update statt Doppelzählung

### Backfill-Audit (DRY RUN)

- Domain: `trip-driving-impact-coverage.domain.ts`
- Service: `trip-driving-impact-backfill.service.ts`
- Ops: `scripts/ops/audit-trip-driving-impact-coverage.ts`

### Tests

```bash
npm test -- --testPathPattern='trip-driving-impact-coverage|driving-impact.service'
```

---

## DIMO Native Braking Event Intake (Prompt 14) — 2026-07-17

### Ziel

Zuverlässige Übernahme real gelieferter DIMO `behavior.*`-Braking-Events für **LTE_R1**-Fahrzeuge mit idempotentem Provider-Intake, Capability-Gating und paginiertem Fetch — **ohne** Wear-Multiplikation.

### Neues Schema (Migration `20260717190000_dimo_braking_event_intake`)

`DimoBrakingEventIntake` mit:

- `provider`, `providerEventId` (`@@unique([provider, providerEventId])`)
- `vehicleId`, `organizationId`, `tokenId`
- `eventType`, `eventTimestamp`, `severity`
- `rawSourceVersion`, `sourceFingerprint`
- `tripId` (optional), `processingStatus`
- `dimoEventName`, `counterValue` — kein vollständiges Raw-Event, keine Standortdaten

### Capability-Gating

- Nur `LTE_R1` + `nativeEventCapable` + Provider `DIMO`
- Optional `dataSummary.eventDataSummary` Preflight (historische Verfügbarkeit)
- Offizielle Eventnamen: `behavior.harshBraking`, `behavior.extremeBraking`, `behavior.extremeEmergency`, `behavior.extremeEmergencyBraking`

### Ingestion-Pfad

`TripBehaviorEnrichmentService` → `LteR1BehaviorEnrichmentService` → `DimoBrakingEventIntakeService`:

1. Paginierter + retried `events(...)`-Fetch (`DimoSegmentsService.fetchDrivingEventsPaginated`)
2. Idempotenter Intake-Upsert pro `providerEventId`
3. Persistenz in `driving_events` + Link `dimo_braking_event_intakes.driving_event_id`
4. Read-only Audit bestehender Events gegen `mapDimoEventName`

### Tests

```bash
npm test -- --testPathPattern='dimo-braking-event-intake|dimo-driving-events.pagination|lte-r1-behavior-enrichment'
```

---

## Canonical Braking Event Ledger (Prompt 15) — 2026-07-17

### Ziel

Ein physisches Bremsereignis fließt höchstens einmal in Brake Load / TDI ein. Quellen (DIMO Provider, SynqDrive HF, abgeleitete Aggregation) bleiben korrelierbar, ohne Doppelzählung.

### Schema (Migration `20260717200000_braking_event_ledger`)

`BrakingEventLedger` mit `canonicalType`, `primarySource`, `providerEventId`, `sourceFingerprint`, `correlatedSourceIds`, `confidence`, `dedupeWindowMs` (default 2000ms).

**Canonical Types:** `MODERATE_BRAKING`, `HARSH_BRAKING`, `EXTREME_BRAKING`, `FULL_BRAKING`, `HIGH_SPEED_BRAKING`, `ABS_INTERVENTION`, `UNKNOWN_BRAKING_EVENT`

**Source Priority (Dedupe only):** `DIMO_PROVIDER` → `SYNQDRIVE_HF_BRAKING` → `SYNQDRIVE_HF_ABUSE` → `DERIVED_DECELERATION` → `TRIP_AGGREGATION`

### Korrelation

- Zeitfenster-Bucket (`dedupeWindowMs`)
- Fahrzeug + Trip + Incident-Key
- Severity / Peak-Decel / Provider-Event
- Keine Zusammenführung weit auseinanderliegender Events (strikter Bucket)

### Integration

- `BrakingEventLedgerService.reconcileTrip()` nach LTE_R1 / HF Enrichment
- `DrivingImpactService` nutzt Ledger-Summary für `hardBrakeCount`, `extremeBrakeCount`, `fullBrakingCount`, `brakingEventRows`
- Backfill-Plan: `planBackfill()` (DRY RUN)

### `harshBrakeWearMultiplier`

**Nicht** in `recalculate()` angewendet. Aktive Formel: `lookupSteppedFactor(hardBrakePer100Km, padHardBrakeAnchors|discHardBrakeAnchors)` in `brake-health.service.ts`. Kein zusätzlicher Multiplier in Prompt 15.

### Tests

```bash
npm test -- --testPathPattern='braking-event-ledger'
```

---

## Coverage Gap Policy — No Rolling Temporal Leakage (Prompt 16) — 2026-07-17

### Ziel (P1-BH-38)

Historische Kilometer ohne per-Trip TDI dürfen **nicht** mit dem aktuellen Rolling-30d-`VehicleDrivingImpactCurrent` aufgefüllt werden. Lücken bleiben als Unsicherheit sichtbar.

### Gap-Policy

| Situation | Verhalten |
|-----------|-----------|
| **A** Historische TDI vorhanden | Tatsächliche Trip-Faktoren |
| **B** Distanz bekannt, Verhalten unbekannt | Neutraler Basisverschleiß (Faktoren 1.0), Confidence ↓, Remaining-km-Bandbreite ↑ |
| **C** Distanz unbekannt | `NOT_ENOUGH_DATA` — kein präziser Wear-Forecast |
| **D** Rolling Summary | Nur für aktuellen Zeitraum (Display/Confidence-Hint), **nie** rückwirkend auf Gap-km |

### Neue Felder (`BrakeHealthCurrent`, Migration `20260717210000_brake_coverage_gap_policy`)

- `underCoverageKm`, `overCoverageKm`, `coverageRatioRaw`, `coverageStatus`
- `modelCoverageRatio` speichert jetzt das **ungeclampfte** Verhältnis

### Modellierungsquellen

`OBSERVED` · `MIXED_OBSERVED_NEUTRAL_GAP` · `NEUTRAL_GAP_ONLY` · `INCONSISTENT` · `NOT_ENOUGH_DATA`

Legacy-Werte (`trip_impacts_plus_rolling_gap` etc.) werden beim Lesen via `normalizeModelingSource()` gemappt.

### Overcoverage / Distanzkonflikt

Chronologisches Trip-Capping auf Odometer-Budget; Wear nur auf `allocatedKm`. `overCoverageKm` aus uncapped Trip-Summe; `reconciliationRequired`.

### Domain

`brake-coverage-gap.domain.ts` — `assessBrakeCoverageGap()`, `allocateTripDistancesToOdometerBudget()`, Confidence-/Spread-Multiplier.

### Tests

```bash
npm test -- --testPathPattern='brake-coverage-gap|brake-health.spec'
```

---

## Idempotent Brake Recalculation Orchestrator (Prompt 17) — 2026-07-17

### Ziel

Recalculation queue-sicher, fingerprint-dedupliziert und für alle Trigger zentral orchestriert.

### Architektur

| Komponente | Rolle |
|------------|-------|
| `BrakeRecalculationOrchestratorService` | Einziger Enqueue-Einstieg |
| `dimo.brake.recalculation` (BullMQ) | Dedupe, Retry (3×), Dead-Letter via `removeOnFail` |
| `BrakeRecalculationProcessor` | Worker + Redis-Lock pro Fahrzeug |
| `brake-recalculation-fingerprint.ts` | Kanonischer Input-Hash |
| `BrakeRecalculationInputLoader` | Installations, Anchors, Specs, TDI, Ledger, Evidence, DTC |
| `BrakeHealthObservabilityService` | `synqdrive_brake_recalculation_deduplicated_total` |

### Trigger → Orchestrator

`scheduler` · `post_trip` · `service` · `measurement` · `evidence` · `spec_update` · `backfill` · `manual` · `component_lifecycle` · `initialization`

### Fingerprint-Policy

Identischer Fingerprint → No-op, Metric `deduplicated`. `force` + `reason` → `brake_recalculation_audit`.

### Tests

```bash
npm test -- --testPathPattern='brake-recalculation|brake-health.spec|brake-lifecycle-regression'
```

---

## Versioned Brake Health Prediction Snapshots (Prompt 18) — 2026-07-17

### Ziel

Historisch nachvollziehbare Prediction-Historie und Modellversionierung. `BrakeHealthCurrent` bleibt das aktuelle Read Model; jede neue Prediction wird als unveränderlicher Snapshot gespeichert.

### Schema

| Tabelle / Feld | Rolle |
|----------------|-------|
| `brake_health_snapshots` | Immutable prediction history per vehicle |
| Unique `(vehicle_id, model_version, input_fingerprint)` | Dedupe — kein Snapshot-Overwrite |
| `brake_evidence.prediction_snapshot_id` | Messung verweist auf letzten zulässigen Pre-Measurement-Snapshot |

### Modellversion

| Konstante | Wert |
|-----------|------|
| `BRAKE_WEAR_MODEL_VERSION` | `brake-wear-v2` |
| `computeBrakeWearModelConfigHash()` | Sectioned deterministic config hash |
| `BRAKE_WEAR_MODEL_CONFIG_REGISTRY` | Reproduzierbare Model+Config-Kombinationen |

### Services

| Service | Rolle |
|---------|-------|
| `BrakeHealthService.persistHealthSnapshot()` | Snapshot nach erfolgreicher Recalculation |
| `BrakePredictionValidationService` | `findPreMeasurementSnapshot()` + Evidence-Link |
| `BrakeHealthReplayService` | Read-only As-of-Replay (`REPRODUCED_FROM_SNAPSHOT` / `RECOMPUTED` / `NOT_REPRODUCIBLE` / `NO_DATA`) |
| `BrakeRecalculationInputLoader.loadAsOf()` | Historische Inputs ohne Future Leakage |

### Replay-Policy

- Damalige Installationen, Specs, Thresholds, Trips/TDI, Events, Evidence
- Keine spätere Kalibrierung (`kFactor`/`calibrationCount` vor `lastRecalculatedAt`)
- Keine aktuelle Rolling Summary im Preview-Pfad
- Unbekannte historische Config → `NOT_REPRODUCIBLE` (keine heutige Formel als historische Wahrheit)

### Tests

```bash
npm test -- --testPathPattern='brake-health-snapshot|brake-health-replay|brake-wear-model-version|brake-prediction-validation|brake-recalculation-input.loader'
```

---

## Commit-Log (Remediation)

| Prompt | Commit | Message |
|--------|--------|---------|
| 1 | `b12599f5da380f9740a8e44dc6d43f88351bdaa6` | `docs(brakes): establish production readiness remediation baseline` |
| 2 | `b1246a886d62892abd605617f39e007871663994` | `test(brakes): capture brake health lifecycle regressions` |
| 3 | `b892b605d2380f99c1c2e8972f7ec7d4643a1bb2` | `fix(brakes): establish canonical brake initialization workflow` |
| 4 | `e8e62310775a10b06c0846f8b293393ddd8ce1e5` | `fix(brakes): materialize brake health during vehicle registration` |
| 5 | `a30ea31d943ba49e279d43912265684678cd7fd4` | `feat(brakes): add read-only brake baseline backfill audit` |
| 6 | `39c7e176226328be215dc1046f6e34fa56460d42` | `feat(brakes): add brake component installation lifecycle` |
| 7 | `7617ba59b296ef2db27b413f56534fea7ce2f9f4` | `feat(brakes): centralize brake component lifecycle mutations` |
| 8 | `43fbb3e6` | `fix(brakes): enforce component-specific brake service scope` |
| 9 | `8ef69289` | `fix(brakes): apply brake service lifecycle atomically` |
| 10 | `0de2caa3` | `feat(brakes): add brake reference spec provenance and thickness semantics` |
| 11 | `f3fc1faf` | `fix(brakes): use component-specific brake wear thresholds` |
| 12 | `10faa38b` | `feat(brakes): add controlled brake component baseline backfill` |
| 13 | *(dieser Commit)* | `fix(brakes): make trip driving impact coverage authoritative` |
| 14 | *(dieser Commit)* | `fix(brakes): ingest DIMO native braking events reliably` |
| 15 | *(dieser Commit)* | `feat(brakes): add canonical braking event ledger and deduplication` |
| 16 | *(dieser Commit)* | `fix(brakes): remove temporal leakage from brake coverage gaps` |
| 17 | *(dieser Commit)* | `fix(brakes): make brake recalculation idempotent and concurrency safe` |
| 18 | *(dieser Commit)* | `feat(brakes): add versioned brake health prediction snapshots` |

---

## Constraints (alle Prompts)

- Keine Produktions-Writes ohne expliziten supervised Prompt
- Keine Brake-Recalculation gegen Produktion in Baseline-Prompts
- Keine DIMO-Schreiboperationen
- Keine Tests abschwächen
- Audit-Artefakte unter `docs/audits/` unverändert lassen (nur Implementation-Docs)
