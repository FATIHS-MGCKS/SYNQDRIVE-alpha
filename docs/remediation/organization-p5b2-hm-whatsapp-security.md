# P5B2 — High Mobility tenant isolation + WhatsApp webhook auth

## High Mobility (`/api/v1/vehicles/register/*`, `/:vehicleId/activate-high-mobility-health`)

- Mutations: `VehicleOwnershipGuard` + `PermissionsGuard` (`fleet.write`).
- Discovery: `PermissionsGuard` (`fleet.read`); responses sanitized via `checkAvailabilityForOrganization` / scoped `getHmOnlyCandidates`.
- `register/hm-only`: `organizationId` derived from JWT; body mismatch denied for tenant users.
- Service layer: `assertHighMobilityRecordTenantAccess` on HM records with `organizationId` set.

Tests: `high-mobility-vehicle-register.http-security.integration.spec.ts`

## WhatsApp (`/api/v1/webhooks/whatsapp`)

- Added to `AuthGuard` `PUBLIC_EXACT_PATHS` only (no `/webhooks/*` wildcard).
- POST requires `req.rawBody`; signature validated in all environments; missing config → 401.

Tests: `whatsapp-webhook.http-security.integration.spec.ts`