# Tankstellenerkennung — Failed & Rejected Approaches

Preserve historical lessons. Distinguish:

- **failed_approach** (`FST-FAIL-*`) — tried or seriously considered; inadequate or superseded
- **rejected_approach** (`FST-REJECT-*`) — governance/design rejection without full adoption
- **HISTORICAL + SUPERSEDED** — not necessarily an empirical runtime failure

## Superseded historical approaches (graph: FST-FAIL-*)

### FST-FAIL-MAPBOX-LAZY-BACKFILL-001 — Mapbox reverse-geocode + lazy read backfill

| Field | Detail |
|-------|--------|
| **Era** | Early Energy Event location (PR #31, OPEN/unmerged — `FST-EVID-PR-31-001`) |
| **WHAT** | Generic reverse-geocoded location on energy events; lazy backfill on read |
| **Classification** | HISTORICAL + SUPERSEDED — not an empirical failure of current system |
| **WHY SUPERSEDED** | Non-deterministic, external dependency, no station-match confidence |
| **SUPERSEDED BY** | FST-DEC-OSM-DATASET-001, FST-DEC-ASYNC-ENRICH-001, FST-DEC-READ-PERSISTED-001 |

### FST-FAIL-CREATEDAT-CUTOVER-001 — createdAt as cutover authority

| Field | Detail |
|-------|--------|
| **Classification** | HISTORICAL + SUPERSEDED |
| **WHY SUPERSEDED** | Late-ingested historical events would be misclassified |
| **CURRENT** | startTime authority (FST-DEC-STARTTIME-CUTOVER-001) |

### FST-FAIL-BULLMQ-LIFECYCLE-001 — BullMQ history as lifecycle authority

| Field | Detail |
|-------|--------|
| **Classification** | HISTORICAL + SUPERSEDED |
| **WHY SUPERSEDED** | Jobs can be lost/replayed; business terminality must survive restarts |
| **CURRENT** | DB row + fingerprint (FST-DEC-DB-LIFECYCLE-001) |

### FST-FAIL-HTTP-RESOLVER-READ-001 — Resolver/PostGIS on HTTP or card read

| Field | Detail |
|-------|--------|
| **Classification** | HISTORICAL + SUPERSEDED |
| **WHY SUPERSEDED** | Latency, cost, N+1 risk, non-deterministic reads |
| **CURRENT** | Persisted enrichment only (FST-DEC-READ-PERSISTED-001) |

### FST-FAIL-FORCED-NEAREST-001 — Forced nearest station without confidence gates

| Field | Detail |
|-------|--------|
| **Classification** | HISTORICAL + SUPERSEDED design anti-pattern |
| **WHY SUPERSEDED** | Would present false certainty; calibration FP rate 5.4% under strict matching |
| **CURRENT** | explicit NOT_FOUND / LOW / AMBIGUOUS outcomes (FST-DEC-PRECISION-RESOLVER-001) |

### FST-FAIL-INFINITE-FAILED-RETRY-001 — Automatically recovering FAILED forever

| Field | Detail |
|-------|--------|
| **Classification** | HISTORICAL + SUPERSEDED |
| **WHY SUPERSEDED** | Retry storms on permanent failures |
| **CURRENT** | FAILED terminal for same fingerprint (FST-DEC-FAILED-TERMINAL-001) |

## Rejected approaches (graph: FST-REJECT-*)

### FST-REJECT-WIDEN-RADIUS-001 — Widen search radius for quality

| Field | Detail |
|-------|--------|
| **STATUS** | REJECTED (calibration evidence) |
| **EVIDENCE** | 150/200/250/300m added **zero** correct matches beyond 100m primary |
| **NOTE** | 250m retained only as empty-primary fallback for sparse areas — not a quality upgrade |

### FST-REJECT-HISTORICAL-BACKFILL-001 — Historical REFUEL automatic backfill

| Field | Detail |
|-------|--------|
| **STATUS** | REJECTED (governance) |
| **WHY REJECTED** | Mutates historical operational record semantics |
| **CURRENT** | FST-DEC-NO-BACKFILL-001 |

### FST-REJECT-SYNTHETIC-PROD-REFUEL-001 — Synthetic production REFUEL for validation

| Field | Detail |
|-------|--------|
| **STATUS** | REJECTED (owner-confirmed governance) |
| **RULE** | FST-INV-NO-SYNTHETIC-PROD-REFUEL-001; FST-DEC-REAL-REFUEL-E2E-001 |
| **NOTE** | Policy confirmed; real-event observation remains open (FST-GAP-REAL-POST-CUTOVER-REFUEL-001) |
