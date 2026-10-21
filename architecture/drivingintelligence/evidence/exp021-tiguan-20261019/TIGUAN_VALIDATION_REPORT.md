# Tiguan EXP021 — Validierungsbericht (Road-Matching A–E)

## Ziel

Offline-Vergleich derselben DIMO-GPS-Eingabe mit fünf S4-Research-Decodern gegen die eingefrorene Video-Referenz (ohne Produktionsänderungen).

## Ergebnis in Kurzform

| Frage | Antwort |
|-------|---------|
| Fahrt identifiziert? | **Ja** — Trip `632dc9c5-a8d9-45ce-a269-abe89d22d677`, Tiguan WOB L 7503, token **192922** |
| Replay A–E ausgeführt? | **Ja**, Commit `9f0693bef572a065e45f5dad91ef236ba4f2ccd9` |
| Backtracking besser als Forward V2? | **Nicht referenzgestützt belegt** — Way-Metriken A=B; nur 3 Buckets parallele Ways (B≠A), Referenz dort nicht way-entscheidend |
| Strict Node-ID? | **Kein Effekt** vs Forward/Backtrack im Video-Fenster |
| Route-Aware R4.1 besser? | **Teilweise andere Hypothesen** (13 Buckets ≠ A–D, v. a. B-3-Standphase); **9 weniger Way-Konflikte** bei gleichem Nenner, aber auch mehr UNKNOWN; **kein Gesamt-Accuracy-Gewinn bewiesen** |
| Hebbel vs Schwab (C01)? | Alle Varianten **25932713** (Hebbel) wo vergleichbar — **kein Decoder-Vorteil** |

## Eingaben

- GPS: `fixtures/TIGUAN_POSITION_GRID.json` (1480 Buckets, gepinnte S4-Evidenz).
- OSM: `TIGUAN_OSM_FROZEN_SNAPSHOT.json` (Overpass, 75 m Korridor, Hash in `TIGUAN_INPUT_MANIFEST.json`).
- Referenz: Kompaktpaket `/opt/cursor/artifacts/exp021-tiguan-validation/compact/`.

## Varianten

| ID | Algorithmus |
|----|-------------|
| A | `S4_RESEARCH_VITERBI_FORWARD_V2` + gerundete Geometrie-Adjazenz |
| B | `S4_RESEARCH_VITERBI_BACKTRACK_R1` + gerundete Adjazenz |
| C | A + `S4_RESEARCH_STRICT_NODE_ID_TOPOLOGY_R1` |
| D | B + Strict Node-ID |
| E | `S4_RESEARCH_ROUTE_AWARE_VITERBI_R4_1` + gerichteter Graph R4.1 |

Geometrie: `S4_RESEARCH_LOCAL_EQUIRECTANGULAR_V2`.

## Artefakte

| Datei | Inhalt |
|-------|--------|
| `TIGUAN_A_B_C_D_E_COMPARISON.csv` | Sekundenvergleich 546 Zeilen |
| `TIGUAN_VARIANT_METRICS.csv` | Aggregierte Way-Metriken mit Nenner |
| `TIGUAN_TIME_ALIGNMENT.csv` | Gerät↔DIMO-Zuordnung |
| `TIGUAN_EVENT_COMPARISON.csv` | Ereignis-/Prüfstellenübersicht |
| `replay/variant_*_raw.json` | Rohdecoder-Ausgaben |
| `TIGUAN_REPLAY_SUMMARY.json` | Diff-Buckets, Kennzahlen |

## Reproduktion

```bash
cd backend
npx ts-node --transpile-only scripts/research/exp021-tiguan-validation.harness.ts
```

Voraussetzung: `TIGUAN_EVIDENCE_GZIP` (Production-Export) unter `/opt/cursor/artifacts/exp021-tiguan-validation/raw/tiguan_evidence_payload.gz`.

## Nicht entscheidbar / offen

- Exakte sekündliche Way-Accuracy ohne UTC-Kalibrierung.
- Straßenname-only-Referenz ohne Way-ID.
- B-3-Unterführung: Decoder UNKNOWN — Referenz-Manöver nicht auf Way-Ebene prüfbar.
- Pfadkosten E vs A–D nicht vergleichbar (unterschiedliche Kostenfunktion).

## Nächster Schritt (begründet)

1. Provider-Messzeitstempel-Export für Offset-Bereich (read-only).
2. Größerer / Layer-bewusster OSM-Snapshot für B-3-Brücken-/Restriction-Fälle.
3. Manuelle Review nur für die 13 dokumentierten Varianten-Diff-Buckets + E002 UNKNOWN-Fenster.
