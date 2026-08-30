# Fuel Station Enrichment Persistence + Worker V1 (Phase D)

| Field | Value |
|-------|-------|
| **Date** | 2026-08-31 |
| **Phase** | D — async persistence/orchestration only (no API/UI) |
| **Resolver version** | `fuel-station-resolver-v1` |
| **Queue** | `energy.refuel.station.enrich` |

## Purpose

After a persisted `REFUEL` `VehicleEnergyEvent`, best-effort enqueue a BullMQ job that resolves the nearest OSM fuel station and stores an auditable 1:1 enrichment row. Energy Event detection, scoring, coalescing, and persistence semantics are unchanged.

## Target flow

```
Persisted REFUEL VehicleEnergyEvent
        ↓
FuelStationEnrichmentProducerService (post-persist hook, best-effort)
        ↓
BullMQ `energy.refuel.station.enrich`
        ↓
RefuelStationEnrichmentProcessor
        ↓
FuelStationEnrichmentOrchestratorService
        ↓
FuelStationLocationResolverService (read-only PostGIS)
        ↓
VehicleEnergyEventFuelStationEnrichment (terminal audit row)
```

## Prisma model

`VehicleEnergyEventFuelStationEnrichment` — 1:1 with `VehicleEnergyEvent` (`ON DELETE CASCADE`).

| Field group | Fields |
|-------------|--------|
| Identity | `id`, `energyEventId` (unique) |
| Lifecycle | `processingStatus`, `resolutionStatus`, `attemptCount`, `lastAttemptAt`, `resolvedAt`, `failedAt` |
| Match | `matchConfidence`, `matchScore`, station fields (`osmType`, `osmId`, `stationName`, `brand`, `operator`, `address`, `stationLatitude`, `stationLongitude`, `distanceMeters`) |
| Input audit | `inputLatitude`, `inputLongitude`, `inputCoordinateSource`, `inputFingerprint` |
| Provenance | `resolverVersion`, `osmDatasetVersion` |
| Errors | `errorCode`, `errorMessage` (bounded) |

Enums:

- **Processing:** `PENDING` | `PROCESSING` | `COMPLETED` | `FAILED`
- **Resolution:** `MATCHED` | `AMBIGUOUS` | `NOT_FOUND` | `NO_COORDINATES` | `INVALID_COORDINATES` | `ERROR`
- **Station confidence:** `HIGH` | `MEDIUM` | `LOW` (separate from `VehicleEnergyEvent.confidence`)

Migration: `20260831120000_vehicle_energy_event_fuel_station_enrichment` (additive only).

## Status semantics

| Processing | Resolution | Meaning |
|------------|------------|---------|
| `COMPLETED` | `MATCHED` / `AMBIGUOUS` / `NOT_FOUND` / `NO_COORDINATES` / `INVALID_COORDINATES` | Terminal business outcome |
| `PROCESSING` | `ERROR` | Retryable infrastructure/resolver failure in flight |
| `FAILED` | `ERROR` | Max BullMQ retries exhausted |

`NOT_FOUND` with `COMPLETED` is success — not a failed job.

## Trust policy

`isTrustedFuelStationAssignment()`:

```
trusted = resolutionStatus === MATCHED
       && matchConfidence IN (HIGH, MEDIUM)
```

`MATCHED LOW` is persisted for diagnostics but must not be treated as verified customer-facing station assignment.

## Coordinate selection (V1)

Canonical resolver input = **`startLatitude` / `startLongitude`** on the persisted Energy Event.

- Source label: `energy_event_start`
- Same coordinate shown in trip timeline
- No end-coordinate inference, no route reconstruction, no tank-location inference

If no valid coordinate: `NO_COORDINATES` without calling the resolver.

## Input fingerprint

SHA-256 over:

```
{energyEventId}|{lat to 7dp}|{lon to 7dp}|{resolverVersion}
```

Worker reloads latest `VehicleEnergyEvent`. Skip re-resolution when existing row is `COMPLETED`, same `inputFingerprint`, same `resolverVersion`, and resolution is not `ERROR`.

Coordinate change → new fingerprint → re-resolution permitted.

## BullMQ contract

| Item | Value |
|------|-------|
| Queue | `energy.refuel.station.enrich` |
| Job name | `refuel.station.enrich` |
| Payload | `{ energyEventId: string }` only |
| Job ID | `sanitizeBullMqJobId({ namespace: 'refuel-station', key: '{energyEventId}:{inputFingerprint}' })` |
| Retries | `FUEL_STATION_ENRICHMENT_JOB_ATTEMPTS` (default 5), exponential backoff |

## Post-persistence hook (exact)

`EnergyEventsService.upsertSegment()`:

1. `prisma.vehicleEnergyEvent.create/update`
2. **if `segment.mechanism === 'refuel'`:** `void fuelStationEnrichmentProducer?.enqueueAfterPersistFromEvent(row).catch(warn)`
3. refuel metrics
4. return `{ row, wasCreated }`

Producer is `@Optional()` — enqueue failure never throws into persistence.

## Feature flag / cutover

| Env | Default | Purpose |
|-----|---------|---------|
| `FUEL_STATION_ENRICHMENT_ENABLED` | `false` | Master switch (producer + worker) |
| `FUEL_STATION_ENRICHMENT_CUTOVER_AT` | unset | Only events with `createdAt >= cutover` are enqueued/recovered |
| `FUEL_STATION_ENRICHMENT_RECOVERY_ENABLED` | `false` | Bounded missed-enqueue recovery |
| `FUEL_STATION_ENRICHMENT_RECOVERY_INTERVAL_MS` | `300000` | Recovery cadence |
| `FUEL_STATION_ENRICHMENT_RECOVERY_BATCH_SIZE` | `50` | Recovery batch cap |

Recovery (`FuelStationEnrichmentRecoveryScheduler`) sweeps post-cutover REFUEL events missing enrichment or stuck `PENDING`/`FAILED`/stale `PROCESSING`. **No historical backfill.**

## Concurrency

- Unique `energyEventId` FK enforces 1:1 row
- `upsert` on enrichment row for atomic create/update
- BullMQ deterministic `jobId` dedupes repeated producer calls
- DB correctness does not rely on queue dedupe alone

## Observability

Structured log event `fuel_station_enrichment_completed` with:

`energyEventId`, `processingStatus`, `resolutionStatus`, `matchConfidence`, `resolverVersion`, `osmDatasetVersion`, `attemptNumber`, `durationMs`

## Deployment boundary (Phase D)

- Schema migration created but **not applied to production** in this phase
- Worker/hook **disabled by default** (`FUEL_STATION_ENRICHMENT_ENABLED=false`)
- No frontend / public Energy Event API changes
- No historical backfill

## Tests

`npm run test:fuel-stations:enrichment` — producer, orchestrator, trust policy, fingerprint, coordinate policy, recovery scheduler, Energy Event firewall.

Existing resolver suite: `npm run test:fuel-stations:unit` + `test:fuel-stations:postgres`.

## Known limitations

- Phase E/F required for API DTO + UI station display
- Weekly OSM refresh does not auto re-enrich historic events
- Recovery requires explicit cutover timestamp in production rollout
