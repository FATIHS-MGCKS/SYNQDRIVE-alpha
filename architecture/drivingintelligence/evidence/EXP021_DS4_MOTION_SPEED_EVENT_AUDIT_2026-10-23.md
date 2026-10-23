# EXP-021 DS4 Motion — Speed / Event / Trip-Map Audit (2026-10-23)

**Status:** Research audit + isolated frontend prototype (Draft PR; no merge/deploy)  
**Base:** PR #2134 HEAD `3f3c4a516` · branch `cursor/ds4-motion-speed-event-audit-192d`  
**Epistemic state:** `CONFIRMED` for pipeline/display findings (reproduced from frozen payload + code); `INFERRED` for the 19:04 UTC case verdicts (outside video coverage)  
**Decision/validation status:** display prototype `EXPERIMENTAL`; candidate gate K-E `PROPOSED` (offline-validated, not runtime-integrated)

## Package

`research/driving-intelligence/audits/ds4-motion-speed-event-audit-20261023/` (README, REPORT, two reproducible scripts, JSON/MD outputs). Inputs are the frozen compact package `ds4-motion-tiguan-20261022-compact` (pinned Tiguan WOB L 7503 trip `98d2a8e0…`, motion run `8ec6306e…`, snapshot `…22e2a662…`).

## Confirmed findings

1. **Unsigned `deltaKmh` + forced `+` prefix** in `TripMotionMapPopover` rendered braking as `35 → 6 km/h (+29)`. The detector persists the magnitude for both directions; the sign must be derived from start/end speed. (CONFIRMED, reproduced by formatter replay.)
2. **`durationS` / `meanAccelMps2` are computed by the detector but not persisted**; the read mapper sets `peakAccel1sMps2: null`. UI must derive duration from bucket labels (±1 s).
3. **Mapper `artefactSuspect = quality === 'ARTEFACT_SUSPECT'` only** → `DEGRADED` events such as #10 (`67 → 1931 km/h`, inside the video window) render as ordinary accelerations.
4. **"0 Ereignisse" HUD** reads legacy `VehicleTrip` counters via `countTripEvents`, never the motion payload (21 events).
5. **19:04 UTC cases:** IMG_7778/7779 are plausible brakings with the display sign bug (7778 additionally `JITTER_SUSPECT` timing); IMG_7780/7781 are measurement artefacts (mean +8.3 / +6.6 m/s², sparse endpoints, `ROW_ABSENT` inside window, chord/label-cadence mismatch, trip-end edge). All four are `NOT_VIDEO_COVERED`.
6. Baselines vs. video (frozen package): L3 MAE 14.5 / C4 9.2 km/h with median ≈ 2.8 km/h for both — error mass is in a handful of jitter seconds (max 1865 km/h), not a systematic speed bias. Reference windows: 7/9 matched; windows 1–2 are gentle coast-downs below the HF entry threshold (1.5 m/s²).

## Candidate (offline)

K-E = G1 (kinematic envelope: mean a > 5 m/s² accel / < −9 m/s² decel / endpoint > 250 km/h) ∪ G2 (`JITTER_SUSPECT` in window, or label gap + both endpoints sparse). Flags exactly #10, #17, #18, #20 on Tiguan-22; 0/7 video-matched events flagged; 0/21 flagged on Tiguan-19; pipeline invariants (data loss → 0 events, 10 s horizon stability, idempotency) PASS. Runtime 1.3 s, heap Δ 19.5 MB.

G1 is implemented in the frontend prototype as a display rule (`isMotionEventKinematicallyImplausible`). G2 needs C4 sample qualities → proposed backend follow-up (mapper `plausibility` field or detector `usableQualities` change with renewed Tiguan-19/Tesla preservation evidence).

## Prototype scope (frontend only)

`useTripsRouteMap` (event segment + endpoint layers bound to selected motion event), `motion-map.utils` (segment resolution, signed metrics, envelope), `TripMotionMapPopover` (window, signed Δv, duration, mean m/s², quality, segment notes, artefact hint), `TripMapSummaryOverlay` (`motionEventCount`), 11 new `trips.motionMap.*` keys × 9 locales, tests with pinned 19:04 fixtures.

## Non-effects

No change to C4, FSM, event detector, persistence, read mapper, M7A, scoring, legacy behavior-event markers, Production.

## Open

Mapbox GUI verification pending (no `VITE_MAPBOX_ACCESS_TOKEN` in audit environment); product semantics for gentle coast-down (windows 1–2) vs. HF braking undecided; legacy hardcoded copy in `TripMapSummaryOverlay` outside the motion path.
