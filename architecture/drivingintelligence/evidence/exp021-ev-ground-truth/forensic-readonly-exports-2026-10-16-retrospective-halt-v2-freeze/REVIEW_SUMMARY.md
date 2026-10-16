# EXP021 v0_2 — eingefrorene Review-Auswertung

**Freeze:** `EXP021_RETROSPECTIVE_HALT_V0_2_FROZEN_REVIEW_2026-10-16`  
**Parameter-Hash:** `dc4339e7b3687ef613b59e3ee9fe75b7a3d885dce5f5884735421e58a46d4ab7`  
**Input-Stand-Hash:** `889d7804870665100f8eb536577fda245b46f89a742cf1a74c824b6936865504`

## Referenz LONG_HALT
LONG_HALT_1–5 are contiguous readable tacho-zero display segments from video overlay — not five proven independent physical halt events.  
Zeit: **05:xx Berlin = 03:xx UTC** (CEST). H4/H5 Annotationslücke 05:44:03–05:44:09 — physische Ereignisanzahl ungeklärt.

## Karte
v0_2: **reine Kontextanzeige**. **MAP_DECISION_HYPOTHESIS_V1 verworfen** (kein Karten-Veto). Kontext nur „mögliche Ursache“ in `PER_EVENT_DECISIONS.md`.

## Video ABC (005–008)
| Evt | A | B | C |
|-----|---|---|---|
| GAP_EVT_005 | YES | NO | NOT_DETERMINED |
| GAP_EVT_006 | YES | NO | NOT_DETERMINED |
| GAP_EVT_007 | YES | YES | NOT_DETERMINED |
| GAP_EVT_008 | YES | NO | NOT_DETERMINED |

## Entwicklungsstand
Siehe `DEVELOPMENT_STATUS_CONSOLIDATED.md`

## Zehn Lückenereignisse

| Evt | Berlin (von–bis) | v0_1 | v0_2 | Video 0 / 1–3 / 3–5 / >5 / ? | Haupthalt | Video-Urteil |
|-----|-------------------|------|------|----------------------------------|-----------|--------------|
| GAP_EVT_001 | 16.10.2026, 05:36:00–16.10.2026, 05:36:05 | LIKELY_SLOW_ROLL_STOP_GO | NOT_DISTINGUISHABLE | 0/0/0/0/6 | — | UNKNOWN_COVERAGE |
| GAP_EVT_002 | 16.10.2026, 05:36:07–16.10.2026, 05:36:55 | LIKELY_SLOW_ROLL_STOP_GO | LIKELY_HALT | 0/0/0/0/49 | — | UNKNOWN_COVERAGE |
| GAP_EVT_003 | 16.10.2026, 05:36:59–16.10.2026, 05:37:44 | LIKELY_SLOW_ROLL_STOP_GO | LIKELY_HALT | 3/0/0/0/43 | — | NOT_DECISIVE |
| GAP_EVT_004 | 16.10.2026, 05:38:19–16.10.2026, 05:38:21 | LIKELY_SLOW_ROLL_STOP_GO | NOT_DISTINGUISHABLE | 2/1/0/0/0 | — | NOT_DECISIVE |
| GAP_EVT_005 | 16.10.2026, 05:40:19–16.10.2026, 05:40:50 | LIKELY_MOVING_WITH_GAP | LIKELY_HALT | 31/1/0/0/0 | LONG_HALT_1 | SUPPORTED |
| GAP_EVT_006 | 16.10.2026, 05:41:50–16.10.2026, 05:42:30 | LIKELY_MOVING_WITH_GAP | LIKELY_HALT | 40/0/1/0/0 | LONG_HALT_2 | NOT_DECISIVE |
| GAP_EVT_007 | 16.10.2026, 05:42:51–16.10.2026, 05:42:57 | LIKELY_MOVING_WITH_GAP | LIKELY_HALT | 7/0/0/0/0 | LONG_HALT_3 | SUPPORTED |
| GAP_EVT_008 | 16.10.2026, 05:43:43–16.10.2026, 05:44:36 | LIKELY_MOVING_WITH_GAP | LIKELY_HALT | 46/0/0/1/7 | LONG_HALT_4,LONG_HALT_5 | NOT_DECISIVE |
| GAP_EVT_009 | 16.10.2026, 05:54:22–16.10.2026, 05:54:24 | LIKELY_SLOW_ROLL_STOP_GO | LIKELY_SLOW_ROLL_STOP_GO | 2/1/0/0/0 | — | NOT_DECISIVE |
| GAP_EVT_010 | 16.10.2026, 05:54:45–16.10.2026, 05:54:55 | LIKELY_SLOW_ROLL_STOP_GO | NOT_DISTINGUISHABLE | 0/0/0/0/11 | — | UNKNOWN_COVERAGE |

Details: `TEN_GAP_EVENTS.json`

## Fünf Haupthalte (getrennt, ohne Sammel „Halt/Slow-roll“)

| Halt | Berlin | Detektor-Ergebnis | Überlappende GAP_EVT | Tacho-0 s |
|------|--------|-------------------|----------------------|----------:|
| LONG_HALT_1 | 16.10.2026, 05:40:19–16.10.2026, 05:40:49 | PROBABLE_HALT_CLASSIFIED | GAP_EVT_005 | 31 |
| LONG_HALT_2 | 16.10.2026, 05:41:50–16.10.2026, 05:42:29 | PROBABLE_HALT_CLASSIFIED | GAP_EVT_006 | 40 |
| LONG_HALT_3 | 16.10.2026, 05:42:50–16.10.2026, 05:42:57 | PROBABLE_HALT_CLASSIFIED | GAP_EVT_007 | 8 |
| LONG_HALT_4 | 16.10.2026, 05:43:43–16.10.2026, 05:44:02 | PROBABLE_HALT_CLASSIFIED | GAP_EVT_008 | 20 |
| LONG_HALT_5 | 16.10.2026, 05:44:10–16.10.2026, 05:44:35 | PROBABLE_HALT_CLASSIFIED | GAP_EVT_008 | 26 |

**Hinweis:** `PROBABLE_HALT_CLASSIFIED` ≠ zeitliche Lokalisierung des Halts innerhalb des Kandidatenfensters.

## Sechs × LIKELY_HALT
- **GAP_EVT_002**: Video-Haupthalt zuordenbar=false; geteilt mit —; Video=UNKNOWN_COVERAGE
- **GAP_EVT_003**: Video-Haupthalt zuordenbar=false; geteilt mit —; Video=NOT_DECISIVE
- **GAP_EVT_005**: Video-Haupthalt zuordenbar=true; geteilt mit LONG_HALT_1; Video=SUPPORTED
- **GAP_EVT_006**: Video-Haupthalt zuordenbar=true; geteilt mit LONG_HALT_2; Video=NOT_DECISIVE
- **GAP_EVT_007**: Video-Haupthalt zuordenbar=true; geteilt mit LONG_HALT_3; Video=SUPPORTED
- **GAP_EVT_008**: Video-Haupthalt zuordenbar=true; geteilt mit LONG_HALT_4, LONG_HALT_5; Video=NOT_DECISIVE

## Gegenprüfung (Zahlen)

**Natürliche Lücken (10):** {"NOT_DISTINGUISHABLE":3,"LIKELY_HALT":6,"LIKELY_SLOW_ROLL_STOP_GO":1}  
Falsche-Halt-Signale: {"likelyHaltWithoutOverlappingMainHaltWindow":2,"likelyHaltWithVideoContradictionOrNoStopEvidence":1,"interpretation":"v0_2 kann Lücken mit kleiner Chord als LIKELY_HALT stufen ohne Video-Tacho-0 im Lückenfenster — kein positiver Haltbeleg."}  
Video nachträglich: gestützt 2, widersprochen 0, nicht entscheidbar 5

**Synthetisch:** 3 Fälle, Pass 3, Fail 0; Klassen {"LIKELY_MOVING_WITH_GAP":2,"NOT_DISTINGUISHABLE":1}

## 52 SLOW_ROLL-Sekunden — Video
Alle: {"tacho0":0,"tacho1to3":20,"tacho3to5":19,"tachoGt5":1,"unknown":12,"totalLabeledSeconds":52}  
Aggregat-fähig: {"tacho0":0,"tacho1to3":14,"tacho3to5":17,"tachoGt5":0,"unknown":10,"totalLabeledSeconds":41}

## Haltindizien 005–008
Siehe `HALT_INDICATIONS_005_008.json` (Werte + explizit kein Beweis allein aus „keine Gegenargumente“).

## Video-Bewertungsregel
Axis A: ≥3s or any tacho0 in gap window. Axis B: all known seconds tacho0 and ≥5 known seconds. Unknown seconds excluded from B and do not count as hit or error. Post-hoc verdict (SUPPORTED/…) compares detector class to both axes — not “no contradict = proof”.

## Clip-Anfragen / Nicht prüfbar
- **GAP_EVT_001** [DOCUMENT_NOT_VERIFIABLE] 16.10.2026, 05:36:00 (UTC 2026-10-16T03:36:00Z) – 16.10.2026, 05:36:05 (UTC 2026-10-16T03:36:05Z): Vollständig vor vorhandenem Video (Anker 05:37:41 Berlin / 03:37:41Z). Kein weiteres früheres Video anfordern.
- **GAP_EVT_002** [DOCUMENT_NOT_VERIFIABLE] 16.10.2026, 05:36:07 (UTC 2026-10-16T03:36:07Z) – 16.10.2026, 05:36:55 (UTC 2026-10-16T03:36:55Z): Vollständig vor vorhandenem Video (Anker 05:37:41 Berlin / 03:37:41Z). Kein weiteres früheres Video anfordern.
- **GAP_EVT_003** [DOCUMENT_NOT_VERIFIABLE] 16.10.2026, 05:36:59 (UTC 2026-10-16T03:36:59Z) – 16.10.2026, 05:37:44 (UTC 2026-10-16T03:37:44Z): Überwiegend vor Video-Anker; mit vorhandenem Material nicht vollständig prüfbar — keine Wiederholungsanfrage.
- **GAP_EVT_008_H4_H5_CONTEXT** [REQUEST_CLIP] 05:43:43 (03:43:43Z) – 05:44:36 (03:44:36Z): Optional: H4/H5 Tacho-0-Fenster und Annotationslücke 05:44:03–05:44:09 (03:44:03–03:44:09Z) — physische Ereignisanzahl ungeklärt; kein Merge-Fehler.
