# RFRF F3 — Settled Post-Refuel Maturity (Design ADR)

**Workstream:** Energy Event Detection (EED) → Raw Fuel Refuel Fallback (RFRF) → F3 rise detector  
**Date:** 2026-09-30  
**Status:** **PROPOSED** — human design authorization; **no runtime implementation**  
**Baseline main:** `59103adad87bead79f701f565987354ab03631cf`  
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

`backend/scripts/ops/rfrf-settled-post/settled-post-refuel-plateau.policy.ts`

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
- **Inter-sample gaps:** `maxSampleGapMs` (symbolic) — applies **within** an accepted settled plateau window only (existing F3 semantics).

### 4.3 Peak→settled continuity authority (symbolic — EED-EV-0104)

| Symbol | Classification | Production numeric |
|--------|----------------|--------------------|
| **`maxPeakToSettledContinuityGapMs`** | **SYMBOLIC_UNCALIBRATED** | **NO default; NO Production value in this ADR** |

**Definition:** Maximum admissible **inter-observation discontinuity** on the evidence path from the **instantaneous rise peak** through the **start** of the authoritative settled window.

**Not the same as physical settling duration.** Keep diagnostic fields distinct:

| Field | Meaning |
|-------|---------|
| `peakToSettledStartElapsedMs` | Elapsed observation time from peak timestamp to settled-window start |
| Observed max continuity gap (peak→settled start) | Largest inter-sample gap on that path — compared against `maxPeakToSettledContinuityGapMs` when calibrated |

**Design decision (2026-10-01):** **`LOCALITY_AUTHORITY_DESIGN=SEPARATE_SYMBOLIC_AUTHORITY`**. Do **not** silently reuse `absolute.maxSampleGapMs` as the peak→settled locality authority — that symbol already expresses rise-path and within-window gap semantics; reuse would couple three calibration surfaces (rise-path gaps, settled-window internal gaps, peak→settled locality). Independent semantics, calibration, provenance, and versioning are required before runtime implementation.

Offline sensitivity only (six eligible naturals): see EED-EV-0104 — all numeric locality caps labeled **OFFLINE_SENSITIVITY_ONLY**; no Production threshold selected.

### 4.4 Relationship to pre-baseline & peak

- **Materiality:** settled median ≥ `preMedian + materialRiseLiters`.
- **Peak collapse bounds (symbolic, not calibrated):**
  - `maxPeakToSettledDropLiters`
  - `maxPeakToSettledDropRatioOfRise`
- Offline replay defaults for these two fields are **`REPLAY_HYPOTHESIS_ONLY`** (`REPLAY_HYPOTHESIS_MAX_PEAK_TO_SETTLED_DROP_*` in design policy) — **not** Production constants until EED-OQ-014 closes.
- Reject if min window value returns toward pre (`negativeWobbleLiters` guard).

### 4.5 Sensor / provider behaviors

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

### 5.1 Terminal F3 rejection dominance (mandatory)

Settled-post maturity is **subordinate** to existing F3 terminal safety classification. Offline replay (EED-EV-0103) enforces:

1. Detect rise + classify lifecycle with **current** F3 state machine.
2. If lifecycle is **REJECTED** for a preserved terminal reason (`SENSOR_RESET_SUSPECTED`, `RISE_NOT_STABLE`, `SAMPLE_GAP_TOO_LARGE`, `RISE_TOO_SMALL`), **do not** invoke settled-post maturity as a resurrection path.
3. Settled replay result remains **REJECTED** with `SETTLED_EVALUATION_ALLOWED=NO`.
4. Only **non-terminal** rises (e.g. **OBSERVED** with material rise, **READY** peak-anchored) may enter settled-post evaluation.

This preserves KS MS 661 2026-09-30 (**OBSERVED** today) while blocking A1/A3/A10_NEG resurrection.

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

**EED-EV-0104 (2026-10-01):** Six calibration-eligible FMS naturals (3 vehicles; WOB concentration 4/6); observed drop sample bounds **not** Production caps; WOB 2026-09-19 **DELAYED_OBSERVATION** — refuel valid, settled timing **not** calibration-grade; separate symbolic `maxPeakToSettledContinuityGapMs` authority added (uncalibrated).

---

## 9. Phase-aware strong-regression addendum (design only — no runtime change)

Future observation phases (normative design vocabulary):

```
RISING → PEAK_REACHED → SETTLING → SETTLED
```

Terminal evidence classes remain **separate** from settling phases:

```
SENSOR_RESET | TRUE_RETURN_TO_BASELINE | UNSTABLE_RISE (terminal)
```

**Mandatory invariants (future runtime must preserve):**

1. Sensor-reset evidence remains **terminal**.
2. True return toward the fresh pre-refuel baseline remains **terminal** (within existing negative-wobble semantics).
3. A bounded post-peak decline that remains **materially above** the fresh pre-baseline **may** enter **SETTLING** in a future model; it must **not** automatically become `RISE_NOT_STABLE` solely because magnitude exceeds `negativeWobbleLiters` without phase context.
4. **This ADR does not weaken current runtime.** Current F3 behavior stays authoritative until a separately authorized implementation PR.
5. A terminal F3 classification may **never** be resurrected by settled-post logic (see §5.1).
6. Peak→settled **evidence continuity** must be proven before a settled window becomes authoritative (§4.3).
7. **Hybrid Trust v2** remains downstream and unchanged.
8. **Alpha Option C** unchanged: absolute-only F3 READY may still carry Hybrid UNKNOWN → no automatic fallback promotion.

**Structural finding (fleet sample N=6):** `EMPIRICALLY_OBSERVED_VALID_REFUEL_STRONG_REGRESSION_CONFLICT_COUNT=0`; `STRUCTURAL_CONFLICT_EXISTS_FOR_VALID_SETTLING_DROP_GT_1L=YES` — do **not** claim the fleet has proven a legitimate >1 L settling drop.

---

## 10. Replay evidence (offline)

Harness: `backend/scripts/ops/rfrf-settled-post-historical-replay.harness.ts`  
Summary artifact: EED-EV-0103

**KS MS 661 2026-09-30 (natural extract):**

| Model | Result |
|-------|--------|
| Current peak-anchored F3 | **OBSERVED** |
| Design settled-post | **READY_FOR_PERSIST** (authoritative post **19 L**, Δ **13 L**, peak→settled **1 L**) |

**Note:** READY in replay is **F3 maturity only** — does not imply promotion under Alpha absolute-only policy (Option C).
