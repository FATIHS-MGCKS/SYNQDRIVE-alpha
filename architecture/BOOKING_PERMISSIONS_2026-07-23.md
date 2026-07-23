# Booking Permissions — Granular IAM Model

**Date:** 2026-07-23  
**Prompts:** 2/34 (model) + 3/34 (endpoint enforcement)  
**Status:** Model + role templates + backfill + deny-by-default controller enforcement

## Summary

Introduced a canonical granular booking permission model aligned with tasks/payments/legal-documents patterns:

- 20 `booking.*` actions mapped to 8 membership JSON module keys
- `BookingPermissionService` + `@RequireBookingPermission()` decorator
- `BookingPermissionsGuard` — deny-by-default; missing handler metadata → 403
- `BookingAccessService` — IDOR prevention (`bookingId` + `organizationId`)
- `BookingResponseRedactionService` — sensitive/finance/signature/audit/documents redaction
- Updated system role templates with least-privilege defaults
- Backfill script for existing org system templates

## Module keys (new)

`bookings-sensitive`, `bookings-schedule`, `bookings-customer`, `bookings-vehicle`, `bookings-finance`, `bookings-documents`, `bookings-handover`, `bookings-audit`

Core `bookings` module retained for lifecycle read/write/manage.

## Endpoint enforcement (Prompt 3)

`BookingsController` uses `@UseGuards(OrgScopingGuard, RolesGuard, BookingPermissionsGuard)`.

Every handler declares `@RequireBookingPermission(...)`. Mutations never pass on org membership alone (except ORG_ADMIN / MASTER_ADMIN bypass per existing IAM).

## Request validation (Prompt 4)

Public booking mutation endpoints no longer accept Prisma input types:

- `POST /bookings` → `CreateBookingDto` → `CreateBookingCommand` → explicit Prisma create in service
- `PATCH /bookings/:id` → `UpdateBookingDto` → `UpdateBookingCommand` → explicit Prisma update in service
- `POST /bookings/:id/no-show` → `MarkBookingNoShowDto`

`ValidationPipe` (`whitelist` + `forbidNonWhitelisted`) rejects unknown fields, nested relation shapes, and internal lifecycle fields. Client sends flat `customerId` / `vehicleId` / `quoteId` only — server owns all Prisma connects.

### Guard chain

1. `OrgScopingGuard` — cross-tenant → 403
2. `RolesGuard` — legacy role checks where still applied
3. `BookingPermissionsGuard` — explicit booking action required; evaluates module+level from membership JSON

### IDOR

`BookingAccessService.assertBookingInOrg(orgId, bookingId)` returns 404 when booking not in tenant (no existence leak).

Secondary resources validated via `assertSecondaryResourceInOrg` (customer, vehicle, station).

Driver scope: DRIVER role without `bookings-sensitive.read` limited to bookings linked via email↔customer match (contract holder, assigned driver, allowed driver). Out-of-scope → 404.

### Response redaction

| Area | Permission |
|------|------------|
| Customer PII, notes | `bookings-sensitive.read` |
| Finance, payments, stats revenue | `bookings-finance.read` |
| Signatures (handover) | `bookings-sensitive.read` |
| Audit activity | `bookings-audit.read` |
| Document bundle slots | `bookings-documents.read` |

### PATCH field-level permissions

`assertBookingUpdatePermissions` enforces additional actions per changed field:
- `startDate`/`endDate` → `booking.update_schedule`
- `customerId` → `booking.update_customer`
- `vehicleId` → `booking.update_vehicle`
- `status` → confirm/cancel/no-show/complete as applicable

### Secondary booking controllers (Prompt 3)

- `DocumentsController` — `bookings-documents.*` + `assertBookingInOrg`
- `BookingDocumentsEmailController` — `bookings-documents.write` + IDOR check
- `BookingPaymentRequestController` — existing `payments.*` guard (unchanged)
- `LegalDocumentDeliveryEvidenceController` — existing `legal_documents.*` guard (unchanged)
- `TasksController` `GET …/bookings/:bookingId/tasks` — existing `tasks.read` (unchanged)

## Key files

- `backend/src/modules/bookings/booking-permission.constants.ts`
- `backend/src/modules/bookings/booking-permission.defaults.ts`
- `backend/src/modules/bookings/dto/create-booking.dto.ts`
- `backend/src/modules/bookings/dto/update-booking.dto.ts`
- `backend/src/modules/bookings/dto/mark-booking-no-show.dto.ts`
- `backend/src/modules/bookings/booking-command.mapper.ts`
- `backend/src/modules/bookings/booking-command.types.ts`
- `backend/src/modules/bookings/booking-access.service.ts`
- `backend/src/modules/bookings/booking-response-redaction.service.ts`
- `backend/src/modules/bookings/booking-update-permission.util.ts`
- `backend/src/modules/bookings/bookings.controller.ts`
- `backend/src/modules/users/defaults/organization-role.defaults.ts`
- `backend/scripts/ops/backfill-booking-permissions.ts`
- `docs/security/booking-permission-matrix.md`

## Security notes

- Driver role no longer receives `bookings.write` by default
- Sensitive/finance/signature reads require explicit submodule grants
- Org membership alone does not grant booking actions (except ORG_ADMIN/MASTER_ADMIN bypass)
- Handler without `@RequireBookingPermission` → 403 deny-by-default

## Tests

- `bookings.permissions.characterization.spec.ts`
- `bookings.permissions.enforcement.spec.ts`
- `booking-mutation.dto.spec.ts`
- `booking-update-permission.util.spec.ts`
- `booking-permission.defaults.spec.ts`
- `booking-permission.matrix.spec.ts`
