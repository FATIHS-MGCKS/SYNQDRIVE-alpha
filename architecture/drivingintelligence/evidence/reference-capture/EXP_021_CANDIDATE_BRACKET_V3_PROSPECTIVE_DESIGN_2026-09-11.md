# EXP-021 — Candidate Bracket V3 (Prospective Design)

**Date:** 2026-09-11  
**Plan version:** `EXP021_CANDIDATE_BRACKET_V3`  
**Registry key:** `CANDIDATE_BRACKET_V3`  
**planId:** `candidate_bracket_v3`  
**Status:** **PROSPECTIVE** — implementation prepared; **no physical run executed**  
**Selection:** `EXP021_CALIBRATION_PLAN=CANDIDATE_BRACKET_V3` (explicit arm procedure; **not** default)

---

## Scientific question

Where is the practical production sweet spot between **120s**, **90s**, and **60s** for trip reconstruction quality versus HF historical request load?

Equal 10-minute wall phases enable direct comparison under identical phase duration.

---

## Historical vs prospective plans

| Plan | Sequence | Role |
|------|----------|------|
| **LOWER_BOUND_V1** (historical) | 60→30→20→10 | LEGACY MOVING accumulation |
| **UPPER_BOUND_V2** (historical default env) | 180→120→60→30 CONTROL | Upper-bound exploration; 180s adverse evidence accumulated |
| **CANDIDATE_BRACKET_V3** (prospective) | **120→90→60** | Sweet-spot bracket; all EXPERIMENTAL |

**180s is historical evidence only** — not deleted, not repurposed. UPPER_BOUND_V2 remains parseable and unchanged.

**90s epistemic state:** `UNKNOWN` / `PROSPECTIVE` until first valid physical run.

---

## Phase plan (canonical T0 = T)

| Phase | Cadence | Nominal wall | Role | Expected request slots |
|-------|---------|--------------|------|------------------------|
| 1 | 120s | 10 min | EXPERIMENTAL | 5 |
| 2 | 90s | 10 min | EXPERIMENTAL | 7 |
| 3 | 60s | 10 min | EXPERIMENTAL | 10 |

**Total expected slots:** 22  
**Nominal run:** 30 min  
**Hard max:** 32 min (+2 min grace budget)  
**Advancement:** `WALL_CLOCK`

No repeated 120s control phase — duplicate cadence would be ambiguous under `findPhaseSpecByCadence`.

---

## Settlement geometry (full-phase overlapping)

Per 10-minute phase (60s windows, 30s step, 6 mandatory ages):

| Metric | Value |
|--------|-------|
| Source windows per phase | 19 |
| Total source windows | 57 |
| Settlement observations | 342 |
| Synthetic gap assessability target | ≥90% (implementation: 100% in synthetic matrix) |

---

## Decision framework (no preselected winner)

1. If 120s reconstruction quality is materially equivalent to 90s/60s with fewer requests → prefer **120s**.
2. If 90s materially improves reconstruction vs 120s but matches 60s → prefer **90s**.
3. If 60s materially and reproducibly improves useful reconstruction vs both → prefer **60s**.

Use gap distribution, worst-case gaps, settlement maturation, value revision, and **reconstruction quality** — not bucket count alone.

---

## Reconstruction-quality analyzer

Read-only experimental analysis per phase (`reference-capture-exp021-reconstruction-quality-analyzer.ts`):

- **Ready:** bucket/gap metrics, temporal continuity proxy, slot ledger stats
- **Pending:** read-only adapter over `TripRouteChunkedMatcher` for matched geometry, stop detection continuity, map-matching confidence/fallback classification

Does **not** modify production trip FSM or map matching.

---

## Implementation references

- `reference-capture-exp021-calibration-plan.lib.ts` — `EXP021_CANDIDATE_BRACKET_V3`
- `reference-capture-exp021-candidate-bracket-v3.spec.ts` — plan/slot/settlement regression
- `reference-capture-exp021-reconstruction-quality-analyzer.ts` — post-run comparison scaffold
- `HF_POLL_CALIBRATION_CANDIDATES_MS` — includes `90000`
