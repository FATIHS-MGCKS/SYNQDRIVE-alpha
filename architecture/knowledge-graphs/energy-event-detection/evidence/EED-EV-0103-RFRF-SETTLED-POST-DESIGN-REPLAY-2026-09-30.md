# EED-EV-0103 — RFRF Settled Post-Refuel Design + Offline Replay (2026-09-30)

**Mode:** Design + historical replay only — **no Production mutation**  
**Baseline main:** `45f5369b6aeefa0c91e02148c5c25d069367c058`  

---

## 1. Artifacts

| Artifact | Path |
|----------|------|
| Settled post ADR | `decisions/RFRF-F3-SETTLED-POST-REFUEL-MATURITY-2026-09-30.md` |
| Capability policy ADR | `decisions/RFRF-FUEL-CAPABILITY-POLICY-2026-09-30.md` |
| Absolute-only trust design | `decisions/RFRF-ABSOLUTE-ONLY-TRUST-AUTHORITY-DESIGN-2026-09-30.md` |
| Design policy (offline) | `backend/.../design/settled-post-refuel-plateau.policy.ts` |
| Replay harness | `backend/scripts/ops/rfrf-settled-post-historical-replay.harness.ts` |

**Run:**

```bash
cd backend && npx ts-node -r tsconfig-paths/register scripts/ops/rfrf-settled-post-historical-replay.harness.ts
```

---

## 2. Replay summary (2026-09-30)

| Metric | Value |
|--------|------:|
| Historical cases | 3 |
| Adversarial cases | 10 |
| False-positive regressions (unexpected adversarial READY) | **0** (A8 is intentional positive control) |
| False-negative improvements (natural/labeled: CURRENT≠READY → SETTLED=READY) | **1** (KS MS 661 2026-09-30) |
| Ambiguous (model divergence, non-adversarial) | **1** |

### 2.1 Anchor natural case — KS MS 661 2026-09-30

| Field | Current peak-anchored | Design settled-post |
|-------|----------------------|---------------------|
| Result | **OBSERVED** | **READY_FOR_PERSIST** (F3 maturity only) |
| pre median | 6 L | 6 L |
| peak | 20 L | 20 L |
| authoritative post | 20 L (candidate row — not plateau-validated) | **19 L** (settled median) |
| delta | 14 L (peak-based) | **13 L** (settled-based) |
| peak→settled drop | n/a (no plateau) | **1 L** |

**Promotion note:** ABSOLUTE_ONLY Alpha Option C still blocks auto VEE regardless of F3 replay READY.

### 2.2 Other historical cases

| Case | Current | Settled |
|------|---------|---------|
| KS MS 661 2026-09-06 observed sparse | OBSERVED | OBSERVED |
| WOB 7503 2026-09-19 labeled | READY | READY (peak≈settle 18 L) |

### 2.3 Adversarial highlights

| Case | Current | Settled | Expected |
|------|---------|---------|----------|
| A1 6→20→6 | REJECTED | OBSERVED | Must not READY |
| A3 unstable collapse | REJECTED | OBSERVED | Must not READY |
| A8 overshoot→settle (661-shaped) | OBSERVED | READY | Positive control |

---

## 3. Numeric thresholds

**NUMERIC_THRESHOLD_CHANGE_JUSTIFIED=NO** — replay uses symbolic collapse caps (`maxPeakToSettledDropLiters=3`, ratio **0.35**) for sensitivity analysis only.

---

## 4. Candidate b27124fb…

**CURRENT_NATURAL_CANDIDATE_MUTATED=NO**
