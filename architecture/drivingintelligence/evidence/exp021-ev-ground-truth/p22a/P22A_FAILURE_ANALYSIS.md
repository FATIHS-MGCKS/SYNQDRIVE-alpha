# EXP021 P22A — Failure Analysis

**Scope:** Evidence audit only — **no** independent false-positive/false-negative rates.

## Error classes (from development + transferability signals)

| Failure mode | Example signal | Solvable with better evidence? | Needs detector logic change? |
|--------------|----------------|-------------------------------|------------------------------|
| False halt at slow movement | Transferability `HALT_BUT_BOTH_GAP_EDGE_LEGS_MOVING` flags on Ruptela trips | Partially — denser position + speed witness | Possibly — edge-leg semantics frozen in v0_2 |
| False movement at true standstill | Tesla ROW_ABSENT during video tacho-0 (stationary evidence surface) | **Yes** — independent video + aligned position pin | Prototype gap semantics; product path separate |
| GPS jitter / hold noise | Small chord + scatter geometry class | **Yes** — higher-rate GNSS or fused speed | Calibration bundle review (out of P22A tuning) |
| Position gaps | 37–100 % present across manifest trips | **Yes** — provider/uplink forensics | Gap detector unchanged; interpretation only |
| Back-and-forth / maneuver | E01 reverse departure; RD003 clip 9 | **Yes** — maneuver-specific video GT | v0_2 chord model blind to path length |
| Video vs telemetry time skew | Kompakt: no sub-second absolute offset; RD003 ±30s | **Yes** — clock calibration protocol | No — alignment layer |
| Video tacho vs GPS speed | iPhone overlay holds 11.7/21.2 at tacho 0 | **Yes** — do not use overlay as GT | N/A |

## Development-only halt diagnostics (not P22A metrics)

- `GAP_EVT_002, GAP_EVT_003`: LIKELY_HALT without decisive video in gap window.
- Video-supported LIKELY_HALT: GAP_EVT_005, GAP_EVT_007.
- Not decisive: GAP_EVT_006, GAP_EVT_008.
- Natural-gap counters: {"likelyHaltWithoutOverlappingMainHaltWindow":2,"likelyHaltWithVideoContradictionOrNoStopEvidence":1}.

## Remaining evidence gaps

1. Zero **independent** trips with P21 pin + per-second video labels for all five case types.  
2. RD003 lacks validated telemetry↔video chronology for halt windows.  
3. RD004 documents timing gaps, not halt ontology.  
4. No blind holdout drive post-freeze.
