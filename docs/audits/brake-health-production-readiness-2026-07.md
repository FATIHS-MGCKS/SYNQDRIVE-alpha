# Brake Health Production-Readiness Audit — July 2026

| Field | Value |
|-------|-------|
| **Audit ID** | `brake-health-production-readiness-2026-07` |
| **Repository** | [SYNQDRIVE-alpha](https://github.com/FATIHS-MGCKS/SYNQDRIVE-alpha) |
| **Branch** | `audit/brake-health-production-readiness-2026-07` |
| **Phase** | **1 of 7 — Architecture & Runtime Map** |
| **Status** | Phase 1 complete; Phases 2–7 pending |
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
| Audit script | `scripts/audits/audit-brake-health-production-readiness.ts` | 1+ |
| Formula factor map CSV | `docs/audits/data/brake-health-formula-factor-map-2026-07.csv` | 2 (pending) |
| Spec source map CSV | `docs/audits/data/brake-health-spec-source-map-2026-07.csv` | 2 (pending) |
| Integrity findings JSON | `docs/audits/data/brake-health-integrity-findings-2026-07.json` | 3 (pending) |
| DIMO signal capability CSV | `docs/audits/data/brake-health-dimo-signal-capability-2026-07.csv` | 4 (pending) |
| Backtest summary CSV | `docs/audits/data/brake-health-backtest-summary-2026-07.csv` | 5 (pending) |
| Consumer wiring CSV | `docs/audits/data/brake-health-consumer-wiring-2026-07.csv` | 6 (pending) |
| Test coverage CSV | `docs/audits/data/brake-health-test-coverage-2026-07.csv` | 6 (pending) |

---

# Seven-phase audit outline

| Phase | Title | Scope | Status |
|-------|-------|-------|--------|
| **1** | Architecture & runtime map | Code landkarte, VPS topology, triggers, data-flow, preliminary P0/P1 | ✅ **Complete** |
| **2** | Data model & formula audit | Prisma models, reference-spec priority, wear formulas, units, k-factor design vs implementation | ⏳ Pending |
| **3** | VPS integrity & fleet coverage | Read-only SQL aggregates, anchor/evidence gaps, initialization eligibility, driving-impact linkage | ⏳ Pending |
| **4** | DIMO & telemetry signal audit | `availableSignals`, brake wear sensors, fluid, DTC, harsh braking, HM overlap | ⏳ Pending |
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

## 7. Phase 2 preview (not executed)

- Formal wear formula extraction from `brake-health.config.ts` + `recalculate` loop
- Reference-spec fallback priority vs measured snapshot
- Unit consistency (mm, km, %)
- Compare documented `BrakeHealthSnapshot` (architecture) vs actual schema
- Evidence hierarchy: MEASURED vs ESTIMATED vs DOCUMENTED

## 8. Phase 3 preview (not executed)

- Run `audit-brake-health-production-readiness.ts --phase=3` against VPS (read-only)
- Per-vehicle initialization eligibility via backfill dry-run semantics
- Correlate `trip_driving_impact` volume with would-be modeled km post-backfill

## 9. Phase 4 preview (not executed)

- DIMO MCP / Telemetry API: brake pad wear, brake fluid, ABS/DTC signals
- Map to `BrakeEvidenceSource` enum vs actual producers
- Harsh braking signal cadence for wear multiplier decision

## 10. Phase 5 preview (not executed)

- Isolated pure replay of `computePadWear`/`computeDiscWear` against ground-truth mm
- No `recalculate()` against production

## 11. Phase 6 preview (not executed)

- Full consumer matrix CSV
- Rental blocking policy vs canonical CRITICAL rules
- Frontend measured/estimated display audit
- Prometheus metric gap analysis

## 12. Phase 7 preview (not executed)

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
  --output=docs/audits/data/brake-health-integrity-findings-2026-07.json
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

---

## Confirmation (Phase 1)

- ✅ No production data was modified during Phase 1.
- ✅ No brake recalculation, evidence creation, or anchor mutations were triggered.
- ✅ No DIMO triggers or subscriptions were created.
- ✅ No infrastructure was changed (PM2, Redis, PostgreSQL, ClickHouse, Docker, workers).
- ✅ No secrets, VINs, license plates, token IDs, GPS coordinates, customer PII, or raw telemetry are stored in committed audit artifacts.
- ✅ VPS PostgreSQL access was **read-only** (`SELECT` aggregates only).
- ⏳ Phases 2–7 **not started** per audit plan.
