# Trip Detection & Lifecycle — Current State (Partial, Phase 0–2)

| Field | Value |
|-------|-------|
| **Repository baseline** | `origin/main` @ `06095af91ce6f58366734a182ac5962830e858db` |
| **Production baseline** | `01541c2ab3b1ff0c918a92bb0d35e1830b6f6aac` @ `/opt/synqdrive/releases/20260906213654_v4994` |
| **Epistemic policy** | Claims separated below — do not merge axes |

---

## CONFIRMED — repository state (`06095af91…`)

### Module entry points

| Surface | Path / symbol |
|---------|----------------|
| Live orchestration | `backend/src/modules/vehicle-intelligence/trips/trip-detection-orchestration.service.ts` |
| Lifecycle authority | `backend/src/modules/vehicle-intelligence/trips/decision/trip-decision.engine.ts` |
| Ownership invariants (P1) | `backend/src/modules/vehicle-intelligence/trips/TRIP_OWNERSHIP.ts` |
| Types / triggers | `backend/src/modules/vehicle-intelligence/trips/trip-detection.types.ts` |
| Nest wiring | `backend/src/modules/vehicle-intelligence/vehicle-intelligence.module.ts` |
| Worker wiring | `backend/src/workers/workers.module.ts` |
| Snapshot ingress | `backend/src/workers/processors/dimo-snapshot.processor.ts` |
| Trip execution loop | `backend/src/workers/processors/trip-tracking.processor.ts` |
| Snapshot scheduler | `backend/src/workers/schedulers/dimo-snapshot.scheduler.ts` |
| Tracking recovery | `backend/src/workers/schedulers/trip-tracking-recovery.scheduler.ts` |
| Reconciliation scheduler | `backend/src/workers/schedulers/trip-reconciliation.scheduler.ts` |
| Reconciliation/repair | `backend/src/modules/vehicle-intelligence/trips/reconciliation/` |
| Route artifacts | `backend/src/modules/vehicle-intelligence/trips/route-artifacts/` (Route V2) |
| Trip API | `backend/src/modules/vehicle-intelligence/vehicle-intelligence.controller.ts` (`GET trips*`) |
| Rental UI | `frontend/src/rental/components/trips/`, `frontend/src/rental/components/TripsView.tsx` |
| Metrics | `backend/src/modules/observability/trip-metrics.service.ts` (+ R8 forensic utils) |

~249 TypeScript files under `backend/src/modules/vehicle-intelligence/trips/`.

### Persistent FSM model (`VehicleTripDetectionState`)

Prisma enum `TripDetectionState`:

| State | Role on `main` |
|-------|----------------|
| `RESTING` | Default terminal; post-finalize reset |
| `POSSIBLE_START` | Start candidate (no trip row yet) |
| `ACTIVE_TRIP` | Confirmed movement trip |
| `IDLE_WITHIN_TRIP` | Stopped but trip still open |
| `POSSIBLE_END` | End candidate (trip still ONGOING) |
| `ENDED` | **Schema-only — no runtime writer** (zero `TripDetectionState.ENDED` in `trips/`) |

Successful finalize → **`RESTING`**, not `ENDED` (reconfirmed vs TDL-EV-P2-001).

### BullMQ execution phases (not persisted as FSM state)

From `TRIP_TRACKING_TRIGGERS` in `trip-detection.types.ts`:

| Trigger | Processor phase |
|---------|-----------------|
| `POSSIBLE_START` | Start validation window |
| `ACTIVE_TICK` | In-trip metric + route sampling |
| `POSSIBLE_END_CHECK` | End candidacy |
| `END_VALIDATION` | CUSUM / classifier validation |
| `FINALIZE` | Terminal lifecycle commit |

Persisted run types on `VehicleTripTrackingRun`: `POSSIBLE_START_VALIDATION`, `ACTIVE_TRACKING`, `POSSIBLE_END_CHECK`, `END_VALIDATION`, `FINALIZATION_CHECK`.

### Signal & timestamp authority

- **Event-time** fields: `possibleStartAt`, `possibleEndAt`, `lastMeaningfulMovementAt`, canonical trip `startTime`/`endTime` (R1 contract — TDL-EV-R1-001)
- **Worker-time** fields: `possibleStartEnteredAt`, `possibleEndEnteredAt`, dwell/expiry clocks
- Snapshot evidence timestamping flows through orchestration + `trip-fsm-timing*.util.ts`

### Detector hierarchy & policies

- Detectors under `trips/detectors/` return **findings only** (P1 Rule 4)
- Policy resolver: `trips/policy/trip-detection-policy.resolver.ts`
- Start modes: `START_DETECTION_MODES` (ignition, motion, RPM, GPS odometer, composite, mid-gap split)
- End modes: `END_DETECTION_MODES` (CUSUM, ClickHouse assist, inactivity composites, mid-gap split)

### Decision engine & lifecycle

- **`TripDecisionEngine`** sole writer of `vehicleTrip.tripStatus` (ONGOING → COMPLETED/CANCELLED; reopen for merge)
- Sources: `V2_LIVE`, `REPAIRED` via `tripSource`
- Repair layer (`TripReconciliationService`, `TripRepairService`) **must route** mutations through decision engine (P1 Rule 5)

### Queues & workers

| Queue | Name | Role |
|-------|------|------|
| Snapshot poll | `dimo.snapshot.poll` | DIMO snapshot fetch → start evaluation |
| Trip tracking | `dimo.trip-tracking` | Self-scheduling FSM execution loop |

Related downstream (not owned): `trip.behavior.enrichment`, `trip.driving-impact.compute`, `driving.intelligence.jobs`.

Schedulers: snapshot tier polling, trip-tracking recovery, daily trip reconciliation (cron ~03:00 per platform-ops registry).

### Locks, concurrency, idempotency

- Per-vehicle worker lock on `VehicleTripDetectionState` (`workerLockedUntil`, `workerRunToken`)
- R3 handoff settlement for stable successor jobs (`trip-tracking-handoff-settlement.ts`)
- Trip-specific locking distinct from Scaling Process leader election / reconciliation mutex (neighbor)

### Reconciliation & repair

- `TripRepair` audit model: types include `MISSING_TRIP`, `MISSING_END`, `INTRA_TRIP_GAP_SPLIT`, `PARTIAL_TRIP_BOUNDARY_EXTENSION`, `STALE_ONGOING`
- Partial boundary repair gated by `TRIP_PARTIAL_BOUNDARY_REPAIR_ENABLED`
- Intra-trip gap split: R6 safety utilities on `main`

### Persistence (Prisma)

| Model | Purpose |
|-------|---------|
| `VehicleTrip` | Canonical trip row + enrichment/analysis status fields |
| `VehicleTripDetectionState` | Live FSM row (1:1 vehicle) |
| `VehicleTripTrackingRun` | Execution forensics |
| `TripRepair` | Repair audit trail |
| `VehicleTripWaypoint` | Raw route observations |
| `VehicleTripRouteArtifact` | Canonical route artifact (Route V2) |

Tenant scoping: `organizationId` on detection state and tracking runs; trips via `vehicleId` → vehicle org relation.

### API & UI read models

- REST: `/vehicle-intelligence/trips`, `/trips/:id`, `/trips/:id/route`, behavior-events, device-connection-evidence, rpm-candidates
- Frontend trip timeline, map, decision summary, evidence panels consume API DTOs mappers in `trip-api.mapper.ts`

### Observability (repository)

- R8 on `main`: forensic metadata utils, corrected timing metrics, tracking run `resultState` discipline (TDL-EV-R8-001)
- Pre-R8 metric mislabeling documented in R8 artifact — fixed on `main`, not on Production SHA

### Remediation on `main`

R1–R8 merged on `main` through #1549 (see EVIDENCE_INDEX). R9 **not** on scope for this document.

---

## CONFIRMED — Production state (read-only, 2026-09-07)

See [evidence/PRODUCTION_BASELINE.md](evidence/PRODUCTION_BASELINE.md).

| Observation | Value |
|-------------|-------|
| Deployed SHA | `01541c2ab…` (ancestor of `main`) |
| Health | HTTP 200 |
| Backend replicas | 2 processes |
| FSM states | 6 × RESTING |
| Trips | 1994 COMPLETED, 18 CANCELLED, 0 ONGOING |
| Route artifacts | 94 |
| Tracking runs (7d) | 7012 PS validation, 3753 PEC, 1842 active |
| Redis key prefixes | snapshot 6, trip-tracking 7 |

---

## INFERRED behavior

| Inference | Basis |
|-----------|-------|
| Small telematics cohort drives live FSM rows | 6 detection states vs high tracking-run volume |
| Reconciliation scans broader history than live FSM | 8472 PROPOSED repairs vs 0 ONGOING |
| Production trip FSM lacks R8 observability fixes | SHA drift |
| Natural trip processing active | Thousands of tracking runs / 7 days |

---

## HISTORICAL evidence (not current truth without reconfirmation)

- P2–P5 audit Production SQL and SSH failure notes (superseded by 2026-09-07 baseline)
- Pre-R1 gap inventories in P4/P5/P6 (closed by R1–R8 on `main`)
- P6 deferral: flat audit docs were explicitly non-canonical until this bootstrap

---

## UNKNOWN facts

- Exact COMPLETED → Driving Intelligence durable handoff (TDL-OQ-001)
- `drive-profile/` ownership (TDL-OQ-002)
- ClickHouse trip-assist runtime behavior on Production
- Complete trip feature-flag matrix
- Full dead/legacy/competing path inventory
- Mapbox/FMM failure taxonomy

---

## CONTRADICTED claims

| Claim | Conflict |
|-------|----------|
| "R8 observability live on Production" | Production SHA predates #1549 |
| "P2 Production FSM distribution" | Stale vs 2026-09-07 SQL |

See [contradictions/OPEN_CONTRADICTIONS.md](contradictions/OPEN_CONTRADICTIONS.md).

---

## Explicit non-claims

This document does **not** assert:

- Production validation of R1–R8 (tests/deploy evidence separate)
- R9 adaptive polling wake behavior (out of bootstrap scope)
- Promotion to `AUTHORITY_ACTIVE`
- Complete FSM transition graph in machine-readable form (Phase 4)
- Resolved DIMO Integration vs trip reconciliation ownership (DIMO authority `NOT_STARTED`)

---

## Ownership boundaries (verified preliminary)

| Owner | Scope |
|-------|-------|
| **Trip Detection & Lifecycle** | Live FSM, start/end detection, tracking queue, boundary persistence, recovery/reconciliation, route artifacts |
| **Driving Intelligence** | Post-trip behavior, scoring, misuse — consumes boundaries |
| **KG-ATE** | Post-finalize enrichment orchestration |
| **KG-EED** | REFUEL/RECHARGE — associates to trips, not boundary owner |
| **Scaling Process** | Multi-replica leader election, DIMO budget, generic mutex — not trip FSM semantics |
| **Battery V2** | Downstream trip lifecycle consumption |
| **DIMO Integration** | Provider layer — code exists; registry `NOT_STARTED` |

**Open:** COMPLETED handoff to DI; `drive-profile/` ownership.
