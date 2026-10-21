# DIMO Recharge Segments Client (Prompt 47/78, E1 repair 2026-08-27)

## Purpose

Tenant-safe DIMO GraphQL client for `segments(mechanism: recharge)` — canonical HV charge-session boundaries per `docs/architecture/battery-health-v2.md` §4 and `docs/audits/dimo-tesla-hv-signal-capability.md`.

**E1 repair:** commit `79e381069` introduced an invalid query (`id`, `limit`, `after`) causing HTTP 422 fleet-wide. See `docs/architecture/ENERGY_EVENTS_E1_RESTORATION_2026-08-27.md`.

## Module

| File | Role |
|------|------|
| `dimo-recharge-segments.types.ts` | Normalized segment + fetch meta types |
| `dimo-recharge-segments.query.ts` | GraphQL query builder (live-schema aligned) |
| `dimo-recharge-segments.window.ts` | 31-day window splitter |
| `dimo-recharge-segments.graphql.ts` | Retry/backoff + source-filter fallback + structured errors |
| `dimo-recharge-segments.normalizer.ts` | Raw GraphQL → `NormalizedDimoRechargeSegment` |
| `dimo-recharge-segments.client.ts` | `DimoRechargeSegmentsClient` service |
| `dimo-recharge-segments.mapper.ts` | Legacy `DimoEnergyEventSegment` adapter |
| `dimo-recharge-segments.fixtures.ts` | Sanitized KS FH 660E audit payloads |
| `fixtures/dimo-telemetry-segments.schema.fixture.ts` | Committed live-schema contract for CI |
| `queries/validate-dimo-segments-query.ts` | Query shape validator |

## GraphQL contract

- Endpoint: `https://telemetry-api.dimo.zone/query`
- Mechanism: `recharge`
- Max window: **31 days** per query (`DIMO_RECHARGE_SEGMENT_MAX_WINDOW_MS`)
- **No pagination** — live DIMO schema does not support `limit` / `after`
- **No `id` on Segment** — use fingerprint `dimo-recharge-{tokenId}-{startMs}`
- Optional `signalFilter: { source: { eq: "<provider>" } }` — dropped automatically when API rejects it
- `signals` selection: `{ name value }` only (no `agg`)

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
- `segmentId` = provider `id` when present (legacy), else stable `fingerprint`
- `sourceTimestamps.segmentStartAt` / `segmentEndAt`

## Auth & logging

- Tenant path: `fetchForVehicle({ organizationId, vehicleId }, from, to)` resolves `tokenId` via Prisma org scope
- Token path: `fetchForToken(tokenId, from, to)` uses `DimoAuthService.getVehicleJwt`
- Logs include `tokenId`, `mechanism`, `window`, `httpStatus`, `retryable`, GraphQL error messages — **never JWTs or API secrets**
- Failed fetches return `{ meta.status: 'FAILED', error }` instead of throwing

## Resilience

- HTTP 429 / 5xx / timeout: exponential backoff (max 3 retries)
- HTTP 422: non-retryable; returns FAILED status
- Unsupported `signalFilter`: automatic retry without filter
- Multi-window ranges split at 31-day boundaries
- Deduplication by `segmentId` / fingerprint

## Integration

- `DimoSegmentsService.fetchEnergyEventSegments()` delegates `recharge` with per-mechanism isolation
- `EnergyEventsService.detectEnergyEvents()` persists successful mechanisms independently; safe prune rules
- Exported from `DimoModule` for HV charge-session pipeline

## Tests

- `dimo-recharge-segments.client.spec.ts` — normalizer, window split, query schema, retry, FAILED on 422
- `validate-dimo-segments-query.spec.ts` — rejects 79e381069 regression query
- `dimo-segments.energy-events.spec.ts` — mechanism isolation
- `energy-events.service.spec.ts` — persistence + prune safety

## Live validation

`scripts/ops/validate-energy-event-dimo-queries.ts` — read-only probe against production DIMO.
