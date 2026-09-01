# Tankstellenerkennung — Change Ledger

Scientific history of the fuel-station identification workstream. Epistemic rigor: record what changed, what it did **not** improve, and evidence quality.

## Phase B — OSM reference dataset (PR #1447)

| Field | Detail |
|-------|--------|
| **CHANGE** | Geofabrik DE → osmium filter → PostGIS `osm.fuel_stations` with atomic promotion |
| **WHY** | Replace online geocoding with versioned local reference data |
| **EVIDENCE** | FST-EVID-ARCH-OSM-001 |
| **NON_EFFECTS** | No REFUEL detection change; no automatic enrichment |
| **STATUS** | PRODUCTION_VALIDATED (scoped: dataset infrastructure) |

## Phase C — Resolver V1 + calibration (PR #1451)

| Field | Detail |
|-------|--------|
| **CHANGE** | Isolated `FuelStationLocationResolver` with scoring, dedupe, ambiguity |
| **CALIBRATION** | 28 stations, 672 probes on `geofabrik-germany-20260830` |
| **RESULTS** | Strict precision 92.0%; ambiguity 4.9%; FP 5.4%; coverage <=150m 70.6% |
| **RADIUS DECISION** | 150/200/250/300m fallback comparison added **zero** correct matches beyond 100m primary → FST-REJECT-WIDEN-RADIUS-001 |
| **NON_EFFECTS** | Still no Energy Event coupling |
| **STATUS** | VALIDATED |

## Phase D — Enrichment persistence + worker (PR #1453)

| Field | Detail |
|-------|--------|
| **CHANGE** | Prisma `VehicleEnergyEventFuelStationEnrichment`, producer, BullMQ, orchestrator, recovery, cutover |
| **CUTOVER** | `2026-08-31T19:47:39.000Z` on `startTime` |
| **PRODUCTION** | Feature + recovery enabled; 1 replica; migration applied |
| **NON_EFFECTS** | No historical backfill; no API/UI exposure yet |
| **STATUS** | VALIDATED (infra deployed; no production enrichment job exercised) |

## Phase E — API exposure (PR #1473)

| Field | Detail |
|-------|--------|
| **CHANGE** | Optional `stationEnrichment` on existing EnergyEventDto / trips-timeline |
| **NON_EFFECTS** | No new endpoint; no resolver on read; no schema migration |
| **STATUS** | VALIDATED (deploy; backward-compat only — no enriched prod payload) |

## Phase F — Timeline UI (PR #1475)

| Field | Detail |
|-------|--------|
| **CHANGE** | `TripTimelineEnergyCard` presentation policy + i18n |
| **VALIDATION** | 27 frontend tests; visual acceptance PASS (fixtures) |
| **NON_EFFECTS** | Zero extra HTTP requests; RECHARGE unchanged |
| **STATUS** | VALIDATED (bundle deployed; no trusted-match UI on real production data) |

## 2026-09-01 — Living architecture bootstrap (this PR)

| Field | Detail |
|-------|--------|
| **CHANGE** | `architecture/tankstellenerkennung/` knowledge graph V1 |
| **NON_EFFECTS** | No runtime changes |
| **STATUS** | Documentation only |

## 2026-09-01 — Epistemic + graph integrity correction (PR #1482)

| Field | Detail |
|-------|--------|
| **CHANGE** | PRODUCTION_VALIDATED re-audit; durable deploy evidence; machine graph completion; edge semantics; lifecycle wording; gap promotion; validator hardening |
| **NON_EFFECTS** | No runtime changes |
| **STATUS** | Documentation only |

## 2026-09-01 — Final canonical semantic integrity pass (PR #1482)

| Field | Detail |
|-------|--------|
| **CHANGE** | startTime overclaim fix; resolutionStatus enum complete; FST-SUPERSEDED taxonomy; edge semantics; evidence-ref type safety; validator semantic contracts |
| **NON_EFFECTS** | No runtime changes |
| **STATUS** | Documentation only |

## 2026-09-01 — Final main sync + authority contract gate (PR #1482)

| Field | Detail |
|-------|--------|
| **CHANGE** | Merged `origin/main` (`bd25f17d`); governance evidence node; Decision Register EVIDENCE validation (at-least-one) |
| **COMMITS** | `023f0225b` (merge), `a7d8fda95` (governance evidence + validator) |
| **MAIN DELTA** | NO TANKSTELLENERKENNUNG RUNTIME SEMANTIC DELTA FROM MAIN SYNC |
| **NON_EFFECTS** | No runtime changes |
| **STATUS** | Documentation only; authority ready for merge review |

## 2026-09-01 — Final merge-gate correction: recovery leader authority (PR #1482)

| Field | Detail |
|-------|--------|
| **CHANGE** | `FST-AUTH-RECOVERY-LEADER-001`, `FST-INV-RECOVERY-SINGLETON-001`; AGENT_CONTRACT evidence wording; Decision Register EVIDENCE completeness validation |
| **COMMITS** | `9458ffddd` |
| **NON_EFFECTS** | No runtime changes; no production status changes |
| **STATUS** | Documentation only |

## 2026-09-01 — Final micro-correction: EVIDENCE cardinality + conditional singleton semantics (PR #1482)

| Field | Detail |
|-------|--------|
| **CHANGE** | Validator enforces exactly-one EVIDENCE field per FST-DEC-* section; recovery singleton semantics refined to conditional on `SCHEDULER_LEADER_ELECTION_ENABLED`; CHANGE_LEDGER chronology corrected |
| **NON_EFFECTS** | No runtime changes; no main re-sync |
| **STATUS** | Documentation only |

## Open epistemic gate

**FST-GAP-REAL-POST-CUTOVER-REFUEL-001** — ARCHITECTURE DEPLOYED ≠ natural positive-path PRODUCTION_VALIDATED.
