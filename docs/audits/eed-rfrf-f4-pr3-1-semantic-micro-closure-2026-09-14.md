# RFRF F4-PR3.1 — Semantic Micro-Closure (SAME + INSUFFICIENT Fail-Closed)

**Workstream:** Raw Fuel Refuel Fallback (RFRF)  
**Phase:** F4-PR3.1 — Advisory aggregate classification hardening  
**Date:** 2026-09-14  
**Starting HEAD:** `664399d7088590b9554534bcdf4fc75a997ba104`  
**PR:** #1637 (`cursor/eed-rfrf-f4-pr3-ready-promotion-gate-f21f`)  

---

## Executive verdict

```
RFRF_F4_PR3_1_SEMANTIC_MICRO_CLOSURE = PASS (pending exact-head CI)
SAME_PLUS_INSUFFICIENT_FAILS_CLOSED = YES
F4_NATIVE_OVERLAP_CLASSIFICATION = ADVISORY_ONLY
F5_CONVERGENCE_IMPLEMENTED = NO
PRODUCTION_MUTATED = NO
```

---

## Discovered defect

Independent review found that `classifyRawRefuelNativeOverlapAdvisory()` could classify:

- exactly **one** SAME native sibling, and  
- one or more **INSUFFICIENT_EVIDENCE** native siblings  

as aggregate advisory `SAME`.

That is **not** sufficiently fail-closed: an unresolved overlapping native sibling may represent another physical refuel or ambiguous identity. F4 must not collapse the native-neighbor set to a clean single-SAME conclusion when any sibling remains inconclusive.

---

## Old precedence (reproduced)

After vehicle filtering, classification checked `sameNativeEventIds.length === 1` **before** considering insufficient siblings:

| Scenario | Old result |
|----------|------------|
| F — SAME + INSUFFICIENT | `SAME` (bug) |
| H — SAME + DISTINCT + INSUFFICIENT | `SAME` (bug) |
| G — SAME + DISTINCT (no INSUFFICIENT) | `SAME` (correct) |

Foreign-only rows could also yield `DISTINCT` because empty input was not distinguished from filtered-empty.

---

## Corrected precedence

Aggregate semantics (advisory only; F5 owns authoritative convergence):

1. **>1 SAME** → `AMBIGUOUS_MULTIPLE_SAME`
2. **Exactly 1 SAME AND ≥1 INSUFFICIENT** → fail closed → `INSUFFICIENT_EVIDENCE` (`same_with_insufficient_native_siblings`)
3. **Exactly 1 SAME, zero INSUFFICIENT** → `SAME`
4. **Zero SAME, ≥1 INSUFFICIENT** → `INSUFFICIENT_EVIDENCE`
5. **Zero SAME, zero INSUFFICIENT, ≥1 DISTINCT** → `DISTINCT`
6. **Zero relevant siblings** (empty or foreign-only after filter) → `NO_NATIVE_SIBLINGS`

`INSUFFICIENT_EVIDENCE` aggregate reused — no enum expansion.

Promotion eligibility unchanged: `INSUFFICIENT_EVIDENCE` → `AMBIGUOUS` (fail-closed); `SAME` → `BLOCKED_NATIVE_OVERLAP_REVIEW`.

---

## Test matrix

Unit (`raw-refuel-native-overlap.advisory.spec.ts`): A–I aggregate cases + foreign-vehicle hardening + eligibility fail-closed for SAME+INSUFFICIENT.

Real PostgreSQL (`raw-fuel-refuel-fallback-runtime-pr3.postgres.integration.spec.ts`):

- **S** — persisted fallback candidate + native SAME + native INSUFFICIENT → advisory ≠ SAME; eligibility `AMBIGUOUS`; zero fallback VEE; zero PROMOTED; candidate preserved
- **T** — SAME + DISTINCT without INSUFFICIENT → clean `SAME` (no overcorrection)

Gate script: `backend/scripts/test/rfrf-f4-pr3-ready-promotion-gate.sh` (dynamic test count from executed suite).

---

## Blocker taxonomy correction

These are **F5 entry blockers**, not F4-PR3 implementation blockers:

1. Synthetic dimoSegmentId fleet compatibility proof  
2. G2 native↔fallback convergence matrix  
3. Late-native sibling policy  

```
KNOWN_P0_F4_PR3_BLOCKERS = 0
KNOWN_P1_F4_PR3_BLOCKERS = 0
KNOWN_P1_F5_ENTRY_BLOCKERS = 3
```

F4-PR4 may begin only after PR #1637 review/merge.

---

## Hard invariants (unchanged)

- `F4_FALLBACK_VEE_UPSERT_REACHABLE = NO`
- `FALLBACK_VEE_CREATED = 0`
- `PROMOTED_TRANSITION_REACHABLE_FROM_F4 = NO`
- `F5_CONVERGENCE_IMPLEMENTED = NO`
- No G2/BullMQ/production/flag/backfill changes

---

## Epistemic status

| Claim | Status |
|-------|--------|
| SAME+INSUFFICIENT aggregate gap reproduced | CONFIRMED |
| Fail-closed fix in advisory classifier | CONFIRMED (code + unit) |
| Real PG proof S/T | PROVEN_BY_INTEGRATION_TEST (gate) |
| F5 convergence | NOT_IMPLEMENTED |
