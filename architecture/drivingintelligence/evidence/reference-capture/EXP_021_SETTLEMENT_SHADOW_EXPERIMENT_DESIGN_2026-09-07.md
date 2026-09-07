# EXP-021 — Settlement Age Shadow Experiment Design + Preflight Audit

**Date:** 2026-09-07  
**Status:** DESIGN + PREFLIGHT AUDIT — **no physical drive started**  
**Vehicle (planned):** KS MX 2024 · token `187336`  
**Prior drives:** EXP-019 (10→20→30→60 ascending), EXP-020 (settled geometry matrix)

> Settlement timing is the primary unresolved variable after EXP-020. This document designs the **next** physical drive and audits implementation readiness. **No production behavior changes.**

---

## Executive summary

EXP-021 runs **two analytically independent channels** on one Reference Capture session:

| Channel | Purpose |
|---------|---------|
| **CHANNEL 1 — CADENCE_CALIBRATION** | Counterbalanced **60→30→20→10** (vs EXP-019 ascending) |
| **CHANNEL 2 — SETTLEMENT_SHADOW** | Repeated read-only queries of **fixed closed intervals** at increasing ages after interval close |

Preflight audits completed:

- **446-vs-141 reference union:** audited — **not a valid single-geometry completeness denominator**
- **Identical-query stability:** **IDENTICAL** (Q1/Q2/Q3 on settled EXP-019 interval)
- **Settlement shadow tooling:** **does not exist** — minimum forensic design specified below
- **Production post-trip timing:** implicit at enrichment enqueue — **no explicit settlement delay**

---

## A. Critical experiment separation

```
CADENCE_AND_SETTLEMENT_CHANNELS_ISOLATED = YES
```

### CHANNEL 1 — CADENCE_CALIBRATION

- Uses existing Reference Capture phase machinery (`hfCalibrationSeries`, phase API).
- Sequence: **60s → 30s → 20s → 10s**.
- Writes to normal RC observation store (calibration metrics).

### CHANNEL 2 — SETTLEMENT_SHADOW

**Must NOT:**

- alter RC watermarks or `hfQueryCoverageByField`
- alter phase state or calibration phase metrics
- write into production HF event pipelines
- trigger detectors, scores, tire/brake models
- affect production post-trip enrichment

**Must:**

- persist immutable per-age snapshots to **isolated forensic storage** only
- schedule automatically (no manual triggers while driving)

```
SHADOW_FAILURE_ISOLATED_FROM_PRIMARY_CAPTURE = YES
```

Shadow scheduler failure → log + continue RC session; never abort `stopRecording`.

---

## B. Fixed closed interval design

**Primary rule:** query the **exact same** `[from, to]` repeatedly; only **probe age** (wall-clock delay after interval end) varies.

### Mandatory probe ages (relative to interval END)

```
+30s, +60s, +120s, +180s, +300s, +600s
```

Optional higher resolution (if load safe): `+15s`, `+45s`, `+90s`.

### Invariants (never change between ages of same probe)

- `from` / `to` (fixed at interval close)
- `interval: "1s"`
- Field manifest (LTE_R1 reference manifest — same 5 fields as EXP-019)

```
QUERY_WINDOW_SIZE != BUCKET_AGGREGATION_INTERVAL  (maintained)
```

---

## C. Multiple settlement probes per cadence

| Phase | Probes planned |
|-------|----------------|
| 60s | 2 |
| 30s | 2 |
| 20s | 2 |
| 10s | 2 |
| **Total** | **8** |

### Prospective selection (deterministic — no gap inspection)

For each phase `P` with `[phaseStartedAt, phaseEndedAt]`:

| Probe | Selection rule |
|-------|----------------|
| **PROBE-A** | First eligible closed interval: `t0 = phaseStartedAt + STABILIZATION_MS` (120s), duration = `PRIMARY_DURATION` |
| **PROBE-B** | Second interval: `t0 = phaseStartedAt + floor(0.55 × phaseDurationMs)`, snapped to 1s boundary |

```
SETTLEMENT_PROBE_SELECTION_PROSPECTIVE = YES
SETTLEMENT_PROBES_GAP_SELECTED = NO
STABILIZATION_MS = 120000
```

Probe IDs: `SP-60-A`, `SP-60-B`, `SP-30-A`, … `SP-10-B`.

---

## D. Primary interval duration

| Candidate | Rationale |
|-----------|-----------|
| 30s | More probes per phase wall-clock |
| **60s** | **Selected** — fewer requests, aligns with EXP-020 W060 tile, enough buckets for maturation |

```
PRIMARY_SETTLEMENT_PROBE_DURATION_MS = 60000
```

Secondary duration (30s) may be run as **EXP-021-B** only if request budget allows — not in primary matrix.

---

## E. Per-age provider snapshot schema

Immutable JSONL record per observation (`settlement-shadow-observations.jsonl`):

| Field | Description |
|-------|-------------|
| `probeId` | e.g. `SP-30-A` |
| `phase` | `60s` / `30s` / `20s` / `10s` |
| `sourceIntervalStart` | fixed UTC |
| `sourceIntervalEnd` | fixed UTC |
| `probeAgeMs` | ms after `sourceIntervalEnd` |
| `requestStartedAt` | wall-clock |
| `queryFrom` / `queryTo` | identical across ages |
| `aggregationInterval` | `1s` |
| `providerRequestStatus` | SUCCESS / ZERO_RESULT / ERROR |
| `rawRowCount` | |
| `uniqueBucketCount` | speed temporal starts (primary) |
| `uniqueBucketIdentities` | fingerprint hashes when available |
| `fieldSampleCounts` | per manifest field |
| `revisionFingerprints` | if revisions detected vs prior age |
| `responseHash` | SHA-256 of canonical response |
| `channel` | `SETTLEMENT_SHADOW` |

**Never rewrite prior age rows.**

---

## F. Bucket maturation curve (per probe)

| AGE | UNIQUE BUCKETS | NEW SINCE PRIOR | REVISIONS |
|-----|----------------|-----------------|-----------|
| +30s | (measured) | — | — |
| +60s | | Δ vs +30 | |
| +120s | | Δ vs +60 | |
| +180s | | Δ vs +120 | |
| +300s | | Δ vs +180 | |
| +600s | | Δ vs +300 | |

Derived metrics per probe:

- `firstObservedAgeMs` per bucket identity
- `lastNewBucketAgeMs`
- `stabilityAgeMs` — candidate rule: no new identities in **two consecutive** scheduled ages (audit before canonizing)

---

## G. First-observation age distribution (EXP-020 validation target)

Across all probes + fields, compute P50/P75/P90/P95/P99/max for `bucketFirstObservedAgeMs`.

Stratify by signal: speed, RPM, TPS/throttle, engine load.

**EXP-020 reconstructed (EXP-019 provenance):**

| Percentile | ms | seconds |
|------------|-----|---------|
| P50 | 27,412 | ~27s |
| P90 | 56,598 | ~57s |
| P95 | 64,536 | ~65s |
| max | 77,517 | ~78s |

EXP-021 should confirm or refute with **prospective** closed-interval probes.

---

## H. Completeness reference (per fixed interval)

Provisional settled reference per probe: **+600s** observation.

If +600 still gains buckets vs +300:

```
NOT_SETTLED_BY_600S = YES
```

Completeness at age A:

```
C(A) = uniqueIdentities(A) / uniqueIdentities(latestKnownForProbe)
```

Report: C30, C60, C120, C180, C300, C600 per probe and aggregated.

**Do not use EXP-020 446 union as denominator** (see Section N).

---

## I. Settlement delay candidate test

For each candidate production delay `D ∈ {30,60,90,120,180,300}s`, across all probes:

```
completenessAt(D) = C(D) distribution
```

Report empirical:

```
DELAY_30_COMPLETENESS_P50 / P95
DELAY_60_COMPLETENESS_P50 / P95
... (through 300s)
```

**Do not select production value from design doc alone.**

---

## J. Post-trip finalization simulation (CHANNEL 2 extension)

After `stopRecording`, schedule isolated whole-trip queries at:

```
TripEnd + {30, 60, 120, 180, 300, 600}s
```

Fixed parameters:

- `from` = trip `startTime` (canonical)
- `to` = trip `endTime` (canonical)
- `interval: "1s"`
- Same manifest

Stored in `post-trip-shadow-observations.jsonl` — separate from settlement probes.

---

## K. Whole-trip maturation curve

| AGE | BUCKETS | NEW | ≥10s GAP% | MAX GAP |
|-----|---------|-----|-----------|---------|
| +30s | | | | |
| +60s | | | | |
| +120s | | | | |
| +180s | | | | |
| +300s | | | | |
| +600s | | | | |

Also correlate against EXP-019 video GT gaps where applicable.

---

## L. Single vs multi-pass post-trip policies (analytical)

| Policy | Pattern | Requests | Measures |
|--------|---------|----------|----------|
| P-A | single @ +30s | 1 | |
| P-B | single @ +60s | 1 | |
| P-C | single @ +120s | 1 | |
| P-D | single @ +180s | 1 | |
| P-E | +60 then +180 union | 2 | revisions captured |
| P-F | +60 then +300 union | 2 | |
| P-G | +120 then +300 union | 2 | |
| P-H | +60 +180 +600 union | 3 | |

Derived after drive from post-trip shadow snapshots:

- `requests/trip`
- final bucket union
- revision capture
- `time-to-first-score` / `time-to-final-score` (simulated from age schedule — not production)

**Goal:** determine if one delayed whole-trip query suffices or 2–3 passes materially improve fidelity.

---

## M. Production LEGACY timing audit

### Code path

```
Trip FSM finalize → VehicleTrip COMPLETED persisted
  → TripEnrichmentOrchestrator.enqueueBehaviorEnrichment() [async, immediate]
  → BullMQ trip.behavior.enrichment
  → TripBehaviorEnrichmentProcessor
  → DimoSegmentsService.fetchHighFrequency(trip.startTime, trip.endTime)
  → single GraphQL signals(interval:"1s") whole trip
```

| Field | Value |
|-------|-------|
| `CURRENT_PROD_POST_TRIP_QUERY_STRATEGY` | `SINGLE_WHOLE_TRIP_1S` |
| `CURRENT_PROD_QUERY_WINDOW_GEOMETRY` | One request `[startTime, endTime]` |
| `CURRENT_PROD_POST_TRIP_SETTLEMENT_DELAY` | **NONE explicit** — query at worker execution time |
| `CURRENT_PRODUCTION_POST_TRIP_QUERY_AGE_MS` | **VARIABLE** = `tripCompletedAt → enrichmentWorkerStart`; typically queue latency (seconds–minutes), **not instrumented** |

### Representative timing buckets (inferred — not measured in prod DB this task)

| Bucket | Likelihood |
|--------|------------|
| `<30s` after trip end | Possible under low queue load |
| `30–60s` | Common |
| `60–120s` | Possible under load |
| `>120s` | Possible backlog / retry |

**EXP-021 post-trip shadow** will empirically bracket what production *should* wait for.

---

## N. Mandatory audit — 446 vs 141 reference union

**Preflight executed:** `exp-021-446-union-audit.cjs` → `/tmp/exp-021/reference-446-union-audit.json`

### Components

| Source | Speed buckets (ms-precision keys) |
|--------|--------------------------------|
| TRUE T+30 observations | **165** |
| Full-trip settled query (now) | **140** |
| Full-session settled query (now) | **141** |
| Naive union | **446** |

### Overlap

| Pair | ms-key overlap | floor-second overlap |
|------|----------------|----------------------|
| obs ∩ trip | **0** | **36** |
| obs ∩ session | **0** | — |
| trip ∩ session | **0** | — |

### Root cause classification

```
REFERENCE_446_UNION_SEMANTICS_AUDITED = YES
446_IS_VALID_DISTINCT_PROVIDER_BUCKET_UNION = PARTIAL
```

The 446 count is **NOT** 446 physically distinct provider buckets at one geometry. It is the union of:

1. **Incremental T+30 capture** (sub-second `providerTimestamp` keys from live small windows)
2. **Whole-trip query** at EXP-020 wall-clock (second-aligned API timestamps)
3. **Whole-session query** spanning pre-trip + trip + post-trip bounds

**Ms-precision keying makes components appear disjoint** when ~36 buckets are the same second with different sub-second canonicalization.

### Implication for EXP-020 completeness ratios

- `W060–W300 → 0.316` vs **446** **overstates incompleteness**
- Valid EXP-021 denominator = **per-probe +600s reference** on **fixed `[from,to]`**
- ~141 buckets is the correct order-of-magnitude for **single settled geometry** over session/trip span

---

## O. Provider idempotence preflight

See: `EXP_021_PROVIDER_IDEMPOTENCE_PREFLIGHT_2026-09-07.md`

```
IDENTICAL_QUERY_STABILITY_TEST_EXECUTED = YES
IDENTICAL_QUERY_RESULT_STABILITY = IDENTICAL
```

---

## P. Counterbalanced cadence (CHANNEL 1)

```
NEXT_SEQUENCE = 60_30_20_10
```

Same vehicle/session machinery as EXP-019; video CEST UTC+2 overlay required.

**Not started in this task.**

---

## Q. Shadow query load safety

Assumptions: 8 probes × 6 mandatory ages; 1 GraphQL request per age (all manifest fields in one query); 6 post-trip ages.

| Component | Requests |
|-----------|----------|
| Cadence calibration (estimated from EXP-019) | **~59** |
| Settlement shadow (8 × 6) | **48** |
| Post-trip shadow (6 ages) | **6** |
| **Total experiment** | **~113** |

With optional +15/+45/+90 ages: +24 → **~137** max.

```
EXPECTED_CADENCE_REQUESTS = 59
EXPECTED_SETTLEMENT_SHADOW_REQUESTS = 48
EXPECTED_POST_TRIP_SHADOW_REQUESTS = 6
EXPECTED_TOTAL_EXPERIMENT_REQUESTS = 113
```

Bounded vs EXP-019 session (~59 cadence + reads). If unsafe, **reduce probe count** (not age integrity).

---

## R. Minimum experiment-only tooling (design — NOT implemented)

### New forensic module (proposed)

`reference-capture-settlement-shadow.service.ts` (forensic-only)

| Property | Value |
|----------|-------|
| Feature flag | `REFERENCE_CAPTURE_SETTLEMENT_SHADOW_ENABLED` default **false** |
| Storage | `/tmp/exp-021/` or session-scoped forensic dir — **not** RC observation watermark |
| Scheduler | In-process timer queue; survives phase transitions |
| Auth | Reuse DIMO JWT path; **read-only** GraphQL |
| Failure | catch-all; never throw into RC acquisition loop |

### Scheduler pseudocode

```
onIntervalClosed(probe):
  for age in [30,60,120,180,300,600]:
    scheduleAt(probe.intervalEnd + age):
      snapshot = querySignals(probe.from, probe.to, manifest)
      appendImmutable(snapshot)
```

Post-trip shadow: separate scheduler triggered at `sessionCompletedAt`.

### Implementation audit

| Capability | Exists today? |
|------------|---------------|
| RC phase machinery | **YES** |
| HF Recovery V2 window builder | **YES** (cadence only) |
| Settlement shadow scheduler | **NO** |
| Isolated shadow JSONL store | **NO** |
| Post-trip delayed query scheduler | **NO** |

```
READY_FOR_EXP021_IMPLEMENTATION_REVIEW = YES (design)
TOOLING_IMPLEMENTATION_STATUS = NOT_STARTED
```

**Do not deploy until separate implementation review.**

---

## S. Failure containment

| Failure mode | Behavior |
|--------------|----------|
| Shadow query ERROR | Log; continue; retry once optional |
| Shadow scheduler crash | RC session continues |
| DIMO rate limit | Backoff; drop optional ages before mandatory |
| Shadow storage full | Stop shadow writes; RC unaffected |

---

## T. Video GT

- Full timestamped video (CEST = UTC+2).
- Video-first control/GT selection **before** telemetry gap inspection (EXP-019 bias-control methodology preserved).

---

## U. EXP-021 decision questions (post-drive)

1. Empirical DIMO HF settlement-age distribution?
2. Age at which fixed closed interval stabilizes?
3. Age at which whole-trip query stabilizes?
4. Is one delayed whole-trip query enough?
5. Do 2–3 delayed passes materially improve fidelity?
6. Can aggressive live HF polling be removed from DI finalization?
7. What should remain live? (candidate: LATEST/native live; HF_HISTORICAL post-trip delayed)

---

## VPS preflight artifacts

| File | Path |
|------|------|
| 446 union audit | `/tmp/exp-021/reference-446-union-audit.json` |
| Idempotence preflight | `/tmp/exp-021/idempotence-preflight.json` |

### Scripts (forensic, not production)

| Script | Purpose |
|--------|---------|
| `exp-021-446-union-audit.cjs` | Reference union semantics |
| `exp-021-idempotence-preflight.cjs` | Q1/Q2/Q3 stability |

---

## Cross-links

| Artifact | Path |
|----------|------|
| EXP-020 window matrix | `EXP_020_RETROSPECTIVE_WINDOW_POST_TRIP_MATRIX_2026-09-07.md` |
| EXP-019 bias-control | `EXP_019_BIAS_CONTROL_AND_DECISION_READINESS_2026-09-07.md` |
| Idempotence preflight | `EXP_021_PROVIDER_IDEMPOTENCE_PREFLIGHT_2026-09-07.md` |
