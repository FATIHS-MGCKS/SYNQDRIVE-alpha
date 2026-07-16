# Tire Health Production-Readiness Audit — July 2026

| Field | Value |
|-------|-------|
| **Audit ID** | `tire-health-production-readiness-2026-07` |
| **Repository** | [SYNQDRIVE-alpha](https://github.com/FATIHS-MGCKS/SYNQDRIVE-alpha) |
| **Branch** | `audit/tire-health-production-readiness-2026-07` |
| **Phase** | 1 of 7 — Architecture & Code Map |
| **Status** | Phase 1 complete; Phases 2–7 pending |
| **Production data modified** | **No** — all VPS/DB/DIMO access was read-only |
| **Last VPS runtime probe** | 2026-07-16 (read-only SSH) |

---

## Executive summary (Phase 1)

The Tire Health module is a **mature, layered domain** in `vehicle-intelligence/tires/` with clear separation between **mutations** (`TireLifecycleService`), **wear mathematics** (`TireWearModelService` + `tire-health.config.ts`), and **canonical read models** (`TireHealthService` + `tire-status.ts`). Production runtime on the SynqDrive VPS runs as a **single PM2 process** (`synqdrive`) that hosts the NestJS API, BullMQ workers, and `@Interval`/`@Cron` schedulers in-process. PostgreSQL is the **system of record** for tire setups, measurements, snapshots, and events; ClickHouse is used for **high-frequency telemetry analytics** but has **no dedicated tire tables** — tire pressure for wear modelling is sourced from `vehicle_latest_state` (DIMO snapshot path) and High Mobility cache tables.

**Preliminary Phase-1 findings (not yet validated against full fleet replay):**

| Area | Observation | Preliminary risk |
|------|-------------|------------------|
| Trip → tire usage | `updateTireUsageFromTrip` runs only on explicit `POST …/trips/:id/enrich`, not on every trip finalize | **Medium** — km/event counters may lag if enrich is not called |
| Idempotency | Trip usage uses Prisma `increment` (additive, not idempotent on retry) | **Medium** |
| Recalculation | Hourly scheduler + BullMQ `jobId` hour-bucket dedupe; snapshots/data-points **append** | **Low–Medium** |
| Pressure data | Only **1** vehicle with non-null DIMO tire pressure in `vehicle_latest_state` (prod snapshot) | **High** for pressure-factor accuracy fleet-wide |
| Measured vs estimated | Display modes exist in read model; calibration via k-factor EMA | **Low** (design sound; coverage TBD in Phase 3) |
| Rental gate | `RentalHealthService` maps canonical `TireHealthSummary.overallStatus` → blocking | **Low** (read-only consumer) |
| Test coverage | Strong unit coverage on core services; limited E2E/replay tests | **Medium** |

---

## Audit constraints (all 7 phases)

### Allowed

- Repository read, tests, read-only PostgreSQL / ClickHouse / DIMO MCP queries
- Read-only audit scripts; anonymized aggregated artifacts in Git
- This documentation

### Not allowed

- Production writes, migrations, recalculations, tire mutations, DIMO subscriptions
- Worker/infra/config changes, secret output, PII in Git (VIN, plates, GPS, customer names)

### Vehicle anonymization

Stable public identifiers: `VEHICLE_001`, `VEHICLE_002`, … assigned by **sorted internal UUID** (mapping **not** stored in Git).

---

## Document map

| Artifact | Path |
|----------|------|
| Main report | `docs/audits/tire-health-production-readiness-2026-07.md` |
| Code map CSV | `docs/audits/data/tire-health-code-map-2026-07.csv` |
| Audit script (read-only skeleton) | `scripts/audits/audit-tire-health-production-readiness.ts` |

---

## Full audit outline (Phases 1–7)

### Phase 1 — Architecture & Code Map ✅ (this document)

- Git/audit setup
- VPS runtime topology (read-only)
- Repository-wide code landkarte
- End-to-end data-flow diagram
- Preliminary risk register
- CSV code map

### Phase 2 — Domain model & schema integrity

- Prisma model review (`VehicleTireSetup`, `Tire`, measurements, snapshots, events)
- Unit consistency (mm, km, %, pressure bar/kPa)
- Enum / status taxonomy alignment (`tire-status.ts` ↔ DB ↔ API ↔ UI)
- AI tire spec persistence shape
- Legacy fields (`vehicleLatestState.tireHealthPercent`)

### Phase 3 — Wear model & mathematics

- `TireWearModelService` formula audit (axle, usage, behavior, pressure, heat, season, regression, k-factor)
- `tire-health.config.ts` threshold review
- Measured vs estimated tread display logic
- Calibration EMA stability
- Edge cases: staggered setups, missing spec, zero km

### Phase 4 — Telemetry, trips & idempotency

- DIMO signal availability (`availableSignals`, `signalsLatest`, historical `signals`)
- Trip enrichment → driving impact → tire usage chain
- Idempotency of trip processors, enrich retries, recalculation scheduler
- ClickHouse HF mirror relevance to tire factors
- HM tire pressure cache freshness

### Phase 5 — Production data replay (read-only)

- Anonymized fleet sample from VPS PostgreSQL
- Replay wear formula in isolated audit script (no `recalculate()` calls)
- Compare stored snapshots vs recomputed projections
- DIMO pressure coverage per anonymized vehicle
- Aggregated CSV/JSON in `docs/audits/data/`

### Phase 6 — Integration & UX

- Rental Health evaluation & rental blocking
- Alerts, notifications (`tire-health-warning`, `tire_critical` detector)
- Frontend: HealthErrorsView (Quick Box + Detail Modal), VehicleHealthBox, FleetCondition, operator measure flow
- API contract consistency (`/tires/summary`, `/tires/detail`)

### Phase 7 — Production readiness verdict

- Blocker / bounded-fix / defer matrix
- Rollout & monitoring recommendations
- Test gap closure plan
- Final sign-off section

---

## Phase 1 — Git & audit setup

### Git status at audit start

| Check | Result |
|-------|--------|
| Base branch | `main` @ `2cd57c8` |
| Uncommitted unrelated changes | **None** (clean working tree) |
| Audit branch | `audit/tire-health-production-readiness-2026-07` |

---

## Phase 1 — VPS runtime architecture (read-only)

**Probe method:** SSH to production VPS (`mein-vps.internal`) — process listing, port scan, env flag names (values redacted), PostgreSQL aggregates, Redis key patterns. **No processes started/stopped/reconfigured.**

### Component topology

```
                    ┌─────────────────────────────────────────┐
  Internet :443     │  nginx (reverse proxy)                  │
        ──────────► │  app.synqdrive.eu → PM2 :3001 (internal)│
                    └──────────────────┬──────────────────────┘
                                       │
                    ┌──────────────────▼──────────────────────┐
                    │  PM2: synqdrive (single fork process)    │
                    │  /opt/synqdrive/current/backend/dist/    │
                    │    src/main.js                           │
                    │  • NestJS HTTP API                       │
                    │  • BullMQ WorkersModule (in-process)     │
                    │  • @nestjs/schedule schedulers           │
                    └───────┬──────────────┬────────────────────┘
                            │              │
         ┌──────────────────┘              └──────────────────┐
         ▼                                                     ▼
┌─────────────────────┐                              ┌─────────────────────┐
│ PostgreSQL 16       │                              │ Redis 7             │
│ systemd native      │                              │ systemd native      │
│ 127.0.0.1:5432      │                              │ 127.0.0.1:6379      │
│ **Canonical truth** │                              │ BullMQ job storage  │
│ tire setups, events │                              │ queue locks/dedupe  │
└─────────────────────┘                              └─────────────────────┘
         │
         │  analytics mirror (optional)
         ▼
┌─────────────────────┐     ┌─────────────────────┐
│ ClickHouse 25.8     │     │ Prometheus + Grafana │
│ Docker              │     │ Docker, localhost    │
│ 127.0.0.1:8123/9000 │     │ :9090 / :3000        │
│ HF telemetry, trips │     │ ops monitoring       │
│ (no tire_* tables)  │     │                      │
└─────────────────────┘     └─────────────────────┘
```

### Runtime facts (2026-07-16 probe)

| Component | Where it runs | Port / access | Tire Health role |
|-----------|---------------|---------------|------------------|
| **synqdrive** (PM2) | Host process | Internal via nginx | API + all workers/schedulers |
| **PostgreSQL** | systemd `postgresql@16-main` | `127.0.0.1:5432` | Setups, tires, measurements, snapshots, events, latest state |
| **Redis** | systemd `redis-server` | `127.0.0.1:6379` | BullMQ including `dimo.tire.recalculation` |
| **ClickHouse** | Docker `synqdrive-clickhouse` | `127.0.0.1:8123` | HF/trip analytics; indirect (driving impact temps) |
| **Prometheus** | Docker `synqdrive-prometheus` | `127.0.0.1:9090` | Queue/runtime metrics |
| **Grafana** | Docker `synqdrive-grafana` | `127.0.0.1:3000` | Dashboards |
| **DIMO** | External API | HTTPS | Snapshot polling → tire pressure on `vehicle_latest_state` |
| **High Mobility** | External MQTT/API | HTTPS/MQTT | Tire pressure cache via HM health polling |

**Release path:** `/opt/synqdrive/releases/20260716014912_v4994` → `current` symlink.

**Worker enablement:** `WorkersModule` is **always registered** when the app boots; `RuntimeStatusRegistry.setWorkersEnabled(redisOk)` gates queue **enqueue** via `canEnqueueQueue()`. No separate worker PM2 instance — **single process runs API + workers**.

**Duplicate workers:** Only **one** `synqdrive` PM2 instance observed. BullMQ job IDs provide deduplication (e.g. `tire-recalc:{vehicleId}:{hourBucket}`).

### Services that trigger Tire Health

| Trigger | Scheduler / entry | Queue / direct | Tire action |
|---------|-------------------|----------------|-------------|
| Hourly recalculation | `TireRecalculationScheduler` `@Interval(3600000)` | `dimo.tire.recalculation` | `TireHealthService.recalculate()` |
| Manual recalc | `POST /vehicles/:id/tires/recalculate` | Direct | `recalculate()` |
| Measurement / install / rotate / replace | `TireLifecycleService` mutations | Direct (often calls recalc) | Setup + event writes, optional recalc |
| Trip enrich | `POST /vehicles/:id/trips/:tripId/enrich` | Direct | `updateTireUsageFromTrip()` |
| Driving impact | `DrivingImpactProcessor` after HF enrich | `trip.driving-impact.compute` | Updates impact tables (feeds wear model, **not** direct tire write) |
| DIMO snapshot | `DimoSnapshotScheduler` → processor | `dimo.snapshot.poll` | Writes `vehicle_latest_state` tire pressures |
| HM health poll | `HmHealthPollingScheduler` | Direct / cache | Refreshes HM tire pressure cache |
| Data retention | `DataRetentionScheduler` `@Cron('30 3 * * *')` | Direct | Prunes old `tireHealthSnapshot`, `tireWearDataPoint` (if retention days > 0) |

### Idempotency & locking mechanisms

| Mechanism | Location | Purpose |
|-----------|----------|---------|
| BullMQ `jobId` hour bucket | `tire-recalculation.scheduler.ts` | Prevent duplicate hourly recalc per vehicle |
| `removeOnComplete` / `removeOnFail` | BullMQ default + tire queue | Bounded Redis memory |
| `canEnqueueQueue()` | `queue-producer.util.ts` | Skip enqueue if Redis unavailable at boot |
| Retention `running` guard | `data-retention.scheduler.ts` | Prevent overlapping retention runs |
| Prisma transactions | `TireLifecycleService`, `TireIdentityService` | Atomic setup/rotation/replace |
| **Not idempotent** | `updateTireUsageFromTrip` | `increment` on retry may double-count |

### Production PostgreSQL aggregates (read-only, no IDs)

| Metric | Value (2026-07-16) |
|--------|-------------------|
| Active tire setups (`status=ACTIVE`, not removed) | 6 |
| Distinct vehicles with active setup | 6 |
| `tire_health_snapshots` created in last 7 days | 414 |
| `tire_events` created in last 7 days | 414 |
| Vehicles with non-null `tire_pressure_fl` in `vehicle_latest_state` | 1 |

**Interpretation:** Recalculation pipeline is **active** (≈69 snapshots/vehicle/week if evenly distributed). DIMO tire pressure coverage on latest state is **very low** (1/6) — pressure wear factor may often fall back to neutral/missing-data paths.

### Redis evidence

Active BullMQ keys under `bull:dimo.tire.recalculation:*` including `tire-recalc:{vehicleId}:{hourBucket}` pattern — confirms scheduler is enqueueing recalculation jobs.

### ClickHouse

`SHOW TABLES … LIKE '%tire%'` returned **no tables** — tire domain does not persist to ClickHouse. HF telemetry in ClickHouse may still influence driving-impact / temperature factors indirectly.

### Environment flags (names only, values redacted)

Observed in production `backend/.env`: `DATABASE_URL`, `REDIS_*`, `CLICKHOUSE_*`, `CLICKHOUSE_TRIP_ASSIST_ENABLED`, `DIMO_*`, `DATA_RETENTION_ENABLED`, `HF_MIRROR_ENABLED`. Tire-specific retention: `RETENTION_TIRE_HEALTH_SNAPSHOTS_DAYS`, `RETENTION_TIRE_WEAR_DATA_POINTS_DAYS` (see `backend/.env.example`).

---

## Phase 1 — Code landkarte & data flow

### Architectural rules (enforced by module design)

1. **Canonical read model:** `TireHealthService.getSummary()` / `getDetail()` + `tire-status.ts` — consumers must not reimplement thresholds.
2. **Mutations:** `TireLifecycleService` (+ `TireIdentityService` for per-wheel rows).
3. **Wear math:** `TireWearModelService` + `TIRE_HEALTH_CONFIG` only.
4. **Pressure context:** DIMO (`vehicle_latest_state`) + HM cache → `resolvePressureContext()` in health service.
5. **Rental gate:** `RentalHealthService.evaluateTires()` — read-only mapping to `ModuleHealth`.

### End-to-end data flow

```
Vehicle registration / PUT tires
  → TireLifecycleService.upsertSetupAndMeasurement
  → VehicleTireSetup + VehicleTireTreadMeasurement + Tire identities

Tire spec resolution
  → parseAiTireSpec / AI job / manual fields on setup
  → tire-health.config archetype + reference tread + thresholds

Telemetry ingest
  → DIMO DimoSnapshotProcessor → vehicle_latest_state (tirePressureFl/Fr/Rl/Rr)
  → HM polling/MQTT → HM cache → HmSignalUsageService.getTirePressureSignals

Trip capture
  → TripTrackingProcessor (trip FSM)
  → TripBehaviorEnrichmentProcessor → HF enrichment
  → DrivingImpactProcessor → tripDrivingImpact + vehicleDrivingImpactCurrent
  → (optional) POST enrichTrip → updateTireUsageFromTrip (setup km counters)

Wear & health
  → TireWearModelService.computeWearAnalysis
  → TireHealthService.recalculate → setup fields + TireHealthSnapshot + TireWearDataPoint + TireEvent

Read path
  → getSummary / getDetail → TireHealthSummary (Quick Box) / TireHealthDetail (Modal)

Downstream
  → RentalHealthService → rental blocking
  → TireCriticalDetector → business insights
  → rental-health-notification projector → notifications
  → HealthErrorsView / VehicleHealthBox / FleetConditionDetailView
```

### Domain module index

| Domain | Primary path | Key symbols |
|--------|--------------|-------------|
| Tire core | `backend/src/modules/vehicle-intelligence/tires/` | `TireHealthService`, `TireWearModelService`, `TireLifecycleService`, `TireIdentityService`, `TiresService` |
| Config / taxonomy | `tire-health.config.ts`, `tire-status.ts` | Thresholds, `aggregateTireStatus`, display modes |
| Driving impact | `backend/src/modules/vehicle-intelligence/driving-impact/` | `DrivingImpactService` |
| Trips | `backend/src/modules/vehicle-intelligence/trips/` | `TripsService.enrichTrip`, orchestrator |
| DIMO | `backend/src/modules/dimo/` | Snapshot queries, `DimoSnapshotProcessor` |
| High Mobility | `backend/src/modules/high-mobility/` | `HmSignalUsageService.getTirePressureSignals` |
| Rental health | `backend/src/modules/rental-health/` | `evaluateTires`, `isRentalBlocked` |
| Workers | `backend/src/workers/` | `TireRecalculationScheduler`, `TireRecalculationProcessor` |
| AI specs | `backend/src/modules/ai/vehicle-specs/` | `TireSpecAiService`, `AiTireSpecJobService` |
| Alerts / insights | `business-insights/detectors/tire-critical.detector.ts` | Fleet tire critical insights |
| Notifications | `notifications/adapters/rental-health-notification.projector.ts` | `tires_critical` |
| Frontend | `frontend/src/rental/components/HealthErrorsView.tsx` | Quick Box + Detail Modal |
| Schema | `backend/prisma/schema.prisma` | `VehicleTireSetup`, `Tire`, `TireHealthSnapshot`, … |

Detailed per-function mapping: see **`docs/audits/data/tire-health-code-map-2026-07.csv`**.

### Prisma models (tire domain)

| Model | Purpose |
|-------|---------|
| `VehicleTireSetup` | Active/stored set: specs, AI spec JSON, usage counters, health aggregates, k-factors |
| `VehicleTireTreadMeasurement` | Fleet/workshop 4-wheel tread measurements per setup |
| `Tire` | Per-wheel identity: position, estimated tread, per-tire km/events |
| `TirePositionHistory` | Rotation/replace position audit |
| `TireMeasurement` | Single-wheel measurement (replacement path) |
| `TireEvent` | ROTATION, TIRE_CHANGE, MEASUREMENT, RECALCULATION, INSTALL, ALERT |
| `TireHealthSnapshot` | Time-series snapshot per recalculation |
| `TireWearDataPoint` | Regression training: predicted vs actual tread |
| `VehicleLatestState` | `tirePressureFl/Fr/Rl/Rr`, legacy `tireHealthPercent` |
| `AiTireSpecJob` | Async AI tire spec extraction |

### API surface (tenant)

| Method | Route | Writes? |
|--------|-------|---------|
| GET | `/vehicles/:id/tires/summary` | No |
| GET | `/vehicles/:id/tires/detail` | No |
| GET | `/vehicles/:id/tires/wear-analysis` | No |
| POST | `/vehicles/:id/tires/recalculate` | Yes |
| POST | `/vehicles/:id/tires/measurement` | Yes |
| POST | `/vehicles/:id/tires/rotate` | Yes |
| POST | `/vehicles/:id/trips/:tripId/enrich` | Yes (trip + tire usage) |
| POST | `/vehicles/:id/hm-vehicle-health/refresh-tire-pressure` | Yes (HM cache) |

Full route list in CSV and `vehicle-intelligence.controller.ts`.

### Test coverage index (tire-related)

| File | Scope |
|------|-------|
| `tire-health.spec.ts` | Health service, recalc, summary/detail |
| `tire-lifecycle.spec.ts` | Mutations |
| `tire-identity.service.spec.ts` | Identity/rotation |
| `tire-status.spec.ts` | Taxonomy |
| `driving-impact.service.spec.ts` | Impact scoring |
| `rental-health.service.spec.ts` | Tire module evaluation |
| `tire-critical.detector.spec.ts` | Insights |
| `tire-health-detail-ui.test.ts` | Frontend display helpers |
| `vehicle-health-box.mapper.test.ts` | Health box tire segment |

**Gap:** No dedicated production replay / DIMO signal coverage integration test in repo (planned Phase 5 script).

### Preliminary risk register (Phase 1)

| ID | Risk | Severity | Phase to validate |
|----|------|----------|-------------------|
| R-TH-01 | Trip tire usage only on manual enrich | Medium | 4 |
| R-TH-02 | `increment` not idempotent on enrich retry | Medium | 4 |
| R-TH-03 | Low DIMO pressure coverage in prod (1/6 vehicles) | High | 4, 5 |
| R-TH-04 | Snapshots/data-points append without dedupe key | Low | 3, 5 |
| R-TH-05 | Legacy `tireHealthPercent` on latest state vs canonical summary | Low | 2, 6 |
| R-TH-06 | Driving impact not chained to tire recalc (hourly only) | Medium | 4 |
| R-TH-07 | Limited E2E / VPS replay tests | Medium | 5, 7 |

---

## Phase 2–7 placeholders

> Sections will be expanded in subsequent audit prompts. Do not treat empty subsections as "no issues found".

- **Phase 2:** Schema & unit integrity — _pending_
- **Phase 3:** Wear model mathematics — _pending_
- **Phase 4:** Telemetry & idempotency — _pending_
- **Phase 5:** Production data replay — _pending_
- **Phase 6:** Integrations & UX — _pending_
- **Phase 7:** Final verdict — _pending_

---

## Audit script

Read-only entry point for later phases:

```bash
# Dry-run (default) — no writes
npx ts-node -r tsconfig-paths/register scripts/audits/audit-tire-health-production-readiness.ts --phase=1

# Future phases (not implemented yet)
# --phase=5 --output=docs/audits/data/tire-health-replay-2026-07.json
```

---

## Change log (this audit)

| Date | Phase | Action |
|------|-------|--------|
| 2026-07-16 | 1 | Initial architecture map, VPS probe, CSV, audit script skeleton |

---

## Confirmation

- ✅ No production data was modified during Phase 1.
- ✅ No secrets, VINs, license plates, or GPS coordinates are stored in committed audit artifacts.
- ✅ VPS PostgreSQL queries were aggregate counts only.
- ⏸ Phase 2 not started per audit plan.
