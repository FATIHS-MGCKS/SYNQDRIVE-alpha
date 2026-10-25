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

Derived from DS4 speed/FSM samples, stop episodes, and tire-trip ledger window (ledger `tripStartedAt` / `tripEndedAt`):

- Per-second walk inside the trip window; samples and stops clipped to window bounds; each second counted once.
- `validDrivingSeconds`: **OK** evidence with plausible speed above minimal movement threshold (not null/NaN/invalid).
- `confirmedStationarySeconds`: **observed**, non-inferred stops with **OK** quality; seconds only inside the certain core `startLatestUtc`…`endEarliestUtc` (not the wide earliest…latest envelope). Per-second OK stationary samples, or tight bounds with `gapLabels === 0` and `observedLabels` covering the core span (no imputation across uncertain boundaries).
- `degradedLabelSeconds` / `invalidLabelSeconds`: **DEGRADED** vs **LIMITED**/artefact/unknown quality or invalid OK labels (e.g. null speed).
- `gapSeconds`: unlabelled seconds between labelled samples that are **not** explained by confirmed stationary; `unknownSeconds`: unlabelled seconds without confirmed stop.
- `accountableFraction` = min(1, (valid driving + confirmed stationary) / trip window).
- `VERIFIED` only when every trip second is accountable (valid OK movement or directly confirmed stationary), with zero unknown/gap/degraded/invalid seconds — **not** when time labels exist alone or a ratio threshold is met.

### Fable hypothesis (not a product gate in P3B)

An **85%** temporal coverage threshold is recorded as `fableHypothesis85PctThreshold: 0.85` in payload metadata for research comparison only. Missing events must **not** be interpreted as gentle driving.

## Upstream lifecycle (S4 PRIMARY vs motion-core)

- `DiV0MotionCoreShadowTripMapReadService` treats **S4 PRIMARY COMPLETED** and **motion-core SUCCEEDED** as separate gates.
- While PRIMARY is missing/in-flight, or a completed PRIMARY still awaits motion-core outbox/run materialization, read status is **PENDING** (not `NOT_AVAILABLE`).
- Tire DS4 shadow jobs **defer** on `PENDING` and on residual `NOT_AVAILABLE` (bounded retries); immediate `ds4_not_available` terminal markers apply only when the trip cannot be resolved (`TRIP_NOT_FOUND`) or retries are exhausted.

## Safety

- Insert-only shadow rows; prior adapter `v1.0.1` / schema v2 rows immutable.
- No V2/V3 prior β change (β remains 0).
- No production flag changes; canary allowlist unchanged.
