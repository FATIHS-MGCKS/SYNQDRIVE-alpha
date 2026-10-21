# Tankstellenerkennung — Historical Taxonomy (Rejected & Superseded)

Canonical machine-readable types:

| Type | Prefix | When to use |
|------|--------|-------------|
| **superseded_approach** | `FST-SUPERSEDED-*` | Older architecture/proposal replaced by current design; **not** an empirical runtime failure |
| **rejected_approach** | `FST-REJECT-*` | Design/governance alternative explicitly not adopted |
| **failed_approach** | `FST-FAIL-*` | Actually implemented/adopted and empirically shown inadequate (**none in current graph**) |

Do not use `FST-FAIL-*` as a generic bucket for “things we did not choose.”

## Superseded approaches (`FST-SUPERSEDED-*`)

### FST-SUPERSEDED-MAPBOX-LAZY-BACKFILL-001 — Mapbox reverse-geocode + lazy read backfill

| Field | Detail |
|-------|--------|
| **Era** | PR #31 proposal (OPEN, unmerged — `FST-EVID-PR-31-001`) |
| **Classification** | HISTORICAL + SUPERSEDED — production adoption **not established** |
| **SUPERSEDED BY** | FST-DEC-OSM-DATASET-001, FST-DEC-ASYNC-ENRICH-001, FST-DEC-READ-PERSISTED-001 |

## Rejected approaches (`FST-REJECT-*`)

### FST-REJECT-CREATEDAT-CUTOVER-001 — createdAt as cutover authority

Design alternative rejected — late-ingested historical events would be misclassified.

### FST-REJECT-BULLMQ-LIFECYCLE-001 — BullMQ history as lifecycle authority

Design alternative rejected — DB row + fingerprint is lifecycle source of truth.

### FST-REJECT-HTTP-RESOLVER-READ-001 — Resolver/PostGIS on HTTP or card read

Design alternative rejected — persisted enrichment read model only.

### FST-REJECT-FORCED-NEAREST-001 — Forced nearest station without confidence gates

Design alternative rejected — calibration FP rate 5.4%; would present false certainty.

### FST-REJECT-INFINITE-FAILED-RETRY-001 — Automatically recovering FAILED forever

Design alternative rejected — terminal_failed policy prevents retry storms.

### FST-REJECT-WIDEN-RADIUS-001 — Widen search radius for quality

Rejected by calibration — 150/200/250/300m added zero correct matches beyond 100m primary.

### FST-REJECT-HISTORICAL-BACKFILL-001 — Historical REFUEL automatic backfill

Governance rejection — FST-DEC-NO-BACKFILL-001.

### FST-REJECT-SYNTHETIC-PROD-REFUEL-001 — Synthetic production REFUEL for validation

Owner-confirmed governance — FST-DEC-REAL-REFUEL-E2E-001. Real-event observation remains open (`FST-GAP-REAL-POST-CUTOVER-REFUEL-001`).
