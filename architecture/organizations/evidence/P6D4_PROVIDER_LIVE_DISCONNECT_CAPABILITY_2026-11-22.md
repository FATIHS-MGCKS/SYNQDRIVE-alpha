# P6D4 — Provider live disconnect capability evidence

**Date:** 2026-11-22  
**Scope:** Organization offboarding external disconnect (no production flags armed)

## High Mobility

| Capability | Evidence | Adapter behavior |
|------------|----------|------------------|
| Revoke clearance | `DELETE /v1/fleets/vehicles/{vin}` documented in `high-mobility-fleet.service.ts` | Org-scoped `high_mobility_vehicles` rows only; 409 idempotent; 5xx retry (max 3) |
| Status lookup | `GET /v1/fleets/vehicles/{vin}` (existing fleet service) | Post-revoke DB clearance status update |
| Credentials | `HighMobilityHealthAppAuthService.isConfigured()` | Fail-closed `HM_EXTERNAL_REVOKE_CREDENTIALS_MISSING` |

## DIMO

| Capability | Evidence | Adapter behavior |
|------------|----------|------------------|
| Privilege status read | Identity GraphQL `vehicles(filterBy: { privileged: clientId })` — `dimo-api-sync.service.ts` | Compare org `dimoVehicle.tokenId` set vs privileged cohort |
| Programmatic owner privilege revoke | **Not wired** in repository; owner action required per R9 audit docs | `DIMO_PRIVILEGE_STILL_ACTIVE` when token still privileged |
| Local quiesce | Consent `REVOKED` + exclusive `DimoVehicle.connectionStatus` | Confirmation requires not privileged + no CONNECTED org links |

## Production gates (remain OFF)

- `ORGANIZATION_OFFBOARDING_PROVIDER_DISCONNECT_LIVE=1` — required for live adapter path
- `ORGANIZATION_OFFBOARDING_PROVIDER_MOCK_ALLOWED` — test-only mocks
- `ORGANIZATION_OFFBOARDING_FINALIZATION_ENABLED` — separate P6D4 gate