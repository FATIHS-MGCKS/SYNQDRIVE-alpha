# Tankstellenerkennung — Open Hypotheses

Hypotheses are not decisions. Promote to decision only after explicit validation.

| ID | Hypothesis | Status |
|----|------------|--------|
| FST-HYP-GPS-OFFSET-001 | Production refuel GPS offsets may be wider than calibration probe distribution, increasing NOT_FOUND/LOW rates | UNKNOWN |
| FST-HYP-OSM-REFRESH-001 | Future OSM dataset_version promotion may require explicit re-enrichment policy for existing rows | UNKNOWN |

## Disproven / rejected hypotheses (see decisions)

| Hypothesis | Outcome | Reference |
|------------|---------|-----------|
| Widening fallback radius beyond 100m improves correct match count | **Rejected** by calibration | FST-REJECT-WIDEN-RADIUS-001 |
| createdAt can serve as cutover authority | **Failed** approach | FST-FAIL-CREATEDAT-CUTOVER-001 |
| Forced nearest station without confidence gates improves UX | **Failed** approach (historical) | See FAILED_APPROACHES.md |
