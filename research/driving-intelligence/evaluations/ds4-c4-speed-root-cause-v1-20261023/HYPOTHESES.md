# Hypothesen — C4-Geschwindigkeitsfehler V1

Code: `computeC4AdaptiveL3` (`MOTION_CORE_SPEED_C4_V0_5_DEV`) + `robustPathSlopeC1` + `replayFrozenL3OnGrid` @ Produktions-SHA `579ee8b2`.

| ID | Hypothese | TES16 03:50:20–23 | TIG22 19:04:34–38 / 49–52 | Status |
| --- | --- | --- | --- | --- |
| **H1** | Fehlerhafte Roh-GPS-Geometrie / Positionsprung | Leg :22→:23 = 71,1 m in **2 s** Kalenderlücke (weil :21 `ROW_ABSENT`) → 128 km/h Chord; kein Einzel-Teleport >400 km/h | :37 Chord 100,8 km/h mit 10,9 m Midpoint-Abweichung (`CHORD_DEVIATION`); :36→:38 39 m über Lücke :35/:37 | **CONFIRMED** (Geometrie über erweiterte Δt) |
| **H2** | Falsches Zeitdelta durch Bucket-/Sample-Zuordnung | Fixture: `referenceTimeUtc` = Bucket-Label, `temporalConfidence=BUCKET_BOUNDED`; **keine** ms-Rohzeit in Grid — Sub-Sekunden-Shift **nicht belegbar** | Position-Adapter liefert nur `bucketLabelUtc`; OBD `measurementTimeUtc` in Snapshot oft null — **nicht** in C4-Pfad | **REFUTED** als Primärursache (keine Belege für ms-Misalignment); **OPEN** ob Provider-interne Zeit außerhalb Fixture liegt |
| **H3** | Vermischung inkompatibler Stützpunkte über Lücke | C1-Fenster `:18–:20–:22` (überspringt :21); `supportSpanS=4`; :20 C4=113,1 vs CF ohne Brücken-Paare **129,4** | C1-Fenster z. B. `:34–:36–:38` (überspringt :35); :38 C4=100,1 bei OBD=50 | **CONFIRMED** (`c4_path=C1_SPARSE_FALLBACK`, Support-Labels zeigen Lücken) |
| **H4** | Instabiler SPARSE/JITTER Fallback | :20 `SPARSE_SUPPORT`; :22–:23 `JITTER_SUSPECT` + `L3_LEG_TIMING_SUSPECT_FALLBACK_ROBUST`; L3 an :23 **191,4** eligible, C4 wählt C1 **148,3** wegen Jitter-Legs | Durchgehend `JITTER_SUSPECT` / `MIN_SUPPORT_3_POINTS` um Lücken; L3 :38 **119,9** eligible, C4 **100,1** (C1) | **CONFIRMED** |
| **H5** | Outlier-/Leg-Quarantäne oder Randpunkte | Kein `OUTLIER_REJECTED` im Fenster | :37 `OUTLIER_REJECTED` (C4 null), Nachbar :38 C1 mit Support inkl. :36,:38 ohne :37 | **CONFIRMED** (TIG22); TES16 **REFUTED** |
| **H6** | Detektor verstärkt ohne Ursache | Ereignis folgt C4-Schrittfolge (113→148 Δv); Detektor-Schwellen unverändert; Ursache liegt **vor** `detectMotionManoeuvreEvents` | Gleiches Muster 5,5→100,1 und 52,3→142,1 auf C4-Serie | **CONFIRMED** (H6 = Symptompfad, nicht Root Cause) |

## Gegenproben (numerisch)

| Fall | Beobachtung | Gegenprobe |
| --- | --- | --- |
| TES16 :20 | C4 113,1 | Nachbar-Legs ~36 m / 1 s ≈ 130 km/h; C1 median über Fenster mit 2-s-Sprung drückt Wert |
| TES16 CF | `cf_c1_no_gap_bridge` :20 → **129,4** | Entfernt nur nicht-konsekutive C1-Paare; :22 CF **191,5** (schlechter) → allein unzureichend |
| TIG22 :38 | C4 100,1 vs OBD 50 | L3_DIRECT-Pfad blockiert (fehlende 1-s-Nachbarn); C1 über :36–:38 mit 2-s-Geometrie |
| TIG22 :52 | C4 142,1 vs OBD 60 | L3 und C1 übereinstimmend 142,1 — kein reiner Detektor-Effekt; GPS-Chord über :50-Lücke |

## Zuständige Codefunktionen

| Mechanismus | Funktion / Datei |
| --- | --- |
| C4 Pfadwahl | `computeC4AdaptiveL3` — `core/kinematics/c4-adaptive-l3.ts` |
| C1 Theil–Sen über ±2 Labels | `robustPathSlopeC1` — `robust-path-slope.ts` |
| L3 Zentrum t−1,t,t+1 | `replayFrozenL3OnGrid` → `evaluateL3AtCenter` |
| Jitter-Leg Diagnose | `detectTimingJitterSuspectLegs` — `leg-consistency.ts` |
| Outlier-Quarantäne | `detectPositionOutliers` |
| Ereignis | `detectMotionManoeuvreEvents` — **downstream** |
