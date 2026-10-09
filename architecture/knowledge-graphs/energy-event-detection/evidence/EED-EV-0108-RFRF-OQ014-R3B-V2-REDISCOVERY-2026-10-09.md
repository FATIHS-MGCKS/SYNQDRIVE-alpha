# EED-EV-0108 — RFRF OQ-014 R3B v2→v2 physical candidate identity & rediscovery

**Classification:** CODE+TEST (matcher authority — activation still OFF)  
**Date:** 2026-10-09  
**Status:** R3B wired — **no detector/runtime version bump**, **no Production activation**

## Problem

Same physical rise under `rfrf-rise-v2` may revise `SETTLED_MEDIAN` after delayed telemetry. Legacy same-version matcher treated incompatible post plateaus (both above pre) as `DISTINCT_PHYSICAL_RISE`, risking duplicate v2 candidates.

## Final safety closure (PR #1952)

- `resolveOrCreateCandidate` — v2→v2 `INSUFFICIENT_EVIDENCE` neighbors route to `RAW_REFUEL_CANDIDATE_V2_REDISCOVERY_INSUFFICIENT_EVIDENCE` (no silent insufficient reconcile)
- Identity-key fallback requires semantic `SAME_PHYSICAL_RISE` for v2→v2 (no key-only bypass)
- Settled path requires **explicit** `SETTLED_MEDIAN` on both sides; non-settled v2 pairs delegate to legacy F2 same-version matcher
- Rise episode anchors required (onset + end); removed ad-hoc post-delta contradiction threshold

## Change

- `raw-refuel-candidate-v2-same-version-rediscovery.authority.ts` — fail-closed v2→v2 reconciliation when:
  - same org/vehicle/channel
  - compatible pre plateau + FRESH baseline recency on both sides
  - physical neighborhood + rise episode anchors
  - explicit `SETTLED_MEDIAN` + `SAME_AUTHORITY`
  - matching `rfrf-candidate-physical-identity-v1` digest
  - no contradictory settled-post terminal evidence
- `classifySameVersionRawRefuelCandidateOverlap` delegates v2 pairs to R3B authority; **v1→v1 semantics unchanged**
- R2 v2→v1 cross-version path **unchanged**

## Evidence

| Artifact | Role |
|----------|------|
| `raw-refuel-candidate-v2-rediscovery.matcher.spec.ts` | M1–M6 unit matrix |
| `raw-refuel-candidate-r3b-v2-rediscovery.postgres.integration.spec.ts` | PG-R3B-1..6 (`ONE_PHYSICAL_REFUEL_ONE_CANDIDATE`, concurrency, KS661 canonical) |
| `rfrf-f4-pr2-runtime-postgres-gate.sh` | Stage-3 gate runs R3B matcher + PG suite |

## Explicit non-effects

- KS MS 661 canonical candidate UUID `b27124fb-64c3-478d-8077-200751af2863` — v2→v1 reconciliation only; identity key assignment rules unchanged
- Hybrid Trust v2, F3 terminal precedence, baseline recency policy, tenant isolation, promotion authorization — preserved
- OQ-014 **OPEN**; OQ-019 **PARTIALLY_RESOLVED**

## Validation commands

```bash
cd backend && npm test -- raw-refuel-candidate-v2-rediscovery.matcher.spec.ts --runInBand
RAW_REFUEL_CANDIDATE_POSTGRES_INTEGRATION=1 npm test -- raw-refuel-candidate-r3b-v2-rediscovery.postgres.integration.spec.ts --runInBand
bash scripts/test/rfrf-f4-pr2-runtime-postgres-gate.sh
```
