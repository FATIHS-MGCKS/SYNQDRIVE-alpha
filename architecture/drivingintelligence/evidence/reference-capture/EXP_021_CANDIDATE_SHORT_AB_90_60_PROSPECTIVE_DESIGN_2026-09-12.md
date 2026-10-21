# EXP-021 — Candidate Short A/B 90→60 (Prospective Design)

**Date:** 2026-09-12  
**Plan version:** `EXP021_CANDIDATE_SHORT_AB_90_60`  
**Registry key:** `CANDIDATE_SHORT_AB_90_60`  
**planId:** `candidate_short_ab_90_60`  
**Status:** **PROSPECTIVE** — implementation prepared; **no physical run executed**  
**Selection:** `EXP021_CALIBRATION_PLAN=CANDIDATE_SHORT_AB_90_60` (explicit arm procedure; **not** default)  
**Next physical vehicle:** **WOB L 7503** (`19fedd4b-c4e8-4de8-a125-dab293326e7e`, token **192922**)

---

## Scientific authority (frozen PR #1618)

`ANOTHER_PHYSICAL_RUN_NEEDED = YES`

Minimum remaining experiment: **corrected-code 90 vs 60 short A/B** (two 10-minute wall phases).

**NOT** another full 30-minute three-way drive unless 90/60 remain tied after the corrected test.

This plan omits the 120s anchor already sufficiently evidenced by frozen KS MS 661 V3 forensic authority.

---

## Phase plan (canonical T0 = T)

| Phase | Cadence | Nominal wall | Role | Expected request slots |
|-------|---------|--------------|------|------------------------|
| 1 | 90s | 10 min | EXPERIMENTAL | 7 |
| 2 | 60s | 10 min | EXPERIMENTAL | 10 |

**Total expected slots:** 17  
**Nominal run:** 20 min  
**Hard max:** 22 min (+2 min grace budget)  
**Advancement:** `WALL_CLOCK`

90s and 60s phase specs are **identical** to `CANDIDATE_BRACKET_V3` phases[1] and phases[2] — no scientific tuning.

---

## Settlement geometry (full-phase overlapping)

Per 10-minute phase (60s windows, 30s step, 6 mandatory ages):

| Metric | Value |
|--------|-------|
| Source windows per phase | 19 |
| Total source windows | 38 |
| Settlement observations | 228 |
| Synthetic gap assessability target | ≥90% (same strategy as V3) |

---

## Physical T0 definition

- First qualifying movement after arm → persisted `exp021PhysicalAuthority.firstQualifyingMovementAt`
- `activatePhysicalPhaseAtT0Atomic` seals PRE_ROLL and begins first physical phase at **90s** cadence
- Durable `calibrationPlanId` / `calibrationPlanVersion` snapshotted on `hfCalibrationSeries` at T0

---

## Movement prerequisites

- WALL_CLOCK advancement: phase advances on wall-clock expiry regardless of movement accumulation
- Scientific status `VALID` requires:
  - `providerSuccessCount >= 5` (minSuccessfulRequests)
  - `validMovementDurationMs >= min(wallDurationMs * 0.25, targetDurationMs * 0.25)`

---

## Phase transition behavior

1. **90s** phase runs 10 min wall → `applyPendingCalibrationPhaseAtBoundary` → **60s**
2. **60s** final phase runs 10 min wall → terminal finalization
3. No 120s phase exists in this plan

---

## Arm mechanism

1. Set production env: `EXP021_CALIBRATION_PLAN=CANDIDATE_SHORT_AB_90_60`
2. PRE-ARM new RC session for **WOB L 7503** only (never reuse PR #1618 session/series IDs)
3. FAST GO / start recording
4. Physical T0 on first qualifying movement → series persists plan authority durably

**Authority precedence (post #1621):** series → experiment metadata → env (fail-closed on conflict)

---

## Preflight / freshness (read-only audit)

| Check | Authority |
|-------|-----------|
| Vehicle telemetry fresh | `EXP021_DEFAULT_TELEMETRY_FRESHNESS.vehicleTelemetryFreshThresholdMs` = **600_000** (10 min) — any signal timestamp |
| Speed signal fresh | `speedSignalFreshThresholdMs` = **120_000** (2 min) |
| Pre-arm session freshness | `assessPrearmFreshness` — preflight assessed within `prearmMaxAgeMs` (config default 15 min) |
| Deployment preflight | `deploymentPreflightReady` required |

Stationary fresh telemetry event can satisfy freshness if within thresholds — motion/ignition not required for pre-arm.

---

## Abort criteria

- Operator abort → `cancelExperimentForAbortedSession` (settlement schedules SKIPPED, experiment CANCELLED)
- Fatal orchestrator before scientific phase → abort path
- Fatal after scientific phase → stopRecording preserves valid post-stop shadow

---

## Evidence identity (must be NEW for WOB L 7503 run)

**Never reuse PR #1618 frozen IDs:**

| Field | Frozen (KS MS 661) |
|-------|---------------------|
| RC_SESSION_ID | `6720ad68-f80e-452e-8356-2f11d9fb2205` |
| CALIBRATION_SERIES_ID | `07ad7f7b-b953-4c75-8405-ab099a69dfa4` |
| SETTLEMENT_EXPERIMENT_ID | `exp-021-6720ad68-b25b9f5f` |

Capture for new run: `NEW_RC_SESSION_ID`, `NEW_CALIBRATION_SERIES_ID`, `NEW_SETTLEMENT_EXPERIMENT_ID`, `calibrationPlanId`, `calibrationPlanVersion`, canonical T0 ISO, per-phase summaries.

---

## Implementation references

- `reference-capture-exp021-calibration-plan.lib.ts` — `EXP021_CANDIDATE_SHORT_AB_90_60`
- `reference-capture-exp021-candidate-short-ab-90-60.spec.ts` — plan/slot/settlement/lifecycle regression
