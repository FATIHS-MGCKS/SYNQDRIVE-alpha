# EED-EV-0103 — RFRF Settled Post-Refuel Design + Offline Replay (2026-09-30)

**Mode:** Design + historical replay only — **no Production mutation**  
**Rebase baseline main:** `59103adad87bead79f701f565987354ab03631cf`  
**Epistemic:** Offline replay + committed fixtures — **not** Production proof of runtime F3  

---

## 1. Artifacts

| Artifact | Path |
|----------|------|
| Settled post ADR | `decisions/RFRF-F3-SETTLED-POST-REFUEL-MATURITY-2026-09-30.md` |
| Capability policy ADR | `decisions/RFRF-FUEL-CAPABILITY-POLICY-2026-09-30.md` |
| Absolute-only trust design | `decisions/RFRF-ABSOLUTE-ONLY-TRUST-AUTHORITY-DESIGN-2026-09-30.md` |
| Design policy (offline) | `backend/.../design/settled-post-refuel-plateau.policy.ts` |
| Replay fixtures | `backend/.../design/settled-post-replay.fixtures.ts` |
| Replay harness | `backend/scripts/ops/rfrf-settled-post-historical-replay.harness.ts` |

**Run:**

```bash
cd backend && npx ts-node -r tsconfig-paths/register scripts/ops/rfrf-settled-post-historical-replay.harness.ts
cd backend && npm test -- settled-post-replay.harness.spec.ts
```

---

## 2. Calibration pack coverage (7 defensible natural rows)

| Vehicle | Event (UTC) | Evidence quality | Pre | Peak | Settled | Current | Settled | Δ (settled) | Peak→settle | Rel. corroboration | Ground truth | FP concern | FN concern |
|---------|-------------|------------------|-----|------|---------|---------|---------|-------------|-------------|-------------------|--------------|------------|------------|
| KS MS 661 | 2026-09-30 04:57 | **FULL_REPLAY** | 6 | 20 | 19 | OBSERVED | **READY** | 13 | 1 L | NO | ~12 L human | MEDIUM | LOW |
| KS MS 661 | 2026-09-06 09:39 | **PARTIAL_REPLAY** | 7 | 31 | — | OBSERVED | OBSERVED | — | — | NO | ~24 L audit | LOW | **HIGH** |
| WOB L 7503 | 2026-09-19 16:11 | **FULL_REPLAY** | 4 | 18 | 18 | READY | READY | 14 | 0 | YES | native/labeled | MEDIUM | LOW |
| WOB L 7503 | 2026-09-27 21:34 | **FULL_REPLAY** | 4 | 13 | 13 | READY | READY | 9 | 0 | PARTIAL | 9 L fixture | MEDIUM | LOW |
| WOB L 7503 | 2026-09-24 | **INSUFFICIENT** | — | — | — | n/a | SKIPPED | — | — | n/a | n/a | n/a | n/a |
| KS MX 2024 | 2026-09-16 20:52 | **FULL_REPLAY** | 5 | 27 | 27 | READY | READY | 22 | 0 | YES | 22 L native | MEDIUM | LOW |
| KS MX 2024 | 2026-09-04 03:47 | **INSUFFICIENT** | — | — | — | n/a | SKIPPED | — | — | PARTIAL | 21 L segment meta | n/a | n/a |

**Tier counts:** FULL_REPLAY **4** · PARTIAL_REPLAY **1** · INSUFFICIENT_SOURCE_EVIDENCE **2**

**Why not seven FULL replays:** WOB 2026-09-24 has no committed DIMO absolute extract; KS MX 2026-09-04 has native segment metadata and route JSON but no absolute rise spine in repo — samples were **not fabricated**.

**Excluded suspect (not positive calibration):** KS MS 661 2026-09-14 ~57 L telemetry — **INSUFFICIENT_SOURCE_EVIDENCE** in repo; retained as negative/suspect control manifest only.

---

## 3. Adversarial semantic matrix (A1–A12)

Default replay hypothesis: `maxPeakToSettledDropLiters=3`, `maxPeakToSettledDropRatioOfRise=0.35` (**REPLAY_HYPOTHESIS_ONLY**).

| Case | Current → Settled | Safety expectation |
|------|-------------------|--------------------|
| A1 | REJECTED → OBSERVED | Must not READY (return-to-baseline) |
| A2 | NO_RISE → NO_RISE | Fail-closed (reset) |
| A3 | REJECTED → OBSERVED | Must not READY (collapse) |
| A4 | NO_RISE → NO_RISE | Fail-closed (gradual consumption) |
| A5 | NO_RISE → NO_RISE | Fail-closed (stale baseline) |
| A6 | NO_RISE → NO_RISE | Fail-closed (gap) |
| A7 | NO_RISE → NO_RISE | Fail-closed (two fills) |
| A8 | OBSERVED → **READY** | **Positive overshoot/settle control** |
| A9 | NO_RISE → NO_RISE | Fail-closed (quantized small rise) |
| A10 | REJECTED → **READY** | Slosh around stable post — edge **accept** (excluded from FP regression count) |
| A11 | NO_RISE → NO_RISE | Fail-closed (continued consumption) |
| A12 | NO_RISE → NO_RISE | Fail-closed (second rise) |

**False-positive regressions (unexpected adversarial READY, excl. A8/A10):** **0**  
**False-negative improvements (natural/labeled CURRENT≠READY → SETTLED=READY):** **1** (KS MS 661 2026-09-30)  
**Ambiguous non-adversarial divergences:** **1**

---

## 4. Numeric caps — replay only

| Constant | Classification | Production selected? |
|----------|----------------|----------------------|
| `maxPeakToSettledDropLiters` (default 3 in replay) | **REPLAY_HYPOTHESIS_ONLY** | **NO** |
| `maxPeakToSettledDropRatioOfRise` (default 0.35 in replay) | **REPLAY_HYPOTHESIS_ONLY** | **NO** |

**Sensitivity grid (liters × ratio):** At default hypothesis, **4/4** replayable natural rows reach SETTLED READY (`661-0930`, `WOB-0919`, `WOB-0927`, `KS-MX-0916`). First adversarial READY leak in grid (excluding A8/A10 controls): **none observed** across liters `{1…6}` × ratios `{0.15…0.55}` for safety-negative cases. **No Production threshold chosen.**

---

## 5. Settled-post contract (design review)

Settled post is **not** “any later stable value above pre”. Episode must stay physically attributable:

- Fresh pre-baseline (detector pre-plateau; stale blocked separately via baseline recency guard)
- Material rise + bounded temporal locality / inter-sample gaps
- Stable local settled center materially above pre
- Peak diagnostic only; authoritative `postFuelAbsoluteLiters` = settled median; `deltaAbsoluteLiters` = settled − pre median
- Reject sensor reset, return-to-baseline, separate-event ambiguity, continued consumption without stable post
- Slosh/quantization via tolerance window + bounded peak→settled drop guards (replay hypothesis only)
- Hybrid trust / promotion trust **unchanged** — Option C blocks ABSOLUTE_ONLY auto-promotion regardless of F3 replay READY

---

## 6. Capability + absolute-only authority

- **DUAL_CHANNEL:** Hybrid Trust v2 path preserved — **unchanged**
- **ABSOLUTE_ONLY:** Alpha detection/audit allowed; auto fallback promotion **blocked** (Option C)
- **RELATIVE_ONLY / NO_FUEL_SIGNAL:** fail-closed / ineligible
- **rfrf-absolute-only-trust-v1:** design-only — **NOT IMPLEMENTED**, **NOT ACTIVATED**, **NOT** part of Hybrid v2

---

## 7. Production candidate (read-only evidence)

**KS MS 661** candidate `b27124fb…` — **not mutated** in this workstream. Production fail-closed OBSERVED outcome remains valid historical evidence.

---

## 8. Governance

| Item | Status |
|------|--------|
| EED-OQ-014 | **OPEN** — peak-anchored incomplete; settled direction approved; replay expanded; numeric calibration unresolved |
| EED-OQ-019 | **PARTIALLY_RESOLVED** — Alpha activation complete; first natural refuel observed; absolute-only limitation documented; Option C; durable calibration / absolute-only authority open |
| READY_FOR_RUNTIME_IMPLEMENTATION | **NO** |

**CURRENT_NATURAL_CANDIDATE_MUTATED=NO**
