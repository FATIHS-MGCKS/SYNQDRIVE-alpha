# Signal Cadence & Density — Canonical Record

**Invariant:** DI-INV-CADENCE-FOUR-WAY-001

```
QUERY INTERVAL ≠ PROVIDER POLL CADENCE ≠ OBSERVED BUCKET DENSITY ≠ PHYSICAL SENSOR SAMPLING
```

**Rule:** Do **not** combine different temporal distributions under one "observed HF median" label.

---

## Canonical cadence metrics (separated)

| Metric ID | Value | Population | Surface | Drive | Source |
|-----------|-------|------------|---------|-------|--------|
| `RD002_SEALED_DT_P50_SECONDS` | **13.489** | Sealed HF_HISTORICAL aggregate buckets (71 rows, 5 fields identical) | HF_HISTORICAL | RD002 | DI-EV-0023–0025 |
| `RD002_SEALED_DT_P95_SECONDS` | **84.024** | Same | HF_HISTORICAL | RD002 | Sealed export |
| `RD002_SEALED_DT_MAX_SECONDS` | **249.647** | Same | HF_HISTORICAL | RD002 | Sealed export |
| `RD003_RELEVANT_MEDIAN_SECONDS` | **~2.00** | HF_HISTORICAL new physical sample cadence (deduped providerTimestamp) | HF_HISTORICAL | RD003 | DI-EV-0034E |
| `RD002_LATEST_LIVE_POLL_P50_SECONDS` | **~5.85** | Recorder retrieval Δt (`requestStartedAt`) | LATEST_LIVE | RD002 | DI-EV-0026 |
| `RD002_LATEST_LIVE_PROVIDER_UPDATE_P50_SECONDS` | **~15** | Unique providerTimestamp updates | LATEST_LIVE | RD002 | DI-EV-0026 |
| `RD004_SEALED_MEDIAN_SPACING_SECONDS` | **~10.6** | Sealed capture completeness artifact | HF_HISTORICAL | RD004-B | DI-EV-0035B.4 |

`RD002_AND_RD003_CADENCE_METRICS_SEMANTICALLY_SEPARATED = YES`

---

## Forensic audit: legacy "median 3–6s on LTE_R1" claim

`LTE_R1_3_6S_MEDIAN_CLAIM_AUDITED = YES`
`LTE_R1_3_6S_METRIC_HAS_EXACT_POPULATION = NO`
`LTE_R1_3_6S_CLAIM_REMOVED_IF_UNSUPPORTED = YES`
`NATIVE_EVENT_POLICY_DEPENDS_ON_FALSE_COMBINED_MEDIAN = NO`

| Question | Finding |
|----------|---------|
| **Origin** | Informal code-comment generalization (`trip-behavior-enrichment.service.ts`, `event-context.types.ts`: "median ~3–6 s, P95 ~21 s") copied into early authority drafts as "Phase 2B + RD002/003". **Phase 2B did not publish this statistic.** |
| **Classification** | **C — old generalized interpretation, not defensible as one metric** |
| **Why not A or B** | No sealed export, population, surface, or statistic definition supports a single LTE_R1-wide "median 3–6s". Established metrics disagree: RD003 HF_HISTORICAL **~2.00s**; RD002 sealed HF P50 **13.489s**; RD002 LATEST_LIVE poll P50 **~5.85s**; RD003 LATEST_LIVE **~6.0s**. Mixing these under one median violates DI-INV-CADENCE-FOUR-WAY-001. |
| **P95 ~21s** | Not traced to a sealed reference-drive export in authority evidence; do not cite. |

**Authority rule (unchanged):** HF whole-trip pass = Trip Signal Summary; native `DrivingEvent` = short-event policy authority when available. Rationale is **sparse/variable HF + point-pair weakness**, not a false combined median.

**Do not reintroduce:** undefined combined RD002/RD003 cadence, or "median 3–6s" without a named metric row in the table above.

---

**Why RD002 P50 ≠ RD003 ~2s:** Different vehicles (C63 vs Tiguan), different sealed export populations, and different metric definitions (sealed aggregate-bucket row spacing vs RD003 signal-quality deduped physical-sample cadence). **Never merge into one median.**

---

## Requested vs observed (by drive)

| Surface | Requested | RD002 sealed HF | RD003 HF | RD004-B sealed |
|---------|-----------|-----------------|----------|----------------|
| HF historical | `interval:"1s"` | P50 **13.489s** (71 rows) | median **~2.00s** physical samples | ~10.6s (capture gaps) |
| LATEST_LIVE | live poll | poll P50 ~5.85s; provider update ~15s | median ~6s; stale holds | — |

**Reconciliation:** RD003 ~2s and RD004 ~10.6s are **compatible** — RD004 reflects capture/watermark incompleteness, not DIMO physics alone. RD002 sealed P50 13.489s reflects sparse aggregate-bucket spacing on C63 motion session (also `1s ≠ 1Hz`, but **not** ~2s).

Exact-window replay (RD004-B): 157 1s-buckets vs 104 sealed over same windows.

---

## Provider behavior

| Phenomenon | Evidence | Mitigation |
|------------|----------|------------|
| Late-arriving buckets | RD001, RD004-B (53 late) | DI-EV-0035C recovery policy (reference capture) |
| Settlement delay | RD004-B simulation | 8s provisional |
| Watermark gaps | 26 excluded in B.4 | 6s recovery overlap |
| Duplicate buckets | RD002: 0 duplicate fingerprints | AGGREGATE_BUCKET_V2 identity (DI-EV-0021) |
| Provider data gaps | RD001: 151s gap | Documented; not vehicle idle proof |

---

## Physical sampling

**UNKNOWN** — DIMO aggregate buckets do not prove underlying ECU sampling rate.

`REQUESTED_INTERVAL_1S_EQUALS_OBSERVED_1HZ = NO` (RD002, RD003)

---

## Detector implications

| Assumption | Current code | Evidence |
|------------|--------------|----------|
| ~1 Hz HF | `HF_WINDOW_EXPECTED_INTERVAL_MS=1000` | CONTRADICTED (RD003 ~2s; RD002 sealed P50 13.489s) |
| Point-pair Δv/Δt | hf-acceleration, hf-braking | Valid as summary; weak for sparse LTE_R1 events |
| 2.0s max-gap (V2 design) | Not in production | Provisional from RD003 only |

---

## Per-signal variability

Documented in `docs/audits/data/rd003-signal-quality/signal-quality-summary.json` — each signal has OBSERVED_SPAN, TEMPORAL_CONTINUITY, gap metrics.
