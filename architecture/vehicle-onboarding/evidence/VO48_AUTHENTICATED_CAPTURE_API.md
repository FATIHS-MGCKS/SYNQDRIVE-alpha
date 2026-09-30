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
- Legacy cases: `null` token; first mutation requires `expectedConcurrencyToken: null`
- Semantic mutation: rotate token; semantic no-op: preserve token and READY seal
- Seal success: rotates token in same transaction as readiness seal update
- Mismatch: `ONBOARDING_CONCURRENCY_CONFLICT` → HTTP 409

## Capture validation

- Admin: `VehicleAdministrativeBaselineDraftV1` only; station scoped to org
- Technical: `VehicleTechnicalBaselineDraftV2` only via strict runtime validator (VO-4.6 parity)
- Pre-activation battery `documentId`: `organizationId` match + `vehicleId == null`
- `serviceEventId` rejected at capture
- Tire data may be captured; no `VehicleTireSetup` materialization

## Readiness interaction

- Evaluate: `seal=false` (non-persisting preview)
- Seal: existing `VehicleOnboardingReadinessService` authority + advisory lock
- Capture vs seal races serialized via `readinessMutationLockKey(caseId)`

## Audit

- `AuditService.record` for semantic mutations (`ADMIN_BASELINE_UPDATED`, `TECHNICAL_BASELINE_UPDATED`, `READINESS_SEALED`)
- No raw document or provider credential logging

## Proof

- Unit: `vehicle-onboarding-capture.api.unit.spec.ts`
- PostgreSQL: `vo48-capture.postgres.integration.spec.ts` (`VO48_CAPTURE_PG=1`)
