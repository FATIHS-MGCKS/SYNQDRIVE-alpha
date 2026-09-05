# P4 Trip Start Deep Dive — Detection Quality & Failure Windows

> **AUDIT ARTIFACT — NON-CANONICAL**
>
> This document is read-only reconstruction evidence for the Trip FSM audit workstream.
> It is **not** the canonical Trip FSM architecture authority.
> Canonical architecture documentation will be produced only after the reconstruction workstream is complete.

**Audit date:** 2026-09-05  
**Repository:** https://github.com/FATIHS-MGCKS/SYNQDRIVE-alpha  
**Branch at audit:** `main`  
**Repository HEAD at audit:** `b62c4c445e6f1294fe4e38b25904737d157465f6`  
**Audited application code SHA:** `3d5040b67abfdc7e95c1b507e13f45d1bc65af11`  
**HEAD delta vs audited code:** Audit-doc-only commits (`P2`, `P3` artifacts); **no application logic changes** after `3d5040b67` (**CONFIRMED** via `git log 3d5040b67..HEAD`)  
**Mutation policy used during audit:** READ-ONLY (this artifact excepted)  
**Production SHA status:** **UNKNOWN** — VPS SSH failed (`Permission denied (publickey)`) this session  
**Production evidence freshness:** **UNKNOWN** for fresh runtime; prior P2/P3 production SQL is **STALE/SUPERSEDED** and not reused as current evidence  
**Prior artifacts read:** `P2_STATE_MACHINE_EXECUTION_PHASE_AUDIT_2026-09-05.md`, `P3_SIGNAL_AUTHORITY_TIMESTAMP_ORDERING_AUDIT_2026-09-05.md`, `TRIP_OWNERSHIP.ts`

**Evidence labels:** CONFIRMED | INFERRED | UNKNOWN | STALE

---

## Executive summary

SynqDrive trip start is a **two-stage** pipeline: (1) snapshot candidate gate in `RESTING` → `POSSIBLE_START`, (2) asynchronous confirmation job → `ACTIVE_TRIP` + trip row. Physical evidence enters via DIMO snapshot poll → VLS merge → `evaluateSnapshotEvidence`; confirmation uses core backfill + `validateTripStart` with optional ClickHouse assist. **ClickHouse cannot enter `POSSIBLE_START` alone** — it only runs inside `processPossibleStart` after the FSM is already `POSSIBLE_START`.

Key architectural tensions (evidence-backed, not remediated here):

1. **Candidate scoring ≠ confirmation scoring** — candidate uses hard-coded strong/weak counts; confirmation uses `PROFILE_THRESHOLDS` weights.
2. **`possibleStartAt` = worker `now`** at candidate entry — anchors 180s timeout and core fetch window, not physical start.
3. **Freshness proxy `previousTelemetry.updatedAt`** is DB mutation time; LIVE_START policy computes it but **does not change detector set** today.
4. **Idle vehicles** can sit on **5–30 min** snapshot tiers before first movement is seen.
5. **`createTrip()` then `transitionState(ACTIVE_TRIP)`** — non-atomic; recovery exists but crash windows remain.
6. **`lastRestingReason: 'timeout'`** cooldown branch exists in code but **`timeout` is never written** (**CONFIRMED** grep); only `complete` and `discard` are set at finalize.

---

## P4.0 — Baseline / SHA / artifact chain

| Item | Value | Label |
|------|-------|-------|
| Branch | `main` | CONFIRMED |
| HEAD | `b62c4c445` | CONFIRMED |
| Application logic SHA | `3d5040b67` | CONFIRMED |
| Commits after logic SHA | `c52d0c765` (P2 doc), `b62c4c445` (P3 doc) | CONFIRMED |
| Application code delta | None | CONFIRMED |
| P2 artifact | Present | CONFIRMED |
| P3 artifact | Present | CONFIRMED |
| P1 markdown artifact | Not in `docs/audits/trip-fsm/` | CONFIRMED |
| TRIP_OWNERSHIP contract | `backend/.../TRIP_OWNERSHIP.ts` | CONFIRMED |
| Production deploy SHA | Not verified | UNKNOWN |
| Fresh production SQL | Not run (SSH failed) | UNKNOWN |

**Behavioral conclusions in this report apply to application SHA `3d5040b67`.** No post-audit application delta was found.

---

## P4.1 — Complete trip start working graph

### Call graph (RESTING → ACTIVE_TRIP)

| Step | Component | File / symbol |
|------|-----------|---------------|
| 1 | Scheduler tick | `DimoSnapshotScheduler` — `@Interval` enqueue `snapshot-{vehicleId}` |
| 2 | Tier selection | `deriveSnapshotPollingTier` + `isSnapshotPollDue` |
| 3 | Snapshot job | BullMQ `DIMO_SNAPSHOT` queue |
| 4 | Snapshot processor | `DimoSnapshotProcessor.processSnapshotJob` |
| 5 | Provider fetch | `DimoTelemetryService.fetchLatestVehicleSnapshot` |
| 6 | VLS monotonic merge | `shouldApplyVlsTelemetryUpdate(lastSeenAt, previousState.sourceTimestamp)` — stale snapshots skip merge but touch `providerFetchedAt` |
| 7 | VLS upsert | `prisma.vehicleLatestState.upsert` — sets `sourceTimestamp`, `providerFetchedAt`, scalars; Prisma `@updatedAt` on row |
| 8 | CH mirror (optional) | `ClickHouseTelemetryService.insertSnapshot` + `detectAndInsertStateChanges` — only after successful VLS apply |
| 9 | Trip start eval hook | `DimoSnapshotProcessor.evaluateTripStart` → `TripDetectionOrchestrationService.evaluateSnapshotForTripStart` |
| 10 | FSM gate | `detState.state === RESTING` |
| 11 | Smart cooldown | `detState.updatedAt` + `lastEvidenceSummary.lastRestingReason` |
| 12 | Policy | `TripDetectionPolicyResolver.resolve(LIVE_START)` → always `['SnapshotEvidenceEvaluator']` |
| 13 | Data quality (computed, unused for detector pick) | `assessDataQuality({ snapshotFreshMs: Date.now() - previousTelemetry.updatedAt, ... })` |
| 14 | Detector | `SnapshotEvidenceEvaluator` → `evaluateSnapshotEvidence` |
| 15 | Decision | `TripDecisionEngine.evaluateStartCandidate(findings)` — requires `SnapshotEvidenceEvaluator` TRIGGERED |
| 16 | FSM transition | `transitionState(POSSIBLE_START, { possibleStartAt: now, ... })` |
| 17 | Queue | `schedulePossibleStart` → jobId `trip-ps-{vehicleId}` |
| 18 | Worker | `TripTrackingProcessor` → `processPossibleStart` |
| 19 | Lock | `acquireWorkerLock` (TTL 120s, token in FSM row) |
| 20 | Expiry guard | `elapsed > CONFIRM_MAX_WAIT_MS (180s)` → RESTING |
| 21 | Core fetch | `computePossibleStartCoreFetchFrom(startAt, now, lookback, BACKFILL_MS=60s)` → `fetchRawTripCoreData` |
| 22 | Confirm policy | `resolve(ACTIVE_TRIP, confirmingStart)` → `StartConfirmationDetector` + optional CH detectors |
| 23 | Confirm eval | `StartConfirmationDetector` → `validateTripStart` |
| 24 | CH assist merge | `resolveAnalyticsAssistedStartDecision` |
| 25 | Boundary | `resolveConfirmedStartBoundary` → segment → `refineTripStartBoundary` (route/core/candidate) |
| 26 | Merge check | `checkTripQuality(0, null, 0, previousEnd, effectiveStartAt)` |
| 27a | Reopen | `TripDecisionEngine.reopenTripForMerge` + `transitionState(ACTIVE_TRIP)` |
| 27b | Create | `TripDecisionEngine.createTrip` then `transitionState(ACTIVE_TRIP)` |
| 28 | Ancillary | temp fetch, initial route, `BatteryV2TripStartProducer.enqueueStartProxy` |
| 29 | Active loop | `scheduleActiveTick` (30s default) |

### Sequence diagram

```mermaid
sequenceDiagram
  participant Sch as DimoSnapshotScheduler
  participant SnapQ as DIMO_SNAPSHOT queue
  participant SnapP as DimoSnapshotProcessor
  participant VLS as vehicle_latest_state
  participant Orch as TripDetectionOrchestration
  participant Pol as PolicyResolver
  participant Det as SnapshotEvidenceEvaluator
  participant DE as TripDecisionEngine
  participant TrkQ as TRIP_TRACKING queue
  participant TrkP as TripTrackingProcessor
  participant Seg as DimoSegmentsService
  participant CH as ClickHouse detectors

  Sch->>SnapQ: enqueue snapshot job
  SnapQ->>SnapP: process
  SnapP->>VLS: monotonic merge / upsert
  SnapP->>Orch: evaluateSnapshotForTripStart
  Orch->>Orch: RESTING + cooldown check
  Orch->>Pol: resolve LIVE_START
  Pol-->>Orch: SnapshotEvidenceEvaluator only
  Orch->>Det: evaluateSnapshotEvidence
  Det-->>Orch: TRIGGERED / NOT
  Orch->>DE: evaluateStartCandidate
  DE-->>Orch: shouldStart
  Orch->>Orch: transitionState POSSIBLE_START
  Orch->>TrkQ: trip-ps-{vehicleId}
  TrkQ->>TrkP: processPossibleStart
  TrkP->>Orch: acquireWorkerLock
  Orch->>Seg: fetchRawTripCoreData
  Orch->>Pol: resolve ACTIVE_TRIP confirmingStart
  Orch->>Det: StartConfirmationDetector
  Orch->>CH: Activity/Ignition/Motion (if enabled)
  Orch->>Orch: resolveAnalyticsAssistedStartDecision
  alt confirmed
    Orch->>Seg: fetchTripSegments + route refine
    Orch->>DE: createTrip or reopenTripForMerge
    Orch->>Orch: transitionState ACTIVE_TRIP
    Orch->>TrkQ: scheduleActiveTick
  else not confirmed and within 180s
    Orch->>TrkQ: trip-ps delay 30s
  end
```

### State / decision graph

```mermaid
stateDiagram-v2
  [*] --> RESTING
  RESTING --> RESTING: cooldown active
  RESTING --> RESTING: snapshot not triggered
  RESTING --> POSSIBLE_START: evaluateSnapshotEvidence triggered
  POSSIBLE_START --> RESTING: 180s expiry / confirm fail timeout
  POSSIBLE_START --> POSSIBLE_START: retry PS job 30s
  POSSIBLE_START --> ACTIVE_TRIP: confirm + create/reopen
  ACTIVE_TRIP --> [*]: (end path out of scope)
```

---

## P4.2 — Snapshot candidate gate (`evaluateSnapshotEvidence`)

**Owner:** `trip-evidence.helpers.ts` → `SnapshotEvidenceEvaluator`  
**Trigger formula (all profiles):**

```text
triggered = strong >= 2
         OR (strong >= 1 AND hasMovement)
         OR weak >= 3
```

### PROFILE_THRESHOLDS runtime consumption at candidate stage

| Field | ICE | EV | HYBRID | UNKNOWN | Consumed at candidate? |
|-------|-----|----|--------|---------|------------------------|
| speedActiveKmh | 5 | 3 | 4 | 5 | **YES** — speed strong signal |
| speedMotionKmh | 0.5 | 0.5 | 0.5 | 0.5 | **Indirect** — low-speed weak band |
| odometerMinDeltaKm | 0.05 | 0.05 | 0.05 | 0.05 | **YES** — odometer delta |
| activeFrequencyPerMin | 2 | 2 | 2 | 2 | **NO** |
| restingFrequencyPerMin | 0.5 | 0.5 | 0.5 | 0.5 | **NO** |
| ignitionWeight | 3 | 1 | 2 | 2 | **NO** (hard-coded +2/+1 instead) |
| speedWeight | 2 | 3 | 3 | 3 | **NO** |
| odometerWeight | 2 | 2 | 2 | 2 | **NO** |
| energyWeight | 1 | 2 | 2 | 1 | **NO** |
| frequencyWeight | 1 | 2 | 1 | 2 | **NO** |

### Profile × signal × score matrix (candidate)

Legend: **S+** = strong increment, **S++** = +2 strong, **W+** = weak increment, **—** = not used

| Signal / condition | ICE | EV | HYBRID | UNKNOWN |
|--------------------|-----|----|--------|---------|
| ignition ON | S++ | S+ | S++ | S+ |
| speed > speedActiveKmh | S+ (+movement) | S+ (+movement) | S+ (+movement) | S+ (+movement) |
| engineLoad > 15 | S+ | W+ | S+ | S+ |
| tractionBatteryPower ≤ -25 kW | — | S++ | S++ | S++ |
| tractionBatteryPower ≤ -12 kW | — | S+ | S+ | S+ |
| tractionBatteryPower ≤ -4 kW | — | W+ | W+ | W+ |
| GPS delta > 50 m | S+ (+movement) | same | same | same |
| GPS delta 15–50 m | W+ (+movement) | same | same | same |
| odometer delta > min | S+ (+movement) | same | same | same |
| low speed 0–speedActive | W+ (+movement) | same | same | same |
| engineLoad 1–15 (non-EV) | W+ | — | W+ | W+ |
| fuel delta > 0.2 | W+ | W+ | W+ | W+ |
| SOC delta > 0.5 | W+ | S+ | S+ | W+ |
| regen ≥12 kW + speed >8 | W+ | W+ | W+ | W+ |
| charging power ≥5 + speed <2 | W+ (possibleCharging) | W+ | W+ | W+ |

**Mode selection:** post-trigger heuristic (`IGNITION_PRIMARY`, `MOTION_PRIMARY`, `RPM_VALIDATED`, `COMPOSITE_MULTI_SIGNAL`) — not weight-based.

**Confidence at candidate:** `strong >= 3 → HIGH`, `>= 2 → MEDIUM`, else LOW.

### P4 investigation answers

1. **Actually consumed at candidate:** `speedActiveKmh`, `odometerMinDeltaKm`, profile-specific hard-coded increments for ignition/EV power/SOC.
2. **Not consumed:** all five `*Weight` fields, frequency thresholds.
3. **Different model from `validateTripStart`?** **YES — CONFIRMED.**
4. **Intentional / documented?** Comment in `evaluateSnapshotEvidence` says "weighted by profile" but implementation uses fixed increments. **INFERRED:** historical simplification; not documented as intentional dual-model.
5. **Can profiles with different configured weights behave identically at candidate?** **YES** — e.g. ICE vs UNKNOWN differ mainly in `speedActiveKmh` (5 vs 5 same) and ignition strong increment (+2 vs +1); EV differs on speed threshold (3) and traction power paths.
6. **Runtime authority vs dead config:** At candidate stage, weight fields are **config-only/dead**. Speed/odo thresholds are **runtime authority**.

---

## P4.3 — Start policy / data quality

### `policyResolver.resolve(LIVE_START)`

**CONFIRMED:** Always returns:

```typescript
detectors: ['SnapshotEvidenceEvaluator'],
requiredConfidence: 'LOW',
timeoutMs: 5_000,
fallbackBehavior: 'SKIP',
```

`dataQuality` and `profile` **do not change** detector selection for `LIVE_START`.

### Freshness: `previousTelemetry.updatedAt`

Computed in `evaluateSnapshotForTripStart`:

```typescript
snapshotFreshMs: previousTelemetry?.updatedAt
  ? Date.now() - previousTelemetry.updatedAt.getTime()
  : null,
```

`assessDataQuality` maps `< 90s → FRESH`, else `STALE`.

**Callers traced:** value is passed into `PolicyInput.dataQuality` but **LIVE_START switch ignores it** — **CONFIRMED**.

### Stale snapshot / updatedAt interaction

| Scenario | VLS behavior | updatedAt | Trip start eval |
|----------|--------------|-----------|-----------------|
| Stale provider snapshot (monotonic reject) | Skip scalar merge; update `providerFetchedAt` only | **Unchanged** (no upsert body) | **Not called** — processor returns before `evaluateTripStart` |
| Fresh snapshot applied | Full upsert | **Bumped** (Prisma `@updatedAt`) | Runs with new scalars |
| Stale physical observation applied as fresh VLS row | If passes monotonic guard | Bumped | Could candidate on stale `lastSeenAt` values |

**Can stale physical observation be classified FRESH?** **YES** — if DB row was recently written (e.g. unrelated field touch) while `sourceTimestamp` is old; freshness uses `updatedAt`, not `sourceTimestamp`. **Impact on candidate today:** **none** — policy doesn't branch on freshness at LIVE_START.

**Can freshness alter detector set / timeout / verdict?** **NO** at LIVE_START (**CONFIRMED**). **False positive/negative via freshness alone at candidate:** **NO direct path** today.

**TODO in code:** `evaluateSnapshotForTripStart` line 541 — pass snapshot timestamp from caller.

---

## P4.4 — RESTING cooldown

| Reason key | Cooldown | Code constant |
|------------|----------|---------------|
| `complete` (default) | **120 s** | `COOLDOWN_AFTER_COMPLETE_MS` |
| `timeout` | **60 s** | `COOLDOWN_AFTER_TIMEOUT_MS` |
| `discard` | **30 s** | `COOLDOWN_AFTER_DISCARD_MS |

**Clock:** `Date.now() - detState.updatedAt.getTime()` — wall clock.  
**What writes `updatedAt`:** Prisma `@updatedAt` on any `vehicleTripDetectionState` update, including `transitionState`.

**RESTING entry time:** **INFERRED** ≈ last transition to RESTING (finalize, PS expiry, etc.), not necessarily physical stop time.

**`lastRestingReason` writers:** `processFinalize` sets `complete` or `discard` in `lastEvidenceSummary`. **`timeout` is never assigned** despite cooldown branch — **CONFIRMED** (grep). PS expiry clears `lastEvidenceSummary` entirely → next cooldown uses default **120s complete**.

**Recovery / reconciliation:** Recovery scheduler does not reset cooldown. Reconciliation repair path is separate (missing trip), not cooldown-aware.

**Journey effects:**

| Stop type | Typical gap vs complete cooldown | Start blocked? |
|-----------|----------------------------------|----------------|
| Fuel / passenger / traffic (<2 min) after completed trip | <120s | **YES** — deliberate blind window |
| After discarded micro-trip | 30s | shorter |
| Key-off/on within 30–120s | depends on prior finalize reason | often **YES** |
| EV park/restart after normal complete | up to 120s | **YES** |

**Worst-case start latency from cooldown + polling:** `cooldown (120s) + LONG_IDLE poll (1800s) + confirm wait (up to 180s)` ≈ **35+ minutes** before `ACTIVE_TRIP` if movement happens just after cooldown ends on slow tier — **INFERRED** upper bound.

---

## P4.5 — Snapshot scheduling / start latency

### Default tier intervals (`snapshot-polling-tier.config.ts`)

| Tier | Default interval | Typical vehicle condition |
|------|------------------|---------------------------|
| ACTIVE_DRIVING | 30s | FSM `ACTIVE_TRIP`, `IDLE_WITHIN_TRIP`, `POSSIBLE_END` |
| RECENTLY_ACTIVE | 60s | movement >3 km/h, ignition ON, recent FSM activity, telemetry `live` |
| RESTING_STANDBY | **5 min** | telemetry `standby` or recent observation < standby threshold |
| LONG_IDLE | **30 min** | `signal_delayed`, `offline`, long idle |

**RESTING FSM + idle vehicle:** commonly **RESTING_STANDBY (5m)** or **LONG_IDLE (30m)** — **CONFIRMED** (`deriveSnapshotPollingTier`).

**Promotion:** movement/ignition → RECENTLY_ACTIVE; `requiresImmediateSnapshotPollOnPromotion` can bypass elapsed interval on tier promotion.

**DIMO signal cadence ≠ SynqDrive poll cadence** — core buckets are 20s when fetched, but snapshots may be 5–30 min apart on idle vehicles.

### Latency equation

| Stage | Symbol | Typical | Theoretical max (idle) |
|-------|--------|---------|------------------------|
| Physical start | `physicalStartAt` | T0 | T0 |
| Provider observation | `providerObservationAt` | T0 + device latency | T0 + minutes |
| Snapshot fetched | `snapshotFetchedAt` | +0–30min poll | +30min |
| Candidate (`POSSIBLE_START`) | `candidateAt` | snapshot worker time | poll + processing |
| Confirmation | `confirmationAt` | +0–180s PS retries | +180s |
| Canonical start | `canonicalStartTime` | boundary refine | may backdate via DIMO segment |

**Can trip be largely complete before first candidate poll?** **YES** — on LONG_IDLE tier a short trip could finish before first poll; live path would miss until reconciliation — **INFERRED** (scheduler backfill-on-resume mitigates host suspend only).

Default `tripStartBoundaryMaxLookbackMs` = max poll tier (30m) + confirm (180s) + buffer (120s) = **35 min** (`deriveDefaultTripStartBoundaryMaxLookbackMs`).

---

## P4.6 — POSSIBLE_START temporal model

| Field | Writer | Time basis | Confirmation use | Reset |
|-------|--------|------------|------------------|-------|
| `possibleStartAt` | `evaluateSnapshotForTripStart` | **Worker `now`** | 180s timeout; core fetch anchor; boundary candidate | null on RESTING |
| `lastSnapshotEvidenceAt` | same transition | worker `now` | forensic | cleared |
| `lastActivityAt` | same | worker `now` | polling tier promotion | updated later |
| `startOdometerKm` / fuel / SOC | snapshot at candidate | provider snapshot | forensic baseline | cleared |
| `startDetectionMode` / `startConfidence` | decision engine | derived | copied to trip on confirm | cleared |
| `lastEvidenceSummary` | candidate evidence | JSON | extended at confirm with boundary meta | cleared |

**Effects of worker-time anchor:**

- **180s timeout** measured from detection time, not physical start — delayed core can expire candidate while vehicle moving (**false expiry**).
- **Core fetch window:** `max(possibleStartAt - 60s, now - 35min)` — late confirmation shrinks backfill relative to physical start.
- **Boundary max lookback** tied to `candidateStartAt` and `confirmedAt` — historical confirm possible within lookback (`delayed-start-boundary.safety-gate.spec.ts`).

After confirm, `possibleStartAt` overwritten with `effectiveStartAt` (canonical boundary) — **CONFIRMED** in `processPossibleStart`.

---

## P4.7 — Core start confirmation (`validateTripStart`)

### maxScore by profile (sum of weights)

| Profile | ignition | speed | odo | energy | freq | **maxScore** |
|---------|----------|-------|-----|--------|------|--------------|
| ICE | 3 | 2 | 2 | 1 | 1 | **9** |
| EV | 1 | 3 | 2 | 2 | 2 | **10** |
| HYBRID | 2 | 3 | 2 | 2 | 1 | **10** |
| UNKNOWN | 2 | 3 | 2 | 1 | 2 | **10** |

Score adds full weight if: `hasIgnition`, `hasMotion`, `hasOdometerProgress`, `hasEnergyActivity`, `isActiveFrequency`.

### Four confirmation gates (OR)

| Gate | Expression |
|------|------------|
| `strongConsecutive` | `maxConsecutiveActive >= 3` |
| `stableDuration` | `activeDurationMs >= 60_000` |
| `compositeStrong` | `maxConsecutiveActive >= 2 && score >= maxScore * 0.5` |
| `combinedCurrent` | `maxConsecutiveActive >= 2 && ignition ON && speed > 0` |

`isPointActive`: speed > speedActiveKmh OR (ignition ON AND speed > speedMotionKmh).

### Representative sequences (candidate vs confirm)

| ID | Scenario | Candidate | Confirm | Trip |
|----|----------|-----------|---------|------|
| A | ICE ignition ON, parked, engine load high | Often YES (ignition + load) | Needs core consecutive/duration OR combinedCurrent with speed>0 | Unlikely without speed |
| B | ICE ignition + 8 km/h | YES | YES (strongConsecutive likely) | YES |
| C | ICE stale ignition ON, stationary | Maybe YES (ignition only weakly) | NO unless frequency/score | NO |
| D | EV speed movement, no ignition | YES (speed) | YES (motion path) | YES |
| E | EV SOC change charging, no motion | SOC strong on EV | NO motion | NO |
| F | EV traction sparse core | YES if snapshot strong | CH assist may help | Maybe |
| G | Hybrid engine toggle standstill | ignition swings | unlikely stableDuration | NO |
| H | GPS drift 15m | weak only | NO | NO |
| H2 | GPS jump >50m | YES | needs core | Maybe |
| I | Odometer jump only | YES if delta | YES if core confirms | YES |
| J | One active bucket | NO unless weak≥3 | NO | NO |
| K | Two active buckets | maybe composite | maybe compositeStrong | Maybe |
| L | Three active buckets | YES | strongConsecutive | YES |
| M | Sparse provider cadence | YES possible | frequency gate may fail | Retry/timeout |
| N | Delayed core buckets | YES | confirm delayed; expiry risk | Maybe |

---

## P4.8 — Frequency as evidence

**Formula:** `pointsPerMinute = points.length / (windowMs / 60_000)` where `windowMs` = last − first core timestamp.

**Edge cases:**

- `< 2` points → 0 ppm, `isRestingFrequency=true`
- 2 points in 60s → 2 ppm → active for all profiles (threshold 2)

**At confirmation:** frequency contributes **one weight bucket** via `isActiveFrequency`; can satisfy `compositeStrong` with partial physical evidence.

**Classification:**

| Profile | Role of cadence |
|---------|-----------------|
| ICE | **SECONDARY corroboration** — can tip compositeStrong |
| EV | **SECONDARY** — more weight in profile (freq weight 2) |
| HYBRID | **SECONDARY** |
| UNKNOWN | **SECONDARY** |

**Can frequency alone confirm start?** Only via `compositeStrong` with `maxConsecutiveActive >= 2` — **INFERRED:** rare without some motion buckets; not primary physical proof.

Provider batching / duplicate buckets inflate ppm — **INFERRED** risk for false confirm on sparse true motion.

---

## P4.9 — ClickHouse start assist

**Entry point:** only `processPossibleStart` after FSM=`POSSIBLE_START` — **CH cannot create trip without snapshot candidate path**.

### Decision paths

| Path | Condition |
|------|-----------|
| `DIMO_ONLY` | `StartConfirmationDetector` TRIGGERED |
| `DIMO_PLUS_CLICKHOUSE` | DIMO confirm + any CH segment/window triggered |
| `CLICKHOUSE_ASSISTED` | DIMO confirm failed but assist rules pass |

### `currentTelemetryActive`

```typescript
speedKmh > 0.5
OR engineLoad > 15
OR (isIgnitionOn === true AND speedKmh > 0)
```

Uses **current VLS row** at confirm time (not historical).

### ICE/HYBRID assist

`currentTelemetryActive && strongActivityWindow && ignitionTriggered`

`strongActivityWindow` = activity triggered AND (points≥3 OR speed>5 OR odoΔ>0.05)

### EV/HYBRID/UNKNOWN assist

`currentTelemetryActive && (motionTriggered || strongActivityWindow)`

### Conflict cases

| Case | Typical outcome |
|------|-----------------|
| VLS speed active, CH no motion | DIMO confirm path or fail |
| VLS stationary, CH motion | Assist possible for EV if `currentTelemetryActive` false → **fail** |
| VLS ignition false, CH ignition segment | ICE assist needs `ignitionTriggered` |
| EV no ignition | motion segment path |
| Delayed CH segment | may miss window |
| CH mirror lagging VLS | assist weaker |

**Can CH independently create ACTIVE_TRIP?** **NO** — only confirms inside PS job (**CONFIRMED**).

---

## P4.10 — Start boundary resolution

**Priority (`resolveConfirmedStartBoundary`):**

1. **DIMO segment** — `selectConfirmedStartSegment` rejects `startedBeforeRange=true`
2. **`refineTripStartBoundary`:** route earliest activity → core earliest → snapshot candidate

**Windows:**

- Segment/route fetch: `computeStartBoundaryWindowFrom(candidateStartAt, confirmedAt, lookback)`
- Core already fetched with `computePossibleStartCoreFetchFrom`

**Can canonical startTime predate…**

| Reference | Possible? |
|-----------|-----------|
| Physical candidate snapshot | **YES** — segment/route/core backdate |
| `possibleStartAt` | **YES** — `adjustedMs` negative |
| First detected speed | **YES** |
| Previous trip end | **YES** if merge/reopen or segment overlap — selection rejects segment not overlapping candidate window |
| Provider fetch time | **YES** |

**Previous trip activity leak:** Segment must satisfy `startMs <= confirmedAt && endMs >= candidateMs` and not `startedBeforeRange` — **INFERRED** partial guard; route/core earliest-in-window could still pick pre-candidate motion from same window.

**Worst case:** LONG_IDLE detection + `startedBeforeRange` segment → live path falls back to worker-time candidate (`delayed-start-boundary.safety-gate.spec.ts` **CONFIRMED**).

---

## P4.11 — Merge / reopen behavior

**Merge check at start:**

```typescript
checkTripQuality(0, null, 0, previousTrip.endTime, effectiveStartAt)
```

Only **time gap < 5 min** matters; zero distance/duration args bypass discard rules.

**GPS / ignition:** not considered at merge.

**Intentional short-stop merge:** **YES** — fueling/passenger stops <5 min merge into one trip.

**`reopenTripForMerge`:** sets trip `ONGOING`, clears `endTime/endLat/endLng` — **does not change `startTime`** on trip row.

**Downstream staleness:** prior finalize enrichment on completed trip may be stale after reopen — **INFERRED**; new segment treated as continuation.

---

## P4.12 — New trip commit order / atomicity

**Order:** `createTrip()` (COMMIT) → `transitionState(ACTIVE_TRIP)` → async temp/route/battery → `scheduleActiveTick`.

| Crash point | vehicle_trips | detection_state | BullMQ | Battery | tracking_runs |
|-------------|---------------|-----------------|--------|---------|---------------|
| A before create | none | POSSIBLE_START | PS may retry | — | logged |
| B during create | maybe partial | POSSIBLE_START | retry | — | — |
| C after create, before FSM | **ONGOING orphan** | POSSIBLE_START | retry | — | — |
| D during FSM | ONGOING | maybe ACTIVE | — | — | — |
| E after FSM, before battery | ONGOING | ACTIVE_TRIP | AT scheduled | maybe miss | — |
| F after battery enqueue | ONGOING | ACTIVE_TRIP | AT | queued | — |
| G after AT enqueue | ONGOING | ACTIVE_TRIP | AT | ok | logged |

**Recovery:** `TripTrackingRecoveryScheduler` every 120s re-enqueues PS/AT for stale states with expired lock.

**createTrip idempotency:** **NO** — each confirm creates new UUID; **`dimoSegmentId` @unique** may throw on duplicate synthetic id — partial guard.

---

## P4.13 — Job idempotency / concurrency

- **Job ID:** `trip-ps-{vehicleId}` — dedupes concurrent PS schedules
- **Worker lock:** 120s TTL, compare-and-set on `workerLockedUntil`
- **Retries:** PS failure rethrows → BullMQ retry; unconfirmed schedules PS +30s
- **Duplicate workers:** lock prevents parallel PS for same vehicle — **INFERRED** single flyer
- **Duplicate ONGOING trips:** no DB unique on `(vehicleId, ONGOING)` — **two workers could create two trips if lock bypassed** — **INFERRED** low probability
- **`dimoSegmentId` unique:** prevents duplicate segment ids

---

## P4.14 — Recovery of POSSIBLE_START

| Condition | Self-healing? | Mechanism |
|-----------|---------------|-----------|
| Queue job missing | **Partial** | Recovery scheduler @120s |
| Job delayed | **YES** | eventual run |
| Worker crashed mid-job | **Partial** | lock expiry + recovery |
| Redis restarted | **Partial** | jobs may be lost; recovery rescans FSM |
| Lock leaked until TTL | blocks | 120s |
| No core data | retry 30s until 180s | then RESTING |
| Candidate >180s | **YES** | expiry → RESTING |
| Trip exists from crash window | **NO** | manual/reconciliation |

---

## P4.15 — False positive analysis (summary)

| Condition | Candidate? | Confirmed? | Trip? | Protection |
|-----------|------------|------------|-------|------------|
| Ignition parked | Often | Rare without speed | Rare | confirm gates |
| Remote preconditioning | Maybe load/ignition | Unlikely | Unlikely | duration/consecutive |
| Charging SOC change | EV/HYBRID strong | Unlikely without motion | Unlikely | motion gates |
| GPS drift 15m | weak only | No | No | weak<3 alone |
| GPS jump >50m | Yes | Maybe | Maybe | core confirm |
| Towing/transporter | motion | possible | possible | weak business logic |
| Stale snapshot | blocked at VLS | — | — | monotonic guard |
| CH stale segment | — | assist may fail | — | currentTelemetryActive |

**Largest FP risk:** **INFERRED** GPS/odometer jump at candidate with thin confirm (`compositeStrong` + sparse core).

---

## P4.16 — False negative analysis (summary)

| Condition | Effect | Max delay |
|-----------|--------|-----------|
| Slow idle polling | late candidate | +30 min poll |
| RESTING cooldown | blind window | +120s |
| EV no ignition | mitigated by EV CH path | varies |
| Short trip <60s | may discard at end not start | N/A at start |
| CH unavailable | lose assist path | DIMO-only confirm harder |
| Core fetch fail | retry/timeout | 180s |

**Largest FN risk:** **idle tier polling + post-complete cooldown** — **CONFIRMED** architectural blind windows.

---

## P4.17 — Profile comparison matrix

| Column | ICE | EV | HYBRID | UNKNOWN |
|--------|-----|----|--------|---------|
| Candidate speed threshold | 5 | 3 | 4 | 5 |
| Motion threshold | 0.5 | 0.5 | 0.5 | 0.5 |
| Odo threshold | 0.05 | 0.05 | 0.05 | 0.05 |
| Ignition candidate | +2 strong | +1 | +2 | +1 |
| Candidate score model | strong/weak counts | same | same | same |
| Confirm weights (ign/speed/odo/en/freq) | 3/2/2/1/1 | 1/3/2/2/2 | 2/3/2/2/1 | 2/3/2/1/2 |
| CH assist | ignition+activity | motion/activity | ignition path | EV-like path |
| Weakest signal | ignition stuck | missing ignition | dual-mode gaps | defaults |
| Likely FP mode | parked idle high load | SOC noise | engine toggle | GPS drift |
| Likely FN mode | slow poll+cooldown | slow poll | same | same |

**Asymmetry:** Candidate and confirm both profile-aware but **via different mechanisms** — thresholds vs weights.

---

## P4.18 — Start boundary accuracy model

Definitions:

- `candidateLatencyMs = possibleStartAt - physicalStartEstimate`
- `canonicalStartErrorMs = trip.startTime - bestProviderStartEstimate`
- `confirmationLatencyMs = tripCreatedAt - physicalStartEstimate`

**Recognition latency** can be large (poll + cooldown + confirm). **Canonical boundary** can still be accurate if DIMO segment matches (`adjustedMs` negative) — decoupled dimensions (**MANDATORY distinction**).

Theoretical candidate latency upper bound ≈ cooldown + max poll interval ≈ **32 min** (INFERRED).

---

## P4.19 — Observability / forensics

| Evidence | Post-hoc "why started?" |
|----------|-------------------------|
| FSM `lastEvidenceSummary` | **PARTIAL** — candidate reasons; extended at confirm |
| `vehicle_trip_tracking_runs` | **PARTIAL** — PS validation runs |
| Trip row `startDetectionMode`, `startConfidence` | **PARTIAL** |
| `rawDetectionMeta` on trip | **PARTIAL** — confirm path if stored in summary merge |
| Metrics `tripStartCandidates`, `tripStartsConfirmed`, `tripEvidencePaths` | **PARTIAL** aggregate |
| Logs | **PARTIAL** — structured log lines exist |
| CH evidence | **PARTIAL** — not persisted on FSM |

**Lost on RESTING reset:** `possibleStartAt`, candidate summary fields cleared.

**Overall reconstructability:** **PARTIAL** — engineer can likely trace happy path; timeout/expiry paths harder.

---

## P4.20 — Test coverage

| Area | Primary tests | Gaps |
|------|---------------|------|
| Candidate scoring | `trip-detection.spec.ts` evaluateSnapshotEvidence | all profile combos incomplete |
| Profile weights at confirm | indirect via analytics tests | no direct validateTripStart matrix |
| Snapshot freshness | none for LIVE_START policy | **gap** |
| Confirmation | analytics + continuity tests | crash/idempotency |
| CH assist | resolveAnalyticsAssistedStartDecision tests | conflict matrix partial |
| Boundary | refineTripStartBoundary, delayed-start-boundary.safety-gate | live orchestration integration |
| Merge | checkTripQuality tests | reopen side effects |
| Recovery | reference in p12 gate spec | limited PS recovery tests |
| Timeout cooldown reason | none | **`timeout` reason never set** |

---

## P4.21 — Production read-only evidence

**Status: UNKNOWN** — SSH to `srv1374778.hstgr.cloud` failed (`Permission denied (publickey)`).

No fresh FSM distribution, latency, merge rate, or boundary adjustment stats collected.

---

## P4.22 — Start quality verdict

| Dimension | Rating | Evidence |
|-----------|--------|----------|
| Candidate sensitivity | **ACCEPTABLE** | low bar trigger formula |
| Candidate specificity | **WEAK** | ignition/GPS jumps |
| Confirmation sensitivity | **ACCEPTABLE** | multi-gate OR |
| Confirmation specificity | **ACCEPTABLE** | consecutive + duration |
| Boundary accuracy | **ACCEPTABLE** when segment matches | delayed-start tests |
| Recognition latency | **WEAK** | 5–30m idle tiers + cooldown |
| ICE robustness | **ACCEPTABLE** | ignition-weighted confirm |
| EV robustness | **ACCEPTABLE** with CH | motion assist |
| Hybrid robustness | **ACCEPTABLE** | mixed paths |
| Sparse telemetry | **WEAK** | frequency/core dependency |
| Out-of-order data | **ACCEPTABLE** | VLS monotonic at snapshot |
| Crash safety | **WEAK** | create before FSM |
| Idempotency | **ACCEPTABLE** | jobId + lock |
| Observability | **WEAK** | partial forensics |

---

## P4.23 — Architectural findings

| ID | Severity | Title | Status |
|----|----------|-------|--------|
| P4-F01 | P1 | Dual scoring models (candidate counts vs confirm weights) | Open |
| P4-F02 | P1 | `possibleStartAt` = worker time anchors timeout/backfill | Open |
| P4-F03 | P2 | LIVE_START freshness uses `updatedAt` but policy ignores it | Open |
| P4-F04 | P1 | Idle snapshot tiers (5–30m) delay first candidate | Open |
| P4-F05 | P2 | Post-complete 120s cooldown blind window | Open |
| P4-F06 | P2 | `createTrip` before FSM transition crash window | Open |
| P4-F07 | P3 | `lastRestingReason: timeout` never written — dead cooldown branch | Open |
| P4-F08 | P2 | CH assist cannot start trip without POSSIBLE_START | By design |
| P4-F09 | P2 | Merge by time-only gap ≤5m may merge distinct stops | Open |
| P4-F10 | P3 | No unique constraint preventing duplicate ONGOING trips | Open |

---

## Mandatory summary matrices

### A. Trip start end-to-end decision matrix

| Phase | Input | Decision | Output |
|-------|-------|----------|--------|
| Poll tier | FSM, telemetry freshness | interval 30s–30m | snapshot job |
| VLS merge | lastSeenAt vs sourceTimestamp | apply/skip | scalars |
| Cooldown | updatedAt, lastRestingReason | block/allow | — |
| Candidate | snapshot deltas | triggered? | POSSIBLE_START |
| Confirm | core window + VLS + CH | confirmed? | ACTIVE_TRIP |
| Boundary | segments/route/core | startTime | trip row |
| Merge | gap to prev end | reopen/create | ONGOING |

### B. Profile × signal authority matrix

| Signal | Candidate authority | Confirm authority |
|--------|--------------------|--------------------|
| Speed | threshold + strong/weak | weight + consecutive |
| Ignition | strong/weak increments | weight + combinedCurrent |
| Odometer | delta strong | weight + progress |
| Energy/SOC | profile-specific strong/weak | energy weight |
| Frequency | **none** | frequency weight |
| CH segments | **none** | assist only in PS |

### C. Candidate scoring matrix

See P4.2 table — trigger `strong>=2 OR (strong>=1 && movement) OR weak>=3`.

### D. Confirmation scoring matrix

See P4.7 — gates OR across consecutive, duration, composite, combinedCurrent.

### E. Start latency matrix

| Component | Typical | Max (defaults) |
|-----------|---------|----------------|
| Cooldown | 0–120s | 120s |
| Poll wait | 30s–5m | 30m |
| PS retry | 0–180s | 180s |
| Boundary backdate | 0 | 35m lookback |

### F. Start boundary priority matrix

1. DIMO segment (in window, not startedBeforeRange)  
2. Route earliest activity  
3. Core earliest activity  
4. Snapshot candidate time  

### G. False positive matrix

See P4.15.

### H. False negative matrix

See P4.16.

### I. Crash / recovery matrix

See P4.12, P4.14.

### J. Test coverage matrix

See P4.20.

### K. Observability matrix

See P4.19 — mostly PARTIAL.

### L. Open findings matrix

See P4.23.

---

## Final questions — explicit answers

1. **Earliest indication:** DIMO snapshot scalar change evaluated in `evaluateSnapshotEvidence` while FSM=`RESTING` (after cooldown), or VLS row update — **not** persisted as trip until confirm.
2. **POSSIBLE_START evidence:** `SnapshotEvidenceEvaluator` TRIGGERED per formula; FSM must be RESTING and cooldown elapsed.
3. **ONGOING trip evidence:** `resolveAnalyticsAssistedStartDecision.confirmed` OR `StartConfirmationDetector` TRIGGERED (with optional CH assist rules).
4. **Ignition ON alone create trip?** **NO** in normal confirm path — needs motion/consecutive/core; candidate may enter PS on ignition+weak signals but confirm usually fails without speed/core.
5. **Motion alone?** **YES** for EV/HYBRID at candidate; confirm **YES** if core gates pass.
6. **CH without POSSIBLE_START?** **NO**.
7. **Latest recognition:** **INFERRED** ~32+ min (30m poll + 120s cooldown + 180s confirm) in pathological idle case.
8. **Canonical accuracy despite late recognition?** **YES** — DIMO segment/route/core can backdate startTime.
9. **Largest FP risk:** candidate triggered on GPS/odometer noise with permissive confirm composite path.
10. **Largest FN risk:** idle polling tier + post-trip cooldown.
11. **Profile-aware both stages?** **YES** but **different models** (thresholds/increments vs weights).
12. **Candidate/confirm internally consistent?** **NO** — dual models (P4-F01).
13. **Crash → ONGOING + POSSIBLE_START?** **YES** possible (crash point C).
14. **Duplicate workers duplicate trips?** **Unlikely** with lock; **possible** if lock bypassed — no ONGOING unique constraint.
15. **Short stop merged incorrectly?** **YES** if gap <5m by design (P4-F09).
16. **Self-healing after queue failure?** **Partial** — recovery scheduler @120s.
17. **Reconstruct why trip started?** **PARTIAL** forensics.
18. **Highest priority fix after audit:** **Align candidate temporal model (`possibleStartAt`) and idle polling/cooldown with physical start evidence, and unify or explicitly document dual scoring models** — **INFERRED** synthesis of P4-F01/F02/F04/F05.

---

## Changes / Architektur

This task modified **audit documentation only**. SynqDrive Code → Changes and Architektur were **not updated** (no application/architecture implementation change).

---

*End of P4 audit artifact.*
