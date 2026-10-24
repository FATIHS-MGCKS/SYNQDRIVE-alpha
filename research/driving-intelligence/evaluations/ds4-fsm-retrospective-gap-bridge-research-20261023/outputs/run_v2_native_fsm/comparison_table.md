# FSM gap-bridge research — before/after (single run)

Code SHA: `3c84520b7b60c8d6bb34a5b0624eaed338ecdce6`
Baseline FSM: `MOTION_FSM_V0_3_CAND_DEV[staleSpeedContextFix+startingTimeout+evidencePropagation]`
Candidate: `FSM_GAP_BRIDGE_V1_NATIVE`

| Drive | UNKNOWN Δ | motionNoClaim Δ | stillNoClaim Δ | falseMotion Δ | falseStill Δ | Events parity |
|-------|-----------|-----------------|----------------|---------------|--------------|---------------|
| TIG22 | -10 | -8 | -2 | 0 | 0 | yes |
| TES16 | 0 | 0 | 0 | 0 | 0 | yes |
| TES21-1 | 0 | 0 | 0 | 0 | 0 | yes |
| TES21-2 | 0 | 0 | 0 | 0 | 0 | yes |

**Gate:** PASS
**GO/NO-GO:** GO_RESEARCH_IMPLEMENT
