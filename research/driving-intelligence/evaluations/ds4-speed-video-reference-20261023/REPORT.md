# DS4 — Geschwindigkeit gegen Video-Referenzen: Ergebnisbericht (2026-10-23)

Alle Zahlen stammen aus `outputs/main/summary.json`, `outputs/pr2134/summary.json` und
`outputs/candidate_pr2134_vs_main.json`; die vollständigen Tabellen stehen in [`outputs/TABLES.md`](outputs/TABLES.md).
Regeln: [`EVALUATION_RULES.md`](EVALUATION_RULES.md) (vor der ersten Berechnung fixiert; §11 Nachträge).
Einheit km/h, Fehler e = DS4 − Referenz, Zeitzuordnung Versatz 0 s, exakte Kalendersekunde, keine Interpolation.

## 0. Kurzantwort auf die drei Fragen

**Wie genau ist unsere Geschwindigkeit heute?**
Auf der einzigen vollständig unabhängigen Fahrt (TES16, Tesla, 973 lesbare Sekunden) liegt der Motion-Core-Pfad
C4 bei **MAE 2,27 / Median 2,09 / P95 4,49 / max 19,9 km/h, Bias −1,98**, 97,9 % der Sekunden innerhalb ±5 km/h,
Abdeckung 83 % der lesbaren Sekunden; der rohe Produktions-L3-Pfad liegt bei MAE 2,38 (n = 749, max 59,4; auf den
gemeinsamen 749 Sekunden 2,38 gegen 2,32 für C4).
Der negative Bias wächst mit der Geschwindigkeit (−0,19 bei < 30 km/h bis −3,45 bei ≥ 100 km/h) und entspricht
der gesetzlich vorgeschriebenen Voreilung des Tachos — er ist eine **Referenzeigenschaft**, kein Schätzfehler.
Nach Abzug dieser Voreilung bleibt ein Restfehler im Bereich der 1-km/h-Anzeigequantisierung.
Auf der zweiten EVAL-Fahrt (TIG22, Tiguan/RUPTELA, 1417 Sekunden) ist das Bild zweigeteilt: **ohne** den
GPS-Sprung-Cluster 18:49:13–23 liegt C4 bei MAE 2,91 / P95 5,92 / max 14,4, Bias −2,42 (1365 Sekunden);
**mit** ihm bei MAE 9,22 / max 1864,8, weil sieben Sekunden Werte von 920–1931 km/h tragen. Der rohe L3-Pfad trägt
elf solcher Sekunden (max 1904,9); der produktive Speed-QC (POLICY_V2) hält alle elf zurück, verwirft auf
dieser Fahrt aber zusätzlich 307 korrekte Sekunden wegen `CROSS_SOURCE_CONFLICT` mit dem OBD-Kanal
(Abdeckung 69,7 % statt 90,6 %). Stillstand und bestätigte Bewegung erkennen L3 und C4 auf allen vier Fahrten
**ohne** falsche Bewegung und **ohne** falschen Stillstand; die FSM produziert auf TIG22 16 Sekunden falsche
Bewegung, alle durch OBD-Punkte während bestätigter Halte.

**Welche Verbesserung ist tatsächlich belegt?**
Keine neue. Der einzige Kandidat mit reproduzierbarem Effekt ist der bereits existierende, nicht gemergte
PR #2134 (Leg-Quarantäne + Aufhebung der OBD-Punktautorität): auf TIG22 entfernt er die sieben unmöglichen
C4-Werte (max 1864,8 → 14,4), die 16 FSM-Falschbewegungen (→ 0) und den Anfahr-Frühversatz der FSM (Median −3 → 0 s).
Auf den **gemeinsamen** 1364 Sekunden ändert er **keinen einzigen Wert** (MAE 2,905 → 2,905), hält eine plausible
Sekunde zusätzlich zurück (18:49:12, 67,3 vs. 71) und ist auf TES16/TES21 bitidentisch mit main. Nach den vorab
fixierten Kriterien (§9) ist das **keine belegte Genauigkeitsverbesserung** (Kriterium 1 nicht erfüllt, Kriterium 2
streng verletzt), sondern eine Robustheitskorrektur, die ausschließlich auf der Fahrt wirkt, auf der sie
abgeleitet wurde (DEV). Ein weiterer isolierter Offline-Kandidat wurde **nicht** implementiert, weil kein
reproduzierbarer Fehler übrig bleibt, der die ≥ 10 %-Hürde auf einer EVAL-Fahrt erreichen könnte, ohne die
Referenzvoreilung „wegzukalibrieren“ oder Abdeckung zu opfern (Begründung in Abschnitt 8).

**Was verhindert noch den nächsten Schritt (Beschleunigungs-/Bremsdetektoren)?**
Drei Dinge, keines davon ein Schätzfehler der Geschwindigkeit selbst: (1) Der rohe Produktions-L3-Pfad hat keinen
Plausibilitätsschutz; erst der nachgelagerte Speed-QC fängt Sprünge — der Motion-Core-Pfad, auf dem Detektoren
aufsetzen würden, braucht #2134 oder Gleichwertiges, bevor Δv-Ereignisse aus ihm abgeleitet werden. (2) Der OBD-Kanal
des RUPTELA-Containers ist auf TIG22 nicht sekundenaligniert (185 von 465 Proben ≥ 20 km/h neben der Referenz, kein
konstanter Zeitversatz) und darf weder FSM-Punktautorität noch QC-Vetorecht haben. (3) Die Referenzbasis ist für
Δv-Bewertung zu dünn: eine unabhängige Fahrt (TES16), eine zweite mit DEV-Rolle für #2134, zwei DEV-Fahrten mit
unvalidierter Uhrbindung (TES21-2 zeigt bei +1 s Verschiebung MAE 1,70 statt 3,60).

## 1. Stände, Versionen, Rollen

| Gegenstand | Befund |
| --- | --- |
| Replay-Baseline | `origin/main` `dea2555bb`; DI-Verzeichnis identisch mit Produktions-Release `20261023001716_v4994` (`79c537207`; Diff leer) |
| #2134 | `f95420593`, offen, nicht gemergt, nicht in Produktion → nur als `replay_2134` auf identischen Eingaben; **nicht** als Produktionsstand behandelt |
| #2135 | `a87234c87`, unverändert; Audit-Dokumente nur gelesen |
| Gespeicherte Stände | TIG22: DI-Shadow-Intervalle (`di_v0_shadow_intervals.csv`), Motion-Core-Shadow-Payload (`speeds[]`, `fsmLabels[]`, `events[]`); TES21: `TRIP_x_shadow_intervals.jsonl`; TES16: `pinnedProductionL3Kmh` |
| Versionsdrift gespeichert vs. Replay | **0** auf allen Fahrten: TIG22 L3 1756/1756, C4 1916/1916 gleich; TES21-1 67/67; TES21-2 171/171; TES16 776/776; Ereignisse 21/21, Stopp-Episoden 12/12 (Tabelle „Gespeichert vs. Replay“) |
| Rollen | TIG22 EVAL für C4 main / **DEV für #2134**; TES21-1/-2 **DEV** (Motion-Core-Design); TES16 EVAL (einzige für beide Stände unabhängige Fahrt) |

Die historisch gespeicherten Ergebnisse werden durch den Replay exakt reproduziert; damit gelten alle folgenden
Replay-Zahlen zugleich für die gespeicherten Bestände (Spalten `stored_*` in `TABLES.md`).

## 2. Identität „video_1904“

| Frage | Befund aus vorhandenen Artefakten |
| --- | --- |
| Datei | **Keine.** Weder in den Referenzmanifesten (9 Clips TC_00077–TC_00085) noch in Provenienz-/Audit-Dateien existiert eine Datei oder ein Clip „1904“ |
| Zeitfenster | 19:04 UTC (= 21:04 Ortszeit) am 2026-10-22; letzte Videosekunde ist 19:03:02Z, DS4-Grid endet 19:04:53Z |
| Fahrzeug / Trip | VW Tiguan (nutzerbenannt, Produktionsidentität nicht verifiziert), Trip `98d2a8e0-8b7d-4529-bf76-acee44d61fbe` |
| Rolle | Kennzeichnung des **nicht videogedeckten** Trip-Endes. Dort liegen vier gespeicherte Ereignisse (`DECELERATION` 19:04:26–29, `ACCELERATION` 19:04:34–38 5,5→100,1, `DECELERATION` 19:04:39–42, `ACCELERATION` 19:04:49–52 52,3→142,1), alle `NOT_VIDEO_COVERED`. Der Abschnitt zeigt periodisch fehlende Positionszeilen (jede dritte Sekunde `ROW_ABSENT`), `SPARSE_SUPPORT`/`JITTER_SUSPECT`/`OUTLIER_REJECTED` und oszillierende Werte — er ist **nicht bewertbar**, nicht als Fehler gezählt und nicht als korrekt gezählt |
| Herkunft des Tokens | Der Bezeichner stammt aus der eigenen Abschluss-QA von #2135 (maschinenlesbarer Block) als Kurzform für dieses Fenster; er bezeichnet kein Asset. Keine Zuordnung wurde erfunden |

## 3. Geschwindigkeits-Baseline (Code `main`, Versatz 0)

Kompakt (vollständig in `TABLES.md`):

| Fahrt (Rolle) | Pfad | gepaart / lesbar | MAE | Median | P95 | max | Bias | ≤ 5 km/h |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| TIG22 (EVAL) | L3 roh (= Produktion Shadow) | 1284 / 1417 | 14,51 | 2,86 | 6,13 | 1904,9 | +8,93 | 90,0 % |
| TIG22 | L3 nach Speed-QC V2 (Produktpfad) | 988 / 1417 | 2,88 | 2,79 | 5,43 | 11,7 | −2,62 | 92,7 % |
| TIG22 | C4 | 1372 / 1417 | 9,22 | 2,78 | 6,04 | 1864,8 | +3,92 | 90,5 % |
| TIG22 | C4 **ohne** 7 Sekunden > 250 km/h (getrennte Sicht) | 1365 | 2,91 | — | 5,92 | 14,4 | −2,42 | — |
| TIG22 | OBD R1 (Vergleichsquelle) | 449 / 1417 | 21,48 | 14,00 | 61,0 | 84,0 | +2,94 | 29,6 % |
| TES21-1 (DEV) | L3 roh | 62 / 229 | 2,81 | 1,28 | 14,99 | 20,0 | +0,57 | 85,5 % |
| TES21-1 | C4 | 150 / 229 | 2,29 | 1,21 | 8,56 | 13,6 | −0,59 | 84,7 % |
| TES21-2 (DEV) | L3 roh | 169 / 240 | 3,71 | 2,54 | 11,25 | 20,6 | −0,57 | 74,0 % |
| TES21-2 | C4 | 179 / 240 | 3,60 | 2,32 | 10,95 | 20,6 | −0,62 | 74,9 % |
| TES16 (EVAL) | L3 roh | 749 / 973 | 2,38 | 2,14 | 4,49 | 59,4 | −1,99 | 97,9 % |
| TES16 | L3 nach Speed-QC V2 | 748 / 973 | 2,30 | 2,14 | 4,49 | 6,1 | −2,07 | 98,0 % |
| TES16 | C4 | 808 / 973 | 2,27 | 2,09 | 4,49 | 19,9 | −1,98 | 97,9 % |
| **EVAL gepoolt (TIG22 + TES16)** | L3 roh | 2033 | 10,04 | 2,62 | 5,48 | 1904,9 | +4,91 | 92,9 % |
| | L3 nach Speed-QC V2 | 1736 | 2,63 | 2,52 | 4,99 | 11,7 | −2,38 | 95,0 % |
| | C4 | 2180 | 6,65 | 2,54 | 5,42 | 1864,8 | +1,73 | 93,2 % |
| Alle vier Fahrten | C4 | 2509 | 6,17 | 2,48 | 6,01 | 1864,8 | +1,43 | 91,4 % |

Ausschlüsse je Pfad sind in `summary.json` → `speed.<pfad>.coverage.exclusions` aufgeschlüsselt
(`REF_SPEED_MISSING`, `OUTSIDE_GRID`, `DS4_NULL`). Beispiele: TIG22 L3 `DS4_NULL` 133 (Halte ohne numerischen Wert,
`TRANSITION_UNCERTAIN`, Lücken), TES21-1 `OUTSIDE_GRID` 13 (Referenz reicht über das Trip-Ende hinaus), TES16
`DS4_NULL` 165 für C4 (Stillstand ohne Positionszeile).

Gemeinsame Sekunden L3 vs. C4 (nur Sekunden mit beiden Werten): TIG22 1279 s MAE 10,06 vs. 9,77 (P95 gleich 6,02);
TES21-1 62 s 2,81 vs. 1,96 (P95 14,99 vs. 6,38); TES21-2 169 s 3,71 vs. 3,67; TES16 749 s 2,38 vs. 2,32
(max 59,4 vs. 16,3). C4 ist nie schlechter als L3 und liefert auf jeder Fahrt mehr Sekunden (TIG22 +88, TES21-1 +88,
TES21-2 +10, TES16 +59). Nach bestandenem Speed-QC sind L3 und C4 auf TIG22 numerisch identisch (987 s, MAE 2,877 beide).

**Segmente** (C4, TES16): < 30 km/h MAE 1,09 / Bias −0,19; 30–60 1,71 / −1,46; 60–100 2,43 / −2,36; ≥ 100 3,62 / −3,45.
Der Fehler ist fast vollständig Bias, der monoton mit der Geschwindigkeit wächst — das Muster einer Tacho-Voreilung
(zulässig +0 … +10 % + 4 km/h), nicht eines Schätzfehlers. Auf TIG22 (ohne Sprung) gleiches Muster: < 30 Bias −0,76,
30–60 −2,42, 60–100 ≈ −3,4 (QC-gefiltert).
**Phasen**: stetig vs. ändernd (|Δref| ≥ 5 km/h über ±2 s): TES16 2,27 vs. 2,26 (P95 4,02 vs. 4,84);
TIG22 P95 5,33 vs. 8,18; TES21-2 1,67 vs. 4,91 (P95 3,91 vs. 12,47, s. Abschnitt 6).

## 4. Stillstand, Anfahren, Bewegung

| Fahrt | Pfad | Stillstand-Kern (s) | falsche Bewegung | kein Anspruch (still) | bestätigte Bewegung (s) | falscher Stillstand | kein Anspruch (bewegt) |
| --- | --- | --- | --- | --- | --- | --- | --- |
| TIG22 | L3 / C4 | 73 | 0 / 0 | 23 / 24 | 1254 | 0 / 0 | 12 / 14 |
| TIG22 | FSM | 73 | **16** | 2 | 1254 | 0 | 0 |
| TIG22 | OBD | 73 | 12 | 56 | 1254 | 12 | 859 |
| TES21-1 | L3 / C4 | 8 | 0 / 0 | 8 / 8 | 160 | 0 / 0 | 107 / 46 |
| TES21-1 | FSM | 8 | 0 | 4 | 160 | 2 | 8 |
| TES21-2 | L3 / C4 | 15 | 0 / 0 | 15 / 15 | 170 | 0 / 0 | 17 / 13 |
| TES21-2 | FSM | 15 | 0 | 2 | 170 | 5 | 7 |
| TES16 | L3 / C4 | 116 | 0 / 0 | 116 / 116 | 739 | 0 / 0 | 23 / 9 |
| TES16 | FSM | 116 | 0 | 0 | 739 | 2 | 0 |

Befunde:

- **Kein Pfad behauptet Bewegung im bestätigten Stillstand oder Stillstand in bestätigter Bewegung** — mit einer
  Ausnahme: FSM auf TIG22, 16 Sekunden (18:41:04–05, 18:44:05, 18:47:58–48:00, 18:58:54–58, 19:00:14–32). In allen
  16 Fällen liegt in der Sekunde oder ≤ 3 s davor ein OBD-Punkt mit 11–84 km/h während eines videobestätigten Halts
  (`vehicle_speed_sample_moving_during_gap` / `directMoving`), während C4 dort 0,6–3,4 km/h oder keinen Wert liefert.
- **„Kein Anspruch“ im Stillstand ist auf den Tesla-Fahrten die Regel** (TES16 116/116, TES21-1 8/8, TES21-2 15/15):
  im Stillstand fehlen die Positionszeilen vollständig (`confirmedStillEvidence.withoutPosition` 116 / 8 / 14),
  L3 und C4 haben keine Zahl. Die FSM überbrückt das korrekt (TES16 116/116 STATIONARY, 0 falsche Bewegung). Beim
  Tiguan sind Haltesekunden dagegen mit GPS belegt (70 von 73) und C4 liefert dort 1,49 km/h im Mittel (Band ref = 0,
  n = 68, P95 3,82).
- **Falscher Stillstand der FSM** (TES21-1 2 s, TES21-2 5 s, TES16 2 s) ist durchweg **Anfahr-Latenz**: Positionen
  erscheinen nach dem Halt erst 1–7 s nach der ersten Anzeige > 0 (Anfahr-Versatz FSM: TES21-1 +2; TES21-2 +3, +3, +7;
  TES16 +1, +2, +2). Das ist fehlende Bewegungsevidenz, nicht ein falsches Urteil über vorhandene Daten.
- **Zeitversatz Anhalten** (DS4 − Referenz): TIG22 Median −2 s (C4 −7 … +5, L3 −7 … +3), TES16 −2; FSM TES16 −1,5
  (−2 … −1). DS4 meldet „still“ 1–2 s **bevor** die Anzeige 0 zeigt (C4 ≤ 3 km/h, während die Anzeige noch 1–4 zeigt).
  **Anfahren**: C4 TIG22 Median 0 (−1 … +10; der +10 ist das Kriechen 18:44:07–09 mit Anzeige 4–5 km/h und C4 4 km/h
  knapp unter der 5-km/h-Bewegungsschwelle, kein Positionsausfall), TES16 +1; FSM TIG22 Median **−3** (−10 … 0) wegen
  der OBD-Falschbewegungen in den Halten 18:58:5x und 19:00:1x–2x (in #2134: 0, −1 … +10).
- An Übergängen eilt DS4 der Anzeige um ~1 s voraus (z. B. TIG22 18:58:17–20 Anzeige 44→37→28→19, C4/L3 34→25→17→9:
  DS4(t) ≈ Anzeige(t+1)); dies liegt innerhalb der ±1 s Uhrunsicherheit der Referenz und wird nicht korrigiert.

## 5. Synchronisationsunsicherheit (Sensitivität, nur Einordnung)

C4-MAE / P95 bei Verschiebung des DS4-Lookups um k Sekunden:

| Fahrt | −2 | −1 | **0** | +1 | +2 |
| --- | --- | --- | --- | --- | --- |
| TIG22 | 9,60 / 8,08 | 9,07 / 5,60 | **9,22 / 6,04** | 9,88 / 9,18 | 10,67 / 13,16 |
| TES21-1 | 5,12 / 13,88 | 3,44 / 10,18 | **2,29 / 8,56** | 2,68 / 6,82 | 3,92 / 10,47 |
| TES21-2 | 7,33 / 19,52 | 5,63 / 15,41 | **3,60 / 10,95** | **1,70 / 4,98** | 1,85 / 5,73 |
| TES16 | 4,83 / 13,35 | 3,39 / 8,71 | **2,27 / 4,49** | 2,68 / 5,80 | 4,11 / 10,49 |

TES16 und TES21-1 sind bei 0 am besten (Anker tragen). TIG22 ist bei 0 und −1 praktisch gleich (±1 s Uhr, wie im
Referenzmanifest angegeben). **TES21-2** ist bei +1 deutlich besser — die Uhrbindung dieser DEV-Referenz
(Display-Uhr, Annahme UTC+02, `EXTERNAL_CLOCK_OFFSET_UNVALIDATED`) ist wahrscheinlich um ~1 s versetzt. Konsequenz:
Die TES21-2-Zahlen bei 0 **überschätzen** den DS4-Fehler; es wurde **keine** Verschiebung übernommen.

## 6. Offene Punkte

### A. Legacy-Vorzeichen-Semantik

| Frage | Befund |
| --- | --- |
| Konvention | `deltaKmh = round1(sign · (end − start))` mit `sign = +1` für `ACCELERATION`, `−1` für `DECELERATION` → `deltaKmh` ist ein **Betrag**, die Richtung steht in `kind`. Identisch mit den Legacy-HF-Detektoren (`trips/hf-braking.ts`: `start − end`; `trips/hf-acceleration.ts`: `end − start`) |
| Numerischer Nachweis | Alle gespeicherten und replayten Ereignisse erfüllen `deltaKmh ≥ 0` **und** `deltaKmh = kind-signierte Differenz`: TIG22 21/21, TES21-1 4/4, TES21-2 4/4, TES16 17/17 (beide Stände) |
| Rückwirkung auf Geschwindigkeiten/FSM | **Keine.** `speeds[]` und `fsmLabels[]` werden vor der Ereignisableitung berechnet; `deltaKmh` wird nirgends zurückgespeist (Code-Pfad `processDiV0MotionCoreShadowTrip`; C4/FSM-Parität mit/ohne Ereignisse im Replay) |
| Einordnung | Kein Fehler im Speed-/FSM-Pfad; eine reine Darstellungsfrage, die #2135 im Frontend (`signedDeltaKmh = sign(diff)·|Δ|` nur für die Anzeige) bereits behandelt. **Kein Handlungsbedarf im DS4-Kern.** |

### B. Dünne GPS-Stützung

| Fahrt | C4-Qualität | n | MAE | P95 | Muster t−1 t t+1 | n | MAE |
| --- | --- | --- | --- | --- | --- | --- | --- |
| TES16 | OK | 782 | 2,22 | 4,47 | PPP | 784 | 2,24 |
| | SPARSE_SUPPORT | 22 | 3,31 | 4,79 | -PP | 12 | 2,65 |
| | JITTER_SUSPECT | 4 | 5,77 | 14,42 | PP- | 12 | **3,95** (P95 11,25) |
| TES21-1 | OK | 72 | 1,36 | 5,01 | PPP | 77 | 1,66 |
| | SPARSE_SUPPORT | 68 | 2,88 | 9,79 | -PP | 29 | 1,98 |
| | JITTER_SUSPECT | 10 | 4,95 | 10,65 | PP- | 29 | **3,48**; -P- 15: 3,85 |
| TIG22 | OK | 1366 | 7,54¹ | 5,96 | PPP | 1369 | 9,22¹ |
| | JITTER_SUSPECT | 5 | 469¹ | — | PP- / -PP | 2 / 1 | 11,8 / 10,7 |

¹ enthält den Sprung-Cluster 18:49.

Befunde: Der Fehler steigt monoton mit sinkender Stützqualität (OK → SPARSE_SUPPORT → JITTER_SUSPECT) und mit dem
Abstand zur nächsten Position; **PP-** (nächste Position fehlt) ist konsistent schlechter als **-PP** (vorherige fehlt),
d. h. der rückwärtige Teil der Stützweite ist stabiler als der vorwärtige. Die betroffenen Sekunden sind jedoch
selten: auf TES16 26 von 808 (3 %), auf TIG22 6 von 1372. **Bestätigter Stillstand ohne Positionszeile** (Tesla:
API_SYNTHETIC liefert im Stand keine Zeilen) ist von **fehlender Bewegungsevidenz** (Anfahr-Latenz, Lücken während
der Fahrt) klar unterscheidbar: Erstere ist in `confirmedStillEvidence` gezählt (116 / 8 / 14 Sekunden), Letztere in
`motionNoClaim` (TES16 C4 9, L3 23; TES21-1 C4 46, L3 107). Beide werden nie als korrekt gezählt.

### C. Video-Vergleich aller geeigneten Fahrten (L3/Legacy vs. DS4)

Alle vier vorhandenen Referenzfahrten sind ausgewertet (Abschnitt 3). Legacy-L3 (Produktion) und C4 liegen auf
gemeinsamen Sekunden nahe beieinander; C4 ist nirgends schlechter und deckt mehr Sekunden ab. Der entscheidende
Unterschied liegt nicht im Wert, sondern im Verhalten bei Ausreißern (L3 roh: 11 Sekunden > 900 km/h auf TIG22;
C4: 7; nach Speed-QC: 0; #2134-C4: 0) und in der Abdeckung nach Qualitätssicherung (TIG22: QC-L3 69,7 % vs. C4
96,3–96,8 %). **OBD/Provider-Speed** wurde ausschließlich als Vergleichsquelle geführt: auf TIG22 MAE 21,5, Median 14,
P95 61 gegen die Referenz; 185 von 465 Proben ≥ 20 km/h daneben; **kein konstanter Zeitversatz** erklärt das (OBD vs.
Referenz(t+k) für k = −10 … +5: MAE 21,4–23,4, Minimum bei −1 mit 21,38). Der Kanal zeigt gehaltene Werte
(z. B. 59–64 km/h über 10 s im bestätigten Halt 18:58:51–59:00; 0 km/h über 25 s bei 75–80 km/h 18:52:52–53:16).

## 7. Fehlerursachen (reproduzierbar, nach Beitrag geordnet)

| # | Ursache | Nachweis | Beitrag | Bereits adressiert? |
| --- | --- | --- | --- | --- |
| 1 | **GPS-Sprung-Cluster** TIG22 18:49:12–24: alternierende Positionsspur, Leg-Geschwindigkeiten > 900 km/h | L3 roh 11 s mit `MOVING_SPEED_ESTIMATED` und 920–1972 km/h; C4 7 s (5 × Qualität OK/`L3_DIRECT`, 2 × `JITTER_SUSPECT`) | TIG22-MAE C4 9,22 → 2,91 ohne diese 7 s; L3 14,51 → 2,99 ohne 11 s | Speed-QC fängt alle 11 L3-Sekunden (5 `GEOMETRY_JUMP`, 6 `CROSS_SOURCE_CONFLICT`); #2134 hält alle 7 C4-Sekunden zurück (+1 plausible). **Roher L3 und C4 main haben keinen Plausibilitätsschutz** |
| 2 | **OBD-Kanal nicht sekundenaligniert** (RUPTELA_R1, `measurementTimeUtc` unbekannt, gehaltene Werte) | Abschnitt 6C; FSM 16 Falschbewegungen; Speed-QC `CROSS_SOURCE_CONFLICT` 307 Sekunden | FSM-Anfahrmedian −3 s; Produktpfad-Abdeckung 90,6 % → 69,7 %; keine Wertfehler in L3/C4 | FSM-Seite: #2134 (`fsmPointAuthority: false`); QC-Seite: **offen** (Policy V2 behandelt OBD als Zeugen mit Vetorecht) |
| 3 | **Referenz-Voreilung** (Tacho zeigt mehr als die wahre Geschwindigkeit) | Bias −0,2 → −3,5 km/h monoton mit dem Band, auf Tesla und Tiguan gleich | ≈ 85 % des verbleibenden MAE auf TES16 | Keine Korrektur zulässig: wäre Kalibrierung auf die Anzeige, nicht auf die wahre Geschwindigkeit |
| 4 | **Dünne/verrauschte Stützung** (SPARSE_SUPPORT, JITTER_SUSPECT, PP-) | Abschnitt 6B | Einzelsekunden mit 5–20 km/h; ~1–3 % der Sekunden; P95 unverändert | C4-Qualitätsflags markieren sie bereits; #2134 verschärft die 1-s-Leg-Quarantäne |
| 5 | **Anfahr-Latenz der Positionsquelle** (Tesla) | FSM-Anfahrversatz +1 … +7 s; falscher Stillstand 2/5/2 s | Keine Geschwindigkeitsfehler, aber verzögerter Bewegungsbeginn | Datenlage, nicht Algorithmus; nur mit zusätzlicher Quelle lösbar |
| 6 | **Uhrbindung TES21-2** | +1 s halbiert MAE (3,60 → 1,70) | Überschätzt den Fehler dieser DEV-Fahrt | Referenzproblem; nicht korrigiert (Regel §3) |
| 7 | **Übergangs-Lead ~1 s** (DS4 vor Anzeige) | TIG22 CHANGING-P95 8,2 vs. STEADY 5,3; TES16 4,8 vs. 4,0 | Teil des P95 in Änderungsphasen | Innerhalb der ±1 s Referenzunsicherheit; keine Maßnahme |

Nicht als Ursachen bestätigt: Zeitbasis des Positionsgrids (Versatz 0 ist auf den Fahrten mit belastbaren Ankern
optimal), Interpolation (keine im Pfad), Glättungsnachlauf (C4-Stützweite ±2 s; keine Verzögerung des
Haltezeitpunkts, DS4 ist dort 1–2 s früh), Quellenwahl zwischen L3 und C4 (Werte nach QC identisch).

## 8. Kandidatenbewertung

### 8.1 Bestehender Kandidat PR #2134 (`replay_2134`) gegen main — mechanisch nach §9

| Fahrt | Rolle | gemeinsam n | MAE | P95 | max | gepaart | zurückgehalten (unplausibel / plausibel) | FSM falsche Bewegung | FSM Anfahrt-Median | Ereignisse |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| TIG22 | EVAL, **Kandidat hier abgeleitet** | 1364 | 2,905 → 2,905 | 5,92 → 5,92 | 14,4 → 14,4 | 1372 → 1364 | 7 / 1 | 16 → 0 | −3 → 0 | 21 → 20 |
| TES21-1 | DEV | 150 | unverändert | unverändert | unverändert | 150 → 150 | 0 / 0 | 0 → 0 | 2 → 2 | 4 → 4 |
| TES21-2 | DEV | 179 | unverändert | unverändert | unverändert | 179 → 179 | 0 / 0 | 0 → 0 | 3 → 3 | 4 → 4 |
| TES16 | EVAL, unabhängig | 808 | unverändert | unverändert | unverändert | 808 → 808 | 0 / 0 | 0 → 0 | 2 → 2 | 17 → 17 |

| Kriterium (§9) | Ergebnis |
| --- | --- |
| 1 gemeinsame Sekunden (MAE −10 % oder −0,3; P95 nicht schlechter; auf einer EVAL-Fahrt) | **nicht erfüllt** — kein Wert ändert sich auf irgendeiner Fahrt |
| 2 Abdeckung ≥ Baseline | **streng verletzt** (TIG22 −8 s); in der Lesart „nur unplausible Werte zurückgehalten“ ebenfalls nicht erfüllt (1 plausible Sekunde 18:49:12, 67,3 vs. 71) |
| 3 Latenz (`MOTION_CORE_C4_INPUT_HORIZON_FORWARD_S` 2 → 2) | erfüllt |
| 4 Stillstand/Bewegung nicht schlechter; Medianversatz ≤ 1 s schlechter | erfüllt — FSM verbessert sich (16 → 0; −3 → 0); C4 `motionNoClaim` 14 → 22 (Quarantänesekunden, nicht als Fehler gezählt) |
| 5 Ereignisparität | berichtet: TIG22 21 → 20 (`ACCELERATION 18:49:12–18`, der Sprung-Artefakt, entfällt); sonst identisch |
| 6 Dev/Eval | Effekt ausschließlich auf der Ableitungsfahrt; unabhängige Fahrt TES16 bitidentisch → **keine unabhängige Validierung** |

**Urteil:** `NOT_PROVEN` als Genauigkeitsverbesserung im Sinne von §9. Belegt ist eine **Robustheitskorrektur**
(Entfernung physikalisch unmöglicher Werte, Beseitigung OBD-induzierter FSM-Falschbewegungen) ohne Regression auf
allen anderen Fahrten. Die Kriterien waren auf Wertgenauigkeit ausgelegt; dass #2134 sie nicht erfüllt, ist eine
Aussage über das, was #2134 ist (Quarantäne/Autorität, kein Schätzer), nicht über seine Richtigkeit.

### 8.2 Entscheidung über einen neuen isolierten Offline-Kandidaten

**Nicht implementiert.** Begründung entlang der Ursachenliste (Abschnitt 7):

1. Ursache 1 (Sprünge) ist durch den bestehenden Kandidaten #2134 und den Speed-QC vollständig abgedeckt; ein
   zweiter Quarantäne-Mechanismus wäre eine Parallelarchitektur.
2. Ursache 2 (OBD) betrifft auf der Speed-QC-Seite die **Abdeckung**, nicht die Werte; ein QC-Policy-Kandidat
   („INTERVAL_ONLY-OBD ohne Messzeit hat kein Vetorecht“) würde unter §9 Kriterium 1 nichts verbessern (die
   wiedergewonnenen Sekunden sind per Definition keine gemeinsamen Sekunden) und bräuchte eigene, abdeckungsorientierte
   Kriterien — das wäre eine neue Optimierungsrunde, die hier ausdrücklich nicht eröffnet wird. Als
   **Beobachtung** an die DI-Autorität übergeben.
3. Ursache 3 (Voreilung) darf nicht korrigiert werden.
4. Ursache 4 betrifft 1–3 % der Sekunden mit Einzelfehlern 5–20 km/h; selbst ihre vollständige Beseitigung senkt
   den TES16-MAE um höchstens ≈ 0,05 km/h (< 3 %) — die ≥ 10 %-Hürde ist rechnerisch unerreichbar, ohne
   Abdeckung zurückzuhalten (verboten, Kriterium 2) oder mehr Vorausschau zu nutzen (verboten, Kriterium 3).
5. Ursachen 5–7 sind Daten-/Referenzeigenschaften.

Ausdrücklich geprüft und verworfen: ein **Wert-Ersetzungs**-Kandidat, der die sieben Sprungsekunden auf TIG22 nicht
zurückhält, sondern durch einen plausiblen Wert ersetzt. Er würde Kriterium 1 auf TIG22 rechnerisch erfüllen
(MAE 9,22 → ≈ 2,9 auf 1372 gemeinsamen Sekunden), aber (a) ausschließlich aus sieben Sekunden einer Fahrt, auf der
er abgeleitet würde (Kriterium 6; TES16 enthält keine solchen Sekunden, eine unabhängige Validierung wäre
unmöglich), (b) gegen die DI-V0-Abstentionssemantik, die fehlende Evidenz nicht durch erfundene Werte ersetzt, und
(c) als Parallelpfad zur bereits vorhandenen Quarantäne in #2134.

Damit gibt es keinen Kandidaten, dessen Nutzen vorab plausibel die fixierten Kriterien erreichen könnte; eine
Implementierung „auf Verdacht“ widerspräche der Vorgabe, nur bei belegtem Nutzen zu implementieren.

## 9. Regressionen und Grenzen

- **Keine Regression** durch #2134 auf TES16/TES21 (bitidentisch) und keine Wertänderung auf TIG22.
- **Grenzen der Referenz:** 1-km/h-Quantisierung, Tacho-Voreilung, ±1 s Uhr (TIG22), unvalidierte Uhrbindung
  (TES21-1/-2), Referenzfenster länger als das DS4-Grid (TES21: 13/14 Sekunden `OUTSIDE_GRID`), Lesbarkeitslücken
  (TIG22 47, TES16 163 unlesbare Sekunden). Fehlende Werte wurden nie als Null oder als korrekt gezählt.
- **Grenzen der Stichprobe:** eine unabhängige Fahrt (TES16) für C4 main; für #2134 ist TIG22 DEV. Alle Aussagen
  über „unabhängige Genauigkeit“ beruhen auf TES16 (973 lesbare Sekunden, 0–140 km/h).
- **Grenzen des Harness:** TES16 ohne OBD-Kanal und ohne Container (DI-V0 aus dem Positions-Snapshot-Fixture);
  Speed-QC auf TES16 mit leerer OBD-Liste; FSM auf TES16 freistehend (`runMotionFsm`), auf Container-Fahrten aus
  der Prozessor-Payload (§11 N2).
- **Nicht bewertet:** das Trip-Ende 19:04 (TIG22, kein Video), Geschwindigkeiten > 140 km/h, Fahrten anderer
  Provider-Familien, Live-/Near-Realtime-Verhalten (alle Replays RETROSPECTIVE).
- **Nicht getan:** keine Änderung an Code außerhalb dieses Ordners, keine Flag-Aktivierung, kein Merge, kein Deploy,
  keine Detektorentwicklung, kein erneutes Sichten von Videos, keine Videokopien im Repository.

## 10. Bereitschaft für Beschleunigungs-/Bremsdetektoren

`READY_FOR_ACCEL_BRAKE: NO`

Begründung: Die Geschwindigkeits**werte** sind auf der unabhängigen Fahrt gut (Restfehler nach Voreilung im
Bereich der Quantisierung, P95 4,5 km/h) und Stillstand/Bewegung werden ohne Falschurteile erkannt. Δv-Detektoren
reagieren aber genau auf das, was heute noch ungeschützt ist: (a) der C4-Pfad in `main` emittiert bei GPS-Sprüngen
Werte > 900 km/h mit Qualität OK und erzeugt daraus bereits ein Scheinereignis (`ACCELERATION 18:49:12–18`), das
erst #2134 entfernt; (b) OBD-Punkte erzeugen FSM-Bewegung im Stand (16 s) — ohne #2134 würden Anfahr-/Bremsereignisse
an Halten verfälscht; (c) die unabhängige Referenzbasis besteht aus einer Fahrt, und die Referenz in Änderungsphasen
hat ±1 s Unsicherheit, was bei Δv über 3–4 s Fenster 25–33 % der Fensterlänge entspricht. Vor einer Detektorarbeit
sind nötig: Entscheidung über #2134 (oder Gleichwertiges) als Voraussetzung, Klärung der OBD-Rolle im Speed-QC
(Beobachtung, Abschnitt 8.2 Punkt 2), und mindestens eine weitere unabhängige Referenzfahrt mit validierter
Uhrbindung, die nicht zur Abstimmung verwendet wurde.

## 11. Abschlussblock

```
SPEED_BASELINE:
  code: origin/main dea2555bb (DI-Verzeichnis = Produktion 20261023001716_v4994); Replay reproduziert gespeicherte Bestände exakt (Drift 0)
  TES16 (EVAL, unabhängig, n=808): C4 MAE 2.27 / Median 2.09 / P95 4.49 / max 19.9 / Bias -1.98 / <=5km/h 97.9 % / Abdeckung 83 %; L3 roh (n=749) MAE 2.38 / max 59.4; L3 nach Speed-QC V2 (n=748) MAE 2.30 / max 6.1
  TIG22 (EVAL fuer main, DEV fuer #2134, n=1372): C4 MAE 9.22 / P95 6.04 / max 1864.8 (7 s > 900 km/h); ohne diese 7 s MAE 2.91 / P95 5.92 / max 14.4 / Bias -2.42; L3 roh (n=1284) MAE 14.51 / max 1904.9 (11 s); L3 nach Speed-QC V2 (n=988, 69.7 %) MAE 2.88 / P95 5.43 / max 11.7
  TES21-1 / TES21-2 (DEV): C4 MAE 2.29 / 3.60, P95 8.56 / 10.95 (TES21-2 bei +1 s Verschiebung 1.70 / 4.98 -> Uhrbindung unsicher, nicht uebernommen)
  gepoolt EVAL (TIG22+TES16, n=2180): C4 MAE 6.65 / Median 2.54 / P95 5.42; L3 nach QC (n=1736) MAE 2.63 / P95 4.99
  Stillstand/Bewegung: L3 und C4 0 falsche Bewegung, 0 falscher Stillstand auf allen 4 Fahrten; FSM 16 s falsche Bewegung auf TIG22 (alle OBD-induziert), 2/5/2 s falscher Stillstand auf Tesla (Anfahr-Latenz der Positionen)
  Zeitversatz: Anhalten Median -2 s (DS4 frueh), Anfahren Median 0 (C4 TIG22), +1 (C4 TES16), FSM Tesla +2..+3; FSM TIG22 -3 (OBD)
  Bias -0.2 (<30) bis -3.5 km/h (>=100) = Tacho-Voreilung der Referenz, kein Schaetzfehler
MAIN_ERROR_CAUSES:
  1 GPS-Sprung-Cluster TIG22 18:49:13-23 ohne Plausibilitaetsschutz in rohem L3 (11 s) und C4 main (7 s); Speed-QC faengt L3 (5 GEOMETRY_JUMP + 6 CROSS_SOURCE_CONFLICT), #2134 faengt C4
  2 OBD-Kanal RUPTELA_R1 nicht sekundenaligniert, gehaltene Werte (185/465 Proben >= 20 km/h daneben, kein konstanter Versatz) -> FSM-Falschbewegung 16 s (main), Speed-QC CROSS_SOURCE_CONFLICT 307 s = Produktpfad-Abdeckung 90.6 % -> 69.7 %
  3 Referenz-Voreilung (nicht korrigierbar), 4 duenne/verrauschte Stuetzung 1-3 % der Sekunden (PP- schlechter als -PP), 5 Anfahr-Latenz Tesla-Positionen, 6 Uhrbindung TES21-2, 7 ~1 s Uebergangs-Lead innerhalb Referenzunsicherheit
LEGACY_SIGN_FINDING: Konvention, kein Fehler. deltaKmh = Betrag, Richtung in kind (identisch mit Legacy hf-braking/hf-acceleration); 46/46 Ereignisse (21+4+4+17) numerisch bestaetigt; keine Rueckwirkung auf speeds[]/fsmLabels[]; Darstellungsfrage bereits in #2135 (Frontend) behandelt
SPARSE_GPS_FINDING: Fehler steigt monoton OK -> SPARSE_SUPPORT -> JITTER_SUSPECT (TES16 2.22 -> 3.31 -> 5.77; TES21-1 1.36 -> 2.88 -> 4.95) und mit fehlender Folgeposition (PP- 3.95 / 3.48 vs -PP 2.65 / 1.98); betroffen ~1-3 % der Sekunden; bestaetigter Stillstand ohne Positionszeile (116/8/14 s) klar von fehlender Bewegungsevidenz (motionNoClaim) getrennt, beides nie als korrekt gezaehlt
VIDEO_1904_IDENTITY: kein Asset. Bezeichnet das nicht videogedeckte Trip-Ende 19:04 UTC (21:04 Ortszeit) des Tiguan-Trips 98d2a8e0 am 2026-10-22 (Video endet 19:03:02Z, Grid 19:04:53Z) mit 4 gespeicherten Ereignissen NOT_VIDEO_COVERED in einem periodisch luckenhaften GPS-Abschnitt; Token stammt aus der #2135-Abschluss-QA; nicht bewertbar, nicht gezaehlt
OPTIMIZATION_RESULT: kein neuer Kandidat implementiert (NOT_PROVEN vorab: keine Ursache kann die fixierten Kriterien erreichen ohne Referenzvoreilung zu kalibrieren oder Abdeckung/Latenz zu opfern). Bestehender Kandidat #2134 auf identischen Eingaben: TIG22 (DEV fuer #2134) C4 max 1864.8 -> 14.4, FSM falsche Bewegung 16 -> 0, Anfahr-Median -3 -> 0, Scheinereignis 18:49:12-18 entfaellt; gemeinsame 1364 s MAE 2.905 -> 2.905 (keine Wertaenderung), 8 s zurueckgehalten (7 unplausibel + 1 plausibel); TES16/TES21 bitidentisch -> nach §9 NOT_PROVEN als Genauigkeitsverbesserung, belegt als Robustheitskorrektur ohne Regression, ohne unabhaengige Validierung
REGRESSIONS_AND_LIMITS: keine Regression gefunden; eine unabhaengige Fahrt (TES16); TIG22 DEV fuer #2134; TES21 DEV mit unsicherer Uhrbindung; Referenz quantisiert/voreilend/+-1 s; 19:04-Fenster und >140 km/h unbewertet; Replays RETROSPECTIVE; keine Code-, Flag-, Merge-, Deploy-Aenderung; #2135 unveraendert; keine Videos im Repository
READY_FOR_ACCEL_BRAKE: NO
```
