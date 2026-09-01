# Tankstellenerkennung — Open Questions

Indexed questions. Stable IDs must exist in `graph/nodes.yaml` when promoted to gaps/hypotheses.

| ID | Question | Epistemic |
|----|----------|-----------|
| FST-GAP-REAL-POST-CUTOVER-REFUEL-001 | When will the first real post-cutover REFUEL exercise match → persist → API → UI in production? | CONFIRMED gap |
| — | What is the real production GPS offset distribution at refuel sites? | UNKNOWN (see FST-HYP-GPS-OFFSET-001) |
| — | How should OSM dataset refresh interact with existing enrichment rows? | UNKNOWN (see FST-HYP-OSM-REFRESH-001) |
| — | Is Germany-only geographic scope sufficient for all tenants? | UNKNOWN |
| — | Should enrichment ever use end-coordinate or multi-point evidence instead of start only? | UNKNOWN |
| — | What is the manual repair path for terminal FAILED enrichment rows? | UNKNOWN |
| — | How do OSM relation/multipolygon/data-quality edge cases affect match rates in production? | UNKNOWN |
| — | What operational SLOs and alerting thresholds should govern enrichment failures/backlog? | UNKNOWN |
| — | What is the explicit upstream coordinate/timestamp contract from Energy Event detection? | INFERRED partial |
| — | What was the pre-Phase-B discovery history and decision trail? | UNKNOWN — not reconstructed |

## Rules

- Do not mark complete E2E path PRODUCTION_VALIDATED until FST-GAP-REAL-POST-CUTOVER-REFUEL-001 is resolved with natural production evidence.
- Do not fabricate synthetic production REFUEL events to close gaps.
