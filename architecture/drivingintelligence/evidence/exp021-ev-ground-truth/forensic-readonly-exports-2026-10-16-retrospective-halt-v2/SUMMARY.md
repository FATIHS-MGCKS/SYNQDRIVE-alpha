# EXP021 — Rückblick-Halt-Prototyp v0_2

## Kandidaten vs. Klassifikation (5 Haupthalte)

Referenzlängen **31, 40, 8, 20, 26** Sekunden (Video Tacho 0) — nicht pauschal „31–40 s“.

| Halt | Video s | Vorhersage | Video-Abgleich |
|------|--------:|------------|----------------|
| LONG_HALT_1 | 31s | LIKELY_HALT | ALIGNED_HALT_CLASS |
| LONG_HALT_2 | 40s | LIKELY_HALT | ALIGNED_HALT_CLASS |
| LONG_HALT_3 | 8s | LIKELY_HALT | ALIGNED_HALT_CLASS |
| LONG_HALT_4 | 20s | LIKELY_HALT | ALIGNED_HALT_CLASS |
| LONG_HALT_5 | 26s | LIKELY_HALT | ALIGNED_HALT_CLASS |

- **Kandidatenabdeckung (Overlap):** 5/5
- **Klassifikation video-konsistent (Halt/Slow-roll):** 5/5
- Detailzeilen: `MAIN_HALT_CLASSIFICATION_TABLE.json`

## Positionslücken ≥3s

10 Kandidaten (6 Halt · 1 langsam/Stop-go · 0 Weiterfahrt mit Lücke · 3 nicht unterscheidbar)

## Langsam-Roll-Geometrie

- Alle SLOW_ROLL-Sekunden: 52 (davon Present-Kette: 11)
- Für Aggregat zählfähig (Kalender 1s, Kette ≤2s): 41
- Video-Kreuztabelle: `SLOW_ROLL_VIDEO_CROSS_TAB.json`

## Synthetische vs. natürliche Lücken

- Synthetische Fälle: 3 (`SYNTHETIC_GAP_BATTERY.json`)
- Natürliche Lücken: `NATURAL_GAP_EVALUATION.json`

## Karte A/B

A + B ausgeführt — siehe AB_COMPARISON.json

## v0_1 Fehlklassifikation

Bracket-Mittelgeschwindigkeit und Chord-Kontradikt → `LIKELY_MOVING_WITH_GAP`; v0_2 ersetzt durch Kalender-Kanten und Composite-Scoring (siehe Export).

Entwicklungs-/Prüfmaterial — kein Blindtest. Produkt-L3 unverändert.
