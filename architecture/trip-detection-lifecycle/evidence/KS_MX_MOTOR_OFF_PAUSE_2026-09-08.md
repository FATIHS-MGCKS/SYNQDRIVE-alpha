# KS MX 2024 — Motor-off pause, false resume & finalize inconsistency

| Field | Value |
|-------|-------|
| **Evidence ID** | TDL-EV-R10-KS-MX-001 |
| **Source type** | PRODUCTION_OBSERVATION + CODE |
| **Observation window (UTC)** | `2026-09-08T04:43:00Z` – `05:25:00Z` |
| **Vehicle** | KS MX 2024 — DIMO tokenId `187336` |
| **Trip ID** | `e830b6e6-b738-4c35-8d88-39e05f1b5aad` |
| **Operator ground truth** | ~06:47 CEST motor/ignition OFF for several minutes, then restart — same journey |
| **Production release @ observation** | `7b9a7857…` @ `20260908045043_v4994` (deploy during trip tail ~05:01:27 UTC) |
| **Repository fix branch** | `cursor/trip-fsm-motor-off-pause-finalize-64c8` (R10) |
| **Epistemic** | Root causes **CONFIRMED** in code review + regression tests; Production fix **NOT DEPLOYED** |

## Reconstructed timeline (UTC)

| Time | Event | Layer |
|------|-------|-------|
| `04:47:19` | Last meaningful movement (speed ~38 km/h) | Provider |
| `04:47:51` | ClickHouse ignition segment end | Analytics assist |
| `04:48:50` | CH end assist → `POSSIBLE_END` | FSM |
| `04:48:51` | **`activity_resumed`** — cancelled `POSSIBLE_END` | FSM (false positive) |
| `04:50:08` | `END_VALIDATION` → RESTING logged + `scheduleFinalize` | Worker |
| `04:51:34` | Telemetry returns after ~7 min gap | Provider |
| `04:52:02` | Movement resumes | Provider |
| `04:53:37` | Second `activity_resumed` → `ACTIVE_TRIP` | FSM (legitimate) |
| `04:54:08` | Mid-gap split **REJECTED** (798 m drift > 200 m max) | R6 guard |
| `05:02:45` | True trip end boundary | Provider |
| `05:17:36` | Second `END_VALIDATION` → RESTING logged | Worker |
| Audit (~05:24) | Trip `ONGOING`, provisional `end_time` set, FSM `POSSIBLE_END` | DB + FSM |

## Proven root causes (code)

### 1. False `activity_resumed` @ `04:48:51`

**Mechanism:** `checkDimoActivityResumed` / `hasActivityResumed` scanned a sliding 90s window from worker `now` without anchoring to the end boundary (`possibleEndAt` / `cusumSegmentEnd`). Pre-stop motion at `04:47:19` (speed 38) remained inside the window and satisfied `speed > speedMotionKmh`.

**Not the cause:** Stale ignition alone (already fixed in Fix C). Telemetry gap itself did not trigger resume — old **movement** points did.

### 2. Finalize path did not complete despite `scheduleFinalize`

**Mechanism (multi-factor):**

1. False resume @ `04:48:51` returned FSM to `ACTIVE_TRIP`, clearing end-cycle fields; a later end episode re-scheduled finalize.
2. Legitimate resume @ `04:53:37` returned FSM to `ACTIVE_TRIP` while a pending `FINALIZE` job from the earlier end episode could still run — **`processFinalize` had no guard** against `ACTIVE_TRIP` or movement-after-end-boundary.
3. Pending `FINALIZE` / `END_VALIDATION` jobs were **not cancelled** on resume (`buildPossibleEndToActiveReset` clears FSM fields only).
4. `ONGOING` + provisional `end_time` is **contractually allowed** during `ACTIVE_TICK` (worker-anchored progress field — not proof of failed finalize alone).

**Not proven as primary cause:** PM2 deploy restart @ `05:01:27` (FSM persisted in PostgreSQL; issues predate restart).

### 3. Mid-gap split rejected (expected)

798 m drift between pre-gap and post-gap samples exceeded `TRIP_MID_GAP_MAX_STATIONARY_DRIFT_M` (200 m default). First post-gap GPS fix can be delayed — drift alone does not prove vehicle moved during motor-off pause.

## R10 fix (repository, not deployed)

| Change | File(s) |
|--------|---------|
| Resume anchor: only points **strictly after** end boundary | `trip-evidence.helpers.ts`, `end-continuity.detector.ts` |
| Pass `resumeAfterAt` through `checkDimoActivityResumed` | `trip-detection-orchestration.service.ts` |
| Cancel pending `END_VALIDATION` + `FINALIZE` jobs on resume | `trip-tracking-queue.util.ts`, orchestration |
| Stale finalize guards in `processFinalize` | `trip-detection-orchestration.service.ts` |
| Regression tests | `trip-fsm-motor-off-pause-r10.spec.ts`, `trip-detection.spec.ts` |

## Motor-off / restart semantics (canonical contract)

| Scenario | Expected behaviour |
|----------|-------------------|
| Motor/ignition OFF, telemetry gap, **no post-boundary motion** | Stay in end path toward finalize (same trip) |
| Pre-stop motion still in fetch window | **Must not** trigger `activity_resumed` |
| Fresh motion **after** end boundary + telemetry return | Resume same trip (`POSSIBLE_END` → `ACTIVE_TRIP`) |
| Mid-gap split | Only when silence + low drift; high drift → reject split, continue single trip |
| Stale finalize job after resume | Must abort; must not set `tripStatus=COMPLETED` |

## Cross-module notes (documented only — out of R10 scope)

| Module | Observation |
|--------|-------------|
| KS MS 661 (`187361`) | 49 `no_core_data_keep_open` runs — separate open path; do not assume shared root cause |
| Battery V2 | LV rest window opens on persisted finalize — delayed finalize affects shutdown/rest timing |
| ATE / enrichment | Post-finalize producers depend on `TripDecisionEngine.finalizeTrip` commit |

## Remaining hypotheses (not proven)

- Exact BullMQ job dequeue ordering between `04:50:08` finalize schedule and `04:53:37` resume (mitigated by R10 guards, not re-run on Production)
- Whether second `END_VALIDATION` @ `05:17:36` would have succeeded without R10 on a clean redeploy

## Validation

```bash
cd backend && npm test -- --testPathPattern="trip-fsm-motor-off-pause-r10" --no-coverage
```
