# Battery V2 ICE Rest-Window Opening Policy Hardening — 2026-08-28

## Problem

Production trip `61715ecd` (Mercedes-Benz C 63 AMG ICE) was rejected with
`engine_not_off` at the exact trip-end anchor despite:

- `is_ignition_on = false`
- `speed = 0`
- contemporaneous DIMO per-signal timestamps (not stale/mixed-age)
- LV voltage drop from running alternator range to resting range

The opener treated `engine_load ≈ 10%` as `engineRunning = true` via the
hard-coded `engine_load > 5` proxy and rejected the candidate even though
ignition-off + stationary evidence was authoritative at key-off.

This predated #1383; #1383 made the rejection deterministic at trip
finalization instead of relying on a later observation cycle that never
arrived.

## Policy split (opening vs measurement)

Two functions now govern engine-off semantics:

| Function | Used by | Behavior |
|----------|---------|----------|
| `isEngineOffForRestWindowOpening` | `canOpenRestWindowCandidate`, `isValidRestSnapshot` | Ignition-off + speed at rest outrank transitional `engine_load` proxy |
| `isEngineOffForRest` | REST target evaluation, measurement quality | Unchanged conservative: residual `engine_load` may still reject in-window observations |

Opening eligibility and downstream REST measurement quality remain separate
concerns. `engine_load` is not discarded globally.

## Evidence precedence (opening gate)

1. **Strong RUNNING** — `ignitionOn === true` → reject.
2. **Strong OFF** — `ignitionOn === false` and `isSpeedAtRest(speedKmh)` → accept (even when `engineRunning` is true from load proxy).
3. **Ambiguous** — unknown ignition with `engineRunning === true` → conservative reject.

RPM is not yet available on `LvRestWindowSignalContext` / `VehicleLatestState`;
when wired, strong RPM-based running evidence can be layered without changing
the ignition-off + at-rest override for load-only proxies.

## Unchanged

- Feature flags, publication/readiness, Stage 2
- Trip detection, DIMO ingestion, session idempotency (#1383)
- Speed, charging, wake-voltage, active-trip, provider-error gates
- `buildSignalFromLatestState()` still derives `engineRunning` from `engine_load > 5` for downstream paths

## Tests

`lv-rest-window.policy.spec.ts` — opening-gate matrix A–F + downstream unchanged check.

`lv-rest-window-session-arming.service.spec.ts` — production trip `61715ecd`
shape with `engineLoad = 10.196` opens and promotes to RESTING.
