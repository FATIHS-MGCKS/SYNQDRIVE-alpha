# REPORT — FSM retrospective gap bridge research (2026-10-23)

## Scope

Offline research only. Analyses production `motion-fsm.ts` + `withImplausibleLegEndpointsQuarantined` behaviour; evaluates a **label post-pass** candidate without modifying backend product code.

## Architecture inspected (CONFIRMED)

| Component | Role |
|-----------|------|
| `leg-consistency.ts` | Quarantined endpoints → `ROW_ABSENT` for FSM grid |
| `di-v0-motion-core-shadow-processor.ts` | C4 on **raw** buckets; FSM on **quarantined** buckets |
| `motion-fsm.ts` | `gapShortMaxS=3` → `UNKNOWN` after long gaps; `FROZEN_POSITION` treated as no position evidence (Z. 270–273); forward-only `displacement_across_gap_implies_motion` at gap **end** |

## Candidate design

Documented in `scripts/fsm_gap_bridge_candidate.cjs`. Parameters are **identical** to `MOTION_FSM_PARAMS_V0_2_DEV` (no TIG22 tuning).

## Results (single run `run_v1`)

### Summary table

| Drive | UNKNOWN Δ | motionNoClaim Δ | stillNoClaim Δ | falseMotion Δ | falseStill Δ |
|-------|-----------|-----------------|----------------|---------------|--------------|
| TIG22 | −33 | −8 | −2 | 0 | 0 |
| TES16 | 0 | 0 | 0 | 0 | 0 |
| TES21-1 | 0 | 0 | 0 | 0 | 0 |
| TES21-2 | 0 | 0 | 0 | 0 | 0 |

### TIG22 motion claims (video-scored classes)

| Metric | Baseline | Candidate |
|--------|----------|-----------|
| `motionCorrect` (MOVING_CONFIRMED) | 1246 | **1254** |
| `motionNoClaim` | 8 | **0** |
| `stillCorrect` (STILL_CORE) | 69 | **71** |
| `falseMotionInConfirmedStill` | 0 | 0 |
| `falseStillInConfirmedMotion` | 0 | 0 |

### Stop timing (18:41:01Z zero run)

- Baseline stop offset: **+5 s**
- Candidate stop offset: **+3 s** (frozen stand at 18:41:04–05 only; 18:41:00–03 stay `UNKNOWN`)

### Quarantine cluster (18:49:16–23Z)

Baseline: all `UNKNOWN` / `INDETERMINATE`.  
Candidate: all `MOVING` / `INFERRED` with `research_retro_gap_bridge_endpoint_displacement` (bridge audit: 12 s, ~203 m, implied ~61 km/h).

### Audit events (TIG22)

1. `FROZEN_STAND` @ 18:41:04–05  
2. `GAP_BRIDGE_APPLIED` @ 18:49:16–23  
3. `GAP_BRIDGE_APPLIED` @ 19:03:33–55 (**post–video-GT** — see `GO_NO_GO.md`)

## Events

20 C4 manoeuvre events per drive; **bit-identical** before/after (FSM not wired into detector).

## Conclusion

The hypothesis from Fable review is **supported on sealed eval drives**: endpoint displacement can backfill cruise `UNKNOWN` after GPS quarantine without false still/motion claims on TIG22/TES16/TES21. Frozen + `STATIONARY_SUPPORTED` modestly improves stop timing without inventing speed.

Implementation should be **retrospective-only**, flag-gated, and include an extra guard for long low-speed bridges outside scored video.

## Limitations

- One comparison run (per task stop rule)
- Candidate is not identical to a forward FSM rewrite; porting must preserve fail-closed embedded-stop checks
- Independent evidence: TIG22 = EVAL; TES* = DEV fixtures (same gates, different epistemic weight)
