# DS4 — Beschleunigen und Bremsen gegen Video-Referenzen (2026-10-23)

Offline-Bewertung des produktiven DS4-Manöverdetektors (`detectMotionManoeuvreEvents` auf Motion-Core **C4**, wie im
Shadow-Processor verdrahtet, Code `main` = `579ee8b2fed06593d7d2aa57cffb6036dbf53a24`) gegen die vier vorhandenen,
versiegelten Video-Tacho-Referenzen. Regeln wurden **vor** der ersten Metrik fixiert
([`EVALUATION_RULES.md`](EVALUATION_RULES.md)); Nachträge N1–N3 sind datiert und ändern keine Primärklassifikation.
Alle Zahlen stammen aus [`outputs/main/`](outputs/main/) (Skripte in [`scripts/`](scripts/), keine Handabschrift).

## 1. Kurzfassung

1. **Produktionsnachweis erbracht** (nicht AUSSTEHEND): 21 `SUCCEEDED`-Läufe mit dem neuen Bundle
   `…_LEG_GATE_OBD_POINT_AUTH_V4` zwischen 11:16:26Z und 11:25:25Z auf dem Leader-Replikat (PID 2048483). Auslöser
   ist der prozessinterne 90-s-`setInterval` des `DiV0MotionCoreShadowScheduler`, der bei
   `ENABLED && WORKER_ENABLED && ENABLED_SINCE` implizit aktiv ist; ein Scheduler-Flag existiert im Code nicht.
   Der Tiguan-Lauf `15cdc8ae` (20 Ereignisse) ist im Replay **byte-identisch** reproduziert
   ([`PRODUCTION_RUN_EVIDENCE.md`](PRODUCTION_RUN_EVIDENCE.md)).
2. **Baseline**: 45 DS4-Ereignisse in vier Fahrten, 36 prüfbar; **33 TREFFER**, 1 Fragment, 1 harter Fehlalarm
   (vom K3-Guard bereits als `ARTEFACT_SUSPECT` markiert, in Produktion nicht akzeptiert), 1 weicher Fehlalarm.
   Von 50 Orakel-Manövern 33 erkannt, **2 hart verpasst**, 12 grenzwertig verpasst, 3 ohne DS4-Geschwindigkeit.
   Recall auf harten Manövern 0,90 (EVAL 0,94, n = 17). Richtung stimmt in allen 33 Treffern.
3. **Beginn/Ende**: Median-Versatz 0 s / 0 s, 94 % der Beginne innerhalb ±2 s. Ausreißer sind Anfahrten nach
   Positionslücken (+4, +5 s). TES21-2 liegt systematisch bei +2 s (Uhrbindung dieser Referenz, s. §5.2).
4. **Δv**: DS4 unterschätzt Δv gegenüber dem Orakel um −3 km/h im Mittel (MAE 5,1, max 20,5). Auf TIG22 ist der
   Fehler **im selben Fenster** nur −0,6 km/h (MAE 2,8): die Abweichung entsteht überwiegend durch
   Grenzsetzung (späterer Beginn/früheres Ende), nicht durch die Geschwindigkeitsskala.
5. **Konkret belegte Fehler** (§6): (F1) Anfahrten nach Stillstand werden verpasst oder 4–5 s zu spät erkannt
   (keine nutzbare C4-Geschwindigkeit in den ersten Sekunden, Segmentneustart + 2-s-Post-Gap-Guard, L3-Dämpfung
   der Anfahrflanke); (F2) drei Ereignisse entstehen aus JITTER-/SPARSE-Proben um überbrückte 1-s-Positionslücken
   (ein Artefakt +35 km/h bei flacher Referenz, das K3 nicht erkennt); (F3) am Trip-Ende von TIG22 liefert C4
   ≈ 2× OBD und erzeugt zwei für einen Tiguan physikalisch unplausible Ereignisse (6,6 und 8,3 m/s²), die als
   akzeptiert gezählt werden; (F4) **alle 8** Ereignisse mit überbrückter Lücke sind nicht-OK-Qualität, 7 davon
   problematisch — Qualität fließt aber nicht in die Akzeptanz ein.
6. **Kandidaten** (§7): vier isolierte Akzeptanz-/Guard-Kandidaten sind regressionsfrei (außer K-A), können aber
   §10 Kriterium 1 auf dieser Stichprobe **nicht** erfüllen, weil die akzeptierte Baseline im Referenzfenster keinen
   harten Fehlalarm enthält → **NOT_PROVEN**, nicht weiterverfolgt. Empfehlung ist eine Daten-/Sichtbarkeitsmaßnahme,
   keine Schwellenänderung (§9).

Keine Verschleiß-Scores, keine Produktionsänderung, keine Flag-Änderung, kein Jobstart, kein Merge, kein Deploy,
keine Änderung am Geschwindigkeitspfad.

## 2. Prüfgegenstand

| Element | Stand |
| --- | --- |
| Detektor | `core/kinematics/motion-event-detector.ts`, Optionen `MOTION_EVENT_V0_2_CANDIDATE_OPTIONS` (K3 `spikeReversionCheck` an), Schwellen `MOTION_EVENT_HF_THRESHOLDS_V1` (Eintritt 1,5 / Fortsetzung 1,2 m/s², ≥ 2 Schritte, min Δv 4,0 / 3,0 km/h, Verschmelzung 2,0 / 1,5 s), Guards `MOTION_CORE_EVENT_GUARDS_V0_1_DEV` (Segmentbruch > 2 s, Eintritt erst ≥ 2 s nach Segmentanfang) |
| Eingang | `computeC4AdaptiveL3` (`MOTION_CORE_SPEED_C4_V0_5_DEV`), nutzbare Qualitäten `OK, SPARSE_SUPPORT, JITTER_SUSPECT, REPAIRED, SPAN_SUPPORT, SPAN_DERIVED` (nicht nutzbar: `NO_POSITION, NO_SUPPORT, FROZEN_POSITION, OUTLIER_REJECTED, …`) |
| Produktionsbindung | identische Verdrahtung in `di-v0-motion-core-shadow-processor.ts`; Paritäts-Assert Detektor ↔ Processor-Payload in jedem Replay; Produktionslauf `15cdc8ae` identisch |
| Inventar | [`DETECTOR_INVENTORY.md`](DETECTOR_INVENTORY.md): Pfad A (Motion-Core-Detektor, Prüfgegenstand), Pfade B/C (`trips/hf-acceleration.ts`, `trips/hf-braking.ts` auf DIMO-HF, gleiche Schwellen, nicht Gegenstand) |

## 3. Referenzen und Grenzen der Ablesung

| ID | Fahrt | Referenz | Rolle | Besonderheit |
| --- | --- | --- | --- | --- |
| TIG22 | VW Tiguan, 2026-10-22, Trip `98d2a8e0` | 1-Hz-Tacho-Transkription (1417/1464 s lesbar) + 9 Operator-Analysefenster | EVAL | R1-Ruptela-Positionen; OBD-Speed nur als Vergleich außerhalb des Videofensters |
| TES21-1 / TES21-2 | Tesla, 2026-10-21, zwei Trips | 1-Hz-Display-Transkription (229/240 bzw. 240/252 s) | DEV | Positionen nur alle ~2 s; Uhrbindung `EXTERNAL_CLOCK_OFFSET_UNVALIDATED` (Speed-Auswertung: TES21-2 vermutlich ≈ +1 s) |
| TES16 | Tesla, 2026-10-16 | 1-Hz-Tacho-Transkription (973/1136 s) | EVAL | ldi-10d-Fixture, synthetisches API-Positionsgrid |

Konsequenzen (Regeln §3): Die Referenz ist auf ganze km/h und ganze Sekunden quantisiert; ein 1-s-Schritt hat damit
±0,28 m/s² Unschärfe, die Lesbarkeit ist ±1 s. Daher (a) nominaler Versatz 0 s mit symmetrischer ±2-s-Toleranz,
(b) ein Unschärfeband von 0,6 m/s² um die Eintrittsschwelle („grenzwertig“: Spitze < 2,1 m/s²), (c) **keine**
Aussage über momentane Beschleunigung aus Einzelschritten — Intensität wird nur als Mittel über ≥ 2 s und als
Δv verglichen, (d) keine Manöver über unlesbare Sekunden oder Clipgrenzen (`UNVERIFIZIERBAR`, N2
`FEHLALARM_UNBESTIMMT`), (e) Ereignisse außerhalb des Referenzfensters werden weder als richtig noch als falsch
gezählt.

## 4. Baseline-Ergebnis (Code `main`)

Vollständige Tabellen: [`outputs/main/TABLES.md`](outputs/main/TABLES.md) (Manövertabelle je Fahrt, Ereignistabelle,
Operatorfenster, sichtbare Läufe).

| Kennzahl | EVAL (TIG22+TES16) | DEV (TES21-1+2) | ALLE |
| --- | --- | --- | --- |
| DS4-Ereignisse / prüfbar | 37 / 28 | 8 / 8 | 45 / 36 |
| TREFFER / Fragment | 27 / 1 | 6 / 0 | 33 / 1 |
| FEHLALARM hart / weich / unbestimmt | 0 / 0 / 1 | 1 / 1 / 0 | 1 / 1 / 1 |
| harte FA bei strikter Zuordnung (N1) | 1 | 1 | 2 |
| Orakel: erkannt / hart verpasst / grenzw. verpasst / ohne DS4-Speed | 27 / 1 / 7 / 1 | 6 / 1 / 5 / 2 | 33 / 2 / 12 / 3 |
| Recall harte Manöver (n) | 0,94 (17) | 0,67 (3) | 0,90 (20) |
| Beginn-Versatz Median [min..max] | 0 [−2..+5] | +2 [0..+2] | 0 [−2..+5] |
| Ende-Versatz Median [min..max] | 0 [−1..+3] | +1,5 [0..+2] | 0 [−1..+3] |
| Δv − Orakel: Bias / MAE / max (km/h) | −3,0 / 5,4 / 20,5 | −3,2 / 3,8 / 8,2 | −3,0 / 5,1 / 20,5 |
| T1 Operatorfenster (TIG22) | 7 erkannt, 2 verpasst oberhalb Schwelle | — | — |

### 4.1 Treffer und Fehlalarme

- **Richtung** stimmt bei allen 33 Treffern; es gibt keinen Treffer mit falscher Art.
- **Doppelte Ereignisse**: ein Fragment (TES16 03:50:20–23), das nur durch die beidseitige ±2-s-Erweiterung
  einem Orakel zugeordnet wird; bei einseitiger Toleranz (N1) ist es ein harter Fehlalarm. Sonst keine Dopplungen;
  Fortsetzungsschwelle (1,2 m/s²) und Verschmelzungslücke (2,0 / 1,5 s) erzeugen eher zu lange als doppelte
  Ereignisse (TES16 03:39:41–47: 6 s statt 3 s, Δv 34,9 statt 22, weil das geglättete C4 länger über 1,2 m/s² bleibt).
- **Harter Fehlalarm** (TES21-1 12:06:26–28, +12,4 km/h bei flacher Referenz 45): Jitter-Spitze 43,8→51,1→56,2,
  Rückkehr auf 43,2 nach 2 s — vom K3-Guard korrekt als `ARTEFACT_SUSPECT` markiert, zählt in Produktion nicht als
  akzeptiert. Die akzeptierte Menge enthält damit **im Referenzfenster keinen harten Fehlalarm**.
- **Weicher Fehlalarm** (TES21-1 12:05:20–23): Referenz bremst sanft 24→14 (0,9 m/s², unterhalb Schwelle), C4
  meldet 34→14,9 (1,8 m/s²), weil die Startprobe eine Jitter-Spitze (+10 km/h) ist.
- **Verpasst (hart)**: TIG22 18:44:16–18 (Anfahren 0→15, Spitze 2,5 m/s²) und TES21-1 12:04:40–42 (23→42,
  3,3 m/s²), Ursachen in §6 F1/F5.

### 4.2 Beginn, Ende, Δv, Dauer

- TIG22 (dichteste Positionen): Beginn −1 s Median (DS4 führt um ≤ 1 s, zentriertes L3-Fenster), Ende −0,5 s,
  Δv-Bias −1,3 km/h, **gleiches Fenster −0,6 km/h** — Geschwindigkeitsskala der Ereignisse stimmt.
- TES16: Beginn +1 s Median, zwei Anfahrten +4 / +5 s (F1); Δv-Bias −4,3 km/h, getrieben von diesen späten
  Beginnen (03:39:52: 15,5 statt 36 km/h; 03:44:40: 21,7 statt 42).
- TES21-2: alle vier Treffer +2 s Beginn und +1…+2 s Ende, Δv-Fehler im gleichen Fenster +8 km/h — das ist das
  Bild einer um ~1–2 s nachlaufenden Zeitbasis (Speed-Auswertung: Uhrbindung dieser DEV-Referenz wahrscheinlich
  ≈ +1 s) plus Positionskadenz 2 s. Es wurde **keine** Verschiebung angewendet (Regeln §11).
- Dauer: Differenz zum Orakel Median 0, Spanne −4…+3 s; Verkürzungen durch späten Beginn (F1), Verlängerungen
  durch Fortsetzungsschwelle 1,2 m/s² und Verschmelzung.

### 4.3 Datenlücken und Quarantänegrenzen

Detektorsegmente brechen bei > 2 s ohne nutzbare Probe; **kein** Ereignis überspannt eine solche Lücke
(Regel „keine Ereignisse über unbekannte Abschnitte“ ist eingehalten). Lücken von 1–2 s werden jedoch innerhalb
eines Segments überbrückt, und genau dort entstehen die Problemfälle:

| Ereignisse mit Positionslücke ≤ 1 s im/neben dem Ereignis | Qualität | Klasse |
| --- | --- | --- |
| 8 von 45 | **alle nicht-OK** (DEGRADED 4, LIMITED 3, ARTEFACT_SUSPECT 1) | 1 TREFFER, 1 FEHLALARM (K3), 1 weicher FA, 1 Fragment-Artefakt, 4 unverifizierbar (davon 2 unplausibel) |
| 37 ohne solche Lücke | alle OK | 32 TREFFER, 4 unverifizierbar (sauber), 1 unbestimmt |

Grenznähe (≤ 2 s zu Segmentanfang/-ende oder Quarantäne): 9 Ereignisse (6 TREFFER, 3 unverifizierbar); Grenznähe
allein ist also kein Fehlerprädiktor — die überbrückte Lücke bzw. die daraus folgende Nicht-OK-Qualität ist es.
Quarantänegrenzen (`OUTLIER_REJECTED`, nur TIG22, 12 s) liegen bei 2 der 4 Trip-Ende-Ereignisse in ≤ 2 s Abstand.

## 5. Sichtbarkeit je Referenzstufe

- **T1 Operatorfenster (TIG22, 9)**: 7 erkannt. Die zwei verpassten sind die beiden Anhaltevorgänge TC_00077/78
  (38→0 in 13 s, 48→0 in 14 s): nur die letzten 2 s liegen mit 1,67 m/s² knapp über der Schwelle; einmal endet der
  Positionsstrom 1 s vor dem Stillstand (`NO_SUPPORT`/`NO_POSITION` ab 18:40:56), einmal dämpft C4 den
  Schlussschritt unter 1,5 m/s². Bei langen Fenstern meldet DS4 nur die harte Phase (z. B. 18:47:30–50:
  DS4 18:47:42–47, Versatz +12 / −3 s) — das ist Schwellensemantik, kein Fehler.
- **T2 Orakel (50)**: s. §4; 12 grenzwertig verpasste Manöver haben Spitzen 1,67–1,94 m/s² (innerhalb des
  Unschärfebands) — C4 glättet 1-s-Spitzen um ≈ 0,3 m/s², was bei quantisierter Referenz nicht als Fehler gewertet
  wird.
- **T3 sichtbare Läufe (126)**: 33 erkannt, 17 „verpasst oberhalb Schwelle“ (= dieselben Orakelfälle, aus
  Laufsicht), 75 unterhalb Schwelle nicht erwartet, 1 unterhalb Schwelle dennoch erkannt (TES21-1 12:05:20, der
  weiche Fehlalarm).

## 6. Belegte Fehler

Sondenfenster je Sekunde (Referenz, C4, Qualität, Flags, Position, OBD): [`outputs/main/PROBES.md`](outputs/main/PROBES.md).

| # | Befund | Beleg | Mechanismus (Code) |
| --- | --- | --- | --- |
| **F1** | Anfahren nach Stillstand wird verpasst oder 4–5 s zu spät erkannt | TIG22 18:44:16 (hart verpasst): `FROZEN_POSITION` 18:44:14–15 → Segmentneustart 18:44:16, Eintritt erst ab 18:44:18 erlaubt; zudem C4-Schritte 1,31 / 1,47 m/s² gegen Referenz 2,5 / 1,67. TIG22 18:41:11 (grenzw.): C4 führt 1 s, Schritte ≤ 1,3 m/s². TES16 03:44:35 (+5 s): `NO_POSITION` 03:44:32–36, `NO_SUPPORT` 37, Guard bis 03:44:40 → Beginn +5 s, Δv 21,7 statt 42. TES21-2 12:22:13 / 12:23:07: 4–5 s `NO_POSITION` während der Anfahrt. T1 TC_00077: Positionsstrom endet im Anhalten | `buildSegments` (Bruch > `maxGapS` 2), `postGapGuardS` 2 (Eintritt erst wenn `seg[i−1] − segStart ≥ 2`), zentriertes L3-Fenster dämpft die Flanke; C4 ohne Stützpunkte in den ersten 1–3 s nach Stillstand |
| **F2** | Ereignisse aus JITTER-/SPARSE-Proben um überbrückte 1-s-Lücken | TES16 03:50:20–23 (+35,2 km/h, Referenz flach 133): `SPARSE` 113,1 → Lücke → `JITTER` 128,2 → `JITTER` 148,3 → `OK` 126,5. TES21-1 12:05:20–23 (weich): Startprobe `JITTER` 34 bei Referenz 24. TES21-1 12:06:26–28 (K3 greift) | K3 vergleicht die Rückkehr nur mit der **Start**geschwindigkeit des Ereignisses; ist der Start selbst die Einbruchsprobe (113,1 statt ≈ 129), bleibt die Rückkehr auf 126,5 unerkannt. Ereignisqualität wird gesetzt (`DEGRADED`), hat aber keine Wirkung |
| **F3** | Trip-Ende TIG22 19:04:20–53 (außerhalb Video): vier Ereignisse, zwei physikalisch unplausibel | C4 ≈ 2× OBD im ganzen Abschnitt (87 vs 43, 70 vs 35, 142 vs 60 km/h; `SPARSE_SUPPORT`, `MIN_SUPPORT_3_POINTS`, `JITTER`, ein `OUTLIER_REJECTED`). Ereignisse 5,5→100,1 (6,6 m/s²) und 52,3→142,1 (8,3 m/s²) überschreiten die Tiguan-Schranke 4,5 m/s². OBD zeigt dort reale Manöver (0→50, 36→60), also Richtung richtig, Betrag ×2 | Kein Plausibilitäts- oder Stützpunkt-Guard auf Ereignisebene; `eventAcceptedCount` zählt sie mit (Produktion: 20 akzeptiert inkl. dieser 4). Ursache im Geschwindigkeitspfad ist **nicht** Gegenstand (keine Speed-Optimierung); dokumentiert für den Speed-Workstream |
| **F4** | Qualität trennt Problemfälle fast vollständig, wird aber nicht genutzt | 8 nicht-OK-Ereignisse: 1 TREFFER (TES21-1 12:05:43, `LIMITED`, Segmentende), 7 problematisch/unverifizierbar; 37 OK-Ereignisse: 32 TREFFER, 0 Fehlalarme | `eventQuality()` liefert OK/DEGRADED/LIMITED; Processor akzeptiert alles außer `ARTEFACT_SUSPECT`; `summary_json` enthält keine Qualitätsaufschlüsselung |
| **F5** | Positionskadenz 2 s (Tesla) lässt 2-s-Manöver mit nur einem Schritt zurück | TES21-1 12:04:40–42 (23→42): C4 16 → 32,8 (4,7 m/s², 1 Schritt) → Lücke → 34,7 (0,26 m/s² über 2 s) | `minSteps` 2 bei `dt` = 2 s Schritten; kein Fehler des Detektors, sondern Datenlage; betrifft nur die API-synthetische Tesla-Quelle |
| **F6** | Δv-Unterschätzung −3 km/h ist Grenzsetzung, nicht Skala | TIG22 gleiches Fenster −0,6 km/h; Ausreißer 20,5 km/h = später Beginn (F1) | Eintritt 1,5 m/s² auf geglättetem C4 greift 1–2 Schritte nach der Referenz; Fortsetzung 1,2 m/s² hält teils 1–2 s länger |

## 7. Offline-Kandidaten (Ereignisebene, §10)

Vergleich: [`outputs/main/CANDIDATES.md`](outputs/main/CANDIDATES.md) / `candidates.json`. Alle Kandidaten lassen
C4, Schwellen, Guards und die Ereignismenge unverändert (Paritäts-Assert) und wirken nur auf Akzeptanz bzw.
`ARTEFACT_SUSPECT`.

| Kandidat | Wirkung in-sample | Regression | §10 | Ergebnis |
| --- | --- | --- | --- | --- |
| K-A: akzeptiert nur Qualität OK | entfernt 7 problematische/unverifizierbare Ereignisse (inkl. beide unplausiblen, das Fragment-Artefakt, den weichen FA) | **verliert 1 TREFFER** (TES21-1 12:05:43), +1 grenzw. verpasst | Krit. 3 verletzt | NOT_PROVEN |
| K-A2: akzeptiert ohne DEGRADED (Jitter/Repaired im Fenster) | entfernt 4 (Fragment-Artefakt, weicher FA, 2 Trip-Ende inkl. 8,3 m/s²) | keine | Krit. 1 nicht erfüllbar (s. u.) | NOT_PROVEN |
| K-B: K3 zusätzlich gegen Vor-Ereignis-Niveau | markiert TES16 03:50:20 als `ARTEFACT_SUSPECT`; sonst keine Änderung auf TIG22/TES21 | keine | abgeleitet aus TES16, keine unabhängige EVAL-Wirkung | NOT_PROVEN |
| K-C: Fahrzeugklassen-Plausibilitätsschranke | de-akzeptiert die 2 unplausiblen Trip-Ende-Ereignisse (außerhalb Referenz) | keine | keine Wirkung im Referenzfenster | NOT_PROVEN |

Warum NOT_PROVEN trotz Regressionsfreiheit: §10 Kriterium 1 verlangt sinkende **harte** Fehlalarme auf einer
unabhängigen EVAL-Fahrt. Die akzeptierte Baseline hat im Referenzfenster **null** harte Fehlalarme (der einzige ist
K3-markiert); die belegten Defekte sind ein Fragment-Artefakt (nur unter strikter Zuordnung „hart“), ein weicher
Fehlalarm und unverifizierbare Trip-Ende-Ereignisse. Die Kriterien wurden vor der Auswertung fixiert und werden
nicht nachträglich gelockert. Die Kandidaten sind damit **Hypothesen mit konsistenter In-Sample-Wirkung**, keine
belegten Verbesserungen.

## 8. Grenzen dieser Auswertung

- Vier Fahrten, 36 prüfbare Ereignisse, 20 harte Orakel-Manöver; TES21 ist DEV (Uhrbindung unsicher,
  Positionskadenz 2 s). Statistische Aussagen über Fehlalarmraten sind damit nicht möglich; die Ergebnisse sind
  Fallbelege.
- Videoreferenz quantisiert (1 km/h, 1 s) und ±1 s unsicher; alles unterhalb 2,1 m/s² Spitze gilt als grenzwertig.
  Keine Aussage über momentane Beschleunigung.
- Das Trip-Ende von TIG22 liegt außerhalb des Videos; dort wurde OBD nur als Vergleich, nicht als Referenz benutzt.
- Replays sind `POST_TRIP_RETROSPECTIVE`; Live-/Streaming-Verhalten nicht bewertet.
- Ereignisse außerhalb der Referenzfenster (8) und unter unlesbaren Sekunden (1) sind bewusst unbewertet.
- Pfade B/C (`trips/hf-*` auf DIMO-HF) wurden inventarisiert, nicht nachgerechnet (kein HF-Referenzmaterial).

## 9. Gezielte Empfehlung

Reihenfolge nach Beleglage; **keine** Schwellen- oder Geschwindigkeitsoptimierung.

1. **Sichtbarkeit zuerst (Shadow-Summary, nicht Akzeptanz):** `summary_json` um Zähler je Ereignisqualität
   (`OK / DEGRADED / LIMITED / ARTEFACT_SUSPECT`) und je Art (Beschleunigen/Bremsen) erweitern. Damit lässt sich der
   Anteil nicht-OK-Ereignisse (hier 8/45 = 18 %, davon 7 problematisch) auf den 21 produktiven Läufen und folgenden
   messen, ohne ein Verhalten zu ändern. Das ist die Voraussetzung, um K-A2 (DEGRADED nicht akzeptieren) später mit
   einem harten Fehlalarm auf einer unabhängigen Fahrt zu belegen oder zu verwerfen.
2. **Referenzlücke schließen, die §10 blockiert:** eine weitere Videoreferenz mit (a) Anfahrten aus dem Stillstand
   bei dichter Positionsquelle und (b) einem Trip-Ende innerhalb des Videos. Erst damit sind F1 (Anfahr-Onset) und
   F3 (unplausible Trip-Ende-Ereignisse) als harte Fehlalarme/Verpasste belegbar. Für TIG22 steht OBD-Speed
   (R1-Grenzschicht aus #2138) als Zweitreferenz für Anfahrten bereit, ist aber laut Speed-Auswertung nicht
   sekundenaligniert — vor Nutzung als Ereignisreferenz prüfen.
3. **K-B als Detektor-Option (nicht Default) vormerken:** Erweiterung des bestehenden K3 um den Vergleich mit der
   letzten nutzbaren Probe vor dem Ereignis; Fenster unverändert (2 s), keine zusätzliche Vorausschau. In-sample
   regressionsfrei auf allen vier Fahrten; Aktivierung nur nach Beleg per Punkt 2.
4. **Anfahr-Onset nicht über Schwellen lösen:** Die Verspätung entsteht aus fehlenden Stützpunkten und dem
   Post-Gap-Guard, nicht aus der Schwelle; eine Schwellensenkung würde die 12 grenzwertigen Fälle in Treffer und
   Fehlalarme zugleich verschieben. Falls Anfahren als eigenes Manöver gebraucht wird, ist das ein eigener
   Standstill→Moving-Onset auf FSM-/Speed-QC-Ebene (anderer Workstream).

## 10. Abschlussblock

```
RESULT: BASELINE_DOCUMENTED; CANDIDATES NOT_PROVEN (sample lacks hard false alarms in accepted set)
CODE: main 579ee8b2fed06593d7d2aa57cffb6036dbf53a24 (DI dir clean); detector HF_THRESHOLDS_V1 + GUARDS_V0_1 + V0_2_CAND[spikeReversionCheck]; C4 V0_5
PRODUCTION_EVIDENCE: NOT AUSSTEHEND — 21 SUCCEEDED runs bundle V4 11:16:26Z–11:25:25Z (leader pid 2048483); trigger = in-process 90 s setInterval gated by ENABLED+WORKER_ENABLED+ENABLED_SINCE + leader guard; no scheduler flag exists; TIG22 run 15cdc8ae replay identical (20 events); read-only access only
BASELINE: 45 events / 36 verifiable; 33 TREFFER, 1 fragment, 1 hard FA (K3-flagged, not accepted), 1 soft FA, 1 undetermined; oracle 50: 33 detected, 2 hard missed, 12 borderline missed, 3 no DS4 speed; recall hard 0.90 (EVAL 0.94 n=17); start/end offset median 0/0 s, 94 % within ±2 s; Δv bias −3.0 km/h (TIG22 same-window −0.6)
DEFECTS: F1 pull-away onsets missed/late (segment restart + postGapGuard + L3 attenuation; 2 hard misses, +4/+5 s); F2 jitter/sparse artefacts across bridged 1 s gaps (1 undetected by K3); F3 TIG22 trip tail C4 ≈ 2× OBD → 2 implausible accepted events; F4 all 8 non-OK events carry bridged gaps, 7/8 problematic, quality unused in acceptance; F5 2 s position cadence → minSteps miss; F6 Δv deficit is boundary placement
CANDIDATES: K-A (OK only) loses 1 TREFFER → NOT_PROVEN; K-A2 (no DEGRADED), K-B (pre-baseline reversion), K-C (class plausibility) regression-free in-sample, §10 criterion 1 not satisfiable on this sample → NOT_PROVEN
RECOMMENDATION: quality-split counters in shadow summary (observability, no behaviour change) → additional reference drive with pull-aways + in-video trip end → then decide K-A2/K-B; no threshold change
NOT_DONE: no wear/intensity scores, no code change outside this folder, no flag change, no job start, no production mutation, no merge, no deploy, no speed-path tuning, no time shift of references
```
