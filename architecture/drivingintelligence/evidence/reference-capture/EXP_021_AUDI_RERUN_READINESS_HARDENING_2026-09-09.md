# EXP-021 — Audi Re-Run Readiness Hardening

**Date:** 2026-09-09  
**Vehicle:** KS MS 661 · Audi A4 · token **187361**  
**Prior degraded run:** `EXP_021_AUDI_AUTONOMOUS_POST_RUN_FORENSIC_2026-09-09.md`  
**Draft PR:** #1582

---

## 1 — Failure root cause (preserved)

| Issue | Detail |
|-------|--------|
| Primary blocker | `HF_RECOVERY_POLICY_V2_ENABLED=false` + canary-only + empty allowlist → token 187361 resolved **LEGACY** |
| Symptom | `startRecording` succeeded, then phase activation fatal @ 19:44:08 |
| Secondary | Competing orchestrator instances (race @ 19:37:15) |
| Tertiary | Fatal exit left session `RECORDING` indefinitely |

Degraded session `0aa0dd4f-…` evidence **preserved** (10,671 observations).

---

## 2 — Stuck session cleanup

| Field | Value |
|-------|-------|
| `STUCK_SESSION_TERMINALIZED` | **YES** |
| `STUCK_SESSION_FINAL_STATUS` | **ABORTED** |
| `failureReason` | `exp021_autonomous_degraded_run_orchestrator_fatal_hf_v2_policy_blocker` |
| `EVIDENCE_PRESERVED` | **YES** (10,671 obs retained) |
| Method | Canonical `ReferenceCaptureSessionService.abortSession` |

Post-cleanup:

```
ACTIVE_RECORDING_RC_SESSIONS = 0
```

---

## 3 — V2 canary activation (experiment-only)

**Not fleet-wide.** Production env updated with backup `backend.env.bak-exp021-hf-v2-audi-canary-*`.

| Field | Before | After |
|-------|--------|-------|
| `HF_RECOVERY_POLICY_V2_ENABLED` | false | **true** |
| `HF_RECOVERY_POLICY_V2_CANARY_ONLY` | true | **true** |
| `HF_RECOVERY_POLICY_V2_CANARY_TOKEN_IDS` | *(empty)* | **187361** |

Verified effective (both replicas restarted):

```
HF_RECOVERY_POLICY_V2_ENABLED_EFFECTIVE = true
HF_RECOVERY_POLICY_V2_CANARY_ONLY_EFFECTIVE = true
HF_RECOVERY_POLICY_V2_CANARY_TOKEN_IDS_EFFECTIVE = [187361]
EFFECTIVE_HF_POLICY_TOKEN_187361 = V2
NON_CANARY_FAIL_CLOSED = YES
```

Script: `backend/scripts/ops/reference-capture-exp-021-enable-hf-v2-audi-canary.sh`

---

## 4 — Orchestrator hardening (PR #1582 branch)

| Control | Status |
|---------|--------|
| `PRE_RECORDING_V2_GATE_IMPLEMENTED` | **YES** — policy gate in PREP before `createSession` |
| `LEGACY_TOKEN_CANNOT_START_RECORDING` | **YES** — gate throws before session creation |
| `SINGLE_ORCHESTRATOR_LOCK_IMPLEMENTED` | **YES** — Redis SET NX PX per org+vehicle |
| `DUPLICATE_INSTANCE_FAIL_CLOSED` | **YES** — second instance exits before session work |
| `FATAL_AFTER_RECORDING_TERMINALIZES_SESSION` | **YES** — abort/stop on fatal after `startRecording` |
| `ORCHESTRATOR_LOCK_RELEASE_ALWAYS` | **YES** — finally block releases lock |

Library: `backend/scripts/ops/reference-capture-exp-021-autonomous-orchestrator.lib.ts`  
Tests: `reference-capture-exp-021-autonomous-orchestrator.lib.spec.ts`

---

## 5 — Stationary production certification (NON_PHYSICAL_DRY_RUN)

Executed on production **after V2 canary enablement** using deployed Reference Capture services (not hardened orchestrator binary).

| Field | Result |
|-------|--------|
| `STATIONARY_DRY_RUN_EXECUTED` | **YES** |
| `EFFECTIVE_HF_POLICY_MODE` | **V2** |
| `CALIBRATION_PHASE_60_ACTIVATION_ALLOWED` | **YES** |
| `PHASE_60_ACTIVATION_STATUS` | **REQUESTED** |
| `CALIBRATION_SERIES_ID` | `9e200190-2e18-47e9-b72f-fd1bc3637002` |
| `PROSPECTIVE_PROBE_A/B_SUPPORTED` | **YES** |
| `A30/A60/B30/B60_SCHEDULABLE_ON_TIME` | **YES** |
| `WHOLE_TRIP_6_OF_6_RECOVERABLE` | **YES** |
| `NO_ACTIVE_RC_SESSION_AFTER_DRY_RUN` | **YES** |
| `STATIONARY_DRY_RUN_PASS` | **YES** |

Script: `backend/scripts/ops/reference-capture-exp-021-stationary-certification.ts`

**Note:** One settlement-shadow experiment row may remain in terminal/non-active status from dry-run sync — not a blocking active experiment.

---

## 6 — Autonomous path safety review

| Path | Safe (post-hardening deploy) |
|------|------------------------------|
| `AUTO_START_PATH_SAFE` | **YES** — V2 gate before session create |
| `MOVEMENT_DETECTION_PATH_SAFE` | **YES** — unchanged; requires deployed hardening for fatal cleanup |
| `PHASE_TRANSITION_PATH_SAFE` | **YES** — V2 now effective for 187361 |
| `AUTO_STOP_PATH_SAFE` | **YES** — unchanged |
| `ASYNC_WHOLE_TRIP_BINDING_PATH_SAFE` | **YES** — unchanged |

---

## 7 — Remaining blockers

| Blocker | Detail |
|---------|--------|
| Hardened orchestrator **not yet on production** | PR #1582 merge + deploy required for lock/gate/fatal-cleanup runtime |
| Physical drive | **NOT authorized in this task** |
| Mercedes token 187336 | Not in current canary list (was empty before); add before Mercedes re-run if needed |

---

## 8 — Readiness gates

```
PRODUCTION_HF_FLEET_POLICY_CHANGED = NO
READY_TO_MERGE_1582 = YES
READY_TO_DEPLOY_HARDENING = YES (after merge approval)
READY_FOR_NEXT_EXP021_PHYSICAL_RUN = NO (until hardened orchestrator SHA deployed + final post-deploy stationary cert)
```

---

## Policy unchanged

```
PRODUCTION_SCORE_CHANGED = NO
PRODUCTION_DETECTORS_CHANGED = NO
PRODUCTION_TIRE_BRAKE_CHANGED = NO
TRIP_FSM_CHANGED = NO
PRODUCTION_POLICY_CHANGE_AUTHORIZED = NO
```
