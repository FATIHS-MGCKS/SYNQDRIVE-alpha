# EXP021 — Rückblick-Halt-Prototyp (Kurzfassung)

## Zusätzlich erkannte Ereignisse (ohne Video-Eingabe)

- **Positionslücken ≥3s:** 10 Kandidaten (0 wahrscheinlicher Halt · 6 langsam/Stop-go · 4 Weiterfahrt mit Lücke · 0 nicht unterscheidbar)
- **Langsam-Roll-Geometrie-Segmente:** 11 (Summe 52 gemessene Sekunden)

## Bekannte Video-Halte (5)

- Als überlappendes Detektor-Ereignis gefunden: **5/5**
- Details: `VIDEO_EVALUATION.json`

## Verwechslungen / Grenzen

- **Rollen vs. Stehen:** 6 Lücken + 11 Geometrie-Segmente als langsam klassifiziert; Video-Tacho 1–3 km/h separat im Abgleich prüfen.
- **Fälschliche Halte bei Fahrt:** Synthetischer Stresstest in Bewegungsabschnitt: Klassifikation `LIKELY_MOVING_WITH_GAP` (Pass=true).
- **Unentscheidbar:** 0 Lücken — Lückendauer ≠ Stillstandsdauer.

## Geometrie (gesamte Fahrt, PRESENT)

| Klasse | Sekunden |
|--------|--------:|
| NEAR_STOP | 4 |
| SLOW_ROLL | 52 |
| MOVING | 795 |
| SCATTER | 16 |

## Karte A/B

- **A:** Fahrtverlauf + Lücken-Chords (ungemessen gestrichelt) — `MAP_REVIEW.html`
- **B:** + OSM Ampeln (siehe AB_COMPARISON.json)

Entwicklungs-/Prüfmaterial — kein Blindtest. Produkt-L3 unverändert.
