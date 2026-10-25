# Tire Wear V3 — P3B DS4 dynamics & temporal coverage (shadow adapter)

**Status:** Draft / shadow-only (adapter `tire-ds4-shadow-input-v1.1.0`, payload schema v3).

## M3 load proxy (Fable)

For **OK** manoeuvre events only:

\[
M_3 = \sum \frac{0.5 \cdot |v_{\mathrm{end}}^2 - v_{\mathrm{start}}^2|}{\mathrm{tripDistanceKm}}
\]

- Speeds converted km/h → m/s before squaring.
- Unit: **J/kg/km** (no vehicle mass, no mm wear).
- ACCELERATION and DECELERATION channels summed separately.
- Prior Δv, duration, and count aggregates preserved.

## Temporal coverage

Derived from DS4 speed/FSM samples, stop episodes, and tire-trip ledger window:

- `validDrivingSeconds`, `confirmedStationarySeconds`, `gapSeconds`, `unknownSeconds` (no double-count per second).
- `VERIFIED` only when ledger-aligned window, no internal gaps, and full labelling — **not** when a ratio threshold is met alone.

### Fable hypothesis (not a product gate in P3B)

An **85%** temporal coverage threshold is recorded as `fableHypothesis85PctThreshold: 0.85` in payload metadata for research comparison only. Missing events must **not** be interpreted as gentle driving.

## Safety

- Insert-only shadow rows; prior adapter `v1.0.1` / schema v2 rows immutable.
- No V2/V3 prior β change (β remains 0).
- No production flag changes; canary allowlist unchanged.
