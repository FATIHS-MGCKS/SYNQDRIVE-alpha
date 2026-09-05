# P5 — Trip End Deep Dive Audit

**AUDIT ARTIFACT — NON-CANONICAL**

> Forensic, read-only reconstruction of SynqDrive Trip END behavior.  
> No application code, tests, schema, or deployment configuration was modified.  
> This artifact records reconstructed evidence only.  
> **Do not treat this document as canonical architecture.**

| Field | Value |
|-------|-------|
| Audit date | 2026-09-06 |
| Audited application SHA | `3d5040b67abfdc7e95c1b507e13f45d1bc65af11` |
| Audit artifact HEAD (docs chain) | `a4377f3a200ca45a97b7ce422caf8d92faddabbe` (P4A closure) |
| P4 closure commit | `a4377f3a200ca45a97b7ce422caf8d92faddabbe` |
| Prior audit chain | P2, P3, P4 (closed) |
| Production SHA status | **UNKNOWN** (SSH `Permission denied (publickey)` to `srv1374778.hstgr.cloud`) |

---

## P5.0 — Baseline / SHA Authority

### Git state at audit time

| Item | Value |
|------|-------|
| Branch | `main` |
| HEAD | `a4377f3a200ca45a97b7ce422caf8d92faddabbe` |
| Working tree | clean (pre-artifact) |

### Baseline drift vs `3d5040b67`

```bash
git diff 3d5040b67..HEAD -- backend/src/modules/vehicle-intelligence/trips/ \
  backend/src/workers/ backend/src/modules/dimo/ backend/src/modules/clickhouse/
# (no output — zero diff)
```

**Conclusion:** Commits after `3d5040b67` are audit documentation only (P2, P3, P4, P4A). **Trip FSM end application logic for this audit remains SHA `3d5040b67`.** Behavioral conclusions reference that SHA exclusively.

### Scope inspected

- `backend/src/modules/vehicle-intelligence/trips/` (orchestration, evidence, CUSUM, decision engine, detectors, policy, reconciliation hooks)
- `backend/src/workers/processors/trip-tracking.processor.ts`
- `backend/src/workers/schedulers/trip-tracking-recovery.scheduler.ts`
- `backend/src/modules/dimo/dimo-segments.service.ts` (`fetchEndValidationWindow`, core/route/perf fetch)
- `backend/src/modules/clickhouse/` (detector availability gates)
- Prisma models: `VehicleTrip`, `VehicleTripDetectionState`, `VehicleTripTrackingRun`, `VehicleTripWaypoint`
- Tests: `trip-detection.spec.ts`, reconciliation intra-gap specs, post-finalize producer spec

### Production evidence

Single SSH attempt (read-only): **failed** — `Permission denied (publickey)`.  
**PRODUCTION SHA STATUS: UNKNOWN.** No fresh production SQL aggregates collected. Prior P2/P3 production observations are **STALE** and not reused as live evidence.

---

## P5.1 — Complete Trip End Working Graph

### Primary runtime call graph (live FSM)

```
TripTrackingProcessor
  └─ processActiveTick          [ACTIVE_TRIP | IDLE_WITHIN_TRIP]
       ├─ segments.fetchRawTripCoreData / fetchRouteEnrichment / fetchPerformance
       ├─ [core.length === 0]
       │    ├─ tryApplyClickHouseAssistedEnd → POSSIBLE_END | scheduleFinalize (HIGH)
       │    └─ inactiveMs ≥ 120s → transitionState(POSSIBLE_END) → schedulePossibleEndCheck
       ├─ findMidTripGap → splitTripAtGap → FSM repoint → postFinalize (trip1) → scheduleActiveTick
       ├─ tryApplyClickHouseAssistedEnd (with core)
       ├─ vehicleTrip.update (provisional metrics, endTime=now)
       ├─ ContinuityAssessmentDetector → evaluateContinuity
       │    └─ [CH guard] ActivityWindowDetector → resolveClickHouseContinuityGuard
       └─ switch verdict → ACTIVE_TRIP | IDLE_WITHIN_TRIP | POSSIBLE_END → schedule*

  └─ processPossibleEndCheck     [POSSIBLE_END]
       ├─ checkDimoActivityResumed (90s window) → ACTIVE_TRIP (full metadata clear)
       ├─ elapsedMs ≥ 30min → scheduleFinalize (hard timeout)
       ├─ elapsedMs < cusumGateMs → reschedule PEC
       ├─ endValidationAttempts < 3 → increment attempts → scheduleEndValidation
       └─ else → scheduleFinalize (max attempts)

  └─ processEndValidation        [POSSIBLE_END]
       ├─ CH MEDIUM: cusumSegmentEnd set → skip CUSUM → scheduleFinalize
       ├─ fetchEndValidationWindow (15min back, 5min forward)
       ├─ ChangePointEndDetector → evaluateEndCandidate
       │    ├─ appears ongoing → ACTIVE_TRIP (partial metadata clear — see P5-F03)
       │    ├─ CUSUM confirmed → scheduleFinalize
       │    └─ inconclusive → schedulePossibleEndCheck (+60s)
       └─ catch → schedulePossibleEndCheck (+60s)

  └─ processFinalize             [POSSIBLE_END → RESTING]
       ├─ derive endTime priority chain
       ├─ checkTripQuality → discardTrip | finalizeTrip (COMPLETED)
       ├─ await postFinalizeAnalysisProducer
       ├─ enrichment (fire-and-forget)
       ├─ transitionState(RESTING)
       └─ batteryLvRestSessionProducer (local try/catch)
```

**Important distinction:** `resultState` in `logTrackingRun` is a **tracking-log label** for the tick outcome. **Persisted FSM state** is `vehicleTripDetectionState.state` via `transitionState()`.

### Mermaid — sequence diagram (normal CUSUM path)

```mermaid
sequenceDiagram
  participant AT as ACTIVE_TICK
  participant FSM as VehicleTripDetectionState
  participant PEC as POSSIBLE_END_CHECK
  participant EV as END_VALIDATION
  participant FIN as FINALIZE
  participant DB as vehicleTrip

  AT->>FSM: continuity → POSSIBLE_END (possibleEndAt = last movement)
  AT->>PEC: schedulePossibleEndCheck
  PEC->>PEC: activity resume? no
  PEC->>PEC: elapsedMs ≥ cusumGateMs (120s normal)
  PEC->>FSM: endValidationAttempts++
  PEC->>EV: scheduleEndValidation
  EV->>EV: fetchEndValidationWindow + CUSUM
  EV->>FSM: cusumSegmentEnd, endDetectionMode=CUSUM_VALIDATED
  EV->>FIN: scheduleFinalize
  FIN->>DB: finalizeTrip COMPLETED (canonical endTime)
  FIN->>FIN: await postFinalizeAnalysisProducer
  FIN->>FSM: RESTING (activeTripId=null)
```

### Mermaid — state diagram (end lifecycle)

```mermaid
stateDiagram-v2
  [*] --> ACTIVE_TRIP: trip started
  ACTIVE_TRIP --> IDLE_WITHIN_TRIP: continuity IDLE
  IDLE_WITHIN_TRIP --> ACTIVE_TRIP: continuity ACTIVE
  ACTIVE_TRIP --> POSSIBLE_END: continuity POSSIBLE_END / CH assist / no-core
  IDLE_WITHIN_TRIP --> POSSIBLE_END: continuity POSSIBLE_END / CH assist
  POSSIBLE_END --> ACTIVE_TRIP: activity resumed / CUSUM ongoing
  POSSIBLE_END --> POSSIBLE_END: stability wait / inconclusive retry
  POSSIBLE_END --> RESTING: finalize (CUSUM / CH HIGH / max attempts / timeout)
  RESTING --> [*]

  note right of ACTIVE_TRIP
    Mid-gap split: ACTIVE_TRIP → COMPLETED(trip1)
    + new ACTIVE_TRIP(trip2)
  end note
```

### Alternate branches (summary)

| Branch | Entry | Exit |
|--------|-------|------|
| CH HIGH end assist | `tryApplyClickHouseAssistedEnd` | `scheduleFinalize` (CUSUM skipped) |
| CH MEDIUM end assist | same | PEC (30s gate) → EV skip CUSUM → finalize |
| No-core inactivity | `corePoints.length === 0` | POSSIBLE_END after 120s anchor inactivity |
| Activity resumed | PEC or CH second check | ACTIVE_TRIP |
| CUSUM ongoing | EV | ACTIVE_TRIP (partial reset) |
| Max CUSUM attempts | PEC step 5 | finalize without CUSUM confirmation |
| Hard timeout | PEC `elapsedMs ≥ 30min` | finalize |
| Mid-gap split | `findMidTripGap` + driftOk | trip1 COMPLETED, FSM → trip2 ACTIVE_TRIP |
| Recovery | `TripTrackingRecoveryScheduler` @120s | re-enqueue PS/AT/PEC; stuck PE >30min → reconciliation |

---

## P5.2 — ACTIVE_TICK Data Acquisition

### Fetches per tick

| Stream | Window (`from`) | Overlap | Service |
|--------|-----------------|---------|---------|
| Core | `possibleStartAt - 60s` (first) or `lastCoreProcessedAt - 30s` | 30s | `fetchRawTripCoreData` |
| Route | same pattern | 15s | `fetchRouteEnrichment` |
| Performance | same pattern | 30s | `fetchPerformance` |
| VLS (telemetry) | `vehicleLatestState.findUnique` | n/a | Prisma |
| ClickHouse | via detector registry when enabled | policy windows | ActivityWindow, IgnitionSegment, MotionSegment |

**Time base:** worker `now`; points sorted by provider timestamp in segments service.

**Deduplication:** waypoints filtered with `lastRouteProcessedAt - 5000ms` cutoff before `createMany`.

**Empty core stream:** dedicated branch (CH assist, then 120s anchor inactivity, else keep open + reschedule AT).

**Provider failure:** ACTIVE_TICK outer catch logs, schedules AT (+30s), releases lock.

### Fields written

| Target | Fields | Notes |
|--------|--------|-------|
| `vehicleTrip` | `endTime=now`, coords from last route point, distance, duration, perf aggregates, `lastActivityAt=now` | **`tripStatus` unchanged — stays ONGOING** |
| `vehicleTripWaypoint` | route points after cutoff | deduped |
| `vehicleTripDetectionState` | continuity branch updates (see P5.3–P5.5) | via `transitionState` |

### Provisional `endTime = now` every ACTIVE_TICK — CONFIRMED

```typescript
// trip-detection-orchestration.service.ts ~1531
await this.prisma.vehicleTrip.update({
  where: { id: tripId },
  data: { endTime: now, /* tripStatus NOT set */ },
});
```

| Question | Answer |
|----------|--------|
| Why? | Rolling “latest observation” for live trip metrics/display while ONGOING |
| Provisional? | **Yes** — canonical boundary only at `finalizeTrip` |
| `tripStatus` | Remains **ONGOING** until finalize/discard/split |
| Consumers | Any reader of `vehicleTrip.endTime` on ONGOING rows sees worker-time proxy, not canonical end |
| Dual semantics? | **Yes** — ONGOING: latest tick time; COMPLETED: backdated boundary |
| Risk class | **P1 architectural** — boundary/latency confusion for dashboards, APIs, merge logic (**P5-F01**) |

---

## P5.3 — Continuity Assessment

**Pipeline:** `ContinuityAssessmentDetector` → `assessActiveContinuity(core, perfActive, profile)` + `evaluatePerformanceActivity(perf)` → `TripDecisionEngine.evaluateContinuity`.

**Evaluation windows:** core filtered to last **120s** (`TRIP_CONTINUITY_CORE_WINDOW_MS`); perf **90s**. Fallback: last 3 core points if time filter empty.

### Profile thresholds (speedActive / speedMotion km/h)

| Profile | speedActive | speedMotion | Ignition weight |
|---------|-------------|-------------|-----------------|
| ICE | 5 | 0.5 | 3 |
| EV | 3 | 0.5 | 1 |
| HYBRID | 4 | 0.5 | 2 |
| UNKNOWN | 5 | 0.5 | 2 |

### Signal matrix → verdict

| Signal condition | ICE | EV | HYBRID | Verdict |
|------------------|-----|-----|--------|---------|
| speed > threshold OR odo Δ ≥ 0.05 km | ✓ | ✓ | ✓ | **ACTIVE** |
| stopped + perf (RPM>600 / throttle>5 / load>10) | ✓ | rare | ✓ | **IDLE** |
| stopped + energy activity | ✓ | ✓ | ✓ | **IDLE** |
| stopped + (EV/HYB) + active frequency (≥2 ppm) | — | ✓ | ✓ | **IDLE** |
| stopped + all ignition off + no energy | ✓ | ✓ | ✓ | **POSSIBLE_END** (HIGH, `IGNITION_OFF_CONFIRMED`) |
| stopped + resting frequency (≤0.5 ppm) | ✓ | ✓ | ✓ | **POSSIBLE_END** (MEDIUM, `FREQUENCY_DROP`) |
| stopped + stale ignition ON + no perf + no energy | ✓ | ✓ | ✓ | **POSSIBLE_END** (MEDIUM, `COMPOSITE_INACTIVITY`) |
| ambiguous / empty core in assess* | ✓ | ✓ | ✓ | **POSSIBLE_END** (LOW) |

\*Empty core in **assessActiveContinuity** returns POSSIBLE_END; live path with empty fetch uses separate no-core branch first.

**CH continuity guard:** When DIMO says POSSIBLE_END (non-HIGH) and CH available, `ActivityWindowDetector` may force **ACTIVE** if `pointCount≥3 OR maxSpeed>5 OR odoΔ>0.05`.

### Mandatory questions

| # | Question | Answer |
|---|----------|--------|
| Can ignition ON prevent end? | **During IDLE/perf-active stops — yes (IDLE).** Stale ignition alone **cannot** block POSSIBLE_END (explicit guard step 7). |
| Stale ignition ON forever? | **No** — step 7 → POSSIBLE_END unless perf/energy/frequency says IDLE/ACTIVE. |
| Ignition OFF alone → POSSIBLE_END? | **Yes**, with HIGH confidence when all stopped + no energy (step 5). |
| speed=0 alone → POSSIBLE_END? | **Not immediately** — needs frequency drop, stale ignition path, or ambiguous fallback; traffic stop with perf → IDLE. |
| EV without ignition? | **Yes** — motion/odo/frequency/energy paths; no ignition requirement for end. |

---

## P5.4 — IDLE_WITHIN_TRIP Semantics

| Aspect | Behavior |
|--------|----------|
| Entry | `evaluateContinuity` verdict **IDLE** (stopped + perf active, energy active, or EV/HYB active frequency) |
| Exit | Next tick: ACTIVE (motion) or POSSIBLE_END (inactivity escalation) |
| Cadence | `scheduleActiveTick` — same 30s default as ACTIVE_TRIP |
| `lastActivityAt` | **Set to worker `now`** on IDLE transition — CONFIRMED |
| `lastMeaningfulMovementAt` | **Not updated** on IDLE |
| Snapshot polling | Not directly tiered here; trip remains “open” |
| End candidate timing | IDLE suppresses POSSIBLE_END while perf/frequency indicates awake stop |

**CRITICAL — `lastActivityAt` semantics:** On IDLE, `lastActivityAt = now` is **worker evaluation time**, not physical motion time. Fallback chains (`possibleEndAt`, no-core anchor) may treat it as inactivity anchor → **boundary skew risk** (**P5-F02**).

---

## P5.5 — lastMeaningfulMovementAt Authority

### Writers

| Writer | Condition |
|--------|-----------|
| ACTIVE tick | `hadMeaningfulMovement`: motionCount>0 OR CH guard maxSpeed>5 OR odoΔ>0.05 |
| CH end assist | set to `detectedEndAt` |
| Activity resumed (PEC) | set to `now` |
| CUSUM confirm/reopen | may set from `cusumLastMovementAt` evidence |
| IDLE / POSSIBLE_END entry | does not write (uses existing) |
| RESTING transition | cleared to null |

### Readers

`possibleEndAt` selection, no-core anchor, endTime priority #2, `tripEndLatencyFromMovement`, timeline logs.

### Timestamp authority matrix

| Field | Authority | Typical meaning |
|-------|-----------|-----------------|
| `lastActivityAt` | Worker eval / tick time | Last FSM evaluation or trip row touch — **not purely physical** |
| `lastMeaningfulMovementAt` | Physical motion proxy | Last speed/odo/CH motion evidence |
| `possibleEndAt` | Candidate **boundary** | Often last movement, not state-entry time |
| `cusumValidatedAt` | Worker time | When CUSUM/CH validation recorded |
| `cusumSegmentStart/end` | Data window / segment end | CUSUM result **or** CH segment end stored in same field |
| `trip.endTime` (ONGOING) | Worker `now` each tick | Provisional |
| `trip.endTime` (COMPLETED) | Priority chain | Canonical boundary |
| `trip.updatedAt` | DB | Last row mutation |
| worker `now` | Clock | Gates, schedules, IDLE lastActivityAt |

---

## P5.6 — No-Core-Data End Path

When `corePoints.length === 0`:

1. **CH end assist** (`tryApplyClickHouseAssistedEnd`) — requires VLS inactive + CH segments.
2. Else compute `anchorAt = lastMeaningfulMovementAt ?? lastActivityAt ?? possibleStartAt ?? now`.
3. If `inactiveMs = now - anchorAt ≥ 120s` → **POSSIBLE_END** with `possibleEndAt = anchorAt`.
4. Else reschedule ACTIVE_TICK (trip stays open).

### Anchor staleness scenarios

| Scenario | Risk |
|----------|------|
| Normal park, DIMO sleeps | Intended — fast finalize |
| Provider outage during drive | If anchors stale from last tick, may false-end (**P5-F13**) |
| Tunnel / network loss | Same — depends on anchor age |
| Repeated IDLE `lastActivityAt=now` | **Extends** inactivity clock incorrectly if used as anchor |
| EV no ignition | Works via movement anchor / CH |

**Can outage during real drive look like physical end?** **Yes (INFERRED)** — if core drops but vehicle moving, anchors age out → POSSIBLE_END unless CH guard or resume detects motion on return.

---

## P5.7 — ClickHouse End Assist

**Gate:** `hasClickHouseAnalyticsDetectors()` + `isCurrentTelemetryInactive(VLS)`.

### `isCurrentTelemetryInactive` — VERIFIED

```typescript
// trip-evidence.helpers.ts
if (speed > 0.5) return false;
if (engineLoad > 15) return false;
if (isIgnitionOn === true && speed > 0) return false;
return true;
```

**Semantics:** speed≤0.5, load≤15 → inactive. Ignition ON with speed=0 → **inactive** (allows end assist at idle).

**Protections:** post-stop CH activity window rejects resume; DIMO 90s resume check; ICE requires ignition segment; min stationary 45s; min trip 60s.

**Risk windows:** traffic idle (load≤15), remote HVAC (if load low), stale VLS ignition OFF while moving (assist blocked by inactive check failure — trip may stay open).

### Defaults — VERIFIED (constructor)

| Constant | Default |
|----------|---------|
| `TRIP_END_CH_ASSIST_MIN_STATIONARY_MS` | 45s |
| `TRIP_END_CH_ASSIST_MIN_TRIP_DURATION_MS` | 60s |
| `TRIP_END_CH_ASSIST_STABILITY_MS` | 30s |
| `TRIP_END_CH_ASSIST_HIGH_STATIONARY_MS` | 90s |

### Profile detectors

| Profile | Segment preference |
|---------|-------------------|
| ICE | IgnitionSegment required (`ice_requires_ignition_segment`) |
| EV / HYBRID / UNKNOWN | MotionSegment preferred (`preferMotion=true`) |

---

## P5.8 — CH HIGH vs MEDIUM Path

| Path | FSM writes | CUSUM | Finalize |
|------|------------|-------|----------|
| **HIGH** | POSSIBLE_END + `cusumSegmentEnd=detectedEndAt` | Skipped | Second resume check → `scheduleFinalize` direct |
| **MEDIUM** | same | Skipped at EV if `endDetectionMode=CLICKHOUSE_END_ASSIST && cusumSegmentEnd` | PEC 30s gate → EV → finalize |

**Recognition latency (typical):**

- **HIGH:** segment end + 45s stationary + 90s high stationary + processing ≈ **~2–3 min** after physical stop (INFERRED from gates).
- **MEDIUM:** above + 30s stability + optional EV ≈ **+30–90s**.

**CH can finalize without CUSUM:** **Yes** — HIGH path directly; MEDIUM skips CUSUM at EV.

---

## P5.9 — POSSIBLE_END Temporal Model

**`possibleEndAt` meaning:** Candidate **physical end boundary**, not FSM state-entry timestamp.

Sources:
- Continuity path: `lastMeaningfulMovementAt ?? lastActivityAt ?? now`
- No-core: anchor chain (same priority)
- CH assist: `detectedEndAt` (segment end)

**`elapsedMs = now - possibleEndAt`** drives stability, CUSUM gate, hard timeout.

**Consequence:** If vehicle stopped 5 min ago but FSM just entered POSSIBLE_END, **first PEC can immediately pass** 120s gate (`elapsedMs` already ≥ 120s). This is **by design** (backdated candidate) but collapses “stability wait” wall-clock after late detection.

**State-entry vs boundary:** No separate persisted `possibleEndEnteredAt`; only `possibleEndAt` and logs (`TRIP_END_TIMELINE phase=possible_end_entered`).

---

## P5.10 — Activity-Resumed Cancellation

### Path A — `processPossibleEndCheck`

Clears: `possibleEndAt`, `endDetectionMode`, `endConfidence`, `endValidationAttempts`, all `cusum*`, sets movement anchors to `now`.

### Path B — CUSUM still ongoing (`processEndValidation`)

Clears: `possibleEndAt`, `cusum*`, `endValidationAttempts` — **does NOT clear `endDetectionMode` or `endConfidence`** (~2157–2166).

**CONFIRMED asymmetry — P5-F03:** Stale end metadata can survive CUSUM reopen and appear in a later end cycle / `rawDetectionMeta`.

**Resume evidence:** `hasActivityResumed` — speed > `speedMotionKmh` (0.5); **ignition alone insufficient** (tested in spec).

---

## P5.11 — Stability / Inactivity Gate

### Defaults — VERIFIED

| Constant | Value |
|----------|-------|
| `TRIP_END_STABILITY_WINDOW_MS` | 90s |
| `TRIP_END_MIN_INACTIVITY_BEFORE_CUSUM_MS` | 120s |

```typescript
cusumGateMs = endDetectionMode === CLICKHOUSE_END_ASSIST
  ? TRIP_END_CH_ASSIST_STABILITY_MS   // 30s
  : max(90s, 120s)                    // 120s
```

### Timing examples

| Case | possibleEndAt age at first PEC | First EV eligible |
|------|-------------------------------|-------------------|
| Stop 3 min ago, just entered PE | 180s | Immediate (180 ≥ 120) |
| Stop 60s ago | 60s | Wait 60s more |
| CH MEDIUM | segment+45s stationary | +30s after possibleEndAt |

---

## P5.12 — CUSUM / Change-Point Validation

**Fetch:** `fetchEndValidationWindow(centre=possibleEndAt, lookback=15min, lookahead=5min)` — VERIFIED defaults.

**Algorithm:** `detectTripEndChangePoint` — binary stopped (speed≤2 km/h), upper-CUSUM, threshold H=3, min 4 points.

**Physical meaning:** Detects sustained transition from moving to stopped in speed time-series (not ignition).

**Outcomes:**

| Result | Action |
|--------|--------|
| `appearsOngoing` (last 5 mostly moving) | Reopen ACTIVE_TRIP |
| `changePointDetected` | `detectedEndAt` = change point; finalize |
| inconclusive | Retry PEC (+60s) |
| insufficient_data (<4 pts) | inconclusive |

---

## P5.13 — CUSUM Attempts / Retry / Hard Timeout

### Defaults — VERIFIED

| Constant | Value |
|----------|-------|
| `TRIP_END_VALIDATION_RETRY_MS` | 60s |
| `TRIP_END_VALIDATION_MAX_ATTEMPTS` | 3 |
| `TRIP_END_TIMEOUT_MS` | 30 min |

### Attempt accounting

| Event | Increments `endValidationAttempts`? |
|-------|-------------------------------------|
| PEC schedules EV | **Yes — before EV runs** (step 4) |
| EV inconclusive | No (same attempt count) |
| EV error / catch | No |
| EV success | No further increment |

**Max-attempt finalize:** After 3 scheduled EV cycles, `scheduleFinalize` **without** CUSUM confirmation — **CONFIRMED**.

**Timeline from last movement (normal path, INFERRED):**  
120s gate + ~3×(EV duration + 60s retry) ≈ **4–8 min** typical vs **30 min** hard timeout → max-attempt usually fires **first**; hard timeout is secondary safety net.

**Provider/EV exceptions:** PEC fetch failure for resume → keep waiting (no finalize). EV catch → reschedule PEC — **does not consume extra attempt counter** but burns wall-clock.

---

## P5.14 — End Boundary Priority

### Canonical `endTime` — VERIFIED

```typescript
endTime =
  cusumSegmentEnd ??
  lastMeaningfulMovementAt ??
  lastWaypoint?.recordedAt ??
  possibleEndAt ??
  new Date();
```

**Note:** `cusumSegmentEnd` holds **real CUSUM** and **CH segment end** (same field).

**Coordinates:** `processFinalize` does **not** pass `endLatitude`/`endLongitude` to `finalizeTrip`. Provisional coords from last ACTIVE_TICK route point may remain while `endTime` is backdated — **P5-F12**.

---

## P5.15 — Mid-Trip Gap Split

**Detection:** `findMidTripGap` — gap ≥ **180s**, before stopped (speed≤5), after moving; synthetic anchor at `lastMeaningfulMovementAt ?? lastActivityAt` with speed=0.

**Drift gate:** `drift == null OR drift ≤ 200m` — **`null` allows split** — CONFIRMED (comment: “allow split”).

**Minimum pre-trip duration:** 60s.

**False-split risk:** Telemetry outage with no waypoints → drift null → split allowed while vehicle may still be moving (**P5-F09**).

---

## P5.16 — Mid-Gap Split Failure Window — CONFIRMED

Order inside try block:
1. `splitTripAtGap` (trip1 COMPLETED, trip2 ONGOING) — transaction
2. `transitionState` → FSM `activeTripId = secondTripId`
3. **`await postFinalizeAnalysisProducer`** (trip1)
4. enrichment + `scheduleActiveTick` + return

On throw → catch logs “split failed” → **falls through** to normal ACTIVE_TICK processing with **original local `tripId`**.

**Failure modes:**
- Waypoints/metrics written to **completed trip1** while FSM tracks trip2
- Continuity evaluated against wrong trip row
- **P5-F04 (P0)**

---

## P5.17 — Finalize / Quality / Discard

**`checkTripQuality(durationMs, distanceKm, waypointCount, ...)`**

| Rule | Discard? |
|------|----------|
| duration < 60s AND (distance null OR < 0.1 km) | yes (`too_short_no_distance`) |
| distance < 0.1 km AND waypointCount < 2 | yes (`no_meaningful_movement`) |
| gap < 5 min from previous | merge hint (not used in shown finalize path) |

**waypointCount proxy:** Substitutes for `maxConsecutiveActive` because trip already passed start pipeline; 0–1 waypoints flagged as suspect.

### Representative cases

| Case | Outcome |
|------|---------|
| 30s / 50m / few waypoints | Likely **DISCARD** |
| 50s / 150m / ≥2 waypoints | **COMPLETED** |
| 5min / no odometer / no GPS / ≥2 waypoints | **COMPLETED** (if finalized) |
| 5min / 50m / 1 waypoint | **DISCARD** |
| Legitimate + route outage | May pass if waypoints≥2 from earlier ticks |
| EV short urban reposition | Risk discard if distance<100m and waypoints<2 |

---

## P5.18 — Finalization Mutation Order / Atomicity

| Step | Operation | Atomicity |
|------|-----------|-----------|
| 1 | Read trip + waypoints | read |
| 2 | `checkTripQuality` | pure |
| 3 | `finalizeTrip` / `discardTrip` | single UPDATE — **durable** |
| 4 | Prometheus metrics | side effect |
| 5 | `await postFinalizeAnalysisProducer` | queue enqueue — **can throw** |
| 6 | enrichment enqueue | fire-and-forget |
| 7 | `transitionState(RESTING)` | single UPDATE |
| 8 | Battery LV rest | awaited, local catch |

**No spanning transaction** across trip row + FSM + queue.

---

## P5.19 — Post-Finalize Producer Liveness Coupling — CONFIRMED

`await postFinalizeAnalysisProducer.produceAfterPersistedCompletion(...)` runs **before** `transitionState(RESTING)`.

If producer throws after `finalizeTrip`:
- `vehicleTrip.tripStatus = COMPLETED`
- FSM remains **POSSIBLE_END** with `activeTripId` set
- Outer catch swallows — no rethrow

**Recovery:** `@Interval(120s)` re-enqueues PEC/FINALIZE for stale states; **finalize is re-invokable** (updates COMPLETED again) — postFinalize may **double-enqueue** if not idempotent (**P5-F05**).

---

## P5.20 — Battery LV Rest Session Order

Runs **after** RESTING transition, wrapped in try/catch. Battery failure **does not** block FSM liveness — contrasts with P4-F12 start-proxy ordering.

---

## P5.21 — Timeout RESTING Reason / P4-F07

Hard timeout and max-attempt paths call `processFinalize` with `restingReason = 'complete'` (default). **`lastRestingReason: 'timeout'` never written** on end path — cross-ref **P4-F07 / P5-F08**. Forced-timeout trips get **120s** complete cooldown, not 60s timeout cooldown.

---

## P5.22 — Recovery / Self-Healing

**TripTrackingRecoveryScheduler** (120s):
- Re-enqueues PS / AT / PEC for stale states with expired lock
- POSSIBLE_END > 30 min → `reconciliation.onStuckTrip`
- ACTIVE_TRIP > 4 h → `onAnomalyDetected`

| Failure | Queue recovery | FSM recovery | Trip row repair |
|---------|----------------|--------------|-----------------|
| Lost PEC job | ✓ re-enqueue | — | — |
| Lost FINALIZE | ✓ (via stale PE) | partial | — |
| postFinalize throw | ✓ re-enqueue | stuck until finalize completes | COMPLETED orphan |
| FSM/trip mismatch after mid-gap | ✗ autonomous | ✗ | reconciliation only |

---

## P5.23 — Observability / Metric Semantics

| Metric / log | Observed quantity | Correct? |
|--------------|-------------------|----------|
| `synqdrive_trip_finalize_latency_seconds` | `endTime - startTime` (trip duration) | Help text says “start to finalization” — **not recognition latency** (**P5-F06**) |
| `synqdrive_trip_end_latency_from_movement_seconds` | `endTime - movementAnchor` | Partial recognition signal |
| `TRIP_END_TIMELINE finalizedAt=` | **Canonical end boundary** | Misleading label (**P5-F07**) |
| `vehicle_trip_tracking_runs` | per-run summaries | useful |
| `rawDetectionMeta.endTimeSource` | chosen source enum | persisted at finalize |

**Persisted recognition timestamps:** `endValidationStartedAt` in `lastEvidenceSummary` JSON only; no DB column for worker finalize completion time.

---

## P5.24 — False Premature End Matrix (excerpt)

See **Matrix K** for full table. Highlights:

- Traffic light with perf → **IDLE** (protected)
- Stale ignition, no perf → **POSSIBLE_END** (by design)
- CH idle at traffic (load≤15) → assist may arm (risk)
- No-core outage while moving → **POSSIBLE_END** after 120s anchor (risk)
- Mid-gap drift null → **split** (risk)

---

## P5.25 — False Delayed End Matrix (excerpt)

- EV frequency IDLE path delays POSSIBLE_END
- CH unavailable → DIMO-only slower
- CUSUM inconclusive retries (+60s × attempts)
- END_VALIDATION errors → retry loop
- postFinalize throw → FSM stuck (**P5-F05**)
- Hard timeout 30 min last resort

---

## P5.26 — Profile Comparison

| Dimension | ICE | EV | HYBRID | UNKNOWN |
|-----------|-----|-----|--------|---------|
| End sensitivity | Ignition-off HIGH | Motion/frequency | Both | Conservative UNKNOWN thresholds |
| Largest FP risk | CH idle assist | Frequency IDLE delay → late end; mid-gap | Mixed | CH motion path |
| Largest FN risk | Stale ignition (mitigated) | Short stop frequency | Perf idle stops | Ambiguous fallback |
| CH segment | Ignition required | Motion preferred | Motion preferred | Motion preferred |

---

## P5.27 — Test Coverage

| Area | Coverage | Location |
|------|----------|----------|
| Continuity IDLE/PE | **Covered** | `trip-detection.spec.ts` |
| CH end assist | **Covered** | same |
| isCurrentTelemetryInactive | **Covered** | same |
| hasActivityResumed | **Covered** | same |
| CUSUM | **Covered** | same |
| checkTripQuality | **Covered** | same |
| CH continuity guard | **Covered** | same |
| Mid-gap split live FSM failure fallthrough | **Missing** | — |
| postFinalize throw before RESTING | **Missing** | — |
| CUSUM reopen metadata leak | **Missing** | — |
| finalize metric semantics | **Missing** | — |
| Mid-gap reconciliation | **Partial** | `intra-trip-gap-split-repair.*.spec.ts` |
| postFinalize producer idempotency | **Partial** | `trip-post-finalize-analysis.producer.spec.ts` |

---

## P5.28 — Production Read-Only Evidence

**Status:** Not collected — SSH failed. All production claims in this document are **INFERRED** from code unless labeled CONFIRMED from unit tests.

---

## P5.29 — Quality Verdict

| Dimension | Rating | Evidence |
|-----------|--------|----------|
| ACTIVE continuity sensitivity | ACCEPTABLE | Profile thresholds + CH guard |
| ACTIVE continuity specificity | ACCEPTABLE | perf/energy IDLE paths |
| IDLE correctness | ACCEPTABLE | ICE traffic stops |
| POSSIBLE_END sensitivity | STRONG | Multiple paths including no-core |
| POSSIBLE_END specificity | WEAK | Ambiguous fallback, no-core outage |
| ICE robustness | ACCEPTABLE | Stale ignition fix present |
| EV robustness | ACCEPTABLE | Frequency IDLE; no ignition req |
| HYBRID robustness | ACCEPTABLE | Dual signals |
| Sparse telemetry | WEAK | Fallback to last 3 points |
| No-core robustness | WEAK | 120s anchor finalize |
| CH assist robustness | ACCEPTABLE | Gated; ICE ignition segment |
| CUSUM robustness | ACCEPTABLE | Ongoing detection; sparse fails |
| End boundary accuracy | WEAK | Dual endTime semantics; coord mismatch |
| Recognition latency | WEAK | Metrics mislabel duration |
| Mid-gap split safety | CRITICAL | drift null + failure fallthrough |
| Crash safety | CRITICAL | postFinalize/FSM split |
| Idempotency | WEAK | Re-finalize + double enqueue |
| Recovery robustness | ACCEPTABLE | 120s scheduler + reconciliation |
| Observability | WEAK | Timeline finalizedAt semantics |
| Finalization atomicity | CRITICAL | Trip COMPLETED before RESTING |

---

## P5.30 — Architectural Findings

| ID | Sev | Title | Evidence |
|----|-----|-------|----------|
| **P5-F01** | P1 | Provisional `endTime=now` on every ACTIVE_TICK while ONGOING | `processActiveTick` vehicleTrip.update ~1531 |
| **P5-F02** | P1 | IDLE writes `lastActivityAt=now` — worker time used as physical fallback | ~1763–1767 |
| **P5-F03** | P1 | CUSUM reopen leaves stale `endDetectionMode`/`endConfidence` | EV path ~2157 vs PEC ~1895 |
| **P5-F04** | P0 | Mid-gap split: postFinalize throw → fallthrough with stale `tripId` | try/catch ~1395–1400 |
| **P5-F05** | P0 | postFinalize throw after COMPLETED → FSM stuck POSSIBLE_END | `processFinalize` ~2464–2535 |
| **P5-F06** | P2 | `tripFinalizeLatency` observes trip duration not recognition latency | ~2427–2429; metric help text |
| **P5-F07** | P2 | `TRIP_END_TIMELINE finalizedAt` = canonical boundary not worker time | `logTripEndTimeline` ~3255 |
| **P5-F08** | P2 | Timeout finalize sets `restingReason=complete` — dead timeout cooldown | ~2344; cross-ref P4-F07 |
| **P5-F09** | P2 | Mid-gap allows split when GPS drift unknown (`drift==null`) | ~1258–1259, ~3020–3022 |
| **P5-F10** | P2 | Max CUSUM attempts finalize without CUSUM confirmation | PEC step 5 ~2014–2023 |
| **P5-F11** | P2 | Attempt counter incremented before EV success | PEC step 4 ~1981–1982 |
| **P5-F12** | P3 | finalizeTrip omits end coords — backdated time vs provisional coords | finalize call ~2378 |
| **P5-F13** | P3 | No-core 120s path can false-end on provider outage | ~1155–1161 |

---

# Mandatory Matrices

## Matrix A — Trip End End-to-End Decision Matrix

| Phase | Input signals | Decision | Next job |
|-------|---------------|----------|----------|
| ACTIVE_TICK | core/route/perf/VLS/CH | continuity verdict | AT / PEC |
| ACTIVE_TICK | core=0, inactive≥120s | POSSIBLE_END | PEC |
| ACTIVE_TICK | CH assist confirmed | POSSIBLE_END or finalize | PEC / FIN |
| ACTIVE_TICK | mid-gap+driftOk | split | AT (trip2) |
| PEC | resume | ACTIVE_TRIP | AT |
| PEC | timeout 30m | finalize | FIN |
| PEC | gate pass, attempts<3 | EV | EV |
| PEC | attempts≥3 | finalize | FIN |
| EV | CUSUM ok | finalize | FIN |
| EV | ongoing | ACTIVE_TRIP | AT |
| EV | inconclusive | PEC +60s | PEC |
| FIN | quality ok | COMPLETED+RESTING | — |

## Matrix B — FSM State Transition / Trigger Matrix

| From | To | Trigger |
|------|-----|---------|
| ACTIVE_TRIP | IDLE_WITHIN_TRIP | continuity IDLE |
| IDLE_WITHIN_TRIP | ACTIVE_TRIP | continuity ACTIVE / resume |
| ACTIVE/IDLE | POSSIBLE_END | continuity PE / CH / no-core |
| POSSIBLE_END | ACTIVE_TRIP | resume / CUSUM ongoing |
| POSSIBLE_END | POSSIBLE_END | stability wait / retry |
| POSSIBLE_END | RESTING | finalize success |
| RESTING | POSSIBLE_START | snapshot cooldown elapsed |

## Matrix C — Profile × End-Signal Authority Matrix

| Signal | ICE | EV | HYBRID | UNKNOWN |
|--------|-----|-----|--------|---------|
| Ignition off | HIGH PE boost | optional | optional | optional |
| Speed motion | ACTIVE | ACTIVE | ACTIVE | ACTIVE |
| Odometer Δ | ACTIVE | ACTIVE | ACTIVE | ACTIVE |
| Perf RPM/load | IDLE | n/a typical | IDLE | IDLE |
| Energy Δ | IDLE | IDLE | IDLE | IDLE |
| Frequency | PE/MEDIUM | IDLE/PE | both | PE |
| CH ignition seg | end assist req | — | — | — |
| CH motion seg | fallback | primary | primary | primary |

## Matrix D — End Timestamp / Clock Authority Matrix

(See P5.5 table — reproduced in audit body.)

## Matrix E — End Recognition Latency Matrix

| Path | Candidate latency | Finalization latency | Boundary error |
|------|-------------------|----------------------|----------------|
| Ignition-off PE | 0–120s after stop | +120s gate + EV | Low |
| CH HIGH | ~90s+ stationary | immediate finalize | Low (segment) |
| CH MEDIUM | ~45s+ | +30s + EV skip | Low |
| No-core | anchor age ≥120s | +gate + EV | Medium (anchor) |
| Max attempts | same as PE | +~3–6 min retries | Medium |
| Hard timeout | up to 30 min | immediate at trigger | High if anchor wrong |

## Matrix F — ClickHouse End-Assist Matrix

| Gate | Threshold | Fail result |
|------|-----------|-------------|
| VLS inactive | speed≤0.5, load≤15 | skip assist |
| Trip duration | ≥60s | inconclusive |
| Segment end | ICE ignition / EV motion | inconclusive |
| Post-segment stationary | ≥45s | inconclusive |
| HIGH confidence | seg HIGH + stationary≥90s | direct finalize |
| Post-stop activity | speed/odo/points | inconclusive |
| DIMO resume 90s | motion | cancel |

## Matrix G — CUSUM / Attempts / Timeout Matrix

| Parameter | Value | Effect |
|-----------|-------|--------|
| Lookback | 15 min | EV window |
| Lookahead | 5 min | EV window |
| Max attempts | 3 | then force finalize |
| Retry delay | 60s | inconclusive |
| Hard timeout | 30 min | force finalize |
| Attempt increment | at PEC schedule EV | pre-success |

## Matrix H — Canonical End-Boundary Priority Matrix

| Priority | Source | Used when |
|----------|--------|-----------|
| 1 | cusumSegmentEnd | CUSUM or CH |
| 2 | lastMeaningfulMovementAt | fallback |
| 3 | lastWaypoint.recordedAt | GPS |
| 4 | possibleEndAt | candidate |
| 5 | now | absolute fallback |

## Matrix I — Crash / Failure / Recovery Matrix

| Failure point | Trip row | FSM | Self-heal |
|---------------|----------|-----|-----------|
| After finalizeTrip | COMPLETED | POSSIBLE_END | recovery re-FIN |
| Mid-gap postFinalize throw | trip1 COMPLETED, trip2 ONGOING | ACTIVE trip2 | **partial / manual** |
| EV throw | ONGOING | POSSIBLE_END | PEC retry |
| Worker crash mid-AT | ONGOING provisional endTime | unchanged | recovery AT |
| Redis restart | — | — | recovery @120s |

## Matrix J — Finalize Downstream Coupling Matrix

| Consumer | Awaited? | Failure blocks RESTING? |
|----------|----------|-------------------------|
| finalizeTrip | yes | yes (no RESTING if throw before) |
| postFinalizeAnalysisProducer | yes | **yes — P5-F05** |
| behavior enrichment | no | no |
| RESTING transition | yes | — |
| Battery LV rest | yes (caught) | no |

## Matrix K — False Premature / False Delayed End Matrix

| Scenario | Premature end? | Delayed end? | Protection |
|----------|----------------|--------------|------------|
| Traffic light + perf | No (IDLE) | — | perf IDLE |
| Queue stop | Possible PE | — | resume |
| Remote HVAC low load | CH assist risk | — | activity window |
| Provider outage driving | **Yes** | — | weak |
| Tunnel no core | — | Yes | long open until anchor |
| CUSUM sparse | — | Yes | retries/timeout |
| postFinalize fail | — | Yes (FSM stuck) | recovery |

## Matrix L — Test / Observability / Open Findings Matrix

| Topic | Tests | Metrics | Open finding |
|-------|-------|---------|--------------|
| Continuity | ✓ | tripEvidencePaths | — |
| CH end | ✓ | tripEvidencePaths | — |
| CUSUM | ✓ | tripEndLatencyFromMovement | P5-F11 |
| Finalize coupling | ✗ | tripFinalizeLatency mislabel | P5-F05,F06 |
| Mid-gap live | ✗ | mid_gap_split counter | P5-F04,F09 |
| Metadata leak | ✗ | — | P5-F03 |
| Cooldown timeout | ✗ | — | P5-F08 |

---

# Mandatory Final Questions (1–24)

1. **Earliest physical end signal:** Motion stop + inactivity in continuity window, or CH segment end, or core stream silence (whichever fires first on data path).

2. **ACTIVE_TRIP → IDLE_WITHIN_TRIP:** `evaluateContinuity` verdict **IDLE** (stopped + perf active, energy active, or EV/HYB active frequency).

3. **→ POSSIBLE_END:** Continuity **POSSIBLE_END**; or CH assist; or no-core inactive≥120s; or `assessActiveContinuity` empty → PE in detector (overridden by no-core branch ordering).

4. **DIMO core disappears:** CH assist attempt → else anchor inactivity POSSIBLE_END after 120s → else keep open.

5. **Ignition OFF alone end?** **Yes** (HIGH confidence path when all stopped + no energy).

6. **speed=0 alone end?** **Not alone** — needs frequency drop, stale ignition, ambiguous fallback, or timed no-core path.

7. **Stale ignition ON forever?** **No** — explicit POSSIBLE_END path (step 7).

8. **EV end without ignition?** **Yes** — motion/frequency/CH motion segments.

9. **CH initiate POSSIBLE_END without DIMO core?** **Yes** — no-core branch calls `tryApplyClickHouseAssistedEnd` first.

10. **CH finalize without CUSUM?** **Yes** — HIGH direct; MEDIUM skip at EV.

11. **CUSUM mandatory for normal completion?** **No** — CH paths and max-attempt/timeout bypass.

12. **Fastest valid recognition:** CH HIGH (~2–3 min after stop + gates) or immediate PEC if `possibleEndAt` already aged ≥120s.

13. **Slowest normal live path:** CUSUM inconclusive ×3 + retries approaching **~8–10 min**, or **30 min** hard timeout.

14. **Max attempts before 30 min timeout?** **Yes** — typically **4–8 min** vs 30 min.

15. **Unsuccessful EV consume attempt budget?** **Indirectly** — each PEC cycle increments before EV; inconclusive reuses same count until max.

16. **Accurate boundary with late finalization?** **Yes** — `endTime` backdated via priority chain independent of finalize wall-clock.

17. **Wrong boundary from lastActivityAt worker time?** **Yes** — when used as `possibleEndAt` / anchor (**P5-F02**).

18. **Mid-gap split outage without GPS?** **Yes** — `drift==null` allows split (**P5-F09**).

19. **COMPLETED + FSM POSSIBLE_END?** **Yes** — postFinalize failure (**P5-F05**).

20. **Analysis failure prevent RESTING?** **Yes** — awaited postFinalize before RESTING.

21. **Battery LV failure prevent completion?** **No** — after RESTING, caught.

22. **Stale endDetectionMode after CUSUM reopen?** **Yes** — **P5-F03**.

23. **End-latency metrics = recognition or duration?** `tripFinalizeLatency` = **trip duration**; `tripEndLatencyFromMovement` = partial recognition.

24. **Single highest-priority weakness:** **Finalize/FSM non-atomicity** — COMPLETED trip can persist while FSM remains POSSIBLE_END (`P5-F05`), compounded by mid-gap fallthrough (`P5-F04`).

---

## Changes / Architektur

**No application architecture implementation was modified.**  
SynqDrive Code → **Changes** and **Architektur** were **not** updated (audit-only artifact).

---

*End of P5 audit artifact.*
