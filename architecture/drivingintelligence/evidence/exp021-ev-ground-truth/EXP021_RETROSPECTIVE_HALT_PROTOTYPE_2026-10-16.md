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
