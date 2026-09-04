# RD004-B.2 — Frame-Accurate Master Video Timeline + Transition Clock Reassessment

**Evidence ID:** DI-EV-0035B.2
**Phase:** RD004-B.2 (post-refuel ~16:40.498)
**Vehicle:** KS MX 2024 Mercedes-Benz C 63 AMG (`a60c0749-a7cd-494e-b5b9-dea3c6b97d63`, DIMO token `187336`)
**Session:** `f1e81e78-f96b-44ee-80c2-ca5270f21248`
**Mode:** Read-only offline analysis — **no production changes**

---

## Einfache Zusammenfassung (Deutsch)

### 1. Wie genau konnten die 9 Videoteile zusammengesetzt werden?

Die neun Drive-Clips gehören zu **einer** kontinuierlichen Aufnahme. Die chronologische Reihenfolge wurde **nicht** aus Drive-Zeitstempeln abgeleitet, sondern durch **Audio-Kreuzkorrelation** benachbarter Clips verifiziert:

**5 → 3 → 1 → 9 → 8 → 7 → 4 → 2 → 6**

Jede Kante hat gemessene Überlappung und Korrelationskoeffizient (~0,999–1,000), dokumentiert in `rd004-b-video-master-timeline.json`. Damit ist das Stitching reproduzierbar und unabhängig von Metadaten.

### 2. Wie lang ist Segment B tatsächlich?

| Kennzahl | Wert |
|----------|------|
| Rohsumme Clip-Dauern | 1017,273365 s |
| Summe Audio-Überlappungen | 16,775 s |
| **Master-Dauer (overlap-korrigiert)** | **1000,498365 s** (= 16 min 40,498 s) |

Die frühere gerundete 1000-s-Timeline wird dort ersetzt, wo Präzision zählt.

### 3. Wie genau ist der Time.is-Start jetzt?

Frame-Review am Anfang von Link 5:

- t=0,766667 s: Time.is zeigt noch **05:47:02**
- t=0,800000 s: Time.is zeigt **05:47:03**

Sekundengrenze zwischen diesen Frames → Mittelpunkt **t≈0,783333 s**.

| Feld | Wert |
|------|------|
| `VIDEO_MASTER_T0_UTC_ESTIMATE` | `2026-09-04T03:47:02.216667Z` |
| Time.is Unsicherheit (sichtbar) | ca. ±0,108 s |
| `VIDEO_ABSOLUTE_TIME_ANCHORED` | **YES** |

Keine Millisekunden-Ground-Truth — Frameintervall plus Time.is-Anzeigeunsicherheit sind explizit modelliert.

### 4. Warum war t=630 als Stop-Landmark falsch?

t=630 s zeigt **0 km/h im anhaltenden Stillstand** — ein **Zustands-Snapshot** (`SUSTAINED_STOP_STATE`), nicht den physischen Übergang in den Halt.

Der tatsächliche erste Übergang auf angezeigte 0 km/h liegt **~8 s früher**. t=630 darf nur noch als Zustandsanker (B15) dienen, nicht als Clock-Landmark.

`OLD_T630_STOP_TRANSITION_INVALIDATED = YES`

### 5. Wann erreicht das Fahrzeug laut Video tatsächlich 0 km/h?

Frame-verifizierte Deceleration:

| Video-t | Anzeige |
|---------|---------|
| 620,0 s | 13 km/h |
| 621,0 s | 5 km/h |
| ≈621,4 s | ~2 km/h |
| ≈621,7 s | ~1 km/h |
| **≈621,8 s** | **erstes klares 0 km/h** |

`FIRST_STOP_TRANSITION_VIDEO_T_SECONDS = 621.8`
≈ `2026-09-04T03:57:24.017Z` (mit T0-Unsicherheit)

Landmark **B-T01_FIRST_ZERO**.

### 6. Wann beginnt der anschließende Launch?

Nach prolonged zero-speed:

| Video-t | Anzeige |
|---------|---------|
| 670,0–672,5 s | 0 km/h |
| 673,0 s | 0 km/h |
| 673,5 s | 2 km/h |
| 674,0+ s | Beschleunigung |

**Bounded window:** `FIRST_LAUNCH_TRANSITION_VIDEO_T_MIN = 673.0`, `MAX = 673.5`
Landmark **B-T02_FIRST_LAUNCH** — kein exakter Mittelpunkt als Event-Zeit.

### 7. Was passiert mit dem bisherigen ~13,5–14 s Offset?

B.1 hat **korrekt** `PROVIDER_TIMESTAMP_OFFSET_VALIDATED = NO` gesetzt und Selection Bias entfernt.

B.2 zeigt: Der frühere Vergleich gegen **t=630** war methodisch falsch (falscher Video-Landmark). Der explorative ~14,3-s-Wert aus DI-EV-0035B bleibt **nicht-kanonisch** erhalten; der frühere „supportive ~14 s“-Kandidat wird durch die korrigierte Transition-Reassessment **ersetzt** (`OFFSET_CANDIDATE_AROUND_14_SECONDS = SUPERSEDED_BY_B2_FRAME_VERIFIED_REASSESSMENT`).

### 8. Entsteht durch die korrigierte Stopzeit eher ein ~22-s-Abstand?

**Ja, diagnostisch.** Gegen korrigierten Video-Stop (621,8 s) und HF-Zero-Sample `2026-09-04T03:57:45.685Z`:

`CORRECTED_FIRST_STOP_DISPLACEMENT_SECONDS ≈ +21,67 s`

Das liegt nahe am Segment-A-explorativen H-Landmark (~22,205 s), aber **ohne** gemeinsame Clock-Validierung.

### 9. Ist dieser ~22-s-Abstand Clock Offset oder möglicherweise nur sparse sampling delay?

**Kritische Unterscheidung — beides kann gemischt sein.**

| Status | Bedeutung |
|--------|-----------|
| `CORRECTED_FIRST_STOP_DISPLACEMENT_STATUS` | **SPARSE_STATE_SAMPLE** |
| `SPARSE_SAMPLE_DELAY_SEPARATED_FROM_CLOCK_OFFSET` | **YES** |

Zwischen HF-Samples vor dem Zero-Punkt liegt eine **~29 s Lücke** (27 km/h → später 43→0 in 1 s). Das erste Provider-Zero ist sehr wahrscheinlich **kein** frame-genauer Stop-Transition-Match, sondern ein **spärlicher Zustands-Sample** nach der physischen Transition.

**+21,7 s allein beweist keinen globalen +21,7 s Clock Offset.**

### 10. Wiederholt sich das ~22-s-Muster aus Segment A?

| Flag | Wert |
|------|------|
| `A_B_APPROX_22S_DISPLACEMENT_REPEAT_OBSERVED` | **YES** (~21,7 vs ~22,2 s) |
| `A_B_22S_DISPLACEMENT_COMMON_CLOCK_VALIDATED` | **NO** |

Ähnlichkeit ist **unterstützende** Evidenz, kein Beweis. Segment-A-Evidence bleibt unverändert.

### 11. Ist ein Provider-Clock-Offset jetzt validiert?

**Nein.**

| Flag | Wert |
|------|------|
| `PROVIDER_TIMESTAMP_OFFSET_VALIDATED` | **NO** |
| `VIDEO_TO_PROVIDER_OFFSET_SECONDS` | **null** |
| `OFFSET_CANDIDATE_RANGE_SUPPORTIVE` | ca. **+19,7 … +23,7 s** (nur Stop-Landmark) |
| Launch-Landmark Displacement | ca. **+5,1 … +5,6 s** (inkonsistent) |
| `VIDEO_PROVIDER_ALIGNMENT_CLASS` | `APPROX_22S_DISPLACEMENT_SUPPORTIVE_ONLY` |

Zwei Transition-Landmarks liefern **widersprüchliche** Offsets → keine globale Validierung (<3 konsistente Landmarks).

### 12. Ist absolute Speed Accuracy jetzt validiert?

**Nein.**

| Flag | Wert |
|------|------|
| `ABSOLUTE_SPEED_ACCURACY_VALIDATED` | **NO** |
| `SPEED_MAE_KMH` | **null** |
| `HOLDOUT_SPEED_SELECTION_TIME_ONLY` | **YES** |
| Diagnostische Holdout-MAE (supportive ~21,7 s, nicht kanonisch) | **~19,3 km/h** |

Ohne validierten Offset keine kanonische MAE. B.1-Holdout-Methodik (zeit-only) bleibt erhalten.

### 13. Was verhindert die ~10,6-s HF-Cadence weiterhin?

| Kennzahl | Wert |
|----------|------|
| HF unique physical samples | 66 |
| Median-Cadence | **~10,559 s** |
| P90 | **~34,706 s** |
| Max Gap | **~105,306 s** |

Bei dynamischen Zuständen (Decel/Stop/Launch) fehlen oft HF-Samples **am** Transition-Zeitpunkt. Der zeitlich nächste Sample kann Sekunden daneben liegen → korrekte Klassifikation als nicht vergleichbar statt irreführender Genauigkeit.

---

## Weitere B.2 Invarianten

| Thema | Status |
|-------|--------|
| Legacy Hard/Extreme Events | **0** |
| `LEGACY_FALSE_NEGATIVE_VALIDATED` | **NO** |
| RPM / TPS Segment B | **EVENT_CORRELATED** |
| Throttle | **NOT_EVENT_CORRELATED** |
| Gear HF | **NOT_OBSERVED** |
| Reverse Video / Telemetry | **YES / NO** |
| `SECOND_STOP_VIDEO_OBSERVED` | **YES** |
| `SECOND_STOP_TRANSITION_FRAME_EXACT` | **NO** |
| `STOP_TIMING_VALIDATED` | **NO** |
| `STOP_TIMING_ANALYSIS_USED_SUPPORTIVE_OFFSET` | **YES** (explorativ) |
| Raw source bytes changed | **NO** |
| Production / deploy | **NO** |
| `READY_FOR_RD004_FINAL_CLOSEOUT` | **NO** |

---

## Artefakte

- `rd004-b-video-master-timeline.json` — audio-korrelierte Stitching-Evidence
- `rd004-b-video-anchor-table.json` — B01–B25 + B-T01/B-T02 Landmarks
- `rd004-b-video-clock-alignment.json` — B.2 Transition-Clock-Reassessment
- `rd004-b-stop-timing.json`, `rd004-b-speed-accuracy.json`, `rd004-b-session-summary.json`

**Changes / Architektur:** aktualisiert (DI-EV-0035B.2).
