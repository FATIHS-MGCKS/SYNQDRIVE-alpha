# EXP-021 — KS MX 2024 Incomplete Short A/B Forensic Freeze

**Date:** 2026-09-14  
**Classification:** `INCOMPLETE_SHORT_AB` · `PARTIAL_OPERATIONAL_EVIDENCE` · **NOT** valid for cadence selection  
**Production SHA:** `d1501d171c1cc6dc4b83b2720e3a96549ef24185`  
**Vehicle:** KS MX 2024 · Mercedes-Benz C 63 AMG · token **187336** · `a60c0749-a7cd-494e-b5b9-dea3c6b97d63`

| Field | Value |
|-------|-------|
| `RC_SESSION_ID` | `332c1549-622d-4535-afd9-867962003280` |
| `CALIBRATION_SERIES_ID` | `0657d5df-16c3-4768-b37d-d2f21d7c4a62` |
| `SETTLEMENT_EXPERIMENT_ID` | `exp-021-332c1549-2efc9ef2` |
| `TRIP_ID` | `f6809e13-181f-4264-b5e3-341b71a57c82` |
| `PLAN_ID` | `candidate_short_ab_90_60` |
| `PLAN_VERSION` | `EXP021_CANDIDATE_SHORT_AB_90_60` |
| `PHYSICAL_T0` | `2026-09-14T11:43:53.000Z` |
| `PHYSICAL_END` | **NULL** (no orchestrated physical-end seal) |

**Production evidence paths (VPS):**

- `/opt/synqdrive/shared/reference-evidence/exp-021-ks-mx-2024-incomplete-short-ab-forensic-freeze.json`
- `/opt/synqdrive/shared/reference-evidence/exp-021-ks-mx-2024-controlled-stop.log`
- `/opt/synqdrive/shared/reference-evidence/exp-021-ks-mx-2024-t0-watcher.jsonl`

---

## Scientific classification

| Question | Answer |
|----------|--------|
| Valid T0 evidence | **YES** |
| Valid 90s operational evidence | **YES** (7 slots, 5/7 provider success) |
| Valid 90 vs 60 comparison | **NO** |
| Valid for production cadence selection | **NO** |

The 90s phase remained active **~116.6 minutes total from T0**, **~106.6 minutes beyond the nominal 10-minute end**. Do **not** treat the abort-terminalized phase summary as a valid 10-minute candidate window.

---

## Arm path used (CONFIRMED)

1. Manual `reference-capture-lte-r1-prearm.ts --confirm-prearm` — PASS  
2. Manual `reference-capture-lte-r1-fast-go.ts --confirm-fast-go` — PASS  
3. One-shot `exp021-ks-mx-2024-t0-watcher-once.ts` — T0 sealed, watcher exited  
4. **Autonomous orchestrator was NOT started**

---

## 90s phase (pre-abort forensic freeze @ 2026-09-14T13:40:26Z)

| Metric | Value |
|--------|-------|
| Phase start | `2026-09-14T11:43:53.000Z` |
| Nominal end | `2026-09-14T11:53:53.000Z` |
| State at freeze | `ACTIVE_UNSEALED` |
| Actual wall duration | ~6,994,000 ms (~116 min) |
| Expected slots | 7 |
| Persisted / issued | 7 / 7 |
| SUCCESS / FAILURE / SKIPPED | 5 / 2 / 0 |

**Slot terminal sequence:** FAILURE, SUCCESS, FAILURE, SUCCESS, SUCCESS, SUCCESS, SUCCESS

**Native temporal buckets (90s phase fast-loop):** 25 buckets  
**Inter-bucket delta P50/P90/P95/P99:** 15s / 21s / 37.9s / 40.9s  
**Gaps ≥10s / ≥20s / ≥30s:** 17 / 7 / 2  
**Buckets per successful provider request:** 5.0 (25 buckets ÷ 5 successes)

---

## Settlement shadow (90s phase)

**Geometry:** WALL_CLOCK full-phase overlapping tiles — 60s windows every 30s from phase start × 6 mandatory ages (+30…+600).

| Metric | Value |
|--------|-------|
| Nominal FIXED_INTERVAL windows | **19** |
| Settlement ages | 30s, 60s, 120s, 180s, 300s, 600s |
| Expected observation rows | **114** (19 × 6) |
| Actual observation rows | **114** |
| Status breakdown | 114 SUCCESS |
| 60s phase observations | **0** |

All 19 probes (`SP-90-T0` … `SP-90-T18`) have complete 6-age maturation.

---

## Lifecycle root cause

**Class:** `E_MULTI_FACTOR`

| Factor | Detail |
|--------|--------|
| `A_OPERATOR_RUNBOOK_GAP` | Manual PRE-ARM + FAST GO + one-shot T0 watcher path used without phase-orchestration owner |
| `B_ORCHESTRATOR_NOT_STARTED` | `reference-capture-exp-021-autonomous-orchestrator.ts` never ran for this session |

**Who owned phase transitions in this run:** **NOBODY** — acquisition runner issued HF slots within the active 90s phase only; no component called `switchHfCalibrationPhase(..., PHYSICAL_TRANSITION)`.

**Who should have owned phase transitions:** `reference-capture-exp-021-autonomous-orchestrator.ts` DRIVING loop (`phaseTracker.shouldAdvancePhase` → `switchHfCalibrationPhase` → `advancePhaseAtEffectiveBoundary`).

**Why 90s did not transition at 10 min:** No orchestrator polled wall-clock boundaries; manual T0 watcher exits after T0; RC acquisition service has no phase-advancement logic.

**Orchestrator attach blocked:** `isOrchestratorOwnedRecordingSession` requires `exp021AutonomousOrchestrator.runId` in `preflightJson` — manual FAST GO does not stamp this.

---

## Controlled stop (2026-09-14T13:43:11Z)

**Mechanism:** `reference-capture-exp-021-stuck-session-abort.ts`  
**Reason:** `exp021_physical_run_ended_before_orchestrated_90_60_lifecycle_complete`

| Post-stop check | Result |
|-----------------|--------|
| `RC_SESSION_TERMINAL` | YES (`ABORTED`) |
| `RC_SESSION_RECORDING` | NO |
| Observations preserved | 11,413 |
| Settlement experiment | `CANCELLED` |
| Runner job | null |
| Active cycle job | null |
| EXP-021 Redis locks | none |
| T0 watcher | none |

Trip FSM remained `RESTING` / `COMPLETED` — not altered.

---

## Next-run requirement

**Another physical run required:** YES  
**Ready to arm another physical run:** NO — pending autonomous-orchestrator regression / pre-run validation

**Supported ownership model (current code):** Autonomous orchestrator full lifecycle (`--confirm-exp021-autonomous`) — creates session, stamps ownership, starts recording, detects T0, advances 90→60, physical end, terminal stop.

**NOT supported without code change:** Manual PRE-ARM + FAST GO + T0 watcher + orchestrator attach (attach refused without ownership stamp).

**Code change required for manual-arm path:** YES — smallest fix: post-manual-FAST-GO orchestrator attach with ownership reconciliation, or dedicated phase-transition supervisor; plus regression proving 90s wall seal → 60s init → terminal without manual `switchHfCalibrationPhase`.

---

## Do not use for

- 90 vs 60 cadence selection  
- Production cadence decision  
- Evidence against 60s cadence (60s phase never ran)
