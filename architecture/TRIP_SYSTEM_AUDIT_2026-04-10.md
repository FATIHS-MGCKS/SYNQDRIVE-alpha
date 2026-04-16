# SynqDrive V2 Trip Detection System — Deep Architecture & Logic Audit

**Date:** 2026-04-10
**Scope:** Complete trip start/end detection, persistence, sync, enrichment, downstream dependencies, observability
**Method:** Full line-by-line code inspection of all trip-related files

---

## 1. Executive Summary

The SynqDrive V2 trip detection system is a **snapshot-driven state machine** that evaluates DIMO telemetry snapshots every 30 seconds, transitions through a 6-state FSM (RESTING → POSSIBLE_START → ACTIVE_TRIP → IDLE_WITHIN_TRIP → POSSIBLE_END → back to RESTING), and finalizes trips using a CUSUM-based end-detection algorithm. It is architecturally ambitious and generally well-structured.

However, the audit reveals **two parallel trip creation pipelines** (V2 live detection and V1 "Sync Trips"), **systematic timing gaps** that explain why trips sometimes appear only after manual sync, **a dead audit trail**, and **downstream modules silently degrading** when trip data is missing or enrichment hasn't run.

**Key findings:**
1. **V2 live detection works** but depends on a chain of 5+ async stages with cumulative latency of 3-30+ minutes from trip end to full enrichment.
2. **"Sync Trips" is a V1 legacy pipeline** that uses a completely different detection algorithm (ignition gap heuristic) and writes to the **same `VehicleTrip` table** — it acts as a de facto reconciliation layer.
3. **Driving event counts (acceleration/braking) remain 0** until HF behavior enrichment runs, which is queued asynchronously after finalization and may fail silently.
4. **Frontend reads the same `VehicleTrip` table** as backend writes, but trip visibility depends on whether V2 has finalized or V1 sync has backfilled.
5. **No single canonical trip truth** — V2 detection, V1 sync, and manual enrichment all mutate the same records with different logic.

---

## 2. Relevant File/Component Inventory

### Trip Detection Core

| File | Component | Purpose | Relation to Trip Start/End |
|------|-----------|---------|---------------------------|
| `backend/src/modules/vehicle-intelligence/trips/trip-detection-orchestration.service.ts` | `TripDetectionOrchestrationService` | FSM orchestrator — all state transitions, trip creation, trip finalization | **Central decision maker** for V2 start/end |
| `backend/src/modules/vehicle-intelligence/trips/trip-evidence.helpers.ts` | Pure functions | Signal evaluation, evidence scoring, continuity assessment, quality checks | Start evidence, end evidence, merge/discard logic |
| `backend/src/modules/vehicle-intelligence/trips/trip-cusum.ts` | `detectTripEndChangePoint` | CUSUM algorithm for trip end validation | End detection confirmation |
| `backend/src/modules/vehicle-intelligence/trips/trip-detection.types.ts` | Types/constants | FSM states, triggers, detection modes, job data types | State definitions |

### Schedulers & Processors

| File | Component | Purpose |
|------|-----------|---------|
| `backend/src/workers/schedulers/dimo-snapshot.scheduler.ts` | `DimoSnapshotScheduler` | Every 30s — enqueues snapshot jobs for eligible vehicles |
| `backend/src/workers/processors/dimo-snapshot.processor.ts` | `DimoSnapshotProcessor` | Fetches DIMO snapshot → normalizes → upserts VehicleLatestState → **evaluates trip start** |
| `backend/src/workers/processors/trip-tracking.processor.ts` | `TripTrackingProcessor` | Bull queue consumer — dispatches triggers to orchestration service |
| `backend/src/workers/schedulers/trip-tracking-recovery.scheduler.ts` | `TripTrackingRecoveryScheduler` | Every 120s — re-enqueues jobs for vehicles stuck in non-RESTING states |

### Enrichment Pipeline

| File | Component | Purpose |
|------|-----------|---------|
| `backend/src/modules/vehicle-intelligence/trips/trip-enrichment-orchestrator.service.ts` | `TripEnrichmentOrchestratorService` | Enqueues HF behavior enrichment + driving impact after finalization |
| `backend/src/workers/processors/trip-behavior-enrichment.processor.ts` | `TripBehaviorEnrichmentProcessor` | Bull consumer → delegates to `runEnrichmentSync` |
| `backend/src/modules/vehicle-intelligence/trips/trip-behavior-enrichment.service.ts` | `TripBehaviorEnrichmentService` | Fetches 1s HF data, detects accel/brake/abuse events, persists behavior |
| `backend/src/workers/processors/driving-impact.processor.ts` | `DrivingImpactProcessor` | Bull consumer → computes stress scores from enriched trip |
| `backend/src/modules/vehicle-intelligence/driving-impact/driving-impact.service.ts` | `DrivingImpactService` | Longitudinal/braking/thermal stress scoring, rolling window update |

### V1 Legacy / Sync

| File | Component | Purpose |
|------|-----------|---------|
| `backend/src/modules/vehicle-intelligence/trips/trips.service.ts` | `TripsService` | CRUD + **`syncTripsFromSegments`** (V1 ignition-gap detection) + route enrichment |
| `backend/src/modules/dimo/dimo-segments.service.ts` | `DimoSegmentsService` | DIMO GraphQL queries for all trip-related signal windows |

### Frontend

| File | Purpose |
|------|---------|
| `frontend/src/rental/components/TripsView.tsx` | Trip list, detail, sync button, behavior analysis display |
| `frontend/src/lib/api.ts` | API client — all trip endpoint definitions |

### Downstream Consumers

| File | What It Reads | Impact If Missing |
|------|---------------|-------------------|
| `health-summary.service.ts` | `tripsService.getStats()`, last 90d trips | `drivingScore: 0`, `tripPattern: null`, `dataQuality.missing: ['trips']` |
| `tire-health.service.ts` | `DrivingImpactService.getVehicleImpactForTire()` | Neutral factors (1.0), reduced confidence |
| `tire-wear-model.service.ts` | Last 90d trips for temperature, driving impact | Neutral wear model |
| `rental-driving-analysis.service.ts` | `tripsService.findByVehicle()` in booking window | `drivingScore: null`, `periodTrips: 0` |
| `vehicle-intelligence.controller.ts` (brake-status) | Last 90d `vehicleTrip` | Empty harsh braking stats |
| `battery-v2.service.ts` | `onTripStart()` called during trip creation | No crank voltage capture |

---

## 3. End-to-End Flow Map

### V2 Live Detection Pipeline

```
[Every 30s] DimoSnapshotScheduler
    │
    ▼
DimoSnapshotProcessor.process()
    │
    ├─ 1. getVehicleJwt(tokenId)
    ├─ 2. fetchLatestVehicleSnapshot(jwt, tokenId)
    ├─ 3. normalizeSnapshot(signals)
    ├─ 4. vehicleLatestState.upsert(normalized)
    ├─ 5. batteryV2.onSnapshot() [fire-and-forget]
    ├─ 6. hvBattery.recordSnapshot() [conditional, fire-and-forget]
    │
    └─ 7. evaluateTripStart(vehicleId, tokenId, previousState, normalized)
           │
           ▼
       TripDetectionOrchestrationService.evaluateSnapshotForTripStart()
           │
           ├─ Guard: state must be RESTING
           ├─ Guard: cooldown 5min since last state change
           ├─ evaluateSnapshotEvidence() → strong/weak signal scoring
           │
           └─ If triggered: state → POSSIBLE_START
                                │
                                ▼
              [Queue: dimo.trip-tracking, trigger: POSSIBLE_START, delay: 0]
                                │
                                ▼
              TripTrackingProcessor.process() → orchestration.processPossibleStart()
                                │
                  ├─ acquireWorkerLock()
                  ├─ fetchRawTripCoreData(tokenId, startAt-60s, now) [DIMO GraphQL 20s buckets]
                  ├─ validateTripStart(corePoints, telemetry, profile)
                  │
                  ├─ IF confirmed:
                  │   ├─ checkTripQuality() → merge with previous OR create new
                  │   ├─ vehicleTrip.create(ONGOING) OR vehicleTrip.update(ONGOING)
                  │   ├─ state → ACTIVE_TRIP
                  │   ├─ batteryV2.onTripStart() [fire-and-forget]
                  │   ├─ fetchAndStoreStartTemperature() [fire-and-forget]
                  │   ├─ fetchAndStoreInitialRoute() [fire-and-forget]
                  │   └─ [Queue: ACTIVE_TICK, delay: 60s]
                  │
                  └─ IF not confirmed:
                      ├─ IF elapsed > 180s: state → RESTING (timeout)
                      └─ ELSE: re-enqueue POSSIBLE_START with delay: 30s

              ─── ACTIVE TRIP PHASE ───

              [Queue: ACTIVE_TICK, repeating every ~60s]
                  │
                  ├─ acquireWorkerLock()
                  ├─ Parallel DIMO fetches: core, route, performance
                  ├─ Store waypoints
                  ├─ Update trip metrics (distance, fuel, energy, speeds)
                  ├─ assessActiveContinuity(recentCore, perfActive, profile)
                  │
                  ├─ ACTIVE → scheduleActiveTick(60s)
                  ├─ IDLE → scheduleActiveTick(60s)
                  └─ POSSIBLE_END → state transition, schedulePossibleEndCheck()

              ─── END DETECTION PHASE ───

              [Queue: POSSIBLE_END_CHECK]
                  │
                  ├─ Check activity resumed? → back to ACTIVE_TRIP
                  ├─ Hard timeout (30min)? → scheduleFinalize
                  ├─ CUSUM gate (3min)? → re-schedule
                  ├─ Attempts < 3? → scheduleEndValidation
                  └─ Max attempts → scheduleFinalize

              [Queue: END_VALIDATION]
                  │
                  ├─ fetchEndValidationWindow(15min lookback, 5min lookahead)
                  ├─ detectTripEndChangePoint(corePoints) [CUSUM]
                  │
                  ├─ appearsOngoing → back to ACTIVE_TRIP
                  ├─ changePointDetected → scheduleFinalize
                  └─ inconclusive → re-schedule POSSIBLE_END_CHECK

              [Queue: FINALIZE]
                  │
                  ├─ Resolve end time: CUSUM end > lastMovement > lastWaypoint > possibleEndAt > now
                  ├─ checkTripQuality() → discard (CANCELLED) or complete
                  ├─ vehicleTrip.update(COMPLETED)
                  ├─ enqueueBehaviorEnrichment(tripId) [Queue: trip.behavior.enrichment, delay: 5s]
                  └─ state → RESTING

              ─── ENRICHMENT PHASE ───

              [Queue: trip.behavior.enrichment, delay 5s, attempts: 3]
                  │
                  ├─ fetchHighFrequency(tokenId, startTime, endTime) [1s intervals]
                  ├─ Detect accel/brake/abuse events
                  ├─ Persist TripBehaviorEvent rows
                  ├─ Update trip counters (harshAccelCount, harshBrakeCount, etc.)
                  └─ [Queue: trip.driving-impact.compute]
                      │
                      ├─ computeForTrip() → stress scores
                      ├─ tripDrivingImpact.upsert()
                      └─ vehicleDrivingImpactCurrent.upsert() (30-day rolling)
```

### V1 "Sync Trips" Pipeline

```
[User clicks "Sync Trips" in frontend]
    │
    ▼
POST /api/v1/vehicles/:vehicleId/trips/sync
    │
    ▼
TripsService.syncTripsFromSegments(vehicleId, tokenId, from, to)
    │
    ├─ DimoSegmentsService.fetchAndDetectTrips(tokenId, from, to)
    │   │
    │   ├─ fetchTripCoreData(jwt, tokenId, from, to) [20s GraphQL buckets]
    │   └─ detectTrips(corePoints) [V1 IGNITION-GAP HEURISTIC]
    │       ├─ Trip start: ignition ON OR speed > 5
    │       ├─ Trip end: 20-min gap with ignition OFF AND speed ≤ 5
    │       └─ Discard: duration < 60s OR odometer < 0.1km
    │
    ├─ For each detected trip:
    │   ├─ Check: dimoSegmentId already exists? → skip
    │   ├─ Check: overlaps with existing trip within 5min? → skip
    │   ├─ vehicleTrip.create(COMPLETED) ← immediately completed
    │   ├─ computeDrivingScore(trip)
    │   └─ enqueueBehaviorEnrichment()
    │
    └─ Return: number of new trips synced
```

### Asynchronous Boundaries

| Boundary | Mechanism | Latency |
|----------|-----------|---------|
| Snapshot scheduler → snapshot job | Bull queue, immediate | ~1-5s |
| Snapshot job → trip start eval | Inline await in processor | 0ms (synchronous) |
| Trip start eval → POSSIBLE_START job | Bull queue, delay 0-30s | 0-30s |
| POSSIBLE_START → ACTIVE_TICK | Bull queue, delay 60s | ~60s |
| ACTIVE_TICK → ACTIVE_TICK (repeating) | Bull queue, delay 60s | ~60s per tick |
| POSSIBLE_END → END_VALIDATION | Bull queue, gated by 3min stability | 3-30min |
| FINALIZE → behavior enrichment | Bull queue, delay 5s | 5s + execution |
| Behavior enrichment → driving impact | Bull queue, immediate | seconds |

**Total latency from trip end to fully enriched trip visible with events: 5-35 minutes typical.**

---

## 4. Current Trip Start Logic

### Entry Point
`DimoSnapshotProcessor.evaluateTripStart()` → `TripDetectionOrchestrationService.evaluateSnapshotForTripStart()`

### Guards (must ALL pass)
1. Detection state must be `RESTING`
2. Cooldown: at least 5 minutes since last state change (`COOLDOWN_MS = 300_000`)
3. Snapshot evidence must trigger

### Snapshot Evidence Scoring (`evaluateSnapshotEvidence()`)
Uses a **weighted signal scoring system** with profile-specific thresholds (ICE/EV/HYBRID/UNKNOWN):

**Strong signals** (each adds 1-2 points):
- Ignition ON (+2 for ICE/HYBRID, +1 for EV/UNKNOWN)
- Speed > threshold (ICE: 5 km/h, EV: 3 km/h)
- Engine load > 15% (+1 strong for ICE, +1 weak for EV)
- Traction battery power ≤ -25kW (+2), ≤ -12kW (+1), ≤ -4kW (+1 weak)
- GPS displacement > 50m (+1 strong), > 15m (+1 weak)
- Odometer delta > 0.05km (+1 strong)
- EV SoC change > 0.5% (+1 strong for EV/HYBRID)

**Weak signals** (each adds 1 point):
- Low speed (0 < speed ≤ threshold)
- Low engine load (0-15%, non-EV)
- Fuel level change > 0.2L
- Battery power between -4 and -12kW

**Trigger condition:** `strong ≥ 2 OR (strong ≥ 1 AND hasMovement) OR weak ≥ 3`

### Confirmation Phase (`validateTripStart()`)
After POSSIBLE_START, fetches 20s-interval DIMO core data from `[startAt - 60s, now]` and validates:
- **Confirmed if ANY of:**
  - `maxConsecutiveActive ≥ 3` (3+ consecutive active data points)
  - `activeDurationMs ≥ 60s` (1 minute of active data)
  - `maxConsecutiveActive ≥ 2 AND weighted score ≥ 50% of max`
  - `maxConsecutiveActive ≥ 2 AND current telemetry shows ignition+speed`

### Key Answers

| Question | Answer |
|----------|--------|
| Is ignition mandatory? | **No.** Ignition is a strong signal (especially ICE) but not required. Motion + GPS + odometer can trigger without ignition. |
| Is movement/speed mandatory? | **No** for triggering (3 weak signals suffice). **Yes** for high-confidence confirmation. |
| Is odometer delta used? | **Yes**, as a strong signal (> 0.05km) |
| Are multiple snapshots needed? | **Yes** for confirmation. Single snapshot triggers POSSIBLE_START; confirmation window uses 20s-interval DIMO data over ~60-90s. |
| Is there a pre-start state? | **Yes**: `POSSIBLE_START` with up to 180s confirmation window, re-checked every 30s. |
| Debounce window? | 5-minute cooldown after any state change; 30s re-check for unconfirmed starts; 180s max wait. |

### Conceptual Behavior

| Scenario | Expected Behavior |
|----------|-------------------|
| Ignition ON + no movement | POSSIBLE_START triggered (ICE strong=2 from ignition+engineLoad). Confirmation may fail if no consecutive active points with speed. Timeout after 180s → RESTING. |
| Movement without ignition | POSSIBLE_START if speed > threshold + GPS/odometer. Confirmation depends on sustained motion in core data. |
| Very short movement | May trigger POSSIBLE_START but confirmation requires ≥3 consecutive active points or 60s duration. Brief jitter likely filtered. |
| Jitter/noise | GPS drift < 15m ignored. Speed noise at threshold may produce weak signals but rarely reaches `strong ≥ 2`. |
| Delayed telemetry | Snapshot arrives late but with stale data → evidence evaluated against last-known state. May miss real-time start by 30-60s. |

---

## 5. Current Trip End Logic

### End Detection Entry
`processActiveTick()` → `assessActiveContinuity()` returns `POSSIBLE_END`

### Continuity Assessment (8-level priority chain)
1. **Motion or odometer progress** → `ACTIVE` (trip continues)
2. **Stopped + ICE engine active** (RPM > 600 OR throttle > 5% OR load > 10%) → `IDLE` (traffic stop)
3. **Stopped + energy activity** (fuel/SoC change) → `IDLE`
4. **Stopped + EV/HYBRID + active telemetry frequency** → `IDLE` (EV traffic stop fix)
5. **Stopped + ignition OFF + no energy change** → `POSSIBLE_END` (HIGH confidence)
6. **Stopped + frequency dropped to resting** → `POSSIBLE_END` (MEDIUM)
7. **Stopped + stale ignition ON + no perf/energy activity** → `POSSIBLE_END` (MEDIUM, stale-ignition guard)
8. **Ambiguous** → `POSSIBLE_END` (LOW, conservative fallback)

### POSSIBLE_END Processing Chain

**Step 1 — Resume check:** Fetch last 90s of core data. If any speed > motion threshold → back to `ACTIVE_TRIP`.

**Step 2 — Hard timeout:** If elapsed since `possibleEndAt` ≥ 30 minutes → force finalize.

**Step 3 — CUSUM gate:** Must wait at least `max(stabilityWindow=180s, minInactivityBeforeCusum=180s)` before CUSUM.

**Step 4 — CUSUM validation:** If attempts < 3, transition to END_VALIDATION:
- Fetch 15min lookback + 5min lookahead around end candidate
- Run CUSUM algorithm (stopped threshold 2 km/h, decision threshold H=3.0)
- If `appearsOngoing` → back to ACTIVE_TRIP
- If `changePointDetected` → schedule FINALIZE with CUSUM-determined end time
- If inconclusive → re-schedule POSSIBLE_END_CHECK with 120s delay

**Step 5 — Max attempts:** After 3 CUSUM attempts → force finalize.

### Finalization
- End time priority: `cusumSegmentEnd` → `lastMeaningfulMovementAt` → `lastWaypoint.recordedAt` → `possibleEndAt` → `now`
- Quality check: discard if `duration < 60s AND distance < 0.1km`
- Merge: if gap to previous completed trip < 5 minutes
- Write: `vehicleTrip.update({ tripStatus: COMPLETED, endTime, ... })`
- Enqueue: behavior enrichment

### Key Answers

| Question | Answer |
|----------|--------|
| Is end based on ignition OFF? | **Not exclusively.** Ignition OFF is HIGH-confidence signal but stale ignition ON is explicitly handled (won't block end). |
| Grace period? | **3 minutes** minimum (stability + CUSUM gate), up to **30 minutes** hard timeout. |
| Short-gap merge? | **Yes.** If previous trip ended < 5 min before current trip starts, merge by reopening previous trip. |
| Can a trip reopen? | **Yes.** From POSSIBLE_END, if speed detected → back to ACTIVE_TRIP. From END_VALIDATION, if CUSUM says `appearsOngoing` → back to ACTIVE_TRIP. |

### Conceptual Behavior

| Scenario | Expected Behavior |
|----------|-------------------|
| Short stop at traffic light | IDLE (ICE: RPM/load active. EV: active frequency). Stays in trip. |
| Stop-and-go traffic | Alternates ACTIVE/IDLE within trip. Works correctly. |
| Ignition OFF briefly then ON | POSSIBLE_END (if speed stops). Resume check may catch restart. If gap < 3min, CUSUM gate prevents premature end. If gap < 5min, merge logic applies at next trip start. |
| Telemetry gap during active trip | Active tick errors → reschedule. Recovery scheduler re-enqueues every 120s. Trip persists but may accumulate stale waypoints. |
| Parking after real drive | POSSIBLE_END → CUSUM validation → FINALIZE. Typical 3-10 min from actual stop to finalized trip. |
| Delayed/out-of-order snapshots | CUSUM may receive out-of-order points. Not explicitly sorted in `detectTripEndChangePoint` — relies on DIMO returning sorted data. |

---

## 6. Current State Machine / Hidden State Model

### Explicit FSM States (Prisma `TripDetectionState` enum)

| State | Meaning | Entered When | Exited When | Side Effects | Risks |
|-------|---------|-------------|-------------|-------------|-------|
| `RESTING` | No active trip | Finalization complete; start timeout; initial state | Snapshot evidence triggers | Detection state reset | 5-min cooldown may miss quick turnaround |
| `POSSIBLE_START` | Start candidate | Snapshot evidence scores ≥ threshold | Confirmed (→ ACTIVE) or timeout (→ RESTING) | Queue: POSSIBLE_START job | 180s max → may reject legitimate slow starts |
| `ACTIVE_TRIP` | Trip in progress, vehicle moving | Start confirmed; activity resumed from POSSIBLE_END/IDLE | No more motion detected | Trip created/updated, waypoints stored | Missing DIMO data → silent degradation |
| `IDLE_WITHIN_TRIP` | Stopped but trip open | ICE engine active or EV frequency active while stopped | Motion resumes or end triggered | Continues active ticking | Long idle (traffic jam) accumulates empty ticks |
| `POSSIBLE_END` | End candidate | Continuity assessment finds inactivity | Activity resumes or CUSUM confirms end | CUSUM validation queued | Up to 3 CUSUM attempts + 30min hard timeout |
| `ENDED` | (defined in enum but **never used** in code) | — | — | — | Dead state — potential confusion |

### Hidden/Implicit States

| State | Where | Evidence |
|-------|-------|---------|
| **POSSIBLE_START awaiting confirmation** | `processPossibleStart` re-enqueues with 30s delay up to 180s | Not a separate DB state; appears as repeated POSSIBLE_START jobs |
| **END_VALIDATION in progress** | `endValidationAttempts` counter on detection state | Piggybacked on POSSIBLE_END state with counter |
| **Enrichment pending** | `behaviorEnrichmentStatus` on `VehicleTrip` | Separate status field: PENDING → IN_PROGRESS → COMPLETED/SKIPPED/FAILED |
| **Driving impact pending** | `drivingImpactComputedAt` null vs set | Null = not computed yet |
| **Worker locked** | `workerLockedUntil` + `workerRunToken` on detection state | Prevents concurrent processing |

### State Transition Table

```
RESTING ──[snapshot evidence triggers]──→ POSSIBLE_START
POSSIBLE_START ──[confirmed]──→ ACTIVE_TRIP
POSSIBLE_START ──[timeout 180s]──→ RESTING
ACTIVE_TRIP ──[motion continues]──→ ACTIVE_TRIP
ACTIVE_TRIP ──[stopped + engine active]──→ IDLE_WITHIN_TRIP
ACTIVE_TRIP ──[inactivity detected]──→ POSSIBLE_END
IDLE_WITHIN_TRIP ──[motion resumes]──→ ACTIVE_TRIP
IDLE_WITHIN_TRIP ──[inactivity deepens]──→ POSSIBLE_END
POSSIBLE_END ──[activity resumes]──→ ACTIVE_TRIP
POSSIBLE_END ──[CUSUM confirms end]──→ RESTING (via FINALIZE)
POSSIBLE_END ──[hard timeout 30min]──→ RESTING (via FINALIZE)
POSSIBLE_END ──[max CUSUM attempts]──→ RESTING (via FINALIZE)
```

---

## 7. Timing / Scheduler / Gap Analysis

### Timing Map

| Component | Interval/Delay | Purpose |
|-----------|---------------|---------|
| Snapshot scheduler | 30s | Enqueue snapshot poll per vehicle |
| Snapshot → trip eval | inline | No additional delay |
| POSSIBLE_START job | 0ms delay | Immediate |
| POSSIBLE_START re-check | 30s delay | Retry confirmation |
| POSSIBLE_START max wait | 180s | Timeout to RESTING |
| Start cooldown | 300s (5 min) | Prevent rapid re-triggering |
| ACTIVE_TICK interval | 60s | Tracking interval |
| Recovery scheduler | 120s | Re-enqueue stuck states |
| POSSIBLE_END re-check | 60s (default) | Check for resume or CUSUM readiness |
| CUSUM stability gate | 180s | Min time before CUSUM |
| END_VALIDATION retry | 120s | Retry inconclusive CUSUM |
| END_VALIDATION max attempts | 3 | Force finalize after 3 failures |
| Hard timeout | 1,800s (30 min) | Force finalize regardless |
| CUSUM lookback | 900s (15 min) | Historical window for end detection |
| CUSUM lookahead | 300s (5 min) | Future window for end detection |
| Enrichment delay | 5s | Wait for DIMO data availability |
| Enrichment retries | 3, exponential backoff 10s | Transient error recovery |

### Race Conditions

1. **Snapshot + recovery scheduler overlap:** Both can enqueue trip tracking jobs for the same vehicle. Worker lock prevents double-processing but wastes queue capacity.
2. **POSSIBLE_START re-enqueue + recovery:** Recovery scheduler fires every 120s; POSSIBLE_START re-checks every 30s. If worker lock expires between retries, recovery creates a duplicate job.
3. **ACTIVE_TICK failure + recovery:** On error, active tick self-reschedules AND recovery may also enqueue. Lock prevents double-execution but jobs accumulate in queue.

### Why Trips Appear Late

1. **V2 finalization latency:** POSSIBLE_END → 3min gate → CUSUM (up to 3 attempts × 120s) → FINALIZE. Worst case: **~10 minutes** after actual stop.
2. **Hard timeout path:** If CUSUM never triggers (insufficient data), **30 minutes** before forced finalize.
3. **Enrichment async:** After FINALIZE, behavior enrichment runs with 5s delay + processing time. Until complete, `harshAccelCount = 0`, `harshBrakeCount = 0`.
4. **Frontend polling:** TripsView fetches on mount and after explicit actions. No automatic refresh — user must navigate away and back or press sync.

---

## 8. Persistence / Source of Truth Analysis

### Where Trips Are Stored

**Single table: `vehicle_trips`** — used by both V2 detection and V1 sync.

### V2 Detection Writes

| When | What | Who |
|------|------|-----|
| Trip start confirmed | `vehicleTrip.create({ tripStatus: ONGOING, dimoSegmentId: 'v2-...' })` | Orchestration service |
| Active tick | `vehicleTrip.update({ endCoords, distanceKm, fuelConsumed, ... })` | Orchestration service |
| Finalization | `vehicleTrip.update({ tripStatus: COMPLETED, endTime, ... })` | Orchestration service |
| Enrichment | `vehicleTrip.update({ harshAccelCount, harshBrakeCount, behaviorEnrichedAt, ... })` | Enrichment service |
| Driving impact | `tripDrivingImpact.upsert(...)` | Driving impact service |

### V1 Sync Writes

| When | What | Who |
|------|------|-----|
| Sync triggered | `vehicleTrip.create({ tripStatus: COMPLETED, ... })` — immediately complete | Trips service |
| Score computed | `vehicleTrip.update({ drivingScore })` | Trips service |
| Enrichment queued | Same enrichment pipeline as V2 | Enrichment orchestrator |

### Multiple Representations?

| Representation | Table | Written By |
|---------------|-------|-----------|
| Canonical trip | `vehicle_trips` | Both V2 and V1 |
| Detection state | `vehicle_trip_detection_states` | V2 only |
| Tracking runs | `vehicle_trip_tracking_runs` | V2 only |
| Behavior events | `trip_behavior_events` | Enrichment only |
| Driving impact | `trip_driving_impact` | Impact compute only |
| Rolling impact | `vehicle_driving_impact_current` | Impact compute only |

### Source of Truth Verdict

**There is no single canonical trip truth.** The `vehicle_trips` table is the shared store, but:
- V2 writes `ONGOING` trips that are eventually `COMPLETED` — there is a window where the trip exists but is incomplete.
- V1 sync writes `COMPLETED` trips directly — they appear "instantly" complete.
- V2 `dimoSegmentId` uses synthetic `v2-${vehicleId}-${startTime}` IDs, while V1 uses DIMO-derived segment IDs.
- Deduplication logic (`deduplicateTrips()`) exists but must be triggered manually.
- Both pipelines can create trips for the same time window if V2 misses a trip and user syncs.

---

## 9. Sync Trips Analysis

### What "Sync Trips" Does

`POST /api/v1/vehicles/:vehicleId/trips/sync` → `TripsService.syncTripsFromSegments()`

1. **Loads vehicle** with DIMO token
2. **Fetches DIMO core data** via `DimoSegmentsService.fetchAndDetectTrips(tokenId, from, to)`
3. **Detects trips using V1 algorithm:** ignition ON/speed > 5 = start; 20-min gap with ignition OFF/speed ≤ 5 = end; min duration 60s; odometer < 0.1km = discard
4. **For each detected trip:**
   - Checks if `dimoSegmentId` already exists → skip
   - Checks if overlaps within 5 minutes of existing trip → skip
   - Creates `COMPLETED` trip with `drivingScore` from `computeDrivingScore()` (basic speed-penalty formula)
   - Enqueues behavior enrichment

### Why Trips Appear Only After Sync

**Root cause: V2 pipeline may fail to start/detect/finalize for several reasons:**
1. **DIMO snapshot returns no `signalsLatest`** → snapshot processor throws, no trip eval
2. **Snapshot evidence doesn't trigger** (signals below threshold, e.g. ignition ON but no speed data in snapshot)
3. **POSSIBLE_START confirmation fails** (insufficient core data points from DIMO within 180s window)
4. **Trip stuck in POSSIBLE_END** → hard timeout takes 30 minutes
5. **Worker lock not released** (process crash) → recovery scheduler eventually picks up, but 2-min interval

V1 sync bypasses all of this by analyzing historical data after the fact. It uses a simpler ignition-gap heuristic that may catch trips V2 missed.

### Is Sync the "Real" Trip Generator?

**Sync is effectively a reconciliation tool that doubles as a fallback trip generator.** It:
- Fills gaps where V2 missed trips
- Uses a different algorithm with different thresholds
- Creates immediately-complete trips (no ONGOING phase)
- Uses different `dimoSegmentId` naming than V2

**Risk:** If both V2 and sync create trips for the same drive, the deduplication logic must be triggered manually. Without it, trips can be duplicated.

---

## 10. Frontend / API Read Model Analysis

### Frontend Data Flow

| UI Element | API Call | Data Source | Timing |
|-----------|----------|-------------|--------|
| Trip list | `GET /vehicles/:id/trips` | `TripsService.findByVehicle()` → `vehicleTrip.findMany` | On component mount + after sync |
| Trip route | `GET /vehicles/:id/trips/:tripId/route` | `TripsService.getRouteForTrip()` → stored waypoints OR lazy DIMO fetch | On trip expand |
| Sync action | `POST /vehicles/:id/trips/sync` | `TripsService.syncTripsFromSegments()` | On button click |
| Behavior events | `GET /vehicles/:id/trips/:tripId/behavior-events` | Inline Prisma: `tripBehaviorEvent + drivingEvent` | On trip expand (if enriched) |
| Auto-enrich | `POST /vehicles/:id/trips/:tripId/behavior-enrich` | `enrichmentOrchestrator.runEnrichmentSync()` | Auto-triggered for completed trips without enrichment |

### Truth Alignment

| Aspect | Backend Writes | Frontend Reads | Aligned? |
|--------|---------------|----------------|---------|
| Trip existence | V2: ONGOING → COMPLETED; V1: COMPLETED directly | `findMany` → same table | **Partially** — ONGOING trips visible in list but incomplete |
| Trip end time | V2: set at finalization; V1: set at creation | Same `endTime` field | **Yes** once finalized |
| Driving events | Enrichment writes `tripBehaviorEvent` | Reads `tripBehaviorEvent + drivingEvent` | **Yes** but delayed (async enrichment) |
| Harsh counts | Enrichment updates trip counters | Reads from trip object | **Delayed** — 0 until enrichment completes |
| Route | V2 stores waypoints during active tick; V1 lazy-fetches on demand | Reads stored waypoints OR triggers lazy fetch | **Variable** — V2 trips have waypoints; V1 trips may need fetch |

### Key Divergence

The frontend auto-triggers `enrichTripBehavior` for completed trips with `behaviorEnrichmentStatus === null`. This means:
- First load: trip visible, events = 0, behavior = empty
- Frontend fires enrich
- User must reload to see results
- **UX gap:** No automatic refresh after enrichment completes

---

## 11. Downstream Dependency Analysis

| Module | Trigger Source | Required Input | Failure Mode (Missing Trip) | Failure Mode (Late Trip) | Failure Mode (Missing Enrichment) |
|--------|---------------|----------------|---------------------------|-------------------------|----------------------------------|
| **Tire Health** | Manual tire health compute | `DrivingImpactService` → `vehicleDrivingImpactCurrent` | Neutral factors (1.0), reduced confidence | Delayed stress score update | Neutral factors until impact computed |
| **Tire Wear Model** | Tire health compute | Last 90d trips (temperature), driving impact | Neutral wear factors, no temperature weighting | Delayed temperature data | Neutral wear model |
| **Brake Health** | `brake-status` endpoint | Last 90d `vehicleTrip` harsh braking counts | Empty braking stats | Stale stats | `harshBrakeCount = 0` (misleading) |
| **Health Summary** | On-demand API | `tripsService.getStats()`, recent trips | `drivingScore: 0`, pattern: null, missing flag | Stale score | Score based on incomplete counts |
| **Rental Analysis** | Booking completion | Trips in booking window | `drivingScore: null`, `periodTrips: 0` | May miss recent trips | Counts = 0 for harsh events |
| **Battery V2** | Trip start (fire-and-forget) | Crank window HF data | No crank voltage captured | Crank data potentially stale | N/A (battery uses trip start, not end) |
| **Business Insights** | 30-min scheduler | Stored rental analyses (indirect) | Neutral/no driving alerts | Delayed insight generation | Score-based insights degraded |

---

## 12. Failure Scenario Test Matrix

| # | Scenario | Expected V2 Behavior | Likely Actual Behavior | Risk Areas |
|---|----------|---------------------|----------------------|------------|
| 1 | Ignition ON + normal drive | POSSIBLE_START → confirmed → ACTIVE_TRIP → waypoints → POSSIBLE_END → CUSUM → COMPLETED | Works as designed IF DIMO returns data. 3-10 min lag from stop to completion. | DIMO data availability; enrichment delay |
| 2 | Ignition ON + no movement | POSSIBLE_START → confirmation fails (no speed/motion in core data) → timeout 180s → RESTING | Correctly rejected. 5-min cooldown before re-evaluation. | ICE with high engineLoad may produce `strong ≥ 2` but fail confirmation |
| 3 | Short repositioning move (< 60s) | POSSIBLE_START → confirmed → ACTIVE → quickly POSSIBLE_END → FINALIZE → quality check discards (< 60s, < 0.1km) | Correctly discarded to CANCELLED. May trigger cooldown preventing next trip detection for 5 min. | Cooldown after discard could miss real trip start |
| 4 | Normal trip with short stop (1-2 min) | ACTIVE → IDLE_WITHIN_TRIP (ICE: engine active; EV: active frequency) → ACTIVE on resume | Works correctly for ICE. EV depends on frequency check. | EV idle detection requires consistent telemetry cadence |
| 5 | Stop-and-go traffic | Alternating ACTIVE/IDLE. No end triggered as long as motion resumes within 60s ticks. | Generally works. Long traffic jam (> 30 min fully stopped) could trigger hard timeout. | 30-min hard timeout in heavy traffic with zero movement |
| 6 | Ignition OFF briefly (< 3 min) then ON | POSSIBLE_END triggered. Resume check within 90s detects speed. Back to ACTIVE. | Works if speed appears in 90s window. CUSUM gate (3 min) prevents premature end. | If speed appears AFTER 3 min but before finalize, merge logic at next trip start handles it. |
| 7 | Telemetry gap during active trip | Active tick errors → self-reschedules. Recovery scheduler re-enqueues every 120s. | Trip stays open but accumulates no new data. Eventually hard timeout at 30 min if gap persists. | 30 min of "no data" → force finalize → potentially wrong end time |
| 8 | Delayed snapshots (out of order) | Snapshot processor processes whatever DIMO returns. CUSUM receives data in DIMO's order. | Generally ordered by DIMO. Out-of-order would confuse CUSUM's sequential analysis. | CUSUM does not sort input — assumes sorted timestamps |
| 9 | Trip visible only after Sync | V2 may have missed trip entirely (DIMO data gap, threshold not met, process crash). Sync uses V1 heuristic to find it. | **Common occurrence.** V2 depends on real-time snapshot availability; V1 sync analyzes history. | Duplicate trips if both V2 and V1 create for same drive |
| 10 | Trip across day/time boundary | V2 tracks continuously via FSM. Finalization timestamps respect actual end time. | Works correctly — no day-boundary logic in V2. Frontend day filter may split display. | Frontend `from/to` day filter may exclude trips spanning midnight |

---

## 13. Logging / Observability Gaps

### What Is Logged

| Event | Logged | Logger | Contains vehicleId | Contains tripId | Contains state transition |
|-------|--------|--------|-------------------|----------------|--------------------------|
| POSSIBLE_START evidence | Yes (log) | Orchestration | Yes | No | Yes (→ POSSIBLE_START) |
| Start confirmed | Yes (log) | Orchestration | Yes | Yes (new trip) | Yes (→ ACTIVE_TRIP) |
| Start timeout | Yes (log) | Orchestration | Yes | No | Yes (→ RESTING) |
| Active tick continuity | Partially (summary) | Orchestration | Yes | Yes | Implicit in verdict |
| Activity resumed | Yes (log) | Orchestration | Yes | Yes | Yes (→ ACTIVE_TRIP) |
| CUSUM result | Yes (debug/log) | Orchestration | Yes | Yes | Partial |
| Hard timeout | Yes (warn) | Orchestration | Yes | Yes | Implicit |
| Trip finalized | Yes (log) | Orchestration | Yes | Yes | Yes (→ RESTING) |
| Trip discarded | Yes (warn) | Orchestration | Yes | Yes | Yes (→ RESTING, CANCELLED) |
| Enrichment enqueued | Yes | Orchestration | Partial | Yes | No |
| Enrichment completed | Yes | Enrichment orchestrator | Yes | Yes | Status update |
| Enrichment failed | Yes (warn/error) | Enrichment orchestrator | Yes | Yes | Status update |
| Driving impact computed | Yes (debug) | Impact processor | Yes | Yes | No |
| Sync trips count | Yes (log) | Trips service | Yes | No | No |

### What Is NOT Logged

| Missing Event | Impact |
|---------------|--------|
| **Snapshot evidence NOT triggered** (RESTING, no signals) | Cannot diagnose "why didn't a trip start?" |
| **Cooldown blocked start** | Cannot trace "why was start delayed?" |
| **Active tick DIMO fetch results** (point counts, signal quality) | Cannot diagnose mid-trip data quality |
| **POSSIBLE_END exact trigger** (which continuity path) | Hard to trace end detection logic |
| **Worker lock acquisition/release timing** | Cannot diagnose lock contention |
| **Queue depth / processing lag** | No visibility into Bull queue backlog |
| **Recovery scheduler re-enqueue targets** | Cannot trace recovery actions |
| **Frontend sync trigger** (who, when, why) | No user action audit |
| **Deduplication actions** | Cannot trace if trips were removed |
| **VehicleTrip.create/update** field-level diff | No audit of what changed on each update |

### Missing Correlation

- No **correlation ID** linking snapshot → trip eval → queue job → orchestration processing
- No **session/trace ID** for a complete trip lifecycle
- `dimoPollLog` exists but uses generic `jobType: TRIP_TRACKING` for all triggers — cannot distinguish start vs end vs finalize

---

## 14. Root Causes of Current Inconsistencies

1. **Two parallel trip pipelines with different algorithms** writing to the same table:
   - V2: real-time FSM with multi-signal weighted scoring and CUSUM
   - V1: retrospective ignition-gap heuristic with 20-min timeout
   - No automatic reconciliation between them

2. **V2 depends on real-time DIMO data availability** which is not guaranteed:
   - 30s snapshot interval assumes DIMO always returns fresh `signalsLatest`
   - If DIMO returns stale or empty data, V2 misses trips entirely
   - V1 sync acts as fallback but must be manually triggered

3. **Enrichment is asynchronous and lossy:**
   - `harshAccelCount`, `harshBrakeCount` etc. are 0 until enrichment runs
   - Enrichment can fail (DIMO HF data unavailable) → status `SKIPPED_NO_HF_DATA`
   - Downstream modules see 0 counts as "no events" rather than "not yet analyzed"

4. **No frontend auto-refresh after backend state changes:**
   - Trip finalized → frontend doesn't know until user navigates
   - Enrichment completes → frontend shows stale 0 counts until reload

5. **5-minute cooldown creates blind spots:**
   - After a discarded micro-trip, 5 min cooldown → real trip start at minute 2 is missed
   - After finalization, 5 min cooldown → sequential trips with < 5 min gap: first is finalized, second missed by V2 (merge logic may handle, but cooldown blocks new evaluation)

---

## 15. Architectural Risks

| Risk | Severity | Description |
|------|----------|-------------|
| **Duplicate trips** | High | V2 + V1 sync can create overlapping trips without automatic deduplication |
| **Missing trips** | High | V2 misses trips when DIMO real-time data is unavailable; user must manually sync |
| **False zero counts** | High | `harshBrakeCount = 0` is indistinguishable from "enrichment hasn't run" vs "truly zero events" |
| **30-min force finalize in traffic** | Medium | Extended zero-speed traffic jam force-ends trip; subsequent movement starts new trip |
| **CUSUM with unsorted data** | Medium | No explicit sort in `detectTripEndChangePoint`; relies on DIMO ordering |
| **Cooldown after discard** | Medium | 5-min cooldown after discarded micro-trip blocks detection of real trip |
| **Worker lock starvation** | Low | Recovery scheduler + normal pipeline both compete for lock; lock TTL 120s vs recovery interval 120s |
| **No circuit breaker for DIMO** | Medium | If DIMO API is degraded, every snapshot job fails and retries, consuming queue capacity |

---

## 16. Clear Recommendations

### Must Be Preserved
- **FSM state machine architecture** — structurally sound; states are well-defined
- **CUSUM end detection** — mathematically rigorous; handles noise well
- **Profile-aware thresholds** (ICE/EV/HYBRID) — correct domain modeling
- **Worker lock + recovery scheduler** pattern — good resilience design
- **Merge logic** for short gaps — handles real-world driving patterns
- **Enrichment pipeline separation** — correct to decouple detection from analysis

### Must Be Fixed
- **Add `enrichmentPending` semantic** — distinguish "0 events" from "not yet analyzed" (add flag or status to trip/frontend)
- **Remove 5-min cooldown or make it smarter** — cooldown should only apply after genuine RESTING, not after discards
- **Add DIMO data quality check** — if snapshot returns stale data (same `lastSeen`), log it and don't evaluate as "no evidence"
- **Sort CUSUM input** — add explicit timestamp sort in `detectTripEndChangePoint`
- **Wire automatic reconciliation** — periodic background sync (every 15-30 min) to catch V2 misses, not just manual button
- **Add `enrichmentStatus` to trip list API response** — frontend can show "analyzing..." instead of "0 events"

### Must Be Unified
- **Single trip creation pathway** — V2 as primary, V1 as scheduled reconciliation (not user-triggered)
- **Single `dimoSegmentId` strategy** — both pipelines should produce comparable IDs for dedup
- **Single driving score computation** — currently V1 uses basic speed-penalty; V2 relies on driving impact; health summary reads `drivingScore` which may be null for V2 trips

### Should Be Removed/Deprecated
- **Manual "Sync Trips" as primary fallback** — replace with automatic background reconciliation
- **V1 `detectTrips()` as user-facing feature** — keep internally for reconciliation only
- **`drivingScore` on trip model** (V1-style) — migrate to `drivingStyleScore` from driving impact pipeline

### Where DIMO-Inspired Ideas Could Integrate Later
- **Ignition-based segment detection** → Could replace V1 sync heuristic with ClickHouse-style segment queries for reconciliation
- **Short OFF-gap debounce** → Already exists as 5-min merge logic; could be formalized with configurable gap threshold
- **Minimum segment duration** → Already exists (60s/0.1km in quality check); could align with DIMO's canonical segment definitions
- **Lookback reconciliation window** → Scheduled reconciliation job querying DIMO for the last N hours, running V1-style detection, creating missing trips — this would replace manual sync

---

*This audit describes the system AS IT IS based on complete code inspection as of 2026-04-10. All findings are evidence-based with file references. Where behavior is inferred from code rather than observed at runtime, this is noted explicitly.*

---

## Post-Audit Refactor Progress Log

### Phase 2 — Policy/Decision Seams (Completed 2026-04-10)

All four FSM processing methods now route detection through the `DetectorRegistry` + `TripDecisionEngine` seam:

| FSM Method | Old call | New seam |
|---|---|---|
| `processPossibleStart` | `validateTripStart()` direct | `StartConfirmationDetector` via `detectorRegistry.runAll()` |
| `processActiveTick` | `evaluatePerformanceActivity()` + `assessActiveContinuity()` direct | `ContinuityAssessmentDetector` via registry + `decisionEngine.evaluateContinuity()` |
| `processPossibleEndCheck` | `hasActivityResumed()` direct | `EndContinuityDetector` via registry |
| `processEndValidation` | `detectTripEndChangePoint()` direct | `ChangePointEndDetector` via registry + `decisionEngine.evaluateEndCandidate()` |

The full policy→detector→decision chain is now wired through every live FSM path. All helper function imports (`validateTripStart`, `assessActiveContinuity`, `evaluatePerformanceActivity`, `hasActivityResumed`, `detectTripEndChangePoint`) have been removed from the orchestration service — the functions now run only inside their respective detector wrappers.

**Files changed:** `trip-detection-orchestration.service.ts`

### Phase 3 — API Readiness Semantics (Completed 2026-04-10)

- `GET /trips` list: strips `behaviorEnrichmentStatus`/`behaviorEnrichmentError`/`behaviorEnrichmentAttempts`; adds `behaviorReady: boolean`, `detailsLimited: boolean`.
- `GET /trips/:tripId` single trip: same stripping/readiness flags as the list endpoint (was previously returning raw Prisma output).
- `GET /trips/:tripId/behavior-events`: returns `{ status: 'pending', behaviorReady: false, events: [] }` when analysis is not complete. Prevents false-zero event display.
- `GET /brake-status`: already filters `behaviorEnrichmentStatus: 'COMPLETED'` to avoid false-zero harsh brake counts.
- Frontend `TripData` interface: added `behaviorReady?: boolean` and `detailsLimited?: boolean`; deprecated `behaviorEnrichmentStatus`.
- `totalEvents()` helper returns `null` when `behaviorReady === false`; renders as `…` not `0`.
- Trip list cards show "analyzing" badge when `behaviorReady: false`, "limited" badge when `detailsLimited: true`.

**Files changed:** `vehicle-intelligence.controller.ts`, `TripsView.tsx`, `api.ts` (interface update)

### Phase 4 — V1 Removal (Completed 2026-04-10)

- **`DimoSegmentsService`**: Removed `fetchAndDetectTrips()`, `detectTrips()`, and `finalizeTrip()` (the V1 ignition-heuristic trip detection methods). These were dead code after the `POST trips/sync` endpoint was replaced by `POST trips/reconcile` in the previous session. The V1-only constants `GAP_TIMEOUT_MS` and `MIN_TRIP_DURATION_MS` were also removed. The `DetectedTrip` interface is retained as a type export for compatibility.
- **`TripEnrichmentOrchestratorService`** comment: Updated to remove reference to "V1 manual sync".
- **`vehicle-intelligence.controller.ts`** comment: Updated to remove "V1 sync" reference in behavior-enrich handler.
- **`trip-detection.spec.ts`**: Updated Fix D note to reflect that `detectTrips()` is now actually removed.

**Architectural invariant confirmed:** The V1 signal-based detection path no longer exists in any form as an active code path. The only live trip creation path is `TripDecisionEngine.createTrip()` called from `TripDetectionOrchestrationService`. Historical gap repair is handled by `TripReconciliationService` which also routes mutations through `TripDecisionEngine`.

---

### Phase 5 — Prometheus Instrumentation (Completed 2026-04-10)

All key lifecycle and anomaly points now emit Prometheus metrics via `TripMetricsService` (injected `@Optional()` to avoid breaking any future module changes):

| Metric | Injected in | Labels |
|---|---|---|
| `synqdrive_trip_start_candidates_total` | `TripDetectionOrchestrationService` | `profile`, `detector` |
| `synqdrive_trip_starts_confirmed_total` | `TripDetectionOrchestrationService` | `profile`, `mode` |
| `synqdrive_trip_finalized_total` | `TripDetectionOrchestrationService` | `profile`, `quality`, `source` |
| `synqdrive_trip_discarded_total` | `TripDetectionOrchestrationService` | `reason` |
| `synqdrive_trip_finalize_latency_seconds` | `TripDetectionOrchestrationService` | `profile` |
| `synqdrive_detector_latency_seconds` | `DetectorRegistry.runAll()` | `detector` |
| `synqdrive_empty_snapshots_total` | `DimoSnapshotProcessor` | `vehicle_profile` |
| `synqdrive_stale_snapshots_total` | `DimoSnapshotProcessor` | `vehicle_profile` |
| `synqdrive_enrichment_pending` (gauge) | `TripEnrichmentOrchestratorService` | — |
| `synqdrive_enrichment_failed_total` | `TripEnrichmentOrchestratorService` | `stage` |
| `synqdrive_repair_actions_total` | `TripReconciliationService` | `type`, `result` |

All metrics use `@Optional()` injection — the system works with or without the observability module loaded.

**Files changed:** `trip-detection-orchestration.service.ts`, `detector.registry.ts`, `dimo-snapshot.processor.ts`, `trip-enrichment-orchestrator.service.ts`, `trip-reconciliation.service.ts`

---

### Phase 6 — ClickHouse Mirror Foundation (Completed 2026-04-10)

- **`ClickHouseSchemaService`** added: runs idempotent DDL on module init. Splits by `;`, applies each statement individually (ClickHouse client constraint). Never throws on failure — always degrades gracefully.
- **DDL file `migrations/001_initial_schema.sql`** created with 5 tables:
  - `synqdrive.telemetry_snapshots` — raw DIMO snapshot mirror
  - `synqdrive.telemetry_state_changes` — derived ignition/motion transitions
  - `synqdrive.telemetry_waypoints` — high-resolution route points
  - `synqdrive.trip_activity_windows` — analytical activity summaries
  - `synqdrive.trip_segment_candidates` — ignition segment candidate cache
- All tables use `MergeTree` or `ReplacingMergeTree` with monthly partitioning and 6–12 month TTL.
- Writes are fire-and-forget (`ClickHouseTelemetryService`) — never block the live FSM pipeline.

**Files changed:** `clickhouse.module.ts`, `clickhouse-schema.service.ts` (new), `migrations/001_initial_schema.sql` (new)

---

### Phase 7 — Analytical Detectors (Completed 2026-04-10)

- **`PolicyResolver`** already routes `REPAIR_MISSING_TRIP` → `IgnitionSegmentDetector` + `ActivityWindowDetector` and `REPAIR_MISSING_END` → `ChangePointEndDetector` + `IgnitionSegmentDetector`.
- **`TripReconciliationService`** now cross-validates ignition segment findings with `ActivityWindowDetector` before applying repairs. If IgnitionSegmentDetector finds a segment but ActivityWindowDetector finds no movement, confidence is downgraded to `LOW` and the repair is skipped.
- This prevents false-positive repair trips from parked-engine scenarios (engine on but vehicle not moving).

**Files changed:** `trip-reconciliation.service.ts`

---

### Phase 8 — Periodic + Event-Triggered Reconciliation (Completed 2026-04-10)

**Periodic tiers** (already in place from prior session; verified correct):
- Fast: every 15 min over last 45 min (recently active vehicles only)
- Warm: every 4 hours over last 12 hours (all DIMO-enabled vehicles)
- Cold: daily at 03:00 over last 7 days (comprehensive safety net)

**Event-triggered reconciliation** (newly wired):
- **`TripTrackingRecoveryScheduler`**: now detects and fires event triggers alongside the normal state re-enqueue:
  - POSSIBLE_END stuck > 30 min with active tripId → `reconciliation.onStuckTrip()`
  - ACTIVE_TRIP open > 4 hours → `reconciliation.onAnomalyDetected({ type: 'SUSPICIOUS_LONG_OPEN' })`
- **`TripEnrichmentOrchestratorService`**: permanent enrichment failures now call `reconciliation.onEnrichmentFailure(tripId)` for audit tracking and future quality-check reconciliation.
- `TripAnomaly.type` extended with `SUSPICIOUS_LONG_OPEN` repair type.

All event triggers are fire-and-forget (`.catch()` guarded) — reconciliation failures never block the recovery or enrichment pipeline.

**Files changed:** `trip-tracking-recovery.scheduler.ts`, `trip-enrichment-orchestrator.service.ts`, `reconciliation.types.ts`

---

### Phase 9 — Final Hardening (Completed 2026-04-10)

**Hardening verified:**
- CUSUM sort: `ChangePointEndDetector` explicitly sorts `coreDataPoints` ascending by timestamp before feeding to CUSUM (`detectTripEndChangePoint`). This is comment-documented as an audit-mandated fix.
- Smart cooldown: Three distinct cooldown windows are applied based on last resting reason:
  - `complete` → 2 min (normal completed trip)
  - `discard` → 30 seconds (quick re-detection allowed)
  - `timeout` → 60 seconds (forced finalization)
  - Stored in `lastEvidenceSummary.lastRestingReason` on the detection state.
- No parallel truth: only `TripDecisionEngine` creates/finalizes/discards trips. Verified via grep on `vehicleTrip.create` (single caller only).
- All downstream event-trigger paths are `@Optional()` — system remains runnable without ClickHouse, Prometheus, or reconciliation service present.

**Architectural validation summary:**
1. ✅ V2 FSM is the only canonical live trip lifecycle owner
2. ✅ V1 is fully removed — no methods, constants, or callsites remain
3. ✅ Detectors produce findings only — no direct DB mutations
4. ✅ `TripDecisionEngine` is the sole truth-commit authority
5. ✅ Repair layer (`TripReconciliationService`) routes through `TripDecisionEngine`
6. ✅ UI sees only `behaviorReady` / `detailsLimited` flags — no backend state terminology
7. ✅ False-zero semantics prevented at API and frontend layers
8. ✅ Prometheus metrics cover all required lifecycle points
9. ✅ ClickHouse schema is idempotent and safely fails without blocking app startup
10. ✅ Event-triggered reconciliation wired for stuck trips and enrichment failures

---

## HM Dual-App Split — 2026-04-12

### Scope
Full refactor of the High Mobility integration from a single-namespace "Phase 1 / Phase 2" model into two fully separated application containers: **HM Health-APP** and **HM Telemetry-APP**.

### Files Changed

**New files:**
- `backend/src/config/high-mobility.config.ts` — rewritten; dual-app typed config (`HM_HEALTH_APP_*` + `HM_TELEMETRY_APP_*`)
- `backend/src/modules/high-mobility/high-mobility-app-config.service.ts` — central typed config accessor
- `backend/src/modules/high-mobility/high-mobility-health-app-auth.service.ts` — Health-APP OAuth lifecycle
- `backend/src/modules/high-mobility/high-mobility-telemetry-app-auth.service.ts` — Telemetry-APP OAuth lifecycle
- `backend/src/modules/high-mobility/high-mobility-telemetry-app-fleet.service.ts` — Telemetry-APP fleet management (FULL_TELEMETRY package)
- `backend/src/modules/high-mobility/high-mobility-health-app-ingestion.service.ts` — Health-APP MQTT ingestion (appContainerType=HM_HEALTH_APP)
- `backend/src/modules/high-mobility/high-mobility-telemetry-app-ingestion.service.ts` — Telemetry-APP MQTT ingestion (appContainerType=HM_TELEMETRY_APP)
- `backend/src/modules/high-mobility/high-mobility-health-app-mqtt-consumer.service.ts` — Health-APP MQTT consumer (independent client)
- `backend/src/modules/high-mobility/high-mobility-telemetry-app-mqtt-consumer.service.ts` — Telemetry-APP MQTT consumer (independent client)
- `backend/src/modules/high-mobility/high-mobility-mqtt-base.ts` — Shared MQTT V2 utility (mTLS, QoS1, MQTTv5)
- `backend/prisma/migrations/20260412013110_hm_dual_app_container_type/migration.sql` — Additive migration

**Modified files:**
- `backend/src/modules/high-mobility/high-mobility-auth.service.ts` — shim → delegates to HealthAppAuthService
- `backend/src/modules/high-mobility/high-mobility-fleet.service.ts` — retargeted to HealthAppAuthService + HighMobilityAppConfigService
- `backend/src/modules/high-mobility/high-mobility-health-fetch.service.ts` — retargeted to HealthAppAuthService + HighMobilityAppConfigService
- `backend/src/modules/high-mobility/high-mobility-stream-config.service.ts` — per-app parameter (`healthApp` | `telemetryApp`)
- `backend/src/modules/high-mobility/high-mobility-webhook.service.ts` — per-app-container secret + routing
- `backend/src/modules/high-mobility/high-mobility-webhook.controller.ts` — `/webhook/health` + `/webhook/telemetry` endpoints
- `backend/src/modules/high-mobility/high-mobility-admin.controller.ts` — per-app endpoints + `GET /readiness` + telemetry candidates
- `backend/src/modules/high-mobility/high-mobility-mqtt-consumer.service.ts` — shim → delegates to HealthAppMqttConsumerService
- `backend/src/modules/high-mobility/high-mobility.module.ts` — wires all new services
- `backend/src/modules/high-mobility/high-mobility-vehicle-link.service.ts` — `checkAvailability` scoped to HM_HEALTH_APP
- `backend/prisma/schema.prisma` — `HmAppContainerType` enum + `appContainerType` on 3 models + backfill indexes
- `frontend/src/lib/api.ts` — new telemetry-app endpoints + `listTelemetryAppCandidates` + readiness
- `frontend/src/master/components/PlatformVehiclesView.tsx` — HM Telemetry tab + HW only / HW+HMH badges in DIMO tab
- `architecture/ARCHITECTURE_REVIEW_2026-04-10.md` — HM dual-app architecture section added

### Architecture Preserved
- Existing HM Health-APP signal usage, polling scheduler, and vehicle link flows are unchanged in behavior
- Existing DIMO trip/health pipelines are untouched
- Old `HighMobilityAuthService` and `HighMobilityMqttConsumerService` kept as backward-compat shims
- `HighMobilityTelemetryIngestionService` kept as legacy service (still used by old consumer shim)
- `packageType` and `sourceMode` columns preserved on schema (no destructive changes)

### Validation
1. ✅ Two fully independent OAuth credential paths (Health vs Telemetry)
2. ✅ Two fully independent MQTT clients (separate clientId, topic, certs, consumer group)
3. ✅ `appContainerType` additive migration with backfill (HEALTH→HM_HEALTH_APP, FULL_TELEMETRY→HM_TELEMETRY_APP)
4. ✅ Boot tolerant — each app degrades independently if unconfigured
5. ✅ Health-APP clearance webhook scoped to `HM_HEALTH_APP_WEBHOOK_SECRET`
6. ✅ Telemetry-APP clearance webhook scoped to `HM_TELEMETRY_APP_WEBHOOK_SECRET`
7. ✅ Master UI adds HM Telemetry tab with approved candidates
8. ✅ DIMO tab now badges vehicles as "HW only" or "HW + HMH"
9. ✅ No calculation pipelines modified — health signals remain display-grade only
10. ✅ `GET /admin/high-mobility/readiness` exposes per-app readiness state

---

## HM Architecture Finalization — 2026-04-12 (Pass 2)

### Goal
Finalize the HM dual-app integration with freshness model, latest-state storage, MQTT diagnostics, per-vehicle endpoint aliases, and UI staleness indicators.

### New Files
- `backend/src/modules/high-mobility/high-mobility-diagnostics.controller.ts` — `/integrations/hm-health-app/` and `/integrations/hm-telemetry-app/` diagnostic endpoints
- `backend/prisma/migrations/20260412020000_hm_latest_state_tables/migration.sql` — creates `hm_latest_health_states` and `hm_latest_telemetry_states` tables

### Modified Files
- `backend/src/modules/high-mobility/high-mobility-signal-usage.service.ts` — `HmFreshnessStatus` type + `FRESHNESS_WINDOWS` constant + `getFreshnessStatus()` helper; all three signal getter methods now return `freshnessStatus`
- `backend/src/modules/high-mobility/high-mobility-health-app-ingestion.service.ts` — `upsertLatestHealthState()` called after every valid MQTT message
- `backend/src/modules/high-mobility/high-mobility-telemetry-app-ingestion.service.ts` — `upsertLatestTelemetryState()` called after every valid MQTT message
- `backend/src/modules/high-mobility/high-mobility.module.ts` — `HighMobilityDiagnosticsController` registered
- `backend/src/modules/vehicle-intelligence/vehicle-intelligence.controller.ts` — new `/hm-health-app/status`, `/hm-health-app/check-eligibility`, `/hm-health-app/activate`, `/hm-health-app/refresh-status`, `/hm-health-app/deactivate`, `/hm-health-app/service-info`, `/hm-health-app/tire-pressure-display`, `/hm-health-app/ai-health-care`, `/hm-health-app/error-codes-status` routes
- `backend/src/modules/vehicle-intelligence/health-summary/ai-health-care-aggregation.service.ts` — `hmFreshnessStatus` field in `AiHealthCareResponse` DTO
- `backend/prisma/schema.prisma` — `HmLatestHealthState` and `HmLatestTelemetryState` models added
- `frontend/src/lib/api.ts` — `HmFreshnessStatus` type, `hmFreshnessStatus` on `AiHealthCareResponse`, new API methods `getHealthAppMqttStatus`, `getTelemetryAppMqttStatus`, `getHealthAppStreamLogs`, `getTelemetryAppStreamLogs`, `getHmDualReadiness`
- `frontend/src/master/components/HighMobilityDataView.tsx` — "Phase 1/2" labels replaced with "HM Health-APP / HM Telemetry-APP"; new `DualAppStreamingTab` with per-app switcher and live log view; source mode label updated to "DIMO + HMH" / "HM Telemetry" / "HM Health"
- `frontend/src/rental/components/HealthErrorsView.tsx` — HM health indicator section now shows amber border/warning when `hmFreshnessStatus === 'stale'`, aging label when `aging`, colored timestamp per tier

### Architecture Rules Enforced
- Service freshness windows: SERVICE 24h/72h · TIRE_PRESSURE 6h/24h · AI_HEALTH_CARE 6h/12h
- `hm_latest_health_states` unique on `(vin, app_container_type)` — upserted on every HM Health-APP MQTT message
- `hm_latest_telemetry_states` unique on `(vin, app_container_type)` — upserted on every HM Telemetry-APP MQTT message
- MQTT diagnostics controller scoped to `MASTER_ADMIN` / `ADMIN` roles only
- HM Health-APP signals remain display-grade — no calculation pipeline writes

### Validation
1. ✅ Backend TypeScript clean (0 errors)
2. ✅ Frontend TypeScript clean (0 errors)
3. ✅ Migration applied to DB — two new tables live
4. ✅ Freshness tiers present on all three signal group DTOs
5. ✅ AI Health Care Box shows stale/aging visual state in frontend
6. ✅ `GET /integrations/hm-health-app/mqtt/status` and `GET /integrations/hm-telemetry-app/mqtt/status` available
7. ✅ `GET /integrations/hm-health-app/stream/logs` and `GET /integrations/hm-telemetry-app/stream/logs` available
8. ✅ HighMobilityDataView.tsx uses app-container naming throughout (no Phase 1/2 labels)

---

## AI Health Care Box — Real Implementation 2026-04-12

### Goal
Replace mocked AI Health Care Box with a real display-level aggregation using existing module states plus approved HM Health-APP signals.

### Modified Files
- `backend/src/modules/vehicle-intelligence/health-summary/ai-health-care-aggregation.service.ts`
  - Injected `DtcService`, `BrakeHealthService`, `TireHealthService`, `BatteryHealthService` (all in-module, no new imports needed in module file)
  - New `AiHealthStatusLevel` type: `EXCELLENT | GOOD | ATTENTION_NEEDED | CRITICAL | NO_RECENT_DATA`
  - New `OilLevelDisplay` interface: mode + normalized 0–1 value + label
  - New `AiHealthIndicators` interface: limpMode, brakeWarning, tirePressureWarning as booleans
  - `computeAiStatus()` priority engine: CRITICAL checks → ATTENTION_NEEDED checks → GOOD → EXCELLENT promotion → NO_RECENT_DATA fallback
  - `buildOilLevelDisplay()` maps normalized oil status to bar fill fraction (no liters assumed)
  - `buildIndicators()` produces typed boolean indicator flags
  - All existing `HealthSummaryAgentResponse` fields preserved for backward compat
  - `watchpoints` now populated from `reasons[]` when present

- `frontend/src/lib/api.ts`
  - `AiHealthStatusLevel` type exported
  - `OilLevelDisplay` interface exported
  - `AiHealthIndicators` interface exported
  - `AiHealthCareResponse` extended with `aiStatus`, `summaryText`, `reasons`, `oilLevelDisplay`, `indicators`

- `frontend/src/rental/components/HealthErrorsView.tsx`
  - Overall Status section replaced: uses `aiHealthCare.aiStatus` for color/badge, `aiHealthCare.summaryText` for copy, `aiHealthCare.reasons[]` as bullet list (max 3 shown)
  - Predictive Maintenance section: conditionally shown only when data available
  - HM indicator row: oil bar uses `oilLevelDisplay.value` (normalized float) + `oilLevelDisplay.label`
  - Limp Mode, Brake Warning, Tire Pressure Warning icons: use `indicators.*` boolean flags
  - Stale/aging freshness visuals preserved

### Architecture Contract Enforced
- `AiHealthCareAggregationService` is summary-only; no writes to authoritative modules
- `DtcService`, `BrakeHealthService`, `TireHealthService`, `BatteryHealthService` consumed read-only
- HM signals remain additive/informational; their values cannot escalate to CRITICAL unilaterally except for limpMode
- Oil level uses only status-normalized display (no assumed liters)
- Priority rule: worst-wins, CRITICAL only from limp mode + critical tire alerts

### Validation
1. ✅ Backend TypeScript clean (0 errors)
2. ✅ Frontend TypeScript clean (0 errors)
3. ✅ No authoritative calculation modules modified
4. ✅ All new fields backward-compatible (old `overallStatus`/`watchpoints`/`positives` preserved)
