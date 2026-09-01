# Tankstellenerkennung — Open Questions

Indexed questions. Stable IDs must exist in `graph/nodes.yaml` when promoted to gaps/hypotheses.

| ID | Question | Epistemic |
|----|----------|-----------|
| FST-GAP-REAL-POST-CUTOVER-REFUEL-001 | When will the first real post-cutover REFUEL exercise match → persist → API → UI in production? | CONFIRMED gap |
| FST-GAP-GERMANY-SCOPE-001 | Is Germany-only geographic scope sufficient for all tenants? | UNKNOWN |
| FST-GAP-SINGLE-COORD-POLICY-001 | Should enrichment ever use end-coordinate or multi-point evidence instead of start only? | UNKNOWN |
| FST-GAP-MANUAL-FAILED-REPAIR-001 | What is the manual repair path for terminal FAILED enrichment rows? | UNKNOWN |
| FST-GAP-OSM-DATA-QUALITY-001 | How do OSM relation/multipolygon/data-quality edge cases affect match rates in production? | UNKNOWN |
| FST-GAP-PRODUCTION-SLO-001 | What operational SLOs and alerting thresholds should govern enrichment failures/backlog? | UNKNOWN |
| FST-GAP-UPSTREAM-COORD-CONTRACT-001 | What is the explicit upstream coordinate/timestamp contract from Energy Event detection? | INFERRED partial |
| FST-GAP-PRE-PHASE-B-DISCOVERY-001 | What was the pre-Phase-B discovery history and decision trail? | UNKNOWN |
| FST-HYP-GPS-OFFSET-001 | What is the real production GPS offset distribution at refuel sites? | UNKNOWN |
| FST-HYP-OSM-REFRESH-001 | How should OSM dataset refresh interact with existing enrichment rows? | UNKNOWN |

## Rules

- Do not mark complete E2E path PRODUCTION_VALIDATED until FST-GAP-REAL-POST-CUTOVER-REFUEL-001 is resolved with natural production evidence.
- Do not fabricate synthetic production REFUEL events to close gaps (FST-DEC-REAL-REFUEL-E2E-001 — confirmed governance).
