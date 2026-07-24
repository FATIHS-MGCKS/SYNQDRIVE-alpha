# Vehicle Detail — Backend Security & Integration Tests (Prompt 30/36)

**Date:** 2026-07-24  
**Scope:** Vehicle detail page backend endpoints — security characterization, negative matrix, service integration.

## Endpoints covered

| Endpoint | Guards | Tests |
|----------|--------|-------|
| `GET …/vehicles/:vehicleId` | OrgScoping | characterization, findOne org scope |
| `GET …/telemetry` | OrgScoping + fleet.read | characterization, permissions, stale/live |
| `GET …/live-gps` | OrgScoping + fleet.read + data auth | characterization, data auth, provider fail, secrets |
| `GET …/device-connection` | OrgScoping | integration, measuredAt/receivedAt |
| `PATCH …/status` | OrgScoping + fleet.write | status-patch, cleaning task side effects, cache invalidation |
| `GET …/rental-requirements*` | OrgScoping + rental_rules.* | rental-requirements.security |
| `GET …/fleet-map` | OrgScoping | cache key tenant isolation |

## Security matrix

| Case | Covered |
|------|---------|
| Unauthenticated | ✅ PermissionsGuard |
| Wrong organization | ✅ OrgScopingGuard |
| Foreign vehicleId | ✅ prisma org filter / NotFound |
| Missing fleet.read | ✅ explicit permissions |
| Missing fleet.write | ✅ explicit permissions |
| Disabled data authorization | ✅ DataAuthorizationDeniedException |
| Wrong purpose | ✅ enforcement mock |
| Manipulated vehicleId | ✅ route param scoping |
| Cache hit cross-tenant | ✅ org-scoped Redis keys |
| Provider error | ✅ live GPS cache fallback |
| Rate limit | ✅ documented N/A (no Throttler on controller) |
| Secrets in response | ✅ no JWT in live GPS JSON |

## Data correctness

| Invariant | Covered |
|-----------|---------|
| Missing measurement → null | ✅ findOne odometerKm/fuelPercent |
| Measured zero preserved | ✅ evSoc = 0 |
| Stale position not live | ✅ isLiveTracking false when offline |
| Status mutation persisted | ✅ prisma.update after org check |
| Cleaning task audit trail | ✅ ensureCleaningTask / completeOpenCleaningTasks |
| measuredAt vs receivedAt | ✅ device-connection runtime fields |
| No secrets in response | ✅ live GPS + device connection |

## Run

```bash
cd backend && npm run test:vehicles:security
cd backend && npm run test:vehicles:detail:verify
```

**Result:** 62 tests green (6 suites).

## Files

- `vehicles.controller.security.characterization.spec.ts`
- `vehicles-security-negative.spec.ts`
- `vehicles.service.detail-integration.spec.ts`
- `vehicles-rental-requirements.security.spec.ts`
- `vehicles.controller.status-patch.spec.ts` (extended)
- `scripts/test/vehicle-detail-backend-verify.sh`

## Fix included

- `vehicle-operational-state-v2.test-helpers.ts`: corrected `VehiclesService` constructor stub count (fleetMapCache injection).
