# Bewertungsregeln — DS4 Geschwindigkeit gegen Video-Referenzen (2026-10-23)

Dieses Dokument wurde **vor** der ersten Metrikberechnung und **vor** jeder Kandidatenbewertung festgelegt.
Es ist verbindlich für `outputs/*.json`, `outputs/*.csv` und `REPORT.md`. Änderungen nach der ersten
Berechnung sind nur als datierter Nachtrag erlaubt (Abschnitt 11), nie als stille Umformulierung.

Scope: **Geschwindigkeitsverlauf inkl. Stillstand und Anfahren.** Beschleunigungs-/Bremsdetektoren werden
weder entwickelt noch optimiert; Ereignisse werden nur als Paritätszähler (unverändert / verändert) mitgeführt.

## 1. Vergleichspfade (DS4-Code) und historische Bestände

| Kürzel | Code-Pfad (aktueller `main`, DI-Core identisch mit Produktion) | Historisch gespeicherter Bestand |
| --- | --- | --- |
| **L3** | `replayFrozenL3OnGrid` → `evaluateL3AtCenter` (DI-V0 Kinematik, Kalender t−1/t/t+1) | Tiguan-22: `di_v0_shadow_intervals.csv` (Shadow Run); Tesla-21: `TRIP_x_shadow_intervals.jsonl`; Tesla-16: `pinnedProductionL3Kmh` im Fixture-Grid |
| **C4** | `computeC4AdaptiveL3` (Motion Core, `MOTION_CORE_SPEED_C4_V0_1_DEV`) | Tiguan-22: `di_v0_motion_core_shadow_payload.json` (`speeds[]`, Motion-Shadow-Run); Tesla-21/16: **kein** gespeicherter C4-Bestand (nur Replay) |
| **FSM** | `runMotionFsm` V0.3-Kandidat (wie im Shadow-Prozessor verdrahtet) | Tiguan-22: `fsmLabels[]`/`stopEpisodes[]` derselben Payload |
| **OBD** | R1-OBD `speed` aus dem pinned S4-Container (Bucket-Label, Messzeit unbekannt) | Tiguan-22 only; **Vergleichsquelle, keine Ground Truth** |

Historische Bestände und aktuelle Replays werden **getrennt** ausgewiesen (Spalten `stored_*` vs. `replay_*`).
Abweichungen zwischen beiden sind eigene Befunde (Versionsdrift), keine Referenzfehler.

Zweiter Replay-Stand: PR #2134 (`f95420593`, **nicht** gemergt, **nicht** in Produktion) wird als
`replay_2134_*` nur für Tiguan-22/Tesla auf identischen Eingaben mitgeführt; er ist kein Produktionsstand.

## 2. Referenzfahrten, Zeitbasis, Rolle

| ID | Fahrt | Quelle | Referenz | Zeitbasis / Anker | Unsicherheit | Rolle für C4 (main) | Rolle für #2134 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| **TIG22** | VW Tiguan, Trip `98d2a8e0`, 2026-10-22, RUPTELA_R1 (GPS 1 Hz + OBD sparse) | 9 Clips TC_00077–TC_00085 | Digitaler Tacho 1 Hz, 1464 Zeilen, 1417 lesbar, 18:38:34–19:03:02Z | QuickTime `creation_time` + sichtbare Overlay-Uhr (Telefon), nominal 0 s | ±1 s Uhr, Telefon-Uhr nicht kalibriert | **EVAL** (C4 V0.1 wurde nicht auf TIG22 entworfen) | **DEV** (Exp A/B → Leg-Quarantäne/OBD-Autorität wurden auf TIG22 abgeleitet) |
| **TES21-1** | Tesla, Trip `14c41c06`, 2026-10-21 11:58–12:06Z, API_SYNTHETIC (DIMO), Position dünn | TC_00073 ff. | Tesla-Display, 492 Zeilen gesamt (beide Trips), 469 lesbar | Display-Uhr lokal, Annahme UTC+02 | `EXTERNAL_CLOCK_OFFSET_UNVALIDATED` | **DEV** (Motion-Core-Design-Prototyp, C4+FSM auf diesen zwei Fahrten entworfen) | DEV |
| **TES21-2** | Tesla, Trip `7a9d6a28`, 12:15–12:23Z | wie oben | wie oben | wie oben | wie oben | **DEV** | DEV |
| **TES16** | Tesla, Trip `358d0158`, 2026-10-16 03:36–03:54Z, API_SYNTHETIC | TC_00062–TC_00067 | Tesla-Tacho, 1136 Grid-Sekunden, 973 lesbar, 135 Anzeige-Null | Sichtbare Uhr, Europe/Berlin → UTC, nominal 0 s | Quantisierte Anzeige, keine Subsekunden-Kalibrierung | **EVAL** (nicht im Motion-Core-Design verwendet; nur L3-/Matcher-Audits) | EVAL |

Konsequenz: Aussagen über „unabhängige“ Genauigkeit von C4 (main) stützen sich auf **TES16** und **TIG22**;
TES21 liefert nur Entwicklungs-Konsistenz. Für #2134 ist nur TES16 unabhängig.

Kein Video wird erneut gesichtet; ausschließlich die vorhandenen, versiegelten Referenztabellen werden benutzt.
Große Videodateien werden nicht ins Repository kopiert.

## 3. Zeitzuordnung

1. Nominale Zuordnung **Versatz 0 s** über die unabhängigen Anker aus Abschnitt 2. Keine Wahl eines Versatzes
   anhand der Fehlerwerte.
2. Referenzzeit pro Zeile: TIG22 `time_utc_estimated`; TES21 `bucket_label_utc`; TES16 `bucketLabelUtc`.
3. Matching: **exakte Kalendersekunde** (Referenzsekunde = Bucket-Label). Keine Interpolation.
4. Sensitivität: Verschiebung des DS4-Lookups um −2, −1, +1, +2 s wird **getrennt** als
   `outputs/sensitivity.json` ausgewiesen. Sie dient nur der Einordnung der Synchronisationsunsicherheit.

## 4. Paarungsmaske und Abdeckung

Eine Referenzsekunde zählt als **lesbar**, wenn der Referenzwert numerisch ist. Sie zählt als **gepaart**
für einen Pfad, wenn der Pfad dort einen numerischen Wert liefert. Fehlende DS4-Werte werden **nie** als
0 oder als korrekt gezählt. Pro Pfad und Fahrt: `reference_rows`, `readable`, `paired`,
`missing_estimate_on_readable`, sowie Ausschlusscodes:

| Code | Bedeutung |
| --- | --- |
| `REF_SPEED_MISSING` | Referenz nicht lesbar |
| `OUTSIDE_GRID` | Referenzsekunde außerhalb des DS4-Grids |
| `DS4_NULL` | Grid-Sekunde vorhanden, Pfad liefert keinen Wert |

## 5. Geschwindigkeitskennzahlen

Auf der Paarungsmaske je Pfad: `n`, MAE, Median |e|, P95 |e|, max |e|, Bias (DS4 − Referenz), RMSE,
Anteil |e| ≤ 3 / ≤ 5 km/h. Fehler e = DS4 − Referenz in km/h.

Zusätzlich **gemeinsame Sekunden** (common support) für jeden Pfadvergleich (z. B. L3 vs. C4, C4 vs. OBD,
main vs. #2134): nur Sekunden, in denen **beide** Pfade einen Wert liefern. Kein Pfad gewinnt durch Weglassen.

Segmente: Referenz = 0; (0, 30); [30, 60); [60, 100); ≥ 100 km/h; sowie Phase „stetig“ vs. „ändernd“
(Referenz-|Δv| über ±2 s ≥ 5 km/h → ändernd).

## 6. Stillstand, Anfahren, Bewegung

Referenzdefinitionen (±1 s Uhrunsicherheit wird durch Kernsekunden abgefangen):

- **Bestätigter Stillstand (Kern):** Referenzwert 0 innerhalb einer sichtbaren Nullfolge mit ≥ 3 aufeinander
  folgenden Nullsekunden, ohne die erste und letzte Sekunde der Folge.
- **Bestätigte Bewegung:** Referenzwert ≥ 5 km/h und beide Nachbarsekunden lesbar mit ≥ 5 km/h.
- **Langsamrollen / mehrdeutig:** Referenz 1–4 km/h oder Randsekunden von Nullfolgen → kein
  Falsch-Zähler, wird getrennt gezählt.

DS4-Zustandsdefinitionen:

| Pfad | still | bewegt | kein Anspruch |
| --- | --- | --- | --- |
| L3 | `motion_state = STATIONARY_SUPPORTED` **oder** numerisch < 3 km/h | `MOVING_SPEED_ESTIMATED` und numerisch ≥ 5 km/h | sonst (`NO_MOTION_EVIDENCE`, `TRANSITION_UNCERTAIN`, 3–5 km/h) |
| C4 (Wert) | numerisch ≤ 3 km/h | numerisch ≥ 5 km/h | null oder 3–5 km/h |
| FSM | `STATIONARY`, `STOP_CANDIDATE` | `MOVING`, `STARTING` | `UNKNOWN` |

Zähler je Pfad: **falsche Bewegung** = DS4 „bewegt“ in bestätigtem Stillstand; **falscher Stillstand** =
DS4 „still“ in bestätigter Bewegung; „kein Anspruch“ wird separat ausgewiesen und **nicht** als korrekt gezählt.

**Zeitversatz Anhalten/Anfahren:** je sichtbarer Nullfolge mit ≥ 3 Nullsekunden und lesbaren Nachbarn:
Referenz-Halt = erste Nullsekunde, Referenz-Anfahrt = erste Sekunde > 0 nach der Folge. DS4-Halt = erste
Sekunde im Fenster [Halt − 10 s, Halt + 10 s], ab der der Pfad „still“ ist; DS4-Anfahrt = erste Sekunde
nach dem DS4-Halt, ab der der Pfad „bewegt“ ist (Fenster bis Anfahrt + 10 s). Versatz = DS4 − Referenz
(positiv = spät). Nicht gefunden → `MISSED`, gezählt, nicht gemittelt.

## 7. Dünne GPS-Stützung (Punkt B)

Pro gepaarter Sekunde werden erfasst: Positionsverfügbarkeit t−1/t/t+1, Abstand zur nächsten vorhandenen
Position (s), Länge der umgebenden Lücke (s), C4-Qualität und Flags, Stützweite `supportSpanS`.
|e| wird nach Qualität, Nachbarschaftsmuster und Abstandsklasse (0, 1, 2, 3–5, > 5 s) gruppiert.
„Bestätigter Stillstand ohne Positionszeile“ wird von „fehlende Bewegungsevidenz“ unterschieden
(Spalte `evidence_class`).

## 8. Legacy-Vorzeichen (Punkt A)

Prüfung ausschließlich an gespeicherten und replayten Ereignissen: `deltaKmh` vs. `kind`, `startSpeedKmh`,
`endSpeedKmh`. Frage: Konvention (Betrag + Richtung über `kind`), Vorzeichenfehler, oder reine Darstellung.
Zusätzlich: Hat `deltaKmh` eine Rückwirkung auf `speeds[]`/`fsmLabels[]`? (Code-Pfad und numerischer Nachweis.)

## 9. Kandidatenkriterien (vor jeder Kandidatenbewertung fixiert)

Ein isolierter Offline-Kandidat gilt nur dann als **belegte Verbesserung**, wenn auf identischen Eingaben:

1. **Gemeinsame Sekunden:** MAE sinkt um ≥ 10 % **oder** ≥ 0,3 km/h und P95 sinkt oder bleibt gleich (±0,1)
   auf mindestens einer EVAL-Fahrt (TES16 oder TIG22), **und** auf keiner anderen Fahrt MAE um > 0,1 km/h oder
   P95 um > 0,5 km/h steigt.
2. **Abdeckung:** gepaarte Sekunden je Fahrt ≥ Baseline. Werte zurückzuhalten ist keine Verbesserung.
3. **Latenz:** keine zusätzliche Vorausschau über die bestehende C4-Stützweite hinaus
   (`MOTION_CORE_C4_INPUT_HORIZON_FORWARD_S` unverändert); kein zusätzlicher Glättungsnachlauf.
4. **Stillstand/Bewegung:** falsche Bewegung und falscher Stillstand steigen auf keiner Fahrt; Median-Versatz
   Anhalten/Anfahren verschlechtert sich auf keiner Fahrt um > 1 s.
5. **Ereignisparität:** Anzahl/Schlüssel der Ereignisse wird berichtet; Änderungen sind kein Ziel und werden
   nicht als Erfolg gewertet (keine Detektorentwicklung).
6. **Dev/Eval:** Ein Kandidat, der auf einer Fahrt abgeleitet wurde, kann auf dieser Fahrt keine
   unabhängige Validierung beanspruchen.

Erfüllt ein Kandidat die Kriterien nicht, wird er als `NOT_PROVEN` dokumentiert und **nicht** weiterverfolgt.

## 10. Was nicht gemacht wird

- Keine sekundengenaue Ground Truth aus groben Tabellen; keine Interpolation von Referenz oder DS4.
- Keine Zeitverschiebung zur Fehlerminimierung.
- Keine Nutzung von OBD als Wahrheit; OBD ist Vergleichsquelle.
- Keine Produktionsänderung, Flag-Aktivierung, Merge, Deploy; PR #2135 bleibt unverändert.
- Keine Entwicklung von Beschleunigungs-/Bremsdetektoren.

## 11. Nachträge

Datierte Ergänzungen nach der ersten Metrikberechnung. Keine der ursprünglichen Regeln (§1–§10) wurde geändert;
die Kandidatenkriterien (§9) sind unverändert.

**N1 (2026-10-23, vor der ersten vollständigen Auswertung, nach dem Smoke-Test).** Der L3-Replay läuft nicht
nur über `replayFrozenL3OnGrid`, sondern über die vollständige DI-V0-Intervallpipeline
`computeDiV0TripIntervals` (Positions-Hold/Release, Motion-State-Gating, `CALIBRATION_UNSET_V0_BUNDLE`,
`DEFAULT_DI_V0_VERSION_TUPLE`). Grund: Nur dieser Pfad reproduziert die historisch gespeicherten
Shadow-Intervalle exakt (Smoke-Test: `replayFrozenL3OnGrid` allein wich auf TES16 in 46 Sekunden vom
gespeicherten `pinnedProductionL3Kmh` ab, weil das Motion-State-Gating fehlte; die volle Pipeline trifft 776/776).
Der Vergleich „gespeichert vs. Replay“ bleibt dadurch ein echter Versionsdrift-Test.

**N2 (2026-10-23).** Für Container-Fahrten (TIG22, TES21-x) stammen FSM-Labels, Stopp-Episoden und Ereignisse aus
der Payload von `processDiV0MotionCoreShadowTrip` (so wie im Shadow-Worker verdrahtet), C4 weiterhin direkt aus
`computeC4AdaptiveL3` mit Paritäts-Assert gegen die Payload. Grund: #2134 verdrahtet die OBD-Punktautorität nur im
Prozessor (`fsmPointAuthority: false`); ein freistehender `runMotionFsm`-Aufruf würde #2134 nicht korrekt replayen.
Für TES16 (kein Container) wird `runMotionFsm` direkt aufgerufen (ohne OBD, daher kein Unterschied).

**N3 (2026-10-23).** Die Sensitivitätsmatrix (§3 Punkt 4) liegt nicht in einer separaten `sensitivity.json`,
sondern pro Fahrt unter `drives[].sensitivity` in `outputs/<tag>/summary.json`. Inhaltlich unverändert
(Verschiebungen −2, −1, +1, +2 s nur zur Einordnung; primär bleibt Versatz 0).

**N4 (2026-10-23, nach der ersten Auswertung).** Zwei **zusätzliche** Sichten, die die Primärmetriken nicht
ersetzen:
- `replay_l3_qc`: Replay-L3 nach dem produktiven Speed-QC (`evaluateDiV0SpeedQcInterval`,
  `DI_V0_SPEED_QC_POLICY_V2`, wie im Trip-Speed-Quality-Product-Read). Numerisch nur bei `TRUSTED`/`TRUSTED_LIMITED`.
  Zweck: Zeigen, welche L3-Werte den Produktpfad tatsächlich erreichen und warum Werte dort fehlen.
- `implausibleEstimates`: Sekunden mit Schätzwert > 250 km/h werden je Pfad **aufgelistet** (Label, Wert, Referenz,
  QC-Urteil) und die Metriken **ohne** diese Sekunden getrennt ausgewiesen. Die Primärmetriken (§5) enthalten diese
  Sekunden weiterhin. Das Ausblenden ist keine Verbesserung (§9 Kriterium 2 gilt unverändert).

**N5 (2026-10-23).** `scripts/compare_tags.cjs` wertet §9 mechanisch aus. Kriterium 2 wird in zwei Lesarten
berichtet: streng (gepaarte Sekunden ≥ Baseline) und „nur physikalisch unmögliche Werte zurückgehalten“
(alle zurückgehaltenen Baseline-Werte > 250 km/h). Beide werden ausgewiesen; die strenge Lesart ist maßgeblich.

**N6 (2026-10-23, OBD-Speed-Offline-Kandidat).** Zusätzlicher Replay-Tag `no_obd_speed` mit
`--strip-obd-speed-influence` (siehe `OBD_SPEED_INFLUENCE_MAP.md`, `REPORT_OBD_SPEED_CANDIDATE.md`).
Vergleich gegen `main` nur über `scripts/compare_obd_strip.cjs` — **nicht** §9 (das war PR #2134).
OBD-km/h bleibt Vergleichsserie; andere OBD-Signale werden im Harness nicht angetastet.
