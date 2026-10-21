# EXP-021 — Upper-Bound Cadence Calibration (Prospective Design)

**Date:** 2026-09-11  
**Plan version:** `EXP021_UPPER_BOUND_V2`  
**Status:** **PROSPECTIVE** — implementation prepared; **no physical run executed**  
**Supersedes (as default next-run plan):** `EXP021_LOWER_BOUND_V1` (60→30→20→10)

---

## Scientific question shift

| | Prior design (`LOWER_BOUND_V1`) | New design (`UPPER_BOUND_V2`) |
|---|--------------------------------|-------------------------------|
| **Question** | Does faster polling (10/20/30 vs 60) reveal benefit? | How slow can HF historical polling become beyond 60s without materially degrading evidence? |
| **Sequence** | 60 → 30 → 20 → 10 | **180 → 120 → 60 → 30 (CONTROL)** |
| **Nominal duration** | ~300s MOVING per phase (unbounded wall risk) | **33 min** wall-clock after canonical T0 |
| **Max designed duration** | Operator guidance ≥45 min (INFERRED) | **35 min** hard ceiling (+2 min total grace budget) |

**Epistemic:** No demonstrated benefit sufficient to justify prioritizing 10s/20s in the next experiment. This does **not** claim 10s/20s are useless — only that upper-bound exploration is now more informative.

---

## Phase plan (canonical T0 = T)

| Phase | Cadence | Nominal wall | Role | Min successful requests |
|-------|---------|--------------|------|----------------------|
| 1 | 180s | 15 min (T+00:00 → T+15:00) | EXPERIMENTAL | ≥5 |
| 2 | 120s | 10 min (T+15:00 → T+25:00) | EXPERIMENTAL | ≥5 |
| 3 | 60s | 5 min (T+25:00 → T+30:00) | EXPERIMENTAL | ≥5 |
| 4 | 30s | 3 min (T+30:00 → T+33:00) | **CONTROL** | ≥5 |

**30s is an intra-run comparison anchor — not production policy.**

---

## Phase advancement authority

- **UPPER_BOUND_V2:** `WALL_CLOCK` — advance when `targetDurationMs` elapses from effective physical phase start.
- **LOWER_BOUND_V1 (historical):** `MOVING_ACCUMULATION` — advance when ≥300s valid MOVING (legacy `EXP021_PHASE_DURATION_MS`).
- **Grace:** ≤2 min total run budget (`totalGraceBudgetMs`); not used to compensate for a missed 180s polling opportunity.
- **Degraded classifications:** `DEGRADED_INSUFFICIENT_REQUESTS`, `DEGRADED_LOW_MOVEMENT`, `INVALID_RUNTIME_FAILURE` — no fabricated validity.

---

## Unchanged invariants

| Invariant | Value |
|-----------|-------|
| HF bucket aggregation | `1s` (`HF_BUCKET_AGGREGATION_INTERVAL`) — **unchanged** |
| Settlement mandatory ages | +30, +60, +120, +180, +300, +600 s |
| Native temporal evidence | `EXP021_NATIVE_TEMPORAL_v1` per sealed phase |
| Value revision channel | `bucketValueSnapshots`, metadata-free `valueContentHash` |
| Production fleet HF | **unchanged** — Reference Capture experimental scope only |
| Trip FSM | **unchanged** — separate workstream |

---

## Historical evidence preserved

KS MS 661 physical run remains **60 → 30 → 20 partial → 10 missing** under `EXP021_LOWER_BOUND_V1`. Historical records are **not** rewritten.

Env override: `EXP021_CALIBRATION_PLAN=LOWER_BOUND_V1` (or `60_30_20_10`) for legacy replay semantics.

---

## Request-rate planning arithmetic (not DIMO limits)

| Cadence | ~req/min/vehicle | ~req/sec/1000 vehicles |
|---------|------------------|------------------------|
| 30s | 2.0 | 33.33 |
| 60s | 1.0 | 16.67 |
| 120s | 0.5 | 8.33 |
| 180s | 0.33 | 5.56 |

---

## Implementation references

- `reference-capture-exp021-calibration-plan.lib.ts` — plan authority
- `reference-capture-exp021-upper-bound-calibration.spec.ts` — regression tests
- `EXP021_CALIBRATION_PLAN` env (default `UPPER_BOUND_V2`)

---

## Readiness (this document only)

| Flag | Value |
|------|-------|
| `READY_TO_MERGE_EXPERIMENT_DESIGN` | Pending CI on implementation PR |
| `READY_TO_DEPLOY` | **NO** |
| `READY_TO_ARM_PHYSICAL_RUN` | **NO** |
| `PHYSICAL_RUN_STARTED` | **NO** |
