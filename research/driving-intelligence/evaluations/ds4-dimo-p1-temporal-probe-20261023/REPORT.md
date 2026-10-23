# P1 — DIMO Temporal Evidence Probe

**Modus:** read-only Forschung. Keine Produktionscode-, Scheduler-, Flag- oder Deploy-Änderungen.  
**Produktions-SHA (DI-Referenz):** `579ee8b2fed06593d7d2aa57cffb6036dbf53a24`  
**Live-Probe:** `2026-10-23T14:28:01Z` — 4 GraphQL-Requests (2 Fahrzeuge × `1s` + `250ms`), Vehicle-JWT via bestehende DIMO-Auth-Pattern (Audit-Skripte).

---

## Phase A — Provider- und Schema-Preflight

### A1 Produktionsabfrage (Repository)

| Artefakt | Befund |
| --- | --- |
| `DI_V0_POSITION_QUERY_SPEC_V0_1` | `signals(interval:"1s")`, `currentLocationCoordinates(agg: AVG)`, Feld `timestamp` = Bucket-Label |
| `buildDiV0HistoricalPositionQuery` | selektiert nur `latitude longitude` — **kein** `hdop`, **kein** FIRST/LAST |
| `di-v0-position-normalizer.ts` | `parseProviderLabel` verwirft **Sub-Sekunden-Labels** (`LABEL_NOT_SECOND_ALIGNED`) — 250ms-Antworten sind im DI-V0-1s-Raster **nicht** ingestierbar ohne Spec-Änderung |
| `motion-core-grid.ts` | `referenceTime = bucketLabel + 0,5 s` — synthetisch, nicht Provider-Messzeit |

**DIMO_1S_AVG_CONFIRMED=YES** — Code, versiegelte Snapshots (`POSITION_CHANNEL_SNAPSHOT_V0_1.txt`, `di_v0_s4_evidence_container.bin`) und Live-Replay stimmen überein.

### A2 API-Schema (Dokumentation + Live)

| Fähigkeit | Status | Beleg |
| --- | --- | --- |
| `currentLocationCoordinates(agg: AVG\|FIRST\|LAST)` | **unterstützt** (GraphQL) | [DIMO Vehicle Signals](https://www.dimo.org/docs/api-references/telemetry-api/signals); Live-Query mit drei Aliasen erfolgreich |
| `hdop` im Location-Block | **unterstützt** | Live: Ruptela liefert 0,7–0,9; Tesla OEM liefert `0` in diesem Fenster |
| `interval: "250ms"` | **Query akzeptiert** | Live ohne GraphQL-Fehler |
| Separates Geräte-Messzeitfeld | **nicht in Antwort** | Nur `timestamp` (= Aggregations-Bucket-Label, ggf. mit `.75` bei 250ms) |

**FIRST_LAST_SUPPORTED=YES** (API), aber in den **probierten Fenstern** überall `AVG ≡ FIRST ≡ LAST` (`bucketsWhereFirstNeLast = 0`) → **höchstens ein effektives Sample pro Bucket**, keine intra-Bucket-Phasenauflösung.

**250MS_QUERY_SUPPORTED=YES**

**ORIGINAL_MEASUREMENT_TIMESTAMPS_AVAILABLE=NO** — weder im Repository-Pfad noch in der Live-Antwort; nur Bucket-`timestamp`.

### A3 Bereits vorhandene Snapshots

| Quelle | Inhalt | Sub-Sekunden / Rohzeit? |
| --- | --- | --- |
| `TESLA_POSITION_GRID.json` | 1 Hz AVG-Raster, `providerRowCount`, `temporalConfidence=BUCKET_BOUNDED` | **NEIN** |
| `POSITION_CHANNEL_SNAPSHOT_V0_1.txt` | identisches Query-Tag `DIMO_SIGNALS_HISTORICAL_LOCATION_1S_AVG_V0_1` | **NEIN** |
| `di_v0_s4_evidence_container.bin` (TIG22) | gleiches 1s-AVG-Raster, `RUPTELA_R1` | **NEIN** |

Feinere Daten **existieren nicht** in versiegelten Inputs; Live-Probe war erforderlich.

---

## Phase B — Begrenzte Fenster (Live)

| Fall | tokenId | Fenster (UTC) | Requests |
| --- | --- | --- | --- |
| TES16 | 186946 | 03:50:17–03:50:27 | `1s` + `250ms` |
| TIG22 | 192922 | 19:04:30–19:04:56 | `1s` + `250ms` |

Auth: Developer-JWT + Vehicle-JWT **OK** für beide Fahrzeuge. Keine Tokens in Repo-Artefakten.

---

## Phase C — Zeit- und Geometrievergleich

### TES16 — 71,1 m bei :23

| Bucket (1s) | Δt zum Vorgänger | Leg (AVG) | Chord-Speed | Fixture |
| --- | --- | --- | --- | --- |
| :20 | 1 s | 35,9 m | 129,2 km/h | PRESENT, count=1 |
| **:21** | — | **kein DIMO-Bucket** | — | ROW_ABSENT |
| :22 | **2 s** | 35,8 m | 64,5 km/h | PRESENT |
| :23 | 1 s | **71,1 m** | **256 km/h** | PRESENT |
| :24 | 1 s | 35,3 m | 126,9 km/h | PRESENT |

Live-Distanzen = Fixture/Trace-CSV (bitgenau auf 0,1 m). Die 71,1 m liegen **zwischen :22 und :23 bei 1 s Label-Abstand**, nicht zwischen :20 und :22 (dort 35,8 m / 2 s).

**250ms:** 9 Zeilen in 10 s Fenster (~1 effektives Hz, Labels `*.75Z`), **kein** Bucket bei :21, gleiches Muster (2-s-Sprung dann 71,1 m / 1 s). **Keine zusätzlichen Zwischenpunkte**, die die 71-m-Leg auflösen würden.

**TES16_TIME_SHIFT_EVIDENCE=GEOMETRIC_CONSISTENT_NOT_PROVEN** — Das Muster (fehlende Sekunde, halbe Distanz über 2 s, doppelte Distanz über 1 s, Spur gerade) ist **konsistent** mit „Punkt :22 trägt Position von ~:21“, aber DIMO liefert **keinen** unabhängigen Messzeitstempel, der das beweist. FIRST/LAST/250ms **ändern** die Leg-Zuordnung nicht.

### TIG22 — :37 Quarantäne und T1/T2

Kritische 1s-Legs (Live AVG, HDOP ≈ 0,7–0,9):

| Bucket | Δt | Leg m | Chord km/h | Anmerkung |
| --- | --- | --- | --- | --- |
| :34→:36 | 2 | 4,1 | 7,4 | Lücke :35 |
| :36→:37 | 1 | 17,6 | 63,3 | |
| :37→:38 | 1 | 38,6 | 139,1 | `OUTLIER_REJECTED` im C4-Pfad (Längsasymmetrie) |
| :38→:39 | 1 | 28,0 | 100,8 | |
| :49→:51 | 2 | 22,5 | 40,4 | Lücke :50 |
| :51→:52 | 1 | 47,0 | 169,4 | analog TES16-Doppel-Leg |
| :52→:53 | 1 | 31,9 | 114,8 | |

**250ms:** 21 Zeilen in 26 s (~1 Hz effektiv), **dieselben** 2-s-Label-Lücken wie 1s — **keine** Verdichtung auf 4 Hz.

| Hypothese | Bewertung |
| --- | --- |
| **T1 Zeitkompression (1 Label ≈ 2 s real)** | **NICHT gestützt** durch 250ms-Dichte; es gibt nicht doppelt so viele Buckets. Leg-Muster bleibt „fehlende Sekunde + Doppel-Leg“. |
| **T2 OBD zeitverschoben / GPS ~100 km/h wahr** | **OFFEN** — OBD in P1 **nicht** abgefragt (nur diagnostisch). Live-GPS-Chords :38–:39 ~139/101 km/h **bestätigen** hohe DIMO-Werte; ohne Video nach 19:03:02 keine unabhängige Wahrheit. |

**TIG22_T1_VS_T2=T1_REFUTED_IN_PROBE_WINDOW; T2_UNRESOLVED_NO_INDEPENDENT_GT**

### GPS_GEOMETRY_FINDINGS

- Fehlende **1-s-Buckets** sind in **DIMO-Telemetrie** sichtbar (nicht nur SynqDrive-Densify).
- „Spike-Legs“ (71,1 m / 47,0 m) sind **in Roh-Aggregaten reproduzierbar**, nicht C4-Artefakte.
- FIRST/LAST liefern in diesen Fenstern **keine** zusätzliche Zeitinformation.
- 250ms-Query liefert **sparse** Historie (~1 Punkt/s), keine Rohsample-Kette.
- HDOP für Ruptela nutzbar, wenn Query erweitert wird; Tesla-Fenster `hdop=0`.

---

## PTQ_DESIGN_IMPLICATIONS

1. **PTQ auf dem 1s-Bucket-Raster bleibt sinnvoll** — die Fehler sind in DIMO-Daten sichtbar; Algorithmus muss fehlende Sekunden + Doppel-Legs behandeln, nicht nur Replay-Artefakte.
2. **FIRST/LAST allein reichen nicht** (single-sample buckets); Erwerb sollte **nicht** darauf basieren, bis Multi-Sample-Buckets beobachtet sind.
3. **250ms-Historie** löst TES16/TIG22 **nicht** auf; optional für andere Fahrten testen, aber kein Gate für PTQ v0.
4. **Nächster Datenhebel:** `hdop` in Acquisition; ggf. Segments/Events-API (nicht in diesem Probe) — **kein** PTQ-Code in diesem PR.

---

## UNRESOLVED

- Mechanismus der fehlenden `:21` / `:35` / `:50` Buckets (Ingest vs. Fahrzeug vs. DIMO-Aggregation).
- TIG22 absolute Geschwindigkeit 19:04 ohne Video-GT.
- Ob andere Intervalle (`100ms`) oder `signals` mit `filter: { source: ruptela }` mehr Dichte liefern — **nicht** abgefragt (Request-Budget).

---

## NEXT_RECOMMENDATION

1. **Offline `C5_PTQ_V0`** wie Fable-Versuch (kein DIMO-Schema-Blocker).
2. **Acquisition-Erweiterung (separater PR):** `hdop` + optional FIRST/LAST **nur** wenn `providerRowCount>1` im Fenster — nach erneuter Probe.
3. **Kein** Wechsel auf 250ms-Raster ohne Nachweis ausreichender historischer Dichte pro Fahrt.

Siehe `REPRO.md`, `outputs/p1_probe_summary.json`.
