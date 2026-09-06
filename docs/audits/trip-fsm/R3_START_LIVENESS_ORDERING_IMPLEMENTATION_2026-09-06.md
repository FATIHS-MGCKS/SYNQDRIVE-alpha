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

- Targeted suites: **182 passed**
- Backend build/typecheck: run in CI gate
- Prisma validate: no schema change expected
- Deploy: **NOT PERFORMED**
