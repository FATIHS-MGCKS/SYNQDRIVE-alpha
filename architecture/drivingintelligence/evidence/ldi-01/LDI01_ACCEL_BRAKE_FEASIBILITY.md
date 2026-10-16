# LDI01 — Acceleration & Braking Feasibility (Offline)

## What can be reconstructed from frozen L3/QC (Tesla pin)?

- **Trusted numeric coverage:** 775/1136 — only these seconds support stable Δv/Δt on bucket grid.
- **ROW_ABSENT:** 269 — **no interpolation** across gaps.
- **Abstention / transition:** 45 PRESENT+NO_MOTION, 32 TRANSITION_UNCERTAIN (EXP021 P22E).

### Feasible offline (conservative)

1. **Segment-wise kinematics** on contiguous TRUSTED numeric runs (variable effective Δt = 1 s label, not proven physics sampling).
2. **Comparative diagnostics** against video tacho windows (development trip only) — label independence required.
3. **QC leg-implied speeds** where calendar-complete — subject to GEOMETRY_JUMP rejection (1 outlier on pin).

### Not feasible without new data / policy change

- Harsh event thresholds on unvalidated sparse labels.
- Braking “stop proved” from GPS deceleration alone inside ROW_ABSENT.
- Merging EXP021 halt prototype scores into accel/brake metrics.

## Production HF path (separate from L3 pin)

- Uses `fetchHighFrequency` 1s buckets — **cadence not guaranteed 1 Hz** (`CURRENT_STATE.md`).
- Detectors require ≥3 clean points; merge windows 1.5–2 s.
- Skip reasons: `INSUFFICIENT_POINTS`, `NO_HF_DATA`, `CAPABILITY`.

## Stop-and-go / slow-roll interaction

- EXP021 documents band semantics vs display tacho (P22E-F).
- Slow-roll geometry (52 s) ≠ harsh braking; do not reuse halt thresholds.

**Assessment:** PARTIAL — trusted numeric segments only; gaps/abstention block interpolation; braking: PARTIAL — same; driving-impact-braking-provenance documents measured vs proxy end speeds.