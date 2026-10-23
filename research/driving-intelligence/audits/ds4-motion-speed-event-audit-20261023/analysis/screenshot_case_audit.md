# Screenshot-Fälle 19:04 UTC — Rekonstruktion auf gepinnten Daten

Vehicle `19fedd4b-c4e8-4de8-a125-dab293326e7e` · Trip `98d2a8e0-8b7d-4529-bf76-acee44d61fbe` · Motion-Run `8ec6306e-606b-4507-ab03-ea058c5d810d`
Snapshot `DI_V0_S4_EVIDENCE_V1:sha256:22e2a662af3a07458e5713bd004f563e9d038c86fb89f3353d39b8e7ea3504b3` · Trip-Ende 2026-10-22T19:04:53.233Z · Video 2026-10-22T18:38:34Z–2026-10-22T19:03:02Z

| Screenshot | Event (UTC) | UI-Text (beobachtet) | Legacy-Formatter reproduziert | Prototyp-Anzeige | Ø m/s² | Dauer | Video | Verdict |
|---|---|---|---|---|---|---|---|---|
| IMG_7778 | DECELERATION 19:04:26–19:04:29 | `35 → 6 km/h (+29)` | ja | `35 → 6 km/h (−29)` | -2.7 | 3 s | NOT_VIDEO_COVERED | PLAUSIBLE_MAGNITUDE_UNCERTAIN_TIMING_DISPLAY_BUG |
| IMG_7779 | DECELERATION 19:04:39–19:04:42 | `98 → 69 km/h (+30)` | ja | `98 → 69 km/h (−29)` | -2.73 | 3 s | NOT_VIDEO_COVERED | PLAUSIBLE_EVENT_DISPLAY_BUG |
| IMG_7780 | ACCELERATION 19:04:49–19:04:52 | `52 → 142 km/h (+90)` | ja | `52 → 142 km/h (+90)` | 8.31 | 3 s | NOT_VIDEO_COVERED | MEASUREMENT_ARTEFACT_NOT_DRIVER_BEHAVIOUR |
| IMG_7781 | ACCELERATION 19:04:34–19:04:38 | `6 → 100 km/h (+95)` | ja | `6 → 100 km/h (+95)` | 6.57 | 4 s | NOT_VIDEO_COVERED | MEASUREMENT_ARTEFACT_NOT_DRIVER_BEHAVIOUR |

## IMG_7778 — DECELERATION 2026-10-22T19:04:26Z–2026-10-22T19:04:29Z

Frontend-Event-ID: `motion-ev-17-2026-10-22T19:04:26Z` · Qualität: `DEGRADED` · Flags: `L3_DIRECT, L3_LEG_TIMING_SUSPECT_FALLBACK_ROBUST, L3_SUPPORT_MISSING_FALLBACK_ROBUST, TIMING_JITTER_SUSPECT_IN_WINDOW`

Befunde:
- DISPLAY_SIGN_BUG: deltaKmh persisted as unsigned magnitude; popover forced "+" prefix (braking shown as gain)
- TIMING_JITTER: C4 marked buckets JITTER_SUSPECT (label-gap vs. fix-cadence mismatch) — speeds in window are 1-s-label artefacts
- TRIP_END_EDGE: event ends 24.2 s before trip end (2026-10-22T19:04:53.233Z); no forward support
- LEG_GAP: max positioned-leg label gap 2 s inside window

| Label | im Event | C4 km/h | C4-Qualität | FSM | Position | Leg-Gap s | Chord m | implizit km/h |
|---|---|---|---|---|---|---|---|---|
| 19:04:23 |  | 34.9 | SPARSE_SUPPORT | MOVING | PRESENT | 2 | 15 | 27 |
| 19:04:24 |  | 38.2 | SPARSE_SUPPORT | MOVING | PRESENT | 1 | 14.1 | 50.6 |
| 19:04:25 |  | — | NO_POSITION | MOVING | ROW_ABSENT | — | — | — |
| 19:04:26 | ● | 34.7 | JITTER_SUSPECT | MOVING | PRESENT | 2 | 17.8 | 32 |
| 19:04:27 | ● | 28.1 | JITTER_SUSPECT | MOVING | PRESENT | 1 | 11.7 | 42.2 |
| 19:04:28 | ● | 19.3 | OK | MOVING | PRESENT | 1 | 8.1 | 29.3 |
| 19:04:29 | ● | 5.5 | OK | MOVING | PRESENT | 1 | 2.6 | 9.3 |
| 19:04:30 |  | 4.3 | SPARSE_SUPPORT | STOP_CANDIDATE | PRESENT | 1 | 0.5 | 1.7 |
| 19:04:31 |  | — | NO_POSITION | STOP_CANDIDATE | ROW_ABSENT | — | — | — |
| 19:04:32 |  | 4.3 | SPARSE_SUPPORT | STATIONARY | PRESENT | 2 | 2.2 | 3.9 |

## IMG_7779 — DECELERATION 2026-10-22T19:04:39Z–2026-10-22T19:04:42Z

Frontend-Event-ID: `motion-ev-19-2026-10-22T19:04:39Z` · Qualität: `LIMITED` · Flags: `L3_DIRECT, L3_SUPPORT_MISSING_FALLBACK_ROBUST`

Befunde:
- DISPLAY_SIGN_BUG: deltaKmh persisted as unsigned magnitude; popover forced "+" prefix (braking shown as gain)
- POSITION_GAP: 1 ROW_ABSENT bucket(s) inside the event window (sub-1 Hz fix cadence)
- SPARSE_ENDPOINTS: 1/2 endpoint bucket(s) with MIN_SUPPORT_3_POINTS / SPARSE_SUPPORT
- TRIP_END_EDGE: event ends 11.2 s before trip end (2026-10-22T19:04:53.233Z); no forward support
- LEG_GAP: max positioned-leg label gap 2 s inside window

| Label | im Event | C4 km/h | C4-Qualität | FSM | Position | Leg-Gap s | Chord m | implizit km/h |
|---|---|---|---|---|---|---|---|---|
| 19:04:36 |  | 54.1 | SPARSE_SUPPORT | MOVING | PRESENT | 2 | 4.1 | 7.4 |
| 19:04:37 |  | — | OUTLIER_REJECTED | MOVING | PRESENT | 1 | 17.6 | 63.3 |
| 19:04:38 |  | 100.1 | SPARSE_SUPPORT | MOVING | PRESENT | 1 | 38.6 | 139.1 |
| 19:04:39 | ● | 98.2 | OK | MOVING | PRESENT | 1 | 28 | 100.8 |
| 19:04:40 | ● | 87.0 | SPARSE_SUPPORT | MOVING | PRESENT | 1 | 26.5 | 95.6 |
| 19:04:41 | ● | — | NO_POSITION | MOVING | ROW_ABSENT | — | — | — |
| 19:04:42 | ● | 68.6 | SPARSE_SUPPORT | MOVING | PRESENT | 2 | 32.6 | 58.7 |
| 19:04:43 |  | 73.5 | OK | MOVING | PRESENT | 1 | 21.1 | 75.8 |
| 19:04:44 |  | 70.0 | OK | MOVING | PRESENT | 1 | 19.8 | 71.1 |
| 19:04:45 |  | 69.8 | OK | MOVING | PRESENT | 1 | 19.1 | 68.9 |

## IMG_7780 — ACCELERATION 2026-10-22T19:04:49Z–2026-10-22T19:04:52Z

Frontend-Event-ID: `motion-ev-20-2026-10-22T19:04:49Z` · Qualität: `DEGRADED` · Flags: `L3_LEG_TIMING_SUSPECT_FALLBACK_ROBUST, L3_SUPPORT_MISSING_FALLBACK_ROBUST, MIN_SUPPORT_3_POINTS, TIMING_JITTER_SUSPECT_IN_WINDOW`

Befunde:
- KINEMATIC_IMPLAUSIBLE: mean 8.31 m/s² exceeds passenger-car envelope (|a| > 5 m/s²)
- TIMING_JITTER: C4 marked buckets JITTER_SUSPECT (label-gap vs. fix-cadence mismatch) — speeds in window are 1-s-label artefacts
- POSITION_GAP: 1 ROW_ABSENT bucket(s) inside the event window (sub-1 Hz fix cadence)
- SPARSE_ENDPOINTS: 2/2 endpoint bucket(s) with MIN_SUPPORT_3_POINTS / SPARSE_SUPPORT
- TRIP_END_EDGE: event ends 1.2 s before trip end (2026-10-22T19:04:53.233Z); no forward support
- LEG_GAP: max positioned-leg label gap 2 s inside window

| Label | im Event | C4 km/h | C4-Qualität | FSM | Position | Leg-Gap s | Chord m | implizit km/h |
|---|---|---|---|---|---|---|---|---|
| 19:04:46 |  | 65.5 | SPARSE_SUPPORT | MOVING | PRESENT | 1 | 19.7 | 70.8 |
| 19:04:47 |  | — | NO_POSITION | MOVING | ROW_ABSENT | — | — | — |
| 19:04:48 |  | 61.8 | SPARSE_SUPPORT | MOVING | PRESENT | 2 | 30.3 | 54.6 |
| 19:04:49 | ● | 52.3 | SPARSE_SUPPORT | MOVING | PRESENT | 1 | 21.1 | 76.1 |
| 19:04:50 | ● | — | NO_POSITION | MOVING | ROW_ABSENT | — | — | — |
| 19:04:51 | ● | 103.0 | JITTER_SUSPECT | MOVING | PRESENT | 2 | 22.5 | 40.4 |
| 19:04:52 | ● | 142.1 | JITTER_SUSPECT | MOVING | PRESENT | 1 | 47 | 169.4 |
| 19:04:53 |  | — | NO_SUPPORT | MOVING | PRESENT | 1 | 31.9 | 114.8 |
| 19:04:54 |  | — | — | — | — | — | — | — |
| 19:04:55 |  | — | — | — | — | — | — | — |

## IMG_7781 — ACCELERATION 2026-10-22T19:04:34Z–2026-10-22T19:04:38Z

Frontend-Event-ID: `motion-ev-18-2026-10-22T19:04:34Z` · Qualität: `LIMITED` · Flags: `L3_SUPPORT_MISSING_FALLBACK_ROBUST, MIN_SUPPORT_3_POINTS`

Befunde:
- KINEMATIC_IMPLAUSIBLE: mean 6.57 m/s² exceeds passenger-car envelope (|a| > 5 m/s²)
- POSITION_GAP: 1 ROW_ABSENT bucket(s) inside the event window (sub-1 Hz fix cadence)
- SPARSE_ENDPOINTS: 2/2 endpoint bucket(s) with MIN_SUPPORT_3_POINTS / SPARSE_SUPPORT
- TRIP_END_EDGE: event ends 15.2 s before trip end (2026-10-22T19:04:53.233Z); no forward support
- LEG_GAP: max positioned-leg label gap 2 s inside window

| Label | im Event | C4 km/h | C4-Qualität | FSM | Position | Leg-Gap s | Chord m | implizit km/h |
|---|---|---|---|---|---|---|---|---|
| 19:04:31 |  | — | NO_POSITION | STOP_CANDIDATE | ROW_ABSENT | — | — | — |
| 19:04:32 |  | 4.3 | SPARSE_SUPPORT | STATIONARY | PRESENT | 2 | 2.2 | 3.9 |
| 19:04:33 |  | 4.7 | OK | STATIONARY | PRESENT | 1 | 1.2 | 4.4 |
| 19:04:34 | ● | 5.5 | SPARSE_SUPPORT | STARTING | PRESENT | 1 | 1.4 | 5 |
| 19:04:35 | ● | — | NO_POSITION | STOP_CANDIDATE | ROW_ABSENT | — | — | — |
| 19:04:36 | ● | 54.1 | SPARSE_SUPPORT | MOVING | PRESENT | 2 | 4.1 | 7.4 |
| 19:04:37 | ● | — | OUTLIER_REJECTED | MOVING | PRESENT | 1 | 17.6 | 63.3 |
| 19:04:38 | ● | 100.1 | SPARSE_SUPPORT | MOVING | PRESENT | 1 | 38.6 | 139.1 |
| 19:04:39 |  | 98.2 | OK | MOVING | PRESENT | 1 | 28 | 100.8 |
| 19:04:40 |  | 87.0 | SPARSE_SUPPORT | MOVING | PRESENT | 1 | 26.5 | 95.6 |
| 19:04:41 |  | — | NO_POSITION | MOVING | ROW_ABSENT | — | — | — |

## Alle 21 persistierten Events — Anzeige vorher/nachher

| # | Art | UTC | Legacy-Anzeige | Prototyp-Anzeige | Ø m/s² | Qualität | implausibel | Video |
|---|---|---|---|---|---|---|---|---|
| 0 | ACCEL | 18:31:33–18:31:36 | `32 → 49 km/h (+17)` | `32 → 49 km/h (+17)` | 1.54 | OK |  |  |
| 1 | DECEL | 18:33:04–18:33:08 | `29 → 6 km/h (+23)` | `29 → 6 km/h (−23)` | -1.58 | OK |  |  |
| 2 | ACCEL | 18:33:49–18:33:51 | `6 → 17 km/h (+11)` | `6 → 17 km/h (+11)` | 1.53 | OK |  |  |
| 3 | DECEL | 18:38:25–18:38:30 | `33 → 5 km/h (+28)` | `33 → 5 km/h (−28)` | -1.57 | OK |  |  |
| 4 | ACCEL | 18:43:05–18:43:08 | `3 → 21 km/h (+17)` | `3 → 21 km/h (+17)` | 1.61 | OK |  | ja |
| 5 | DECEL | 18:43:58–18:44:02 | `29 → 6 km/h (+22)` | `29 → 6 km/h (−22)` | -1.56 | OK |  | ja |
| 6 | ACCEL | 18:45:24–18:45:28 | `44 → 72 km/h (+28)` | `44 → 72 km/h (+28)` | 1.96 | OK |  | ja |
| 7 | DECEL | 18:46:44–18:46:46 | `58 → 48 km/h (+11)` | `58 → 48 km/h (−11)` | -1.47 | OK |  | ja |
| 8 | ACCEL | 18:47:00–18:47:04 | `49 → 81 km/h (+31)` | `49 → 81 km/h (+31)` | 2.18 | OK |  | ja |
| 9 | DECEL | 18:47:42–18:47:47 | `34 → 7 km/h (+28)` | `34 → 7 km/h (−27)` | -1.53 | OK |  | ja |
| 10 | ACCEL | 18:49:12–18:49:18 | `67 → 1931 km/h (+1864)` | `67 → 1931 km/h (+1864)` | 86.27 | DEGRADED | **ja** | ja |
| 11 | DECEL | 18:58:16–18:58:20 | `40 → 9 km/h (+31)` | `40 → 9 km/h (−31)` | -2.16 | OK |  | ja |
| 12 | ACCEL | 18:58:22–18:58:25 | `9 → 25 km/h (+17)` | `9 → 25 km/h (+17)` | 1.53 | OK |  | ja |
| 13 | ACCEL | 18:59:00–18:59:04 | `7 → 46 km/h (+39)` | `7 → 46 km/h (+39)` | 2.68 | OK |  | ja |
| 14 | ACCEL | 18:59:27–18:59:29 | `40 → 58 km/h (+17)` | `40 → 58 km/h (+17)` | 2.36 | OK |  | ja |
| 15 | DECEL | 18:59:37–18:59:40 | `38 → 19 km/h (+19)` | `38 → 19 km/h (−18)` | -1.71 | OK |  | ja |
| 16 | DECEL | 18:59:59–19:00:01 | `20 → 7 km/h (+13)` | `20 → 7 km/h (−13)` | -1.76 | OK |  | ja |
| 17 | DECEL | 19:04:26–19:04:29 | `35 → 6 km/h (+29)` | `35 → 6 km/h (−29)` | -2.7 | DEGRADED |  |  |
| 18 | ACCEL | 19:04:34–19:04:38 | `6 → 100 km/h (+95)` | `6 → 100 km/h (+95)` | 6.57 | LIMITED | **ja** |  |
| 19 | DECEL | 19:04:39–19:04:42 | `98 → 69 km/h (+30)` | `98 → 69 km/h (−29)` | -2.73 | LIMITED |  |  |
| 20 | ACCEL | 19:04:49–19:04:52 | `52 → 142 km/h (+90)` | `52 → 142 km/h (+90)` | 8.31 | DEGRADED | **ja** |  |

## „0 Ereignisse“

- Beobachtung: TripMapSummaryOverlay shows "0 Ereignisse" while 21 motion markers are rendered
- Ursache: countTripEvents(trip) reads legacy VehicleTrip counters (totalAccelerationEvents/totalBrakingEvents/abuseEvents or harsh*Count) — the S4 Motion shadow payload (payload.events, n=21) is a separate read path (motion-map payload) and was never fed into the HUD.
- Prototyp: TripsMapCard passes motionEventCount={motionMapPayload.events.length} when the motion map is active; TripMapSummaryOverlay renders trips.motionMap.summaryEvents instead of the legacy counter.

## POSITION-Kanal Kadenz (ganze Fahrt)

- Availability: `{"ROW_ABSENT":89,"PRESENT":2005}`
- Label-Gap-Histogramm positionierter Legs: `{"1":1980,"2":14,"3":6,"7":1,"8":1,"20":1,"30":1}`
