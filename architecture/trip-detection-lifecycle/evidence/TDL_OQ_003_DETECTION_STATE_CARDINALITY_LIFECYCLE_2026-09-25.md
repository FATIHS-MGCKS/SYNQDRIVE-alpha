# TDL-OQ-003 — Detection-State Cardinality & Lifecycle Audit (Read-Only)

| Field | Value |
|-------|-------|
| **Evidence ID** | TDL-EVID-OQ003-CARDINALITY-001 |
| **Audit UTC** | `2026-09-25T18:05:00Z` |
| **REPO_CURRENT** | `567a5766f5968e5234ef7dc71699a740b4d55656` (`origin/main` post #1779) |
| **PRODUCTION_CURRENT** | `99d722b4cac865e59e30ad23c82cec11fd9fc9b1` @ `LIVE_RELEASE_ID=20260924235024_v4994` |
| **AUDIT_MODE** | **READ_ONLY** — repository trace + SSH-local `psql` aggregates only |

## Question

Why does Production have a **small** count of `vehicle_trip_detection_states` rows while `vehicle_trip_tracking_runs` are in the **thousands**?

## Verdict

**`RESOLVED_EXPECTED_CARDINALITY`**

The low detection-state row count is **structurally expected**: at most **one row per `vehicleId`**, lazily materialized for vehicles that enter live snapshot/FSM paths, while **`VehicleTripTrackingRun` is append-only during the normal lifetime of a Vehicle** — rows accumulate as historical execution evidence and are **cascade-deleted if the parent Vehicle is deleted** (many runs per vehicle per week). Comparing raw tracking-run counts to detection-state row counts is **not** a coverage metric.

**OQ003_STATUS_AFTER = `RESOLVED`**

---

## Phase 1 — Data model contract

### `VehicleTripDetectionState` (`vehicle_trip_detection_states`)

| Property | Value |
|----------|-------|
| PK | `id` (uuid) |
| Uniqueness | **`vehicleId` @unique** → structurally **≤1 row per vehicle** |
| Vehicle relation | `vehicle Vehicle @relation(..., onDelete: Cascade)` |
| Organization | optional `organizationId` (indexed) |
| Timestamps | `createdAt`, `updatedAt` |
| FSM field | `state TripDetectionState` (default `RESTING`) |

### `VehicleTripTrackingRun` (`vehicle_trip_tracking_runs`)

| Property | Value |
|----------|-------|
| PK | `id` (uuid) |
| Vehicle relation | `vehicleId` (indexed, **not unique**) → **1:N execution log** (append-only while Vehicle exists) |
| onDelete | `Cascade` with `Vehicle` — **tracking runs deleted when parent Vehicle is deleted** |
| Timestamps | `createdAt` only (no `updatedAt`) |
| Semantics | One row per orchestration **execution** (`runType`, `stateAtRun`, optional `tripId`) |

### Cardinalities

| Relationship | Cardinality |
|--------------|-------------|
| **Vehicle : VehicleTripDetectionState** | **0..1 : 1** (unique `vehicleId`) |
| **Vehicle : VehicleTripTrackingRun** | **1 : 0..*** (unbounded over time) |

### Is `COUNT(detection_states)` vs `COUNT(tracking_runs)` meaningful?

**No** for FSM coverage. Tracking runs accumulate on every POSSIBLE_START validation, ACTIVE tick, POSSIBLE_END check, end validation, and finalize attempt. A single persisted FSM row can legitimately correspond to **hundreds–thousands** of runs.

---

## Phase 2 — Creation path inventory (Production code)

**Only production writer that inserts detection-state rows:**

| Path | Location | Mechanism |
|------|----------|-----------|
| **`getOrCreateDetectionState`** | `trip-detection-orchestration.service.ts` | `findUnique` → else `upsert` `create` with profile from `Vehicle.fuelType` |

**No** `vehicleTripDetectionState.create` / `delete` in production TypeScript (tests/harnesses only).

### Callers that **create if missing** (via `getOrCreateDetectionState`)

| PATH | RUNTIME_REACHABLE | CREATES_IF_MISSING | REQUIRES_DIMO_TOKEN | REQUIRES_CONNECTED | REQUIRES_AVAILABLE_OR_RENTED |
|------|-------------------|--------------------|---------------------|--------------------|------------------------------|
| **`evaluateSnapshotForTripStart`** ← `DimoSnapshotProcessor.evaluateTripStart` | YES | YES | YES (processor has `dimoTokenId`) | *De facto* YES (snapshots only for linked DIMO vehicles) | Not checked in `getOrCreate`; scheduler/wake gate upstream |
| **`processPossibleStart`** ← `trip-tracking.processor` | YES | YES | YES (job payload) | Indirect (jobs scheduled from live path) | Indirect |
| **`processActiveTick` / `processPossibleEndCheck` / `processEndValidation` / `processFinalize`** | YES | YES | YES | Indirect | Indirect |
| Lifecycle recovery **`executeLifecycleRecoveryAction`** | YES | NO (uses existing `det` / `transitionState`) | context | — | — |
| Reconciliation | YES | **NO** — `findUnique` only | — | — | — |
| Snapshot wake coordinator FSM read | YES | **NO** — `findUnique` only | — | — | — |
| AI / battery read paths | YES | **NO** — `findUnique` only | — | — | — |

**Primary materialization trigger:** first **`evaluateSnapshotForTripStart`** (RESTING path) or first **trip-tracking** job that acquires orchestration — both call `getOrCreateDetectionState`.

---

## Phase 3 — Update / delete lifecycle

| Question | Answer | Evidence |
|----------|--------|----------|
| **DO_ROWS_PERSIST_AFTER_TRIP_FINALIZE** | **YES** | Finalize → `transitionState(RESTING, …)` — row retained |
| **DOES_RESTING_DELETE_ROW** | **NO** | No production `delete` on detection state |
| **IS_THERE_ANY_PRODUCTION_GC** | **NO** | No scripts/services delete detection-state rows |
| **CAN_VEHICLE_DELETE_CASCADE_STATE** | **YES** | Prisma `onDelete: Cascade` on `vehicleId` |
| **CAN_DISCONNECT_DELETE_STATE** | **NO** | Disconnect does not delete row; vehicle remains |
| **CAN_STATUS_CHANGE_DELETE_STATE** | **NO** | Status change updates eligibility only |

Mutations in production: **`upsert` (create)**, **`update`**, **`updateMany`** (worker locks) on `trip-detection-orchestration.service.ts` only.

---

## Phase 4 — Tracking run semantics

**Writer:** `TripDetectionOrchestrationService.logTrackingRun` → `vehicleTripTrackingRun.create` (errors swallowed with warn).

**Run types** (`TripTrackingRunType`):

| run_type | Typical trigger frequency |
|----------|---------------------------|
| `POSSIBLE_START_VALIDATION` | Each PS job + expiry paths |
| `ACTIVE_TRACKING` | Recurring active ticks while trip open |
| `POSSIBLE_END_CHECK` | End-cycle polling |
| `END_VALIDATION` | CUSUM / qualified stop validation attempts |
| `FINALIZATION_CHECK` | Pre-finalize quality gates |

Runs **persist** through RESTING reset, trip completion, and FSM field clears — they are **historical execution evidence**, not FSM state. Normal runtime **creates** rows via `logTrackingRun`; production code does **not** update or delete them.

**Retention / GC:** No production retention job or `deleteMany` on tracking runs (tests only). Rows **do** disappear when the parent **`Vehicle` is deleted** (`onDelete: Cascade`). All-time Production: **41_330** rows, **6** distinct vehicles.

---

## Phase 5 — Snapshot scheduler eligibility (`DimoSnapshotScheduler`)

**Candidate query** (`enqueueSnapshotJobs`, verified @ `567a5766f…`):

```typescript
where: {
  dimoVehicleId: { not: null },
  status: { in: [VehicleStatus.AVAILABLE, VehicleStatus.RENTED] },
  dimoVehicle: {
    connectionStatus: 'CONNECTED',
    tokenId: { not: null },
  },
},
```

Activity-tier polling further **subsets** this cohort by `providerFetchedAt` / tier interval — but eligibility **definition** is the predicate above.

### Cohort separation

| Cohort | Definition |
|--------|------------|
| **SCHEDULER_COHORT** | DIMO-linked + AVAILABLE/RENTED + CONNECTED + tokenId |
| **FSM_STATE_ROW_COHORT** | Vehicles with ≥1 `vehicle_trip_detection_states` row (lazy superset of processed live-FSM vehicles) |
| **HISTORICAL_TRACKING_RUN_COHORT** | Distinct `vehicle_id` ever appearing in `vehicle_trip_tracking_runs` (≤ all-time FSM-materialized vehicles) |

On current Production: **SCHEDULER_COHORT = FSM_STATE_ROW_COHORT = 6** (full overlap).

---

## Phase 6 — R9 wake interaction

**Chain:** DIMO webhook → `SnapshotWakeIntakeService` → `SnapshotWakeCoordinator` → canonical `dimo.snapshot.poll` job → `DimoSnapshotProcessor` → `evaluateTripStart` → **`evaluateSnapshotForTripStart` → `getOrCreateDetectionState`**.

**Wake eligibility** (`isVehicleSnapshotEligible`): same dimensions as scheduler — tokenId present, `connectionStatus === CONNECTED`, status AVAILABLE or RENTED.

**CAN_WAKE_CREATE_STATE_WITHOUT_REGULAR_POLL_SELECTION = `CONDITIONAL`**

- Wake can enqueue a snapshot **between** tier-throttled scheduler ticks for an **eligible** vehicle → may materialize/update state **without** that vehicle having been selected on the immediately prior 30s tick.
- Wake **cannot** materialize state for vehicles failing `isVehicleSnapshotEligible` (non-eligible continuations are deferred/dropped per wake classifiers).

---

## Phase 7 — Reconciliation separation

`TripReconciliationService` **never** calls `getOrCreateDetectionState`. It may **`createRepairedTrip` / `finalizeRepairedTrip`** via `TripDecisionEngine` from DIMO segment / ignition / motion detectors and repair policies **without** creating a detection-state row.

**RECONCILIATION_TRIP_EXISTENCE ≠ LIVE_FSM_STATE_ROW_EXISTENCE** — explains historical **`vehicle_trips`** and **`trip_repairs`** volume vs small FSM table on a telematics subset fleet.

**RECONCILIATION_REQUIRES_STATE_ROW = `NO`** (optional `findUnique` for hints only).

---

## Phase 8 — Production aggregates @ `2026-09-25T18:05Z`

| Metric | Value |
|--------|------:|
| **TOTAL_VEHICLES** | 9 |
| **VEHICLES_AVAILABLE** | 9 |
| **VEHICLES_RENTED** | 0 |
| **DIMO_LINKED_VEHICLES** | 6 |
| **DIMO_CONNECTED_VEHICLES** | 6 |
| **DIMO_CONNECTED_WITH_TOKEN** | 6 |
| **SNAPSHOT_SCHEDULER_ELIGIBLE** | 6 |
| **DETECTION_STATE_ROWS** | 6 |
| **STATE_RESTING** | 6 |
| **STATE_POSSIBLE_START** | 0 |
| **STATE_ACTIVE_TRIP** | 0 |
| **STATE_IDLE_WITHIN_TRIP** | 0 |
| **STATE_POSSIBLE_END** | 0 |
| **STATE_ENDED** | 0 |

(Prisma `ENDED` enum exists; **no runtime writer** — consistent with Phase 1.)

---

## Phase 9 — Coverage join

| Metric | Value |
|--------|------:|
| **ELIGIBLE_WITH_STATE** | 6 |
| **ELIGIBLE_WITHOUT_STATE** | 0 |
| **STATE_AND_ELIGIBLE** | 6 |
| **STATE_BUT_CURRENTLY_INELIGIBLE** | 0 |
| **ORPHAN_STATE_ROWS** | 0 |
| STATE_WITH_MISSING_VEHICLE | 0 |
| STATE_WITHOUT_DIMO_LINK | 0 |
| STATE_WITH_DISCONNECTED_DIMO | 0 |

**Interpretation:** FSM rows match the **current scheduler-eligible telematics cohort**, not the full 9-vehicle fleet (3 vehicles have no DIMO link).

---

## Phase 10 — Tracking run multiplicity (7d / 30d)

| Metric | Value |
|--------|------:|
| **TRACKING_RUN_ROWS_7D** | 4_273 |
| **TRACKING_RUN_DISTINCT_VEHICLES_7D** | 4 |
| **TRACKING_RUN_ROWS_30D** | 39_674 |
| **TRACKING_RUN_DISTINCT_VEHICLES_30D** | 6 |
| **RUNS_PER_VEHICLE_MIN** (7d) | 332 |
| **RUNS_PER_VEHICLE_MEDIAN** (7d) | 1_241.5 |
| **RUNS_PER_VEHICLE_P95** (7d) | 1_426.8 |
| **RUNS_PER_VEHICLE_MAX** (7d) | 1_458 |

All-time: **41_330** runs, **6** distinct vehicles.

**Primary explanation:** **high execution multiplicity on a small cohort** — not missing state rows for run vehicles (`RUN_VEHICLE_NO_STATE_VEHICLE_EXISTS=0`).

---

## Phase 11 — Historical state coverage (7d run vehicles)

| Class | Count |
|-------|------:|
| **RUN_VEHICLE_HAS_STATE** | 4 |
| **RUN_VEHICLE_NO_STATE_VEHICLE_EXISTS** | 0 |
| **RUN_VEHICLE_NO_STATE_VEHICLE_DELETED** | 0 |

Two eligible vehicles had **no tracking runs in 7d** but **do** have FSM rows (idle RESTING).

---

## Phase 12 — State creation age

| Field | Value |
|-------|-------|
| **STATE_CREATED_MIN** | `2026-04-04T19:38:36.799Z` |
| **STATE_CREATED_MAX** | `2026-07-06T17:27:24.643Z` |
| **Lazy materialization** | Rows created on first live path need; **not** fleet pre-provisioned |

---

## Phase 13 — Historical “6 rows” hypothesis (H1)

**Historical wording (retired as a single claim):**

> Six detection-state rows reflect vehicles with active DIMO snapshot polling only — most fleet vehicles lack live FSM rows until connected.

**Split assessment @ `2026-09-25`:**

| Sub-claim | Result |
|-----------|--------|
| **H1a:** Six detection-state rows correspond to the **current scheduler-eligible DIMO live-FSM cohort** | **CONFIRMED** — `DETECTION_STATE_ROWS=6` = `SNAPSHOT_SCHEDULER_ELIGIBLE=6`; `ELIGIBLE_WITH_STATE=6`; `ELIGIBLE_WITHOUT_STATE=0` |
| **H1b:** **Most** fleet vehicles lack live FSM rows until connected | **NOT CONFIRMED** — `TOTAL_VEHICLES=9`; **6/9** already have FSM rows; only **3** non-DIMO-linked vehicles lack rows (expected, not “most of fleet awaiting connection”) |

**HISTORICAL_SIX_ROW_HYPOTHESIS = `PARTIALLY_CONFIRMED`**

- Cardinality / scheduler-cohort portion **confirmed** (unchanged count vs TDL-EV-PROD-005, now with full join proof).
- **“Most fleet vehicles … until connected”** wording is **historically imprecise** and must not be reused as authority.

---

## Phase 14 — Root cause classification

| Classification | Applies |
|----------------|---------|
| EXPECTED_ONE_ROW_PER_VEHICLE_CARDINALITY | YES |
| EXPECTED_LAZY_MATERIALIZATION | YES |
| EXPECTED_DIMO_ELIGIBILITY_SCOPE | YES |
| EXPECTED_RUN_MULTIPLICITY | YES |
| EXPECTED_RECONCILIATION_WITHOUT_LIVE_FSM | YES (trips >> FSM rows historically) |
| STATE_COVERAGE_GAP | NO (eligible 6/6 materialized) |
| ORPHAN_STATE_ROWS | NO |
| UNEXPECTED_STATE_DELETION | NO |
| ELIGIBLE_VEHICLES_NOT_MATERIALIZED | NO |
| RUNTIME_DEFECT | NO |

**NEW_RUNTIME_DEFECT_FOUND = NO**

---

## Phase 15 — Durable authority contract

1. **`VehicleTripDetectionState` is not a fleet-wide registry.** It is a **per-vehicle live FSM materialization**, lazily created when snapshot start evaluation or trip-tracking orchestration requires FSM persistence.

2. **At most one row per vehicle** (`vehicleId` unique).

3. **`VehicleTripTrackingRun` is append-only during the normal lifetime of a Vehicle** — rows accumulate as historical execution evidence and are **cascade-deleted if the parent Vehicle is deleted**. One state row may correlate with **arbitrarily many** runs while the Vehicle exists.

4. **Never use `COUNT(tracking_runs) / COUNT(detection_states)` as FSM coverage.**

5. **Reconciliation / repair** may create **`vehicle_trips`** without ever creating detection-state rows.

---

## Phase 16 — Operational health metric

**Recommended coverage metric (read-only SQL):**

```text
FSM_STATE_COVERAGE =
  COUNT(scheduler_eligible vehicles WITH detection_state row)
  /
  COUNT(scheduler_eligible vehicles)
```

Production @ audit: **6/6 = 100%**.

**Secondary diagnostic (not coverage):** `tracking_runs_7d / distinct_run_vehicles_7d` → execution intensity (~1_068 median-scale runs/vehicle/week on active subset).

Distinguish **ELIGIBLE_WITHOUT_STATE** (true gap) from **never-yet-polled eligible** (transient before first snapshot) via age of eligibility vs `detection_states.created_at`.

---

## Phase 17 — OQ-003 closure

| Field | Value |
|-------|-------|
| **TDL_OQ_003_AUDIT_RESULT** | `RESOLVED_EXPECTED_CARDINALITY` |
| **TDL-DEC-OQ003-001** | Detection-state vs tracking-run cardinality contract (see DECISION_REGISTER) |

---

## Reproduce (read-only)

```bash
# Production SHA
ssh synqdrive-admin@srv1374778.hstgr.cloud \
  'readlink -f /opt/synqdrive/current; tr -d "\n" < /opt/synqdrive/current/.git/HEAD; echo'

# Aggregates (sudo source backend.env; strip ?schema= from DATABASE_URL)
# See Phase 8–10 queries in audit workpaper — aggregate-only, no PII exported.
```
