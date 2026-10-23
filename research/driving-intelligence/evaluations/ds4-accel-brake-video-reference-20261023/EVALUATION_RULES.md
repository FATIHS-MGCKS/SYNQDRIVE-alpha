# Bewertungsregeln — DS4 Beschleunigungs-/Bremsereignisse gegen Video-Referenzen (2026-10-23)

Dieses Dokument wurde **vor** der ersten Ereignisauswertung festgelegt. Es ist verbindlich für
`outputs/**`, `REPORT.md` und jede Kandidatenbewertung. Änderungen nach der ersten Berechnung sind nur als
datierter Nachtrag in Abschnitt 12 erlaubt, nie als stille Umformulierung.

Scope: **Erkennung von Beschleunigungs- und Bremsmanövern** (Richtung, Beginn, Ende, Δv, Dauer) durch den in
Produktion verdrahteten DS4-Ereignisdetektor. **Nicht** im Scope: Verschleiß-/Belastungs-Scores,
Klassifikation LIGHT/MODERATE/HARD, erneute Optimierung der Geschwindigkeitspfade (L3/C4/FSM), Produktions-,
Flag-, Merge- oder Deploy-Änderungen.

## 1. Prüfgegenstand (Code-Pfad, unverändert)

| Element | Wert |
| --- | --- |
| Code-Stand | `origin/main` `579ee8b2fed06593d7d2aa57cffb6036dbf53a24` (= Produktions-Release vom 2026-10-23, PR #2138) |
| Detektor | `detectMotionManoeuvreEvents(trip, c4, 'C4_ADAPTIVE_L3', usableQualities, MOTION_EVENT_V0_2_CANDIDATE_OPTIONS)` wie im Shadow-Prozessor `di-v0-motion-core-shadow-processor.ts` verdrahtet |
| Eingangsserie | C4 `computeC4AdaptiveL3` (`MOTION_CORE_SPEED_C4_V0_5_DEV`, Leg-Quarantäne intern), **ohne** OBD-Speed (R1-Grenzschicht #2137) |
| Schwellen | `MOTION_EVENT_HF_THRESHOLDS_V1`: Eintritt 1,5 m/s², Fortsetzung 1,2 m/s², ≥ 2 Schritte, Δv ≥ 4,0 (Beschl.) / 3,0 (Verz.) km/h, Verschmelzung < 2,0 / 1,5 s |
| Guards | `MOTION_CORE_EVENT_GUARDS_V0_1_DEV`: Segmentbruch bei Lücke > 2 s, 2 s Nach-Lücken-Sperre, nutzbare Qualitäten OK/SPARSE_SUPPORT/JITTER_SUSPECT/REPAIRED/SPAN_SUPPORT/SPAN_DERIVED |
| K3 | `spikeReversionCheck` (Fenster 2 s) → Qualität `ARTEFACT_SUSPECT`, Ereignis bleibt erhalten |
| Ereignisse werden gezählt als | Replay auf identischen gepinnten Eingaben (S4-Evidenzcontainer / Positions-Grid) — **kein** Lesen von Produktionsintervallen; für TIG22 zusätzlich Paritätsprüfung gegen den in Produktion gespeicherten Lauf (Bundle `…_POINT_AUTH_V4`, Run `15cdc8ae`, 2026-10-23 11:16:33Z) |

Der Legacy-Pfad `trips/hf-acceleration.ts` / `trips/hf-braking.ts` (`CleanHfPoint`, DIMO-HF-Signale,
`trip-behavior-enrichment.service.ts`) wird **inventarisiert, nicht replayt**: Er konsumiert nicht die
DS4-Geschwindigkeit, und für die vier Referenzfahrten liegen keine gepinnten HF-Eingaben vor. Seine Schwellen
sind mit `MOTION_EVENT_HF_THRESHOLDS_V1` identisch (siehe `DETECTOR_INVENTORY.md`).

## 2. Referenzfahrten und Rollen (Ereignisdetektor)

| ID | Referenz | Lesbare s | Rolle für den Ereignisdetektor | Begründung |
| --- | --- | --- | --- | --- |
| **TIG22** | Tiguan, digitaler Tacho 1 Hz, 9 Clips, 18:38:34–19:03:02Z | 1417 | **EVAL** | Guards V0.1 und K3 wurden auf Tesla-21 entworfen; TIG22 war DEV nur für die GPS-Leg-Quarantäne (C4), nicht für den Detektor |
| **TES21-1** | Tesla-Display, Trip `14c41c06`, 12:03:06–12:07:05Z | 229 | **DEV** | Fable-Port und K3 wurden auf TRIP_1/TRIP_2 validiert („7 display-manoeuvre overlaps (±3 s)“, `CHANGE_LEDGER` 2026-10-21) |
| **TES21-2** | Tesla-Display, Trip `7a9d6a28`, 12:19:59–12:24:11Z | 240 | **DEV** | wie oben |
| **TES16** | Tesla-Tacho, Trip `358d0158`, 03:37–03:55Z | 973 | **EVAL** | nicht im Motion-Core-Design verwendet |

Aussagen über unabhängige Erkennungsgüte stützen sich auf **TIG22** und **TES16**. TES21 liefert
Entwicklungs-Konsistenz. Kein Video wird erneut gesichtet; ausschließlich die versiegelten Tabellen aus
`../ds4-speed-video-reference-20261023/inputs/` und dem LDI-10D-Fixture werden gelesen (SHA-256 in `INPUT_MANIFEST.json`).

## 3. Auflösung und Zeitunsicherheit der Referenz

- Referenz ist eine **1-Hz-Ablesung einer digitalen Anzeige**, quantisiert auf 1 km/h, mit Uhrunsicherheit ±1 s
  (TIG22: Overlay-Uhr; TES21: `EXTERNAL_CLOCK_OFFSET_UNVALIDATED`, Annahme UTC+02; TES16: sichtbare Uhr).
- Eine 1-s-Differenz zweier Ablesungen trägt daher eine Unsicherheit von bis zu ±2 km/h (Quantisierung beider
  Werte + Anzeige-Aktualisierungslatenz) ≈ **±0,56 m/s²**. Eine „momentane“ Beschleunigung aus der Referenz wird
  **nicht** behauptet; 1-s-Schritte werden nur zur Schwellenprüfung mit explizitem Unsicherheitsband benutzt,
  Intensitäten werden als 2-s-Mittel oder Manöver-Mittel berichtet.
- **Unsicherheitsband** `BORDERLINE_BAND_MPS2 = 0,6`: Referenzmanöver, deren maximaler 1-s-Schritt im Band
  [1,5; 2,1) liegt, gelten als **grenzwertig** (Erkennung nicht sicher erwartbar). DS4-Ereignisse, für die die
  Referenz im Fenster einen Schritt in [0,9; 1,5) zeigt, gelten als **grenzwertig** (Fehlalarm nicht sicher).
- **Matching-Toleranz** `MATCH_TOL_S = 2` (±1 s Uhr + ±1 s Label-Semantik der 1-Hz-Buckets). Zeitversätze werden
  dennoch in Sekunden berichtet; Werte |Versatz| ≤ 2 s gelten als „im Rahmen der Unsicherheit“.
- Referenz-Nulllauf, Clipgrenzen und unlesbare Sekunden unterbrechen die Referenzserie; über solche Lücken wird
  **nichts interpoliert** und **kein** Manöver abgeleitet.

## 4. Referenzmanöver — drei Stufen

**T1 — Operator-Fenster (nur TIG22):** die 9 Zeilen aus `TIGUAN_2026-10-22_analysis_windows.csv`
(Typ, Beginn/Ende lokal, Start-/Endanzeige, Dauer, mittlere Anzeige-Beschleunigung). Sie werden unverändert
übernommen (UTC = lokal − 2 h) und als unabhängige Sichtprüfung geführt. Ihre `mean_display_accel_mps2` liegt
teils unter der Detektorschwelle; ein Nicht-Treffer wird dann als `UNTERHALB_SCHWELLE` (nicht als Fehler) geführt.

**T2 — Orakelmanöver:** derselbe Detektor (`detectMotionManoeuvreEvents`, identische Schwellen, Guards, K3)
wird auf die **Referenzserie** angewendet (Anzeige-km/h als perfekte 1-Hz-Serie, Qualität `OK`, unlesbare
Sekunden fehlen → Segmentbruch wie im Detektor). T2 beantwortet: *Was würde der Detektor bei fehlerfreier
Geschwindigkeit melden?* Abweichungen DS4 ↔ T2 isolieren damit den Einfluss des Geschwindigkeitsfehlers von der
Schwellenauslegung. Jedes T2-Manöver erhält `peak1sMps2`, `peak2sMps2`, `grenzwertig` (§3).

**T3 — sichtbare Manöver (vollständiges Inventar):** maximale Läufe aufeinanderfolgender lesbarer Sekunden mit
monotoner Anzeige in einer Richtung (Schritte ≥ 0 bzw. ≤ 0; höchstens 2 aufeinanderfolgende Null-Schritte als
Plateau), |Δv| ≥ 10 km/h, Dauer ≥ 3 s. Jeder Lauf erhält Δv, Dauer, Mittel, max. 1-s-Schritt, max. 2-s-Mittel und
`oberhalb_schwelle` = enthält/überlappt mindestens ein T2-Manöver gleicher Richtung. T3 beantwortet: *Welche sichtbaren
Manöver gibt es überhaupt, und welche davon liegen per Auslegung außerhalb der Detektorschwelle?*

## 5. Zuordnung DS4-Ereignis ↔ Referenz

1. **Verifizierbarkeit:** Ein DS4-Ereignis ist `UNVERIFIZIERBAR`, wenn es außerhalb des Referenzfensters liegt oder
   mehr als 50 % der Sekunden in [Beginn − 1, Ende + 1] in der Referenz unlesbar sind. Es wird gelistet, aber weder
   als Treffer noch als Fehlalarm gezählt.
2. **Primärzuordnung zu T2** (gleiche Richtung): zeitliche Überlappung der um ±`MATCH_TOL_S` erweiterten Intervalle.
   Bei mehreren Kandidaten gewinnt die größte Überlappung. Ein T2-Manöver kann von mehreren DS4-Ereignissen
   getroffen werden: das erste ist `TREFFER`, jedes weitere `TREFFER_FRAGMENT` (Duplikat/Fragmentierung).
   Überspannt ein DS4-Ereignis zwei T2-Manöver, zählt es als ein `TREFFER`; das zweite T2-Manöver gilt als
   `ABGEDECKT_DURCH_VERSCHMELZUNG`, nicht als verpasst.
3. **Nicht zugeordnete DS4-Ereignisse:** Referenz-Δv im Fenster [Beginn − 1, Ende + 1] in Ereignisrichtung
   (max − min in Richtung, nur lesbare Sekunden) und max. 1-s-Schritt in Richtung:
   - Richtung stimmt, Referenz-Δv ≥ `minDeltaKmh[kind]` und max. Schritt ≥ 0,9 m/s² → `WEICHER_FEHLALARM`
     (Manöver sichtbar, Intensität nur in DS4 oberhalb der Schwelle; grenzwertig).
   - Richtung stimmt, Referenz-Δv ≥ `minDeltaKmh[kind]`, max. Schritt < 0,9 m/s² → `FEHLALARM_INTENSITAET`
     (sichtbares, aber eindeutig sanftes Manöver; DS4 überschätzt die Intensität deutlich).
   - Referenz-Δv < `minDeltaKmh[kind]` oder Gegenrichtung → `FEHLALARM` (hart).
4. **T2-Manöver ohne DS4-Treffer:** `VERPASST` (hart), `VERPASST_GRENZWERTIG` (§3), oder `VERPASST_KEINE_DS4_GESCHWINDIGKEIT`,
   wenn im Fenster ≥ 50 % der Sekunden keine nutzbare C4-Geschwindigkeit haben (Abdeckungs-, nicht Detektorproblem).
5. **T3-Läufe:** `ERKANNT`, `VERPASST_OBERHALB_SCHWELLE`, `NICHT_ERWARTET_UNTERHALB_SCHWELLE`,
   `ERKANNT_UNTERHALB_SCHWELLE` (DS4 meldet, obwohl Referenz unterhalb; = Intensitätsüberschätzung, kein harter Fehlalarm).

## 6. Kennzahlen je Treffer

Für jedes `TREFFER`-Paar (DS4 ↔ T2): Beginn-Versatz = DS4-Beginn − Referenz-Beginn (s, positiv = spät),
Ende-Versatz analog, Dauerdifferenz, **Δv-Differenz** = Δv_DS4 − Δv_T2, sowie **Δv-Fehler bei gleichem Fenster**
= Δv_DS4 − (Referenz(Ende) − Referenz(Beginn)) an den DS4-Labels (isoliert den Geschwindigkeitsfehler vom
Grenzfehler; nur wenn beide Referenzwerte lesbar). Zusätzlich für T1-Fenster: bestes DS4-Ereignis gleicher Richtung
mit Überlappung und dieselben Versätze.

Aggregation pro Fahrt und gepoolt (EVAL = TIG22 + TES16 getrennt von DEV): Median, Min, Max, Anteil |Versatz| ≤ 2 s.

## 7. Lücken- und Quarantänegrenzen

Je DS4-Ereignis werden berechnet: Sekunden seit Segmentbeginn (erste nutzbare C4-Sekunde des Detektorsegments),
Sekunden bis Segmentende, Abstand zur nächsten nicht nutzbaren C4-Sekunde (null oder Qualität außerhalb der
Guard-Liste), Abstand zur nächsten quarantänierten Sekunde (`OUTLIER_REJECTED` oder Flag
`IMPLAUSIBLE_1S_LEG_ENDPOINT_UNCERTAIN`), Abstand zur nächsten Grid-Sekunde ohne Positionszeile, Anteil
Nicht-`OK`-Qualitäten im Ereignis, Flags, Ereignisqualität. `NAHE_GRENZE` = min(Segmentbeginn, Segmentende,
Quarantäneabstand) ≤ 2 s. Kreuztabelle Klassifikation × `NAHE_GRENZE` und × Ereignisqualität.

## 8. Physikalische Plausibilitätsschranken (orthogonal, fahrzeugklassenabhängig)

Keine Ground Truth, nur Vorsortierung außerhalb des Videofensters. Ein Ereignis ist `PHYSIKALISCH_UNPLAUSIBEL`, wenn
sein Mittel über ≥ 2 s die Klassenschranke überschreitet:

| Fahrzeug | Beschleunigung Mittel max | Verzögerung Mittel max | Begründung |
| --- | --- | --- | --- |
| VW Tiguan (TIG22) | 4,5 m/s² | 9,0 m/s² | 0–100 km/h ≥ 6 s selbst für sportliche ICE-SUV (≈ 4,6 m/s²); Bremsen ≈ 1 g Haftgrenze |
| Tesla (TES16/21) | 9,0 m/s² | 9,0 m/s² | Performance-Varianten 0–100 ≈ 3,3 s (≈ 8,4 m/s²) |

Zusätzlich wird je Ereignis vermerkt, ob die End-/Startgeschwindigkeit über dem **Fahrtmaximum der Referenz + 20 km/h**
liegt (`UEBER_REFERENZMAXIMUM`); innerhalb des Videofensters ist das ein Indiz, außerhalb nur ein Hinweis.

## 9. Produktionsparität (TIG22)

Die 20 in Produktion gespeicherten Ereignisse des Laufs `15cdc8ae` (Bundle `…_POINT_AUTH_V4`, 2026-10-23 11:16:33Z,
Payload-SHA in `INPUT_MANIFEST.json`) müssen mit dem Replay auf `579ee8b2` **schlüsselgleich** sein
(`kind|startLabel|endLabel`, Start-/Endgeschwindigkeit, Δv, Qualität, Flags). Abweichung = eigener Befund.

## 10. Kandidatenkriterien (vor jeder Kandidatenbewertung fixiert)

Ein isolierter Offline-Kandidat **auf Ereignisebene** (z. B. Guard-/Qualitäts-/Plausibilitätsregel) gilt nur dann
als belegte Verbesserung, wenn auf identischen Eingaben und **unverändertem C4** (Paritäts-Assert):

1. Harte `FEHLALARM`e sinken auf mindestens einer EVAL-Fahrt und steigen auf keiner Fahrt.
2. Kein zusätzliches `VERPASST` (hart) auf irgendeiner Fahrt; `VERPASST_GRENZWERTIG` darf nicht um mehr als 1 steigen.
3. `TREFFER` sinken auf keiner Fahrt; Fragmentierung (`TREFFER_FRAGMENT`) steigt nicht.
4. Median-Beginn-/Ende-Versatz verschlechtert sich auf keiner Fahrt um > 1 s.
5. Keine zusätzliche Vorausschau über `MOTION_EVENT_SPIKE_REVERSION_WINDOW_S` / `postGapGuardS` hinaus.
6. Ein Kandidat, der aus einer Fahrt abgeleitet wurde, kann auf dieser Fahrt keine unabhängige Validierung beanspruchen.
7. Änderungen an L3/C4/FSM/Speed-QC sind **kein** zulässiger Kandidat dieses Workstreams.

Nicht erfüllt → `NOT_PROVEN`, dokumentiert, nicht weiterverfolgt.

## 11. Was nicht gemacht wird

- Keine Verschleiß-, Belastungs- oder Intensitätsklassen (LIGHT/HARD) bewerten.
- Keine Zeitverschiebung zur Trefferoptimierung; nominaler Versatz 0 s, Toleranz nur ±2 s symmetrisch.
- Keine Interpolation von Referenz oder DS4; keine Manöver über Clip-/Lesbarkeitslücken.
- Keine Ereignisse außerhalb des Referenzfensters als falsch oder richtig zählen.
- Keine Produktionsänderung, Flag-Aktivierung, Jobstart, Merge, Deploy.

## 12. Nachträge

Datierte Ergänzungen nach der ersten Auswertung. §1–§11 bleiben unverändert.

### N1 (2026-10-23, nach erstem Lauf `outputs/main`) — Artefaktsicht und einseitige Toleranz

Befund: Die beidseitige ±2-s-Erweiterung (§5.2) lässt ein DS4-Ereignis, das bis zu 4 s **nach** dem Orakel-Ende
beginnt, noch als `TREFFER_FRAGMENT` zählen (TES16 03:50:20–23, Referenz flach ≈ 133 km/h, C4 113→148 km/h).
Die Primärklassifikation bleibt unverändert (keine rückwirkende Regeländerung). Zusätzlich werden berichtet:

- `artefact_suspect_view` je DS4-Ereignis: `1`, wenn Klasse `TREFFER`/`TREFFER_FRAGMENT` und
  `|delta_err_same_window_kmh| > 15` (Δv des Ereignisses weicht um mehr als 15 km/h von der Referenzänderung
  im selben Fenster ab). Reine Sicht, kein Klassenwechsel.
- Sensitivität `strictMatching`: Zuordnung mit Toleranz nur auf Orakelseite (DS4-Intervall unverändert).
  Je Fahrt werden Klassenzähler unter dieser Sicht zusätzlich ausgewiesen (`summary.drives[].sensitivity.strict`).

### N2 (2026-10-23, nach erstem Lauf `outputs/main`) — `FEHLALARM_INTENSITAET` nur bei lesbarer Referenz

Befund: TES16 03:41:00–03 wurde `FEHLALARM_INTENSITAET`, obwohl 03:41:00–02 nicht ablesbar sind (genau 50 %
unlesbar, §5.1 greift erst bei > 50 %). Die Richtungs-Δv-Prüfung (§5.3) lief damit über zwei nicht benachbarte
lesbare Sekunden; eine Intensitätsaussage ist so nicht belegbar.

Regel (zusätzliche Klasse, nur für bisher unzugeordnete Ereignisse): Ergibt §5.3 `FEHLALARM_INTENSITAET` oder
`WEICHER_FEHLALARM`, aber das Fenster `[s−1, e+1]` enthält **weniger als 2 aufeinanderfolgende lesbare
Sekundenpaare**, lautet die Klasse `FEHLALARM_UNBESTIMMT`. Sie zählt wie `UNVERIFIZIERBAR` (nicht zu den harten
Fehlalarmen, nicht zu den prüfbaren Ereignissen). Harte `FEHLALARM`e (keine gerichtete Referenzänderung ≥ minΔv)
bleiben unverändert.

### N3 (2026-10-23, vor Kandidatenlauf) — Akzeptanzsicht

Produktion zählt `eventAcceptedCount` ohne `ARTEFACT_SUSPECT` (Prüfgegenstand §1). Für Kandidatenvergleiche nach
§10 werden Klassenzähler und Orakelstatus zusätzlich auf der **akzeptierten Teilmenge** berechnet
(`accepted = quality ≠ ARTEFACT_SUSPECT` bzw. die Akzeptanzregel des Kandidaten). Ein Kandidat, der ein Ereignis
nur de-akzeptiert statt entfernt, wird auf dieser Teilmenge gegen die Baseline-Teilmenge verglichen. §10 Kriterium 3
gilt dabei für akzeptierte `TREFFER`.

### N4 (2026-10-23, nach Methodik-Review) — Zeitzuordnung: Gesamttoleranz ±2 s ohne doppelte Intervallerweiterung

**Befund (erster Lauf `outputs/main`):** §5.2 wurde im Skript als beidseitige Erweiterung **beider** Intervalle um jeweils
`MATCH_TOL_S` (2 s) auf **jeder** Seite umgesetzt (`overlapS` mit `aStart−tol`, `bStart−tol`, `aEnd+tol`, `bEnd+tol`).
Damit können Intervalle mit bis zu **4 s** effektivem Zwischenraum noch als überlappend gelten — widerspricht der in §3
gemeinten **Gesamttoleranz** ±2 s (±1 s Uhr + ±1 s Label-Semantik als **ein** Budget, nicht zweimal angewendet).

**Korrigierte Primärzuordnung (ab `outputs/match2s`, Schema V2):** Zwei Intervalle (inklusive Sekundenindizes) gelten als
zuordenbar, wenn der **Lückenabstand** `intervalGapS` ≤ `MATCH_TOL_S` ist (0 bei echter Überlappung). Tie-Breaker =
Überlappungslänge in Sekunden, sonst `MATCH_TOL_S − gap`. Der erste Lauf bleibt unter `outputs/main` mit
`matchingMode=v1_bilateral` eingefroren; `REPORT_v1_main.md` dokumentiert ihn unverändert.

**Auswirkung (Beispiel):** TES16 `ACCELERATION 03:50:20–03:50:23` war unter v1 ein `TREFFER_FRAGMENT` zum Orakel
`03:50:14–03:50:16` (Lücke 3 s); unter v2 **keine** Orakelzuordnung → `FEHLALARM` bzw. Intensitätsklasse nach §5.3
(Referenz im Fenster flach ≈ 133 km/h, C4 113→148).

**Kennzahlen-Schichten (V2):** `summary.metricsLayers` trennt explizit
`ds4.{detected,accepted,verifiable}`, `t2_sameDetectorOnVideoSpeed` (Orakel-Treffer/VERPASST),
`t1_operatorWindows`, `t3_visibleRuns`, `nonEvaluable` — ohne Vermischung der Referenzstufen.

**§10 unverändert;** Kandidaten auf `match2s` werden zusätzlich gegen **bekannte Fehlerfälle** F1–F4 berichtet
(Wirkung auf dokumentierte Mechanismen ≠ unabhängige Validierung).
