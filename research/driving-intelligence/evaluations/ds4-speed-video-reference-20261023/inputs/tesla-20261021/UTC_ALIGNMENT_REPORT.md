# UTC alignment report — Phase 5C

## Status

**UTC_BINDING_STATUS:** `EXTERNAL_CLOCK_OFFSET_UNVALIDATED`

Primary reference field: `utc_candidate_assuming_offset_plus_02` (CEST → UTC arithmetic). Package rows carry `utc_binding_status=EXTERNAL_CLOCK_OFFSET_UNVALIDATED`.

## Anchors (not sufficient alone for second-level proof)

| Source | Observation |
|--------|-------------|
| iPhone overlay display times | Visually transcribed local wall clock (14:03–14:24 on 2026-10-21) |
| MOV `creation_time` (ffprobe) | e.g. TC_00073 `2026-10-21T12:03:05Z` — consistent with +02 mapping within ~1 s |
| Backend trip boundaries | Trip 1 start 11:58Z predates video; trip 2 start 12:15Z predates video 12:19:59Z |
| Telemetry bucket labels | 1 Hz UTC labels from S4 adapter |

No independent NTP/traceable clock calibration was performed in this phase. **No lag optimization** from M5/M7A/M7 outputs was applied (per `EVALUATION_PROTOCOL.json`).

## Exploratory spatial proxy (offset assumed)

Under unvalidated UTC, iPhone overlay vs native POSITION at the joined bucket:

- n = 359 included rows with finite coordinates
- median distance ≈ **4.56 m**, p90 ≈ **13.3 m**

These are **proxy** distances, not road accuracy.

## Time-dependent speed metrics

**SPEED_COMPARISON_STATUS:** `NOT_ASSESSABLE` for claims. Exploratory pairing count = 469 readable primary speeds (same offset assumption).

## Sensitivity

Formal ±1–2 s lag sweep is listed in the protocol as **exploratory only**; not executed as a claimed validation step in this deliverable set.
