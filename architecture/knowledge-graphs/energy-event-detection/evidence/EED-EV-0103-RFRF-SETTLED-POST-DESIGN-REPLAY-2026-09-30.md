# EED-EV-0103 — RFRF Settled Post-Refuel Design + Offline Replay (2026-09-30)

**Mode:** Design + historical replay only — **no Production mutation**  
**Rebase baseline main:** `59103adad87bead79f701f565987354ab03631cf`  
**Policy version:** `rfrf-settled-post-design-v1` (terminal F3 dominance)  

---

## 1. Artifacts (non-runtime tree)

| Artifact | Path |
|----------|------|
| Settled post ADR | `decisions/RFRF-F3-SETTLED-POST-REFUEL-MATURITY-2026-09-30.md` |
| Design policy + replay lib | `backend/scripts/ops/rfrf-settled-post/` |
| Harness | `backend/scripts/ops/rfrf-settled-post/rfrf-settled-post-historical-replay.harness.ts` |
| Tests | `npm run test:rfrf:settled-post-replay` |

---

## 2. Terminal F3 rejection dominance

**TERMINAL_REJECTION_DOMINATES_SETTLED_POST=PASS**

When current F3 classifies a rise **REJECTED** with preserved terminal reasons, replay sets:

- `SETTLED_EVALUATION_ALLOWED=NO`
- `SETTLED_MODEL_RESULT=REJECTED` (no OBSERVED/READY resurrection)

Examples after repair:

| Case | Current → Settled | Terminal |
|------|-------------------|----------|
| A1 | REJECTED → **REJECTED** | YES (`RISE_NOT_STABLE`) |
| A3 | REJECTED → **REJECTED** | YES |
| A10_NEG | REJECTED → **REJECTED** | YES |
| KS MS 661 2026-09-30 | OBSERVED → **READY** | NO (admissible rise) |

---

## 3. Calibration pack (7 defensible rows)

| Tier | Count | Meaning |
|------|------:|---------|
| CRITICAL_PATH_FULL_REPLAY | 1 | KS MS 661 2026-09-30 — curated event-critical Production extract; **not** full 144-bucket provider series |
| FULL_REPLAY | 3 | Committed absolute spine sufficient for offline replay |
| PARTIAL_REPLAY | 1 | Sparse audit anchors only |
| INSUFFICIENT_SOURCE_EVIDENCE | 2 | No fabricatable absolute series in repo |

**FULL_PROVIDER_SERIES_PRESENT (KS MS 661 2026-09-30):** **NO** (critical-path extract only)

---

## 4. Adversarial matrix (A1–A12)

| Case | Expected class | Result (default hypothesis) |
|------|----------------|----------------------------|
| A1 | SAFETY_NEGATIVE | REJECTED→REJECTED |
| A2 | SAFETY_NEGATIVE | NO_RISE |
| A3 | SAFETY_NEGATIVE | REJECTED→REJECTED |
| A4–A7,A11,A12 | SAFETY_NEGATIVE | NOT READY |
| A8 | **POSITIVE_CONTROL** | OBSERVED→**READY** |
| A9 | AMBIGUOUS | NO_RISE (documented) |
| A10_POS | **POSITIVE_CONTROL** (explicit slosh robustness) | READY→**READY** |
| A10_NEG | SAFETY_NEGATIVE | REJECTED→REJECTED |

**False-positive regressions:** metadata-driven (`expectedSemanticClass`), **0** at default hypothesis.  
**No hard-coded `caseId !== 'A8'` exclusions.**

**False-negative improvements:** **1** (KS MS 661 2026-09-30)

---

## 5. Numeric caps

| Constant | Value | Classification | Production selected |
|----------|------:|------------------|---------------------|
| maxPeakToSettledDropLiters | 3 | REPLAY_HYPOTHESIS_ONLY | **NO** |
| maxPeakToSettledDropRatioOfRise | 0.35 | REPLAY_HYPOTHESIS_ONLY | **NO** |

**Sensitivity grid (re-run after terminal repair):** **0** SAFETY_NEGATIVE leaks at default hypothesis across liters `{1…6}` × ratios `{0.15…0.55}`.

---

## 6. Governance

| Item | Status |
|------|--------|
| EED-OQ-014 | **OPEN** |
| EED-OQ-019 | **PARTIALLY_RESOLVED** (Option C preserved) |
| Hybrid Trust v2 | **UNCHANGED** |
| Runtime F3 implementation | **NOT AUTHORIZED** |
| Candidate `b27124fb…` | **NOT MUTATED** |
