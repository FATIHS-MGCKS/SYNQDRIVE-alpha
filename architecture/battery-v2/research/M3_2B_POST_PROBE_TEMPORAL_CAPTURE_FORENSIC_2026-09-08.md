# M3.2B — Post-Probe Trip Finalization + Temporal Capture Forensic

**Prior probe UTC:** `2026-09-08T05:10:44Z`  
**This audit UTC:** `2026-09-08T05:22:59Z`  
**Phase-C T0 (immutable):** `2026-09-07T22:47:14Z`  
**Mode:** read-only production forensic audit — **no mutations**  
**Shadow flag (observed):** `BATTERY_V2_SHUTDOWN_EVIDENCE_SHADOW_ENABLED=true`

---

## Executive summary

~12 minutes after the first natural shutdown probe, **both target trips remain `trip_status=ONGOING`**. Fleet-wide shadow tables are still empty. M3.2B did not write rows — **blocked by trip finalization**, not by shadow-hook runtime failure.

| Finding | KS MX 2024 | KS MS 661 |
|---------|------------|-----------|
| Trip finalized? | **NO** | **NO** |
| FSM end pipeline | `END_VALIDATION` **passed** @ `05:17:36Z` but **`FINALIZE` never completed** | Never entered `POSSIBLE_END`; stuck `ACTIVE_TRIP` + `no_core_data_keep_open` |
| Shadow rows | 0 | 0 |
| Provider silence before finalize? | **YES** — last LV @ `05:02:15Z` | **YES** — last LV @ `04:52:30Z` |
| Temporal blind spot (architecture) | **PROVEN** | **PROVEN** |

**Primary verdict:** `D` — **TRIP_FINALIZATION_DEFECT_BLOCKED_M3_2B**  
**Temporal blind spot:** `PROVEN` (code + persisted signal timing; not yet observed post-finalize because finalize has not occurred)

---

## 1 — Current trip finalization state

### KS MX 2024

```
VEHICLE=KS MX 2024
TRIP_ID=e830b6e6-b738-4c35-8d88-39e05f1b5aad
CURRENT_TRIP_STATUS=ONGOING
TRIP_END_TIME=2026-09-08T05:02:45.017Z
FINALIZED_AT=(not persisted — trip not COMPLETED)
FINALIZATION_DELAY_MS=(not applicable — not finalized)

END_CANDIDATE_AT=2026-09-08T05:02:15Z
END_VALIDATION_SCHEDULED_AT=2026-09-08T05:21:35.732Z
END_VALIDATION_EXECUTED_AT=2026-09-08T05:17:36.038Z
```

**Post-probe delta (since `05:10:44Z`):**

- `05:17:36Z` — `END_VALIDATION` run: `reason=clickhouse_end_assist_skip_cusum`, `validatedEndTime=2026-09-08T05:02:15.000Z`, tracking `result_state=RESTING`, `cusum_validated_at` set.
- `scheduleFinalize()` invoked per orchestration code path — **no `FINALIZATION_CHECK` tracking run**, trip row still `ONGOING`, FSM still `POSSIBLE_END`.
- `05:19:36Z` and `05:21:36Z` — additional `POSSIBLE_END_CHECK` runs still `triggering_cusum_validation` with `completedAttempts=0` (finalize did not close the episode).

```
WHY_STILL_ONGOING=END_VALIDATION succeeded and finalize was scheduled, but FINALIZE job did not persist COMPLETED trip (no FINALIZATION_CHECK run in vehicle_trip_tracking_runs)
EXPECTED_BY_FSM_CONTRACT=NO — after successful END_VALIDATION + scheduleFinalize, trip should reach COMPLETED promptly
OVERDUE_FINALIZATION=YES — physical inactivity ~20+ min since last LV; END_VALIDATION passed ~5 min before audit
JOB_MISSING=INSUFFICIENT_EVIDENCE (Redis URL empty in backend.env shell parse; BullMQ queue not inspectable read-only from this audit shell)
JOB_DELAYED=POSSIBLE (finalize enqueue at 05:17:36 with no observed completion by 05:22:59)
FSM_ERROR=YES — POSSIBLE_END episode re-triggers validation after END_VALIDATION success without trip completion
```

### KS MS 661

```
VEHICLE=KS MS 661
TRIP_ID=a0823caa-5303-42b1-abdf-bea073acfc42
CURRENT_TRIP_STATUS=ONGOING
TRIP_END_TIME=2026-09-08T04:53:29.880Z
FINALIZED_AT=(not persisted — trip not COMPLETED)
FINALIZATION_DELAY_MS=(not applicable — not finalized)

END_CANDIDATE_AT=(none — FSM never entered POSSIBLE_END)
END_VALIDATION_SCHEDULED_AT=(none)
END_VALIDATION_EXECUTED_AT=(none)
```

**Post-probe delta:** 49 consecutive `ACTIVE_TRACKING` runs `05:00–05:19Z`, all `no_core_data_keep_open` / `KEEP_OPEN`. Operational inactivity grew from ~17 min at prior probe to **~29 min** at this audit. No `POSSIBLE_END`, no `END_VALIDATION`, no ClickHouse end assist.

```
WHY_STILL_ONGOING=no_core_stream + no ClickHouse end-assist trigger; FSM remains ACTIVE_TRIP despite prolonged post-stop inactivity
EXPECTED_BY_FSM_CONTRACT=NO — ICE profile with ~29 min operational inactivity and last meaningful movement @ 04:52:29Z should have entered end-detection (inactivity guard / end assist / timeout paths)
OVERDUE_FINALIZATION=YES
JOB_MISSING=YES for end pipeline (no POSSIBLE_END / END_VALIDATION / FINALIZE jobs evidenced in tracking runs)
JOB_DELAYED=NO (end jobs never scheduled)
FSM_ERROR=YES — trip end detection blocked on no-core stream keep-open loop
```

### FSM timing contract reference (defaults)

| Parameter | Value | Source |
|-----------|-------|--------|
| `TRIP_END_TIMEOUT_MS` | 1,800,000 (30 min) | `worker.tripEndTimeoutMs` |
| `TRIP_END_VALIDATION_RETRY_MS` | 60,000 | worker config |
| `TRIP_END_VALIDATION_MAX_ATTEMPTS` | 3 | worker config |
| `STUCK_POSSIBLE_END_THRESHOLD_MS` | 1,800,000 (30 min) | recovery scheduler |

KS MX `POSSIBLE_END` entered @ `05:03:45Z` — 30 min hard timeout not yet reached at audit, but **END_VALIDATION already passed**; overdue relative to validated end, not relative to timeout alone.

---

## 2 — Shadow rows after finalization

Re-queried `battery_trip_shutdown_contexts` and `battery_shutdown_evidence_observations`:

```
KS_MX_CONTEXTS=0
KS_MX_OBSERVATIONS=0

KS_MS_CONTEXTS=0
KS_MS_OBSERVATIONS=0
```

No rows exist for either trip (no per-row detail — tables empty for these `trip_id`s).

Fleet-wide post-T0 counts remain **0 / 0**.

---

## 3 — Temporal sequence

Timestamps from authoritative `battery_measurements` (`type=LIVE_VOLTAGE`, `quality=VALID`) and trip/FSM rows.

### KS MX 2024

| Marker | Timestamp (UTC) |
|--------|-------------------|
| `LAST_DRIVING_LV_AT` | `2026-09-08T05:02:00Z` @ 14.788 V (engine on, speed 8 km/h) |
| `LAST_ACTIVE_ALTERNATOR_AT` | `2026-09-08T05:02:00Z` @ 14.788 V |
| `LAST_LOW_VOLTAGE_AT` | `2026-09-08T05:02:15Z` @ 12.36 V (ign off, speed 0; context `engineRunning=true`) |
| `PHYSICAL_END_CANDIDATE_AT` | `2026-09-08T05:02:15Z` (`possible_end_at`) |
| `LAST_PROVIDER_OBSERVATION_AT` | `2026-09-08T05:02:15Z` |
| `PROVIDER_SILENCE_START_AT` | `2026-09-08T05:02:15Z` (no further LIVE_VOLTAGE rows) |
| `TRIP_FINALIZED_AT` | **not reached** |
| `FIRST_SHADOW_ELIGIBLE_AT` | **blocked** — requires `trip_status=COMPLETED` |
| `FIRST_SHADOW_OBSERVATION_AT` | **none** |

```
LAST_USEFUL_SIGNAL_TO_FINALIZATION_MS=(not finalized at audit)
PROVIDER_SILENCE_TO_FINALIZATION_MS=(not finalized at audit)
```

At audit time, provider silence duration ≈ **20.7 min** (`05:02:15` → `05:22:59`) with trip still `ONGOING`.

### KS MS 661

| Marker | Timestamp (UTC) |
|--------|-------------------|
| `LAST_DRIVING_LV_AT` | `2026-09-08T04:52:30Z` @ 12.33 V |
| `LAST_ACTIVE_ALTERNATOR_AT` | `2026-09-08T04:49:36Z` @ 14.404 V |
| `LAST_LOW_VOLTAGE_AT` | `2026-09-08T04:52:30Z` @ 12.33 V (ign off, speed 1 km/h, engine off) |
| `PHYSICAL_END_CANDIDATE_AT` | `2026-09-08T04:53:29.880Z` (`last_activity_at` / provisional `end_time`) |
| `LAST_PROVIDER_OBSERVATION_AT` | `2026-09-08T04:52:30Z` |
| `PROVIDER_SILENCE_START_AT` | `2026-09-08T04:52:30Z` |
| `TRIP_FINALIZED_AT` | **not reached** |
| `FIRST_SHADOW_ELIGIBLE_AT` | **blocked** |
| `FIRST_SHADOW_OBSERVATION_AT` | **none** |

Provider silence duration at audit ≈ **30.5 min** (`04:52:30` → `05:22:59`).

### Useful evidence before finalization

Both trips contain **post-alternator low-voltage samples persisted in `battery_measurements` before any `COMPLETED` status**. After provider silence, **no new LIVE_VOLTAGE classify events** will arrive to feed the shadow observation hook even after eventual finalization.

---

## 4 — Architectural blind-spot test

Implementation semantics (repository code):

```117:137:backend/src/modules/vehicle-intelligence/battery-health/shutdown-evidence/shutdown-evidence.repository.ts
  async findLatestCompletedIceTripInCaptureWindow(input: {
    vehicleId: string;
    observationAt: Date;
    preWindowMs: number;
    postWindowMs: number;
  }) {
    const windowStart = new Date(input.observationAt.getTime() - input.postWindowMs);
    const windowEnd = new Date(input.observationAt.getTime() + input.preWindowMs);
    return this.prisma.vehicleTrip.findFirst({
      where: {
        vehicleId: input.vehicleId,
        endTime: { not: null, gte: windowStart, lte: windowEnd },
        tripStatus: 'COMPLETED',
      },
```

```42:102:backend/src/modules/vehicle-intelligence/battery-health/shutdown-evidence/shutdown-evidence-capture.service.ts
  async captureFromObservationClassify(
    payload: BatteryObservationClassifyPayload,
  ): Promise<ShutdownEvidenceCaptureOutcome> {
    ...
    const trip = await this.repository.findLatestCompletedIceTripInCaptureWindow({...});
    if (!trip?.endTime) {
      return 'skipped_outside_window';
    }
```

```38:43:backend/src/modules/vehicle-intelligence/battery-health/shutdown-evidence/shutdown-evidence-trip-context.service.ts
  async captureAtTripFinalization(
    input: CaptureTripShutdownContextInput,
  ): Promise<TripShutdownContextCaptureOutcome> {
    if (!isBatteryV2ShutdownEvidenceShadowEnabled()) {
      return 'skipped_flag_off';
    }
```

Trip context captures **current VLS at finalize time**, not historical shutdown measurements.

| Question | Answer |
|----------|--------|
| `DOES_SHADOW_OBSERVATION_CAPTURE_REQUIRE_COMPLETED_TRIP=` | **YES** — hard `tripStatus: 'COMPLETED'` gate in `findLatestCompletedIceTripInCaptureWindow` |
| `CAN_PRE_FINALIZATION_OBSERVATIONS_BE_RETAINED=` | **NO** — shadow tables empty; hook skips without COMPLETED trip; no buffer |
| `ARE_PRE_FINALIZATION_LIVE_VOLTAGE_SAMPLES_RETROACTIVELY_AVAILABLE_TO_M3_2B=` | **NO at runtime** — authoritative rows exist in `battery_measurements` but M3.2B capture path does not backfill from them |
| `DOES_FINALIZATION_DELAY_CAUSE_LOSS_OF_POST_ENGINE_OFF_PRE_SLEEP_EVIDENCE=` | **YES** — when provider goes silent before finalize, observation hook never runs on the shutdown sample; finalize-time context reads stale/silent VLS |

```
TEMPORAL_CAPTURE_BLIND_SPOT=PROVEN
```

**Mechanism:** physical shutdown → provider delivers final LV sample → provider silence → trip FSM finalizes later → shadow hook eligible only after useful live classify events have ceased.

---

## 5 — Counterfactual reconstruction

Using **only** persisted `battery_measurements.context` + classification policy (`shutdown-evidence-classification.policy.ts`). No writes, no backfill.

Policy gates for target classes:

- `POST_ENGINE_OFF_PRE_SLEEP`: requires `activeTrip=false`, `engineRunning=false`, `ignitionOn=false`, speed at rest (≤0.5 km/h), provider field timestamp, within ±10 min of trip end.
- `SHUTDOWN_TRANSITION`: requires speed at rest, `ignitionOn=false`, `engineRunning=false`, trip may still be active.

### KS MX @ `2026-09-08T05:02:15Z` (12.36 V)

Persisted context: `speedKmh=0`, `ignitionOn=false`, **`engineRunning=true`**, `hasActiveTrip=true`.

```
KS_MX_COUNTERFACTUAL_SHUTDOWN_EVIDENCE=NO — engineRunning=true routes to ACTIVE_NON_CHARGING, not SHUTDOWN_TRANSITION or POST_ENGINE_OFF_PRE_SLEEP
KS_MX_COUNTERFACTUAL_BEST_VOLTAGE=12.36
```

If `engineRunning` were false (policy threshold engineLoad>5), **counterfactual class would be `SHUTDOWN_TRANSITION`** (active trip still true, speed at rest, ignition off) — but persisted authoritative context records `engineRunning=true`.

### KS MS @ `2026-09-08T04:52:30Z` (12.33 V)

Persisted context: **`speedKmh=1`**, `ignitionOn=false`, `engineRunning=false`, `hasActiveTrip=true`. Trip provisional end ~59 s later.

```
KS_MS_COUNTERFACTUAL_SHUTDOWN_EVIDENCE=NO — speed 1 km/h exceeds at-rest threshold 0.5 km/h; fails SHUTDOWN_TRANSITION and POST_ENGINE_OFF_PRE_SLEEP
KS_MS_COUNTERFACTUAL_BEST_VOLTAGE=12.33
```

---

## 6 — Verdict

```
PRIMARY_RESULT=D
TRIP_FSM_HEALTH=DEFECTIVE (KS MX finalize stall after END_VALIDATION; KS MS end-detection never triggered)
M3_2B_SHADOW_HOOK_HEALTH=NOT_EXERCised (blocked upstream — no COMPLETED trips)
TEMPORAL_CAPTURE_BLIND_SPOT=PROVEN
ARCHITECTURE_CHANGE_REQUIRED=UNDETERMINED (audit-only; no implementation change in this workstream)
M3_2C_ALLOWED=NO
PRODUCTION_CHANGED=NO
```

### Result key

| Code | Meaning | This audit |
|------|---------|------------|
| A | Finalized + shadow worked | No |
| B | Finalized but no natural shutdown signal | No — not finalized |
| **C** | Temporal blind spot proven | **Yes** (architecture + timing) |
| **D** | Trip finalization defect blocked M3.2B | **Yes** (primary blocker) |
| E | Insufficient evidence | Partial — Redis/BullMQ job state not fully inspectable |

**Primary = D** because neither trip reached `COMPLETED`, which is the hard prerequisite for all M3.2B shadow writes. **C** is concurrently proven as an architectural property that would apply even after finalize on these trips (provider already silent; no retroactive capture path).

---

## Evidence commands (read-only)

- Trip/FSM/shadow SQL @ `2026-09-08T05:22:59Z` on production VPS
- `vehicle_trip_tracking_runs` post `05:10:44Z`
- `battery_measurements` LIVE_VOLTAGE for both vehicles
- Worker log: `synqdrive-b-out-5.log` — KS MX `TRIP_END_TIMELINE` entries; no finalize completion log after `05:17:36Z` END_VALIDATION DB row

---

## Related documents

- `M3_2B_FIRST_NATURAL_SHUTDOWN_EVIDENCE_PROBE_2026-09-08.md` (prior probe @ `05:10:44Z`)
- `M3_2B_PHASE_C_SHADOW_ACTIVATION_2026-09-08.md`
