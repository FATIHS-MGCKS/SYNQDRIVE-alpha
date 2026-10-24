# DS4 FSM — Retrospective gap bridge (offline research)

**Status:** Single completed comparison run (`outputs/run_v1`). **No production code changes.**

## Question

Can existing endpoint-displacement and `FROZEN_POSITION` + `STATIONARY_SUPPORTED` evidence reduce FSM `UNKNOWN` phases (TIG22: 18:49:16–23 quarantine cluster; 18:41 stop approach) **without** inventing numeric speed and **without** false MOVING/STILL claims?

## Candidate

`FSM_GAP_BRIDGE_RESEARCH_V1` — post-pass on baseline `runMotionFsm` labels (same inputs as `processDiV0MotionCoreShadowTrip`: leg quarantine view for FSM, raw buckets for C4).

| Mechanism | Rule (summary) |
|-----------|----------------|
| Frozen stand | `UNKNOWN` + C4 `FROZEN_POSITION` + DI-V0 `STATIONARY_SUPPORTED` → `STOP_CANDIDATE` / `STATIONARY` via `stopConfirmS` |
| Retro gap bridge | Contiguous `UNKNOWN` bracketed by `MOVING`/`STARTING` with non-`INDETERMINATE` anchors; endpoint displacement implies ≥ `movingBandMinKmh`; block if embedded stop (L3 still / low-displacement run) |

## Evidence basis

- PR [#2148](https://github.com/FATIHS-MGCKS/SYNQDRIVE-alpha/pull/2148) TIG22 deep validation artifacts
- Fable independent review (2026-10-23)
- Sealed inputs: `../ds4-speed-video-reference-20261023/inputs/`

## Quick result

| Gate | Outcome |
|------|---------|
| False-claim regression (4 drives) | **PASS** (Δ = 0) |
| C4 event detector parity | **PASS** |
| TIG22 `UNKNOWN` (full grid) | **−33**; scored-window `motionNoClaim` **−8** |
| TES16 / TES21-1 / TES21-2 | **no delta** |

See `GO_NO_GO.md` and `REPORT.md`.

## Reproduce

`REPRO.md`
