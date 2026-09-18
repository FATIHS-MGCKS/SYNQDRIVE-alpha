# M3.2B — First Natural Post-Activation Shutdown Forensic Probe (KS MX 2024 + KS MS 661)

**Probe UTC:** `2026-09-08T05:10:44Z`  
**Phase-C T0 (immutable):** `2026-09-07T22:47:14Z`  
**Mode:** read-only production forensic probe — **no mutations**  
**Shadow flag (observed):** `BATTERY_V2_SHUTDOWN_EVIDENCE_SHADOW_ENABLED=true`

---

## Executive summary

Two natural morning trips on KS MX 2024 and KS MS 661 began and reached **provisional `end_time` values after Phase-C T0**, but **neither trip had `trip_status=COMPLETED` nor trip-FSM finalization at probe time**. Fleet-wide: **0** `battery_trip_shutdown_contexts`, **0** `battery_shutdown_evidence_observations`.

M3.2B shadow capture is **architecturally gated**:

| Layer | Trigger | Gate observed |
|-------|---------|---------------|
| `BatteryTripShutdownContext` | `captureAtTripFinalization()` in trip FSM | Trip **finalized** → not yet reached |
| `BatteryShutdownEvidenceObservation` | LIVE_VOLTAGE classify hook | Requires `vehicle_trips.trip_status = 'COMPLETED'` in T−10m…T+15m window (`findLatestCompletedIceTripInCaptureWindow`) |

**Verdict:** `INSUFFICIENT_EVIDENCE` for first natural M3.2B lifecycle proof. This is **not** classified as `M3_2B_CAPTURE_DEFECT` — shadow writes were **not expected** until trip finalization completes. Re-probe after both trips reach `COMPLETED`.

Authoritative LIVE_VOLTAGE exists during both trips (29 KS MX / 19 KS MS samples) — provider signal behavior differs between vehicles at trip-end boundary.

---

## Step 1 — Identify exact trips

### KS MX 2024 (`a60c0749-a7cd-494e-b5b9-dea3c6b97d63`, Mercedes-Benz C 63 AMG)

| Field | Value |
|-------|-------|
| `VEHICLE` | KS MX 2024 |
| `TRIP_ID` | `e830b6e6-b738-4c35-8d88-39e05f1b5aad` |
| `TRIP_STARTED_AT` | `2026-09-08T04:32:00Z` |
| `TRIP_ENDED_AT` | `2026-09-08T05:02:45.017Z` (provisional on row) |
| `TRIP_DURATION` | ~30.8 min |
| `TRIP_STATUS` | **`ONGOING`** (not `COMPLETED`) |
| `FSM_STATE` | **`POSSIBLE_END`** |
| `POST_PHASE_C_T0` | **YES** |

Trip timeline notes (logs): initial ClickHouse end assist @ `04:47:51Z` was **superseded** by resumed driving; current `possible_end_at=2026-09-08T05:02:15Z`; `end_validation_scheduled` @ `2026-09-08T05:09:35.734Z` — finalize pending at probe.

### KS MS 661 (`c10351f8-b6a2-4258-947f-631aeaa6d359`, Audi A4)

| Field | Value |
|-------|-------|
| `VEHICLE` | KS MS 661 |
| `TRIP_ID` | `a0823caa-5303-42b1-abdf-bea073acfc42` |
| `TRIP_STARTED_AT` | `2026-09-08T04:33:00Z` |
| `TRIP_ENDED_AT` | `2026-09-08T04:53:29.880Z` (provisional on row) |
| `TRIP_DURATION` | ~20.5 min |
| `TRIP_STATUS` | **`ONGOING`** (not `COMPLETED`) |
| `FSM_STATE` | **`ACTIVE_TRIP`** |
| `POST_PHASE_C_T0` | **YES** |

### Fleet strict completion check

```sql
-- trip_status = COMPLETED AND end_time >= Phase-C T0
-- Result: 0 rows (both vehicles + entire fleet)
```

```
KS_MX_2024_POST_T0_TRIP_FOUND=YES
KS_MS_661_POST_T0_TRIP_FOUND=YES
POST_T0_COMPLETED_TRIPS=0
```

**Interpretation:** Natural driving segments with post-T0 `end_time` exist. **Canonical completed trips** (FSM-finalized, `trip_status=COMPLETED`) do **not** yet exist — these are the M3.2B validation substrate.

---

## Step 2 — Shutdown context

```
KS_MX_SHUTDOWN_CONTEXT_FOUND=NO
KS_MS_SHUTDOWN_CONTEXT_FOUND=NO
```

No `BatteryTripShutdownContext` rows exist fleet-wide (pre or post probe).

**Classification:** **Expected pending finalization**, not a capture defect. Context is written only in `TripDetectionOrchestrationService` at trip finalization when `shutdownEvidenceTripContext.captureAtTripFinalization()` runs.

---

## Step 3 — Shadow observations around trip end

```
KS_MX_SHADOW_OBSERVATIONS=0
KS_MS_SHADOW_OBSERVATIONS=0
SHADOW_OBSERVATIONS_TOTAL=0
```

No shadow observation rows to enumerate.

**Why (code contract):** `ShutdownEvidenceRepository.findLatestCompletedIceTripInCaptureWindow` filters `tripStatus: 'COMPLETED'`. Both target trips remain `ONGOING` despite provisional `end_time`. LIVE_VOLTAGE classify ran (29 + 19 authoritative measurements) but shadow hook returned `skipped_outside_window` / no qualifying completed trip.

---

## Step 4 — Shutdown sequence reconstruction (authoritative LIVE_VOLTAGE only)

> **Epistemic note:** Timeline below uses **authoritative** `battery_measurements` (`LIVE_VOLTAGE`), not M3.2B shadow rows. Provided for provider-behavior context only — **not** M3.2B provenance fields.

### KS MX 2024 — trip `e830b6e6…` (end ref `05:02:45Z`)

| Phase | Timestamp (UTC) | LV (V) | Notes |
|-------|-----------------|--------|-------|
| Driving / alternator | `04:33:08` … `04:47:03` | ~14.78–14.82 | ACTIVE_ALTERNATOR band |
| Brief drop | `04:47:51` | 12.346 | Possible shutdown-transition candidate |
| Resumed alternator | `04:52:00` … `05:02:00` | ~14.77–14.82 | Trip continued |
| Trip-end region | `05:02:15` | **12.36** | Last LV; aligns with `possible_end_at` |
| Post-trip (auth) | — | — | No further LIVE_VOLTAGE after `05:02:15` in window |

`LAST_ACTIVE_ALTERNATOR_AT=2026-09-08T05:02:00Z`  
`FIRST_SHUTDOWN_TRANSITION_AT=2026-09-08T04:47:51Z` (superseded by resume)  
`LAST_FRESH_POST_TRIP_LV_AT=2026-09-08T05:02:15Z`  
`TELEMETRY_SILENCE_START_AT=~2026-09-08T05:02:15Z` (provider `last_seen_at` frozen)

Latest state @ probe: `12.36V`, speed `0`, ignition `false`, **engine_load ~9.02**, online `false`.

### KS MS 661 — trip `a0823caa…` (end ref `04:53:29Z`)

| Phase | Timestamp (UTC) | LV (V) | Notes |
|-------|-----------------|--------|-------|
| Driving / alternator | `04:34:09` … `04:49:36` | ~14.40–14.48 | ACTIVE_ALTERNATOR band |
| Pre-end drop | `04:52:30` | **12.33** | 59s **before** provisional trip end |
| Post-trip (auth) | — | — | **No** LIVE_VOLTAGE after `04:52:30` |

`LAST_ACTIVE_ALTERNATOR_AT=2026-09-08T04:49:36Z`  
`LAST_FRESH_POST_TRIP_LV_AT=2026-09-08T04:52:30Z` (**before** trip end)  
`TELEMETRY_SILENCE_START_AT=~2026-09-08T04:52:30Z`

Latest state @ probe: `12.33V`, speed `1`, ignition `false`, engine_load `0`, online `false`.

---

## Step 5 — Clean shutdown evidence

Shadow layer: **not exercised** — cannot apply M3.2B evidence classes to DB rows.

Authoritative pre-shadow signal assessment (informational only):

| Vehicle | `POST_ENGINE_OFF_PRE_SLEEP_FOUND` | Blocker |
|---------|-----------------------------------|---------|
| KS MX 2024 | **NO** | Trip not finalized; engine_load ~9 at latest state; no shadow classification |
| KS MS 661 | **NO** | Last LV **before** trip end; `PROVIDER_SILENCE` after `04:52:30`; trip not finalized |

```
KS_MX_POST_ENGINE_OFF_PRE_SLEEP_FOUND=NO
KS_MS_POST_ENGINE_OFF_PRE_SLEEP_FOUND=NO
CONFIRMED_POST_ENGINE_OFF_PRE_SLEEP_SAMPLE_EXISTS=NO
MULTI_VEHICLE_CONFIRMED_COHORT=NO
```

---

## Step 6 — SHUTDOWN_TRANSITION quality

No M3.2B shadow rows. Authoritative LV suggests:

| Vehicle | Auth transition candidate | Limitation |
|---------|---------------------------|------------|
| KS MX | `12.36V @ 05:02:15` near end | Engine load non-zero; trip not finalized; FSM still `POSSIBLE_END` |
| KS MS | `12.33V @ 04:52:30` | **59s before** trip end; not post-trip |

```
KS_MX_SHUTDOWN_TRANSITION_FOUND=NO
KS_MS_SHUTDOWN_TRANSITION_FOUND=NO
```

(Shadow-layer counts remain 0; above is non-authoritative LV context only.)

---

## Step 7 — Provider / signal behavior comparison

| Metric | KS MX 2024 | KS MS 661 |
|--------|------------|-----------|
| Post-trip LV samples (auth LIVE_VOLTAGE after trip end ref) | **1** (`12.36V @ 05:02:15`) | **0** |
| Provider timestamp advances after end | **NO** (`last_seen_at` frozen @ `05:02:15`) | **NO** (frozen @ `04:52:30`, before end ref) |
| First post-trip sample delay | **0 ms** (at `possible_end_at`) | **N/A** (no post-end sample) |
| Telemetry silence after end | **YES** (immediate) | **YES** (59s before end ref) |

```
VEHICLE_SIGNAL_PATTERN_COMPARISON=PARTIALLY_DIFFERENT
```

KS MX shows a trip-end-aligned LV drop; KS MS last sample precedes end with earlier silence — consistent with prior M3.2 signal observability findings (`M3_2_REST_SIGNAL_OBSERVABILITY_ARCHITECTURE_AUDIT_2026-09-07.md`).

---

## Step 8 — Shadow capture health

| Check | Result |
|-------|--------|
| `SHADOW_CONTEXTS_EXPECTED` | **0** (zero finalized post-T0 trips) |
| `SHADOW_CONTEXTS_FOUND` | **0** |
| `SHADOW_OBSERVATIONS_TOTAL` | **0** |
| `LOGICAL_DUPLICATES` | **0** |
| `IDEMPOTENCY_VIOLATIONS` | **0** |
| `ORPHAN_OBSERVATIONS` | **0** |
| `SHADOW_WRITE_ERRORS` | **0** (no Prisma/shutdown-evidence errors in logs) |

```
SHADOW_CAPTURE_HEALTH=PASS
```

Health = **no erroneous writes**; not proof that capture path succeeded on a natural event.

---

## Step 9 — Authoritative isolation

| Path | Post-T0 activity on target vehicles | Shadow-attributable? |
|------|--------------------------------------|----------------------|
| REST sessions (new) | 0 opened for today's trips | NO |
| REST measurements | 2 rows `CONTAMINATED_BY_ACTIVE_TRIP` on **pre-T0** sessions (reconciliation timestamps post-T0) | NO — pre-existing sessions |
| Assessments | 0 new | NO |
| Publications | 0 new | NO |

```
AUTHORITATIVE_REGRESSION_OBSERVED=NO
SHADOW_EVIDENCE_AFFECTED_AUTHORITATIVE_STATE=NO
```

Shadow layer wrote nothing; authoritative changes are unrelated reconciliation on old sessions during active trips.

---

## Step 10 — First natural M3.2B verdict

```
OVERALL_RESULT=INSUFFICIENT_EVIDENCE
```

**Rationale:**

- Post-T0 natural trips **found** but **not finalized** (`trip_status=ONGOING`).
- M3.2B shadow layer **not yet invoked** by design (finalization + `COMPLETED` gate).
- Cannot prove or disprove clean `POST_ENGINE_OFF_PRE_SLEEP` shadow capture on this probe.
- **Not** `M3_2B_CAPTURE_DEFECT` — no failed shadow write after finalization.
- **Not** `NATURAL_SHUTDOWN_EVIDENCE_CAPTURE_PROVEN`.

```
M3_2C_ALLOWED=NO
PRODUCTION_VALIDATED=PENDING_NATURAL_E2E_EVIDENCE
M3_1_VALIDATION_BLOCKER=SIGNAL_OBSERVABILITY
```

### Re-probe trigger

Re-run this forensic probe when:

1. `vehicle_trips.trip_status = 'COMPLETED'` for post-T0 target trips, **and**
2. `battery_trip_shutdown_contexts` row exists (or finalization log confirms capture attempt).

Expected first shadow activity: context at finalize + observations on subsequent LIVE_VOLTAGE classify cycles within T−10m…T+15m once trip is `COMPLETED`.

---

## Operational context (non-mutation observation)

- PM2 processes restarted ~`2026-09-08T05:01:27Z` (new PIDs vs Phase-C activation); shadow flag remained `true`.
- Unrelated pre-existing noise: `LOCK_CONTENTION` on KS MS REST target evaluate @ `03:02:37Z`.

---

## Machine-readable block

```
BATTERY_V2_M3_2B_FIRST_NATURAL_SHUTDOWN_PROBE=COMPLETE

PHASE_C_T0=2026-09-07T22:47:14Z
PROBE_UTC=2026-09-08T05:10:44Z

KS_MX_2024_POST_T0_TRIP_FOUND=YES
KS_MS_661_POST_T0_TRIP_FOUND=YES
POST_T0_COMPLETED_TRIPS=0

KS_MX_TRIP_ID=e830b6e6-b738-4c35-8d88-39e05f1b5aad
KS_MS_TRIP_ID=a0823caa-5303-42b1-abdf-bea073acfc42

KS_MX_SHUTDOWN_CONTEXT_FOUND=NO
KS_MS_SHUTDOWN_CONTEXT_FOUND=NO

KS_MX_SHADOW_OBSERVATIONS=0
KS_MS_SHADOW_OBSERVATIONS=0

KS_MX_POST_ENGINE_OFF_PRE_SLEEP_FOUND=NO
KS_MS_POST_ENGINE_OFF_PRE_SLEEP_FOUND=NO

KS_MX_SHUTDOWN_TRANSITION_FOUND=NO
KS_MS_SHUTDOWN_TRANSITION_FOUND=NO

KS_MX_BEST_VOLTAGE=12.36
KS_MS_BEST_VOLTAGE=12.33

KS_MX_BEST_CONFIDENCE=N/A
KS_MS_BEST_CONFIDENCE=N/A

KS_MX_PROVIDER_TIMESTAMP_ADVANCES_AFTER_END=NO
KS_MS_PROVIDER_TIMESTAMP_ADVANCES_AFTER_END=NO

KS_MX_FIRST_POST_TRIP_SAMPLE_DELAY_MS=0
KS_MS_FIRST_POST_TRIP_SAMPLE_DELAY_MS=N/A

VEHICLE_SIGNAL_PATTERN_COMPARISON=PARTIALLY_DIFFERENT

CONFIRMED_POST_ENGINE_OFF_PRE_SLEEP_SAMPLE_EXISTS=NO
MULTI_VEHICLE_CONFIRMED_COHORT=NO

SHADOW_CONTEXTS_EXPECTED=0
SHADOW_CONTEXTS_FOUND=0
SHADOW_OBSERVATIONS_TOTAL=0
LOGICAL_DUPLICATES=0
IDEMPOTENCY_VIOLATIONS=0
ORPHAN_OBSERVATIONS=0
SHADOW_WRITE_ERRORS=0

SHADOW_CAPTURE_HEALTH=PASS

AUTHORITATIVE_REGRESSION_OBSERVED=NO
SHADOW_EVIDENCE_AFFECTED_AUTHORITATIVE_STATE=NO

OVERALL_RESULT=INSUFFICIENT_EVIDENCE

M3_2C_ALLOWED=NO

PRODUCTION_VALIDATED=PENDING_NATURAL_E2E_EVIDENCE
M3_1_VALIDATION_BLOCKER=SIGNAL_OBSERVABILITY

PRODUCTION_CHANGED=NO
```
