# TDL-DEC-R12 Pre-Drive Safety Hardening (R12-AUD-002/003/004/007)

**Evidence ID:** TDL-EVID-R12-HARDENING-001

| Field | Value |
|-------|-------|
| **Workstream** | R12 pre-drive audit remediation |
| **PR** | #1594 (**MERGED** to `origin/main`) |
| **MERGE_SHA** | `f4109e34c24f1eb497e2023f4b4bb997abfc159f` |
| **BASE_SHA** | `2e82171d11862a80c2e8cd62c65023393ef0ce64` |
| **Epistemic** | CURRENT_CODE + CURRENT_TEST |
| **Validation** | Trip FSM Production Readiness CI green @ main push run **34424546044** (`f4109e34`) |
| **Deploy status** | **NOT_DEPLOYED** — distinct from pre-hardening production deploy @ `157b3c722268…` (TDL-EV-R12-PROD-DEPLOY-001) |
| **Behavior status** | **NOT_PRODUCTION_BEHAVIOR_VALIDATED** |

## Findings closed

| ID | Fix |
|----|-----|
| R12-AUD-002 | Reordered `classifyEmptyCoreVlsInactivity` — staleness + motor-load contradiction before pre-boundary INACTIVE short-circuit |
| R12-AUD-003 | `evaluateContinuity` fail-closed: missing/INCONCLUSIVE/malformed → ACTIVE; only explicit NOT_TRIGGERED + canonical `continuityVerdict=POSSIBLE_END` grants end candidacy (legacy `evidence.verdict` rejected) |
| R12-AUD-004 | Fresh ignition-ON stationary → ACTIVE `vls_ignition_on_stationary`; blocks empty-core end eligibility |
| R12-AUD-007 | Postgres integration scenario E — live resume before stale FINALIZE must not finalize |

## Preserved (AUD-001)

- Fresh high engineLoad → UNKNOWN `vls_motor_activity_at_standstill`
- After genuine stale VLS + trusted boundary + silence → `boundary_backed_provider_silence` still eligible

## Intentionally deferred

AUD-005 wake-preemption, AUD-006 ONGOING end_time cleanup, AUD-008 pause-vs-mid-gap docs, StopEpisode schema, per-field VLS timestamps, DB constraints.
