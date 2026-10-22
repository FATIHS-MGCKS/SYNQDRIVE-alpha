# Vergleichsregeln — VW Tiguan Videoreferenz × DS4 (2026-10-22)

Dieses Dokument ist **verbindlich** für alle Kennzahlen in `outputs/metrics_*.json` und `REPORT.md`. Es wurde **vor** der ersten Metrikberechnung festgelegt.

## 1. Begriffe und Datenquellen

| Bezeichnung (Auswertung) | Repository / Persistenz | Fachliche Bedeutung |
| --- | --- | --- |
| **Videoreferenz (Tacho)** | `reference/TIGUAN_2026-10-22_1Hz.csv` → `speed_display_kmh` | Digitale Tachoanzeige, 1 Hz, kein kalibriertes Ground Truth für physikalische Geschwindigkeit |
| **DS4 Geschwindigkeit (primär)** | `snapshots/di_v0_shadow_intervals.csv` → `estimated_speed_kmh` @ `reference_time` | Persistierter DI-V0-S4-Shadow-L3-Schätzwert (Kalender-Sekunden-Referenzzeit) |
| **DS4 Motion Geschwindigkeit** | `snapshots/di_v0_motion_core_shadow_payload.json` → `speeds[].speedKmh` @ `bucketLabelUtc` | Motion-Core-Shadow (C4/FSM-Bundle), **POST_TRIP_RETROSPECTIVE** |
| **DS4 Motion Zustand** | gleiche Payload → `fsmLabels[].state` | FSM-Zustand pro Kalendersekunde |
| **DS4 Motion Ereignisse** | gleiche Payload → `events[]` | Manöver-Ereignisse (accel/decel-Klassen), nicht Pedal-GT |
| **R1-OBD-Baseline** | `snapshots/r1_obd_evidence_snapshot.json` → Signal `speed` / `powertrainCombustionEngineSpeed` | Roher Telematik-Kanal aus S4-Evidence-Snapshot, **nicht** Tacho |
| **S4 Evidence** | `snapshots/di_v0_s4_evidence_container.bin` | Eingefrorene POSITION + R1_OBD Kanäle (Akquisition, nicht Vergleichswert für Tacho) |

**DS4** ist in dieser Auswertung der **produktiv persistierte S4-Shadow-Pfad** (Work Item `PRIMARY` → Shadow Run → `di_v0_shadow_intervals`), nicht die reine Forschungs-Pipeline M7A/S4-Research.

## 2. Schlüssel und Zeilen

- Primärschlüssel der Referenz: `(source_clip, video_second)`.
- Genau **eine** Hauptvergleichszeile pro Referenzschlüssel in `outputs/comparison_primary.csv`.
- Leere Referenzfelder = **fehlende Evidenz**, nicht numerische Null.
- Keine Interpolation über Referenzlücken oder fehlende DS4-Werte.

## 3. Zeitbezug und Matching

### 3.1 Referenzzeit

- Maßgeblicher UTC-Zeitstempel pro Referenzzeile: `time_utc_estimated` (nominal, ±1 s Unsicherheit laut Referenz-README).
- `video_pts_s` wird für Ableitungen innerhalb eines Clips genutzt, nicht als globaler Matching-Schlüssel.

### 3.2 Primäres Matching (nominal, Versatz 0)

Für Referenz-UTC-Zeitpunkt `t_ref` (auf ganze Sekunde normalisiert, UTC):

1. **DS4 L3:** Intervalle mit `reference_time` = `t_ref` (UTC, Format `YYYY-MM-DD HH:MM:SS`).
2. **DS4 Motion:** Bucket mit `bucketLabelUtc` = ISO `YYYY-MM-DDTHH:MM:SSZ` für dieselbe Sekunde.
3. **R1 OBD:** Bucket mit `bucketLabel` = ISO `YYYY-MM-DDTHH:MM:SSZ`.

Wenn mehrere DS4-Intervalle auf dieselbe Sekunde fallen (sollte nicht vorkommen): **MATCH_AMBIGUOUS** — erste Zeile nach `interval_start`, Rest in Diagnose-Spalte vermerkt.

### 3.3 Zulässige Abweichung

- Primär: **exakte Kalendersekunde** (0 s Toleranz auf Bucket-Grenzen).
- Dokumentierte Unsicherheit der Referenzuhr: **±1 s** (nicht zum Optimieren des Versatzes verwendet).

### 3.4 Sensitivitätsanalyse (getrennt von Primärmetriken)

Zusätzliche Läufe mit Verschiebung der Referenz-UTC um **−2, −1, 0, +1, +2** Sekunden vor dem Lookup (nur für DS4/R1; Referenzwert unverändert). Ergebnis in `outputs/metrics_sensitivity.json`. **Kein** Ersatz der Primärauswertung.

### 3.5 Kausalität / Quellenalter

- Shadow Run `created_at` = **2026-10-22T19:18:57Z** (nach Fahrtende).
- Alle DS4-Werte in dieser Auswertung sind **rückblickend** verfügbar; Spalte `ds4_availability_class` = `RETROSPECTIVE_POST_TRIP` für L3/Motion.
- `source_age_s` = Sekunden zwischen `t_ref` und Shadow-Run-Erstellung (beschreibend, nicht Qualitätsgate).

## 4. Geschwindigkeitsvergleich

### 4.1 Paarungsmaske (primär)

Eine Zeile zählt in **paired speed metrics**, wenn:

- `speed_display_kmh` numerisch lesbar ist, und
- `estimated_speed_kmh` numerisch (nicht leer) ist, und
- Ausschlussgrund `comparison_exclusion` leer ist.

### 4.2 Kennzahlen

Auf der Paarungsmaske: MAE, Median |Fehler|, RMSE, P90/P95 |Fehler|, Bias (DS4 − Tacho), Anteile innerhalb ±3 / ±5 / ±10 km/h.

Zusätzlich immer: Referenzabdeckung, DS4-Abdeckung, gültige Paare (Zähler + Nenner = 1464 Referenzzeilen).

### 4.3 Segmentierung

Getrennte Kennzahlen für:

- Tacho = 0 km/h (angezeigt),
- Tacho > 0,
- Geschwindigkeitsbänder: [1–30), [30–60), [60–100), ≥100 km/h,
- pro `source_clip`.

## 5. Stillstand und Anfahren

- **Referenz still:** `speed_display_kmh` = `0` (gelesen).
- **Referenz bewegt:** `speed_display_kmh` numerisch und > 0.
- **DS4 L3 still:** `motion_state` ∈ `{STATIONARY_SUPPORTED}` **oder** (`estimated_speed_kmh` numerisch und < 3 km/h).
- **DS4 L3 bewegt:** `motion_state` = `MOVING_SPEED_ESTIMATED` mit numerischer Geschwindigkeit ≥ 3 km/h.
- **DS4 Motion still:** FSM `state` enthält `STOP` oder `STATIONARY` (case-sensitive Substring-Match auf dokumentierte FSM-Labels).
- **Unbekannt:** fehlende DS4-Zustände, `NO_MOTION_EVIDENCE`, `TRANSITION_UNCERTAIN`, leere Geschwindigkeit.

Die **11 Nullfolgen** in `reference/TIGUAN_2026-10-22_visible_stops.csv` sind **sichtbare Anzeige-Nullfolgen**, nicht automatisch 11 physische Halte.

## 6. Beschleunigen / Verzögern

- Neun Fenster aus `reference/TIGUAN_2026-10-22_analysis_windows.csv` werden **einzeln** bewertet (Richtung, Δv laut Tacho, Dauer, Überlappung mit DS4-Motion-`events[]`).
- Zusätzlich: Inventar aller DS4-Motion-Ereignisse im Referenz-UTC-Fenster [18:38:34, 19:03:02] Z.
- **Kein** globales Precision/Recall: Referenzfenster sind keine vollständige Ereignisannotation; Pedal-GT = `NOT_OBSERVED`.
- Display-Ableitungen (`display_trends`) dienen nur der Einordnung, nicht als Harsh-Braking-Validierung.

## 7. Drehzahl

- Vergleich nur wenn R1 `powertrainCombustionEngineSpeed` `VALUE_PRESENT` und Referenz `rpm_estimate` numerisch.
- Toleranzband **±500 U/min** (Referenz unsicher); Rundung Referenz 250 U/min beachten.
- Sonst `N/A` mit Grund `RPM_CHANNEL_MISSING` / `REF_RPM_MISSING`.

## 8. Ausschlussgründe (`comparison_exclusion`)

| Code | Bedeutung |
| --- | --- |
| `REF_SPEED_MISSING` | Kein Tacho-Wert |
| `DS4_NO_BUCKET` | Kein Shadow-Intervall für Sekunde |
| `DS4_SPEED_NULL` | Intervall vorhanden, `estimated_speed_kmh` leer |
| `OUTSIDE_DS4_WINDOW` | Referenz-UTC außerhalb Shadow-Abdeckung |
| `MATCH_AMBIGUOUS` | Mehrdeutige DS4-Zuordnung |
