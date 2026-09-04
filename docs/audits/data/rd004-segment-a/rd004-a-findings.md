# RD004-A.1 — Segment A Video ↔ Telemetry Alignment Findings

**Evidence ID:** DI-EV-0035A.1 (methodology correctness closeout)  
**Phase:** RD004-A.1 (Segment A only — departure → fuel station)  
**Vehicle:** KS MX 2024 Mercedes-Benz C 63 AMG (`a60c0749-a7cd-494e-b5b9-dea3c6b97d63`, DIMO token `187336`)  
**Session:** `f1e81e78-f96b-44ee-80c2-ca5270f21248`  
**Mode:** Read-only offline analysis — **no production changes**

---

## Einfache Zusammenfassung (Deutsch)

### 1. Welche ursprünglichen Ergebnisse waren echt?

- **38 HF_HISTORICAL-Speed-Messpunkte** (38 unique physical), Median-Cadence **~4,73 s**, P90 **~32,7 s**, max Gap **~52,3 s**
- Keine HF-Duplikate/Stale-Holds/Out-of-Order in der qualifizierten Speed-Serie (acquisition-order geprüft)
- LATEST_LIVE zeigt viele wiederholte/stale Beobachtungen (separat dokumentiert)
- Legacy-Detector auf vorhandenen Segment-A-Daten: **0** Hard/Extreme/Launch/Full-Braking-Events
- Video-Uhr absolut verankert via Time.is: **03:37:46 UTC** bei Video t=0
- Reverse im Video: **ja**; in Telemetrie: **nein** (kein HF-Gear/Ratio)
- Gear HF: **0 Beobachtungen** in Segment A

### 2. Welche Ergebnisse waren durch Analysefehler künstlich entstanden?

| Fehlerhaft (DI-EV-0035A) | Korrektur (DI-EV-0035A.1) |
|--------------------------|---------------------------|
| ~0 s Offset aus zirkulären Landmark-Matches (B,C,D,F,G) | Offset nur aus unabhängiger Video-Zeit; zirkuläre Logik entfernt |
| Drift ~−128,6 s (inkl. fehlgeschlagenem H-Match) | **DRIFT_VALIDATED = NO**, kein numerischer Drift |
| PREPROCESSING_START_SHIFT ~127,6 s | Ungültige Methode entfernt; lokale Event-Fenster oder **NOT_VALIDATED** |
| Acceleration-Median = Max (+2,63 m/s²) | Percentile-Bug behoben; Median jetzt **~−0,28 m/s²** |
| GEAR_STATE_USEFUL = PARTIAL bei 0 Samples | **NOT_OBSERVED** |
| „Plausibel ruhig“ für ±2,6/−2,8 m/s² | **VIDEO_SEVERITY_CONFIRMATION = NOT_VALIDATED** |
| Bundle-SHA = nur observations.jsonl | Kanonisches Multi-File-Manifest-SHA |

### 3. Ist 0-s-Offset wirklich bewiesen?

**Nein.** Der frühere ~0-s-Offset war ein Artefakt zirkulärer Landmark-Logik (`expectedVideoT = telemetryT`). Nach Korrektur: ein einzelner clock-fit-fähiger Landmark **H** ergibt **~+22,2 s** (PROVISIONAL_SINGLE_ANCHOR), aber **PROVIDER_TIMESTAMP_OFFSET_VALIDATED = NO**.

### 4. Ist Clock Drift bewiesen?

**Nein.** **DRIFT_VALIDATED = NO**, **ESTIMATED_DRIFT_SECONDS_OVER_SEGMENT = null**. Es fehlen ≥3 unabhängige, zuverlässige Landmarks über das Segment verteilt.

### 5. Wie viele echte HF-Speed-Samples?

**38** unique physical samples, **38** HF_HISTORICAL rows im Envelope.

### 6. Wie lückenhaft ist HF?

Median **~4,7 s** zwischen physischen Samples, P90 **~32,7 s**, max Gap **~52,3 s** — deutlich unter 1 Hz. Nur **~43 %** der HF-Paare qualifizieren sich bei 2-s-Analyse-Gate (nicht produktionsvalidiert).

### 7. Was wissen wir über die 3-Punkt-Glättung?

- **MAX_SAME_TIMESTAMP_RAW_SMOOTHED_DELTA_KMH = ~18,33 km/h** (gleicher Zeitstempel, nicht Peak-Attenuation)
- **TRUE_LOCAL_PEAK_ATTENUATION_KMH = ~18,33 km/h** an identifizierbaren lokalen Peaks
- Timing-Verschiebung: **PARTIAL** (lokale Event-Fenster); kein globaler 127-s-Shift

### 8. Was wissen wir NICHT über Gear/Reverse?

- **GEAR_STATE_OBSERVED = NO** — kein HF-Gear/Ratio in Segment A
- **REVERSE_TELEMETRY_SUPPORTED = NO** — unsigned speed reicht nicht; kein Richtungssignal
- Video zeigt Reverse und Gangwechsel, aber das ist **Video-Evidenz**, nicht Telemetrie

### 9. Legacy-Detector Fehlalarme?

**Keine** auf vorhandenen Daten (**CALM_BASELINE_FALSE_POSITIVE_CHECK = NO_FALSE_POSITIVES_OBSERVED_ON_AVAILABLE_DATA**), aber **CALM_BASELINE_COVERAGE = PARTIAL** (sparse HF limitiert Sensitivität).

### 10. Was kann Segment B zusätzlich klären?

- Mehr unabhängige Video-Landmarks für Offset/Drift-Validierung
- Längere Zeitbasis für Drift-Schätzung
- Ob HF-Cadence/Qualität über die Gesamtfahrt konsistent bleibt
- Ob Gear/RPM-Kontext in anderen Fahrtphasen verfügbar wird

---

## Flags (corrected)

```
RD004_PHASE = A.1
RAW_SOURCE_OBSERVATIONS_CHANGED = NO
RAW_SOURCE_SHA256 = 5938b9e9120864768dd91048fb06a182ef2b7f0772a9a2df2c75f17cb684d2e2

HF_SPEED_ROWS = 38
HF_SPEED_UNIQUE_PHYSICAL_SAMPLES = 38
HF_SPEED_MEDIAN_PHYSICAL_CADENCE_SECONDS = 4.732
HF_SPEED_P90_PHYSICAL_CADENCE_SECONDS = 32.66
HF_SPEED_MAX_GAP_SECONDS = 52.283

VIDEO_ABSOLUTE_TIME_ANCHORED = YES
PROVIDER_TIMESTAMP_OFFSET_VALIDATED = NO
VIDEO_TO_PROVIDER_OFFSET_SECONDS = 22.205 (PROVISIONAL_SINGLE_ANCHOR from H only; not validated)

CLOCK_FIT_ELIGIBLE_LANDMARKS = [H]
DRIFT_VALIDATED = NO
ESTIMATED_DRIFT_SECONDS_OVER_SEGMENT = null

CIRCULAR_LANDMARK_ALIGNMENT_REMOVED = YES
DUPLICATE_CLOCK_EVIDENCE_PREVENTED = YES
TEMPORAL_LOCALITY_ENFORCED = YES

ACCELERATION_PERCENTILE_BUG_FIXED = YES
ACCELERATION_GAP_THRESHOLD_STATUS = ANALYSIS_CANDIDATE_NOT_VALIDATED

PREPROCESSING_LOCAL_EVENT_METHOD = SAME_WINDOW_RAW_VS_SMOOTHED_BOUNDARIES
PREPROCESSING_TIMING_VALIDATED = PARTIAL
MAX_SAME_TIMESTAMP_RAW_SMOOTHED_DELTA_KMH = 18.33
TRUE_LOCAL_PEAK_ATTENUATION_KMH = 18.33

GEAR_STATE_OBSERVED = NO
GEAR_STATE_USEFUL_FOR_SEGMENT_A = NOT_OBSERVED

REVERSE_VIDEO_OBSERVED = YES
REVERSE_TELEMETRY_SUPPORTED = NO

LEGACY_HARD/EXTREME EVENTS = 0
CALM_BASELINE_FALSE_POSITIVE_CHECK = NO_FALSE_POSITIVES_OBSERVED_ON_AVAILABLE_DATA
CALM_BASELINE_COVERAGE = PARTIAL

CANONICAL_PATHS_REPO_RELATIVE = YES
BUNDLE_SHA256_METHOD = CANONICAL_MEMBER_HASH_MANIFEST
BUNDLE_SHA256 = 4821d45d7c5061719b595523b9c1e4f12ffafe9d9dc17b5786db0fca74668cf1

RD004_WHOLE_DRIVE_COMPLETE = NO
SEGMENT_B_PENDING = YES
PRODUCTION_UNCHANGED = YES
```

---

## Methodology corrections (DI-EV-0035A.1)

1. Removed circular clock-alignment (telemetry-derived expected video time)
2. Landmark evidence classes: VIDEO_TIMING_AUTHORITY, TELEMETRY_MATCH_CONFIDENCE, CLOCK_FIT_ELIGIBLE
3. One telemetry episode cannot count as multiple independent clock landmarks
4. Temporal locality enforced for landmarks A and H
5. Drift fit requires ≥3 independent reliable landmarks — not met
6. Percentile sorting fixed for acceleration statistics
7. Preprocessing timing uses same local event window only
8. Same-timestamp delta separated from true local peak attenuation
9. Gear usefulness: NOT_OBSERVED when zero HF samples
10. Supporting-signal usefulness requires dynamic informativeness, not just count
11. Repo-relative canonical paths; correct multi-file bundle SHA
12. Out-of-order detection uses acquisition order

**RD003 preserved. Segment B pending. No deploy.**
