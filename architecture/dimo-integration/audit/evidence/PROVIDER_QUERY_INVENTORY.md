# DIMO Provider Query Inventory (R4.1 / R4.5)

**Method:** Repository read-only @ `origin/main` `09fd5d72…`. Counts are **point-in-time** from automated scan + manual query-module review — **not** a frozen operational SLA.

## GraphQL query modules (`backend/src/modules/dimo/queries/`)

| Module file | Primary signals / operation | Typical caller surface |
|-------------|----------------------------|-------------------------|
| `latest-vehicle-snapshot.query.ts` | Speed, GPS, odometer, fuel, ignition, EV battery scalars | `DimoTelemetryService.fetchLatestVehicleSnapshot` → snapshot processor |
| `last-seen-location.query.ts` | `currentLocationCoordinates`, `speed` (live) | `fetchLastSeenLocation` → `getLiveGps` |
| `latest-dtc.query.ts` | `obdDTCList` | DTC poll / webhook parity |
| `driving-events.query.ts` | Driving events time series | `DimoSegmentsService.fetchDrivingEvents*` |
| `data-summary.query.ts` | Event data summary | Segments / enrichment |
| `trip-segments.query.ts` | Trip segments | Segments service |
| `trip-detection-core.query.ts` | Trip-detection GraphQL bundle | Trip-related reads |
| `energy-event-segments.query.ts` | Energy event segments | KG-EED consumers |
| `validate-dimo-segments-query.ts` | Segment validation | Ops / reconciliation |
| `route-enrichment.query.ts` | Route enrichment signals | Post-trip geometry |
| `high-frequency.query.ts` | HF signal bundle | Trip FSM / HF paths |
| `performance.query.ts` | Performance metrics | DI / analytics |
| `environment-temperature.query.ts` | Ambient temperature | Health modules |
| `tire-pressure-history.query.ts` | Tire pressure history | Tire health |
| `battery-crank.query.ts` | Cranking / LV | Battery paths |
| `battery-capability-preflight.query.ts` | Capability preflight | Battery V2 gates |
| `available-signals.query.ts` | `availableSignals` introspection-style | Audits / capability |

Specs (`*.spec.ts`) excluded from runtime inventory.

## Non-module GraphQL entry points

| Surface | Path | Notes |
|---------|------|-------|
| Recharge segments | `recharge-segments/dimo-recharge-segments.graphql.ts` | HV charge segments — Battery V2 authority |
| Identity sync | `dimo-api-sync.service.ts` | Developer JWT + identity GraphQL — privilege grants |
| Segments service | `dimo-segments.service.ts` | Multiple inline queries + pagination |
| REST triggers | `dimo-triggers.service.ts` | Vehicle Triggers API (not telemetry GraphQL) |

## Vehicle JWT privileges (default exchange)

`DimoAuthService.getVehicleJwt(tokenId, privileges = [1, 2, 3, 4, 5, 6])` — `dimo-auth.service.ts` ~387.

All default telemetry paths use this **six-privilege** exchange unless a caller passes a custom array (rare). Cache key includes privilege hash.

## Provider gateway call-site scan

Tool: `scanDimoProviderCallSites()` in `dimo-provider-call-site-audit.util.ts`  
Run: `cd backend && npx tsx -e "import { scanDimoProviderCallSites, summarizeDimoProviderCallSiteAudit } from './src/modules/dimo/provider/dimo-provider-call-site-audit.util.ts'; console.log(summarizeDimoProviderCallSiteAudit(scanDimoProviderCallSites())); console.log('entries', scanDimoProviderCallSites().length);"`

**Snapshot @ 2026-10-12:**

| Classification | Count |
|----------------|------:|
| FULL_CONTEXT_REQUIRED | 48 |
| TOKEN_ONLY_LEGITIMATE | 6 |
| CONTEXT_UNAVAILABLE_BUT_REGISTERED_PATH | 1 |
| NOT_PROVIDER_BOUND | 0 |
| **Total matched call sites** | **55** |

The scanner matches `queryGraphQL` / `fetch*` on known service handles — it **does not** enumerate distinct GraphQL operation names in strings. Distinct **query documents** ≈ **16** runtime modules above (+ inline queries in segments service).

## Identity / auth HTTP (non-GraphQL)

| Operation | Endpoint pattern | Budget category |
|-----------|------------------|-----------------|
| Developer JWT | `auth.dimo.zone` Web3 challenge | (pre-budget) |
| Vehicle JWT exchange | `POST {tokenExchangeUrl}/v1/tokens/exchange` | `IDENTITY` |
| Telemetry GraphQL | `telemetry-api` via gateway | `LIVE_SNAPSHOT`, `ACTIVE_TRIP`, etc. |
| Vehicle Triggers | `vehicle-triggers-api.dimo.zone` | `ADMIN` / trigger CRUD |

## Tenant / consent gates on reads

| Path | Gate |
|------|------|
| Rental `getLiveGps` | `ensureDimoTelemetryAuthorization` + `assertDataAuthorization` GPS_LOCATION / LIVE_MAP when `organizationId` present — `vehicles.service.ts` ~1945–1957 |
| Snapshot processor | `vehicle.organizationId` required; registry lifecycle operational — `dimo-snapshot.processor.ts` ~141–163 |
| Webhook → vehicle | `findFirst({ dimoVehicle: { tokenId }})` — global tokenId → single vehicle row |
