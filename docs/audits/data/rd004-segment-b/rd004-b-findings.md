# RD004-B — Segment B Video ↔ Telemetry Validation Findings

**Evidence ID:** DI-EV-0035B
**Phase:** RD004-B (post-refuel ~16:40)
**Vehicle:** KS MX 2024 Mercedes-Benz C 63 AMG (`a60c0749-a7cd-494e-b5b9-dea3c6b97d63`, DIMO token `187336`)
**Session:** `f1e81e78-f96b-44ee-80c2-ca5270f21248`
**Mode:** Read-only offline analysis — **no production changes**

---

## Einfache Zusammenfassung (Deutsch)

### 1. Wie viele echte HF-Speed-Messpunkte existieren in den 16:40?

**66** HF_HISTORICAL-Speed-Zeilen (**66** unique physical samples) im Query-Envelope `03:46–04:05 UTC`. Das ist fast doppelt so viel wie Segment A (38), aber bei ~3× längerer Fahrzeit.

### 2. Wie häufig kam tatsächlich ein neuer Speed-Wert?

Median-Cadence **~10,6 s** zwischen physischen HF-Samples (P90 **~34,7 s**, max Gap **~105,3 s**). Kein 1 Hz — deutlich lückenhafter als kontinuierliche Video-Beobachtung.

### 3. Gibt es wieder riesige Datenlücken?

Ja. Max Gap **~105 s** — schlimmer als Segment A (~52 s). LATEST_LIVE enthält zusätzlich viele stale/wiederholte Werte (separat in Signal-Cadence).

### 4. Wie gut stimmt DIMO-Speed mit dem digitalen Tacho überein?

Bei **18** akzeptierten HIGH-Confidence-Video-Ankern: **MAE ~2,3 km/h**, Median **~2 km/h**, P90 **~6 km/h**, Bias **~+0,4 km/h**, Max **~7 km/h**.

Stratifiziert: Niedrig (0–30) **~1,2 km/h**, Mittel (30–80) **~2,6 km/h**, Hoch (80+) **~3 km/h**.

**ABSOLUTE_SPEED_ACCURACY_VALIDATED = YES** (nach validiertem Provider-Offset).

### 5. Gibt es einen belastbaren providerTimestamp-Zeitversatz?

**Ja — erstmals in RD004.** Drei unabhängige Clock-Landmarks (Stop + zweiter Stop + Reverse) ergeben **~+14,3 s** mit Spread **~1,7 s**, MAD **~0,6 s**.

`PROVIDER_TIMESTAMP_OFFSET_VALIDATED = YES`
`VIDEO_TO_PROVIDER_OFFSET_SECONDS ≈ +14,299 s`

**Wichtig:** `VIDEO_ABSOLUTE_TIME_ANCHORED = YES` (Time.is) ist davon getrennt.

### 6. Gibt es über 16:40 messbaren Clock Drift?

**Nein.** `DRIFT_VALIDATED = NO` — drei Landmarks reichen für Offset, aber Drift-Residuals / Spread-Anforderungen für validierte Drift-Schätzung über ~1000 s sind nicht erfüllt.

### 7. Wird die lange 107→0-Verzögerung korrekt erkannt?

**Teilweise.** Video zeigt klare Sequenz 107→96→59→0 (t≈540–630). HF erkennt Deceleration und Null-Speed (`DECELERATION_TO_STOP_VALIDATED = PARTIAL`), aber Stop-Timing-Präzision bleibt durch sparse Cadence begrenzt (`STOP_TIMING_VALIDATED = NO`).

### 8. Werden die beiden Stop→Launch-Episoden korrekt rekonstruiert?

**Teilweise** (`STOP_LAUNCH_VALIDATED = PARTIAL`). Stop-/Launch-Formen sind in HF sichtbar, aber exakte Grenzen (z. B. 660→690, 720→750) sind bei ~10 s Median-Cadence nicht frame-genau.

### 9. Was macht die 3-Punkt-Glättung mit diesen Ereignissen?

Zwei getrennte Metriken (A.2-Methodik):
- `MAX_SAME_TIMESTAMP_RAW_SMOOTHED_DELTA_KMH ≈ 21 km/h`
- `TRUE_LOCAL_PEAK_ATTENUATION_KMH ≈ 8,7 km/h` (9 Events, unabhängige Maxima)
- `LOCAL_PEAK_TIME_SHIFT_AVAILABLE = YES`

### 10. Erzeugt der alte Detector False Positives?

**Nein** auf vorhandenen HF-Daten: **0** Hard/Extreme/Launch/Full-Braking, **0** likely false positives.

### 11. Verpasst der alte Detector offensichtliche Ereignisse?

**Möglich** (`POSSIBLE_FALSE_NEGATIVE_EVENTS = 3`): erkannte Telemetrie-Episoden (starke Decel/Launch) ohne Legacy-Detector-Alarm — konsistent mit sparse HF + konservativen Schwellen, nicht mit Video-Härte bestätigt.

### 12. Helfen RPM / throttle / TPS?

**Sekundär, teilweise.** RPM/TPS `PARTIAL` — dynamisch informativ, aber Thermal-Warmup (~52/41°C → ~88/73°C) limitiert Interpretation. Throttle `NOT_DYNAMICALLY_INFORMATIVE` im Segment.

### 13. Haben wir diesmal Gear-Telemetrie?

**Nein.** `GEAR_STATE_OBSERVED = NO` trotz exzellenter Video-Gangbeobachtungen (2–7, R). Video-Gear ist Ground Truth, Telemetrie liefert kein HF-Gear/Ratio in Segment B.

### 14. Ist Reverse diesmal telemetrisch nachweisbar?

**Nein.** Video: **0 km/h + R** bei t≈990 s (`REVERSE_VIDEO_TIME_HIGH_CONFIDENCE = YES`). Telemetrie: `REVERSE_TELEMETRY_SUPPORTED = NO` (unsigned speed, kein Gear-Signal).

### 15. War Segment A mit seiner schlechten Cadence eine Ausnahme?

**Nein.** Segment B ist **spärlicher** (`SEGMENT_A_B_CADENCE_COMPARISON = SPARSER_THAN_SEGMENT_A`): Median **10,6 s** vs A **4,7 s**, max Gap **105 s** vs **52 s**.

### 16. Welche Punkte von RD004 sind jetzt wirklich validiert?

| Bereich | Status |
|---------|--------|
| Video absolute timeline (Time.is) | **YES** |
| Provider timestamp offset (~+14,3 s) | **YES** (Segment B) |
| Absolute speed accuracy vs dashboard | **YES** (MAE ~2,3 km/h) |
| Clock drift over segment | **NO** |
| Stop timing precision | **PARTIAL** |
| Acceleration reconstruction | **PARTIAL** |
| Gear telemetry | **NO** |
| Reverse telemetry | **NO** |
| Legacy harsh detector calm-baseline | **0 events** (no FP on available data) |
| Preprocessing distortion quantified | **YES** (separate metrics) |

### 17. Welche Punkte müssen weiterhin offen bleiben?

- Drift über Gesamtfahrt
- Frame-genaue Stop/Launch-Grenzen
- Gear- und Reverse-Telemetrie
- Produktions-Kalibrierung (explizit **nicht** durchgeführt)
- Segment A Offset (bleibt unvalidiert; nur Segment B Offset validiert)

---

## Flags

```
RD004_PHASE = B
SEGMENT_B_VIDEO_START_UTC = 2026-09-04T03:47:02Z
SEGMENT_B_VIDEO_END_UTC = 2026-09-04T04:03:42Z
VIDEO_ABSOLUTE_TIME_ANCHORED = YES

HF_SPEED_ROWS = 66
HF_SPEED_UNIQUE_PHYSICAL_SAMPLES = 66
HF_SPEED_MEDIAN_PHYSICAL_CADENCE_SECONDS = 10.559
HF_SPEED_P90_PHYSICAL_CADENCE_SECONDS = 34.706
HF_SPEED_MAX_GAP_SECONDS = 105.306

EXACT_OR_HIGH_CONFIDENCE_VIDEO_SPEED_ANCHORS_ACCEPTED = 18

PROVIDER_TIMESTAMP_OFFSET_VALIDATED = YES
VIDEO_TO_PROVIDER_OFFSET_SECONDS = 14.299
OFFSET_MAD_SECONDS = 0.614

DRIFT_VALIDATED = NO
ESTIMATED_DRIFT_SECONDS_OVER_SEGMENT = null

ABSOLUTE_SPEED_ACCURACY_VALIDATED = YES
SPEED_MAE_KMH = 2.26
SPEED_MEDIAN_ABS_ERROR_KMH = 2
SPEED_P90_ABS_ERROR_KMH = 6
SPEED_BIAS_KMH = 0.37
SPEED_MAX_ABS_ERROR_KMH = 7

LOW_SPEED_MAE_KMH = 1.17
MEDIUM_SPEED_MAE_KMH = 2.57
HIGH_SPEED_MAE_KMH = 3

STOP_TIMING_VALIDATED = NO
DECELERATION_TO_STOP_VALIDATED = PARTIAL
STOP_LAUNCH_VALIDATED = PARTIAL
ACCELERATION_RECONSTRUCTION_VALIDATED = PARTIAL

MAX_SAME_TIMESTAMP_RAW_SMOOTHED_DELTA_KMH = 21
TRUE_LOCAL_PEAK_ATTENUATION_KMH = 8.67
LOCAL_PEAK_TIME_SHIFT_AVAILABLE = YES

LEGACY_HARD/EXTREME EVENTS = 0
LIKELY_FALSE_POSITIVE_EVENTS = 0
POSSIBLE_FALSE_NEGATIVE_EVENTS = 3

GEAR_STATE_OBSERVED = NO
REVERSE_TELEMETRY_SUPPORTED = NO
SEGMENT_A_B_CADENCE_COMPARISON = SPARSER_THAN_SEGMENT_A

RD004_SEGMENT_A_COMPLETE = YES
RD004_SEGMENT_B_COMPLETE = YES
RD004_WHOLE_DRIVE_EVIDENCE_ANALYZED = YES
PRODUCTION_UNCHANGED = YES
```

**Segment A evidence unchanged. No deploy.**
