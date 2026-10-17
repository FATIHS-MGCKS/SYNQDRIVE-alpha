# EXP021 — Vorhandene Information vollständig erschließen (Stillstand)

**Stand:** 2026-10-16 · PR #2051  
**Export:** [`forensic-readonly-exports-2026-10-16-stationary-evidence-surface/`](./forensic-readonly-exports-2026-10-16-stationary-evidence-surface/)  
**Skript:** `npm run exp021:stationary-evidence-surface`

Kein wiederholter Provider-Abruf; Pin und Baseline unverändert.

---

## 1. Provider-Befund (präzise, nur dieser Pfad)

| Aspekt | Status | Aussage |
|--------|--------|---------|
| Query | **CONFIRMED** | `signals(tokenId, from, to, interval: "1s")` + `currentLocationCoordinates(agg: AVG)` — `DI_V0_POSITION_QUERY_SPEC_V0_1` |
| Pagination | **CONFIRMED** | Keine; eine `data.signals[]`-Liste (`extractProviderRows`) |
| Normalisierung | **CONFIRMED** | Erwartetes 1s-Raster `[from,to)`; `ROW_ABSENT` nur wenn **keine** Provider-Zeile auf Bucket-Index mappt (`providerRowCount=0`, Semantic-Validator) |
| Fehlende Halt-Labels | **CONFIRMED** | **124/125** Haupthalt-Sekunden: Pin `ROW_ABSENT` + `providerRowCount=0`; gespeicherter Fresh-Vergleich: ebenfalls `ROW_ABSENT` / `providerRowCount=0` |
| Abgelehnte Zeilen nahe Halten | **CONFIRMED** | **0** — Lücken sind nicht „falsche Timestamps“, sondern fehlende Grid-Zeilen |
| Uplink-Unterdrückung unveränderter Positionen | **UNKNOWN** | Sparse `signals[]` ist konsistent mit fehlenden Sekunden; kein Tesla-Uplink-Trace in diesem Pin |
| Allgemeiner Sensorausfall | **nicht behauptet** | Nur: **historischer Positions-AVG-1s-Pfad** liefert für Halt-Kern keine Zeilen |

---

## 2. Übertragungsverhalten (Integrations-/Dokumentationsbezug)

| Thema | Epistemik | Kurz |
|-------|-----------|------|
| `timestamp` in Query | **INFERRED** (DIMO telemetry-api RD001) | Query-verankertes 1s-Bucket-Label, nicht garantierte physische Messzeit |
| Unveränderte Koordinaten | **UNKNOWN** (Tesla) | SynqDrive erzeugt `ROW_ABSENT` nicht aus HOLD nach Empfang; fehlende Zeile = fehlender Array-Eintrag |
| Live vs. historisch | **CONFIRMED** (Pin) | Evidence = `TELEMETRY_SIGNALS_HISTORICAL`; Live-`signalsLatest` ist anderer Produktpfad |
| „Lücke = Stillstand“ | **abgelehnt** | `NO_MOTION_EVIDENCE` / `ROW_ABSENT` = Enthaltung |

---

## 3. Signal-Inventar (diese Fahrt, gepinnt)

| Signal | Herkunft | Haupthalte (Kern) | Aussagegrenze |
|--------|----------|-------------------|---------------|
| **POSITION** 1s AVG | S4 POSITION channel | fast nur `ROW_ABSENT` (1× PRESENT am Rand Halt 3) | Kein Stillstand in Lücken ableitbar |
| **R1_OBD speedKmh** | S4 R1 (Tesla-Pfad) | **0** Bucket-Einträge in allen 5 Haltfenstern | Kein unabhängiger Geschwindigkeitszeuge in Halten |
| **S1/L3 Shadow** | Replay | Halt: `NO_MOTION_EVIDENCE`, oft `L3_SUPPORT_CROSSES_GAP` | Kein `STATIONARY_BAND` in Halt-Kern |
| Park/Gang/Motion-Status (OBD) | — | **nicht im Pin** belegt | Nicht aus Schema annehmen |

Details: `STATIONARY_EVIDENCE_SURFACE_EXPORT.json` → `signalInventory`.

---

## 4. Fehlende Leg-Speeds (11× Band, Video-Tacho 1–3)

| Frage | Ergebnis |
|-------|----------|
| Fehlen Koordinaten? | **Nein** — prev/center/next jeweils `PRESENT` mit Lat/Lon |
| Warum Export `qcLegImpliedSpeedMps` null? | **CONFIRMED:** V2-`STATIONARY_BAND`-QC akzeptiert null L3 und schreibt Beine nicht in `supportAssessment` |
| Offline-Geometrie | **~1,6–3,0 km/h** Bein-Implied (siehe `BAND_LEG_GEOMETRY.json`) → **belegte langsame Bewegung** auf diesen Sekunden (nicht Haupthalt) |

---

## 5. Offline-Experimente (ohne Produktänderung)

### A — R1-Zeuge in POSITION-Lücken (Haupthalte)

- **124** ROW_ABSENT-Sekunden in Halten · **0** mit numerischem R1  
- Kausal: **124× unbekannt** (kein Standstill-/Creep-Nachweis aus Pin)

### B — Bein-Geometrie auf Band-Sekunden (Tacho 1–3, außerhalb Haupthalte)

- **11/11** mit Bein max **1,5–5 km/h** → offline **langsame Bewegung** evidenzbasiert  
- Konflikt: V2-Band + Video 1–3 km/h = konsistent mit **langsam rollen**, nicht mit **belegtem absoluten Stillstand**  
- **Löst Haupthalt-Erkennung nicht** (dort keine Positions-/R1-Dichte)

**Fehlende Information (konkret):** Für die **31–40 s** Video-Tacho-0-Fenster fehlt im Pin **jede** 1s-Positionszeile (und R1) — nicht nur ein abgeleitetes QC-Feld. Ohne neue **zeitlich aufgelöste** Positions- oder unabhängige Geschwindigkeitsbelege **in diesen Fenstern** bleibt Stillstand vs. langsames Rollen **kausal ununterscheidbar** (retrospektive Bracket-Distanz ~wenige Meter ist **kein** kausaler Stillstandsbeweis).

---

## 6. Tabelle je Haupthalt

| Halt | Was vorhanden? | Was fehlt? | Was erkennbar? |
|------|----------------|------------|----------------|
| **LONG_HALT_1** | Shadow-Zeilen mit `ROW_ABSENT`; PRESENT unmittelbar davor/danach außerhalb Fenster | 31/31 POSITION raw row=0; R1; V2-Band | **Unbekannt** in Fenster (Enthaltung korrekt) |
| **LONG_HALT_2** | wie oben | 40/40 raw row=0 | **Unbekannt** |
| **LONG_HALT_3** | 1× POSITION PRESENT (`03:42:50Z`) | 7/8 Lücken; kein R1 | Rand-Label ≠ Halt-Kern; Kern **unbekannt** |
| **LONG_HALT_4** | Shadow `NO_MOTION` | 20/20 raw row=0 | **Unbekannt** |
| **LONG_HALT_5** | Shadow `NO_MOTION` | 26/26 raw row=0 | **Unbekannt** |

Maschinenlesbar: [`HALT_SUMMARY_TABLE.md`](./forensic-readonly-exports-2026-10-16-stationary-evidence-surface/HALT_SUMMARY_TABLE.md).

---

## Nächster sinnvoller Schritt (messbar, nicht Produktion)

Wenn Product weiter an Haupthalten arbeitet: **nur** Evidence-Klassen erweitern, die bei **vorhandenen** dichten Positions-Triplets greifen (Experiment B zeigt Nutzen **außerhalb** Lücken). Für Lücken selbst: explizit **`UNKNOWN_CAUSAL`** beibehalten, bis **dieselbe Query-Familie** oder ein **im Pin nachweisbarer** alternativer Zeuge (z. B. R1 mit Abdeckung) in den Halt-Sekunden existiert — nicht pauschal „neue Datenquelle“, sondern **fehlende sekundengenaue Positions- oder Speed-Zeilen in den annotierten Fenstern**.
