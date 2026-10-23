# GO / NO-GO — isolated FSM implementation

**Research candidate:** `FSM_GAP_BRIDGE_RESEARCH_V1`  
**Run:** `outputs/run_v1`  
**Verdict:** **GO_RESEARCH_IMPLEMENT** (conditional)

## Gate (fleet)

| Rule | Result |
|------|--------|
| `falseMotionInConfirmedStill` must not increase | PASS (all drives Δ = 0) |
| `falseStillInConfirmedMotion` must not increase | PASS (all drives Δ = 0) |
| C4 manoeuvre detector unchanged | PASS (signature parity all drives) |
| C4/C5.1 speed series untouched | PASS (by construction) |

## Target windows (TIG22)

| Window | Baseline | Candidate | Notes |
|--------|----------|-----------|-------|
| 18:49:16–23Z | 8× `UNKNOWN` | 8× `MOVING` / `INFERRED` / `research_retro_gap_bridge_endpoint_displacement` | Matches Fable hypothesis; implied ~61 km/h over 12 s bridge |
| 18:41:00–05Z | 6× `UNKNOWN` | 4× `UNKNOWN` + 2× `STOP_CANDIDATE` (frozen stand) | `:00–:03` remain `UNKNOWN` (7 s `ROW_ABSENT` — correct) |
| Stop offset @ 18:41:01Z | +5 s | **+3 s** | Frozen stand only; no false STILL |

## Failure / watch cases (implementation must address)

1. **19:03:33–55Z (post–video-GT)** — second `GAP_BRIDGE_APPLIED` (27 s, implied ~8.2 km/h, `STARTING`→`MOVING`). No scored-video penalty in this run, but product implementation should add a **long-gap guard** (e.g. span > `gapShortMaxS` requires implied speed ≥ `gapLowSpeedContextKmh` or anchor `MOVING` on both sides with DIRECT cruise evidence).
2. **Embedded stop** — current blocker uses L3 still + 3 s ≤ `reappearNoiseM` displacement; not validated against a dedicated synthetic halt-inside-gap fixture.
3. **Causal mode** — candidate is **retrospective-only**; live FSM must not copy this pass without a defined causal contract.

## NO-GO triggers for a future implement PR

- Any increase in `falseMotionInConfirmedStill` or `falseStillInConfirmedMotion` on TES16 + TES21-1/2 + TIG22
- Bridging across gaps where DI-V0 reports `STATIONARY_SUPPORTED` inside the window
- Emitting numeric `speedKmh` on bridged labels (must stay `null`)

## Recommended next step

Open a **small, isolated** `motion-fsm.ts` change behind a new `MotionFsmCandidateOptions` flag (default `false`), port logic from `scripts/fsm_gap_bridge_candidate.cjs`, add unit fixtures for 18:49 + 18:41 + embedded-stop negative case, re-run this eval script unchanged as regression gate.
