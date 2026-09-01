# Tankstellenerkennung — Current State

**Reconstruction maturity:** SUBSTANTIAL (code + architecture memos; natural E2E production match not yet observed)

## Audited baselines (separate — do not conflate)

| Baseline | Value | Notes |
|----------|-------|-------|
| **Authority code baseline audited** | `bd25f17d43c644781317552d06cca27a06fe0bcb` (`origin/main` at 2026-09-01 sync) | Runtime semantics reviewed against Tankstellenerkennung modules; no domain delta from main sync |
| **Production observation baseline** | `FST-EVID-PROD-DEPLOY-001` | Phase E+F deploy SHA `e76ada3d8885f8eeb7f2e6c6c50be115d0758c2c`; cutover preserved; zero enrichment rows; no post-cutover REFUEL observed |

Historical branch origin: `c5dce7a9de130e4785a707c5175c1b7fb3dc8302`. Main has advanced; production evidence is not rewritten by main movement.

## Main sync audit (2026-09-01)

Commits on `origin/main` since branch origin (`c5dce7a9d`) reviewed for Tankstellenerkennung domain impact:

- `7e8bfca53` — ATE/EED knowledge-graph discovery artifacts (documentation only)
- `4843a4ebc` — Scaling Process canonical knowledge graph (documentation only)
- `d6884ce60` — P1.8.2.1 multi-replica deploy lifecycle hardening (ops/deploy scripts)
- `bd25f17d4` — ATE Phase 2A canonical knowledge graph (documentation only)

**NO TANKSTELLENERKENNUNG RUNTIME SEMANTIC DELTA FROM MAIN SYNC**

No changes to REFUEL persistence, coordinates, startTime, resolver, OSM dataset, enrichment producer/worker/orchestrator, recovery, lifecycle/trust policies, API projection, or trips timeline UI code paths.

## Executive summary

SynqDrive identifies fuel stations for persisted **REFUEL** energy events using a **local versioned OSM/PostGIS dataset**, a **precision-first bounded resolver** (`fuel-station-resolver-v1`), and **async post-persist enrichment** stored in `vehicle_energy_event_fuel_station_enrichments`.

Phase E exposes persisted enrichment on the existing Energy Event / trips-timeline API path. Phase F renders enrichment on `TripTimelineEnergyCard` with explicit uncertainty semantics.

**ARCHITECTURE DEPLOYED ≠ NATURAL POSITIVE PATH PRODUCTION-VALIDATED.**

As of the latest production deployment evidence (Phase E+F, 2026-09-01), there was still **no real post-cutover REFUEL** with persisted enrichment. See `FST-GAP-REAL-POST-CUTOVER-REFUEL-001`.

## Upstream dependency (out of domain)

| Component | Role | Owned by |
|-----------|------|----------|
| DIMO segments + signals | Trip boundaries, fuel-level rise | Energy Event / DIMO integration |
| Refuel detector | Decides **that** refueling happened | Energy Event subsystem |
| `VehicleEnergyEvent` | Canonical persisted REFUEL/RECHARGE row | Energy Event subsystem |

Tankstellenerkennung consumes `VehicleEnergyEvent` **after** REFUEL persistence.

## End-to-end path (current)

```
Vehicle telemetry
  → Energy Event REFUEL detection (upstream)
  → persisted VehicleEnergyEvent (kind=REFUEL)
  → FuelStationEnrichmentProducer.enqueueAfterPersistFromEvent (post-persist hook)
  → cutover gate (startTime >= FUEL_STATION_ENRICHMENT_CUTOVER_AT)
  → lifecycle/idempotency gate (DB row + fingerprint + resolverVersion)
  → BullMQ queue energy.refuel.station.enrich
  → RefuelStationEnrichmentProcessor
  → FuelStationEnrichmentOrchestrator
  → deriveCanonicalFuelStationCoordinate (start lat/lon)
  → FuelStationLocationResolver
  → osm.fuel_stations PostGIS candidate query (100m, optional 250m fallback)
  → scoring → dedupe → ambiguity decision → matchConfidence
  → persisted VehicleEnergyEventFuelStationEnrichment
  → trust policy (MATCHED + HIGH/MEDIUM → trusted)
  → Phase E: toEnergyEventDto / trips-timeline (read persisted only)
  → Phase F: TripTimelineEnergyCard presentation policy
```

## Resolver V1 constants (CONFIRMED in code)

| Parameter | Value |
|-----------|-------|
| Primary radius | 100 m |
| Fallback radius | 250 m (only if primary returns **zero** candidates) |
| Max candidates | 10 |
| MATCHED HIGH min score | 85 (+ inside geometry or geometry ≤15 m) |
| MATCHED MEDIUM min score | 70 |
| MATCHED LOW min score | 55 |
| NOT_FOUND max score | 54 |
| AMBIGUOUS min score | 45 |
| Ambiguity absolute score gap | < 20 |
| Ambiguity close geometry gap | < 15 m (with score conditions) |
| Ambiguity relative gap | < 15% |

## OSM dataset (CONFIRMED)

| Field | Value |
|-------|-------|
| Live version (production snapshot) | `geofabrik-germany-20260830` |
| Station count | 18,195 |
| Geographic scope | Germany (Geofabrik DE extract) |

## Enrichment lifecycle (CONFIRMED)

| Aspect | Behavior |
|--------|----------|
| Cutover authority | `VehicleEnergyEvent.startTime` (not `createdAt`) — invariant preserved; production proof of late-persist classification not yet observed |
| Pre-cutover REFUEL | No automatic enrichment |
| Historical backfill | Explicitly forbidden |
| DB source of truth | `vehicle_energy_event_fuel_station_enrichments` |
| FAILED + same fingerprint + resolverVersion | Terminal for automatic paths (`terminal_failed`) |
| COMPLETED + same fingerprint + resolverVersion + non-retryable resolution | Idempotent no-op (`terminal_completed`) |
| COMPLETED + resolutionStatus=ERROR | Retry permitted |
| COMPLETED + resolutionStatus=null | Retry permitted |
| Changed fingerprint or resolverVersion | Re-resolution may be permitted |
| Recovery scheduler | Re-enqueues eligible non-terminal rows on interval; **SINGLETON_GLOBAL leader-gated** — only elected scheduler leader executes sweep tick; followers skip |

### Multi-replica recovery leader ownership

`FuelStationEnrichmentRecoveryScheduler` may be registered on every backend replica, but
`recoverMissedEnrichments()` calls `leaderGuard.shouldRun('fuel_station_enrichment_recovery')`.
The scheduler registry classifies this name as **SINGLETON_GLOBAL** — only the elected
cluster scheduler leader executes the recovery sweep; follower replicas skip the tick.
This prevents duplicate cluster-wide recovery scans/enqueues.

This requirement applies to the **recovery scheduler tick** only. The BullMQ enrichment
worker (`RefuelStationEnrichmentProcessor`) is not singleton-gated by this mechanism.

See `FST-AUTH-RECOVERY-LEADER-001`, `FST-INV-RECOVERY-SINGLETON-001`.

## API / UI (CONFIRMED)

| Surface | Behavior |
|---------|----------|
| `GET .../trips-timeline` | Optional `stationEnrichment` on REFUEL energy events |
| `GET .../energy-events` | Same DTO projection |
| HTTP read | Persisted enrichment only — **no resolver/PostGIS on request** |
| `TripTimelineEnergyCard` | trusted / possible / ambiguous / resolving / none modes |
| RECHARGE | No station enrichment block |

## Production epistemic state (2026-09-01)

| Claim | Status |
|-------|--------|
| Phase D cutover live (`2026-08-31T19:47:39.000Z`) | CONFIRMED (deployment evidence) |
| Feature + recovery enabled | CONFIRMED |
| Phase E+F deployed to production | CONFIRMED |
| No Phase E/F migration | CONFIRMED |
| No historical enrichment/backfill | CONFIRMED (DB counts unchanged across deploy) |
| Queue healthy, no backlog | CONFIRMED |
| Natural post-cutover REFUEL with enrichment exercised E2E | **UNKNOWN / NOT YET OBSERVED** |

## What is explicitly NOT solved

See canonical gap nodes in `graph/nodes.yaml` and `contradictions/KNOWLEDGE_GAPS.md`:

| ID | Gap |
|----|-----|
| FST-GAP-REAL-POST-CUTOVER-REFUEL-001 | No natural post-cutover REFUEL E2E in production |
| FST-GAP-GERMANY-SCOPE-001 | Germany-only dataset; international expansion unknown |
| FST-GAP-MANUAL-FAILED-REPAIR-001 | No manual repair workflow for terminal FAILED rows |
| FST-GAP-SINGLE-COORD-POLICY-001 | Single start-coordinate policy; multi-point evidence undecided |
| FST-GAP-OSM-DATA-QUALITY-001 | OSM relation/multipolygon production edge cases |
| FST-GAP-PRODUCTION-SLO-001 | No production SLO / alerting thresholds |
| FST-GAP-UPSTREAM-COORD-CONTRACT-001 | Upstream coordinate/timestamp contract not fully documented |
| FST-GAP-PRE-PHASE-B-DISCOVERY-001 | Pre-Phase-B discovery history not reconstructed |

Hypotheses FST-HYP-GPS-OFFSET-001 and FST-HYP-OSM-REFRESH-001 remain open.
