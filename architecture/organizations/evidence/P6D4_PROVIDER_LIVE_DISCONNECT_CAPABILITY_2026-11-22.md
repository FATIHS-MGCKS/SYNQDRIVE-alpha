# P6D4 — Provider live disconnect capability evidence

**Date:** 2026-11-22  
**Scope:** Organization offboarding external disconnect (no production flags armed)

## High Mobility

| Capability | Evidence | Adapter behavior |
|------------|----------|------------------|
| Revoke clearance | `DELETE /v1/fleets/vehicles/{vin}` documented in `high-mobility-fleet.service.ts` | Org-scoped rows; cross-tenant VIN gate; 5xx retry (max 3) |
| Status lookup | `GET /v1/fleets/vehicles/{vin}` (existing fleet service) | Required to confirm terminal state; 409 not blindly CONFIRMED |
| Credentials | `HighMobilityHealthAppAuthService.isConfigured()` | Fail-closed `HM_EXTERNAL_REVOKE_CREDENTIALS_MISSING` |

## DIMO

| Capability | Evidence | Adapter behavior |
|------------|----------|------------------|
| Privilege status read | Identity GraphQL `vehicles(filterBy: { privileged: clientId })` — paginated `pageInfo`/`endCursor` | Full traversal required; missing `tokenId` / cursor gaps fail-closed |
| Programmatic owner privilege revoke | **Not wired** in repository; owner action required per R9 audit docs | `DIMO_PRIVILEGE_STILL_ACTIVE` when token still privileged |
| Local quiesce | Consent `REVOKED` + exclusive `DimoVehicle.connectionStatus` | Confirmation requires not privileged + no CONNECTED org links |

## Production gates (remain OFF)

- `ORGANIZATION_OFFBOARDING_PROVIDER_DISCONNECT_LIVE=1` — required for live adapter path
- `ORGANIZATION_OFFBOARDING_DIMO_PRIVILEGE_RECHECK_ENABLED=1` — read-only Identity recheck for operator handoff (no HM DELETE / no local quiesce)
- `ORGANIZATION_OFFBOARDING_PROVIDER_MOCK_ALLOWED` — test-only mocks
- `ORGANIZATION_OFFBOARDING_FINALIZATION_ENABLED` — separate P6D4 gate