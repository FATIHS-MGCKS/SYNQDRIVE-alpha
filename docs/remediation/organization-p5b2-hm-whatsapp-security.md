# P5B2 — High Mobility tenant isolation + WhatsApp webhook auth

## P5B2 final closeout (F1/F2)

- **F1 lifecycle:** `assertHighMobilityTenantOperationalOrganization` (P3 `TENANT_OPERATIONAL`) on HM discovery (tenant paths), `hm-only-candidates`, controller pre-service for `hm-only`, and service-layer guard before writes.
- **F2 Master Admin:** discovery / `hm-only-candidates` may use platform scope (`checkAvailability`) without JWT `organizationId`; vehicle mutations resolve org from target vehicle; HM_ONLY still requires explicit `body.organizationId`.

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