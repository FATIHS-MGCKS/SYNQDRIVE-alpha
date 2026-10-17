# EXP021 — Rückblickende Halterkennung (Offline-Prototyp v0_1)

**PR #2051** · Referenzfahrt Tesla · **Keine** Produktivaktivierung, L3 unverändert.

**Ausführen:** `npm run exp021:retrospective-halt-prototype -- --out-dir ../architecture/drivingintelligence/evidence/exp021-ev-ground-truth/forensic-readonly-exports-2026-10-16-retrospective-halt`

**Artefakte:** JSON-Ereignistabelle, `MAP_REVIEW.html`, `SUMMARY.md`, Video-Abgleich, A/B-Vergleich.

---

## Kurzfassung (Antwort auf die Lieferfragen)

| Frage | Ergebnis |
|--------|----------|
| **Welche Halte zusätzlich?** | Alle **5** annotierten Haupthalte als **Lücken-Ereignis** getroffen (Overlap), plus **11** Geometrie-**Langsam-roll**-Segmente (52 s gemessen, v. a. frühe Fahrt — nicht Halt-Kern). |
| **Rollen vs. Stehen?** | Video-Tacho-0-Halte oft **`LIKELY_MOVING_WITH_GAP`** (Chord/Bracket-Metrik), während **11** Band-Sekunden **`SLOW_ROLL_GEOMETRY`** (1,5–5 km/h Beine) — Verwechslung **Halt in Lücke** vs. **belegtes langsames Rollen** wo Positionen dicht sind. |
| **Unentscheidbar?** | **124** Halt-Sekunden ohne Positionszeile bleiben ohne kausalen Stillstandsnachweis; Lückendauer ≠ Stillstandsdauer. |

---

## 1. Langsames Rollen (Geometrie)

- Regeln auf **alle** PRESENT-Ketten + Kalender-±1s wo verfügbar.
- Streu-Schwelle: `holdNoiseDisplacementM` (0,68 m) — kleine Änderung allein ≠ Bewegungsbeweis.
- **52** SLOW_ROLL-Sekunden, **11** zusammenhängende Segmente (`SLOW_EVT_*`) — deckt die bekannten 11 Band+Tacho-1–3-Fälle ab.
- Produkt-QC schreibt Bein-Speeds im V2-Band-Pfad nicht ins Exportfeld; Prototyp nutzt **dieselben Pin-Koordinaten** offline.

---

## 2. Ereigniskandidaten (ohne Video-Eingabe)

- **10** Positionslücken ≥3 s (gesamte Fahrt, nicht nur 5 Fenster).
- Pro Lücke: Bracket (~10 s) vor/nach, Chord, Pfadlänge vs. Endpunkt, R1 falls vorhanden.
- **Video-Haltefenster werden nicht** als Detektor-Input verwendet.

---

## 3. Konkurrierende Erklärungen (Evidenzstufen, keine Prozent)

| Klasse | Bedeutung |
|--------|-----------|
| `LIKELY_HALT` | Kleine Chord über längere Lücke, niedrige Annäherungs-/Abfahr-Beine |
| `LIKELY_SLOW_ROLL_STOP_GO` | Langsame Bracket-Beine oder Geometrie-Segment |
| `LIKELY_MOVING_WITH_GAP` | Hohe Chord-/Bracket-Implied-Speed |
| `NOT_DISTINGUISHABLE` | Widersprüchliche oder dünne Evidenz |

Jedes Ereignis: `supportingAndContradicting[]`, `retrospectiveStatementPossibleAtUtc`, `standstillDurationSec: null`.

---

## 4. Karte A/B

| Variante | Inhalt |
|----------|--------|
| **A** | `MAP_REVIEW.html` — OSM-Basiskarte, gemessene Punkte, **gestrichelte** Lücken-Chords, Ereignis-Marker |
| **B** | + OSM `highway=traffic_signals` per Overpass |

**B-Status (dieser Lauf):** Overpass **HTTP 406** — Variante A vollständig; B dokumentiert ohne Ampel-Layer (`AB_COMPARISON.json`). Koordinaten im HTML auf **4 Dezimalstellen** gerundet.

---

## 5. Video-Bewertung (nachträglich)

Siehe `VIDEO_EVALUATION.json` · `haltClassificationVsVideo`:

- **5/5** bekannte Halte mit Detektor-Overlap.
- Typischer Konflikt: **31–40 s Video-Tacho-0** vs. Detektor **`LIKELY_MOVING_WITH_GAP`** an derselben Lücke (Metrik sieht Fahrt/Lücke, Video sieht Anzeige-Stillstand).
- **Synthetischer Stresstest:** künstliche 6 s-Lücke in Bewegungsabschnitt → `LIKELY_MOVING_WITH_GAP` (kein falscher Halt).

---

## 6. Regeln eingefroren

Parameter in `exp021-retrospective-halt-prototype.lib.ts` (`GEOMETRY_THRESHOLDS`, Bracket-Größe, min Gap 3 s) — nur für diese Referenzfahrt kalibriert/validiert; vor weiteren Fahrten nicht blind übernehmen.

**Entwicklungs-/Prüfmaterial** — kein Blindtest.

---

## v0_2 (Rückblick-Halt Halt / Fehlklassifikationen)

**Ausführen:** `npm run exp021:retrospective-halt-prototype -- --out-dir …/forensic-readonly-exports-2026-10-16-retrospective-halt-v2`  
(Legacy v0_1: `--v0-1` + v0_1 Exportordner)

**Neue Artefakte:** `MAIN_HALT_CLASSIFICATION_TABLE.json`, `NATURAL_GAP_EVALUATION.json`, `SLOW_ROLL_VIDEO_CROSS_TAB.json`, `SYNTHETIC_GAP_BATTERY.json`

| Thema | v0_2 Änderung |
|--------|----------------|
| **5/5 Overlap** | Getrennt: **Kandidatenabdeckung** vs. **Klassifikation** (`VIDEO_EVALUATION.json` + Haupttabelle mit 31/40/8/20/26 s) |
| **LIKELY_MOVING_WITH_GAP** | Ursache dokumentiert: v0_1 Bracket-Mittel + Chord-Kontradikt; v0_2 Kalender-Kanten + Composite Halt+Abfahrt |
| **0,68 m** | `HOLD_NOISE_DISPLACEMENT_DOCUMENTATION` im Export — SynqDrive `holdNoiseDisplacementM`, nicht allgemeine GPS-Genauigkeit |
| **Present-Kette** | `presentChainSpanSec` / `aggregateEligible` — Langsam-Roll-Aggregat nur Kalender-1s, Kette ≤2 s |
| **Karte B** | Overpass **POST** + `User-Agent` (406 ohne UA); 658 Signale im BBOX — Klassifikation unverändert, Kontext in `mapContextVariantB` |
| **Gegenprüfung** | Alle natürlichen Lücken + synthetische 6s/12s-Masken (`SYNTHETIC_GAP_BATTERY.json`) |

**Referenzlauf (v0_2):** 5/5 Kandidatenabdeckung; ehrliche Nachbewertung siehe eingefrorene Review (`forensic-readonly-exports-2026-10-16-retrospective-halt-v2-freeze/`) — keine Sammelkategorie „5/5 korrekt“.

**Freeze-Review:** `npm run exp021:retrospective-halt-v0-2-freeze-review -- --out-dir …/retrospective-halt-v2-freeze` · Parameter-Hash in `V0_2_FREEZE_MANIFEST.json`.
