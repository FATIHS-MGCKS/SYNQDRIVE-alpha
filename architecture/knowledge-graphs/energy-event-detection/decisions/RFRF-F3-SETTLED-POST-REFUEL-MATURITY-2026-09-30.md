# RFRF F3 — Settled Post-Refuel Maturity (Design ADR)

**Workstream:** Energy Event Detection (EED) → Raw Fuel Refuel Fallback (RFRF) → F3 rise detector  
**Date:** 2026-09-30  
**Status:** **PROPOSED** — human design authorization; **no runtime implementation**  
**Baseline main:** `45f5369b6aeefa0c91e02148c5c25d069367c058`  
**Evidence:** EED-EV-0103 (offline replay); KS MS 661 natural refuel 2026-09-30 forensic audit  

---

## 1. Decision summary

| Field | Value |
|-------|-------|
| **APPROVED_DESIGN_DIRECTION** | Replace peak-anchored post-refuel plateau as **authoritative** maturity with **ROBUST_SETTLED_POST_REFUEL_LEVEL** |
| **RUNTIME_IMPLEMENTATION** | **NOT AUTHORIZED** in this ADR |
| **NUMERIC_CALIBRATION** | **OPEN** (EED-OQ-014) — symbolic parameters only in design/replay |
| **INSTANTANEOUS_PEAK_ROLE** | Diagnostic / provenance; **not** authoritative `postFuelAbsoluteLiters` when settled plateau is proven |

---

## 2. Problem statement

Production natural refuel **KS MS 661 (2026-09-30)** shows:

- Material absolute rise (+14 L vs pre median 6 L)
- Brief peak **20 L**, then stable **19 L → 18 L** (1 L quantization / settling)
- Current F3 post-plateau anchored to **peak ± 0.5 L** → **0** qualifying post samples → lifecycle **OBSERVED** (fail-closed **correct** today)

Peak-anchored model **partially generalizes**: dual-channel cases where peak ≈ settled (e.g. WOB 2026-09-19) already reach **READY_FOR_PERSIST**.

---

## 3. Target semantics (three levels)

| Concept | Definition |
|---------|------------|
| **Instantaneous rise peak** | Max absolute sample during material rise episode (retain for diagnostics) |
| **Settled local post-refuel plateau** | Earliest time-local window after rise where samples form a robust plateau **materially above fresh pre-baseline**, median may be **below peak** within bounded collapse policy |
| **Authoritative post-refuel level** | `settledPostMedian` when settled plateau proven; else maturity incomplete |

**Authoritative delta:**

```
postFuelAbsoluteLiters = settledPostMedian   (when valid)
deltaAbsoluteLiters    = settledPostMedian - preMedian
```

**Not:**

```
postFuelAbsoluteLiters = instantaneousPeak   (deprecated as authority when settled model ships)
```

---

## 4. Pure policy function (design-only)

Reference implementation (offline only):

`backend/src/modules/vehicle-intelligence/energy-events/raw-fuel-rise-detector/design/settled-post-refuel-plateau.policy.ts`

```
resolveSettledPostRefuelPlateau({ series, riseEndIdx, peakIdx, preMedian, symbols })
classifySettledPostMaturity({ preMedian, settled })
```

### 4.1 Search origin & locality

- **Search start:** at or after **rise peak index** (end of rise neighborhood — not stretched-end coalescence time).
- **Upper time bound:** `maxPostSearchAfterRiseEndMs` (symbolic; maps to rise episode bound, not unbounded history).
- **Locality:** settled window must not include distant consumption; bounded search + gap semantics preserve this.

### 4.2 Plateau evidence

- **Stable window:** each sample within **tolerance of window median** (same robust median semantics as F3.1 `validatePlateauWindow`).
- **Minimum samples:** `postPlateauMinSamples` (symbolic).
- **Persistence:** `postPlateauMinPersistenceMs` (symbolic).
- **Inter-sample gaps:** `maxSampleGapMs` (symbolic).

### 4.3 Relationship to pre-baseline & peak

- **Materiality:** settled median ≥ `preMedian + materialRiseLiters`.
- **Peak collapse bounds (symbolic, not calibrated):**
  - `maxPeakToSettledDropLiters`
  - `maxPeakToSettledDropRatioOfRise`
- Reject if min window value returns toward pre (`negativeWobbleLiters` guard).

### 4.4 Sensor / provider behaviors

| Behavior | Treatment |
|----------|-----------|
| **1 L quantization** | Tolerance + settled median (not peak band) |
| **Slosh / movement** | Local plateau + persistence; optional future speed context (corroboration only) |
| **Provider AVG aggregation** | Treat as smeared steps; do not invent sub-bucket precision |
| **Continued consumption** | After valid settled window, later decline must not retroactively invalidate; separate episodes for second material rise |
| **Second material rise** | Episode separation + continuation grace (existing rise bounds) |
| **Sparse samples** | Fail closed via min samples / gaps |

---

## 5. Mandatory safety invariants (must remain fail-closed)

The shipped model **must not** promote:

| Pattern | Guard |
|---------|--------|
| 6 → 20 → 6 | Baseline return / sensor reset / negative wobble |
| Single spike | Min samples + persistence |
| 6 → 20 → unstable oscillation | Plateau validity + collapse ratio |
| Sensor reset | Existing reset suspicion |
| Large gaps | `maxSampleGapMs` + semantic gap regions |
| Gradual consumption | No material step vs fresh pre |
| Stale pre-baseline | Baseline recency authority (OQ-017) |
| Two fills coalesced | Rise episode bounds + identity/rediscovery |
| Peak collapse without trustworthy settle | Collapse ratio / materiality |

**Preserved authorities:** baseline recency, sample-gap, sensor-reset, episode separation, native/fallback convergence, promotion-time trust revalidation, tenant isolation, **Hybrid Trust v2 separation**.

---

## 6. Evidence & provenance fields (design — prefer meta first)

Proposed keys (evidenceMeta / qualityMeta — **no schema migration in this ADR**):

- `instantaneousPeakLiters`
- `instantaneousPeakAt`
- `settledPostLiters`
- `settledPostStartAt`
- `settledPostEndAt`
- `peakToSettledDropLiters`
- `peakToSettledDropRatio`
- `settlingDurationSeconds`
- `settledPostPolicyVersion`

---

## 7. Version boundary (future)

| Artifact | Bump when settled semantics ship in runtime F3? |
|----------|-----------------------------------------------|
| `RFRF_RISE_DETECTOR_VERSION` | **YES** |
| `RFRF_RISE_DETECTION_VERSION` | **YES** if observation contract changes |
| `RFRF_HYBRID_ABSOLUTE_SIGNAL_TRUST_AUTHORITY_VERSION` | **NO** unless hybrid semantics change |
| `RFRF_SETTLED_POST_PLATEAU_POLICY_VERSION` | **YES** (new design policy version) |

**No runtime version bump performed in this workstream.**

---

## 8. EED-OQ-014 linkage

Peak-anchored post plateau is **insufficient** for observed absolute-only overshoot-then-settle behavior. Settled-post architecture is **under design**; numeric fleet calibration **remains OPEN**. Do **not** mark OQ-014 RESOLVED.

---

## 9. Replay evidence (offline)

Harness: `backend/scripts/ops/rfrf-settled-post-historical-replay.harness.ts`  
Summary artifact: EED-EV-0103

**KS MS 661 2026-09-30 (natural extract):**

| Model | Result |
|-------|--------|
| Current peak-anchored F3 | **OBSERVED** |
| Design settled-post | **READY_FOR_PERSIST** (authoritative post **19 L**, Δ **13 L**, peak→settled **1 L**) |

**Note:** READY in replay is **F3 maturity only** — does not imply promotion under Alpha absolute-only policy (Option C).
