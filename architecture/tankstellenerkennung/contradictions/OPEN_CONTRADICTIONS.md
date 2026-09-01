# Tankstellenerkennung — Open Contradictions

No active contradictions recorded at bootstrap V1.

| ID | Claim A | Claim B | Status |
|----|---------|---------|--------|
| — | — | — | — |

## How to record a contradiction

1. Add node `FST-CONTRA-*` to `graph/nodes.yaml` with `epistemic_status: CONTRADICTED`
2. Document both claims with evidence references
3. Link via `contradicts` edges in `graph/edges.yaml`
4. Do not resolve silently — supersede with explicit decision when resolved

## Near-miss (not a contradiction)

- **Deploy success vs E2E validation**: Production deploy reports PASS while no enriched REFUEL exists. This is an **epistemic gap** (FST-GAP-REAL-POST-CUTOVER-REFUEL-001), not a logical contradiction — both claims can be true simultaneously.
