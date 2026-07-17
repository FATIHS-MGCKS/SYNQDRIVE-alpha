# Brake Health Production-Readiness Audit — July 2026

| Field | Value |
|-------|-------|
| **Audit ID** | `brake-health-production-readiness-2026-07` |
| **Repository** | [SYNQDRIVE-alpha](https://github.com/FATIHS-MGCKS/SYNQDRIVE-alpha) |
| **Branch** | `audit/brake-health-production-readiness-2026-07` |
| **Phase** | **4 of 7 — DIMO Brake Signal Timeseries Analysis** |
| **Status** | Phases 1–4 complete; Phases 5–7 pending |
| **Production-Readiness verdict (preliminary)** | **`NOT_READY`** — fleet has zero initialized brake baselines |
| **Production data modified** | **No** — all VPS/DB access was read-only |
| **Analysis window (VPS)** | 60 days ending 2026-07-17 UTC |
| **Fleet scope** | 6 vehicles (anonymized `VEHICLE_001`–`VEHICLE_006`) |

---

## Executive summary (Phase 1)

The Brake Health module is a **well-structured V2 domain** in `vehicle-intelligence/brakes/` with clear separation between **mutations** (`BrakeLifecycleService`), **wear mathematics** (`BrakeHealthService` + `brake-health.config.ts`), **evidence** (`BrakeEvidenceService`), and **canonical read models** (`buildCanonicalReadModel` + shared `brake-status.ts`). Production runtime on the SynqDrive VPS runs as a **single PM2 process** (`synqdrive`) hosting the NestJS API, BullMQ workers, and `@Interval` schedulers in-process.

**Critical Phase-1 finding:** Despite **355 `trip_driving_impact` rows** in the last 60 days and **5 `vehicle_brake_reference_specs`**, production has **`brake_health_current = 0`**, **`brake_evidence = 0`**, and **`brake_service_events (BRAKE_SERVICE) = 0`**. The wear pipeline cannot produce fleet-visible brake health until registration backfill or manual initialize/service runs. Six `vehicle_enrichment_jobs` with `job_type = BRAKE` sit **`PENDING`** with **no processor** in the codebase.

| Area | Observation | Preliminary risk |
|------|-------------|------------------|
| Fleet initialization | 0/6 vehicles have `BrakeHealthCurrent` | **P0** — module inactive in production |
| Registration → init | Specs exist (5/6) but init/backfill not applied | **P0** |
| Trip → brake wear | `DrivingImpactProcessor` calls `recalculate` after each trip DI | **Low** (works only when initialized) |
| Recalculation scheduler | Hourly inline sweep, no BullMQ dedupe/locks | **Medium–High** |
| k-factor calibration | Config + schema fields exist; **no runtime calibrate*** | **P0** |
| Harsh-brake multiplier | Implemented in `brake-status.ts` but **not wired** into `recalculate` | **P0** |
| Evidence producers | Only lifecycle + AI upload; no DTC/sensor/DIMO paths | **P0** |
| `BrakeTripMetric` | Schema exists; **zero writers/readers** | **P0** (orphan) |
| Rental gate | `RentalHealthService.evaluateBrakes` read-only consumer of canonical summary | **Low** (blocked when uninitialized → unknown) |
| Test coverage | Strong wear-math + canonical honesty; weak worker/ops paths | **Medium** |

---

## Audit constraints (all 7 phases)

### Allowed

- Repository read, tests, read-only PostgreSQL / ClickHouse / DIMO MCP queries
- Read-only audit scripts; anonymized aggregated artifacts in Git
- This documentation

### Not allowed

- Production writes, migrations, recalculations against production, brake evidence/anchor mutations
- Worker/infra/config changes, secret output, PII in Git (VIN, plates, GPS, customer names)

### Vehicle anonymization

Stable public identifiers: `VEHICLE_001`, `VEHICLE_002`, … assigned by **sorted internal UUID** (mapping **not** stored in Git).

---

## Document map

| Artifact | Path | Phase |
|----------|------|-------|
| Main report | `docs/audits/brake-health-production-readiness-2026-07.md` | 1–7 |
| Code map CSV | `docs/audits/data/brake-health-code-map-2026-07.csv` | 1 |
| Fleet coverage CSV | `docs/audits/data/brake-health-fleet-coverage-2026-07.csv` | 1 / 3 |
| Anchor integrity CSV | `docs/audits/data/brake-health-anchor-integrity-2026-07.csv` | 3 |
| Service scope replay CSV | `docs/audits/data/brake-health-service-scope-replay-2026-07.csv` | 3 |
| Trip model coverage CSV | `docs/audits/data/brake-health-trip-model-coverage-2026-07.csv` | 3 |
| Evidence classification CSV | `docs/audits/data/brake-health-evidence-classification-2026-07.csv` | 3 |
| Integrity findings JSON | `docs/audits/data/brake-health-integrity-findings-2026-07.json` | 3 |
| Audit script | `scripts/audits/audit-brake-health-production-readiness.ts` | 1+ |
| Formula factor map CSV | `docs/audits/data/brake-health-formula-factor-map-2026-07.csv` | 2 |
| Reference spec map CSV | `docs/audits/data/brake-health-reference-spec-map-2026-07.csv` | 2 |
| Lifecycle & evidence map CSV | `docs/audits/data/brake-health-lifecycle-evidence-map-2026-07.csv` | 2 |
| DIMO signal capability CSV | `docs/audits/data/brake-health-dimo-signal-capability-2026-07.csv` | 4 |
| DIMO timeseries coverage CSV | `docs/audits/data/brake-health-dimo-timeseries-coverage-2026-07.csv` | 4 |
| DIMO braking correlation CSV | `docs/audits/data/brake-health-dimo-braking-correlation-2026-07.csv` | 4 |
| DIMO audit script | `scripts/audits/audit-brake-health-dimo-signals.ts` | 4 |
| Backtest summary CSV | `docs/audits/data/brake-health-backtest-summary-2026-07.csv` | 5 (pending) |
| Consumer wiring CSV | `docs/audits/data/brake-health-consumer-wiring-2026-07.csv` | 6 (pending) |
| Test coverage CSV | `docs/audits/data/brake-health-test-coverage-2026-07.csv` | 6 (pending) |

---

# Seven-phase audit outline

| Phase | Title | Scope | Status |
|-------|-------|-------|--------|
| **1** | Architecture & runtime map | Code landkarte, VPS topology, triggers, data-flow, preliminary P0/P1 | ✅ **Complete** |
| **2** | Data model & formula audit | Prisma models, lifecycle scope, reference-spec, evidence, formulas, versioning | ✅ **Complete** |
| **3** | VPS integrity & fleet coverage | Read-only SQL, anchors, scope replay, trip coverage, evidence | ✅ **Complete** |
| **4** | DIMO & telemetry signal audit | `availableSignals`, brake sensors, DTC, native events, timeseries, SynqDrive persistence | ✅ **Complete** |
| **5** | Historical replay & backtest | As-of replay against measured evidence; MAE/coverage; isolated pure mode | ⏳ Pending |
| **6** | Consumer wiring & ops | Rental health, alerts, blocking, frontend, notifications, performance, test matrix | ⏳ Pending |
| **7** | Final synthesis | Go/no-go verdict, findings register, remediation roadmap | ⏳ Pending |

---

# Phase 1 — Architecture & runtime map

## 1. VPS runtime topology (read-only probe, 2026-07-17 UTC)

| Component | Location | Status | Brake relevance |
|-----------|----------|--------|-----------------|
| **Host** | `srv1374778` (Path A SSH) | Reachable | — |
| **Release** | `/opt/synqdrive/releases/20260717002402_v4994` | Active (`ae60002`) | Deployed brake module code present |
| **PM2 `synqdrive`** | Single fork process | **online** | API + BullMQ workers + `@Interval` schedulers in-process |
| **PM2 `pm2-logrotate`** | Auxiliary | online | — |
| **PostgreSQL** | `localhost:5432` / DB `synqdrive` | **OK** | System of record: `brake_health_current`, `brake_evidence`, specs, service events, `trip_driving_impact` |
| **Redis** | `localhost` db0 | **PONG** | BullMQ backing store |
| **ClickHouse** | `127.0.0.1:8123` | **Unreachable** | HF mirror / CH analytics degraded (same as tire audit) |
| **Docker** | `synqdrive-prometheus`, `synqdrive-grafana` | Up ~19h | Observability read-only |
| **systemd** | No separate brake/dimo unit | — | Monolith in PM2 |
| **Health API** | `https://app.synqdrive.eu/api/v1/health` | `ok` | — |

### 1.1 How brake health is triggered

| Trigger | Mechanism | Sync/async | Writes? | Idempotency |
|---------|-----------|------------|---------|-------------|
| **Trip finalization → driving impact** | BullMQ `trip.driving-impact.compute` → `DrivingImpactProcessor` → `brakeHealthService.recalculate(vehicleId)` | Async worker; recalc awaited in processor | Yes (`brake_health_current`) | **None** — fire-and-forget after DI |
| **Hourly scheduler** | `BrakeRecalculationScheduler` `@Interval(3600000)` | In-process; sequential `for` loop | Yes | **None** — all `isInitialized=true` every hour (0 vehicles today) |
| **Manual API** | `POST /vehicles/:id/brake-health/recalculate` | Sync HTTP | Yes | None |
| **Lifecycle init** | `BrakeLifecycleService.recordService` → `initializeFromService` → `recalculate` | Sync in request | Yes (anchor upsert + recalc) | **Not idempotent** — re-anchors each service |
| **Registration** | `VehiclesService.registerFromDimo` → `initializeFromRegistration` | Sync in registration tx | Yes when init succeeds | Skip if `shouldInitializeBrakesFromRegistration` false or no odometer |
| **Dedicated brake queue** | — | **Does not exist** | — | Tires use `dimo.tire.recalculation` with hour-bucket `jobId` |

### 1.2 Parallelism and locks

- **No `pg_advisory_lock`** or distributed lock on brake recalculation.
- Same vehicle can be recalculated concurrently by: trip DI worker + hourly scheduler + manual API.
- Unlike `TireRecalculationScheduler`, brake scheduler has **no `lastRecalculatedAt` filter** and **no BullMQ dedupe**.

### 1.3 Production table counts (60-day window where noted)

| Table / metric | Count |
|----------------|-------|
| `vehicles` | 6 |
| `brake_health_current` | **0** |
| `brake_health_current` where `is_initialized` | **0** |
| `brake_evidence` | **0** |
| `brake_trip_metrics` | **0** |
| `vehicle_brake_reference_specs` | **5** |
| `vehicle_service_events` (`BRAKE_SERVICE`) | **0** |
| `trip_driving_impact` (60d) | **355** |
| `vehicle_enrichment_jobs` (`BRAKE`, `PENDING`) | **6** |

Fleet per-vehicle coverage: `docs/audits/data/brake-health-fleet-coverage-2026-07.csv`.

---

## 2. Code module inventory

**Root:** `backend/src/modules/vehicle-intelligence/brakes/`

| File | Role |
|------|------|
| `brake-health.service.ts` | Core V2 wear model, `BrakeHealthCurrent` writes, `getSummary`/`getDetail`, `recalculate`, public `computePadWear`/`computeDiscWear` |
| `brake-lifecycle.service.ts` | `recordService`, `initializeFromRegistration`; writes `VehicleServiceEvent` + optional `BrakeEvidence` |
| `brake-evidence.service.ts` | Append-only `BrakeEvidence` with mm-trust rules |
| `brakes.service.ts` | `VehicleBrakeReferenceSpec` CRUD (no auto-init on PATCH) |
| `brake-health.config.ts` | Thresholds, wear rates, confidence, calibration constants (`MODEL_VERSION: 1.0.0`) |
| `brake-status.ts` | Pure classifiers: condition, confidence, alerts, `harshBrakeWearMultiplier` |
| `register-brake-baseline.ts` | Registration baseline: condition, NEW defaults, odometer resolution |
| `brake-registration-backfill.service.ts` | Ops backfill for spec-without-baseline vehicles |
| `dto/brake-mutation.dto.ts` | Validation DTOs |
| `*.spec.ts` | Unit + registration regression tests |

**Related modules (minimum):**

| Path | Brake role |
|------|------------|
| `driving-impact/` | `TripDrivingImpact` compute; `getVehicleImpactForBrake` gap fallback |
| `workers/processors/driving-impact.processor.ts` | Post-trip `recalculate` hook |
| `workers/schedulers/brake-recalculation.scheduler.ts` | Hourly fleet recalc |
| `trips/` | Trip finalization → enrichment orchestrator → DI queue |
| `dimo/`, `high-mobility/` | Telemetry ingestion → `vehicle_latest_state`, HM cache (not directly consumed by brake wear today) |
| `rental-health/` | `evaluateBrakes`, `isBrakeBlockWorthy` |
| `notifications/`, `business-insights/detectors/brake-critical.detector.ts` | `BRAKE_CRITICAL` insights → notifications |
| `document-extraction/` | AI BRAKE document apply → lifecycle + evidence |
| `vehicles/vehicles.service.ts` | Registration spec + `initializeFromRegistration` + orphan `EnrichmentJobType.BRAKE` |
| `frontend/src/` | `brakeHealthSummary`/`Detail`, HealthErrorsView, FleetCondition, vehicle-health-box |

Full symbol-level map: **`docs/audits/data/brake-health-code-map-2026-07.csv`** (72 rows).

---

## 3. End-to-end data flow

```
Fahrzeugregistrierung (registerFromDimo)
  → VehicleBrakeReferenceSpec (pad/disc dimensions)
  → BrakeLifecycleService.initializeFromRegistration
      → VehicleServiceEvent (BRAKE_SERVICE, REGISTRATION source)
      → optional BrakeEvidence (user-submitted mm only)
      → BrakeHealthService.initializeFromService (anchor upsert)
      → recalculate

Manueller Service / AI-Dokument
  → BrakeLifecycleService.recordService
      → VehicleServiceEvent + BrakeEvidence
      → initializeFromService → recalculate

Trip Finalisierung
  → Trip enrichment orchestrator
  → BullMQ trip.driving-impact.compute
  → DrivingImpactService.computeForTrip → TripDrivingImpact row
  → VehicleDrivingImpactCurrent rollup (gap fallback)
  → BrakeHealthService.recalculate (non-blocking)

Wear model (recalculate)
  → Read anchor from BrakeHealthCurrent
  → Sum TripDrivingImpact since anchorServiceDate
  → Gap km via getVehicleImpactForBrake
  → computePadWear / computeDiscWear per axle (bias × usage × DI metrics × kFactor)
  → computeConfidence, computeAlerts (legacy hasAlert)
  → UPDATE brake_health_current

Canonical read (every API call)
  → buildCanonicalReadModel
      → merge wear estimates + post-anchor BrakeEvidence
      → openAlerts (CRITICAL requires real safety signal)
      → overallCondition, dataBasis, confidence

Consumers
  → RentalHealthService.evaluateBrakes → booking gate
  → BrakeCriticalDetector → Insights → Notifications (brake-health-warning)
  → HealthErrorsView / FleetCondition / VehicleHealthBox / Insights / DataAnalyse
```

### 3.1 Per-step documentation (selected)

| Step | File / symbol | Input | Output | Unit | Data source | Writes | Trigger |
|------|---------------|-------|--------|------|-------------|--------|---------|
| Reference spec | `BrakesService.create`, `vehicles.service` registration | Pad/disc mm, rotor dims | `VehicleBrakeReferenceSpec` | mm | Manual / registration form | Yes | Register, API POST |
| Service event | `BrakeLifecycleService.recordService` | Date, odometer, kind, scope, measured mm | `VehicleServiceEvent` | km, mm | User / workshop / AI | Yes | API, registration, AI apply |
| Evidence | `BrakeEvidenceService.record` | Source, axle, mm, flags | `BrakeEvidence` | mm | Manual, AI (trusted only) | Yes | After service with measurements |
| Anchor | `BrakeHealthService.initializeFromService` | Service anchor fields | `BrakeHealthCurrent` upsert | mm, km | Service event + spec fallback | Yes | After recordService |
| Trip impact | `DrivingImpactService.computeForTrip` | Trip telemetry + behavior | `TripDrivingImpact` | km, scores | Trips, HF enrichment | Yes | DI queue |
| Wear | `BrakeHealthService.recalculate` | Anchor + trips + rolling DI | Updated `BrakeHealthCurrent` | mm, %, km | PG tables above | Yes | DI, scheduler, API, init |
| Canonical | `buildCanonicalReadModel` | State + evidence list | `BrakeCanonicalReadModel` | — | PG read | No | Every getSummary/getDetail |
| Rental | `RentalHealthService.evaluateBrakes` | `BrakeHealthSummaryDto` | `ModuleHealth` | — | Summary API | No | getVehicleHealth |
| Block | `isBrakeBlockWorthy` | Summary | boolean | — | Canonical condition + alerts | No | Booking gate |

**Transaction boundaries:** Lifecycle `recordService` creates service event then calls `initializeFromService` (separate upsert). Evidence writes are best-effort in same flow. `recalculate` is a single-vehicle Prisma update without explicit transaction wrapping trip reads.

**Error handling:** `DrivingImpactProcessor` catches brake recalc errors and logs warning — trip analysis status unaffected. Scheduler catches per-vehicle errors and continues loop.

---

## 4. Prisma models — read/write matrix

| Model | Written by | Read by | Production rows |
|-------|------------|---------|-----------------|
| `VehicleBrakeReferenceSpec` | Registration, `BrakesService` | `initializeFromService`, `getDetail`, legacy `brake-status` | 5 |
| `VehicleServiceEvent` (`BRAKE_SERVICE`) | `BrakeLifecycleService`, AI apply | History, canonical last-service | 0 |
| `BrakeEvidence` | Lifecycle, document-extraction | `buildCanonicalReadModel` | 0 |
| `BrakeTripMetric` | **Nothing** | **Nothing** | 0 (orphan) |
| `BrakeHealthCurrent` | `initializeFromService`, `recalculate` | Summary, rental-health, detector | 0 |
| `TripDrivingImpact` | `DrivingImpactService` | `recalculate` | 355 (60d) |
| `VehicleDrivingImpactCurrent` | DI rollup | `getVehicleImpactForBrake` | (not counted Phase 1) |
| `VehicleEnrichmentJob` (`BRAKE`) | `registerFromDimo` | **No processor** | 6 PENDING |

---

## 5. Integration wiring (preliminary)

| Consumer | Entry point | Uses canonical? | Notes |
|----------|-------------|-----------------|-------|
| Rental Health | `rental-health.service.ts` → `brakes.getSummary` | ✅ | Uninitialized → unknown/good mapping; blocking only on CRITICAL + evidence rules |
| Booking gate | `BookingsService` → rental health | ✅ indirect | No brake-specific override |
| Notifications | `BRAKE_CRITICAL` → `brake-health-warning` | Partial | Via insights detector |
| Task automation | `BRAKE_CRITICAL_HEALTH` rule | Partial | Links to `BRAKE_CHECK` template |
| Health tab | `health-summary.service.ts` | ✅ | Includes brake module |
| Fleet UI | `FleetConditionView`, health box mapper | ✅ | Lazy-load summary/detail |
| Legacy API | `GET /vehicles/:id/brake-status` | ❌ | Deprecated heuristic; `_deprecated: true` |
| DIMO brake signals | — | ❌ | Not ingested into `BrakeEvidence` in current code |

---

## 6. Preliminary findings register (Phase 1)

### P0 — suspected production blockers

| ID | Finding | Evidence |
|----|---------|----------|
| **P0-BH-01** | **Fleet-wide zero `brake_health_current`** — wear pipeline never materialized | VPS: 0 rows; 355 trip DI rows unused |
| **P0-BH-02** | **Registration init/backfill not applied** — 5 specs, 0 service events, 0 evidence | VPS counts; backfill script exists but not run in audit |
| **P0-BH-03** | **`EnrichmentJobType.BRAKE` queued with no processor** | 6 PENDING jobs; grep shows create only in `vehicles.service.ts` |
| **P0-BH-04** | **k-factor calibration not implemented** | `calibrationCount`/k-factors reset on init only; no `calibrate*` in brakes module |
| **P0-BH-05** | **`harshBrakeWearMultiplier` not applied in `recalculate`** | Only in `brake-status.ts` tests; wear uses separate `hardBrakePer100Km` steps |
| **P0-BH-06** | **No DTC / wear-sensor / DIMO evidence producers** | Only lifecycle + AI upload write `BrakeEvidence` |
| **P0-BH-07** | **`BrakeTripMetric` orphan schema** | Zero read/write in codebase |
| **P0-BH-08** | **No recalc dedupe or locking** | Contrast `tire-recalculation.scheduler.ts`; race on concurrent recalc |

### P1 — correctness / maintainability

| ID | Finding | Evidence |
|----|---------|----------|
| **P1-BH-01** | Dual alert paths: `computeAlerts` → `hasAlert` vs `buildCanonicalReadModel.openAlerts` | Different semantics |
| **P1-BH-02** | `BrakeCriticalDetector` parallels canonical logic — drift risk | ~200 LOC separate from `buildCanonicalReadModel` |
| **P1-BH-03** | `getLatestMeasurement` / `getLatestSafetySignal` unused | `listRecent(40)` on every summary |
| **P1-BH-04** | Spec PATCH does not re-init health | `BrakesService.update` only |
| **P1-BH-05** | USED registration without odometer may skip init | `resolveRegistrationBrakeOdometerKm` returns null |
| **P1-BH-06** | Legacy `/brake-status` still active | Deprecated but served |
| **P1-BH-07** | ClickHouse down — HF-dependent DI quality degraded | CH probe failed; aligns with driving-analysis audit |
| **P1-BH-08** | Re-service re-anchors blindly (resets k-factors, distance) | `initializeFromService` upsert semantics |

---

# Phase 2 — Data model, lifecycle, evidence & formula audit

## 1. Datenmodell — 17 Kernfragen

### 1.1 Komponentenidentitäten

| Komponente | Eigene Identität? | Speicherort | Revisionssicher? |
|------------|-------------------|-------------|------------------|
| Vordere Beläge | **Nein** — Skalar `frontPadAnchorMm` | `BrakeHealthCurrent` | Nein — überschrieben bei Re-Init |
| Hintere Beläge | **Nein** — `rearPadAnchorMm` | `BrakeHealthCurrent` | Nein |
| Vordere Scheiben | **Nein** — `frontDiscAnchorMm` | `BrakeHealthCurrent` | Nein |
| Hintere Scheiben | **Nein** — `rearDiscAnchorMm` | `BrakeHealthCurrent` | Nein |

Es gibt **keine** `BrakeComponent`-Entität, keine Part-IDs, keine Installationshistorie pro Komponente. `BrakeEvidence` speichert optional `wheelPosition`, wird aber in der Praxis nur auf **Achsenebene** (`FRONT`/`REAR`) geschrieben.

**Finding:** **P0-BH-09** — Achs-Skalarmodell ohne Komponenten-Lifecycle.

### 1.2 Teilreparatur revisionssicher?

**Nein.** `VehicleServiceEvent` ist append-only (Historie), aber `BrakeHealthCurrent` ist **ein mutable Snapshot** pro Fahrzeug. Bei jedem `initializeFromService`-Upsert werden alle Anker, k-Faktoren, `calibrationCount`, `distanceSinceAnchorKm` und Prognosefelder **überschrieben**. Ältere Prognosen sind nicht reproduzierbar (kein `BrakeHealthSnapshot`).

### 1.3 Front-Pads-Austausch ohne Reset der übrigen Komponenten?

**Nein — bestätigt im Code.** `recordService` speichert `scope` im Service-Event, übergibt `kind`/`scope` aber **nicht** an `initializeFromService`. Init setzt immer alle vier Anker:

```515:519:backend/src/modules/vehicle-intelligence/brakes/brake-health.service.ts
    const frontPadAnchor = measured.frontPadMm ?? this.normalizePositive(spec?.frontPadThickness);
    const rearPadAnchor = measured.rearPadMm ?? this.normalizePositive(spec?.rearPadThickness);
    const frontDiscAnchor =
      measured.frontDiscMm ?? this.normalizePositive(spec?.frontRotorWidth);
    const rearDiscAnchor = measured.rearDiscMm ?? this.normalizePositive(spec?.rearRotorWidth);
```

Fehlende Messwerte werden aus `VehicleBrakeReferenceSpec` befüllt — auch für **nicht** im `scope` genannte Komponenten.

**Finding:** **P0-BH-10**, **P0-BH-11**.

### 1.4 Eigene Installationszeit / -km / Ausgangsstärke / Source / Modellversion / Service-Referenz?

| Feld | Pro Komponente? | Vorhanden? |
|------|-----------------|------------|
| Installationszeit | Nein (global) | `anchorServiceDate` auf Set-Ebene |
| Installations-km | Nein (global) | `anchorOdometerKm` |
| Ausgangsstärke | Achs-Skalar | `*AnchorMm` je Achse/Komponententyp |
| Source | Global | `anchorValidationStatus` (`measured_anchor` / `spec_fallback_anchor`) |
| Modellversion | Global | `modelVersion` (nur bei Init gesetzt) |
| Service-Referenz | Event-Historie | `VehicleServiceEvent.id`; **nicht** auf `BrakeHealthCurrent` |

### 1.5 Verhalten nach Service-Art

| Service-Art | `allowsSpecFallback` | Init ohne Messung? | Scope beachtet? |
|-------------|---------------------|-------------------|-----------------|
| **Nur vordere Beläge** (`pads_service` + `front_pads`) | Ja | Ja — Spec füllt fehlende Achsen | **Nein** |
| **Nur hintere Beläge** | Ja | Ja | **Nein** |
| **Nur eine Scheibe** (`discs_service` + scope) | Ja | Ja | **Nein** |
| **Beläge + Scheiben gleiche Achse** | Ja | Ja | **Nein** |
| **Brake Fluid** (`brake_fluid_service`) | **Nein** | Nur mit Messwerten | N/A |
| **Inspection Only** (`inspection_only`) | **Nein** | Nur mit Messwerten | N/A |
| **Full Brake Service** | Ja | Ja mit Spec-Fallback | **Nein** |

### 1.6 Historische Nachvollziehbarkeit

| Artefakt | Historie? |
|----------|-----------|
| `VehicleServiceEvent` | ✅ Append-only |
| `BrakeEvidence` | ✅ Append-only; canonical filtert pre-anchor |
| `BrakeHealthCurrent` | ❌ Überschreibt Zustand |
| Wear-Prognose-Snapshots | ❌ Nicht vorhanden |
| `TripDrivingImpact` | ✅ Immutable pro Trip |

### 1.7 Kann späteres Service-Event frühere Evidence überschreiben?

**Semantisch ja, physisch nein.** Evidence-Rows bleiben in DB; `buildCanonicalReadModel` ignoriert Evidence mit `measuredAt < anchorServiceDate`. Ein neuer Service-Anchor macht alte Messungen für die UI **wirkungslos**, ohne sie zu löschen oder als „resolved“ zu markieren.

### 1.8 Organisation / Fahrzeug in Queries

- API: `@Controller('vehicles/:vehicleId')` + `VehicleOwnershipGuard` → Org-Zugriff über Fahrzeug.
- Interne Queries: **`vehicleId` only**; `organizationId` auf `BrakeHealthCurrent` wird bei Init gesetzt, aber nicht in WHERE-Klauseln geprüft.
- Backfill-Service: optionaler `organizationId`-Filter.

---

## 2. Service-Scope — bestätigter Verdacht

### 2.1 Antworten auf die 10 Prüffragen

| # | Frage | Ergebnis | Evidenz |
|---|-------|----------|---------|
| 1 | Werden `kind`/`scope` an Init übergeben? | **Nein** | `recordService` L121-128: nur mm + odometer + date |
| 2 | Nur ersetzte Komponenten neu verankert? | **Nein** | Immer alle vier Felder upserted |
| 3 | Front-Pads-Service init alle vier? | **Ja, wenn Spec existiert** | Spec-Fallback für null-Messwerte |
| 4 | Service ohne Messwerte → Spec für nicht ersetzte? | **Ja** | `allowsSpecFallback` für pads/discs/full |
| 5 | Gemessene Anker durch Spec überschrieben? | **Nein pro Feld** — measured gewinnt | `measured ?? spec` Coalesce |
| 6 | k-Faktoren nicht betroffener Komponenten reset? | **Ja — alle auf 1.0** | Update L615-618 |
| 7 | `calibrationCount` bei Teilservice reset? | **Ja — immer 0** | Update L619 |
| 8 | Reine Inspektion? | Historie only, kein Init ohne mm | `allowsSpecFallback=false` |
| 9 | Brake Fluid Service? | Historie only, kein Init ohne mm | `allowsSpecFallback=false` |
| 10 | Transaktional? | **Nein** | Event create → init → event update; Evidence separat |

### 2.2 Code-Reproduktionsfälle (keine Prod-Mutation)

**Fall A — Front-Pads only mit Spec:**

```
Input:  kind=pads_service, scope=[front_pads], measured={frontPadMm:12}
Spec:   rearPadThickness=10, frontRotorWidth=25, rearRotorWidth=20
Ergebnis: frontPadAnchor=12 (measured), rearPadAnchor=10 (spec!),
          frontDiscAnchor=25 (spec!), rearDiscAnchor=20 (spec!)
          kFactors alle 1.0, calibrationCount=0, distanceSinceAnchor=0
```

**Fall B — Re-Service nach Kalibrierung (hypothetisch):**

```
Vorher: frontPadKFactor=1.15, calibrationCount=5
Input:  pads_service front_pads only
Ergebnis: frontPadKFactor→1.0, calibrationCount→0 (auch wenn k-Calibration existierte)
```

**Fall C — Inspection only ohne mm:**

```
Input: kind=inspection_only, measured={}
Ergebnis: Service-Event gespeichert, initializeIfPossible übersprungen
          (allowsSpecFallback=false, hasMeasuredBaseline=false)
```

---

## 3. Reference-Spec-Audit

Vollständige Feldmatrix: `docs/audits/data/brake-health-reference-spec-map-2026-07.csv`.

### 3.1 Konfliktauflösung

1. **Gemessene mm** im Service-Input (höchste Priorität pro Feld)
2. **`VehicleBrakeReferenceSpec`** für null-Felder
3. **Registrierungs-Default** 10 mm Pads bei `NEW` (`applyNewBrakeDefaults`)
4. **Globale Config** (`pad.criticalMm`, `disc.maxWearMm`)

`sourceType` ist **freier String** (`manual_registration`, etc.) — kein Enum, keine Confidence.

### 3.2 Kritische Spec-Lücken

| Fehlend | Risiko |
|---------|--------|
| Min. Scheibendicke (OEM) | Generisches `maxWearMm=2.0` für alle |
| `frontRotorWidth` als Disc-Anchor | **Breite ≠ Verschleißdicke** (**P0-BH-14**) |
| Trommelbremse / EPB / Keramik | Alle als Scheibenmodell behandelt |
| Part-Identität / Material | Kein Lifecycle möglich |
| Gültigkeitszeitraum Spec | Alte Specs ewig gültig |

### 3.3 Formelrelevante Spec-Felder

| Feld | Formeleinfluss |
|------|----------------|
| `frontPadThickness` / `rearPadThickness` | Pad-Anker, usableMm, healthPct |
| `frontRotorWidth` / `rearRotorWidth` | **Fälschlich** als Disc-Anker |
| `frontRotorDiameter` / `rearRotorDiameter` | **Nicht verwendet** |
| `Vehicle.brakeForceFrontPercent` | Bias-Aufteilung |
| `Vehicle.fuelType` | Statischer Reku-Faktor |

---

## 4. Evidence-Audit

### 4.1 Sources — Produktionsrealität

| Source | mm erlaubt? | Producer in Code? | Bestätigung nötig? |
|--------|-------------|-------------------|-------------------|
| `MANUAL_MEASUREMENT` | Ja | Lifecycle manual/api/registration | Nein — auto HIGH |
| `WORKSHOP_REPORT` | Ja | Lifecycle manual | Nein |
| `AI_UPLOAD` | Ja | document-extraction-apply | **Ja** — User CONFIRMED/APPLIED |
| `SERVICE_INVOICE` | Ja (trusted) | **Kein Producer** | — |
| `INSPECTION_PROTOCOL` | Ja (trusted) | **Kein Producer** | — |
| `DTC_SIGNAL` | Nein (severity only) | **Kein Producer** | — |
| `BRAKE_WEAR_SENSOR` | Ja | **Kein Producer** | — |
| `TELEMATICS_ESTIMATION` | **Nein** — mm gestrippt | **Kein Producer** | — |

### 4.2 Evidence-Fragen (Kurzantworten)

| # | Antwort |
|---|---------|
| 1 | mm nur aus `MM_TRUSTED_SOURCES`; TELEMATICS strippt mm |
| 2 | AI: ja, nur nach User-Bestätigung (`applyBrake` nach CONFIRMED) |
| 3 | Ungeprüftes OCR: nein im Apply-Pfad; Plausibility nicht blockierend vor Storage |
| 4 | Manuelle Registrierung: **HIGH** Confidence automatisch |
| 5 | Speicherung **pro Achse** (`FRONT`/`REAR`); `wheelPosition` optional ungenutzt |
| 6 | Achsenwert kann wie Radmessung erscheinen — keine 4-Rad-Trennung |
| 7 | **Keine Dedupe-Keys** |
| 8 | Retries können **duplizieren** (`createMany` ohne Unique) |
| 9 | **Kein** Active/Resolved/Expires/Stale auf Evidence |
| 10 | DTC-Behebung: `VehicleDtcEvent.isActive=false` — **kein** BrakeEvidence-Update |
| 11 | `getLatestSafetySignal()` ungenutzt; würde nur **einen** Datensatz liefern |
| 12 | **Jeder nicht-leere** `dtcSeverity`-String zählt als Safety Signal |
| 13 | `dtcSeverity` ist **freier Text** (`String?`), klassifiziert via `toUpperCase()` switch |
| 14 | `immediateReplacement=true` bleibt **dauerhaft** bis post-anchor gefiltert |
| 15 | Evidence + Service Event **nicht atomar** (separate Writes) |

### 4.3 Empfohlene Evidence-Hierarchie (Audit-Empfehlung, nicht implementiert)

```
Stufe 1 — MEASURED:   Workshop/manual mm mit Odometer + Datum
Stufe 2 — DOCUMENTED:  AI_UPLOAD / Invoice / Inspection (bestätigt)
Stufe 3 — SENSOR:      BRAKE_WEAR_SENSOR / DTC_SIGNAL (severity, kein mm)
Stufe 4 — ESTIMATED:   Wear-Modell (nie CRITICAL allein)
Stufe 5 — UNKNOWN:     Kein Anchor
```

Auflösungsregeln: neuere post-anchor Evidence > ältere; cleared DTC → SENSOR resolved; `immediateReplacement` mit Expiry; TELEMATICS nie mm.

---

## 5. Formelaudit

Vollständige Faktor-Tabelle: `docs/audits/data/brake-health-formula-factor-map-2026-07.csv` (42 Faktoren).

### 5.1 Zentrale Formeln

**Pad usable:** `usableMm = anchorMm - 2.0` (global `pad.criticalMm`)

**Pad rate:** `effectiveWearPerKm = (usableMm/70000) × (biasShare/0.72) × Π(factors) × kFactor`

**Disc rate:** `effectiveWearPerKm = (2.0/90000) × (biasShare/0.72) × Π(factors) × kFactor` — **nicht** ankerabhängige Max-Wear

**Set health:** `0.6 × min(axlePcts) + 0.4 × avg(axlePcts)` — kann kritische Achse maskieren (**P1-BH-36**)

### 5.2 Einheiten-Prüfung

| Größe | Einheit im Code | Problem? |
|-------|-----------------|----------|
| mm (Pads/Discs) | mm | ✅ |
| km | km | ✅ |
| kPa/bar | — | Nicht in Brake-Modul |
| m/s² | DI `p95NegativeDecel` | Nicht direkt in Brake-Formel |
| Prozent health | 0–100 | ✅ (nicht 0–1) |
| `highSpeedBrakeShare` | 0–1 in DB, ×100 für Anker | ✅ korrekt konvertiert |
| `brakeForceFrontPercent` | 0–100 → /100 | ✅ |

### 5.3 Spezialprüfungen (20 Punkte)

| # | Thema | Ergebnis |
|---|-------|----------|
| 1 | mm/km/% | Konsistent |
| 2 | Prozent 0–100 | Ja für healthPct |
| 3 | Negative Distanz | `max(0, odo-anchor)` |
| 4 | Odometer-Rücksprung | Kein expliziter Rollback-Guard; max(0) hilft teilweise |
| 5 | distanceSinceAnchor=0 | Health 100% am Anchor — korrekt |
| 6 | Trip km > Odometer delta | Gap=0 wenn trips>odo; sonst rolling fill |
| 7 | Rear bias / defaultFront | Absichtliche Normalisierung |
| 8 | baseLifeKm | **Gesamtfahrzeug-Life**, auf Achsen verteilt |
| 9 | Generische 2mm Scheibe | **P1-BH-30** |
| 10 | Warn/kritisch | Pad 3.0/2.0 mm; Disc relativ zu anchor-2.0 |
| 11 | Disc-Minimum | `anchor - maxWear(2.0)` nicht OEM |
| 12 | EV Reku | Statisch `fuelType` Map |
| 13 | Statische Reku | Keine echte Rekuperationsmessung |
| 14 | Doppelte Braking Events | DI berechnet pro Trip; kein doppeltes Zählen in Brake-Loop |
| 15 | Rolling Gap | Aktueller 30d-Rollup für historische Lücken |
| 16 | Confidence trotz Spec-Fallback | Anchor-Punkte (+20 Pad, +10 Disc) auch bei DOCUMENTED |
| 17 | Set-Average | **P1-BH-36** |
| 18 | Remaining-km Range | `buildRemainingKmRange` mit Spread — honest |
| 19 | k-Factor Clamps | Config 0.70–1.35 — **nie angewendet** (kein calibrate) |
| 20 | Calibration Future Leakage | N/A — nicht implementiert |

---

## 6. Modellversionierung

| Mechanismus | Vorhanden? | Details |
|-------------|------------|---------|
| `modelVersion` | Teilweise | `BrakeHealthCurrent.modelVersion` + `TripDrivingImpact.modelVersion`; nur bei Init geschrieben |
| Config-Version | Konstante | `BRAKE_HEALTH_CONFIG.MODEL_VERSION = '1.0.0'` |
| Config Hash | **Nein** | — |
| Input Fingerprint | **Nein** | (Tires haben `inputFingerprint` auf Snapshots) |
| Snapshot-Historie | **Nein** | Kein `BrakeHealthSnapshot` |
| Prediction Timestamp | `lastRecalculatedAt` | Nur letzter Lauf |
| Trip IDs verwendet | **Nein** | Nicht persistiert |
| Evidence IDs verwendet | **Nein** | — |
| Calibration-Version | **Nein** | `calibrationCount` existiert, wird nie erhöht |

**As-of-Replay:** **Nicht möglich** ohne manuelles Rekonstruieren aus `TripDrivingImpact` + Evidence + Config-Stand. **Finding P0-BH-13**.

---

## 7. Phase-2 Findings Register (neu / bestätigt)

### P0 — bestätigt in Phase 2

| ID | Finding | Status |
|----|---------|--------|
| **P0-BH-09** | Keine Komponentenidentitäten — 4 Achs-Skalare only | **CONFIRMED** |
| **P0-BH-10** | `kind`/`scope` nicht an Init; Teilservice re-init aller Komponenten | **CONFIRMED** |
| **P0-BH-11** | Spec-Fallback füllt nicht ersetzte Komponenten | **CONFIRMED** |
| **P0-BH-12** | k-Factor + calibrationCount Reset bei jedem Init | **CONFIRMED** |
| **P0-BH-13** | Keine Snapshot/Fingerprint-Historie; kein As-of-Replay | **CONFIRMED** |
| **P0-BH-14** | `frontRotorWidth`/`rearRotorWidth` als Disc-Thickness-Anchor | **CONFIRMED** |
| P0-BH-04 | k-Calibration nicht implementiert | **CONFIRMED** (Phase 1+2) |
| P0-BH-05 | `harshBrakeWearMultiplier` unverdrahtet | **CONFIRMED** |
| P0-BH-06 | Evidence-Producers fehlen (DTC/Sensor) | **CONFIRMED** |

### P1 — neu in Phase 2

| ID | Finding |
|----|---------|
| **P1-BH-29** | Statischer Reku-Faktor statt gemessener Regeneration |
| **P1-BH-30** | Generisches 2mm Disc-Max-Wear; keine OEM-Mindestdicke |
| **P1-BH-31** | Keramik/Stahl/Carbon nicht unterschieden |
| **P1-BH-32** | Trommelbremse nicht modelliert |
| **P1-BH-33** | Manuelle Registrierung auto HIGH Confidence |
| **P1-BH-34** | `baseLifeKm` ist Gesamt-Lebensdauer nicht Achs-Lebensdauer |
| **P1-BH-35** | Remaining-km lineare Extrapolation ohne Unsicherheitsmodell (teilweise durch Range abgefedert) |
| **P1-BH-36** | Set-Level 60/40-Gewichtung kann kritische Achse verbergen |
| **P1-BH-37** | Confidence-Punkte auch bei Spec-Fallback-Anchor |
| **P1-BH-38** | Rolling 30d-DI für historische Coverage-Gaps |
| **P1-BH-39** | Canonical measured thickness nur für Pads nicht Discs in Axle-Check |

---

## 8. Phase 3 preview (not executed)

- Run DIMO MCP / Telemetry API signal audit
- Map brake wear sensors and fluid signals

---

# Phase 3 — VPS integrity analysis (60 days)

**Analysis window:** 2026-05-18 → 2026-07-17 UTC (60 days)  
**Data sources:** PostgreSQL read-only (primary); ClickHouse **unreachable** at audit time  
**Fleet:** 6 vehicles (`VEHICLE_001`–`006`), all DIMO-connected ICE/EV sedans

## 3.1 Data source inventory

| Source | Role in brake audit | 60d / total |
|--------|---------------------|-------------|
| `brake_health_current` | Wear state | **0 / 0** initialized |
| `brake_evidence` | Canonical signals | **0** |
| `vehicle_service_events` (BRAKE) | Anchor lineage | **0** |
| `vehicle_brake_reference_specs` | Spec fallback | **5** vehicles |
| `trip_driving_impact` | Per-trip wear inputs | **355** rows |
| `vehicle_trips` (COMPLETED) | Distance ledger | **579** trips, **2996.0 km** |
| `vehicle_driving_impact_current` | Rolling gap fallback | **6** rows (30d window) |
| `vehicle_latest_states` | Odometer, legacy `brake_pad_percent` | 6 rows; **all `brake_pad_percent` null** |
| `vehicle_dtc_events` | Safety signals (unwired) | **1** active (P0675 WARNING) |
| `brake_trip_metrics` | Orphan schema | **0** |
| `vehicle_enrichment_jobs` (BRAKE) | Registration pipeline | **6 PENDING** |
| `driving_events` | Native harsh events | 454 events (60d); no HARSH_BRAKING type |
| ClickHouse | HF telemetry mirror | **Down** |

**Recalculation logs:** No dedicated brake recalc audit table. `BrakeHealthCurrent.lastRecalculatedAt` absent (no rows). Trip-triggered `recalculate()` returns `null` when uninitialized.

## 3.2 Fleet coverage summary

| Classification | Count | Vehicles |
|----------------|-------|----------|
| **C — SPEC_FALLBACK_ELIGIBLE** | 5 | VEHICLE_001, 002, 004, 005, 006 |
| **D — NO_BASELINE** | 1 | VEHICLE_003 (no reference spec) |
| A VALIDATION_READY | 0 | — |
| B ESTIMATION_ONLY | 0 | — |
| E DATA_INCONSISTENT | 0 | — (see TDI/trip distance note) |
| F SAFETY_SIGNAL_ONLY | 0 | DTC exists but not in BrakeEvidence |

**Key per-vehicle facts (60d):**

| Vehicle | Powertrain | Odometer | Spec | TDI rows | Trips w/o TDI | Notes |
|---------|------------|----------|------|----------|---------------|-------|
| VEHICLE_001 | GASOLINE | 375 km | yes | 34 | 19 (36%) | Low mileage |
| VEHICLE_002 | ELECTRIC | 179,374 km | yes | 156 | 114 (42%) | EV static reku would apply |
| VEHICLE_003 | GASOLINE | 113,649 km | **no** | 43 | 17 (28%) | Backfill ineligible |
| VEHICLE_004 | GASOLINE | 187,350 km | yes | 30 | 14 (32%) | — |
| VEHICLE_005 | GASOLINE | 190,025 km | yes | 76 | 52 (41%) | Active DTC P0675 |
| VEHICLE_006 | GASOLINE | 5,229 km | yes | 17 | 7 (29%) | — |

Artifact: `docs/audits/data/brake-health-fleet-coverage-2026-07.csv`

## 3.3 Anchor integrity

**Result: NO_ANCHORS fleet-wide** — all 13 integrity questions are N/A until first init.

| Check | Fleet result |
|-------|--------------|
| Anchor from measurement vs spec | N/A — no anchors |
| Service scope matches reset | N/A — 0 service events |
| k-factor / calibration preserved | N/A |
| Lifecycle applied without evidence | N/A |
| Evidence without service event | N/A |
| Anchor odometer after current odometer | N/A |
| Anchor date before trips | N/A |

**Lineage:** 5 vehicles have registration `VehicleBrakeReferenceSpec` (manual source) but **zero** `BRAKE_SERVICE` events and **zero** `BrakeHealthCurrent` — registration init/backfill never executed in production.

Artifact: `docs/audits/data/brake-health-anchor-integrity-2026-07.csv`

## 3.4 Service scope replay

**0 `BRAKE_SERVICE` events** — all replays marked **UNVERIFIABLE**.

Code-confirmed risk (Phase 2) remains latent: when services are recorded, `scope` is **not** passed to `initializeFromService`, so **OVER_RESET** is expected for partial pad/disc services once fleet is initialized.

Artifact: `docs/audits/data/brake-health-service-scope-replay-2026-07.csv`

## 3.5 Distance & coverage audit

| Metric | Fleet 60d |
|--------|-----------|
| Trip distance sum | 2,996.0 km |
| TDI distance sum | 2,892.8 km |
| TDI / trip ratio | 96.6% |
| Trips without TDI | **223 (38.5%)** |
| TDI without trip | 0 |
| TDI vs trip km mismatch (>\|0.5 km\|) | **135 rows** |

**Answers:**

1. **TDI km > odometer delta?** N/A without anchor; per-vehicle TDI subset can exceed trip-sum when `trip_driving_impact.distance_km ≠ vehicle_trips.distance_km` (VEHICLE_003: 339 vs 314.7 km on 43 TDI trips).
2. **Clamp 1.0 hides overcoverage?** Code clamps `coverageRatio` at 1.0 — would hide TDI>odo if it occurred post-init.
3. **Wear on overcoverage?** Trip loop uses TDI rows; gap uses odometer delta minus trip sum.
4. **Missing impact data?** **Yes** — 223 trips (38.5%).
5. **Rolling aggregate on historical gaps?** **Yes** — `getVehicleImpactForBrake` reads current 30d `vehicle_driving_impact_current`.
6. **VDI window vs anchor?** VDI is rolling 30d; would include pre-anchor behavior for gap fill.
7. **Trip reprocessing?** TDI rows immutable; distance field drift observed (135 mismatches).
8. **`BrakeTripMetric` in use?** **No** — 0 rows.
9. **BrakeTripMetric retries?** N/A — no writer.
10. **Double native/DIMO events?** `driving_events` has HARSH_ACCELERATION/CORNERING; `trip_behavior_events` BRAKING category **0** in 60d — DI uses behavior events path.

Artifact: `docs/audits/data/brake-health-trip-model-coverage-2026-07.csv`

## 3.6 Model plausibility replay

**Not reproducible** — 0 initialized vehicles. `recalculate()` early-returns when `!isInitialized`.

Observations for post-init risk:
- VDI `hard_brake_per_100km = 0` all vehicles despite 454 harsh `driving_events` in 60d → gap-fill may under-weight harsh braking (**P1-BH-45**).
- EV (VEHICLE_002) would get static `padRekuFactor=0.72` without measured regen.
- Reference disc anchors use **rotor width** (e.g. 36 mm VEHICLE_004) — implausible as thickness.

## 3.7 Evidence integrity

| Check | Result |
|-------|--------|
| Duplicate evidence | 0 rows total |
| TELEMATICS mm | 0 rows |
| Unconfirmed AI | 0 applied |
| DTC after clearance | 1 active DTC, 0 BrakeEvidence |
| Immediate replacement stale | N/A |
| HIGH confidence without source | N/A |

**VEHICLE_005:** `VehicleDtcEvent` P0675 WARNING active — **not** mirrored to `BrakeEvidence` (**P0-BH-06**).

Artifact: `docs/audits/data/brake-health-evidence-classification-2026-07.csv`

## 3.8 Phase-3 findings (new / confirmed)

| ID | Sev | Finding | Confidence |
|----|-----|---------|------------|
| **P0-BH-01** | P0 | Zero initialized brake health | CONFIRMED |
| **P0-BH-02** | P0 | Specs without init/backfill | CONFIRMED |
| **P0-BH-40** | P0 | 355 TDI rows but wear model no-op | CONFIRMED |
| **P0-BH-06** | P0 | DTC not in BrakeEvidence | CONFIRMED |
| **P1-BH-41** | P1 | 38.5% trips without TDI | CONFIRMED |
| **P1-BH-42** | P1 | 135 TDI/trip km mismatches | CONFIRMED |
| **P1-BH-43** | P1 | VEHICLE_003 no spec | CONFIRMED |
| **P1-BH-44** | P1 | Legacy brakePadPercent null | CONFIRMED |
| **P1-BH-45** | P1 | VDI hard-brake zero vs driving_events | LIKELY |

Full register: `docs/audits/data/brake-health-integrity-findings-2026-07.json` (12 findings)

## 3.9 P0/P1 Zwischenstand (nach Phase 3)

| Severity | Open count | Production blockers |
|----------|------------|---------------------|
| **P0** | 10+ | BH-01, BH-02, BH-40, BH-06, BH-09–14, BH-04, BH-05, BH-07, BH-08 |
| **P1** | 20+ | BH-41–45 new in Phase 3; BH-29–39 from Phase 2 |

**Verdict after Phase 3:** Brake Health is **not operational** in production. Driving-impact pipeline is active but **disconnected** from wear output until baselines exist.

---

# Phase 4 — DIMO brake signal timeseries analysis (60 days)

**Audit ID:** `brake-health-dimo-signals-2026-07`  
**Completed (UTC):** 2026-07-17T10:52:02Z  
**Method:** Read-only DIMO Telemetry API + PostgreSQL aggregates from production VPS (`BRAKE_HEALTH_DIMO_AUDIT_ALLOW_PROD=1`). No triggers/subscriptions. No GPS/location signals queried. DIMO MCP server **not available** in audit runtime — signal names/units verified against [DIMO Telemetry API — Vehicle Signals](https://www.dimo.org/docs/api-references/telemetry-api/signals) (fetched 2026-07-17).

**Fleet:** 6 DIMO-connected vehicles → anonymized `VEHICLE_001`–`VEHICLE_006` (sorted internal UUID; mapping not in Git). All vehicles: `hardware_type=LTE_R1`.

**Query volume:** **156** DIMO GraphQL queries (6 vehicles × `availableSignals`, `signalsLatest`, `dataSummary`, `events`, paginated historical `signals` in 7-day windows with backoff).

**Reproducibility:**

```bash
cd backend && BRAKE_HEALTH_DIMO_AUDIT_ALLOW_PROD=1 \
  npx ts-node -r tsconfig-paths/register ../scripts/audits/audit-brake-health-dimo-signals.ts \
  --days=60 --output-dir=../docs/audits/data
```

| Artifact | Rows | Purpose |
|----------|------|---------|
| `docs/audits/data/brake-health-dimo-signal-capability-2026-07.csv` | 132 | Per-vehicle signal listing, latest, classification, SynqDrive persistence |
| `docs/audits/data/brake-health-dimo-timeseries-coverage-2026-07.csv` | 132 | 60d/14d coverage, cadence, plausibility stats |
| `docs/audits/data/brake-health-dimo-braking-correlation-2026-07.csv` | 6 | Pedal/pressure/regen/event correlation aggregates |

## 4.1 DIMO documentation verification (Teil 1)

| API surface | Documented | Verified in audit |
|-------------|------------|-------------------|
| `availableSignals(tokenId)` | ✅ | Root query; returns `[String!]!` |
| `signalsLatest(tokenId)` | ✅ | Includes `lastSeen`; per-signal `{ value, timestamp }` |
| `signals(tokenId, from, to, interval)` | ✅ | Historical aggregation with `agg` per field |
| `segments(tokenId, …)` | ✅ | Not queried (trip boundaries already in SynqDrive) |
| `events(tokenId, from, to, filter)` | ✅ | Native `behavior.*` braking events |
| `dataSummary(tokenId)` | ✅ | Per-signal `firstSeen`, `lastSeen`, `numberOfSignals`; event summary |

### Startliste — dokumentierte Signale (Schema-Namen)

| Signal | DIMO unit | Semantik (DIMO docs) |
|--------|-----------|----------------------|
| `chassisBrakeIsPedalPressed` | 0/1 | Brake pedal pressed |
| `chassisBrakePedalPosition` | % | Pedal travel 0–100% |
| `chassisParkingBrakeIsEngaged` | 0/1 | Parking brake engaged |
| `chassisBrakeABSIsWarningOn` | 0/1 | ABS warning telltale (not “ABS active”) |
| `chassisBrakeCircuit1PressurePrimary` | kPa | Brake circuit 1 primary pressure |
| `chassisBrakeCircuit2PressurePrimary` | kPa | Brake circuit 2 primary pressure |
| `speed` | km/h | Vehicle speed |
| `angularVelocityYaw` | deg/s | Yaw rate |
| `powertrainTransmissionTravelledDistance` | km | Odometer |
| `isIgnitionOn` | 0/1 | Ignition |
| `powertrainType` | enum | Powertrain type |
| `powertrainTractionBatteryCurrentPower` | W | +in (charge/regen), −out (drive) |
| `obdDTCList` | list | Active DTC codes |
| `obdStatusDTCCount` | count | DTC count |
| `exteriorAirTemperature` | °C | Ambient |
| `powertrainTransmissionRetarderActualTorque` | % | Retarder torque (HD) |
| `powertrainTransmissionRetarderTorqueMode` | enum | Retarder mode |
| `chassisAxleRow1WheelLeftSpeed` | km/h | Front-left wheel speed |
| `chassisAxleRow1WheelRightSpeed` | km/h | Front-right wheel speed |

### Explizit gesucht — NOT_DOCUMENTED (keine erfundenen Namen)

| Concept | Status |
|---------|--------|
| Rear Wheel Speeds | **NOT_DOCUMENTED** (`chassisAxleRow2Wheel*Speed` absent from schema) |
| Brake Pad Wear Sensor / Thickness / Disc Thickness | **NOT_DOCUMENTED** |
| Brake Fluid Status / Pressure / Temperature | **NOT_DOCUMENTED** |
| Brake Torque / Friction / Regenerative Torque | **NOT_DOCUMENTED** |
| Master Cylinder Pressure | **NOT_DOCUMENTED** (circuit pressure documented instead) |
| ABS Active / ESC Active / Traction Control Active | **NOT_DOCUMENTED** (only ABS warning telltale) |
| Brake Warning Light / EPB Fault | **NOT_DOCUMENTED** |
| Vehicle Mass (passenger) | **NOT_DOCUMENTED** (`chassisAxleRow3/4/5Weight` commercial only) |

## 4.2 Per-vehicle capability (Teil 2)

**Fleet-wide brake-signal result:** All documented `chassisBrake*` signals, wheel speeds, yaw rate, retarder, and axle weights are **`DOCUMENTED_NOT_AVAILABLE`** on every LTE_R1 vehicle — absent from `availableSignals`.

| Vehicle | Powertrain | Pedal pressed | Pedal position | Circuit pressure | ABS warning | Wheel speeds | EV battery power |
|---------|------------|---------------|----------------|------------------|-------------|--------------|------------------|
| VEHICLE_001 | GASOLINE | ❌ | ❌ | ❌ | ❌ | ❌ | N/A |
| VEHICLE_002 | ELECTRIC | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ listed + history |
| VEHICLE_003 | GASOLINE | ❌ | ❌ | ❌ | ❌ | ❌ | N/A |
| VEHICLE_004 | GASOLINE | ❌ | ❌ | ❌ | ❌ | ❌ | N/A |
| VEHICLE_005 | GASOLINE | ❌ | ❌ | ❌ | ❌ | ❌ | N/A |
| VEHICLE_006 | GASOLINE | ❌ | ❌ | ❌ | ❌ | ❌ | N/A |

**Usable context signals (not brake-specific):** `speed` (all 6, SPORADIC 0.4–3.0% coverage), `isIgnitionOn` (5/5 ICE), `powertrainTransmissionTravelledDistance`, `obdStatusDTCCount` (where listed), `exteriorAirTemperature`. Tesla (VEHICLE_002) has richest speed series (342k samples, 55.6% coverage) and traction battery power (27.8k samples, 10.2%).

**Classification legend:** `DOCUMENTED_NOT_AVAILABLE` | `AVAILABLE_NO_LATEST` | `AVAILABLE_NO_HISTORY` | `SPORADIC` (<5% coverage) | `USABLE` | `INVALID_OR_IMPLAUSIBLE`

## 4.3 Timeseries coverage (Teil 3)

| Window | Interval | Purpose |
|--------|----------|---------|
| 60 days | 1m (speed/brake), 3m (pressure), 15m (context) | `firstSeen`, `lastSeen`, `sampleCount`, coverage %, max gap |
| 14 days | same | Freshness, current cadence |

**Speed cadence (60d):** Median 60 s buckets; P95 gaps 36 min–25 d depending on vehicle; confirms prior finding that effective HF cadence is **not 1 Hz** despite `interval:"1m"`.

**Brake-specific timeseries:** **Zero** retrievable history for any `chassisBrake*` or wheel-speed signal fleet-wide.

## 4.4 Signal plausibility (Teil 5)

| Check | Result |
|-------|--------|
| **A. Pedal pressed** | Not available — no transitions, duration, or decel correlation possible |
| **B. Pedal position** | Not available |
| **C. Circuit pressure** | Not available — cannot validate kPa semantics or EV brake-by-wire equivalence |
| **D. ABS warning** | Not available — no telltale transitions; no wear inference possible |
| **E. Parking brake** | Not available |
| **F. EV battery power** | VEHICLE_002: during speed-decel samples (n=4989), positive inflow (regen proxy) rate **0.1%** — insufficient for friction/regen split |
| **G. Wheel speeds** | Not available |
| **H. DTC** | VEHICLE_005: `obdDTCList` listed; `obdStatusDTCCount` latest=1; SynqDrive DTC pipeline active but **not** mirrored to `BrakeEvidence` (P0-BH-06) |
| **I. Retarder** | Not available (ICE passenger fleet) |

## 4.5 DIMO native events (Teil 6)

| Vehicle | DIMO harsh (60d) | DIMO extreme (60d) | SynqDrive `driving_events` HARSH | SynqDrive EXTREME | TripBehavior BRAKING |
|---------|------------------|--------------------|----------------------------------|-------------------|----------------------|
| VEHICLE_001 | 0 | 0 | 0 | 0 | 0 |
| VEHICLE_002 | 0 | 0 | 0 | 0 | 0 |
| VEHICLE_003 | **121** | **22** | **0** | **0** | 0 |
| VEHICLE_004 | 0 | 1 | 0 | 0 | 0 |
| VEHICLE_005 | 0 | 0 | 0 | 0 | 0 |
| VEHICLE_006 | 0 | 0 | 0 | 0 | 0 |

**Total DIMO native braking events (60d):** 144. **Duplicate timestamps:** 0.  
**Critical gap:** VEHICLE_003 has **143 DIMO braking events** with **zero** corresponding `driving_events` rows — LTE_R1 behavior enrichment path not ingesting for this vehicle (**P1-BH-46** new).

Events are **capability-gated** — only 2/6 vehicles produced any `behavior.*` braking events.

## 4.6 Brake load / friction feasibility (Teil 7)

| Signal combination | Classification |
|--------------------|----------------|
| Speed + negative Δv (proxy decel) | **Derived / approximated** — available but low cadence |
| Brake pedal / circuit pressure | **Not determinable** — not delivered |
| EV regen vs friction split | **Not determinable** — regen correlation <0.2% |
| Vehicle/axle mass | **Not determinable** — no passenger mass signal |
| Native DIMO braking events | **Direct** where emitted; **absent** on 4/6 vehicles |
| `trip_driving_impact` harsh metrics | **Derived** from SynqDrive pipeline (when events ingested) |

**Conclusion:** No fleet-wide mechanical brake-load index is supportable from DIMO telemetry today. Best available path remains **native `behavior.*` events** (vehicle-dependent) plus **trip driving impact** distance/harsh proxies — not hydraulic pedal/pressure signals.

## 4.7 SynqDrive persistence matrix (Teil 8)

| Category | Signals / data | DIMO delivers | SynqDrive stores | SynqDrive uses (Brake Health) |
|----------|----------------|---------------|------------------|-------------------------------|
| **A** Delivered + stored + used | `speed`, `odometer` | ✅ | `vehicle_latest_states` | Trip distance / gap fill |
| **B** Delivered + stored, not used | `traction_battery_power_kw` (EV) | ✅ V002 | ✅ | ❌ (static `padRekuFactor` only) |
| **B** Delivered + stored, not used | `obd_dtc_list` / DTC count | ✅ V005 | ✅ via DTC processor | ❌ not in `BrakeEvidence` |
| **C** Delivered, discarded | Native `behavior.*` events | ✅ V003/V004 | ❌ not in `driving_events` | ❌ |
| **D** Documented, not delivered | All `chassisBrake*`, wheel speeds | ❌ fleet-wide | — | — |
| **E** Sporadic | `speed` (0.4–3% coverage ICE) | ✅ | ✅ | Context only |
| **F** Mapping gap | `brake_pad_percent` | ❌ (no DIMO source) | Column exists, **all null** | Legacy WARNING_ONLY fallback only |

**Code confirmation:** `buildLatestSnapshotQuery` and `DimoSnapshotProcessor.normalizeSnapshot` **do not request or persist** any `chassisBrake*` or wheel-speed fields. `brakePadPercent` is never populated from DIMO.

## 4.8 Phase-4 findings (new / confirmed)

| ID | Sev | Finding | Confidence |
|----|-----|---------|------------|
| **P0-BH-06** | P0 | DTC not mirrored to `BrakeEvidence` | CONFIRMED (V005 `obdStatusDTCCount`=1) |
| **P1-BH-44** | P1 | Legacy `brakePadPercent` null fleet-wide | CONFIRMED |
| **P1-BH-46** | P1 | DIMO native braking events not ingested (V003: 143 events, 0 `driving_events`) | CONFIRMED |
| **P1-BH-47** | P1 | All `chassisBrake*` documented but NOT_LISTED on LTE_R1 fleet | CONFIRMED |
| **P1-BH-48** | P1 | EV regen split not measurable from `powertrainTractionBatteryCurrentPower` alone | CONFIRMED |
| **P2-BH-49** | P2 | Harsh-brake multiplier in config exists but needs event path, not pedal signals | LIKELY |

**Verdict after Phase 4:** Brake Health cannot be improved by DIMO brake pedal/pressure/wheel-speed signals on the current fleet. Priority wiring gaps are **DIMO event ingestion** (V003) and **DTC→BrakeEvidence** — not new telemetry subscriptions.

---

## 9. Phase 5 preview (not executed)

- Isolated pure replay of `computePadWear`/`computeDiscWear` against ground-truth mm
- No `recalculate()` against production

## 10. Phase 6 preview (not executed)

- Full consumer matrix CSV
- Rental blocking policy vs canonical CRITICAL rules
- Frontend measured/estimated display audit
- Prometheus metric gap analysis

## 11. Phase 7 preview (not executed)

- Final `NOT_READY` / `READY` / `SHADOW_ONLY` verdict
- Remediation sequence: backfill → fleet recalc → evidence wiring → calibration

---

## Audit script

Read-only entry point:

```bash
# Phase 1 — artifacts only (no DB)
npx ts-node scripts/audits/audit-brake-health-production-readiness.ts --phase=1

# Phase 3 — read-only DB integrity (supervised production)
BRAKE_HEALTH_AUDIT_ALLOW_REMOTE=1 BRAKE_HEALTH_AUDIT_ALLOW_PROD=1 \
  npx ts-node scripts/audits/audit-brake-health-production-readiness.ts --phase=3 --days=60 \
  --output-dir=docs/audits/data

# Phase 4 — DIMO brake signal timeseries (supervised production)
cd backend && BRAKE_HEALTH_DIMO_AUDIT_ALLOW_PROD=1 \
  npx ts-node -r tsconfig-paths/register ../scripts/audits/audit-brake-health-dimo-signals.ts \
  --days=60 --output-dir=../docs/audits/data
```

**Ops backfill (NOT run during audit — writes):**

```bash
cd backend
npx ts-node -r tsconfig-paths/register scripts/ops/backfill-brake-health-from-registration-specs.ts --dry-run
```

---

## Change log

| Date | Phase | Action |
|------|-------|--------|
| 2026-07-17 | 1 | Initial architecture map, VPS read-only probe, code-map CSV, fleet coverage CSV, audit script scaffold |
| 2026-07-17 | 3 | VPS 60d integrity: fleet coverage, anchor/scope/trip/evidence CSVs, findings JSON (12 findings) |
| 2026-07-17 | 4 | DIMO brake signal audit: 156 GraphQL queries, 3 CSV artifacts, `audit-brake-health-dimo-signals.ts` |

---

## Confirmation (Phases 1–4)

- ✅ No production data was modified during Phases 1–4.
- ✅ No brake recalculation, evidence creation, or anchor mutations were triggered.
- ✅ No DIMO triggers or subscriptions were created.
- ✅ No infrastructure was changed (PM2, Redis, PostgreSQL, ClickHouse, Docker, workers).
- ✅ No secrets, VINs, license plates, token IDs, GPS coordinates, customer PII, or raw telemetry are stored in committed audit artifacts.
- ✅ Phase 3–4 VPS PostgreSQL access was **read-only** (`SELECT` aggregates only).
- ✅ Phase 4 DIMO Telemetry API access was **read-only** (no GPS signals queried).
- ✅ Phase 2 was **code-only** static analysis.
- ⏳ Phases 5–7 **not started** per audit plan.
