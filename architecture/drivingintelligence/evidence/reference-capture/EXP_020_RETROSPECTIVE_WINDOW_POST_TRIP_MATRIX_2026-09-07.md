# EXP-020 — HF Retrospective Window Geometry + Post-Trip Reconstruction Matrix

**Date:** 2026-09-07  
**Session:** `2508b697-f101-4155-a0d3-8436e46bb779`  
**Calibration series:** `4d79843d-27b1-4bdb-9a2e-b6584545bbf9`  
**Vehicle:** KS MX 2024 · token `187336`  
**Export script:** `exp-020-retrospective-window-matrix.cjs`  
**VPS artifacts:** `/tmp/exp-020/`

> READ-ONLY forensic experiment on the **completed** EXP-019 drive. No runtime code, production HF policy, or detector/score model changes.

---

## A. Epistemic split (mandatory)

| Class | Question | Testable now? |
|-------|----------|---------------|
| **A1 — SETTLED RETRIEVAL GEOMETRY** | Given fully settled data, does changing request window geometry change bucket identities / coverage? | **YES** — tested in EXP-020 |
| **A2 — SETTLEMENT-TIMING COUNTERFACTUAL** | Would larger windows have returned those buckets at +60s/+120s during the drive? | **PARTIAL only** — preserved provenance supports first-observation-age distribution; not full replay |

```
SETTLED_WINDOW_GEOMETRY_TESTABLE_NOW = YES
HISTORICAL_AS_OF_SETTLEMENT_COUNTERFACTUAL_AVAILABLE = PARTIAL
```

**Do not collapse A1 and A2.** Settled queries executed today do **not** recreate what DIMO would have returned at T+60 during the live drive.

---

## B. Source drive (canonical bounds)

| Field | UTC |
|-------|-----|
| Session start (10s phase) | `2026-09-07T04:31:36.025Z` |
| Session completed | `2026-09-07T05:00:20.016Z` |
| VehicleTrip (production post-trip window) | `2026-09-07T04:35:00.000Z` → `2026-09-07T04:57:29.000Z` |

Phase boundaries: `EXP_019_VIDEO_GT_ALIGNMENT_WINDOWS_2026-09-07.md` / `/tmp/exp-019-video-alignment/phase-boundaries.json`

---

## C. DIMO HF query implementation audit

### Production post-trip (`fetchHighFrequency`)

| Property | Value |
|----------|-------|
| GraphQL | `signals(tokenId, from, to, interval: "1s")` |
| Aggregation | `AVG` per field |
| Window | **Single request: whole trip** `startTime` → `endTime` |
| Chunking / overlap | **NONE** |
| Settlement delay | **NONE** (implicit query-at-enrichment-time) |
| Pagination | **NONE** in client |
| Client max duration | **NONE** coded |

### Reference Capture live (EXP-019)

| Property | Value |
|----------|-------|
| Window builder | `buildHfQueryWindow` (HF Recovery V2) |
| `queryTo` | `requestStartedAt - 8000ms` settlement delay |
| Overlap | `6000ms` recovery overlap |
| Typical geometry | **Small incremental windows** from watermark (often seconds, not poll interval) |

```
HF_QUERY_PAGINATION_PRESENT = NO
HF_QUERY_RESULT_CAP_PRESENT = UNKNOWN
HF_QUERY_WINDOW_MAX_DURATION = NONE (client-side)
HF_QUERY_WINDOW_SIZE_ALTERS_AGGREGATION = NO
```

Larger windows may still hit provider timeouts or implicit response limits — not observed as truncation in this session.

---

## D. Canonical settled reference

**`EXP020_SETTLED_REFERENCE_UNION`** = conservative union of:

1. TRUE T+30 `observations.jsonl` (speed buckets)
2. Settled **FULL_TRIP** query (`04:35:00` → `04:57:29`)
3. Settled **FULL_SESSION** query (`04:31:36` → `05:00:20`)

| Field | Value |
|-------|-------|
| `REFERENCE_AUTHORITY` | `EXP020_SETTLED_REFERENCE_UNION` |
| `REFERENCE_UNIQUE_BUCKET_COUNT` | **446** |
| `REFERENCE_TEMPORAL_START_COUNT` | **446** |
| Observation speed buckets | 165 |
| New from full-trip query | 140 |
| New from full-session query | 141 |

**Not claimed physically complete** — provider-observable settled union. Reference is **larger** than any single query strategy, proving incremental live capture did not exhaust settled provider buckets.

---

## E–G. Query-window matrix (session bounds, speed, interval `1s`)

### TABLE 1 — STRATEGY SUMMARY

| STRATEGY | REQUESTS | UNIQUE BUCKETS | COMPLETENESS vs REF | MAX GAP |
|----------|----------|----------------|---------------------|---------|
| W060 | 29 | 141 | 0.316 | 169.0s |
| W120 | 15 | 141 | 0.316 | 169.0s |
| W180 | 10 | 141 | 0.316 | 169.0s |
| W240 | 8 | 141 | 0.316 | 169.0s |
| W300 | 6 | 141 | 0.316 | 169.0s |
| FULL_TRIP | 1 | 140 | 0.314 | — |
| FULL_SESSION | 1 | 141 | — | — |
| FULL_PHASE_10s | 1 | 24 | 0.054 | 23.0s |
| FULL_PHASE_20s | 1 | 33 | — | 169.0s |
| FULL_PHASE_30s | 1 | 26 | — | 118.0s |
| FULL_PHASE_60s | 1 | 58 | — | 147.0s |

**Key finding:** Non-overlapping W060–W300 produce **identical** union (141 buckets). **Larger per-request window does not increase settled coverage** when tiling the same session span.

### TABLE 2 — GAP FRACTIONS (non-overlap union, session)

| STRATEGY | ≥10s gap % | ≥20s gap % | ≥60s gap % |
|----------|------------|------------|------------|
| W060–W300 (identical) | ~same | ~same | ~same |
| FULL_TRIP | material | material | material |

Overlap strategies (W060+30s, W120+60s, … Q120_L300): all **141 buckets**, completeness **0.316** — overlap adds duplicate burden without new unique buckets in settled state.

---

## H. Critical gap expansion test

Interior bucket count (speed, strict gap interior — excludes boundaries):

### TABLE 3 — GT WINDOW INTERIOR BUCKETS

| GT WINDOW | EXACT_GAP | +30s | +60s | +120s | +300s | FULL_PHASE |
|-----------|-----------|------|------|-------|-------|------------|
| GT-10-P0 | 0 | 0 | 0 | 0 | 0 | **1** |
| GT-20-P0 | 0 | 0 | 0 | 0 | 0 | **1** |
| GT-30-P0 | 0 | 0 | 0 | 0 | 0 | **0** |
| GT-30-P1 | 0 | 0 | 0 | 0 | **1** | **2** |
| GT-60-P0 | 0 | 0 | 0 | 0 | 0 | **1** |

```
NEW_INTERIOR_BUCKETS_FROM_WINDOW_EXPANSION (gap ±300s vs exact): 0–1
```

**Interpretation:**

- **Narrow / padded gap queries alone** do not recover interior buckets.
- **FULL_PHASE settled query** recovers **0–2 sparse** interior speed buckets per gap — not video-confirmed trajectory reconstruction.
- EXP-019 live incremental capture had **0 interior** samples at T+30 settlement; settled full-phase/trip queries add **marginal** buckets — consistent with **settlement delay + geometry**, not sole provider void.

### Video-GT relevance

| Field | Assessment |
|-------|------------|
| `GT_*_INTERIOR_RECOVERED` (sparse buckets exist) | Technically **YES** (1–2 buckets) |
| Video-dynamic trajectory recovered | **NO** — remains major dynamic loss vs EXP-019 video GT |
| Material HF fidelity restoration | **NO** |

---

## I. Post-trip strategies (trip bounds)

| ID | Description | Requests | Unique buckets | Completeness | req/30min trip |
|----|-------------|----------|----------------|--------------|----------------|
| **P1** | Whole trip single query | **1** | 140 | **0.314** | **1.0** |
| P2 | 5min chunks, no overlap | 5 | 140 | 0.314 | 5.2 |
| P3 | 5min + 60s overlap | 6 | 140 | 0.314 | 6.3 |
| P4 | 3min + 60s overlap | 11 | 140 | 0.314 | 10.4 |
| P5 | 2min + 60s overlap | 22 | 140 | 0.314 | 20.9 |

```
BEST_POST_TRIP_STRATEGY = P1
BEST_POST_TRIP_COMPLETENESS = 0.314
BEST_POST_TRIP_REQUEST_COUNT = 1
```

Chunked strategies add requests **without** increasing unique bucket union vs P1 on this drive.

---

## J. Delayed rolling simulation (settled geometry only)

| ID | Pattern | req/30min (est.) | REAL_TIME_AVAILABILITY_PROVEN |
|----|---------|------------------|-------------------------------|
| R1 | every 60s → last 120s | ~56 | **NO** |
| R2 | every 120s → last 180s | ~27 | **NO** |
| R3 | every 120s → last 300s | ~12 | **NO** |
| R4 | every 180s → last 300s | ~8 | **NO** |
| R5 | every 300s → last 300s | ~6 | **NO** |

```
SETTLED_RETRIEVAL_COMPLETENESS = capped at ~141/446 for rolling patterns tested
REAL_TIME_AVAILABILITY_PROVEN = NO
```

---

## K. Bucket first-observation age (preserved EXP-019 provenance)

From `observations.jsonl` + `provenance-ring.json` (65 request records):

| Percentile | Age (ms) | Age (s) |
|------------|----------|---------|
| P50 | 27,412 | **~27s** |
| P75 | 40,536 | ~41s |
| P90 | 56,598 | **~57s** |
| P95 | 64,536 | ~65s |
| P99 | 76,707 | ~77s |
| max | 77,517 | ~78s |

```
BUCKET_FIRST_OBSERVATION_AGE_DISTRIBUTION_AVAILABLE = YES
```

**Implication:** EXP-019 live queries with **8s settlement delay** systematically queried before buckets were first observable (median ~27s lag). This is strong evidence for **settlement-timing** effects separate from window size.

---

## L. Settlement delay validation

```
SETTLEMENT_DELAY_60S_VALIDATED = NO
SETTLEMENT_DELAY_120S_VALIDATED = NO
SETTLEMENT_DELAY_180S_VALIDATED = NO
SETTLEMENT_DELAY_300S_VALIDATED = NO
```

Cannot infer “querying after 2 minutes would have returned everything during the drive” from settled geometry alone. **EXP-021 shadow settlement test required.**

---

## M. Production comparison

| Field | Value |
|-------|-------|
| `CURRENT_PROD_POST_TRIP_QUERY_STRATEGY` | `SINGLE_WHOLE_TRIP_1S` |
| `CURRENT_PROD_QUERY_WINDOW_GEOMETRY` | One request `[trip.startTime, trip.endTime]` |
| `CURRENT_PROD_POST_TRIP_SETTLEMENT_DELAY` | Implicit at enrichment time (no explicit delay param) |

Production post-trip already uses **maximal window geometry** (whole trip). EXP-020 shows live block-polling used **minimal incremental windows** — the architectural contrast is live geometry + settlement delay vs post-trip whole-trip.

---

## N. Request-cost model (arithmetic, 30min trip extrapolation)

| Strategy | req/30min trip | req × 100 vehicles | req × 1000 vehicles |
|----------|----------------|--------------------|---------------------|
| FULL_TRIP (P1) | **1.0** | 104 | 1,044 |
| W300 | 6.3 | 6,265 | 62,646 |
| W060 | 30.3 | 30,279 | 302,787 |
| live 10s (EXP-019) | ~27/session | ~2,700 | ~27,000 |

---

## O. TABLE 4 — Architecture comparison (evidence-only)

| ARCHITECTURE | REQUEST LOAD | FINAL QUALITY (settled) | LATENCY PROVEN? |
|--------------|--------------|-------------------------|-----------------|
| live 10s polling | HIGH | ~141 buckets / incomplete vs union | NO |
| live 20/30/60s | MEDIUM–LOW | same union ceiling | NO |
| delayed rolling 2m/5m | MEDIUM | same ~141 ceiling | NO |
| **post-trip whole-trip (P1)** | **LOWEST** | **~140 buckets** | N/A (post-trip) |
| post-trip 2–5min chunks | LOW–MEDIUM | same as P1 | N/A |
| multi-authority + post-trip | TBD | EXP-019 gap GT still sparse | NO |

---

## P. Hypothesis classification

| ID | Hypothesis | Result |
|----|------------|--------|
| **H1** | Larger query windows improve settled bucket recovery | **NOT_SUPPORTED** (non-overlap W060–W300 identical union) |
| **H2** | Overlap improves final unique coverage | **NOT_SUPPORTED** (overlap adds duplicates, not new buckets) |
| **H3** | Post-trip reconstruction ≥ fidelity with fewer requests than live polling | **SUPPORTED** (P1: 1 req ≈ same union as 29× W060; vs ~27 live reqs) |
| **H4** | EXP-019 large gaps caused **primarily** by too-small query windows | **CONTRADICTED** as sole cause — settlement delay (~27s P50 first-obs) is co-factor |
| **H5** | Gaps remain provider sparsity even with large settled windows | **SUPPORTED** at video-GT fidelity (0–2 interior buckets in 22–168s gaps) |

---

## Q. Architecture directions (evidence-only)

| Option | EVIDENCE_SUPPORT | NOTES |
|--------|------------------|-------|
| A. Aggressive live HF polling | **LOW** | High request load; same settled union ceiling |
| B. Slower overlapping delayed rolling HF | **MIXED** | Overlap did not add buckets; settlement delay unproven live |
| C. Post-trip HF reconstruction | **HIGH** | Matches production path; best request efficiency |
| D. Post-trip + targeted gap recovery | **PROMISING** | Full-phase context adds sparse interior buckets |
| E. Multi-authority live + post-trip finalization | **PROMISING** | Aligns with EXP-019 bias-control findings |

```
BEST_ARCHITECTURE_DIRECTION_FROM_CURRENT_EVIDENCE = POST_TRIP_RECONSTRUCTION_PLUS_MULTI_AUTHORITY
CONFIDENCE = MEDIUM
```

---

## R. EXP-021 — Shadow settlement test (future)

If settled geometry is promising but live timing unproven, **EXP-021** should query the same closed intervals at +30s, +60s, +120s, +180s, +300s, +600s **during a new drive** (shadow, read-only).

```
EXP021_SHADOW_SETTLEMENT_TEST_REQUIRED = YES
COUNTERBALANCED_60_30_20_10_DRIVE_STILL_REQUIRED = YES
```

---

## Cross-links

| Artifact | Path |
|----------|------|
| EXP-019 bias-control | `EXP_019_BIAS_CONTROL_AND_DECISION_READINESS_2026-09-07.md` |
| EXP-019 video GT | `EXP_019_VIDEO_GT_EVENT_REGISTER_2026-09-07.md` |
| VPS JSON | `/tmp/exp-020/final-comparison.json` |

### VPS machine-readable

| File | Path |
|------|------|
| Query matrix | `query-matrix.json` |
| Gap expansion | `gap-expansion.json` |
| Post-trip | `post-trip-strategies.json` |
| Rolling | `rolling-strategies.json` |
| First-observation age | `first-observation-age.json` |
| Request cost | `request-cost-model.json` |
| Final comparison | `final-comparison.json` |

---

## Three-variable separation (conclusion)

| Variable | EXP-020 finding |
|----------|-----------------|
| **1. Poll cadence** | Not tested here (EXP-019) — window union ceiling independent of W060–W300 |
| **2. Query window size** | **Does not change settled union** when tiling session (H1 NOT_SUPPORTED) |
| **3. Settlement delay / query age** | **Strong co-factor** — P50 first-observation age ~27s vs 8s live delay; EXP-021 needed |

Production LEGACY post-trip already uses maximal window (whole trip). The live calibration problem is **not** fixable by larger windows alone — settlement timing and provider sparsity dominate.
