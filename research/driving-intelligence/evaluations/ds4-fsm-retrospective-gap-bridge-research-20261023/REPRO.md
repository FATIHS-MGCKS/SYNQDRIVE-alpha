# Reproduction — FSM gap bridge research (single run)

## Prerequisites

- Repository checkout with `backend/node_modules` installed (`cd backend && npm ci`)
- Inputs present at `research/driving-intelligence/evaluations/ds4-speed-video-reference-20261023/inputs/` (same bundle as DS4 speed/video reference eval)

## Command

```bash
cd research/driving-intelligence/evaluations/ds4-fsm-retrospective-gap-bridge-research-20261023
node scripts/run_fsm_gap_bridge_research.cjs
```

Optional: pin code root

```bash
node scripts/run_fsm_gap_bridge_research.cjs --code-root /path/to/SYNQDRIVE-alpha
```

## Outputs

- `outputs/run_v1/summary.json` — full metrics, audit trail, focus windows
- `outputs/run_v1/comparison_table.md` — summary table

Exit code `0` = gate pass; `1` = gate fail.

## Baseline definition

- FSM: `processDiV0MotionCoreShadowTrip` / `MOTION_FSM_V0_3_CANDIDATE_OPTIONS` + `MOTION_FSM_PARAMS_V0_2_DEV`
- Kinematic buckets: `withImplausibleLegEndpointsQuarantined(evidence.buckets)`
- C4/events: unchanged; candidate only rewrites FSM labels in memory

## Pinned run (this PR)

Recorded in `outputs/run_v1/summary.json` → `versions.codeSha`.
