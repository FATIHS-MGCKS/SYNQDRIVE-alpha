# EXP-021 — Provider Idempotence Preflight (EXP-019 interval)

**Date:** 2026-09-07  
**Type:** EXP-021-PREFLIGHT (read-only, no drive)  
**Script:** `exp-021-idempotence-preflight.cjs`  
**VPS artifact:** `/tmp/exp-021/idempotence-preflight.json`

---

## Test

Fixed settled interval (already closed from EXP-019):

| Field | Value |
|-------|-------|
| `from` | `2026-09-07T04:40:00.000Z` |
| `to` | `2026-09-07T04:41:00.000Z` |
| `interval` | `1s` |
| Field | `speed(agg: AVG)` |

Three identical queries executed back-to-back (Q1 → Q2 → Q3, 500ms spacing).

---

## Results

| Query | `requestStartedAt` (UTC) | Rows | Unique buckets |
|-------|---------------------------|------|----------------|
| Q1 | `2026-09-07T17:49:02.695Z` | 20 | 20 |
| Q2 | `2026-09-07T17:49:03.639Z` | 20 | 20 |
| Q3 | `2026-09-07T17:49:04.402Z` | 20 | 20 |

| Pair | Jaccard similarity |
|------|-------------------|
| Q1 ↔ Q2 | **1.0** |
| Q2 ↔ Q3 | **1.0** |
| Q1 ↔ Q3 | **1.0** |

```
IDENTICAL_QUERY_STABILITY_TEST_EXECUTED = YES
IDENTICAL_QUERY_RESULT_STABILITY = IDENTICAL
```

**Interpretation:** For a fully settled interval queried today, DIMO returns **stable bucket identity sets** across immediate repeats. EXP-021 maturation curves will measure **age-after-close**, not provider churn on identical parameters.

---

## Cross-link

Full experiment design: `EXP_021_SETTLEMENT_SHADOW_EXPERIMENT_DESIGN_2026-09-07.md`
