# FSM gap-bridge research — before/after (single run)

Code SHA: `d5659ba2a4083f696017a8048554a15051b99977`
Baseline FSM: `MOTION_FSM_V0_3_CAND_DEV[staleSpeedContextFix+startingTimeout+evidencePropagation]`
Candidate: `FSM_GAP_BRIDGE_RESEARCH_V1`

| Drive | UNKNOWN Δ | motionNoClaim Δ | stillNoClaim Δ | falseMotion Δ | falseStill Δ | Events parity |
|-------|-----------|-----------------|----------------|---------------|--------------|---------------|
| TIG22 | -33 | -8 | -2 | 0 | 0 | yes |
| TES16 | 0 | 0 | 0 | 0 | 0 | yes |
| TES21-1 | 0 | 0 | 0 | 0 | 0 | yes |
| TES21-2 | 0 | 0 | 0 | 0 | 0 | yes |

**Gate:** PASS
**GO/NO-GO:** GO_RESEARCH_IMPLEMENT
