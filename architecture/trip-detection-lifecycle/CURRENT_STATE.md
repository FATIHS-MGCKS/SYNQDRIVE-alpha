# Trip Detection & Lifecycle — Current State (Partial, `AUDIT_IN_PROGRESS`)

| Field | Value |
|-------|-------|
| **Repository baseline** | Post-R9 branch integrates `origin/main` @ `a4725514866a03099e7a1e485ccf0b7ea37d6fec` |
| **Production baseline** | `01541c2ab3b1ff0c918a92bb0d35e1830b6f6aac` @ `/opt/synqdrive/releases/20260906213654_v4994` |
| **Last verified Production evidence** | `2026-09-06T23:47:41Z` (single session; see TDL-EV-PROD-*) |
| **Epistemic policy** | Claims separated below — do not merge axes |

## Phase status (this document)

Phase **1** documents an **initial consolidated baseline** — not a claim that repository audit is fully complete. Outstanding gaps include dead/legacy inventory, full feature-flag matrix, Mapbox/FMM failure taxonomy, and Driving Intelligence handoff.

---

## CONFIRMED — repository state (`a47255148…`)

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
| Route artifacts | `backend/src/modules/vehicle-intelligence/trips/route-artifact/` (Route V2) |
| Trip API | `backend/src/modules/vehicle-intelligence/vehicle-intelligence.controller.ts` (`GET trips*`) |
| Rental UI | `frontend/src/rental/components/trips/`, `frontend/src/rental/components/TripsView.tsx` |
| Metrics | `backend/src/modules/observability/trip-metrics.service.ts` (+ R8 forensic utils on `main`) |

### R9 wake subsystem entry points

| Surface | Path / symbol |
|---------|----------------|
| Wake intake | `backend/src/workers/snapshot-wake/snapshot-wake-intake.service.ts` (`SnapshotWakeIntakeService`) |
| Wake coordinator | `backend/src/workers/snapshot-wake/snapshot-wake-coordinator.service.ts` (`SnapshotWakeCoordinatorService`) |
| Nest wiring | `backend/src/workers/snapshot-wake/snapshot-wake.module.ts` |
| Handoff processor | `backend/src/workers/processors/snapshot-wake-handoff.processor.ts` |
| Redis scripts | `backend/src/workers/snapshot-wake/snapshot-wake-redis.scripts.ts` |
| DIMO webhook wiring | `backend/src/modules/dimo/dimo-webhook.controller.ts` (delegates eligible wakes to intake) |

**R9 architecture (repo-confirmed):**

- Durable **pending** and **successor** Redis mailboxes (`synqdrive:snapshot-wake:pending:{vehicleId}`, `synqdrive:snapshot-wake:successor:{vehicleId}`) with monotonic version merge
- Coalesce while canonical `snapshot-{vehicleId}` job is **QUEUED** or **ACTIVE** — no parallel provider fetch per vehicle
- **Handoff never provider-fetches** — `snapshot.wake.handoff` queue dispatches canonical `dimo.snapshot.poll` enqueue only after terminal/active-safe window
- **Continuation** when FSM is **RESTING** and vehicle is wake-eligible (AVAILABLE/RENTED, DIMO CONNECTED)
- **UNKNOWN** wake classification → bounded retry (`UNKNOWN_CONTINUATION_RETRY_MS`) before retirement
- **Gen-1 terminal** semantics for wake retirement / mailbox drain
- **Effective-tier metrics** for wake vs scheduler polling observability

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

Successful finalize → **`RESTING`**, not `ENDED` (TDL-EV-P2-001 + code reconfirmation).

### BullMQ execution phases (not persisted as FSM state)

From `TRIP_TRACKING_TRIGGERS` in `trip-detection.types.ts`:

| Trigger | Processor phase |
|---------|-----------------|
| `POSSIBLE_START` | Start validation window |
| `ACTIVE_TICK` | In-trip metric + route sampling |
| `POSSIBLE_END_CHECK` | End candidacy |
| `END_VALIDATION` | CUSUM / classifier validation |
| `FINALIZE` | Terminal lifecycle commit |

### Queues & workers

| Queue | Name | Role |
|-------|------|------|
| Snapshot poll | `dimo.snapshot.poll` | DIMO snapshot fetch → start evaluation |
| Trip tracking | `dimo.trip-tracking` | Self-scheduling FSM execution loop |

Related downstream (not owned): `trip.behavior.enrichment`, `trip.driving-impact.compute`, `driving.intelligence.jobs`.

### Decision engine & lifecycle

- **`TripDecisionEngine`** sole writer of `vehicleTrip.tripStatus` (TDL-EV-P1-001)
- Repair layer routes lifecycle mutations through decision engine

### Persistence (Prisma)

| Model | Purpose |
|-------|---------|
| `VehicleTrip` | Canonical trip row + enrichment/analysis status fields |
| `VehicleTripDetectionState` | Live FSM row (1:1 vehicle) |
| `VehicleTripTrackingRun` | Execution forensics |
| `TripRepair` | Repair audit trail |
| `VehicleTripWaypoint` | Raw route observations |
| `VehicleTripRouteArtifact` | Canonical route artifact (Route V2) |

### Remediation on `main`

R1–R8 merged through #1549; R9 adaptive polling wake documented on post-integration branch (see [evidence/EVIDENCE_INDEX.md](evidence/EVIDENCE_INDEX.md) TDL-EV-R9-*).

---

## CONFIRMED — Production state (read-only)

See [evidence/PRODUCTION_BASELINE.md](evidence/PRODUCTION_BASELINE.md).

| Observation | Value | Evidence ID |
|-------------|-------|-------------|
| Deployed SHA / path | `01541c2ab…` @ `20260906213654_v4994` | TDL-EV-PROD-001 |
| Health | HTTP 200 | TDL-EV-PROD-002 |
| PM2 / Node processes | Two Node PIDs (`3789590`, `3789796`) each running `node …/backend/dist/src/main.js`; 1:1 with PM2 apps `synqdrive` (pid 3789590) and `synqdrive-b` (pid 3789796), each `instances=1` | TDL-EV-PROD-003 |
| FSM states | 6 × RESTING | TDL-EV-PROD-005 |
| Trips | 1994 COMPLETED, 18 CANCELLED, 0 ONGOING | TDL-EV-PROD-006 |
| Route artifacts | 94 | TDL-EV-PROD-007 |
| Tracking runs (7d) | 6964 PS validation, 3753 PEC, 1842 active, 53 finalize, 2 end validation | TDL-EV-PROD-009 |
| Redis key prefixes | snapshot 5, trip-tracking 7 | TDL-EV-PROD-004 |

**Topology wording:** `pgrep -f '/opt/synqdrive/.+/backend/dist/src/main\.js'` returned **two** PIDs at `2026-09-06T23:47:41Z`, each matching one of two **distinct** PM2 application names (`synqdrive`, `synqdrive-b`), each configured with `instances=1`. **Not** described as replicas of a single PM2 application; trip-worker role split was **not** verified beyond PID correlation.

---

## INFERRED behavior

| Inference | Basis |
|-----------|-------|
| Small telematics cohort drives live FSM rows | TDL-EV-PROD-005 vs PROD-009 |
| Reconciliation scans broader history than live FSM | TDL-EV-PROD-008 vs PROD-006 |
| Production trip FSM lacks R8 observability fixes | Repo/Production SHA drift |
| Natural trip processing active | TDL-EV-PROD-009 |

---

## HISTORICAL evidence

- P2–P5 audit Production SSH/SQL failure notes (superseded by 2026-09-06 Production baseline)
- Pre-R1 gap inventories in P4/P5/P6 (closed on `main` via R1–R8)

---

## UNKNOWN facts

- Exact COMPLETED → Driving Intelligence durable handoff (TDL-OQ-001)
- `drive-profile/` ownership (TDL-OQ-002)
- ClickHouse trip-assist runtime on Production
- Complete trip feature-flag matrix
- Full dead/legacy/competing path inventory (**Phase 1 incomplete**)
- Mapbox/FMM failure taxonomy (**Phase 1 incomplete**)

---

## CONTRADICTED claims

| Claim | Conflict |
|-------|----------|
| "Two backend replicas" without role proof | Contradicts TDL-EV-PROD-003 precision | **RESOLVED** — wording corrected; not called replicas |

See [contradictions/OPEN_CONTRADICTIONS.md](contradictions/OPEN_CONTRADICTIONS.md).

---

## Explicit non-claims

- Production validation of R1–R8 (separate from repo/test evidence)
- Production validation of R9 adaptive polling wake (repo/test validated on branch; **NOT_ON_PRODUCTION** at observed release `01541c2ab…`)
- Promotion to `AUTHORITY_ACTIVE`
- Complete machine-readable FSM graph (Phase 4 partial — R9 wake subgraph indexed; full FSM graph incomplete)
- Resolved DIMO Integration vs trip reconciliation ownership

---

## Ownership boundaries (preliminary)

| Owner | Scope |
|-------|-------|
| **Trip Detection & Lifecycle** | Live FSM, start/end detection, tracking queue, boundary persistence, recovery/reconciliation, route artifacts |
| **Driving Intelligence** | Post-trip behavior — consumes boundaries |
| **KG-ATE** | Post-finalize enrichment |
| **KG-EED** | REFUEL/RECHARGE |
| **Scaling Process** | Leader election, DIMO budget, generic mutex |
| **Battery V2** | Downstream trip hooks |
| **DIMO Integration** | Provider layer (`NOT_STARTED`) |

**Open:** COMPLETED handoff to DI; `drive-profile/` ownership.
