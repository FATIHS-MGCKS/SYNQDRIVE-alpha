# IMPLEMENTATION ARTIFACT — PRE-CANONICAL

# R3 — Start Liveness Ordering

| Field | Value |
|-------|-------|
| Baseline main SHA | `ff95395d6` (PR #1539 merged) |
| R2 prerequisite | durable lifecycle recovery (R2/R2A/R2B) on main |
| Branch | `trip-fsm/r3-start-liveness-ordering` |
| Scope | P4-F11 / P4-F12 start execution liveness only |
| Deploy | **NOT PERFORMED** |
| Production mutations | **NONE** |

## Findings addressed

| ID | Title | R3 resolution |
|----|-------|---------------|
| P4-F11 | POSSIBLE_START swallows exceptions → BullMQ SUCCESS | Rethrow after diagnostic log; bounded BullMQ fast retry |
| P4-F12 | Battery proxy awaited before ACTIVE_TICK | Primary ACTIVE_TICK scheduled first; Battery failure-contained |

Unrelated P4/P5 findings unchanged.

## Old execution ordering (new trip confirm path)

1. `createTrip` / merge reopen
2. FSM `ACTIVE_TRIP` transition
3. temperature bootstrap (fire-and-forget)
4. initial route bootstrap (fire-and-forget)
5. **`await enqueueStartProxy` (Battery)**
6. **`scheduleActiveTick`**

Problem: steps 5–6 inverted criticality; step 5 could block primary tracking loop.

## New execution ordering

1. lifecycle commit (`createTrip` / `reopenTripForMerge`) — unchanged
2. FSM `ACTIVE_TRIP` transition — unchanged
3. **`scheduleActiveTick` (primary liveness)**
4. temperature bootstrap (fire-and-forget, non-blocking)
5. initial route bootstrap (fire-and-forget, non-blocking)
6. Battery `enqueueStartProxy` — **awaited try/catch, failure-contained**

Merge path unchanged: reopen → ACTIVE → ACTIVE_TICK (no Battery).

## Failure-window matrix

| Window | Examples | Durable state | R3 behavior |
|--------|----------|---------------|-------------|
| **A — Before lifecycle commit** | provider fetch, detector, boundary failure | FSM `POSSIBLE_START`, no new ONGOING | Rethrow → BullMQ fast retry; clocks unchanged |
| **B — After lifecycle commit, before FSM ACTIVE** | `createTrip` ok, `transitionState` fails | ONGOING orphan | R2 early recovery on retry; no duplicate create |
| **C — After FSM ACTIVE, before ACTIVE_TICK** | transition ok, enqueue AT fails | ACTIVE + ONGOING, missing loop | Rethrow → retry; ACTIVE-state PS replay ensures AT |
| **D — After ACTIVE_TICK scheduled** | Battery/temp/route ancillary failure | ACTIVE + loop scheduled | Ancillary failures must not revert FSM or block AT |

## BullMQ retry semantics (POSSIBLE_START only)

Shared helper: `buildTripTrackingJobOptions()` in `trip-tracking-queue.util.ts`.

| Setting | Value |
|---------|-------|
| attempts | 4 total executions |
| backoff | exponential, 5s base |
| Applies to | `schedulePossibleStart` + recovery-scheduler POSSIBLE_START wake jobs |
| Other phases | unchanged (no BullMQ attempts/backoff) |

Rationale: 120s recovery scheduler interval vs 180s confirmation budget — fast native retry closes transient gaps without extending confirmation window.

## Confirmation-clock preservation (R1)

Retries **must not** mutate:

- `possibleStartAt` (event-time candidate authority)
- `possibleStartEnteredAt` (worker-time dwell authority)

Fast retries reuse persisted values; confirmation elapsed age continues from original `possibleStartEnteredAt`.

## R2 orphan-recovery interaction

`maybeRecoverLifecycleInvariant()` at processPossibleStart entry remains first gate.

Retry after window B:

- early recovery runs before expiry / before second `createTrip`
- same ONGOING adopted via R2 planner
- `possibleStartAt` follows R2/R2B classification authority

No parallel idempotency system added.

## ACTIVE-state replay / handoff recovery (R3.6)

When a POSSIBLE_START job arrives but FSM is already `ACTIVE_TRIP` or `IDLE_WITHIN_TRIP` with valid `activeTripId`:

- call `scheduleActiveTick` (stable job-id dedupe)
- return without lifecycle mutation
- do not force ACTIVE from `POSSIBLE_END` / `RESTING`

Covers window C crash: FSM ACTIVE committed, primary handoff failed, native PS retry arrives.

## Battery ancillary containment

After primary ACTIVE_TICK succeeds:

- attempt Battery start proxy enqueue
- failure: warn log only — no throw, no FSM rollback, no trip duplication
- missing `organizationId`: warn + skip (unchanged)

Battery V2 policy/producer internals unchanged.

## Scheduler interaction

Recovery scheduler remains last-resort safety net (120s). R3 fast retry reduces dependence on scheduler for transient PS execution failures. R2B recoverable disposition unchanged.

## Test matrix

| # | Scenario | Suite |
|---|----------|-------|
| 1–2 | PS exception rethrown; diagnostic log failure does not mask | `trip-start-liveness-r3.spec.ts` |
| 3 | Processor DimoPollLog FAILURE on throw | `trip-tracking.processor.r3.spec.ts` |
| 4–6 | PS bounded retry policy; non-PS unchanged; recovery scheduler PS | `trip-tracking-queue.util.spec.ts`, `trip-tracking-recovery.scheduler.r3.spec.ts` |
| 7 | Confirmation anchor preserved across retries | `trip-start-liveness-r3.spec.ts` |
| 8 | Fast retry policy (5s exponential base) | policy unit tests |
| 9 | R2 early recovery before second create on retry | `trip-start-liveness-r3.spec.ts` |
| 10–11 | AT enqueue failure rethrows; ACTIVE replay ensures AT | `trip-start-liveness-r3.spec.ts` |
| 12–15 | AT before Battery; Battery/temp/route non-blocking | `trip-start-liveness-r3.spec.ts` |
| 16 | Merge path schedules AT without Battery | `trip-start-liveness-r3.spec.ts` |
| 17–20 | R1 clock, R2/R2A/R2B, trip-detection, snapshot isolation | existing suites (182 total targeted) |

## Finding status (post-R3)

| ID | Status |
|----|--------|
| P4-F11 | RESOLVED_BY_R3 |
| P4-F12 | RESOLVED_BY_R3 |

## Known remaining risks

- After all 4 BullMQ attempts exhaust, 120s recovery scheduler remains fallback (by design)
- Window B still relies on R2 lifecycle recovery correctness (preserved, not redesigned)
- Confirmation budget (180s) unchanged — persistent infrastructure outage can still expire candidate

## Validation

- Targeted suites: **182 passed** (pre-R3A baseline)
- Backend build/typecheck: run in CI gate
- Prisma validate: no schema change expected
- Deploy: **NOT PERFORMED**

---

## R3A — Queue Handoff Closure

| Field | Value |
|-------|-------|
| R3 base commit | `065cc23c324f82eee7d6565eebf531bea6385ffe` |
| Scope | durable self-reschedule successor + recovery failed-job recycling |
| Deploy | **NOT PERFORMED** |

### Self-reschedule race (pre-R3A)

When `enqueueTripTrackingJob()` saw primary jobId still `active`, it used one-shot `setImmediate()` → retry with `allowDeferIfActive=false`. Because the processor completes only after `logTrackingRun` + DimoPollLog, the primary job often remained ACTIVE on the deferred turn → **no successor created**.

Regression: `simulateLegacyActiveSelfReschedule()` + harness proves one deferral is insufficient.

### Durable successor design

Canonical helper: `enqueueStableTripTrackingJob()` in `trip-tracking-queue.util.ts`.

When primary stable jobId is ACTIVE:

- enqueue into deterministic successor slot `${primaryJobId}__succ`
- successor inherits same trigger, delay, and retry policy
- WAITING/DELAYED/ACTIVE successor → skip (dedupe)
- FAILED/COMPLETED successor → remove + recreate

Applies generically to all trip-tracking phases (PS, AT, PEC, EV, FIN).

### Recovery failed-job recycling

`enqueueRecoveryTripTrackingJob()` inspects `trip-recovery-${vehicleId}` before add:

| State | Action |
|-------|--------|
| FAILED / COMPLETED | remove → fresh wake |
| WAITING / DELAYED / ACTIVE | skip duplicate |
| absent | enqueue |

Prevents `removeOnFail=5` retention from tombstoning future 120s recovery passes.

### Fast retry → slow recovery contract

1. PS infrastructure error → BullMQ native retry (~5s / ~10s / ~20s), 4 attempts
2. Exhausted failure → job FAILED (retained up to 5 for diagnostics)
3. Later 120s scheduler → recycles FAILED tombstone → fresh recovery wake with same PS retry policy
4. Successful NOT_CONFIRMED → durable 30s successor via `__succ` slot (no scheduler dependency)

### R3A test additions

| Area | Suite |
|------|-------|
| Legacy race proof + successor/dedupe/retry | `trip-tracking-queue-handoff.r3a.spec.ts` |
| Recovery FAILED recycle + dedupe matrix | `trip-tracking-queue-handoff.r3a.spec.ts`, `trip-tracking-recovery.scheduler.r3a.spec.ts` |
| R3/R2 regressions preserved | existing 202 targeted tests |

### Final finding status (post-R3A)

| ID | Status |
|----|--------|
| P4-F11 | RESOLVED_BY_R3 |
| P4-F12 | RESOLVED_BY_R3 |

P4-F11 resolution now includes: error propagation, bounded fast retry, durable NOT_CONFIRMED successor, and recovery tombstone recycling — confirmation clocks unchanged.

## Validation (post-R3A)

- Targeted suites: **202 passed**
- Backend build/typecheck: **PASS**
- Prisma validate: **PASS** (no schema change)
- `git diff --check`: **PASS**
- Deploy: **NOT PERFORMED**

---

## R3B — Premature Successor Consumption Closure

| Field | Value |
|-------|-------|
| R3A base commit | `846f7e9033cfee6e6f5162725a5e56f8cd9508a3` |
| Scope | handoff lock-contention deferral (BullMQ moveToDelayed + DelayedError) |
| Deploy | **NOT PERFORMED** |

### Temporal race

R3A successor `${primaryJobId}__succ` delay starts while primary job A is still ACTIVE and holds the per-vehicle worker lock (TTL up to 120s). If A's post-validation work (`logTrackingRun`, DimoPollLog) exceeds the 30s successor delay, worker B runs the handoff job, fails `acquireWorkerLock()`, and pre-R3B code returned SUCCESS → `removeOnComplete` deleted B while FSM remained POSSIBLE_START.

Worker concurrency >1 makes this race real.

### Selected mechanism (BullMQ v5.12)

1. Successor jobs carry explicit metadata: `handoffKind: stable_successor`, `handoffPrimaryJobId`
2. Orchestration throws `TripTrackingHandoffLockContentionError` for handoff jobs when lock not acquired
3. `TripTrackingProcessor` calls `job.moveToDelayed(now + 10s, token)` then throws `DelayedError`
4. Ordinary non-handoff lock misses still return SUCCESS no-op (duplicate/noise)

Lock-contention deferral (10s, moveToDelayed + DelayedError) is **separate** from infrastructure retry (4 attempts, exponential 5s base). Manual deferral prevents normal complete/fail handling and therefore does not consume the infrastructure failure retry path. The 10s deferral can repeat across the 120s lock TTL without consuming PS infrastructure attempts or resetting R1 clocks.

### FSM obsolescence preserved

Handoff successor executes when phase still relevant; RESTING/obsolete FSM → safe no-op after lock acquired. ACTIVE/IDLE + activeTripId → existing R3 ACTIVE_TICK replay unchanged.

### R3B temporal test matrix

| # | Scenario | Suite |
|---|----------|-------|
| 1–2 | PS >30s predecessor; successor due under lock deferred; executes after release | `trip-tracking-queue-handoff.r3b.spec.ts` |
| 3–4 | Multi-worker contention + dedupe | same |
| 5–6 | Clocks / confirmation budget unchanged | same + clock contract |
| 7 | Infra error ≠ lock contention | `trip-tracking.processor.r3.spec.ts`, r3b |
| 8–9 | RESTING obsolete / ACTIVE handoff replay | orchestration paths preserved |
| 10 | ACTIVE_TICK handoff lock collision | r3b |
| 11 | R3A recovery tombstone recycle | r3a suites |
| 12 | R1/R2/R3/R3A regressions | 209 targeted tests |

### Final finding status (post-R3B)

| ID | Status |
|----|--------|
| P4-F11 | RESOLVED_BY_R3 |
| P4-F12 | RESOLVED_BY_R3 |

## Validation (post-R3B)

- Targeted suites: **209 passed**
- Backend build/typecheck: **PASS**
- Prisma validate: **PASS** (no schema change)
- `git diff --check`: **PASS**
- Deploy: **NOT PERFORMED**

---

## R3C — Handoff Predecessor Settlement Closure

| Field | Value |
|-------|-------|
| R3B base commit | `e98f941d96ef01029df284ad83d6bef8c05b3adc` |
| Scope | predecessor BullMQ settlement gate before successor generation |
| Deploy | **NOT PERFORMED** |

### Temporal race (DB lock free, predecessor BullMQ ACTIVE)

R3B closes the per-vehicle worker-lock window. A second window remains:

1. Primary job A releases the vehicle FSM worker lock after orchestration
2. `TripTrackingProcessor` still runs DimoPollLog / completion work
3. BullMQ job A remains **ACTIVE**
4. Successor S (`${primaryJobId}__succ`) wakes, acquires the vehicle lock, runs `processPossibleStart`, returns NOT_CONFIRMED, calls `schedulePossibleStart(30s)`
5. `enqueueStableTripTrackingJob` sees primary A still ACTIVE → tries successor slot `${primary}__succ` = **S itself** (ACTIVE) → **SKIPPED**
6. S completes, A completes → no next PS validation survives → 120s recovery dependency

### Two-slot generation invariant

Deterministic slots: `primary` and `${primary}__succ`. Safe only when successor does not execute as the new generation while the old primary still occupies the primary slot.

### Selected mechanism

Shared helper: `assertHandoffPredecessorSettled()` in `trip-tracking-handoff-settlement.ts`.

1. `TripTrackingProcessor` runs settlement check **before** orchestration for `handoffKind: stable_successor`
2. Inspect `handoffPrimaryJobId` in the same trip-tracking queue
3. If predecessor is unsettled → `TripTrackingHandoffPredecessorNotSettledError` → `moveToDelayed(+10s, token)` + `DelayedError`
4. Orchestration retains R3B vehicle-lock contention after settlement passes

### Predecessor settlement matrix

| Predecessor BullMQ state | Successor behavior |
|--------------------------|-------------------|
| ACTIVE | defer (+10s) |
| WAITING | defer |
| DELAYED | defer |
| PRIORITIZED | defer |
| WAITING-CHILDREN | defer |
| COMPLETED | proceed |
| FAILED | proceed |
| ABSENT | proceed |

Terminal retained predecessors need not be physically removed — terminal state is sufficient.

### BullMQ v5.12 deferral semantics (corrected)

Caller API: `job.moveToDelayed(timestamp, token?)` then `throw new DelayedError()`.

There is **no** explicit `skipAttempt` argument in this code path. Manual deferral + `DelayedError` prevents normal complete/fail handling and therefore does not consume the infrastructure failure retry path (`attemptsMade` unchanged).

Handoff deferrals (settlement + lock contention) remain separate from PS infrastructure retry (4 attempts, exponential 5s base).

### R3C temporal test matrix

| # | Scenario | Suite |
|---|----------|-------|
| 1 | Pre-R3C race: predecessor ACTIVE → successor enqueue SKIPPED | `trip-tracking-queue-handoff.r3c.spec.ts` |
| 2 | End-to-end: lock free + predecessor ACTIVE → defer → settle → new primary | same |
| 3 | Predecessor state matrix (unsettled vs terminal/absent) | same |
| 4 | PS / ACTIVE_TICK / PEC phase coverage | same |
| 5 | Processor settlement deferral (no FAILURE log, no orchestration) | same |
| 6 | Infra retry separation preserved | same + r3/r3b |
| 7 | R3B lock contention unchanged | r3b suites |
| 8 | R3A/R1/R2/R3 regressions | full targeted matrix |

### Final finding status (post-R3C)

| ID | Status |
|----|--------|
| P4-F11 | RESOLVED_BY_R3 |
| P4-F12 | RESOLVED_BY_R3 |

P4-F11 resolution requires: error propagation, bounded fast retry, durable NOT_CONFIRMED successor, predecessor settlement cannot consume successor generation, vehicle-lock contention cannot consume successor, recovery tombstone recycling, confirmation clocks unchanged.

## Validation (post-R3C)

- Targeted suites: **224 passed** (18 suites)
- Backend build/typecheck: **PASS**
- Prisma validate: **PASS** (no schema change)
- `git diff --check`: **PASS**
- Deploy: **NOT PERFORMED**
