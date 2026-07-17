# DIMO Recharge Segments Client (Prompt 47/78)

## Purpose

Robust, tenant-safe DIMO GraphQL client for `segments(mechanism: recharge)` — canonical HV charge-session boundaries per `docs/architecture/battery-health-v2.md` §4 and `docs/audits/dimo-tesla-hv-signal-capability.md`.

## Module

| File | Role |
|------|------|
| `dimo-recharge-segments.types.ts` | Normalized segment + fetch meta types |
| `dimo-recharge-segments.query.ts` | GraphQL query builder (pagination, source filter, HV aggregates) |
| `dimo-recharge-segments.window.ts` | 31-day window splitter |
| `dimo-recharge-segments.graphql.ts` | Retry/backoff + source-filter fallback |
| `dimo-recharge-segments.normalizer.ts` | Raw GraphQL → `NormalizedDimoRechargeSegment` |
| `dimo-recharge-segments.client.ts` | `DimoRechargeSegmentsClient` service |
| `dimo-recharge-segments.mapper.ts` | Legacy `DimoEnergyEventSegment` adapter |
| `dimo-recharge-segments.fixtures.ts` | Sanitized KS FH 660E audit payloads |

## GraphQL contract

- Endpoint: `https://telemetry-api.dimo.zone/query`
- Mechanism: `recharge`
- Max window: **31 days** per query (`DIMO_RECHARGE_SEGMENT_MAX_WINDOW_MS`)
- Pagination: `after: Time` (segment `startAt` cursor), `limit` default 50
- Optional `signalFilter: { source: { eq: "<provider>" } }` — dropped automatically when API rejects it

### Signal aggregates requested

| Signal | Aggregates |
|--------|------------|
| `powertrainTractionBatteryStateOfChargeCurrent` | MIN, MAX |
| `powertrainTractionBatteryStateOfChargeCurrentEnergy` | MIN, MAX |
| `powertrainTractionBatteryChargingAddedEnergy` | MIN, MAX |
| `powertrainTractionBatteryChargingIsCharging` | MIN, MAX |
| `powertrainTractionBatteryChargingIsChargingCableConnected` | MIN, MAX |
| `powertrainTransmissionTravelledDistance` | MIN, MAX |

## Normalized output

Each `NormalizedDimoRechargeSegment` exposes:

- `startAt`, `endAt`, `ongoing`, `startedBeforeRange`, `durationSeconds`
- `soc`, `currentEnergyKwh`, `addedEnergyKwh` (min/max/delta)
- `isCharging`, `cableConnected` (start/end booleans from 0/1 aggregates)
- `odometerKm`, geo start/end
- `segmentId` = provider `id` when present, else stable `fingerprint` (`dimo-recharge-{tokenId}-{startMs}`)
- `sourceTimestamps.segmentStartAt` / `segmentEndAt`

## Auth & logging

- Tenant path: `fetchForVehicle({ organizationId, vehicleId }, from, to)` resolves `tokenId` via Prisma org scope
- Token path: `fetchForToken(tokenId, from, to)` uses `DimoAuthService.getVehicleJwt`
- Logs include `tokenId` only — **never JWTs or API secrets**

## Resilience

- HTTP 429 / 5xx / timeout: exponential backoff (max 3 retries)
- Unsupported `signalFilter`: automatic retry without filter
- Multi-window ranges split at 31-day boundaries
- Pagination deduplication by `segmentId`

## Integration

- `DimoSegmentsService.fetchEnergyEventSegments()` delegates `recharge` to this client
- Exported from `DimoModule` for HV charge-session pipeline (downstream Prompts)

## Tests

`dimo-recharge-segments.client.spec.ts` — 10 tests with sanitized KS FH 660E audit fixtures (pagination, ongoing segment, retry, source-filter fallback, tenant scoping).
