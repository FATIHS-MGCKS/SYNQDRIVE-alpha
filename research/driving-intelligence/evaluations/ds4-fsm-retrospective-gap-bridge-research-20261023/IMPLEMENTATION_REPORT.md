# Implementation report — FSM gap bridge V1 (native `motion-fsm.ts`)

**Branch:** `cursor/ds4-fsm-gap-bridge-impl-192d`  
**Replay:** `outputs/run_v2_native_fsm` (post-implementation, single run)

## Code changes (product)

| Path | Change |
|------|--------|
| `core/kinematics/motion-fsm-gap-bridge-v1.ts` | Post-pass: frozen stand + retro bridge + `gapBridgeV1LongSpanAllowed` |
| `core/kinematics/motion-fsm.ts` | `retrospectiveGapBridgeV1` flag (default **false**), `MOTION_FSM_V0_4_GAP_BRIDGE_OPTIONS`, optional `gapBridgeAuxiliary` |
| `core/__tests__/motion-fsm-gap-bridge-v1.spec.ts` | Unit + embedded-stop + long-gap guard |

**Shadow processor:** unchanged — still `MOTION_FSM_V0_3_CANDIDATE_OPTIONS` (flag OFF).

## Long-gap guard (general)

For `spanS > gapShortMaxS`:

- `impliedKmh` must be ≥ `gapLowSpeedContextKmh` (10 km/h)
- If either anchor is `STARTING`, both anchors must be `DIRECT`

**Effect on TIG22:** 19:03:33–55Z **not** bridged (implied ~8.2 km/h &lt; 10). Research post-pass v1 incorrectly bridged this window.

## Offline replay (`run_v2_native_fsm`)

| Drive | UNKNOWN Δ (full grid) | motionNoClaim Δ | falseMotion / falseStill | Events |
|-------|----------------------|-----------------|--------------------------|--------|
| TIG22 | **−10** | **−8** | 0 / 0 | parity ✓ |
| TES16 / TES21-1 / TES21-2 | 0 | 0 | 0 / 0 | parity ✓ |

### TIG22 scored video window (18:38:34–19:03:02Z)

Motion-claim metrics use reference rows inside the window only; candidate achieves **motionNoClaim 0** with **falseMotionInConfirmedStill 0** (same as research target for scored GT).

| Focus | Baseline | Native V0_4 |
|-------|----------|-------------|
| 18:49:16–23 | 8× UNKNOWN | 8× MOVING / INFERRED bridge |
| 18:41 stop offset | +5 s | **+3 s** |
| 19:03:33–55 (unscored) | UNKNOWN | **UNKNOWN** (guard) |

## GO/NO-GO (implementation)

**GO** for Fable safety review and a follow-up PR to enable flag in shadow **only after** review — **not** in this change.

## Known limitations

- `STATIONARY_SUPPORTED` for frozen stand comes from optional `MotionFsmGapBridgeAuxiliary` (DI-V0 replay / future shadow enrichment). Without aux, frozen-stand path is inactive.
- Retrospective-only; causal mode unchanged.
- C4/C5.1 speeds untouched.

## Fable safety review prep

- Attach `outputs/run_v2_native_fsm/summary.json` focus windows + this report.
- Ask: confirm long-gap guard on additional EVAL drives before any flag ON.
