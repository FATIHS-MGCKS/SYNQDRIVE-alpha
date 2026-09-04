# RD004-A — Segment A Video ↔ Telemetry Alignment Findings

**Evidence ID:** DI-EV-0035A  
**Phase:** RD004-A (Segment A only — departure → fuel station)  
**Vehicle:** KS MX 2024 Mercedes-Benz C 63 AMG (`a60c0749-a7cd-494e-b5b9-dea3c6b97d63`, DIMO token `187336`)  
**Session:** `f1e81e78-f96b-44ee-80c2-ca5270f21248`  
**Reference drive:** `DIMO_LTE_R1_REFERENCE_DRIVE_004`  
**Analysis window (telemetry envelope):** `2026-09-04T03:37:00Z` – `2026-09-04T03:45:00Z`  
**Video anchor:** `t=0` = `2026-09-04T03:37:46Z` (Time.is second-phone clock)  
**Nominal video end:** `2026-09-04T03:43:56.65Z` (~370.65 s)  
**Mode:** Read-only offline analysis — **no production changes**

---

## Einfache Zusammenfassung (Deutsch)

1. **Brauchbare HF-Daten?** Ja. Im Segment-A-Fenster liegen **38 HF_HISTORICAL-Speed-Messpunkte** vor (`03:37:44Z`–`03:43:53Z`), ohne Duplikate, Stale-Holds oder Out-of-Order in der qualifizierten Serie.

2. **Physischer Speed-Takt?** Median **~4,7 s** zwischen neuen physischen HF-Speed-Samples (P90 **~32,7 s**, max Gap **~52,3 s**). Das ist **nicht 1 Hz** — nur ~38 echte Messpunkte über ~6 Minuten.

3. **Speed-Verlauf vs. Video?** **Grundsätzlich ja** unter PROVISIONAL_ZERO_OFFSET_PROJECTION: lange frühe Stillstände, ruhige Beschleunigungen, Verzögerungen, Stopps und ein später Anfahren bis ~44 km/h passen zur menschlich beschriebenen ruhigen Stadt-/Tankstellen-Anfahrt. Absolute Geschwindigkeitsgenauigkeit ist **nicht** validiert (keine frame-exakten Video-OCR-Anker).

4. **Konstanter Zeitversatz?** Für die **Mitte/Ende** des Segments (Landmarks B, C, D, F, G) liegt der provisorische Offset bei **~0 s** relativ zum Time.is-Anker — **STABLE_OFFSET** für diese Episoden. Landmark A (frühes Rückwärts) zeigt **~-10 s**; Landmark H (Tankstellen-Anfahrt) ist **nicht zuverlässig gematcht** → Gesamtklassifikation **AMBIGUOUS_ALIGNMENT** / **POSSIBLE_DRIFT** wenn alle Landmarks einbezogen werden.

5. **Drift innerhalb 6 Minuten?** **Nicht final beweisbar.** Lineares Konzeptmodell über alle gematchten Landmarks ergibt **PARTIAL** mit großer negativer Drift-Schätzung, stark verzerrt durch den fehlgeschlagenen Landmark-H-Match. **DRIFT_VALIDATED = NO** für Segment-A allein empfohlen; Segment B bleibt pending.

6. **Speed-Fehler an lesbaren Videoankern?** **Nicht messbar** — `EXACT_VIDEO_SPEED_ANCHORS = 0`, `ABSOLUTE_SPEED_ACCURACY_VALIDATED = NO`.

7. **Ruhige Beschleunigungen?** Qualifizierte HF-Paare zeigen max **~+2,6 m/s²** — plausibel ruhig; keine Legacy-Hard/Extreme-Accel-Events.

8. **Ruhige Verzögerungen?** Max **~-2,8 m/s²** auf qualifizierten Paaren — ebenfalls ruhig; keine Hard/Extreme-Braking-Events. Kinematische Verzögerung ≠ Reibungsbremsung.

9. **Legacy-Detector False Positives?** **Keine** Hard/Extreme/Launch/Full-Braking-Events auf Segment A (`LIKELY_FALSE_POSITIVE_EVENTS = 0`). Calm-Baseline-Kontrolle **PARTIAL** bestätigt (keine Fehlalarme, aber sparse HF limitiert Sensitivität).

10. **3-Punkt-Glättung?** Peak-Dämpfung bis **~18,3 km/h** beobachtet; Event-Timing-Verschiebung auf sparse HF **nicht zuverlässig messbar** (`NOT_MEASURED_SPARSE_CADENCE`).

11. **RPM / Throttle / TPS / Gear?** RPM, Throttle, TPS **nützlich mit Gating** (27 HF-Samples, gleiche Cadence wie Speed). Gear **PARTIAL** — frühe Reverse-Phase ohne Gear-HF-Daten.

12. **Reverse im Telemetrie-Kontext?** **NEIN** — `REVERSE_TELEMETRY_SUPPORTED = NO` (keine Gear/Ratio-HF in den ersten ~30 s; unsigned speed allein reicht nicht).

13. **Ausdrücklich offen:** Absolute Speed-Genauigkeit; finale Clock-Drift; Landmark E (stabile ~52–56 km/h); Reverse-Bestätigung; S1–S13-Gesamtfahrt; Segment B (~16:40); Produktionskalibrierung.

---

## Phase 1 — Raw telemetry sealed

| Source | SHA256 |
|--------|--------|
| `source-observations.jsonl` | `5938b9e9120864768dd91048fb06a182ef2b7f0772a2df2c75f17cb684d2e2` |
| Envelope rows (03:37–03:45 UTC) | 1057 |

Surfaces preserved separately — **not merged**.

## Phase 2 — Signal inventory (HF_HISTORICAL highlights)

| Signal | Rows | Unique physical | Median cadence | Max gap |
|--------|------|-----------------|----------------|---------|
| speed | 38 | 38 | 4.732 s | 52.283 s |
| powertrainCombustionEngineSpeed | 27 | 27 | 4.732 s | 52.283 s |
| obdThrottlePosition | 27 | 27 | 4.732 s | 52.283 s |
| powertrainCombustionEngineTPS | 27 | 27 | 4.732 s | 52.283 s |
| obdEngineLoad | 27 | 27 | 4.732 s | 52.283 s |
| powertrainTransmissionActualGear | 0 | — | — | — |
| powertrainTransmissionActualGearRatio | 0 | — | — | — |

LATEST_LIVE speed: 105 rows / 35 unique physical (70 duplicates, 15 stale holds).

## Phase 3–4 — Qualified HF speed + provisional projection

- 38 qualified points, 0 duplicate/stale/out-of-order exclusions in final series
- `PROVISIONAL_ZERO_OFFSET_PROJECTION` applied — not claimed as final alignment

## Phase 5–7 — Landmarks & clock

See `rd004-a-video-clock-alignment.json`. Key matches under zero-offset anchor:

| ID | Event | Telemetry shape | Offset (s) |
|----|-------|-----------------|------------|
| B | Decel ~41→0 | 31→4 km/h / 27 s | 0 |
| C | Prolonged stop | ~96 s at 0 km/h | 0 |
| D | Launch 0→56 | 0→44 km/h / 31 s | 0 |
| F | Decel ~55→0 | 31→3 km/h / 15 s | 0 |
| A | Early reverse/low | 0 km/h @ t≈-1.9 s | -9.9 |
| E | Stable cruise | NOT_FOUND | — |
| H | Fuel approach | WEAK match | -341.9 |

**VIDEO_TO_PROVIDER_OFFSET_SECONDS (median):** 0  
**OFFSET_MAD_SECONDS:** 0 (among matched offsets with spread driven by H outlier)

## Phase 8 — Absolute speed

`ABSOLUTE_SPEED_ACCURACY_VALIDATED = NO` — no frame-exact digital speed OCR in this phase.

## Phase 9 — Acceleration reconstruction

- **QUALIFIED_ACCELERATION_PAIR_FRACTION:** 0.43 (16/37 pairs; gaps >2 s rejected)
- Max positive: **+2.63 m/s²**
- Max negative: **-2.78 m/s²**
- No extreme dynamics inconsistent with calm video

## Phase 10 — Legacy detector audit (offline)

All counts **0** — no hard/extreme accel/brake, no launch-like, no full braking, no likely false positives.

## Phase 11 — Preprocessing filter response

- Peak attenuation: **18.33 km/h**
- Event timing shift: **not measured** (sparse cadence)
- False event creation/suppression: **not measured**

## Phase 12 — Supporting signals

RPM/throttle/TPS useful with gating; gear weak/absent on HF for this window. Thermal warmup note preserved (~24°C → ~47/39°C video observation).

## Phase 13 — Reverse

`REVERSE_VIDEO_OBSERVED = YES`  
`REVERSE_TELEMETRY_SUPPORTED = NO`

---

## Flags (summary)

```
RD004_PHASE = A
RD004_SEGMENT_A_VIDEO_START_UTC = 2026-09-04T03:37:46.000Z
RD004_SEGMENT_A_VIDEO_END_UTC = 2026-09-04T03:43:56.650Z
HF_HISTORICAL_AVAILABLE = YES
HF_SPEED_ROWS = 38
HF_SPEED_UNIQUE_PHYSICAL_SAMPLES = 38
HF_SPEED_MEDIAN_PHYSICAL_CADENCE_SECONDS = 4.732
HF_SPEED_P90_PHYSICAL_CADENCE_SECONDS = 32.66
HF_SPEED_MAX_GAP_SECONDS = 52.283
DUPLICATE_SPEED_SAMPLES = 0
STALE_HOLD_SPEED_SAMPLES = 0
OUT_OF_ORDER_SPEED_SAMPLES = 0
VIDEO_PROVIDER_ALIGNMENT_CLASS = POSSIBLE_DRIFT
VIDEO_TO_PROVIDER_OFFSET_SECONDS = 0
OFFSET_MAD_SECONDS = 0
DRIFT_VALIDATED = PARTIAL
ESTIMATED_DRIFT_SECONDS_OVER_SEGMENT = -128.56
EXACT_VIDEO_SPEED_ANCHORS = 0
ABSOLUTE_SPEED_ACCURACY_VALIDATED = NO
QUALIFIED_ACCELERATION_PAIR_FRACTION = 0.43
LEGACY_HARD_ACCEL_EVENTS = 0
LEGACY_EXTREME_ACCEL_EVENTS = 0
LEGACY_HARD_BRAKING_EVENTS = 0
LEGACY_EXTREME_BRAKING_EVENTS = 0
LEGACY_LAUNCH_LIKE_EVENTS = 0
LEGACY_FULL_BRAKING_EVENTS = 0
LIKELY_FALSE_POSITIVE_EVENTS = 0
REVERSE_TELEMETRY_SUPPORTED = NO
CALM_BASELINE_VALIDATED = PARTIAL
RD004_SEGMENT_A_COMPLETE = YES
RD004_WHOLE_DRIVE_COMPLETE = NO
SEGMENT_B_PENDING = YES
PRODUCTION_SCORE_CHANGED = NO
PRODUCTION_DETECTORS_CHANGED = NO
DEPLOYED = NO
READY_FOR_RD004_SEGMENT_B = YES
```

---

## Artifacts

| File | Purpose |
|------|---------|
| `rd004-a-session-summary.json` | Session + flags |
| `rd004-a-raw-speed-series.json` / `.csv` | Qualified HF speed |
| `rd004-a-signal-cadence.json` | Per-signal/surface cadence |
| `rd004-a-video-clock-alignment.json` | Landmarks + clock/drift |
| `rd004-a-speed-comparison.json` | Speed anchor classes |
| `rd004-a-kinematic-reconstruction.json` | Acceleration pairs |
| `rd004-a-legacy-detector-audit.json` | Offline detector audit |
| `rd004-a-preprocessing-response.json` | Raw vs 3-point |
| `rd004-a-supporting-signals.json` | RPM/throttle/TPS/gear |
| `rd004-a-reverse-validation.json` | Reverse check |

**RD003 preserved. No production deployment.**
