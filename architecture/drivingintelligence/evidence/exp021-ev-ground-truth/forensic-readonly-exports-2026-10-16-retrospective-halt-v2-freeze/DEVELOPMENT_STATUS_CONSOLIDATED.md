# EXP021 Entwicklungsstand (konsolidiert)

- 10 Positionslücken ≥3 s als Kandidaten; 5 annotierte Tacho-0-Abschnitte (LONG_HALT_*) mit überlappender Lücke.
- v0_2 klassifiziert überlappende Haupthalt-Lücken überwiegend als LIKELY_HALT bei kleiner Endpunkt-Chord + Abfahrt-Muster (ohne Halt-Lokalisierung).
- Frühe Lücken 002/003: LIKELY_HALT aus Geometrie, Video nicht vollständig prüfbar — Fehlalarm-Risiko.
- Geometrie: Netto-Ortsveränderung über Lücke, nicht gemessene Weglänge (siehe GEOMETRY_NET_DISPLACEMENT_SEMANTICS).

## Gegenfälle bestanden
- Synthetisch: 3/3 (kein LIKELY_HALT in maskierter Fahrt; {"LIKELY_MOVING_WITH_GAP":2,"NOT_DISTINGUISHABLE":1}).
- Natürlich: keine v0_2 LIKELY_MOVING_WITH_GAP auf den fünf Referenz-Tacho-0-Lücken (v0_1-Fehlmuster behoben).
- MAP_DECISION_HYPOTHESIS_V1 verworfen — kein produktives Karten-Veto.

## Fehlalarm-Risiken
- 2 LIKELY_HALT ohne LONG_HALT-Overlap (002/003).
- Chord-kleine lange Lücken können LIKELY_HALT auslösen ohne Video-Tacho-0 im Lückenfenster.
- GAP_EVT_008: ein Kandidat für zwei annotierte Tacho-0-Abschnitte — physische Ereignisanzahl ungeklärt.
- 52 SLOW_ROLL-Geometrie-Sekunden vs. Video oft >3 km/h — Rollen/Halt-Verwechslung bei dichten PRESENT-Ketten.

## Nächste unabhängige Referenzfälle
- Weitere Fahrten mit unabhängigem Video + unterschiedliche Lückenprofile (kurz/lang, innerorts/außerorts).
- Fahrten mit vollständiger Videoabdeckung der gesamten Trip-Zeit (kein Vor-Anker-Blindfeld).
- Explizite Gegenfälle: Rollen an Ampel ohne Halt, Halt ohne OSM-Signal in Reichweite, Durchfahrt mit ROW_ABSENT.
- Blind gehaltene Halte (nicht in dieser Tesla-Referenzfahrt tunen).
