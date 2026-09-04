# RD004-A.2 — Segment A Video ↔ Telemetry Alignment Findings

**Evidence ID:** DI-EV-0035A.2 (semantics closeout)
**Phase:** RD004-A.2 (Segment A only — departure → fuel station)
**Vehicle:** KS MX 2024 Mercedes-Benz C 63 AMG (`a60c0749-a7cd-494e-b5b9-dea3c6b97d63`, DIMO token `187336`)
**Session:** `f1e81e78-f96b-44ee-80c2-ca5270f21248`
**Mode:** Read-only offline analysis — **no production changes**

---

## Einfache Zusammenfassung (Deutsch)

### 1. Welche ursprünglichen Ergebnisse waren echt?

- **38 HF_HISTORICAL-Speed-Messpunkte** (38 unique physical), Median-Cadence **~4,73 s**, P90 **~32,7 s**, max Gap **~52,3 s**
- Keine HF-Duplikate/Stale-Holds/Out-of-Order in der qualifizierten Speed-Serie (acquisition-order geprüft)
- Legacy-Detector auf vorhandenen Segment-A-Daten: **0** Hard/Extreme/Launch/Full-Braking-Events
- Video-Uhr absolut verankert via Time.is: **03:37:46 UTC** bei Video t=0 (**VIDEO_ABSOLUTE_TIME_ANCHORED = YES**)
- Reverse im Video: **ja**; in Telemetrie: **nein** (kein HF-Gear/Ratio)
- Gear HF: **0 Beobachtungen** in Segment A

### 2. Was wurde in A.2 semantisch korrigiert (über A.1)?

| Zu stark (DI-EV-0035A.1) | Korrektur (DI-EV-0035A.2) |
|--------------------------|---------------------------|
| `VIDEO_TO_PROVIDER_OFFSET_SECONDS ≈ +22,2 s` aus Landmark H | **null** — H ist nur exploratory displacement, **NOT_A_CLOCK_OFFSET_ESTIMATE** |
| `CLOCK_FIT_ELIGIBLE_LANDMARKS = [H]` | **[]** — approximate/non-unique Landmarks dürfen keinen Provider-Clock-Offset definieren |
| `TRUE_LOCAL_PEAK_ATTENUATION_KMH` = same-timestamp delta | Unabhängige Raw- vs. Smoothed-Maxima im selben lokalen Event-Fenster (**6 Events**) |

### 3. Ist der Provider-Timestamp-Offset bewiesen?

**Nein.** **PROVIDER_TIMESTAMP_OFFSET_VALIDATED = NO**, **VIDEO_TO_PROVIDER_OFFSET_SECONDS = null**, **VIDEO_PROVIDER_ALIGNMENT_CLASS = INSUFFICIENT_EVIDENCE**.

Die Video-Zeitleiste selbst ist UTC-verankert (Time.is). Unbekannt bleibt der physische `providerTimestamp`-Offset.

Exploratory (nicht validiert): **PROVISIONAL_LANDMARK_H_DISPLACEMENT_SECONDS ≈ +22,205 s** — broad fuel-station approach, human-reviewed approximate, frame-not-exact.

### 4. Ist Clock Drift bewiesen?

**Nein.** **DRIFT_VALIDATED = NO**, **ESTIMATED_DRIFT_SECONDS_OVER_SEGMENT = null**.

### 5. Was wissen wir über die 3-Punkt-Glättung?

Zwei **getrennte** Metriken:

- **MAX_SAME_TIMESTAMP_RAW_SMOOTHED_DELTA_KMH ≈ 18,33 km/h** — gleicher `providerTimestamp`, kein Peak-Vergleich
- **TRUE_LOCAL_PEAK_ATTENUATION_KMH ≈ 10 km/h** — unabhängig lokalisierte Maxima (Raw-Peak vs. Smoothed-Peak im selben Fenster)
- **TRUE_LOCAL_PEAK_EVENT_COUNT = 6**
- **LOCAL_PEAK_TIME_SHIFT_AVAILABLE = YES** (Smoothed-Peak kann zeitlich verschoben sein)

### 6. Legacy-Detector / Gear / Reverse

Unverändert gegenüber A.1: **0** legacy hard/extreme events; **GEAR_STATE_OBSERVED = NO**; **REVERSE_TELEMETRY_SUPPORTED = NO**.

### 7. Segment B

**SEGMENT_B_PENDING = YES** — mehr frame-exakte oder high-authority Video-Landmarks nötig für Offset/Drift.

---

## Flags (A.2 corrected)

```
RD004_PHASE = A.2
RAW_SOURCE_OBSERVATIONS_CHANGED = NO
RAW_SOURCE_SHA256 = 5938b9e9120864768dd91048fb06a182ef2b7f0772a9a2df2c75f17cb684d2e2

HF_SPEED_ROWS = 38
HF_SPEED_UNIQUE_PHYSICAL_SAMPLES = 38
HF_SPEED_MEDIAN_PHYSICAL_CADENCE_SECONDS = 4.732
HF_SPEED_P90_PHYSICAL_CADENCE_SECONDS = 32.66
HF_SPEED_MAX_GAP_SECONDS = 52.283

VIDEO_ABSOLUTE_TIME_ANCHORED = YES
PROVIDER_TIMESTAMP_OFFSET_VALIDATED = NO
VIDEO_TO_PROVIDER_OFFSET_SECONDS = null
VIDEO_PROVIDER_ALIGNMENT_CLASS = INSUFFICIENT_EVIDENCE

PROVISIONAL_LANDMARK_H_DISPLACEMENT_SECONDS = 22.205
PROVISIONAL_LANDMARK_H_DISPLACEMENT_VALIDATED = NO
PROVISIONAL_LANDMARK_H_DISPLACEMENT_NOTE = NOT_A_CLOCK_OFFSET_ESTIMATE

CLOCK_FIT_ELIGIBLE_LANDMARKS = []
APPROXIMATE_NON_UNIQUE_LANDMARK_CANNOT_DEFINE_PROVIDER_CLOCK_OFFSET = YES

DRIFT_VALIDATED = NO
ESTIMATED_DRIFT_SECONDS_OVER_SEGMENT = null

PREPROCESSING_LOCAL_EVENT_METHOD = SAME_WINDOW_INDEPENDENT_RAW_AND_SMOOTHED_PEAKS
MAX_SAME_TIMESTAMP_RAW_SMOOTHED_DELTA_KMH = 18.33
TRUE_LOCAL_PEAK_ATTENUATION_KMH = 10
TRUE_LOCAL_PEAK_EVENT_COUNT = 6
LOCAL_PEAK_TIME_SHIFT_AVAILABLE = YES
TRUE_LOCAL_PEAK_ATTENUATION_DOES_NOT_USE_SAME_TIMESTAMP_PROXY = YES

GEAR_STATE_OBSERVED = NO
REVERSE_VIDEO_OBSERVED = YES
REVERSE_TELEMETRY_SUPPORTED = NO

ACCELERATION_PERCENTILE_BUG_FIXED = YES
LEGACY_HARD/EXTREME EVENTS = 0

RD004_SEGMENT_A_COMPLETE = YES
RD004_WHOLE_DRIVE_COMPLETE = NO
SEGMENT_B_PENDING = YES
PRODUCTION_SCORE_CHANGED = NO
PRODUCTION_DETECTORS_CHANGED = NO
DEPLOYED = NO
```

---

## Semantics closeout (DI-EV-0035A.2)

1. Approximate landmark H cannot populate `VIDEO_TO_PROVIDER_OFFSET_SECONDS`
2. Exploratory H displacement preserved separately with `NOT_A_CLOCK_OFFSET_ESTIMATE`
3. `CLOCK_FIT_ELIGIBLE_LANDMARKS = []` until frame-exact or high-authority video event times exist
4. True local peak attenuation uses independent raw/smoothed maxima per same local event window
5. Same-timestamp delta remains a distinct metric (`MAX_SAME_TIMESTAMP_RAW_SMOOTHED_DELTA_KMH`)

**RD003 preserved. Segment B pending. No deploy.**
