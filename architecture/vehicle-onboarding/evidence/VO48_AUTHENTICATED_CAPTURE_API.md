# VO-4.8 — Authenticated case capture API

**Status:** `AUDIT_IN_PROGRESS` (not production/public cutover)

## API classification

- `AUTHENTICATED_INTERNAL_PRODUCT_API`
- Base route: `/organizations/:orgId/vehicle-onboarding`
- Not public registration cutover, not provider webhook, not direct vehicle creation

## Endpoints

| Method | Path | Permission |
|--------|------|------------|
| GET | `/organizations/:orgId/vehicle-onboarding/cases` | `fleet.read` |
| GET | `/organizations/:orgId/vehicle-onboarding/cases/:caseId` | `fleet.read` |
| PUT | `/organizations/:orgId/vehicle-onboarding/cases/:caseId/admin-baseline` | `fleet.write` |
| PUT | `/organizations/:orgId/vehicle-onboarding/cases/:caseId/technical-baseline` | `fleet.write` |
| POST | `/organizations/:orgId/vehicle-onboarding/cases/:caseId/readiness/evaluate` | `fleet.read` |
| POST | `/organizations/:orgId/vehicle-onboarding/cases/:caseId/readiness/seal` | `fleet.write` |

**Explicitly excluded:** activation HTTP, DIMO/HM source adoption HTTP.

## IAM

- `OrgScopingGuard` + `PermissionsGuard` on controller
- `MASTER_ADMIN` bypass remains centralized in `PermissionsGuard`
- Cross-tenant case IDs return `CASE_NOT_FOUND` (no existence leak)

## Concurrency token

- Field: `VehicleOnboardingCase.concurrencyToken` (no schema change)
- New cases: token initialized at `openOrResumeWithPrimarySnapshot` create
- Legacy cases: `null` stored token; writes must send **`expectedConcurrencyToken: null` explicitly** (missing property → `INVALID_CAPTURE_PAYLOAD` / 422)
- Invalid types (number, boolean, object, array) → `INVALID_CAPTURE_PAYLOAD` / 422
- Semantic mutation: rotate token; semantic no-op: preserve token and READY seal
- Seal success: rotates token in the same transaction as readiness seal update
- Mismatch: `ONBOARDING_CONCURRENCY_CONFLICT` → HTTP 409
- Concurrent writers with the same starting token: exactly one winner; loser gets `ONBOARDING_CONCURRENCY_CONFLICT` (PostgreSQL race proofs in VO-4.8.1)

## Capture validation

- Admin: exact allowlist keys (`version`, `vehicleName`, `licensePlate`, `stationId`, `notes`); unknown keys → `INVALID_CAPTURE_PAYLOAD`
- Technical: `VehicleTechnicalBaselineDraftV2` strict top-level and nested allowlists (brake/tire/HV sections); no `{...raw}` spread persistence (VO-4.8.1)
- List query: runtime validation for `status`, `sourceMode`, `limit` (1–100), `cursor` (UUID); invalid → 422 (no Prisma cast leaks)
- `selectedProduct`: runtime `ProductSlug` validation at HTTP boundary; unknown slug vs unsupported profile remain distinct errors
- Pre-activation battery `documentId`: `organizationId` match + `vehicleId == null`
- `serviceEventId` rejected at capture
- Tire data may be captured; no `VehicleTireSetup` materialization

## Readiness interaction

- Evaluate: `seal=false` (non-persisting preview)
- Seal: existing `VehicleOnboardingReadinessService` authority + advisory lock
- Capture vs seal races serialized via `readinessMutationLockKey(caseId)`

## HTTP boundary (VO-4.8.2)

- All `VehicleOnboardingError` from capture request parsing runs inside `runVehicleOnboardingHttp` (stable 422/409 mapping)
- Non-object JSON bodies (`null`, array, primitive) → `INVALID_CAPTURE_PAYLOAD` / 422
- Readiness evaluate/seal bodies: exact allowlisted keys only
- List `limit`: full-string integer validation (`1`–`100`); rejects `10abc`, `1.5`, etc.

## Audit

- `AuditService.record` for semantic mutations (`ADMIN_BASELINE_UPDATED`, `TECHNICAL_BASELINE_UPDATED`, `READINESS_SEALED`) **after** successful DB commit (VO-4.8.1)
- Pre-activation capture audits use `ActivityEntity.ADMIN_OPERATION` with `entityId` = onboarding case id and `metaJson.domain` = `VEHICLE_ONBOARDING` (not `VEHICLE`, which implies activated `Vehicle.id`)
- Failed transactions and semantic no-ops do not emit capture mutation audits
- No raw document or provider credential logging

## Response projection

- Raw `snapshotMetadataJson`, `sourceMirrorId`, tokens, and provider credentials are not exposed
- `externalVehicleIdentity` in source-ref summary is the tenant-adopted operational provider key bound to the case (not a platform secret)

## Proof

- Unit: `vehicle-onboarding-capture.api.unit.spec.ts`
- PostgreSQL: `vo48-capture.postgres.integration.spec.ts` (`VO48_CAPTURE_PG=1`) — includes VO-4.8.1 terminal matrix, cross-org station, seal persistence, downstream non-materialization, deterministic mutation/seal races, audit-after-commit
