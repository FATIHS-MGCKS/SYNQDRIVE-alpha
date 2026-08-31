# Fuel Station Enrichment Phase E — API Exposure

| Field | Value |
|-------|-------|
| **Date** | 2026-08-31 |
| **Phase** | E — read-only API/DTO integration (no worker, no resolver, no UI) |
| **Depends on** | Phase D (`VehicleEnergyEventFuelStationEnrichment`) |
| **Resolver version** | `fuel-station-resolver-v1` (read from persisted row only) |

## Purpose

Expose persisted fuel-station enrichment on existing REFUEL Energy Events through the vehicle Fahrverlauf / trip timeline API. This phase is presentation-only: no detection changes, no resolver calls, no worker changes, no backfill.

## End-to-end flow

```
OSM fuel dataset (PostGIS osm.fuel_stations)
        ↓
FuelStationLocationResolverService (Phase C — worker-time only)
        ↓
VehicleEnergyEventFuelStationEnrichment (Phase D — async persistence)
        ↓
EnergyEventDto.stationEnrichment (Phase E — read projection)
        ↓
Future Phase F — frontend presentation / fallback UX
```

## API path (existing — extended, not duplicated)

| Layer | Path / symbol |
|-------|----------------|
| **Primary UI path** | `GET /api/v1/vehicles/:vehicleId/trips-timeline` |
| **Direct energy path** | `GET /api/v1/vehicles/:vehicleId/energy-events` |
| **Controller** | `VehicleIntelligenceController.getTripsTimeline` / `getEnergyEvents` |
| **Service** | `EnergyEventsService.buildTripsTimeline` → `listEnergyEvents` |
| **Prisma read** | `vehicleEnergyEvent.findMany({ include: { fuelStationEnrichment: true } })` |
| **DTO mapper** | `toEnergyEventDto` + `toStationEnrichmentDto` |

Authorization: unchanged class-level guards (`RolesGuard`, `VehicleOwnershipGuard`, `VehicleIntelligencePermissionGuard`). Enrichment is only reachable through vehicle-scoped Energy Event queries — no standalone enrichment lookup endpoint.

## DTO contract

`EnergyEventDto` gains an optional nested field:

```typescript
stationEnrichment?: {
  processingStatus: FuelStationEnrichmentProcessingStatus;
  resolutionStatus: FuelStationEnrichmentResolutionStatus | null;
  trusted: boolean;
  matchConfidence: FuelStationMatchConfidence | null;
  score: number | null; // persisted matchScore
  station?: {
    osmType: string | null;
    osmId: string | null;
    name: string | null;       // stationName
    brand: string | null;
    address: string | null;
    latitude: number | null;   // stationLatitude
    longitude: number | null;  // stationLongitude
    distanceMeters: number | null;
  };
  resolverVersion: string | null;
  osmDatasetVersion: string | null;
  resolvedAt: string | null;   // ISO-8601
}
```

Omitted when:
- event is not `REFUEL`
- no enrichment row exists (historical pre-cutover events)

Existing top-level fields (`confidence`, coordinates, deltas, timestamps) are unchanged.

## Two independent confidence domains

| Field | Domain | Meaning |
|-------|--------|---------|
| `EnergyEventDto.confidence` | REFUEL/RECHARGE **detection** | `scoreConfidence()` output from Energy Event pipeline |
| `stationEnrichment.matchConfidence` | **Station location match** | Resolver output persisted on enrichment row |

These must never be merged or aliased. Both can coexist with different values on the same event.

## Trust policy (read projection)

Reuses canonical Phase D helper `isTrustedFuelStationAssignment()`:

```
trusted = resolutionStatus === MATCHED
       && matchConfidence IN (HIGH, MEDIUM)
```

| Resolution | Match confidence | `trusted` | `station` nested object |
|------------|------------------|-----------|-------------------------|
| `MATCHED` | `HIGH` / `MEDIUM` | `true` | included when station fields exist |
| `MATCHED` | `LOW` | `false` | included (diagnostic) |
| `AMBIGUOUS` | any | `false` | omitted |
| `NOT_FOUND` | any | `false` | omitted |
| `NO_COORDINATES` | any | `false` | omitted |
| `INVALID_COORDINATES` | any | `false` | omitted |
| `ERROR` | any | `false` | omitted |
| `PENDING` / `PROCESSING` | n/a | `false` | omitted |

Processing failures (`FAILED` + `ERROR`) expose lifecycle state only — error messages are not surfaced on the public API.

## Performance

- Single `findMany` with `include: { fuelStationEnrichment: true }` — no N+1
- No resolver invocation on HTTP request path
- No PostGIS queries on HTTP request path
- Serves persisted enrichment rows only

## Backward compatibility

`stationEnrichment` is additive and optional. Existing API consumers continue to receive the same top-level Energy Event shape.

## Out of scope (Phase E)

- Frontend UI changes (Phase F)
- Historical backfill
- Worker / producer / recovery changes
- Resolver algorithm changes
- Energy Event detection semantic changes
- Production deployment (separate release step)

## Code locations

| File | Role |
|------|------|
| `energy-events-station-enrichment.dto.ts` | Read DTO + `toStationEnrichmentDto` |
| `energy-events.types.ts` | `EnergyEventDto.stationEnrichment` + `toEnergyEventDto` |
| `energy-events.service.ts` | Prisma `include` on `listEnergyEvents` |
| `fuel-station-enrichment-trust.policy.ts` | Canonical trust rule (reused, unchanged) |

## Tests

- `energy-events-station-enrichment.dto.spec.ts` — resolution/trust/confidence matrix
- `energy-events-list-station-enrichment.spec.ts` — vehicle scoping + single-query include
