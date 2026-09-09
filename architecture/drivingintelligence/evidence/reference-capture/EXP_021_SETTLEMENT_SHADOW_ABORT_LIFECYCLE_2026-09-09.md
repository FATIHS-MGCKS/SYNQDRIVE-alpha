# EXP-021 — Settlement-shadow abort lifecycle micro-hardening (2026-09-09)

## Forensic root cause

| Question | Answer |
|----------|--------|
| `ABORT_TERMINALIZES_SETTLEMENT_EXPERIMENT_CURRENTLY` | **NO** (pre-fix on SHA `2e82171`) |
| `ABORT_CAN_LEAVE_ACTIVE_SETTLEMENT_EXPERIMENT` | **YES** |
| `ABORT_CAN_LEAVE_PENDING_SHADOW_JOBS` | **YES** |

### Canonical trace (pre-fix)

1. `ReferenceCaptureSessionService.abortSession` terminalizes RC session → `ABORTED`.
2. **No call** into settlement-shadow lifecycle on abort.
3. `syncCompletedPhasesFromSession` (stationary cert / phase sync) may have created `ReferenceCaptureSettlementShadowExperiment` with `status=ACTIVE` and PENDING schedules + BullMQ delayed jobs.
4. Abort leaves experiment `ACTIVE`, schedules `PENDING`/`EXECUTING`, and queued `reference.capture.settlement-shadow` jobs.
5. Production audit counts `ACTIVE_SETTLEMENT_EXPERIMENTS` where `status IN (PENDING, RUNNING, ACTIVE)` — orphaned rows remain until manual ops cleanup.

Post-deploy stationary recert (SHA `2e82171`) required **manual deletion** of 2 dry-run experiments tied to `ABORTED` sessions.

## Correct semantics (post-fix)

| Case | Behavior |
|------|----------|
| **A** Abort before experiment / probes | No-op or idempotent terminalize; no future jobs |
| **B** Abort after observations exist | Observations immutable; unobserved schedules → `SKIPPED`; observed schedules → `COMPLETED`; experiment → `CANCELLED` with provenance |
| **C** Normal `stopRecording` / `COMPLETED` | Experiment stays `ACTIVE`; post-stop +30/+60/+…/+600 shadow continuation unchanged |

Terminal experiment state: `CANCELLED` (existing String column — no schema migration).

## Implementation

- `ReferenceCaptureSettlementShadowService.cancelExperimentForAbortedSession` — canonical abort path
- Wired from `abortSession` after RC status → `ABORTED`
- Transaction: skip unobserved schedules, complete observed schedules, terminalize experiment
- BullMQ: `cancelQueuedJobsForSession` removes delayed/waiting/active jobs captured before DB terminalization
- Guards: `executeScheduledObservation` + `findRecoverableSchedules` skip `CANCELLED` experiments
- Stationary cert: `STATIONARY_DRY_RUN_PASS` now requires `NO_ACTIVE_SETTLEMENT_EXPERIMENT_AFTER_DRY_RUN=YES`

## Orchestrator fatal cleanup

| Path | Settlement outcome |
|------|-------------------|
| Fatal before scientific phase → `abortSession` | Experiment `CANCELLED`; no orphan ACTIVE rows |
| Fatal after scientific phase → `stopRecording` | Valid post-stop shadow continuation preserved |

## Tests

`reference-capture-settlement-shadow-abort-lifecycle.spec.ts` — 8 focused cases including idempotency, delayed jobs, observation preservation, cancelled-experiment execute guard.
