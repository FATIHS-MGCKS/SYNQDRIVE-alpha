# G1.2c Finality + Ambiguity Closure — Audit

**Date:** 2026-09-04  
**Branch:** `cursor/refuel-physical-event-forensics-f21f`  
**PR:** #1531 (DRAFT)  
**origin/main:** `57ec14eabed06df0bf32e7a7a69e9ebe0c53fc88`  
**G1.2b head (before G1.2c):** `f469e5c9b16d7f85ddf6c41250196250c27e79e4`  
**G1.2c head:** _(recorded at commit)_

## Problem statement

Independent review of G1.2b found four semantic gaps:

| ID | Defect |
|----|--------|
| A | `FINAL_CANONICAL` declared when `group.length > 1` — 2→3+ sibling race |
| B | Greedy clique partition could split non-transitive components by UUID order |
| C | Settlement clock could fall back to provider `endTime` |
| D | Test gate language overstated breadth of validation |

## Old G1.2b behavior

- Multi-row SAME → immediate `FINAL_CANONICAL` + enrichment eligible
- `partitionPhysicalRefuelGroups()` greedy placement after lexicographic sort
- `defaultFirstSeenMap()` fell back to `new Date(row.endTime).getTime()`
- Reported `ALL_RELEVANT_TESTS=PASS` from 51 targeted suites only

## New G1.2c settlement state machine

| State | Enrichment eligible? | When |
|-------|---------------------|------|
| PROVISIONAL | No | Singleton, window open |
| SETTLING | No | Multi-row valid clique, window open |
| FINAL_CANONICAL | Yes (canonical only) | Valid clique, window closed |
| FINAL_DISTINCT | Yes (singleton) | Singleton, window closed |
| INSUFFICIENT_EVIDENCE | No | Ambiguous / missing observation / late sibling conflict |

**Invariant:** `WHILE_SETTLEMENT_WINDOW_OPEN → ZERO FINAL ENRICHMENT ELIGIBILITY`

Window closes at: `max(firstObservedAt in group) + settlementHorizonMs` (default 60m INFERRED).

## Settlement clock authority

```
SETTLEMENT CLOCK AUTHORITY = SYNQDRIVE SYSTEM OBSERVATION TIME (firstObservedAt)
NOT PROVIDER EVENT TIME (startTime / endTime / DIMO segment timestamps)
```

- `firstObservedAtById` required — no silent `endTime` fallback
- Missing observation → `INSUFFICIENT_EVIDENCE` / `missing_system_observation_time`

## Identity component algorithm

1. Build pairwise identity matrix (`classifyPhysicalRefuelSibling` for all pairs)
2. Find connected components via SAME edges only
3. For each component with size > 1:
   - If any pair is DISTINCT or INSUFFICIENT → fail closed (`AMBIGUOUS_NON_TRANSITIVE` or `PAIRWISE_INSUFFICIENT`)
   - If complete clique but external INSUFFICIENT pair could merge groups → fail closed
4. Valid complete cliques proceed to settlement

**Non-transitive `A~B, B~C, A!~C`:** single ambiguous component → `INSUFFICIENT_EVIDENCE`, zero enrichment. **Not** split into `[A,B]+[C]` by ID order.

## Late sibling contract

After `FINAL_DISTINCT` or `FINAL_CANONICAL` enrichment, a late sibling with SAME or INSUFFICIENT relation to a finalized row → `late_sibling_after_finalization`, zero enrichment. G2 operational recovery required; no automatic rewrite in G1.2c.

## Mixed-vehicle contract

`buildPairwiseIdentityMatrix` rejects batches with multiple `vehicleId` values → `mixed_vehicle_batch`.

## Canonical selection (unchanged G1.2b)

Evidence-based `compareCanonicalRefuelCandidates`; Sept04 canonical remains Event A.

## Coordinate policy (unchanged G1.2b)

`fuelRiseOnsetAt` lookback authority; Event B alone selects Esso forecourt region.

## Test evidence

### TARGETED_G12C_TESTS

```bash
cd backend && npm test -- --testPathPattern="physical-refuel|refuel-sibling-reconciliation.sept04" --no-coverage
```

| Result | Count |
|--------|-------|
| Suites passed | 6 |
| Tests passed | 64 |
| Tests failed | 0 |

### BROADER_REFUEL_REGRESSIONS

```bash
cd backend && npm test -- --testPathPattern="fuel-station|refuel-sibling|energy-events\.(service|pipeline)" --no-coverage
```

| Result | Count |
|--------|-------|
| Suites passed | 21 (1 skipped) |
| Tests passed | 140 |
| Tests failed | 0 |

### TYPECHECK_OR_BUILD

```bash
cd backend && npm run build
```

**PASS**

### Graph validators

```bash
bash architecture/tankstellenerkennung/scripts/validate-graph.sh
node architecture/knowledge-graphs/energy-event-detection/scripts/validate-graph.mjs
```

**PASS** (both)

## Knowledge graph IDs

- `FST-EVID-G12C-FINALITY-AMBIGUITY-CLOSURE-2026-09-04-001`
- `FST-DEC-SETTLEMENT-OBSERVATION-TIME-001`
- `FST-DEC-SETTLING-MULTIROW-FINALITY-001`
- `FST-DEC-NON-TRANSITIVE-FAIL-CLOSED-001`
- `FST-DEC-LATE-SIBLING-RECOVERY-CONFLICT-001`
- `EED-EV-0030` + parallel EED decisions

## Remaining OPEN uncertainties

- Settlement horizon fleet calibration (60m INFERRED)
- G2 operational recovery for late-sibling conflicts
- Production `firstObservedAt` field binding (likely `createdAt` at persist — G2 wiring)

## Readiness gates

| Gate | Result |
|------|--------|
| SETTLEMENT_CLOCK_SYSTEM_OBSERVATION_AUTHORITY | YES |
| MULTI_ROW_GROUP_PREMATURE_FINALITY_CLOSED | YES |
| SETTLING_STATE_REACHABLE_AND_TESTED | YES |
| TWO_TO_THREE_SIBLING_RACE_CLOSED | YES |
| NON_TRANSITIVE_COMPONENT_FAIL_CLOSED | YES |
| PAIRWISE_INSUFFICIENT_EVIDENCE_FAIL_CLOSED | YES |
| IDENTITY_NOT_DECIDED_BY_UUID_ORDER | YES |
| LATE_SIBLING_DUPLICATE_ENRICHMENT_FAIL_CLOSED | YES |
| MIXED_VEHICLE_BATCH_FAIL_CLOSED | YES |
| CANONICAL_COMPARATOR_DIMENSION_SAFE | YES |
| SEPT04_IDENTITY_REGRESSION | PASS |
| SEPT04_COORDINATE_REGRESSION | PASS |
| TARGETED_G12C_TESTS | PASS |
| BROADER_REFUEL_REGRESSIONS | PASS |
| TYPECHECK_OR_BUILD | PASS |
| FST_GRAPH_VALIDATOR | PASS |
| EED_GRAPH_VALIDATOR | PASS |
| PRODUCTION_MUTATED | NO |
| PRODUCTION_RUNTIME_CHANGED | NO |
| PR_1531_STILL_DRAFT | YES |
| G2_IMPLEMENTATION_READY | YES |
| PRODUCTION_DEPLOYMENT_READY | NO |
