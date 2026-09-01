# Tankstellenerkennung — Decision Register

Scientific record for canonical decisions. Graph nodes: `FST-DEC-*`. Full fields per [AGENT_CONTRACT.md](../AGENT_CONTRACT.md).

---

## FST-DEC-OSM-DATASET-001 — Local versioned OSM/PostGIS dataset

| Field | Value |
|-------|-------|
| **STATUS** | PRODUCTION_VALIDATED (dataset infrastructure) |
| **BEFORE** | Generic reverse-geocoded Energy Event locations (Mapbox-era, PR #31) |
| **WHY** | Deterministic offline matching, tenant-safe, no per-read external geocoding dependency |
| **CHANGE** | `osm.fuel_stations` + import/refresh pipeline (PR #1447) |
| **EXPECTED_EFFECT** | Bounded PostGIS queries with versioned dataset metadata |
| **VALIDATION** | Import gates, spatial_verify.sql, 18,195 stations promoted |
| **OBSERVED_EFFECT** | Dataset live as `geofabrik-germany-20260830` |
| **NON_EFFECTS** | Does not solve REFUEL detection or automatic enrichment by itself |
| **TRADEOFFS** | Germany-only scope; refresh operational burden |
| **REMAINING_GAPS** | OSM refresh vs historical enrichment semantics |
| **EVIDENCE** | FST-EVID-ARCH-OSM-001, FST-EVID-PR-1447-001 |

---

## FST-DEC-PRECISION-RESOLVER-001 — Precision-first bounded resolver V1

| Field | Value |
|-------|-------|
| **STATUS** | VALIDATED |
| **BEFORE** | No dedicated station-match layer |
| **WHY** | Calibration showed precision-first 100m primary captures all correct matches in sample |
| **CHANGE** | `fuel-station-resolver-v1` scoring, dedupe, ambiguity (PR #1451) |
| **EXPECTED_EFFECT** | High precision with explicit LOW/AMBIGUOUS/NOT_FOUND outcomes |
| **VALIDATION** | 28-station / 672-probe calibration gate; unit + integration tests |
| **OBSERVED_EFFECT** | Strict precision 92.0%; physical-equivalence 94.5% in calibration |
| **NON_EFFECTS** | Does not validate production GPS offset distribution |
| **TRADEOFFS** | Coverage <=150m 70.6% in calibration — some real refuels may NOT_FOUND |
| **REMAINING_GAPS** | FST-GAP-REAL-POST-CUTOVER-REFUEL-001 |
| **EVIDENCE** | FST-EVID-CALIBRATION-001, FST-EVID-PR-1451-001 |

---

## FST-DEC-DETECTION-VS-MATCH-001 — Separate detection and station-match confidence

| Field | Value |
|-------|-------|
| **STATUS** | PRODUCTION_VALIDATED (contract deployed) |
| **BEFORE** | Risk of conflating event confidence with station identity |
| **WHY** | Operators must see refuel certainty separately from station assignment quality |
| **CHANGE** | Three domains documented; API `trusted` derived; UI independent badges |
| **EXPECTED_EFFECT** | HIGH detection + LOW station never looks confirmed |
| **VALIDATION** | DTO tests + Phase F UI regression tests |
| **OBSERVED_EFFECT** | Contract live in production build; no natural enriched row yet to observe in prod UI |
| **NON_EFFECTS** | Does not improve resolver precision |
| **TRADEOFFS** | More complex operator mental model |
| **REMAINING_GAPS** | Production UI observation on real enriched REFUEL |
| **EVIDENCE** | FST-TEST-UI-REGRESSION-001, FST-EVID-CODE-BOUNDARY-001 |

---

## FST-DEC-ASYNC-ENRICH-001 — Async post-persist station enrichment

| Field | Value |
|-------|-------|
| **STATUS** | PRODUCTION_VALIDATED (infra deployed) |
| **BEFORE** | Resolver isolated read-only only (Phase C) |
| **WHY** | PostGIS work must not block HTTP or detection path |
| **CHANGE** | Producer hook + BullMQ + orchestrator + Prisma row (PR #1453, Phase D) |
| **EXPECTED_EFFECT** | REFUEL persist returns immediately; enrichment resolves asynchronously |
| **VALIDATION** | Worker/producer/orchestrator specs; production deploy health |
| **OBSERVED_EFFECT** | Queue reachable, zero backlog; no enrichment rows yet (no eligible events) |
| **NON_EFFECTS** | Does not backfill historical events |
| **TRADEOFFS** | Eventual consistency in UI |
| **REMAINING_GAPS** | First natural post-cutover REFUEL |
| **EVIDENCE** | FST-EVID-PR-1453-001, FST-EVID-PROD-DEPLOY-001 |

---

## FST-DEC-STARTTIME-CUTOVER-001 — startTime is cutover authority

| Field | Value |
|-------|-------|
| **STATUS** | PRODUCTION_VALIDATED |
| **BEFORE** | Risk of using createdAt for eligibility |
| **WHY** | Event occurrence time is the operational truth for historical firewall |
| **CHANGE** | `isFuelStationEnrichmentEventAfterCutover(eventStartTime, cutoverAt)` |
| **EXPECTED_EFFECT** | Late-ingested old trips remain non-enriched |
| **VALIDATION** | cutover.util.spec.ts; production cutover `2026-08-31T19:47:39.000Z` preserved |
| **OBSERVED_EFFECT** | 16 pre-cutover REFUEL, 0 enrichment rows |
| **NON_EFFECTS** | Does not change detection timestamps |
| **TRADEOFFS** | Requires correct upstream startTime |
| **REMAINING_GAPS** | Upstream coordinate/timestamp contract documentation |
| **EVIDENCE** | FST-EVID-CODE-CUTOVER-001 |

---

## FST-DEC-NO-BACKFILL-001 — Explicit no-historical-backfill policy

| Field | Value |
|-------|-------|
| **STATUS** | PRODUCTION_VALIDATED |
| **BEFORE** | N/A (greenfield enrichment) |
| **WHY** | Avoid retroactive mutation of historical operational records |
| **CHANGE** | Cutover gate + no recovery for pre-cutover + deploy verification |
| **EXPECTED_EFFECT** | Zero enrichment rows for pre-cutover REFUEL |
| **VALIDATION** | Production DB snapshot before/after Phase E+F deploy |
| **OBSERVED_EFFECT** | enrichment_total=0; refuel_pre_cutover=16 unchanged |
| **NON_EFFECTS** | Does not prevent future post-cutover enrichment |
| **TRADEOFFS** | Historical trips never show station names |
| **REMAINING_GAPS** | Manual backfill policy if ever requested (out of scope) |
| **EVIDENCE** | FST-EVID-PROD-DEPLOY-001 |

---

## FST-DEC-DB-LIFECYCLE-001 — DB enrichment row is lifecycle source of truth

| Field | Value |
|-------|-------|
| **STATUS** | VALIDATED |
| **BEFORE** | Risk of BullMQ-only lifecycle |
| **WHY** | Jobs can be lost; DB row survives restarts |
| **CHANGE** | lifecycle.policy terminal skip reasons |
| **EXPECTED_EFFECT** | Idempotent automatic paths |
| **VALIDATION** | lifecycle.policy.spec.ts, producer.spec.ts |
| **OBSERVED_EFFECT** | UNKNOWN in production (no rows yet) |
| **NON_EFFECTS** | Manual repair path not implemented |
| **TRADEOFFS** | Requires careful fingerprint/version semantics |
| **REMAINING_GAPS** | Manual FAILED repair workflow |
| **EVIDENCE** | FST-EVID-CODE-LIFECYCLE-001 |

---

## FST-DEC-FAILED-TERMINAL-001 — FAILED is terminal for automatic recovery

| Field | Value |
|-------|-------|
| **STATUS** | VALIDATED |
| **BEFORE** | Infinite retry risk |
| **WHY** | Prevent retry storms on permanent failures |
| **CHANGE** | `terminal_failed` skip in lifecycle policy |
| **EXPECTED_EFFECT** | FAILED rows not re-enqueued automatically with same fingerprint |
| **VALIDATION** | lifecycle.policy.spec.ts |
| **OBSERVED_EFFECT** | UNKNOWN in production |
| **NON_EFFECTS** | Does not define manual re-run |
| **TRADEOFFS** | Ops may need manual intervention |
| **REMAINING_GAPS** | Manual repair path |
| **EVIDENCE** | FST-EVID-CODE-LIFECYCLE-001 |

---

## FST-DEC-TRUST-HIGH-MEDIUM-001 — Only MATCHED HIGH/MEDIUM is trusted

| Field | Value |
|-------|-------|
| **STATUS** | VALIDATED |
| **BEFORE** | N/A |
| **WHY** | LOW matches are diagnostic only per calibration false-positive analysis |
| **CHANGE** | `isTrustedFuelStationAssignment`; UI trusted vs possible modes |
| **EXPECTED_EFFECT** | Operators never see LOW as confirmed station |
| **VALIDATION** | trust.policy.spec.ts; UI tests |
| **OBSERVED_EFFECT** | UNKNOWN on real production data |
| **NON_EFFECTS** | Does not hide LOW candidate entirely — shown as possible |
| **TRADEOFFS** | More UI states |
| **REMAINING_GAPS** | Real-world LOW rate unknown |
| **EVIDENCE** | FST-TEST-UI-REGRESSION-001 |

---

## FST-DEC-EXTEND-API-001 — Extend existing Energy Event API

| Field | Value |
|-------|-------|
| **STATUS** | PRODUCTION_VALIDATED (deploy) |
| **BEFORE** | No station enrichment in API |
| **WHY** | Avoid parallel endpoint and N+1 resolver calls |
| **CHANGE** | Optional `stationEnrichment` on EnergyEventDto (PR #1473) |
| **EXPECTED_EFFECT** | Backward compatible timeline payloads |
| **VALIDATION** | DTO specs; production deploy |
| **OBSERVED_EFFECT** | API read path returns null enrichment for historical REFUEL |
| **NON_EFFECTS** | Does not create enrichment rows |
| **TRADEOFFS** | Larger payload when enrichment present |
| **REMAINING_GAPS** | Positive match payload not observed in prod |
| **EVIDENCE** | FST-EVID-PR-1473-001 |

---

## FST-DEC-READ-PERSISTED-001 — HTTP read uses persisted enrichment only

| Field | Value |
|-------|-------|
| **STATUS** | VALIDATED |
| **BEFORE** | Mapbox lazy backfill on read (historical) |
| **WHY** | Latency, cost, non-determinism |
| **CHANGE** | Prisma include + DTO mapper only |
| **EXPECTED_EFFECT** | No PostGIS on HTTP request |
| **VALIDATION** | list-station-enrichment.spec.ts; code audit |
| **OBSERVED_EFFECT** | CONFIRMED in deployed code path |
| **NON_EFFECTS** | Does not speed up async enrichment |
| **TRADEOFFS** | Stale until worker completes |
| **REMAINING_GAPS** | None for read path |
| **EVIDENCE** | FST-EVID-CODE-API-READ-001 |

---

## FST-DEC-EXTEND-TIMELINE-UI-001 — Extend TripTimelineEnergyCard

| Field | Value |
|-------|-------|
| **STATUS** | PRODUCTION_VALIDATED (deploy) |
| **BEFORE** | Coordinates-only Tankvorgang card |
| **WHY** | Operators need station identity without nested modules |
| **CHANGE** | Phase F presentation policy + i18n (PR #1475) |
| **EXPECTED_EFFECT** | Inline trusted/possible/ambiguous/resolving states |
| **VALIDATION** | 27 frontend tests; visual acceptance PASS |
| **OBSERVED_EFFECT** | Bundle deployed; historical cards unchanged |
| **NON_EFFECTS** | Does not fetch extra HTTP per card |
| **TRADEOFFS** | Card height variability with long addresses |
| **REMAINING_GAPS** | Production observation of trusted match UI |
| **EVIDENCE** | FST-EVID-PR-1475-001, FST-TEST-UI-REGRESSION-001 |

---

## FST-DEC-RECHARGE-UNTOUCHED-001 — RECHARGE semantics untouched

| Field | Value |
|-------|-------|
| **STATUS** | VALIDATED |
| **BEFORE** | RECHARGE card without station block |
| **WHY** | Out of domain — charging locations are not fuel stations |
| **CHANGE** | Explicit ignore in presentation policy and DTO |
| **EXPECTED_EFFECT** | RECHARGE timeline identical aside from shared shell |
| **VALIDATION** | UI + DTO tests |
| **OBSERVED_EFFECT** | CONFIRMED in production API samples |
| **NON_EFFECTS** | N/A |
| **TRADEOFFS** | None |
| **REMAINING_GAPS** | None |
| **EVIDENCE** | FST-TEST-UI-REGRESSION-001 |

---

## FST-DEC-REAL-REFUEL-E2E-001 — Natural post-cutover REFUEL required for E2E validation

| Field | Value |
|-------|-------|
| **STATUS** | PROPOSED |
| **BEFORE** | Architecture deployed without natural positive path observation |
| **WHY** | Epistemic rigor — no synthetic production events |
| **CHANGE** | Canonical gap FST-GAP-REAL-POST-CUTOVER-REFUEL-001 |
| **EXPECTED_EFFECT** | Full path promoted to PRODUCTION_VALIDATED only after real event |
| **VALIDATION** | Await natural post-cutover REFUEL with enrichment row |
| **OBSERVED_EFFECT** | Not yet observed |
| **NON_EFFECTS** | Does not block deployed architecture |
| **TRADEOFFS** | Validation latency |
| **REMAINING_GAPS** | This is the gap |
| **EVIDENCE** | FST-GAP-REAL-POST-CUTOVER-REFUEL-001 |
