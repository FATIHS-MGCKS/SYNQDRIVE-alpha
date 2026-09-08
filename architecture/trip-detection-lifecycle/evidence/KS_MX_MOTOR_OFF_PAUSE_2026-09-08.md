# KS MX 2024 — Motor-off pause, false resume & finalize inconsistency

| Field | Value |
|-------|-------|
| **Evidence ID** | TDL-EV-R10-KS-MX-001 |
| **Source type** | PRODUCTION_OBSERVATION + CODE |
| **Observation window (UTC)** | `2026-09-08T04:43:00Z` – `05:25:00Z` |
| **Vehicle** | KS MX 2024 — DIMO tokenId `187336` |
| **Trip ID** | `e830b6e6-b738-4c35-8d88-39e05f1b5aad` |
| **Operator ground truth** | ~06:47 CEST motor/ignition OFF for several minutes, then restart — same journey |
| **Production release @ mid-trip** | `7b9a7857…` @ `20260908045043_v4994` (deploy ~`05:01:27` UTC during trip tail) |
| **Repository fix branch** | `cursor/trip-fsm-motor-off-pause-finalize-64c8` (R10) |
| **Epistemic split** | See §Classification below |

## Classification (historical vs code-proven vs open)

| Claim | Status |
|-------|--------|
| False `activity_resumed` @ `04:48:51` during motor-off gap | **Historically observed** (Production tracking run + FSM transition) |
| Pre-stop motion caused resume without post-boundary evidence | **Code-proven** pre-R10 (`hasActivityResumed` lacked `resumeAfterAt` anchor) |
| `04:47:19` is exactly 92s before logged `04:48:51` | **Historically observed** arithmetic |
| `04:47:19` was inside the 90s fetch window at `04:48:51` worker time | **Contradicted** — lower bound = `04:47:21` when `now=04:48:51` |
| False resume likely from missing end-boundary anchor (any in-window speed) or worker `now` ≤ `04:48:49` | **Code-proven fix** + **inferred** historical trigger (exact Production point set **UNKNOWN** without raw PEC fetch log) |
| `scheduleFinalize` @ `04:50:08` did not yield persisted COMPLETED | **Historically observed** |
| Stale waiting `FINALIZE` job blocked re-enqueue @ `05:17:36` (`enqueueStableTripTrackingJob` → `skipped`) | **Code-proven mechanism**; **Production queue state UNKNOWN** (no BullMQ archive) |
| R10 end-cycle recycle + token guards address missed true end | **Code-proven** (tests); **not deployed** |
| PM2 restart @ `05:01:27` primary cause | **Not proven** |

## Reconstructed timeline (UTC)

| Time | Event | Layer |
|------|-------|-------|
| `04:47:19` | Last meaningful movement (speed ~38 km/h) | Provider |
| `04:47:51` | ClickHouse ignition segment end → end boundary | Analytics assist |
| `04:48:50` | CH end assist → `POSSIBLE_END` (`possibleEndEnteredAt` ≈ now) | FSM |
| `04:48:51` | **`activity_resumed`** — cancelled `POSSIBLE_END` | FSM (false positive) |
| `04:50:08` | `END_VALIDATION` → RESTING **logged** + `scheduleFinalize` | Worker handler result |
| `04:51:34` | Telemetry returns after ~7 min gap | Provider |
| `04:52:02` | Movement resumes | Provider |
| `04:53:37` | Second `activity_resumed` → `ACTIVE_TRIP` | FSM (legitimate) |
| `04:54:08` | Mid-gap split **REJECTED** (798 m drift > 200 m max) | R6 guard |
| `05:02:45` | True trip end boundary (canonical) | Provider |
| `05:17:36` | Second `END_VALIDATION` → RESTING **logged** + `scheduleFinalize` | Worker handler result |
| Audit (~05:24) | Trip `ONGOING`, provisional `end_time` ≈ `05:02:45`, FSM `POSSIBLE_END` | DB + FSM |

**Distinction:** RESTING in tracking-run `resultState` is the **planned/handler outcome**, not proof of persisted `tripStatus=COMPLETED` or FSM `RESTING`.

## 90s / 92s window correction

| Measurement | Value |
|-------------|-------|
| Wall delta `04:47:19` → `04:48:51` | **92s** |
| PEC fetch lower bound (`workerNow - 90_000`) when `workerNow=04:48:51` | **`04:47:21`** |
| Is `04:47:19` inside fetch window at that instant? | **No** (2s before lower bound) |

**Correct anchor:** resume fetch uses **`workerNow - 90_000ms`**, not “92 seconds before the log line.” Pre-R10 resume verdict used **any fetched point with speed > threshold** without **`resumeAfterAt`** filtering — so any in-window speed (or wider active-tick batch passed to CH assist) could trigger resume even when the last pre-stop point is slightly outside the nominal 90s bound.

**R10 fix:** `hasActivityResumed(points, profile, possibleEndAt)` — only timestamps **strictly after** the end boundary count.

## Proven root causes (code)

### 1. False `activity_resumed` @ `04:48:51`

Missing **`resumeAfterAt`** anchor on `hasActivityResumed` / `EndContinuityDetector`. Ignition-only stale resume was already fixed (Fix C); this case is **stale movement before end boundary**.

### 2. True end not persisted despite `scheduleFinalize` @ `05:17:36`

**Primary code mechanism (Production-plausible, queue archive unavailable):**

1. Cycle A (`possibleEndEnteredAt≈04:48:50`) called `scheduleFinalize` @ `04:50:08` → stable jobId `trip-fin-{vehicle}-{tripId}` queued.
2. Resume @ `04:53:37` returned FSM to `ACTIVE_TRIP` but **pre-R10 did not cancel** the waiting finalize job.
3. Cycle B @ `05:17:36` called `scheduleFinalize` again → **`enqueueStableTripTrackingJob` returned `skipped`** (job already waiting).
4. Stale cycle-A job either never ran successfully or could not apply to resumed trip; **no fresh finalize job** for cycle B.

**R10 corrections:**

| Mechanism | Purpose |
|-----------|---------|
| `resumeAfterAt` anchor | Prevent false resume |
| `cancelPendingEndCycleJobs` on resume | Drop queued `ev`/`fin` jobs |
| `enqueueEndCycleTripTrackingJob` in `scheduleFinalize` | **Recycle** waiting slot before enqueue (fixes `skipped` re-enqueue) |
| `endCycleToken` = `possibleEndEnteredAt` ISO in job payload | Stale active/wrong-cycle jobs abort in `processFinalize` |
| Removed `movement-after-end` guard | Was **incorrect** — canonical end often has `lastMeaningfulMovementAt > possibleEndAt` |

**Worker lock:** `processFinalize` / resume paths serialize on `acquireWorkerLock` — guard checks and DB writes occur under the same lock (no resume-between-check-and-write without lock release).

### 3. Mid-gap split rejected (expected, not a defect)

798 m drift between pre-gap last fix and first post-gap fix. **Measurement:** compared last pre-gap waypoint/core fix vs first post-gap fix after ~316s silence — not continuous motion during motor-off. High drift alone does not prove driving during pause; delayed first GPS fix after telemetry return can inflate drift.

## Motor-off / pause / end contract (precise)

| Phase | Semantics |
|-------|-----------|
| Motor/ignition off + inactivity signals | Creates **end candidate** (`POSSIBLE_END`) per existing CH assist / inactivity rules — not instant COMPLETED |
| Telemetry gap | **Neither** fresh movement **nor** alone sufficient proof of trip end — absence of data ≠ proof of rest |
| Pre-boundary motion in fetch window | **Must not** cancel end candidate (`activity_resumed`) |
| Fresh post-boundary motion | **May** cancel end candidate → `ACTIVE_TRIP` (same trip continues) |
| No post-boundary resume | Valid end path must still reach **`TripDecisionEngine.finalizeTrip`** → `COMPLETED` + FSM `RESTING` |
| After persisted COMPLETED | New movement → **new trip** per existing start rules (not unbounded pause semantics) |

**Tensions (documented, not resolved in R10):**

- Mid-gap split vs single-trip continuation: R6 drift guard rejected split @ 798 m — trip stays single ONGOING (correct for this case).
- Provisional `ONGOING.end_time` from `ACTIVE_TICK` vs canonical finalize end — by design; not finalize failure alone.

## R10 fix summary (branch only — **not deployed**)

| Change | File(s) |
|--------|---------|
| Resume anchor (`resumeAfterAt`) | `trip-evidence.helpers.ts`, `end-continuity.detector.ts` |
| End-cycle token + recycle enqueue | `trip-detection.types.ts`, `trip-end-cycle-reset.ts`, `trip-tracking-queue.util.ts`, orchestration |
| Stale finalize guards (`isEndCycleTokenStale`) | `trip-detection-orchestration.service.ts` |
| Regression tests A–G | `trip-fsm-motor-off-pause-r10.spec.ts`, `trip-end-cycle-reset.spec.ts` |

## Cross-module notes (out of scope)

| Module | Note |
|--------|------|
| KS MS 661 | 49× `no_core_data_keep_open` — separate path |
| Battery V2 | LV rest window opens on persisted finalize |
| ATE / enrichment | Post-finalize producers require `COMPLETED` commit |

## Validation

```bash
cd backend && npm test -- --testPathPattern="trip-fsm-motor-off-pause-r10|trip-end-cycle-reset" --no-coverage
bash architecture/scripts/validate-module-registry.sh
```
