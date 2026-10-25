# Tire Wear V3 — P3B DS4 dynamics & temporal coverage (shadow adapter)

**Status:** Draft / shadow-only (adapter `tire-ds4-shadow-input-v1.1.1`, payload schema v3).

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
- Sample `evidenceQuality` follows **DS4 Motion FSM** (`DIRECT` / `INFERRED` / `INDETERMINATE`) — not manoeuvre event OK/DEGRADED/LIMITED (those apply only to M3 event admission).
- `validDrivingSeconds`: **DIRECT** FSM with **MOVING/STARTING** state, trip `speedAuthority` set, and plausible speed above minimal movement threshold.
- `confirmedStationarySeconds`: **observed**, non-inferred stops with **DIRECT** FSM stop quality; seconds inside certain core `startLatestUtc`…`endEarliestUtc` with **DIRECT STATIONARY** samples or tight imputation rules unchanged.
- `degradedLabelSeconds` / `invalidLabelSeconds`: **INFERRED** vs **INDETERMINATE** (and non-accountable **DIRECT** labels); legacy unit fixtures may still use event QC tokens in tests only.
- `gapSeconds`: unlabelled seconds between labelled samples that are **not** explained by confirmed stationary; `unknownSeconds`: unlabelled seconds without confirmed stop.
- `accountableFraction` = min(1, (valid driving + confirmed stationary) / trip window).
- `VERIFIED` only when every trip second is accountable (valid OK movement or directly confirmed stationary), with zero unknown/gap/degraded/invalid seconds — **not** when time labels exist alone or a ratio threshold is met.

### Fable hypothesis (not a product gate in P3B)

An **85%** temporal coverage threshold is recorded as `fableHypothesis85PctThreshold: 0.85` in payload metadata for research comparison only. Missing events must **not** be interpreted as gentle driving.

## Tire shadow defer vs shared TripMapRead

- Shared `DiV0MotionCoreShadowTripMapReadService` semantics are unchanged for Master/DS4 consumers (`PENDING` / `FAILED` / `NOT_AVAILABLE` as before).
- **Tire DS4 shadow processor only:** bounded **defer** on `PENDING`, `FAILED`, and `NOT_AVAILABLE` (except `TRIP_NOT_FOUND`); no immediate `ds4_not_available` terminal on first `NOT_AVAILABLE`.

## Safety

- Insert-only shadow rows; prior adapter `v1.0.1` / schema v2 rows immutable.
- No V2/V3 prior β change (β remains 0).
- No production flag changes; canary allowlist unchanged.
