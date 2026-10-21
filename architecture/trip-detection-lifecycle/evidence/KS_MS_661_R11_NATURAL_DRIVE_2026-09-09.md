# KS MS 661 — R11 natural drive five-axis Production forensics (2026-09-09)

| Field | Value |
|-------|-------|
| **Evidence ID** | TDL-EVID-KS-MS-661-R11-NATURAL-001 |
| **Source type** | PRODUCTION_OBSERVATION (read-only) |
| **Scenario key** | `KS_MS_661_NATURAL_DRIVE_R11` |
| **Production SHA** | `f7eb94cb5228a341becd346f9d5f7448345d2ad0` |
| **Production release** | `/opt/synqdrive/releases/20260909024150_v4994` |
| **Deploy evidence** | TDL-EV-R11-PROD-DEPLOY-001 (PR #1588) |
| **Audit observedAt (UTC)** | `2026-09-09T05:17:34Z` (terminal snapshot; drive ended T4 @ 05:06:22Z; ≥10 min post-T4 threshold met) |
| **Vehicle** | KS MS 661 — Audi A4; `vehicleId` `c10351f8-b6a2-4258-947f-631aeaa6d359`; DIMO `tokenId` **187361** |
| **Canonical tripId** | `3b26019d-ddf1-4961-863b-769e5d72f73f` |
| **Historical cross-ref** | [KS_MS_661_NATURAL_DRIVE_2026-09-08.md](KS_MS_661_NATURAL_DRIVE_2026-09-08.md) (TDL-EVID-KS-MS-661-001) — **separate drive**; do not conflate tripIds |

## Operator ground truth (Europe/Berlin CEST = UTC+02:00)

| Label | Local | UTC | Precision |
|-------|-------|-----|-----------|
| T1 trip start | ~06:38 | ~04:38 | minute |
| T2 motor OFF | 06:59:57 | **04:59:57** | second |
| T3 motor ON / resume | 07:01:29 | **05:01:29** | second |
| T4 final motor OFF | 07:06:22 | **05:06:22** | second |

Pause duration (operator): **92 s** (below 120 s end-candidacy silence boundary).

## Forensic window

Primary: **`2026-09-09T04:30:00Z` → `2026-09-09T05:17:34Z`**

Runtime invariant: **no Production release change** during the drive (R11 @ `f7eb94cb…` from deploy @ 02:51 UTC through audit end).

---

## Phase 0 — Runtime invariants (@ `2026-09-09T05:17:34Z`)

| Check | Result |
|-------|--------|
| Release symlink | `/opt/synqdrive/current` → `20260909024150_v4994` |
| Release HEAD | `f7eb94cb5228a341becd346f9d5f7448345d2ad0` |
| Replica A | `synqdrive` pid **296834**, port **3001**, online |
| Replica B | `synqdrive-b` pid **297087**, port **3002**, online |
| nginx upstream | `127.0.0.1:3001` + `127.0.0.1:3002` |
| PostgreSQL | OK |
| Redis | PONG |
| Scheduler | Replica A logs `DimoSnapshotScheduler` recovery ticks @ 05:15–05:16 (leader-side activity on pid 296834) |
| Fleet ONGOING | **1** (this trip only) |

**Mixed-runtime during drive:** none observed.

---

## Phase 1 — Canonical trip identity

| Field | Value |
|-------|-------|
| `tripId` | `3b26019d-ddf1-4961-863b-769e5d72f73f` |
| `trip_status` @ audit | **ONGOING** |
| `start_time` | `2026-09-09T04:37:00.000Z` |
| `end_time` (populated) | `2026-09-09T05:07:30.026Z` — **present while status still ONGOING** |
| `distance_km` | 17 |
| `trip_source` | **V2_LIVE** (not REPAIRED) |
| `start_detection_mode` | IGNITION_PRIMARY |
| `dimo_segment_id` | `dimo-seg-187361-1788928620000` |
| `created_at` | `2026-09-09T04:39:21.909Z` |

**Uniqueness:** exactly **one** `vehicle_trips` row for this vehicle with `start_time >= 2026-09-09T04:30:00Z`. No split, duplicate, or overlapping ONGOING companions.

**Tracking runs (window):** 3× `POSSIBLE_START_VALIDATION`, 77× `ACTIVE_TRACKING`; **0×** `POSSIBLE_END_CHECK`, `END_VALIDATION`, `FINALIZATION_CHECK`.

**Repair exclusion:** no `trip_repairs` rows today; no reconciliation proposals mutating this trip.

---

## Phase 2 — RETROSPECTIVE_PRE_START_BASELINE

No live T0 was captured for KS MS 661 immediately before T1 (T0 on deploy was KS MX 187336 only).

| Item | Value / status |
|------|----------------|
| Prior trip | `e324ee8c-8e17-4cfc-ac16-294dacef5d01` — COMPLETED `2026-09-08T19:36–19:59` (historical STALE_ONGOING incident trip) |
| Pre-T1 FSM state | **UNKNOWN** (no persisted snapshot before T1) |
| Pre-T1 `activeTripId` | **UNKNOWN** — inferred RESTING from prior trip COMPLETED, not independently archived |
| Wake mailbox / queue @ T1 | **UNKNOWN** (Redis job history not fully reconstructed for pre-T1) |

Label: **RETROSPECTIVE_PRE_START_BASELINE** only — not captured T0.

---

## Five-axis verdict matrix

| Axis | Verdict | Core proof |
|------|---------|------------|
| **A — R9 natural wake** | **PASS** | FSM `startWake`: `source=DIMO_TRIGGER`, `reason=IGNITION_ON`, `providerObservedAt=2026-09-09T04:38:17.000Z`, `receivedAt=2026-09-09T04:38:20.433Z`, `snapshotFetchedAt=2026-09-09T04:38:20.711Z`. Webhook log on replica A @ 04:38:56 (pid 296834). Replica B: no webhook lines in start window. Start path not polling-only. |
| **B — Trip start** | **PASS** | 3× `POSSIBLE_START_VALIDATION` → `ACTIVE_TRIP` @ 04:39:21; PM2 `ACTIVE_TRIP confirmed` `mode=IGNITION_PRIMARY` `startSource=DIMO_SEGMENT`; `V2_LIVE` row created; not repair/reconciliation. |
| **C — 92 s motor-off pause** | **INCONCLUSIVE** | Same trip stayed ONGOING (no split/end). Waypoint speed 0 @ 04:59:53 (~4 s before T2). Empty-core run @ 05:01:21 records `vlsProviderObservedAt=04:59:57` and `operationalAnchorAt=04:59:50.213` (`lastProviderActivityAt`). **But:** `stopBoundaryAt` **null** in all 80 runs; no `pauseDetectedAt`; 0× `IDLE_WITHIN_TRIP`; core `motion_detected` until 05:00:51 after T2. |
| **D — Same-trip resume** | **PASS** | Single `tripId` throughout; `motion_detected` @ 05:02:57; waypoints resume ~05:02:06; no second `VehicleTrip`; no duplicate start cycle. |
| **E — Regular trip end** | **FAIL** | After T4 (05:06:22): 0× `POSSIBLE_END` / `END_VALIDATION` / `FINALIZE`; FSM **ACTIVE_TRIP** @ audit; `innerGateReason=vls_stale_provider_observation`, `emptyCoreDeferralStreak=8`; post-stop `motion_detected` @ 05:06:59 and 05:07:30; STALE_ONGOING **not** fired yet but trip stuck ONGOING >10 min post-T4. |

### Summary flags

| Flag | Value |
|------|-------|
| TRIP_SPLIT | **NO** |
| SAME_TRIP_RESUME | **YES** |
| POSSIBLE_END_REACHED | **NO** |
| END_VALIDATION_REACHED | **N/A** |
| FINALIZE_REACHED | **NO** |
| COMPLETION_AUTHORITY | **NONE** (still ONGOING @ audit) |
| FINAL_FSM_STATE | **ACTIVE_TRIP** |
| ACTIVE_TRIP_ID | `3b26019d-ddf1-4961-863b-769e5d72f73f` |
| POST_TEST_FLEET_ONGOING | **1** |

---

## Axis A — R9 natural wake (detail)

### Persisted wake chain (FSM `last_evidence_summary.startWake`)

```json
{
  "reason": "IGNITION_ON",
  "source": "DIMO_TRIGGER",
  "providerObservedAt": "2026-09-09T04:38:17.000Z",
  "receivedAt": "2026-09-09T04:38:20.433Z",
  "snapshotFetchedAt": "2026-09-09T04:38:20.711Z",
  "cooldownBypassUsed": true
}
```

### Latency (secured endpoints)

| Interval | Δ | Notes |
|----------|---|-------|
| Operator ≈ T1 → `providerObservedAt` | ~37 s | T1 approximate |
| `providerObservedAt` → `receivedAt` | **3.4 s** | Same FSM object |
| `receivedAt` → `snapshotFetchedAt` | **0.3 s** | Same wake object |
| `startCandidateEnteredAt` → `startRecognizedAt` | **~61 s** | FSM POSSIBLE_START → ACTIVE_TRIP |
| `receivedAt` → first PM2 webhook log | **~36 s** | Log @ 04:38:56 vs persisted `receivedAt` 04:38:20 — log lag; same-event identity plausible not proven |

**Classification:** **R9_WEBHOOK_WAKE** (not `PERIODIC_SNAPSHOT_POLL` as primary start driver).

**Cross-replica:** webhook receiver = replica **A** (pid 296834); replica B silent in start window.

---

## Axis B — Trip start (detail)

| Timestamp (UTC) | Event |
|-----------------|-------|
| 04:38:17 | Provider wake `providerObservedAt` |
| 04:38:20.761 | `startCandidateEnteredAt` |
| 04:38:21 / 04:38:51 / 04:39:21 | `POSSIBLE_START_VALIDATION` runs |
| 04:39:21.905 | `startRecognizedAt` / trip `created_at` |
| 04:39:21 | PM2: Trip CREATED + ACTIVE_TRIP confirmed |

Persisted start boundary: **04:37:00** (DIMO segment retrospective; `startBoundaryAdjustedMs=-78000`).

Detection vs operator T1: **−1 min** on persisted start (acceptable segment back-adjust).

---

## Axis C — 92 s motor-off pause (detail)

Window inspected: **04:58:30Z – 05:02:30Z**

| Time (UTC) | Evidence |
|------------|----------|
| 04:59:53.222 | Waypoint speed **0** |
| 04:59:57 | Operator T2 motor OFF |
| 04:58:49 – 05:00:51 | Core **`motion_detected`** (SUCCESS_WITH_DATA) — pause not yet empty-core |
| 05:01:21.943 | First **`no_core_data_keep_open`**: `innerGateReason=operational_inactivity_below_threshold`, `vlsProviderObservedAt=**04:59:57**`, `operationalAnchorAt=04:59:50.213`, `operationalAnchorSource=lastProviderActivityAt`, `stopBoundaryAt=**null**` |
| 05:01:53 – 05:01:54 | `innerGateReason=**vls_motor_activity_at_standstill**`, VLS UNKNOWN |
| 05:01:29 | Operator T3 motor ON |
| 05:02:06+ | Waypoints show resumed movement |
| 05:02:57.468 | `motion_detected` resume tick |

**Sub-findings:**

1. FSM recognized standstill at provider time **indirectly** (anchor + VLS timestamp @ T2 in empty-core run) but **did not persist `stopBoundaryAt`**.
2. Trip remained open — **correct outcome**, insufficient structured pause evidence for full PASS.
3. No premature `POSSIBLE_END` / COMPLETED / second trip — **correct**.

---

## Axis D — Same-trip resume (detail)

| Check | Result |
|-------|--------|
| Same `tripId` | YES |
| Post-pause movement provider-time > anchor | Waypoints resume 05:02:06; anchor 04:59:50 — **YES** |
| Stale pre-pause core counted as resume | Core empty during pause window before resume motion — **no false resume from stale core in empty-core phase** |
| Duplicate start / split | **NO** |

Resume latency (operator T3 → first waypoint motion): **~37 s** (05:01:29 → 05:02:06).

---

## Axis E — Regular trip end (detail)

Window: **05:05:00Z – 05:17:34Z** (≥11 min after T4)

| Time (UTC) | Evidence |
|------------|----------|
| 05:06:22 | Operator T4 final motor OFF |
| 05:06:49.562 | FSM `lastProviderActivityAt` / `last_meaningful_movement_at` |
| 05:06:58.562 | Waypoint speed **0** |
| 05:06:30.712 | Empty core: `innerGateReason=**vls_speed_above_motion_threshold**`, VLS **ACTIVE**, `operationalInactiveMs=132128` |
| 05:06:59 / 05:07:30 | **`motion_detected`** after stop — rejuvenates `last_activity_at` to **05:07:30.026** |
| 05:07:00 | VLS persisted: speed 0, ignition false, **engineLoad ~39.6%** |
| 05:07:54+ | Empty core: `operational_inactivity_below_threshold`, VLS UNKNOWN |
| 05:09:00+ | `innerGateReason=**vls_stale_provider_observation**`, `operationalInactiveMs` → 544656 @ 05:15:54 |
| Audit | FSM **ACTIVE_TRIP**; `possible_end_at` **null**; `end_validation_attempts=0` |

**Historical KS MS 661 defect comparison (@ R10 `684950419…` trip `e324ee8c…`):**

| Failure mode | 2026-09-08 | 2026-09-09 R11 |
|--------------|------------|----------------|
| Worker-time anchor reset blocking end | Observed (16.9 s worker vs 76 s motor-off) | **Partial fix** — empty-core runs use `operationalAnchorSource=lastProviderActivityAt`; **but** post-stop `motion_detected` still moves `last_activity_at` to 05:07:30 |
| `stopBoundaryAt` natural | **NO** | **NO** — null in all runs |
| Stale / active engineLoad at standstill | Observed | **Reproduced** — `vls_motor_activity_at_standstill` @ pause; engineLoad ~39.6 @ 05:07:00 at final stop |
| Empty-core blocks end (`no_core_data_keep_open`) | Observed | **Reproduced** |
| Stale VLS → UNKNOWN blocks progression | Observed | **Reproduced** — `vls_stale_provider_observation` from 05:09:00 |
| Regular `POSSIBLE_END` | **NO** | **NO** |
| Normal R10 finalization | **NO** | **NO** |
| STALE_ONGOING repair | **YES** @ 21:40:38 | **Not yet** @ audit — trip still ONGOING |

**R11_HISTORICAL_KS_MS_661_FAILURE_FIXED:** **NO** (start/resume improved; end path reproduces blocked-empty-core pattern)

---

## Provider-time timeline (significant points only)

| Provider time (UTC) | Reception / worker time | Signal | Notes |
|---------------------|-------------------------|--------|-------|
| 04:38:17 | received 04:38:20 | IGNITION_ON wake | R9 start |
| 04:37:00 | trip boundary | Segment start | Retrospective |
| 04:59:57 | seen in run @ 05:01:21 | Motor off (VLS) | Matches T2 |
| 04:59:53 | waypoint | speed 0 | Pre-T2 |
| 05:02:06+ | waypoints | motion resume | Post-T3 |
| 05:06:22 | operator T4 | final motor off | |
| 05:06:49 | anchor | last meaningful movement | |
| 05:07:00 | VLS row | speed 0, ign off, load ~39.6 | Last provider snapshot |
| 05:07:30 | worker | `motion_detected` / `last_activity_at` | **Worker-time**, not new provider motion |

---

## Trip boundary accuracy

| Boundary | Operator (UTC) | Persisted / detected | Δ |
|----------|----------------|----------------------|---|
| Start | ~04:38 | 04:37:00 effective | ~−1 min (segment adjust) |
| Pause OFF | 04:59:57 | VLS @ 04:59:57 in run; waypoint 0 @ 04:59:53 | ~−4 s waypoint |
| Resume | 05:01:29 | motion ~05:02:06 waypoints | ~+37 s recognition |
| End | 05:06:22 | `end_time` 05:07:30 while ONGOING; anchor 05:06:49 | Not finalized — boundary premature in column |

---

## Cross-replica / queue forensics

| Stage | Replica / process |
|-------|-------------------|
| Start webhook | A (296834) |
| ACTIVE_TRIP commit | A (296834) logs |
| Trip tracking ticks | Both replicas possible; no duplicate trip rows |
| End path workers | **None** — no PEC/EV/FINALIZE jobs materialized |
| Scheduler stuck recovery | A @ 05:15–05:16 — 1 vehicle (likely this token) |

Redis: `bull:dimo.trip-tracking:failed` key exists (type not list — not enumerated destructively). No failed-job drain performed.

---

## Evidence status / decision impact

- **Do not** promote R11 globally to `PRODUCTION_VALIDATED`.
- **Do not** claim fleet-wide R9 or R11 validation.
- Scenario-scoped outcome: **`KS_MS_661_NATURAL_DRIVE_R11` — PARTIAL** (A/B/D PASS; C INCONCLUSIVE; E FAIL).
- TDL-DEC-R11-001 remains **`CI_VALIDATED` + `POST_DEPLOY_HEALTH_CONFIRMED`**; natural end-path behavior **NOT validated** on this vehicle.
- TDL-DEC-R11-001 scenario note: start wake + FSM start **observed**; empty-core end regression **reproduced**.

---

## Method

Read-only SSH to Production VPS `srv1374778.hstgr.cloud`; `sudo -u postgres psql synqdrive` SELECT-only; PM2 log grep; Redis PING/read-only key probe; no deploy, restart, mutation, repair, or provider refresh calls.
