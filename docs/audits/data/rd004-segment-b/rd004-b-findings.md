# RD004-B.1 — Segment B Independent Clock Calibration + Holdout Speed Accuracy Closeout

**Evidence ID:** DI-EV-0035B.1
**Phase:** RD004-B.1 (post-refuel ~16:40)
**Vehicle:** KS MX 2024 Mercedes-Benz C 63 AMG (`a60c0749-a7cd-494e-b5b9-dea3c6b97d63`, DIMO token `187336`)
**Session:** `f1e81e78-f96b-44ee-80c2-ca5270f21248`
**Mode:** Read-only offline analysis — **no production changes**

---

## Einfache Zusammenfassung (Deutsch)

### 1. Was war an der ersten B-Auswertung methodisch gekoppelt?

DI-EV-0035B hat für jeden Videoanker zuerst per **Speed-Ähnlichkeit + Zeit** den besten HF-Sample gewählt (`score = -Δspeed - 0.25·Δtime`). Derselbe Sample wurde danach für **Offset-Schätzung** und **Speed-MAE** wiederverwendet. Das ist **Selection Bias / Double Dipping**: Ein Punkt wird nicht unabhängig gewählt, nur weil er zeitlich passt, sondern weil seine Geschwindigkeit dem Tacho ähnelt — und genau dieser Sample „beweist“ dann die Genauigkeit.

### 2. Bleibt ~14 s ein plausibler Kandidat?

**Ja, als unterstützender Kandidat.** Die globale Kalibrierungssuche (−60…+60 s, nur Zeit-Matching auf Kalibrierungs-Landmarks) ergibt **~+13,5 s** (`OFFSET_CANDIDATE_AROUND_14_SECONDS = SUPPORTIVE_ONLY`). Das liegt nahe am explorativen DI-EV-0035B-Wert **~+14,299 s**, der als **nicht-kanonisch** erhalten bleibt.

### 3. Ist ~14 s jetzt wirklich validiert oder nicht?

**Nein.** `PROVIDER_TIMESTAMP_OFFSET_VALIDATED = NO`, `VIDEO_TO_PROVIDER_OFFSET_SECONDS = null`. Nur **ein** event-shape-qualifizierter Kalibrierungs-Landmark (CLK-B2 Stop-Transition) ist clock-fit-eligible; das reicht nicht für die Validierungskriterien (≥3 unabhängige Transition-Landmarks, Spread/MAD-Gates). Wissenschaftlich korrekt: lieber **unvalidiert** als scheinbar beweisen.

### 4. Ist die alte MAE ~2,3 km/h belastbar?

**Nein.** `PREVIOUS_SPEED_ACCURACY_METHOD_SELECTION_BIASED = YES`. Die ~2,263 km/h (`EXPLORATORY_PREVIOUS_SPEED_MAE_KMH`) bleiben als **explorativer, nicht-kanonischer** Referenzwert dokumentiert (`NOT_CANONICAL_VALIDATION_RESULT = YES`), dürfen aber **nicht** als absolute Ground-Truth-Genauigkeit gelten.

### 5. Wie hoch ist Speed-MAE nach unabhängiger Holdout-Auswertung?

Bei eingefrorenem Kalibrierungs-Offset **~+13,5 s** (supportive only), **zeit-only** Matching auf 17 Holdout-Anker:

| Kennzahl | Wert |
|----------|------|
| Holdout-Anker gesamt | 17 |
| Zeitlich vergleichbar (headline-tauglich) | **5** |
| Abgelehnt (Zeitresidual zu groß) | **12** |
| Diagnostische Holdout-MAE (nicht kanonisch, Offset nicht validiert) | **~13,8 km/h** |
| Kanonische `SPEED_MAE_KMH` | **null** (`ABSOLUTE_SPEED_ACCURACY_VALIDATED = NO`) |

Die diagnostische MAE betrifft vor allem **dynamische** Zustände (strengeres ≤2 s-Fenster); stabile Cruise-Anker scheitern meist am HF-Abstand.

### 6. Wie viele Videoanker haben überhaupt einen zeitlich nahen HF-Sample?

Bei supportive Offset **~13,5 s** (zeit-only):

| Temporal-Residual | Anker |
|-------------------|-------|
| ≤ 1 s | 2 |
| ≤ 2 s | 5 |
| ≤ 5 s | 7 |
| > 5 s | 10 |

Nur **5** Anker erfüllen die strengeren Holdout-Kriterien für headline-taugliche Vergleiche.

### 7. Wie stark begrenzt die 10,6-s Median-Cadence unsere Speed-Genauigkeit?

**Stark.** Median **~10,559 s** zwischen physischen HF-Samples (P90 **~34,7 s**, max Gap **~105,3 s**). Bei dynamischen Fahrzuständen (107→96→59→0) kann der zeitlich nächste HF-Punkt **mehrere Sekunden** vom Video-Snapshot entfernt sein — dann wird er korrekt als `REJECTED_TIME_DISTANCE` oder `NO_COMPARABLE_PHYSICAL_SAMPLE` klassifiziert statt eine irreführende MAE zu erzeugen.

### 8. Was wissen wir sicher über Gear/Reverse?

| Thema | Status |
|-------|--------|
| Video-Gangbeobachtung | Stark (Gänge 2–7, R bei t≈990 s) |
| `GEAR_STATE_OBSERVED` | **NO** (kein HF-Gear/Ratio in Segment B) |
| `REVERSE_VIDEO_OBSERVED` | **YES** |
| `REVERSE_TELEMETRY_SUPPORTED` | **NO** (unsigned speed, keine Richtung) |
| CLK-B7 Reverse als Clock-Landmark | **Ausgeschlossen** — ohne Richtungstelemetrie kein Clock-Offset |

### 9. Was wissen wir sicher über Legacy Detector?

| Kennzahl | Wert |
|----------|------|
| Legacy Hard/Extreme Events | **0** |
| Likely False Positives | **0** |
| `VIDEO_OR_KINEMATIC_DYNAMIC_EPISODES_WITHOUT_LEGACY_EVENT` | **3** |
| `LEGACY_FALSE_NEGATIVE_VALIDATED` | **NO** |

Die 3 Episoden sind **Telemetrie-Kinematik ohne Legacy-Alarm** — das beweist **keinen** Detector-False-Negative ohne unabhängigen Ground-Truth-Event-Klassen-Nachweis.

### 10. Welche RD004-Fragen sind jetzt wirklich abgeschlossen?

**Abgeschlossen / belastbar:**

- HF-Cadence Segment B (66 Samples, sparser als A)
- Preprocessing-Distortion raw-vs-smoothed (telemetry-intern, nicht Ground Truth)
- Legacy-Detector-Audit auf vorhandenen HF-Daten (0 harsh)
- Video-Absolutzeit (Time.is) verankert
- Methodische Entkopplung Kalibrierung/Holdout implementiert und getestet
- RPM/TPS event-correlated; Throttle nicht event-correlated

**Nicht abgeschlossen / offen:**

- Provider-Offset **validiert** (nur supportive ~14 s Kandidat)
- Absolute Speed-Genauigkeit **validiert** (Holdout zu dünn, MAE headline = null)
- Drift über Segment
- Stop-Timing headline-validiert (nur PARTIAL mit supportive Offset)
- Gear/Reverse telemetrisch

`READY_FOR_RD004_FINAL_CLOSEOUT = NO`

---

## Methodik B.1 (Kurz)

1. **CLOCK_CALIBRATION_SET** (CLK-B1, B2, B5, B6) vs **SPEED_ACCURACY_HOLDOUT_SET** (17 Cruise-Anker) — deterministisch getrennt.
2. Clock: Event-Shape / Transition-Matching, globale Offset-Suche, **kein** Speed-Matching.
3. Holdout: `expectedProviderTimestamp = videoUtc + frozenOffset`, **nur** zeitlich nächster Sample.
4. Explorative DI-EV-0035B-Werte (~14,3 s / ~2,3 km/h) als `NOT_CANONICAL` erhalten.
5. Raw-Bytes unverändert (`RAW_SOURCE_OBSERVATIONS_CHANGED = NO`).

---

## Schlüssel-Flags

```
RD004_PHASE = B.1
RAW_SOURCE_OBSERVATIONS_CHANGED = NO
HF_SPEED_ROWS = 66
HF_SPEED_UNIQUE_PHYSICAL_SAMPLES = 66
HF_SPEED_MEDIAN_PHYSICAL_CADENCE_SECONDS ≈ 10.559
HF_SPEED_P90_PHYSICAL_CADENCE_SECONDS ≈ 34.706
HF_SPEED_MAX_GAP_SECONDS ≈ 105.306
PREVIOUS_OFFSET_METHOD_SELECTION_BIASED = YES
PREVIOUS_SPEED_ACCURACY_METHOD_SELECTION_BIASED = YES
CLOCK_CALIBRATION_HOLDOUT_SEPARATED = YES
PROVIDER_TIMESTAMP_OFFSET_VALIDATED = NO
VIDEO_TO_PROVIDER_OFFSET_SECONDS = null
OFFSET_CANDIDATE_SUPPORTIVE_ONLY = YES
HOLDOUT_FROZEN_OFFSET_SECONDS ≈ 13.5
HOLDOUT_COMPARABLE_SAMPLE_COUNT = 5
ABSOLUTE_SPEED_ACCURACY_VALIDATED = NO
SPEED_MAE_KMH = null
diagnosticHoldoutMaeKmh ≈ 13.8 (non-canonical)
PRODUCTION_SCORE_CHANGED = NO
DEPLOYED = NO
READY_FOR_RD004_FINAL_CLOSEOUT = NO
```
