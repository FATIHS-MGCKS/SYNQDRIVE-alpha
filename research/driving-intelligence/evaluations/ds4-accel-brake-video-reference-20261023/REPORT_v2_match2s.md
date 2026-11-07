# DS4 — Beschleunigen/Bremsen (korrigierte Zuordnung, 2026-10-23)

**Version:** `outputs/match2s`, `matchingMode=v2_gap2s` (§12 **N4**).  
**Erster Lauf (unverändert):** [`REPORT_v1_main.md`](REPORT_v1_main.md) / [`outputs/main`](outputs/main/) mit `v1_bilateral` (beidseitige Intervallerweiterung — methodisch zu großzügig, siehe N4).

Detektor und C4 unverändert (`579ee8b2` DI-Code; Replay-HEAD `a20641cc` ohne DI-Diff). Regeln §1–§11 + N1–N3; **Primärzuordnung** ab N4.

## 1. Methodikkorrektur (Zeitzuordnung)

| | v1 (`outputs/main`) | v2 (`outputs/match2s`) |
| --- | --- | --- |
| Regel | Beide Intervalle je ±2 s erweitert | **Gesamttoleranz** 2 s = max. Lückenabstand `intervalGapS` |
| Effekt | Bis ~4 s Zwischenraum noch „Treffer“ | Nur echte Überlappung oder Lücke ≤ 2 s |
| Fragmente (gesamt) | 1 (`TREFFER_FRAGMENT`) | **0** |
| Harte Fehlalarme (prüfbar, gesamt) | 1 | **2** (+1 durch korrekte TES16-Bewertung) |

### TES16 `ACCELERATION 03:50:20–03:50:23` (explizit neu)

| | v1 | v2 |
| --- | --- | --- |
| Orakel `03:50:14–16` (Δv 13 km/h) | `TREFFER_FRAGMENT` (Lücke 3 s, durch Doppelerweiterung „getroffen“) | **keine** Orakelzuordnung (Lücke 3 s > 2 s) |
| Referenz im DS4-Fenster | flach ≈ 133 km/h | unverändert |
| C4 | 113,1 → 148,3 (`DEGRADED`, überbrückte 1-s-Lücke) | unverändert |
| Klasse | Fragment | **`FEHLALARM`** (gerichtete Referenz-Δv < minΔv / flache Anzeige) |
| T3 sichtbarer Lauf `03:50:12–17` | `ERKANNT` (mit Fragment) | `ERKANNT` (Orakel `03:50:14–16` + separates DS4-Ereignis) |

**Fazit F2:** Das Ereignis bleibt ein **detektiertes** DS4-Manöver, ist unter korrekter Zuordnung aber **kein T2-Treffer** und kein Fragment mehr — es ist ein **harter Fehlalarm** gegen die Video-Referenz (Mechanismus: Jitter/SPARSE über Lücke, K3 blind am Startdip).

## 2. Kennzahlen nach Referenzstufe (getrennt)

Aus `summary.metricsLayers` (je Fahrt) und gepoolt `outputs/match2s/summary.json`.

**Legende:** *erkannt* = DS4 meldet; *akzeptiert* = nicht `ARTEFACT_SUSPECT` (Produktionssemantik); *korrekt (T2)* = Klasse `TREFFER` nach Zuordnung zum Video-Orakel (derselbe Detektor auf 1-Hz-Referenz).

### Gepoolt EVAL (TIG22 + TES16)

| Schicht | Kennzahl | Wert |
| --- | --- | --- |
| DS4 | erkannt / akzeptiert / prüfbar / nicht prüfbar | 37 / 37 / **28** / 9 (`UNVERIFIZIERBAR` 8 + `FEHLALARM_UNBESTIMMT` 1) |
| **T2** (Orakel) | Manöver gesamt / hart | 36 / 17 |
| **T2** | Orakel `ERKANNT` / hart `VERPASST` / grenzwertig / keine DS4-Speed | 27 / 1 / 7 / 1 |
| **T2** | DS4 korrekt (`TREFFER`) / Fragmente | **27** / **0** |
| **T2** | harte Fehlalarme (prüfbar) | **1** (TES16 03:50:20) |
| **T1** (nur TIG22) | Operatorfenster 9: `ERKANNT` / `VERPASST_OBERHALB_SCHWELLE` / `UNTERHALB_SCHWELLE` | 7 / 2 / 0 |
| **T3** | sichtbare Läufe: `ERKANNT` / `VERPASST_OBERHALB` / nicht erwartet unterhalb | 27 / 9 / 54 (gepoolt TIG22+TES16) |

Recall harte Orakel-Manöver (EVAL): **0,94** (16/17; unverändert zur v1-Zählung der Orakelstatus).

### Gepoolt alle vier Fahrten

| | v1 main | v2 match2s |
| --- | --- | --- |
| TREFFER | 33 | 33 |
| Fragment | 1 | 0 |
| FEHLALARM (hart) | 1 | **2** |
| WEICHER_FEHLALARM | 1 | 1 |

## 3. Kandidaten K-A2 und K-B (`match2s`, §10 + bekannte Fälle)

| Kandidat | §10 | Wirkung auf **bekannte** Fälle (≠ unabhängiger Nachweis) |
| --- | --- | --- |
| **K-A2** (kein `DEGRADED` akzeptieren) | **NOT_PROVEN** (Kriterium 1: keine harte FA-Reduktion auf **unabhängiger** EVAL-Fahrt; abgeleitet u. a. aus TES16) | TES16 03:50:20: bleibt `FEHLALARM`, **nicht mehr akzeptiert**; TIG22 Trip-Ende-`DEGRADED`/`LIMITED` außerhalb Video: nicht akzeptiert |
| **K-B** (K3 + Vor-Ereignis-Niveau) | **NOT_PROVEN** (wie v1; abgeleitet aus TES16) | TES16 03:50:20: `ARTEFACT_SUSPECT`, **nicht akzeptiert**; Klasse bleibt `FEHLALARM` unter v2 |

`NOT_PROVEN` bedeutet: die **vorab fixierten** §10-Kriterien für unabhängige Validierung sind nicht erfüllt — **nicht**, dass die Kandidaten wirkungslos sind. Details: [`outputs/match2s/CANDIDATES.md`](outputs/match2s/CANDIDATES.md).

## 4. TIG22 19:04 — Forensik (Trip-Ende)

Vollständiges Raster: [`outputs/match2s/TIG22_TRIP_END_FORENSIC.md`](outputs/match2s/TIG22_TRIP_END_FORENSIC.md).

| Befund | Status |
| --- | --- |
| Positionsgitter unregelmäßig (Δt 1–3 s), viele `NO_POSITION`/`NO_SUPPORT` | **bestätigt** |
| C4 oft `SPARSE_SUPPORT` / `JITTER_SUSPECT`; ein `OUTLIER_REJECTED` (19:04:37, Chord-Abweichung) | **bestätigt** |
| C4 vs. OBD (Vergleich): wiederholt Ratio ≈ 1,5–2,0 wenn beide da | **bestätigt** (keine Video-GT) |
| Vier DS4-Ereignisse, zwei mit §8-Mittel > 4,5 m/s² | **Verdacht** unplausibel (Vorsortierung, nicht aus 0–100-Zeit allein) |
| Fachliche Falschheit (Richtung/Dauer) | **nicht bewertbar** ohne Referenz im Fenster |

## 5. Was können wir jetzt belastbar korrigieren — was braucht mehr Video?

### Jetzt belastbar (ohne neue Videodaten)

| Maßnahme | Adressiert | Art |
| --- | --- | --- |
| **Methodik v2** (N4) | Fehlklassifikation Fragment vs. Fehlalarm (TES16 03:50:20) | Auswertung, kein Produktionscode |
| **K-B als Detektor-Option** (nicht Default) | F2-Mechanismus TES16 03:50:20 (`ARTEFACT_SUSPECT`, regressionsfrei außer Markierung) | Kleine Detektor-Erweiterung; §10 weiter NOT_PROVEN bis unabhängige EVAL-Fahrt |
| **K-A2 / Qualitäts-Akzeptanz** | Nicht-OK-Ereignisse nicht zählen (F4); Trip-Ende außerhalb Video de-akzeptieren | Processor-Akzeptanz; **erst** nach Shadow-Zählern + unabhängiger EVAL-Fahrt |
| **Shadow-`summary_json`**: Zähler je Qualität/Art | F4 Beobachtbarkeit | Kein Verhaltenswechsel |

### Braucht zusätzliche **unabhängige** Videoreferenz

| Thema | Warum |
| --- | --- |
| **F1** Anfahr-Onset (+4–5 s, 2× hart verpasst) | Grenzsetzung vs. echte Manöver nur mit dichter Positionsquelle + Anfahrten im Video belegbar |
| **F3** Trip-Ende 19:04 | Video endet vorher; OBD nur Vergleich — keine Manöver-Referenz |
| **§10 PROVEN** für K-A2/K-B | Mindestens eine EVAL-Fahrt, die **nicht** in `derivedFrom` des Kandidaten liegt, mit hartem Fehlalarm im Referenzfenster |

Keine Schwellenoptimierung, keine Produktionsänderung, kein Merge/Deploy in diesem Workstream.

## 6. Reproduktion

```bash
cd research/driving-intelligence/evaluations/ds4-accel-brake-video-reference-20261023
node scripts/replay_event_eval.cjs --tag match2s --matching v2_gap2s
node scripts/candidates.cjs --tag match2s --only K-A2,K-B
node scripts/tiguan_trip_end_forensic.cjs
node scripts/probe_windows.cjs --tag match2s
node scripts/render_tables.cjs --tag match2s
```

Legacy v1: `--tag main --matching v1_bilateral` (eingefroren unter `outputs/main`).
