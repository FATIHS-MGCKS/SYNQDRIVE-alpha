# KS MS 661 — R12 POST-#1600 dispatch gap (PEC worker lock vs END_VALIDATION)

| Field | Value |
|-------|-------|
| **Evidence ID** | TDL-EVID-R12-KS661-DISPATCH-GAP-001 |
| **Source type** | PRODUCTION_OBSERVATION + CODE |
| **Audited production SHA** | PR #1600 merged (`51394e161…` lineage on both replicas) |
| **Vehicle / trip** | KS MS 661 / `fc93f98f-399c-439b-8fe0-b9ce21e6f544` |
| **Timestamp (UTC)** | 2026-09-11 (physical drive acceptance audit) |
| **Classification** | PHYSICAL_ACCEPTANCE_FAILURE — end cycle stuck after PE clock durability fixed |

## Immutable forensic record

- Trip `fc93f98f-399c-439b-8fe0-b9ce21e6f544` remains **unrepaired** on Production.
- Pre-#1600 failure trip `2bdc6e71-3822-4c9e-bda3-b46c681e6844` evidence preserved in [KS_MS_661_R12_PHYSICAL_ACCEPTANCE_FAILURE_2026-09-10.md](KS_MS_661_R12_PHYSICAL_ACCEPTANCE_FAILURE_2026-09-10.md).

## Production correlation (15/15 cycles)

| Counter | Value |
|---------|-------|
| CUSUM_TRIGGER_COUNT | 15 |
| END_VALIDATION_ENQUEUE_ATTEMPT_COUNT | 15 |
| END_VALIDATION_QUEUE_ADD_SUCCESS_COUNT | 15 |
| END_VALIDATION_WORKER_PICKUP_COUNT | 15 |
| END_VALIDATION_PROCESSOR_ENTRY_COUNT | 15 |
| END_VALIDATION_TRACKING_RUN_COUNT | 0 |

| Lifecycle | Value |
|-----------|-------|
| PE_CLOCKS_DURABLE | YES (both `possibleEndAt` + `possibleEndEnteredAt` persisted) |
| CLOCK_LOSS_OBSERVED | NO |
| FINALIZE_REACHED | NO |
| RESTING_REACHED | NO |
| ACTIVE_TRIP_ID_CLEARED | NO |
| FSM terminal at audit | POSSIBLE_END / trip ONGOING |

Each PEC trigger had a **3–7 ms** `dimo_poll_logs` TRIP_TRACKING SUCCESS row (END_VALIDATION worker entered and exited immediately).

## Defect timeline (do not conflate)

### PRE-#1600 defect (trip `2bdc6e71…`)

- PE clock durability / active-lock recycle path (`Job.remove()` on ACTIVE primary).
- Documented in TDL-EVID-R12-KS661-ACCEPT-FAIL-001.

### #1600 result

- PE clock durability fixed and physically proven on drive `fc93f98f…`.
- Stable-slot family arbitration; no ACTIVE `Job.remove()`.
- **NOT reproduced** on this drive: pre-#1600 active-lock exception.

### POST-#1600 physical-drive defect (trip `fc93f98f…`)

**Root cause:** `processPossibleEndCheck` decided END_VALIDATION and called `scheduleEndValidation()` **while still holding** the per-vehicle worker lock (`workerRunToken` / `workerLockedUntil`). Zero-delay END_VALIDATION was picked up by a concurrent BullMQ worker (`WORKER_TRIP_TRACKING_CONCURRENCY=5`). `processEndValidation` failed `acquireWorkerLock`, **returned silently** (pre-fix), BullMQ marked the job completed, `removeOnComplete` destroyed the only authority. PEC retried → same cycle indefinitely.

**Failure boundary:** worker-lock acquisition inside END_VALIDATION — **not** queue creation, `Queue.add`, worker registration, dedupe, or clock durability.

## Code path (pre-fix, @ main containing #1600)

| Step | Function | Lines (approx.) |
|------|----------|-------------------|
| PEC acquires lock | `processPossibleEndCheck` → `acquireWorkerLock` | ~2890–2897 |
| Stability satisfied → schedule intent | `deferredEndValidation` / inline `scheduleEndValidation` | ~3092–3115 |
| **Bug:** schedule before release | `scheduleEndValidation()` inside try while lock held | ~3110 (pre-fix) |
| Lock release | `finally` → `releaseWorkerLock` | ~3174–3175 |
| EV lock miss silent exit | `processEndValidation` → `return` when `!lock.acquired` | ~3193–3196 (pre-fix) |

## Fix (this workstream — not deployed)

### Primary — lock ordering

Defer `scheduleEndValidation` until **after** `releaseWorkerLock` inside PEC `finally` (must be inside `finally` because early `return` in `try` skips code after try/finally).

Invariant: `SCHEDULE_END_VALIDATION_WHILE_PEC_WORKER_LOCK_HELD = NO`.

### Secondary — defense in depth

Non-handoff END_VALIDATION lock miss throws `TripTrackingHandoffLockContentionError` → processor `moveToDelayed` / `DelayedError` (existing handoff path).

Invariant: `END_VALIDATION_LOCK_MISS_CAN_SILENTLY_DESTROY_AUTHORITY = NO`.

### Tertiary — END_VALIDATION → FINALIZE lock ordering (R12 integration closure)

`processEndValidation` must defer `scheduleFinalize` until **after** `releaseWorkerLock` in `finally` (same class as PEC→EV: concurrent BullMQ workers with concurrency ≥2 could otherwise pick FINALIZE while END_VALIDATION still holds the lock; non-handoff FINALIZE then silent-returned on lock miss).

Invariant: `SCHEDULE_FINALIZE_WHILE_EV_WORKER_LOCK_HELD = NO`.

### Quaternary — FINALIZE primary lock-miss defense (PR #1603 closure)

Audit of all `scheduleFinalize()` production call sites (@ fix branch):

| Call site | Context | Lock held? | Collision risk |
|-----------|---------|------------|----------------|
| PEC hard timeout / max-attempt fallback (~3003, 3045, 3154) | Inside PEC `try` before `finally` release | **YES** | Concurrent FINALIZE can run during PEC |
| EV primary success path (~3527) | EV `finally` after `releaseWorkerLock` | NO | Primary EV→FIN path safe |
| FINALIZE catch orphan recovery (~4024) | Inside FINALIZE `catch` before `finally` release | **YES** | Recovery wake can collide |
| CH end assist HIGH (~4440) | `tryApplyClickHouseAssistedEnd` (no worker lock) | NO | Different authority path |

**Conclusions (code audit, not guessed):**

- `CAN_PRIMARY_FINALIZE_COLLIDE_WITH_OTHER_VEHICLE_AUTHORITY=YES`
- `CAN_PRIMARY_FINALIZE_SILENTLY_COMPLETE_ON_LOCK_MISS=YES` (pre-quaternary: non-handoff silent `return`)
- `IS_EXISTING_EV_AFTER_RELEASE_ORDERING_SUFFICIENT_FOR_ALL_CALL_SITES=NO`

**Fix:** `processFinalize` lock miss always throws `TripTrackingHandoffLockContentionError` (mirrors END_VALIDATION) → processor `moveToDelayed` + natural retry.

Invariant: `FINALIZE_LOCK_MISS_CAN_SILENTLY_DESTROY_AUTHORITY = NO`.

## Tests

| ID | File | Claim |
|----|------|-------|
| TDL-TEST-R12-PEC-EV-001 | `trip-r12-pec-ev-lock-collision.postgres-redis.integration.spec.ts` | Lock-order regression + **natural** BullMQ completion chain (no `Job.promote`) + EV natural delayed retry + FINALIZE primary lock-miss retry |
| TDL-TEST-R12-PEC-EV-002 | `trip-r12-end-cycle-lock-contention.spec.ts` | EV + FINALIZE lock miss throw contention error |
| TDL-TEST-R12-PEC-EV-003 | `trip-r12-pec-ev-base-head-red-probe.postgres-redis.integration.spec.ts` | Portable BASE vs HEAD behavioral probe (copied into worktrees) |
| TDL-TEST-R12-PEC-EV-004 | `scripts/test/trip-r12-pec-ev-green-repeat.sh` | 10× consecutive CI-local repeat gate wired in Trip FSM workflow |

## Explicit non-actions

- Did **not** deploy fix to Production.
- Did **not** repair trip `fc93f98f…`.
- Did **not** mutate Production Redis/DB/PM2.
- **NEW_PHYSICAL_DRIVE_REQUIRED** after deploy for acceptance.

## Validation commands

```bash
cd backend && npm run test:trip-r12:hardening
cd backend && npm run test:trip-r11:unit
cd backend && npm run test:trip-r12:postgres-redis:ci   # requires Postgres + Redis
bash backend/scripts/test/trip-r12-pec-ev-base-head-red-proof.sh
```

**CI status (2026-09-11)**

| Run | Result | Notes |
|-----|--------|-------|
| Trip FSM 34621495010 | **PASS** @ `b5af0df07` | Natural chain (no promote), EV natural 10s retry (~10005–10104 ms observed), FINALIZE lock-miss retry, `GREEN_REPEAT_COUNT=10` / `GREEN_REPEAT_FAILURES=0` |
| Trip FSM 34647969555 | **PROBE_CAUSAL_PASS / VALIDATION_FAIL** @ `3a4312443` | BASE RED + HEAD GREEN metrics observed in worktrees; `BASE_RED_REPRODUCED=NO` only because node validation received metrics paths as argv (fixed `9f8078cd6`) |
| i18n debt gate 34621495011 | **PASS** @ `b5af0df07` | NO_I18N_RELEVANT_CHANGES |
| i18n authority 34621490796 | **PASS** @ `b5af0df07` | Workflow file unchanged from main (repeat wired via package.json) |
| Module registry 34621495050 | **PASS** @ `b5af0df07` | — |

Historical failures preserved above (34602066031, 34610166236, 34619654930 workflow-authority false positive before revert).
