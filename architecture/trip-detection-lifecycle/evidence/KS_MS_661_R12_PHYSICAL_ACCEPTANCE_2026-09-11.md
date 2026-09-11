# KS MS 661 — R12 physical acceptance audit (2026-09-11 new drive)

| Field | Value |
|-------|-------|
| **Evidence ID** | TDL-EVID-R12-KS661-ACCEPT-2026-09-11-001 |
| **Source type** | PRODUCTION_OBSERVATION (read-only) |
| **Scenario key** | `KS_MS_661_R12_PHYSICAL_ACCEPTANCE_NEW_DRIVE` |
| **Audit observedAt (UTC)** | `2026-09-11T05:36:35Z` |
| **Production SHA** | `51394e16184f46365994ca4b90cebb930f6e4dbc` (PR #1600 merge) |
| **Production release** | `/opt/synqdrive/releases/20260911023450_v4994` |
| **Deploy promoted (UTC)** | `2026-09-11T02:46:00Z` (symlink switch) |
| **Vehicle** | KS MS 661 — `vehicleId` `c10351f8-b6a2-4258-947f-631aeaa6d359`; DIMO `tokenId` **187361** |
| **Canonical tripId** | `fc93f98f-399c-439b-8fe0-b9ce21e6f544` |
| **Historical cross-ref** | Pre-#1600 failure trip `2bdc6e71-3822-4c9e-bda3-b46c681e6844` — **separate**; [KS_MS_661_R12_PHYSICAL_ACCEPTANCE_FAILURE_2026-09-10.md](./KS_MS_661_R12_PHYSICAL_ACCEPTANCE_FAILURE_2026-09-10.md) |

## Operator ground truth (Europe/Berlin CEST = UTC+02:00)

| Label | Local | UTC | Precision |
|-------|-------|-----|-----------|
| Drive START | ~06:32 | **~04:32:00** | minute |
| Drive END | ~07:02 | **~05:02:00** | minute |

## Forensic window

Primary: **`2026-09-11T04:15:00Z` → `2026-09-11T05:36:35Z`**

Runtime invariant: drive occurred **after** #1600 deploy (`51394e16…` @ `20260911023450_v4994`).

---

## Phase 0 — Deployment eligibility (@ `2026-09-11T05:34:35Z`)

| Check | Result |
|-------|--------|
| Release symlink | `/opt/synqdrive/current` → `20260911023450_v4994` |
| Release HEAD SHA | `51394e16184f46365994ca4b90cebb930f6e4dbc` |
| PR #1600 merge SHA match | **EXACT** |
| Replica A (`synqdrive`, pid 935290, port 3001) | online; cwd `…/20260911023450_v4994/backend` |
| Replica B (`synqdrive-b`, pid 935556, port 3002) | online; cwd `…/20260911023450_v4994/backend` |
| nginx upstream | `127.0.0.1:3001` + `127.0.0.1:3002` |
| PostgreSQL / Redis | OK (read-only probes) |

```
PRODUCTION_SHA_REPLICA_A = 51394e16184f46365994ca4b90cebb930f6e4dbc
PRODUCTION_SHA_REPLICA_B = 51394e16184f46365994ca4b90cebb930f6e4dbc
SAME_SHA_ALL_REPLICAS = YES
R12_1600_PRESENT_IN_PRODUCTION_TREE = YES
```

---

## Phase 1 — Canonical trip identity

| Field | Value |
|-------|-------|
| `tripId` | `fc93f98f-399c-439b-8fe0-b9ce21e6f544` |
| `trip_status` @ audit | **ONGOING** |
| `start_time` | `2026-09-11T04:33:00.000Z` |
| `end_time` (populated while ONGOING) | `2026-09-11T05:04:50.953Z` — **anomaly**; no `end_detection_mode`; not COMPLETED |
| `distance_km` | 15 |
| `trip_source` | **V2_LIVE** |
| `start_detection_mode` | IGNITION_PRIMARY |
| `dimo_segment_id` | `dimo-seg-187361-1789101180000` |
| `created_at` | `2026-09-11T04:40:17.382Z` |

**Uniqueness:** exactly **one** `vehicle_trips` row in window `04:15–05:30Z`. `SINGLE_CANONICAL_TRIP = YES`. `FALSE_SPLIT_OCCURRED = NO`.

**Start vs driver ground truth:** canonical `04:33:00Z` vs driver `04:32:00Z` → **`TRIP_START_ERROR_SECONDS = 60`**. Explained by DIMO segment effective start with `startBoundaryAdjustedMs = -428000` (segment boundary earlier than wake confirmation); not a duplicate trip.

---

## Phase 2 — Start lifecycle

| Step | Timestamp (UTC) | Evidence |
|------|-----------------|----------|
| DIMO trigger / wake | `04:39:47` webhook; provider `04:39:43` | `startWake.source=DIMO_TRIGGER`, `reason=SPEED_MOVEMENT` |
| POSSIBLE_START | `04:34:21` first PSV | 7× `POSSIBLE_START_VALIDATION` |
| ACTIVE_TRIP confirmed | `04:40:17` | PM2: `Trip CREATED`, `ACTIVE_TRIP confirmed mode=IGNITION_PRIMARY startSource=DIMO_SEGMENT` |
| Canonical start bound | `04:33:00` | DIMO segment + `confirmedStartAt` in evidence |

```
START_CANDIDATE_AT = 2026-09-11T04:40:08.000Z
START_CONFIRMATION_AT = 2026-09-11T04:40:17.378Z
ACTIVE_TRIP_AT = 2026-09-11T04:40:17.378Z
START_CLOCK_SOURCE = PROVIDER_EVENT_TIME (DIMO segment + ClickHouse assist)
START_EVIDENCE = DIMO_TRIGGER wake + DIMO_SEGMENT + IGNITION_PRIMARY
START_VALID = YES
```

No duplicate trip creation; no repair/reconciliation on start path.

---

## Phase 3 — Physical stop / end boundary

| Field | Value |
|-------|-------|
| Driver ground truth | ~`2026-09-11T05:02:00Z` |
| `lastMeaningfulMovementAt` (FSM) | `2026-09-11T05:03:20.058Z` |
| `stopBoundaryAt` (evidence + DB `possible_end_at`) | `2026-09-11T05:03:38.000Z` |
| `stopBoundarySource` | `provider_stationary_vls` |
| `stopBoundaryClockAuthority` | `PROVIDER_EVENT_TIME` |
| `stopBoundaryTrust` | **true** |
| VLS `source_timestamp` @ audit | `2026-09-11T05:03:38` (ignition OFF, speed 0) |

```
STOP_BOUNDARY_VALID = YES
END_ERROR_VS_DRIVER_SECONDS = 98  (stopBoundaryAt 05:03:38 vs driver ~05:02:00)
```

Stop boundary is provider-stationary VLS at ignition-off snapshot — physically authoritative; not forced to driver minute.

---

## Phase 4 — POSSIBLE_END clock durability (R12 critical)

POSSIBLE_END entered @ **`2026-09-11T05:05:48.501Z`** via `boundary_backed_provider_silence` / `no_core_data_corroborated_to_possible_end`.

| Field | DB @ audit | Evidence JSON |
|-------|------------|---------------|
| `possible_end_at` | **`2026-09-11T05:03:38`** | `stopBoundaryAt` aligned |
| `possible_end_entered_at` | **`2026-09-11T05:05:48.249`** | `possibleEndEnteredAt` aligned |

```
POSSIBLE_END_REACHED = YES
POSSIBLE_END_FIRST_AT = 2026-09-11T05:05:48.501Z
PE_CLOCKS_PRESENT_WHILE_POSSIBLE_END = YES
PE_CLOCK_RECONCILIATION_USED = NO
CLOCK_LOSS_OBSERVED_THIS_DRIVE = NO
```

**Contrast with pre-#1600 failure (`2bdc6e71…`):** that drive had `POSSIBLE_END` + both NULL DB columns. **This drive proves R12 clock column persistence on natural entry** — both columns populated without reconciliation repair.

---

## Phase 5 — END_VALIDATION / BullMQ lock-contention audit

Tracking runs for this trip (@ audit):

| run_type | count |
|----------|------:|
| ACTIVE_TRACKING | 39 |
| POSSIBLE_END_CHECK | 16 |
| END_VALIDATION | **0** |
| FINALIZATION_CHECK | **0** |

PEC timeline after POSSIBLE_END:

- `05:06:51` — `stability_window_waiting` (dwell 62s < 90s stability)
- `05:07:21` → `05:34:51` — **15×** `triggering_cusum_validation` with `completedAttempts=0`

PM2 `TRIP_END_TIMELINE phase=end_validation_scheduled` logged **3×** (`05:16:51`, `05:24:51`, `05:26:51`) on replica A only.

Redis BullMQ @ audit: **no** `trip-ev-*`, `trip-pec-*`, or `trip-fin-*` keys for this vehicle/trip; queue wait/active/delayed lists empty.

Log grep (all replicas, 2026-09-11): **0×** `locked by another worker` / `could not be removed`.

```
END_VALIDATION_REACHED = NO
END_VALIDATION_COMPLETED = NO
ACTIVE_LOCK_ENCOUNTERED = NO
ACTIVE_JOB_REMOVE_ATTEMPTED = NO  (no log/exception evidence)
LOCKED_JOB_REMOVE_EXCEPTION = NO
SUCCESSOR_JOB_USED = NO
STABLE_SLOT_HANDOFF_VALID = NOT_EXERCISED
MULTI_REPLICA_AUTHORITY_CONFLICT = NO
DUPLICATE_END_AUTHORITY = NO
```

**Interpretation:** R12 lock-contention regression target **not observed** (no active-lock remove failure). Instead, a **different failure mode**: PEC repeatedly schedules CUSUM validation (`triggering_cusum_validation`, evidence `endValidationScheduledAt` updates) but **END_VALIDATION never executes** (0 tracking runs). Root mechanism **INCONCLUSIVE** from read-only audit — enqueue skip / worker dispatch gap suspected; **not** proven as lock contention.

---

## Phase 6 — Finalize

```
FINALIZE_REACHED = NO
FINALIZE_COMPLETED = NO
TRIP_COMPLETED_NATURALLY = NO
```

Trip remains **`ONGOING`** with an anomalous populated `end_time` (`05:04:50.953`) without `end_detection_mode` or COMPLETED status — inconsistent terminal state.

---

## Phase 7 — Terminal FSM state (@ audit)

| Field | Value |
|-------|-------|
| `state` | **POSSIBLE_END** |
| `activeTripId` | `fc93f98f-399c-439b-8fe0-b9ce21e6f544` |
| `possibleEndAt` | `2026-09-11T05:03:38` |
| `possibleEndEnteredAt` | `2026-09-11T05:05:48.249` |
| Fleet ONGOING count | **1** (this trip) |

```
RESTING_REACHED = NO
ACTIVE_TRIP_ID_CLEARED = NO
ORPHANED_END_CYCLE_AUTHORITY = NO  (no EV/FIN jobs in Redis; no duplicate authority)
PENDING_END_CYCLE_JOBS = 0 observable in Redis at audit
```

Expected healthy terminal state **not** reached.

---

## Phase 8 — Repair path exclusion

| Repair type | Status | Notes |
|-------------|--------|-------|
| MISSING_TRIP | SUPPRESSED | duplicate/overlap noise; not applied |
| PARTIAL_TRIP_BOUNDARY_EXTENSION | SUPPRESSED @ `05:16:51` | "Canonical trip already matches provider boundaries" |
| STALE_ONGOING / STALE_FINALIZE / manual | **none applied** to this trip |

```
STALE_ONGOING_REPAIR_USED = NO
STALE_FINALIZE_REPAIR_USED = NO
MANUAL_REPAIR_USED = NO
RECONCILIATION_REPAIR_USED = NO
LIFECYCLE_RECOVERY_USED = NO  (startEpisode metadata only; no end repair)
NORMAL_END_CYCLE_ONLY = NO
```

---

## Phase 9 — Old failed trip cross-check

Trip `2bdc6e71-3822-4c9e-bda3-b46c681e6844` @ audit: **COMPLETED** `2026-09-10T19:36–20:16:37` — unchanged by this audit.

```
OLD_FAILED_TRIP_MUTATED_BY_THIS_AUDIT = NO
```

---

## Phase 10 — Acceptance verdict

```
PRODUCTION_SHA_MATCH = YES
R12_1600_PRESENT_ON_ALL_REPLICAS = YES

CANONICAL_TRIP_ID = fc93f98f-399c-439b-8fe0-b9ce21e6f544
TRIP_START_VALID = YES
TRIP_START_ERROR_SECONDS = 60
SINGLE_CANONICAL_TRIP = YES
FALSE_SPLIT_OCCURRED = NO

STOP_BOUNDARY_VALID = YES
STOP_BOUNDARY_AT = 2026-09-11T05:03:38.000Z
STOP_BOUNDARY_SOURCE = provider_stationary_vls
STOP_BOUNDARY_TRUST = YES

POSSIBLE_END_REACHED = YES
PE_CLOCKS_DURABLE = YES
CLOCK_LOSS_OBSERVED = NO

END_VALIDATION_REACHED = NO
END_VALIDATION_COMPLETED = NO
ACTIVE_JOB_REMOVE_ATTEMPTED = NO
LOCKED_JOB_REMOVE_EXCEPTION = NO
STABLE_SLOT_HANDOFF_VALID = NOT_EXERCISED
MULTI_REPLICA_AUTHORITY_CONFLICT = NO

FINALIZE_REACHED = NO
FINALIZE_COMPLETED = NO

TRIP_COMPLETED_NATURALLY = NO
TRIP_END_AT = (not finalized; anomalous end_time 2026-09-11T05:04:50.953Z on ONGOING row)
TRIP_END_ERROR_SECONDS = N/A (incomplete)

RESTING_REACHED = NO
ACTIVE_TRIP_ID_CLEARED = NO
ORPHANED_END_CYCLE_AUTHORITY = NO

STALE_ONGOING_REPAIR_USED = NO
MANUAL_REPAIR_USED = NO
RECONCILIATION_REPAIR_USED = NO

R12_PRODUCTION_BEHAVIOR_VALIDATED = NO
R12_PHYSICAL_ACCEPTANCE_VERDICT = FAIL
CONFIDENCE = HIGH
```

### Partial R12 wins (do not constitute PASS)

1. **#1600 code confirmed on both replicas** before and during the drive.
2. **PE clock durability:** both `possible_end_at` and `possible_end_entered_at` persisted while `POSSIBLE_END` — direct regression fix vs `2bdc6e71…` NULL-column failure.
3. **No active-lock remove exception** — pre-#1600 lock contention signature absent.
4. **Clean start path** — single canonical trip, DIMO wake + segment start.

### Failure (blocks PASS)

End cycle **did not complete**: 16× PEC with `triggering_cusum_validation`, **0× END_VALIDATION**, **0× FINALIZE**, FSM stuck **`POSSIBLE_END`**, trip **`ONGOING`**.

### Next investigative step (read-only follow-up)

Determine why `scheduleEndValidation` evidence updates without `processEndValidation` tracking runs — inspect enqueue outcomes (`skipped` / `canEnqueueQueue`), BullMQ job lifecycle, and replica worker dispatch for `END_VALIDATION` on `51394e16…` **without mutating Production**.

---

## Explicit non-actions

- Did **not** repair trip `fc93f98f…` or historical `2bdc6e71…`.
- Did **not** deploy, restart replicas, mutate DB/Redis, or enqueue jobs.

## Validation commands (reproduce read-only)

```bash
ssh synqdrive-admin@srv1374778.hstgr.cloud \
  'readlink -f /opt/synqdrive/current; tr -d "\n" < /opt/synqdrive/current/.git/refs/heads/main'
# sudo-sourced backend.env + psql SELECT-only on vehicle_trips / vehicle_trip_detection_states / vehicle_trip_tracking_runs
```
