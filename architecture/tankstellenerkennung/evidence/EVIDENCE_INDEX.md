# Tankstellenerkennung — Evidence Index

Canonical evidence nodes (`FST-EVID-*`, `FST-TEST-*`). See also `graph/nodes.yaml`.

| ID | Type | Source | Summary |
|----|------|--------|---------|
| FST-EVID-CODE-BOUNDARY-001 | CURRENT_CODE | energy-events.service.ts | Post-persist enqueue for refuel only |
| FST-EVID-ARCH-OSM-001 | ARCHITECTURE_DOCUMENT | OSM_FUEL_STATIONS_DATASET | 18,195 DE stations, import pipeline |
| FST-EVID-CALIBRATION-001 | CALIBRATION_RUN | FUEL_STATION_RESOLVER_V1 + calibration gate | 28 stations, 672 probes; radius widen rejected |
| FST-EVID-CODE-RESOLVER-001 | CURRENT_CODE | location.constants.ts | Radii, scores, thresholds verified |
| FST-EVID-PROD-DEPLOY-001 | PRODUCTION_OBSERVATION | evidence/PRODUCTION_DEPLOYMENT_EF_2026-09-01.md | Scoped infra/negative-path deploy observation |
| FST-EVID-GOV-REAL-REFUEL-E2E-001 | ARCHITECTURE_DOCUMENT | AGENT_CONTRACT + FST-INV-NO-SYNTHETIC-PROD-REFUEL-001 | Owner-confirmed natural-REFUEL E2E governance |
| FST-EVID-PR-1447-001 | PR_HISTORY | #1447 | OSM dataset |
| FST-EVID-PR-1451-001 | PR_HISTORY | #1451 | Resolver V1 |
| FST-EVID-PR-1453-001 | PR_HISTORY | #1453 | Enrichment persistence + worker |
| FST-EVID-PR-1473-001 | PR_HISTORY | #1473 | Phase E API |
| FST-EVID-PR-1475-001 | PR_HISTORY | #1475 (merge e76ada3d) | Phase F UI |
| FST-EVID-PR-31-001 | PR_HISTORY | #31 OPEN (no merge) | Mapbox era — historical only |
| FST-EVID-CODE-CUTOVER-001 | CURRENT_TEST | cutover.util.spec.ts | startTime eligibility |
| FST-EVID-CODE-LIFECYCLE-001 | CURRENT_TEST | lifecycle.policy.spec.ts | Terminal skip semantics |
| FST-EVID-CODE-API-READ-001 | CURRENT_TEST | list-station-enrichment.spec.ts | Include without N+1 |
| FST-TEST-UI-REGRESSION-001 | CURRENT_TEST | trips-fuel-station-enrichment-ui.test.tsx | Presentation matrix |
| FST-EVID-INCIDENT-REFUEL-2026-09-04-001 | PRODUCTION_OBSERVATION | evidence/INCIDENT_REFUEL_KS_MX_2026-09-04.md | First natural post-cutover REFUEL; duplicate rows; NOT_FOUND enrichment |
| FST-EVID-G11-HF-CLOSURE-2026-09-04-001 | PRODUCTION_OBSERVATION | evidence/G11_HF_CLOSURE_KS_MX_2026-09-04.json | G1.1 HF/route closure: Esso forecourt dwell, V2 coordinate policy, timing correction |
| FST-EVID-G12-ALGORITHMIC-CLOSURE-2026-09-04-001 | CURRENT_TEST | docs/audits/refuel-g12-algorithmic-closure-2026-09-04.md | G1.2 selector + identity matcher; 31 tests |
| FST-EVID-G12B-RUNTIME-BOUNDARY-HARDENING-2026-09-04-001 | CURRENT_TEST | docs/audits/refuel-g12b-runtime-boundary-hardening-2026-09-04.md | G1.2b boundary hardening; 51 tests; settlement/finality/lock/grouping |
| FST-EVID-G12C-FINALITY-AMBIGUITY-CLOSURE-2026-09-04-001 | CURRENT_TEST | docs/audits/refuel-g12c-finality-ambiguity-closure-2026-09-04.md | G1.2c SETTLING, observation time, fail-closed components; 64 tests |
| FST-EVID-G12D-LATE-SIBLING-HARDENING-2026-09-04-001 | CURRENT_TEST | docs/audits/refuel-g12d-late-sibling-hardening-2026-09-04.md | G1.2d late-sibling conflict gates enrichment for singleton/external components |
| FST-EVID-G21-RUNTIME-WIRING-2026-09-04-001 | CURRENT_TEST | docs/audits/refuel-g21-runtime-wiring-2026-09-04.md | G2.1 runtime wiring behind disabled feature flag; migration not production-applied |
| FST-EVID-G21A-RUNTIME-SAFETY-LIVENESS-CLOSURE-2026-09-04-001 | CURRENT_TEST | docs/audits/refuel-g21a-runtime-safety-liveness-closure-2026-09-04.md | G2.1a safety/liveness closure; legacy bypass closed; durable recovery; G2.2 shadow authorized |
| FST-EVID-G21B-CROSS-CUTOVER-RECOVERY-HARDENING-2026-09-04-001 | CURRENT_TEST | docs/audits/refuel-g21b-cross-cutover-recovery-hardening-2026-09-04.md | G2.1b cross-cutover ownership, observation-time enqueue, coordinate retry, PG lock proof |
| FST-EVID-G21C-FINAL-RECOVERY-SEMANTICS-CLOSURE-2026-09-04-001 | CURRENT_TEST | docs/audits/refuel-g21c-final-recovery-semantics-closure-2026-09-04.md | G2.1c queue-independent recovery, route epistemics, evidence fingerprint, V2 stale enrichment |
| FST-EVID-G21D-FINAL-RECOVERY-EXECUTION-CLOSURE-2026-09-04-001 | CURRENT_TEST | docs/audits/refuel-g21d-final-recovery-execution-closure-2026-09-04.md | G2.1d stale enrichment E2E, Redis-independent scheduler, route stabilization, BullMQ failed-job recovery |
| FST-EVID-G21D-FINAL-PRE-SHADOW-INTEGRATION-2026-09-04-001 | CURRENT_TEST | docs/audits/refuel-g21d-final-integration-pre-shadow-gate-2026-09-04.md | G2.1d-FINAL isolated Postgres+Redis integration, multi-replica E2E, pre-G2.2 gate |
| FST-EVID-G22-PRODUCTION-CUTOVER-2026-09-04-001 | CURRENT_TEST | docs/audits/refuel-g22-production-cutover-2026-09-04.md | G2.2 direct production cutover (no shadow); integration gate PASS; flag activation |
| FST-EVID-G22-PRODUCTION-POST-CUTOVER-T60-2026-09-04-001 | PRODUCTION_OBSERVATION | docs/audits/refuel-g22-production-post-cutover-t60-2026-09-04.md | G2.2 post-cutover T+60 read-only production audit; runtime stability PASS; zero natural REFUEL |
| FST-EVID-G22-FIRST-NATURAL-PRODUCTION-REFUEL-WOB-L-7503-2026-09-05-001 | PRODUCTION_OBSERVATION | docs/audits/refuel-g22-first-natural-production-refuel-wob-l-7503-2026-09-05.md | B1.5: direct DIMO 0 refuel segments; UPSTREAM_PROVIDER_EVIDENCE_PENDING |

## Phase memos (supporting, not graph authority)

| Document | Phase | PR |
|----------|-------|-----|
| architecture/OSM_FUEL_STATIONS_DATASET_2026-08-30.md | B | #1447 |
| architecture/FUEL_STATION_RESOLVER_V1_2026-08-30.md | C | #1451 |
| architecture/FUEL_STATION_ENRICHMENT_PERSISTENCE_WORKER_V1_2026-08-31.md | D | #1453 |
| architecture/FUEL_STATION_ENRICHMENT_API_EXPOSURE_PHASE_E_2026-08-31.md | E | #1473 |
| architecture/FUEL_STATION_ENRICHMENT_UI_PHASE_F_2026-09-01.md | F | #1475 |

## Historical evidence

| Reference | Classification | Notes |
|-----------|----------------|-------|
| PR #31 (Mapbox reverse-geocode on Energy Events) | HISTORICAL + SUPERSEDED | FST-SUPERSEDED-MAPBOX-LAZY-BACKFILL-001, FST-EVID-PR-31-001 |

## Pre-Phase-B discovery

**UNKNOWN** — see FST-GAP-PRE-PHASE-B-DISCOVERY-001.
