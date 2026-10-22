# DS4-Auswertung — VW Tiguan Videoreferenz 2026-10-22

## Wie gut funktioniert DS4 auf dem beobachteten Teil dieser Fahrt?

**Kurzurteil (nur Video-Teilstück 18:38:34–19:03:02 UTC, Tacho-Referenz):** DS4 L3 liefert auf **1284/1464** Referenzsekunden eine numerische Geschwindigkeit. **Median |Fehler| ≈ 2.9 km/h**; **~90%** der Paare liegen innerhalb ±5 km/h. Die **arithmetische MAE (14.5 km/h)** wird durch wenige GPS-Ausreißer (z. B. ~920 km/h L3 bei Tacho 71 km/h in TC_00081) verzerrt; **MAE ohne |Fehler|>100 km/h: 2.99 km/h**. Typische Fahrzeugkinematik ist damit **nützlich**, aber nicht Tacho-genau; Abdeckung unvollständig (1312/1464 DS4-Werte), Stillstand/Anfahren mit UNKNOWN/Verzögerung, Ereignisse nur teilweise gegen neun Display-Fenster prüfbar.

Details und Grenzen unten; reproduzierbar via `scripts/run_evaluation.sh`.

## 1. Fahrt- und Datenstand

Siehe `snapshots/TRIP_IDENTITY.json` und `PROVENANCE_MANIFEST.json`. Ein Trip (`98d2a8e0-8b7d-4529-bf76-acee44d61fbe`) deckt die Nutzerfahrt ab; die Videos erfassen ein **Teilfenster**.

## 2. Geschwindigkeit (DS4 L3 vs. Tacho)

| Kennzahl | Wert |
| --- | --- |
| Referenzzeilen | 1464 |
| Lesbare Tacho-Werte | 1417 |
| DS4 L3 numerisch | 1312 |
| Gültige Paare | 1284 |
| MAE | 14.513 km/h |
| Median abs Fehler | 2.864 km/h |
| RMSE | 132.068 km/h |
| Bias (DS4 − Tacho) | 8.932 km/h |
| P90 abs Fehler | 4.986 km/h |
| Anteil ±3 km/h | 54.0% |
| Anteil ±5 km/h | 90.0% |
| Anteil ±10 km/h | 98.7% |

Ausschlüsse: `{"DS4_SPEED_NULL": 152, "OK": 1284, "REF_SPEED_MISSING": 28}`

## 3. Sensitivität ±2 s (nur Speed-MAE, Referenzzeit verschoben)

- Versatz **-2 s**: MAE 14.876 km/h, Paare 1285
- Versatz **-1 s**: MAE 14.368 km/h, Paare 1284
- Versatz **+0 s**: MAE 14.513 km/h, Paare 1284
- Versatz **+1 s**: MAE 15.139 km/h, Paare 1286
- Versatz **+2 s**: MAE 15.936 km/h, Paare 1285

## 4. Stillstand / Bewegung (L3)

- Referenz still (Tacho 0): `{'still|still': 66, 'still|unknown': 29, 'still|moving': 1}`
- Referenz bewegt: `{'moving|moving': 1283, 'moving|unknown': 26, 'moving|still': 12}`

## 5. Beschleunigen / Verzögern

- DS4-Motion-Ereignisse im Video-UTC-Fenster: **13**
- Neun Referenzfenster: siehe `outputs/event_window_comparison.json` (Überlappung mit DS4-Motion-Events; **kein** globales Precision/Recall).

## 6. Drehzahl

- R1 vs. Referenz `rpm_estimate`: 363 Paare; MAE 461.11570247933884 U/min (±500 Toleranz: 70.24793388429752 %).

## 7. Stärken, Schwächen, Hypothesen

**Stärken:** Hohe Abdeckung im fahrenden Mittelgeschwindigkeitsbereich; Schätzwerte folgen Tacho-Trends über längere Abschnitte.

**Belegte Schwächen:** Fehlende/abstained L3-Werte zu Trip-Anfang und bei `POSITION_FROZEN` / `ROW_ABSENT`; systematischer Bias und Ausreißer in den schlechtesten 15 Sekunden (siehe `metrics_primary.json`); Motion-FSM/Events nicht 1:1 mit Display-Fenstern.

**Hypothesen (nicht bewiesen):** Restlicher ±1 s Video-Uhrenversatz; Tacho-Quantisierung vs. GPS-L3; RUPTELA-R1-Abtastung vs. 1 Hz Video.

## 8. Reproduktion

```bash
cd research/driving-intelligence/evaluations/2026-10-22-vw-tiguan
./scripts/run_evaluation.sh
```

Regeln: `EVALUATION_RULES.md`. Architektur: `ARCHITECTURE_MAPPING.md`.
