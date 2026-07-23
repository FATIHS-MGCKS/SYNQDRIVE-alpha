# Booking Permissions — Granular IAM Model

**Date:** 2026-07-23  
**Prompts:** 2/34 (model) + 3/34 (endpoint enforcement) + 4/34 (DTO validation) + 5/34 (create validation) + 6/34 (typed update commands)  
**Status:** Model + role templates + backfill + deny-by-default controller enforcement + typed update commands

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
- `PATCH /bookings/:id` → **removed (410 Gone)** — use typed action endpoints below
- `POST /bookings/:id/no-show` → `MarkBookingNoShowDto`

`ValidationPipe` (`whitelist` + `forbidNonWhitelisted`) rejects unknown fields, nested relation shapes, and internal lifecycle fields. Client sends flat `customerId` / `vehicleId` / `quoteId` only — server owns all Prisma connects.

## Create validation (Prompt 5)

`CreateBookingDto` + `CreateBookingCommand` + `BookingCreateValidationService`:

- Canonical HTTP fields: `pickupAt`, `returnAt`, `pricingQuoteId`, `customerNotes`, `internalNotes`, `paymentIntent`, `allowedDriverIds`, `pricingInput` (mileage/insurance/extras), `isOneWayRental`
- Legacy aliases accepted: `startDate`/`endDate`/`quoteId`/`notes`/`paymentMethodIntent`
- Client price hints (`dailyRateCents`, `totalPriceCents`) rejected at DTO boundary
- `mapCreateBookingDtoToCommand` uses `parseBookingInstant` — no local timezone distortion
- `BookingCreateValidationService.validate()` — stable error codes (`BOOKING_CREATE_ERROR_CODES`)
  - Date window (`pickupAt` < `returnAt`)
  - Min/max rental duration (tariff `minimumRentalDays` + default max 365d)
  - Tenant-safe customer/vehicle/station/allowed-driver checks
  - Currency must match quote when provided
  - Quote integrity via `PricingQuoteService.assertQuoteReadyForBooking`
  - Station/one-way rules via `StationValidationService`
  - Rental health gate + customer eligibility (fail closed)
- `BookingsService.create` applies station defaults, consumes quote server-side, seeds `BookingAllowedDriver` rows from `allowedDriverIds`

## Typed update commands (Prompt 6)

Generic `PATCH /bookings/:id` returns **410 Gone** (`BOOKING_GENERIC_PATCH_REMOVED`). Each fachliche Änderung nutzt einen eigenen Endpunkt mit eigener Permission und `expectedUpdatedAt` (optimistic concurrency → `BOOKING_VERSION_CONFLICT`).

| Endpoint | Permission | Command |
|----------|------------|---------|
| `PATCH /bookings/:id/schedule` | `booking.update_schedule` | `UpdateBookingScheduleDto` |
| `PATCH /bookings/:id/customer` | `booking.update_customer` | `UpdateBookingCustomerDto` |
| `PATCH /bookings/:id/vehicle` | `booking.update_vehicle` | `UpdateBookingVehicleDto` |
| `PATCH /bookings/:id/stations` | `booking.update_stations` | `UpdateBookingStationsDto` |
| `PATCH /bookings/:id/notes` | `booking.update_notes` | `UpdateBookingNotesDto` |
| `PATCH /bookings/:id/options` | `booking.update_options` | `UpdateBookingOptionsDto` |
| `PATCH /bookings/:id/allowed-drivers` | `booking.update_allowed_drivers` | `UpdateBookingAllowedDriversDto` |

`BookingUpdateService` orchestrates:

- Optimistic concurrency via `expectedUpdatedAt` vs `booking.updatedAt`
- Terminal state lock (`COMPLETED`/`CANCELLED`/`NO_SHOW`) — notes exempt; override via `allowTerminalOverride` + `bookings.manage`
- No status changes via update commands
- No direct client price fields — schedule/vehicle/options recalculate via `PricingService` / quote validation
- Schedule/vehicle/options: availability overlap, rental health, customer eligibility, atomic price snapshot, invoice bootstrap, document regenerate
- Customer change: customer eligibility re-check
- Vehicle change: overlap + rental health
- Stable error codes in `BOOKING_UPDATE_ERROR_CODES`

Frontend: `applyBookingFieldUpdates()` in `bookingUpdateCommands.ts` routes edits to typed endpoints; conflict UX via `BOOKING_VERSION_CONFLICT`.

## Handover DTO validation (Prompt 7)

`CreateHandoverProtocolDto` + `HandoverValidationService` for pickup/return handover:

- Class-validator DTO with `whitelist` + `forbidNonWhitelisted` (rejects `performedByUserId`/`performedByName`)
- Numeric bounds: odometer ≥ 0, fuel/charge 0–100, array/string limits
- Signature data URLs: allowed MIME types (png/jpeg/webp), max 512 KB decoded
- Return odometer ≥ pickup odometer unless `odometerOverrideReason` + `booking.override`
- Pickup gate override uses `booking.override` (via `bookings.manage`) + mandatory reason + audit
- Tenant-safe validation for `damageIds`, `actualStationId`
- Pickup only on `CONFIRMED`, return only on `ACTIVE`
- Idempotent replay: duplicate pickup on `ACTIVE`, duplicate return on `COMPLETED`
- Optional fields: `keysHandedOver`, `idDocumentVerified`, `licenseVerified` (merged into notes)

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

### PATCH field-level permissions (legacy util — superseded by Prompt 6 action endpoints)

`assertBookingUpdatePermissions` (used internally where generic update still exists) enforces additional actions per changed field:
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
- `backend/src/modules/bookings/dto/updates/*.dto.ts`
- `backend/src/modules/bookings/dto/mark-booking-no-show.dto.ts`
- `backend/src/modules/bookings/booking-command.mapper.ts`
- `backend/src/modules/bookings/booking-update-command.mapper.ts`
- `backend/src/modules/bookings/booking-update.service.ts`
- `backend/src/modules/bookings/booking-command.types.ts`
- `backend/src/modules/bookings/booking-update-command.types.ts`
- `backend/src/modules/bookings/guards/booking-permissions.guard.ts`
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
- `booking-update.service.spec.ts`
- `dto/updates/booking-update-dtos.spec.ts`
- `dto/handover/handover-mutation.dto.spec.ts`
- `handover-validation.service.spec.ts`
- `booking-pickup-gate.integration.spec.ts` (idempotency + override)
- `booking-update-permission.util.spec.ts`
- `booking-permission.defaults.spec.ts`
- `booking-permission.matrix.spec.ts`
