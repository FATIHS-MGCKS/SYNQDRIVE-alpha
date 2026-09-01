# Tankstellenerkennung — Failed & Rejected Approaches

Preserve historical lessons. Distinguish **failed_approach** (tried and inadequate) from **rejected_approach** (governance/design rejection without full adoption).

## Failed approaches (graph: FST-FAIL-*)

### FST-FAIL-MAPBOX-LAZY-BACKFILL-001 — Mapbox reverse-geocode + lazy read backfill

| Field | Detail |
|-------|--------|
| **Era** | Early Energy Event location (PR #31, HISTORICAL) |
| **WHAT** | Generic reverse-geocoded location on energy events; lazy backfill on read |
| **WHY FAILED** | Non-deterministic, external dependency, no station-match confidence, conflated with event card |
| **SUPERSEDED BY** | FST-DEC-OSM-DATASET-001, FST-DEC-ASYNC-ENRICH-001, FST-DEC-READ-PERSISTED-001 |

### FST-FAIL-CREATEDAT-CUTOVER-001 — createdAt as cutover authority

| Field | Detail |
|-------|--------|
| **WHY FAILED** | Late-ingested historical events would be misclassified relative to operational occurrence |
| **CURRENT** | startTime authority (FST-DEC-STARTTIME-CUTOVER-001) |

### FST-FAIL-BULLMQ-LIFECYCLE-001 — BullMQ history as lifecycle authority

| Field | Detail |
|-------|--------|
| **WHY FAILED** | Jobs can be lost/replayed; business terminality must survive restarts |
| **CURRENT** | DB row + fingerprint (FST-DEC-DB-LIFECYCLE-001) |

### FST-FAIL-HTTP-RESOLVER-READ-001 — Resolver/PostGIS on HTTP or card read

| Field | Detail |
|-------|--------|
| **WHY FAILED** | Latency, cost, N+1 risk, non-deterministic reads |
| **CURRENT** | Persisted enrichment only (FST-DEC-READ-PERSISTED-001) |

### Forced nearest-station without confidence (implicit historical pattern)

| Field | Detail |
|-------|--------|
| **Classification** | failed_approach (design anti-pattern) |
| **WHY FAILED** | Would present false certainty; calibration FP rate 5.4% under strict matching |
| **CURRENT** | explicit NOT_FOUND / LOW / AMBIGUOUS outcomes |

### Historical REFUEL backfill

| Field | Detail |
|-------|--------|
| **Classification** | rejected by governance (FST-DEC-NO-BACKFILL-001) |
| **WHY REJECTED** | Mutates historical operational record semantics |

### Automatically recovering FAILED forever

| Field | Detail |
|-------|--------|
| **Classification** | failed_approach |
| **WHY FAILED** | Retry storms on permanent failures |
| **CURRENT** | FAILED terminal for same fingerprint (FST-DEC-FAILED-TERMINAL-001) |

## Rejected approaches (graph: FST-REJECT-*)

### FST-REJECT-WIDEN-RADIUS-001 — Widen search radius for quality

| Field | Detail |
|-------|--------|
| **STATUS** | REJECTED (calibration evidence) |
| **EVIDENCE** | 150/200/250/300m added **zero** correct matches beyond 100m primary |
| **NOTE** | 250m retained only as empty-primary fallback for sparse areas — not a quality upgrade |

## Synthetic production REFUEL for validation

| Field | Detail |
|-------|--------|
| **Classification** | rejected by governance |
| **RULE** | FST-INV-NO-SYNTHETIC-PROD-REFUEL-001; FST-DEC-REAL-REFUEL-E2E-001 |
