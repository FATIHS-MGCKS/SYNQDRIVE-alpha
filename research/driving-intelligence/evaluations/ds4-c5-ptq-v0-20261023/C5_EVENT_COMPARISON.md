# C5 vs C4 — manoeuvre events (detector unchanged, speed series swapped)

Detector: `detectMotionManoeuvreEvents` + `MOTION_EVENT_V0_2_CANDIDATE_OPTIONS`.  
C4 usable qualities: production guard set (`OK`, `SPARSE_SUPPORT`, `JITTER_SUSPECT`, …).  
C5 usable qualities (research): `OK`, `REPAIRED`, `SPARSE_SUPPORT`.

## TES16

| | C4 | C5 |
| --- | --- | --- |
| ACCEL 03:50:20–03:50:23 | **Present** (Δv 35.2 km/h, DEGRADED) | **Absent** |
| Other events in video window | unchanged count in pooled view | no extra accepted events added |

**Interpretation:** The targeted false acceleration is removed without introducing a replacement event in the same window. Full oracle/T2 scoring remains in the accel-brake eval package; this run only asserts the known false alarm cleared.

## TIG22 — 19:04 UTC (no video ground truth)

| Event (C4) | C5 |
| --- | --- |
| ACCEL 19:04:34–38 (5.5→100.1) | Not emitted (speeds largely `NO_SUPPORT` / quarantined in window) |
| DECEL 19:04:39–42 | Not emitted |
| ACCEL 19:04:49–52 (52.3→142.1) | Not emitted |

Per tasking: **not** auto-classified as false alarms or hits. `:37` remains `OUTLIER_REJECTED` under both C4 and C5 (hard quarantine parity — geometric outlier gate, not PTQ cross-track).

## Motion claims (speed thresholds)

See `outputs/*_motion_events.json`. On TES16/TIG22 video-readable seconds:

- No increase in `falseMotionInConfirmedStill` for C5 vs C4.
- No increase in `falseStillInConfirmedMotion` for C5 vs C4.

(TES21 drives: C5 loses numeric coverage; motion claims often `NONE` — counted as coverage loss, not a motion-classification regression on paired seconds.)
