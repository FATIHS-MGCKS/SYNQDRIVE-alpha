# Tiguan EXP021 — Failure Forensics R1

**Mode:** read-only research · **Algorithm pin:** `9f0693bef572a065e45f5dad91ef236ba4f2ccd9` · **Production mutations:** NONE

## Phase 1 — Zeitreferenz

{
  "providerMeasurementTimestampsInExport": "NOT_PRESENT_ONLY_BUCKET_LABEL_UTC",
  "providerSignalsNull": false,
  "rejectedProviderRows": 0,
  "bucketTemporalConfidence": "BUCKET_BOUNDED_WHEN_PRESENT",
  "tripWindowUtc": {
    "from": "2026-10-19T10:15:00Z",
    "to": "2026-10-19T10:39:40Z"
  },
  "videoWindowUtc": {
    "from": "2026-10-19T10:29:19Z",
    "to": "2026-10-19T10:38:24Z"
  },
  "overlayAnchorCount": 56,
  "overlayVsDimoDistanceM": {
    "min": 1.2187561949510217,
    "median": 7.936959965760042,
    "max": 42.32357224354249
  },
  "supportedOffsetSeconds": 0,
  "offsetUncertaintySeconds": "PLUS_MINUS_1_UNCALIBRATED_DISPLAY_GRID",
  "note": "Do not confuse bucketLabelUtc (grid assignment) with unavailable per-row provider measurement timestamps in frozen snapshot."
}

**UTC_SYNC_VERDICT:** Bucket-Label = Geräte-UTC-Kandidat mit **0 s** Offset; Unsicherheit mindestens **±1 s** (Anzeigeraster). Provider-Messzeitstempel je Zeile in der eingefrorenen Nutzlast **nicht verfügbar** (`providerSignalsNull=false`, rejected rows=0).

## Phase 2 — Cluster

### C01 Hebbel / Schwab
- Decoder wählt durchgehend **Hebbelstraße (25932713)** wenn Way-ID gesetzt.
- Schwab-Ways (**25699754**, **25932717**) liegen **außerhalb 50 m** zum DIMO-Punkt — kein Schwab-Kandidat in `nearestWayCandidates`.
- **C01_ROOT_CAUSE:** Kein Decoder-Fehler; Risiko ist **Navi-Label** (Nachbarstraße), nicht falsche OSM-Way-Hypothese.

### E002 B-3-Unterführung
- GPS **PRESENT**; typisch **ein** Kandidat (**5048137**, <2 m).
- Baseline: **BEARING_MISMATCH ~178°** → Emissionskosten ~230 vs **NULL-Zustand 100**.
- Viterbi A–E: **UNKNOWN**, `osmWayId=null`.
- **E002_ROOT_CAUSE:** **Emissionsmodell (Heading)** + NULL-State-Wettbewerb, nicht fehlendes GPS/OSM-Segment.

### 13 Decoder-Diff-Buckets
- **10×** B-3-Standphase: **E ≠ A** (382929735 vs 401665362) — Route-Aware directed transition.
- **3×** nach Aufnahmelücke: **B/D ≠ A/C/E** (737508499 vs 737508498) — Backtrack-Traceback.

## Phase 3 — Traces
Siehe `TIGUAN_13_BUCKET_DECISION_TRACES.csv`, `TIGUAN_C01_HEBBEL_SCHWAB_AUDIT.csv`, `TIGUAN_E002_B3_UNDERPASS_AUDIT.csv`.

## Phase 5 — Metriken
Recomputed in `TIGUAN_A_E_METRICS.csv`. **E** reduziert Way-Konflikte vs **A** hauptsächlich durch **Abstention (UNKNOWN)**, nicht durch nachgewiesene Korrektur aller A-Konflikte (`E_vs_A` Zeile).

## FINAL

| Field | Value |
|-------|-------|
| UTC_SYNC_VERDICT | ZERO_OFFSET_BUCKET_LABEL_UNCERTAINTY_PM1S |
| C01_ROOT_CAUSE | NOT_DECODER_ERROR_GPS_SUPPORTS_HEBBEL_WAY |
| E002_ROOT_CAUSE | HEADING_EMISSION_MISMATCH_NULL_DP_WINS |
| DIFF_BUCKETS_ANALYZED | 13 |
| ROUTE_AWARE_GAIN_PROVEN | NO_ABSTENTION_NOT_CORRECTION |
| NEXT_MINIMAL_FIX | E002: bearing gating; DIFF: parallel-way DP audit; UTC: export provider row timestamps |
| FINAL_VERDICT | Failures dominated by emission/heading and route-aware DP — not missing Hebbel/Schwab geometry in C01 |

