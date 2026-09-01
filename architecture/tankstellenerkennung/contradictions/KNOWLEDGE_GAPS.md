# Tankstellenerkennung — Knowledge Gaps

Canonical gap nodes referenced from markdown must exist in `graph/nodes.yaml`.

| ID | Gap | Severity | Blocks |
|----|-----|----------|--------|
| FST-GAP-REAL-POST-CUTOVER-REFUEL-001 | No natural post-cutover REFUEL has exercised full E2E match → persist → API → UI in production | **High** | PRODUCTION_VALIDATED on complete match path |

## Implicit gaps (not yet promoted to FST-GAP-*)

- Production GPS offset distribution (FST-HYP-GPS-OFFSET-001)
- OSM refresh re-enrichment policy (FST-HYP-OSM-REFRESH-001)
- Manual FAILED repair workflow
- Operational SLOs / observability thresholds
- Pre-Phase-B discovery history (explicitly UNKNOWN)

## Statement of record

**ARCHITECTURE DEPLOYED ≠ NATURAL POSITIVE PATH PRODUCTION-VALIDATED.**

As of 2026-09-01 production evidence: 16 pre-cutover REFUEL, 0 post-cutover REFUEL, 0 enrichment rows, queue empty, Phase E+F deployed.
