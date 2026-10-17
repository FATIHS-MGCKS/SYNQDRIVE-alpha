# EXP021 — Haupthalt-Evidenzoberfläche

## Provider (nur dieser Abfragepfad)

- **CONFIRMED:** `ROW_ABSENT` im Pin = `providerRowCount=0` = kein Eintrag in `data.signals[]` für dieses 1s-Label nach Grid-Mapping.
- **CONFIRMED:** Fresh-Vergleich (bereits gespeichert) stimmt auf Halt-Labels mit Pin überein (124/125 beide ROW_ABSENT).
- **UNKNOWN:** Ob Tesla/DIMO unveränderte Koordinaten uplink-seitig weglässt — nicht aus Lücken allein folgern.

## Tabelle je Haupthalt

| Halt | Sekunden | Pin PRESENT | Pin ROW_ABSENT (raw row=0) | V2-Band | NO_MOTION | Erkennung |
|------|---------:|------------:|---------------------------:|--------:|----------:|-----------|
| LONG_HALT_1 | 2026-10-16T03:40:19Z … 2026-10-16T03:40:49Z | 0 | 31 | 0 | 31 | NO_ON_GAP_LABELS |
| LONG_HALT_2 | 2026-10-16T03:41:50Z … 2026-10-16T03:42:29Z | 0 | 40 | 0 | 40 | NO_ON_GAP_LABELS |
| LONG_HALT_3 | 2026-10-16T03:42:50Z … 2026-10-16T03:42:57Z | 1 | 7 | 0 | 8 | PARTIAL_ONLY_ON_PRESENT_LABELS |
| LONG_HALT_4 | 2026-10-16T03:43:43Z … 2026-10-16T03:44:02Z | 0 | 20 | 0 | 20 | NO_ON_GAP_LABELS |
| LONG_HALT_5 | 2026-10-16T03:44:10Z … 2026-10-16T03:44:35Z | 0 | 26 | 0 | 26 | NO_ON_GAP_LABELS |

## Offline-Experiment (R1-Zeuge auf POSITION-ROW_ABSENT)

- Hypothese: Use pinned R1_OBD numeric speed as independent witness when POSITION is ROW_ABSENT (no new fetch).
- POSITION ROW_ABSENT in Halten: **124**
- Davon numerisches R1: **0**
- Kausal-Klassen: still ≤1 km/h **0**, langsam 1–5 **0**, >5 **0**, unbekannt **124**
- **Schluss Haupthalte:** Mit vorhandenem Pin gibt es **keinen** numerischen R1-Zeugen in den Lücken → kausal **unbekannt**, nicht „belegter Stillstand“.

## Offline-Experiment B (Band-Beine, außerhalb Haupthalte)

- Langsame Bewegung 1,5–5 km/h (Bein-Geometrie): **11/11** Band-Sekunden mit Tacho 1–3
- These seconds are outside main video halts; shows missing leg export ≠ missing coords; slow legs align with video tacho 1–3 display band without proving halt-window standstill.

## Band-Sekunden (Tacho 1–3) — Leg-Speeds

Export `qcLegImpliedSpeedMps` null, weil V2-Band-QC die Beine nicht in `supportAssessment` schreibt; offline aus Pin-Koordinaten:
- `2026-10-16T03:37:56Z`: prev→center 2.972 km/h, center→next 1.563 km/h
- `2026-10-16T03:38:00Z`: prev→center 2.238 km/h, center→next 2.832 km/h
- `2026-10-16T03:38:01Z`: prev→center 2.832 km/h, center→next 2.972 km/h
- `2026-10-16T03:38:13Z`: prev→center 2.372 km/h, center→next 2.970 km/h
- `2026-10-16T03:38:14Z`: prev→center 2.970 km/h, center→next 2.123 km/h
- … +6 weitere in JSON

## Abgelehnte Provider-Zeilen nahe Halten

- LONG_HALT_1: 0 rejected near window
- LONG_HALT_2: 0 rejected near window
- LONG_HALT_3: 0 rejected near window
- LONG_HALT_4: 0 rejected near window
- LONG_HALT_5: 0 rejected near window