# Authentication, Authorization & Consent (R4.5-A)

**Scope:** DIMO Integration boundaries only — not full Vehicle Onboarding workstream.

## Credential layers

| Layer | Mechanism | Storage | Failure mode |
|-------|-----------|---------|--------------|
| Developer JWT | Web3 challenge + `submit_challenge` | Redis `dimo:developer:jwt` + memory | Blocks all vehicle exchanges |
| Vehicle JWT | `POST /v1/tokens/exchange` with `privileges[]` | Redis `dimo:vehicle:jwt:{tokenId}:{privHash}` + lock | Per-tokenId; **403 → non-retryable** (`DimoRequestExecutor`) |
| Vehicle Triggers ops | Developer JWT bearer | Ephemeral per request | Separate from telemetry |

Default privileges **`[1,2,3,4,5,6]`** on `getVehicleJwt()` — `dimo-auth.service.ts` ~387.

## Tenant isolation (SynqDrive)

| Ingress | Isolation mechanism | Gap |
|---------|---------------------|-----|
| REST vehicle APIs | `organizationId` on `vehicle` row in controllers/services | Assumes correct `dimoVehicle.tokenId` link |
| `getLiveGps` | Optional `organizationId` filter + data-authorization GPS | Internal callers must pass org |
| Webhook | Lookup by **tokenId only** — no org in payload | First matching `vehicle` wins — **data-link integrity** risk if duplicate/wrong link |
| Snapshot worker | `vehicleId` from job; loads `organizationId` | Registry lifecycle skip when not operational |

## Consent / data authorization (product layer)

Live map GPS path enforces:

- `DataAuthorizationsService.ensureDimoTelemetryAuthorization(organizationId)`
- `DataAuthEnforcementService.assertDataAuthorization({ sourceType: 'DIMO', dataCategory: 'GPS_LOCATION', purpose: 'LIVE_MAP' })`

**Not audited here:** full consent lifecycle UI — delegated to platform data-authorization module.

## Known provider permission conflict (delegated)

TokenIds **187336**, **190497**: exchange **403** while SynqDrive may still show CONNECTED — **DIM-DEF-001** (VDC). Not an R9 webhook exclusion issue — **DIM-DEF-002**.

## Redis degradation

Vehicle JWT lock: if Redis unavailable, fetch proceeds **without lock** (`dimo-auth.service.ts` ~422–425) — duplicate exchange possible under concurrency; memory cache still applies.

## Open proofs

- Complete env flag matrix (`DIM-OBS-003`)
- Per-org privilege override usage in production (if any caller passes non-default `privileges`)
