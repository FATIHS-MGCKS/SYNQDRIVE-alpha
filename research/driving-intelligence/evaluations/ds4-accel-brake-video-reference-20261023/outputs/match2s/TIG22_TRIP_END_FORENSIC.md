# TIG22 Trip-Ende 19:04 UTC — Forensik (read-only Replay)

Referenzvideo endet vor diesem Abschnitt; **OBD-Speed nur Vergleichsserie** (R1, nicht als Manöver-Referenz).
Physikalische Plausibilität §8 ist eine **Vorsortierung**, keine aus 0–100-Zeit allein abgeleitete harte Grenze.

## DS4-Ereignisse in diesem Fenster

- **DECELERATION** 19:04:26–19:04:29: 34.7→5.5 km/h, Δv=29.2, mean=2.703 m/s², qual=DEGRADED, flags=L3_DIRECT|L3_LEG_TIMING_SUSPECT_FALLBACK_ROBUST
- **ACCELERATION** 19:04:34–19:04:38: 5.5→100.1 km/h, Δv=94.6, mean=6.567 m/s², qual=LIMITED, flags=L3_SUPPORT_MISSING_FALLBACK_ROBUST|MIN_SUPPORT_3_POINTS
- **DECELERATION** 19:04:39–19:04:42: 98.2→68.6 km/h, Δv=29.5, mean=2.736 m/s², qual=LIMITED, flags=L3_DIRECT|L3_SUPPORT_MISSING_FALLBACK_ROBUST
- **ACCELERATION** 19:04:49–19:04:52: 52.3→142.1 km/h, Δv=89.8, mean=8.313 m/s², qual=DEGRADED, flags=L3_LEG_TIMING_SUSPECT_FALLBACK_ROBUST|L3_SUPPORT_MISSING_FALLBACK_ROBUST

## Sekundenraster

| UTC | Δt Pos (s) | Leg m | Pos | C4 | Qualität | Flags (kurz) | OBD km/h | C4/OBD |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 19:04:00 |  |  | P | 53.5 | SPARSE_SUPPORT | MIN_SUPPORT_3_POINTS | · |  |
| 19:04:01 |  |  | − | · | NO_POSITION |  | · |  |
| 19:04:02 | 2 | 22 | P | 33.2 | SPARSE_SUPPORT | MIN_SUPPORT_3_POINTS | · |  |
| 19:04:03 |  |  | − | · | NO_POSITION |  | · |  |
| 19:04:04 | 2 | 15 | P | · | NO_SUPPORT |  | · |  |
| 19:04:05 |  |  | − | · | NO_POSITION |  | · |  |
| 19:04:06 |  |  | − | · | NO_POSITION |  | · |  |
| 19:04:07 | 3 | 6 | P | · | NO_SUPPORT |  | · |  |
| 19:04:08 | 1 | 8 | P | · | NO_SUPPORT |  | · |  |
| 19:04:09 |  |  | − | · | NO_POSITION |  | · |  |
| 19:04:10 |  |  | − | · | NO_POSITION |  | · |  |
| 19:04:11 | 3 | 14 | P | · | NO_SUPPORT |  | · |  |
| 19:04:12 | 1 | 18 | P | · | NO_SUPPORT |  | · |  |
| 19:04:13 |  |  | − | · | NO_POSITION |  | · |  |
| 19:04:14 |  |  | − | · | NO_POSITION |  | · |  |
| 19:04:15 | 3 | 22 | P | · | NO_SUPPORT |  | · |  |
| 19:04:16 |  |  | − | · | NO_POSITION |  | · |  |
| 19:04:17 | 2 | 32 | P | · | NO_SUPPORT |  | · |  |
| 19:04:18 |  |  | − | · | NO_POSITION |  | · |  |
| 19:04:19 |  |  | − | · | NO_POSITION |  | · |  |
| 19:04:20 | 3 | 23 | P | · | NO_SUPPORT |  | · |  |
| 19:04:21 | 1 | 18 | P | 40 | SPARSE_SUPPORT | MIN_SUPPORT_3_POINTS | · |  |
| 19:04:22 |  |  | − | · | NO_POSITION |  | · |  |
| 19:04:23 | 2 | 15 | P | 34.9 | SPARSE_SUPPORT | MIN_SUPPORT_3_POINTS | · |  |
| 19:04:24 | 1 | 14 | P | 38.2 | SPARSE_SUPPORT | MIN_SUPPORT_3_POINTS | · |  |
| 19:04:25 |  |  | − | · | NO_POSITION |  | · |  |
| 19:04:26 | 2 | 18 | P | 34.7 | JITTER_SUSPECT | TIMING_JITTER_SUSPECT_IN_WINDOW | · |  |
| 19:04:27 | 1 | 12 | P | 28.1 | JITTER_SUSPECT | TIMING_JITTER_SUSPECT_IN_WINDOW | · |  |
| 19:04:28 | 1 | 8 | P | 19.3 | OK |  | · |  |
| 19:04:29 | 1 | 3 | P | 5.5 | OK |  | · |  |
| 19:04:30 | 1 | 0 | P | 4.3 | SPARSE_SUPPORT |  | · |  |
| 19:04:31 |  |  | − | · | NO_POSITION |  | · |  |
| 19:04:32 | 2 | 2 | P | 4.3 | SPARSE_SUPPORT |  | · |  |
| 19:04:33 | 1 | 1 | P | 4.7 | OK |  | · |  |
| 19:04:34 | 1 | 1 | P | 5.5 | SPARSE_SUPPORT |  | · |  |
| 19:04:35 |  |  | − | · | NO_POSITION |  | · |  |
| 19:04:36 | 2 | 4 | P | 54.1 | SPARSE_SUPPORT | MIN_SUPPORT_3_POINTS | · |  |
| 19:04:37 | 1 | 18 | P | · | OUTLIER_REJECTED | POSITION_OUTLIER_CHORD_DEVIATION | · |  |
| 19:04:38 | 1 | 39 | P | 100.1 | SPARSE_SUPPORT |  | · |  |
| 19:04:39 | 1 | 28 | P | 98.2 | OK |  | · |  |
| 19:04:40 | 1 | 27 | P | 87 | SPARSE_SUPPORT |  | · |  |
| 19:04:41 |  |  | − | · | NO_POSITION |  | · |  |
| 19:04:42 | 2 | 33 | P | 68.6 | SPARSE_SUPPORT |  | · |  |
| 19:04:43 | 1 | 21 | P | 73.5 | OK |  | · |  |
| 19:04:44 | 1 | 20 | P | 70 | OK |  | · |  |
| 19:04:45 | 1 | 19 | P | 69.8 | OK |  | · |  |
| 19:04:46 | 1 | 20 | P | 65.5 | SPARSE_SUPPORT |  | · |  |
| 19:04:47 |  |  | − | · | NO_POSITION |  | · |  |
| 19:04:48 | 2 | 30 | P | 61.8 | SPARSE_SUPPORT | MIN_SUPPORT_3_POINTS | · |  |
| 19:04:49 | 1 | 21 | P | 52.3 | SPARSE_SUPPORT | MIN_SUPPORT_3_POINTS | · |  |
| 19:04:50 |  |  | − | · | NO_POSITION |  | · |  |
| 19:04:51 | 2 | 22 | P | 103 | JITTER_SUSPECT | TIMING_JITTER_SUSPECT_IN_WINDOW | · |  |
| 19:04:52 | 1 | 47 | P | 142.1 | JITTER_SUSPECT | TIMING_JITTER_SUSPECT_IN_WINDOW MIN_SUPPORT_3_POINTS | · |  |
| 19:04:53 | 1 | 32 | P | · | NO_SUPPORT |  | · |  |
| 19:04:54 |  |  | − | · | — |  | · |  |
| 19:04:55 |  |  | − | · | — |  | · |  |

## Einordnung (bestätigt vs. Verdacht)

| Befund | Status | Beleg |
| --- | --- | --- |
| C4-Speed liegt über weiten Strecken **systematisch höher** als OBD (Ratio oft ≈1,5–2,0) | **bestätigt** (Vergleichsserie) | Sekunden mit Pos+OBD im Raster; kein Video-GT |
| Vier DS4-Ereignisse entstehen auf **nicht-OK** C4-Stützpunkten (SPARSE/JITTER/LIMITED/DEGRADED) | **bestätigt** | Ereignisqualität + Flags im Raster |
| `OUTLIER_REJECTED` bei 19:04:37 (`CHORD_DEVIATION`) — Quarantänegrenze | **bestätigt** | C4-Flag + fehlende Pos-Sekunden davor/nachher |
| Zwei Ereignisse überschreiten §8-Tiguan-Mittel **4,5 m/s²** (5,5→100,1; 52,3→142,1) | **Verdacht physikalisch unplausibel** | Schranke = Vorsortierung; Richtung mit OBD-Manövern vereinbar, Betrag durch C4-Skala |
| Ursache „2× OBD“ im Speed-Pfad | **Verdacht, Speed-Workstream** | Nicht durch Video verifizierbar; hier nur dokumentiert |
| Ob die vier Ereignisse **fachlich falsch** (Richtung/Dauer) sind | **nicht bewertbar** ohne unabhängige Referenz im Fenster | Video endet früher |
