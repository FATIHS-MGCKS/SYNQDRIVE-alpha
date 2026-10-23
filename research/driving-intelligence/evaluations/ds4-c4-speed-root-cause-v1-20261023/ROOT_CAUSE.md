# ROOT_CAUSE — C4-Geschwindigkeitsfehler V1

**Scope:** Research-only. Produktionscode `579ee8b2` (DI-Verzeichnis byte-identisch im Replay).  
**Kein Fix, keine Schwellenänderung, keine Produktionsmutation.**

Spuren: [`outputs/TES16_TRACE.csv`](outputs/TES16_TRACE.csv), [`outputs/TIG22_TRACE.csv`](outputs/TIG22_TRACE.csv).

---

## Fall A — TES16 (Trip `358d0158-b2a9-47ed-af26-33926c5770b4`)

### Kontext

- **Zeitfenster:** 2026-10-16 03:50:12–03:50:26 UTC; kritisch **03:50:20–03:50:24**.
- **Video-Referenz:** 132–134 km/h (nahezu konstant).
- **Ereignis:** `ACCELERATION 03:50:20–03:50:23` (C4 113,1→148,3 km/h) — unter Event-Eval v2 **`FEHLALARM`**, nicht Video-Manöver.

### Root Cause (belastbar)

**Primär: H3 + H4 — C1-Fallback (`robustPathSlopeC1`) überbrückt die `ROW_ABSENT`-Sekunde 03:50:21 und mischt 1-Hz-Stützpunkte mit effektiv 2-s-Chord-Geometrie, während L3 wegen fehlendem t+1 (und Jitter-Leg-Signaturen) nicht direkt genutzt wird.**

Kette pro Sekunde (Auszug):

| UTC | Video | Verfügbarkeit | L3 | C4 | Pfad | C1-Support (Auszug) |
| --- | --- | --- | --- | --- | --- | --- |
| 03:50:19 | 134 | PRESENT | 129,4 OK | 129,4 | L3_DIRECT | t−1,t,t+1 |
| 03:50:20 | 133 | PRESENT | **ineligible** (`ROW_ABSENT` abstention) | **113,1** | C1_SPARSE_FALLBACK | :18,:19,:20,**:22** (Lücke :21) |
| 03:50:21 | 133 | **ROW_ABSENT** | — | null | — | — |
| 03:50:22 | 132 | PRESENT | ineligible | **128,2** | C1 + JITTER | :20,**:22**,:23,:24 |
| 03:50:23 | 132 | PRESENT | **191,4 eligible** | **148,3** | C1_TIMING_JITTER_FALLBACK | :22,:23,:24,:25 |
| 03:50:24 | 131 | PRESENT | 126,5 | 126,5 | L3_DIRECT | normal |

**Belege:**

- Fixture `TESLA_POSITION_GRID.json`: `:21` `availability=ROW_ABSENT`, `providerRowCount=0`.
- `:20` pinned L3 `null` / `abstentionReason=ROW_ABSENT` trotz `PRESENT` Position — L3 benötigt drei aufeinanderfolgende Sekunden.
- `:22` **leg_next_m=71,1** bei **dt_next_s=2** (weil :21 fehlt) → Chord ~128 km/h; Jitter-Leg-Out=1.
- C4-Flags: `L3_SUPPORT_MISSING_FALLBACK_ROBUST`, `TIMING_JITTER_SUSPECT_IN_WINDOW`.

**H1** (Geometrie): CONFIRMED als **Mechanismus** (2-s-Chord durch fehlende Sekunde), nicht als einzelner GPS-Ausreißer.  
**H2** (ms-Zeit): REFUTED im Fixture (nur Bucket-Zeit).  
**H6** (Detektor): CONFIRMED downstream only.

### Counterfactual (offline)

`cf_c1_no_gap_bridge` (nur konsekutive C1-Paare):

| Sekunde | Prod C4 | CF C1 | Video |
| --- | --- | --- | --- |
| :20 | 113,1 | **129,4** | ~133 |
| :22 | 128,2 | 191,5 | ~132 |
| :23 | 148,3 | 148,4 | ~132 |

→ **Teilbestätigung:** Lücken-Brücken erklären den Dip bei :20; ein naives „kein Brücken-C1“ reicht **nicht** (verschlechtert :22). Ursache ist **kombiniert** Lücke + Jitter-Diagnostik + C4-Pfadwahl.

---

## Fall B — TIG22 (Trip `98d2a8e0-8b7d-4529-bf76-acee44d61fbe`)

### Kontext

- **Zeitfenster:** 2026-10-22 19:04:20–19:04:55 UTC (Video endet **19:03:02** — keine Video-GT).
- **Kritische Ereignisse (C4):**
  - `ACCELERATION 19:04:34–38`: 5,5 → **100,1** km/h
  - `ACCELERATION 19:04:49–52`: 52,3 → **142,1** km/h
- **OBD** (Vergleich only): z. B. :38 **50** km/h, :52 **60** km/h.

### Root Cause (belastbar mit Verdacht anteil)

**Primär: H3 + H4 + H5 — unregelmäßiges 1-Hz-Positionsgitter (`ROW_ABSENT` / `NO_POSITION` Sekunden), C1-Fallback-Fenster mit `MIN_SUPPORT_3_POINTS` über Lücken, plus `OUTLIER_REJECTED` bei 19:04:37, sodass L3-Direktpfad blockiert bleibt und C4 auf robuste Pfad-Slope mit übergroßen effektiven Δt fällt. OBD zeigt ~2× niedrigere Geschwindigkeiten — konsistent mit überhöhter chord-basierter C4, ohne OBD als Ursache zu verwenden.**

Auszug kritische Sekunden:

| UTC | Pos | L3 | C4 | Pfad | OBD | Anmerkung |
| --- | --- | --- | --- | --- | --- | --- |
| 19:04:34 | PRESENT | ineligible | 5,5 | C1_SPARSE | 0 | Support :32–:34–:36 (Lücke :35) |
| 19:04:35 | **ROW_ABSENT** | — | null | — | — | Gitterlücke |
| 19:04:36 | PRESENT | ineligible | 54,1 | C1 | 7 | Sprung vorbereitet |
| 19:04:37 | PRESENT | 101,2 elig. | **null** | **OUTLIER_REJECTED** | 27 | Chord 100,8 km/h, Deviation 10,9 m |
| 19:04:38 | PRESENT | **119,9** elig. | **100,1** | C1_SPARSE | **50** | L3 vorhanden, C4 nutzt C1 (Lücken/Jitter) |
| 19:04:49 | PRESENT | ineligible | 52,3 | C1 | 36 | |
| 19:04:50 | **ROW_ABSENT** | — | null | — | — | |
| 19:04:51 | PRESENT | ineligible | 103,0 | JITTER C1 | 38 | |
| 19:04:52 | PRESENT | 142,1 | **142,1** | C1_TIMING | **60** | L3=C4, beide >> OBD |

**Bestätigt:** fehlende Sekunden, C1 über nicht-benachbarte Labels, Jitter-Flags, Outlier an :37.  
**Verdacht (nicht Video-belegt):** absolute Fahrdynamik der beiden Beschleunigungsereignisse; §8-Plausibilität nur Vorsortierung.

### Counterfactual

| Sekunde | Prod C4 | CF C1 (no gap bridge) | OBD |
| --- | --- | --- | --- |
| :38 | 100,1 | 98,1 | 50 |
| :52 | 142,1 | 142,0 | 60 |

→ CF ändert :38 kaum, :52 gar nicht — **Ursache ist nicht nur einfaches C1-Brücken-Artefakt**, sondern **L3-Blockade + akzeptierte chord-basierte L3/C1-Geometrie** auf sparsem Ruptela-Gitter.

---

## Zusammenfassung

| Fall | ROOT_CAUSE (ein Satz) |
| --- | --- |
| **TES16** | `ROW_ABSENT` in :21 bricht L3; C4 fällt auf C1 zurück, das Stützpunkte über die Lücke verbindet und mit Jitter-Diagnostik ein künstliches Beschleunigungsfenster erzeugt, obwohl Video ~133 km/h zeigt. |
| **TIG22** | Sparse GPS grid + Outlier :37 erzwingen C1/JITTER-Fallback; chord-basierte Geschwindigkeiten liegen systematisch über OBD-Vergleich (~2×), ohne dass Video die Manöver verifizieren kann. |

Siehe auch [`HYPOTHESES.md`](HYPOTHESES.md), [`REPRO.md`](REPRO.md).
