# Tankstellenerkennung — Knowledge Gaps

Canonical gap nodes referenced from markdown must exist in `graph/nodes.yaml`.

| ID | Gap | Severity | Blocks |
|----|-----|----------|--------|
| FST-GAP-REAL-POST-CUTOVER-REFUEL-001 | No natural post-cutover REFUEL has exercised full E2E match → persist → API → UI in production | **High** | PRODUCTION_VALIDATED on complete match path |
| FST-GAP-GERMANY-SCOPE-001 | Germany-only OSM dataset; international tenant scope unknown | Medium | International expansion planning |
| FST-GAP-MANUAL-FAILED-REPAIR-001 | No manual repair workflow for terminal FAILED enrichment rows | Medium | Ops recovery for permanent failures |
| FST-GAP-SINGLE-COORD-POLICY-001 | V1 uses single start coordinate only; multi-point evidence undecided | Low | Future coordinate policy |
| FST-GAP-OSM-DATA-QUALITY-001 | OSM relation/multipolygon/data-quality edge cases in production | Medium | Match rate confidence |
| FST-GAP-PRODUCTION-SLO-001 | No production SLO / alerting thresholds for enrichment | Medium | Operational maturity |
| FST-GAP-UPSTREAM-COORD-CONTRACT-001 | Explicit upstream coordinate/timestamp contract with Energy Events | Medium | Cross-domain correctness |
| FST-GAP-PRE-PHASE-B-DISCOVERY-001 | Pre-Phase-B discovery history not reconstructed | Low | Historical completeness |

## Linked hypotheses

| Hypothesis | Related gap |
|------------|-------------|
| FST-HYP-GPS-OFFSET-001 | FST-GAP-REAL-POST-CUTOVER-REFUEL-001 |
| FST-HYP-OSM-REFRESH-001 | FST-GAP-OSM-DATA-QUALITY-001 |

## Statement of record

**ARCHITECTURE DEPLOYED ≠ NATURAL POSITIVE PATH PRODUCTION-VALIDATED.**

As of 2026-09-01 production evidence (`FST-EVID-PROD-DEPLOY-001`): 16 pre-cutover REFUEL, 0 post-cutover REFUEL, 0 enrichment rows, queue empty, Phase E+F deployed.

**Policy (confirmed):** do not manufacture synthetic production REFUEL (`FST-DEC-REAL-REFUEL-E2E-001`, `FST-REJECT-SYNTHETIC-PROD-REFUEL-001`).

**Evidence gap (open):** await natural post-cutover REFUEL.
