# Booking Tenant Isolation Audit (Prompt 13)

Audit and hardening of secondary booking lookups for complete multi-tenant separation.

## Central helper

`BookingForeignKeyScopeService` (`backend/src/modules/bookings/tenant-scope/`)

| Method | Purpose |
|--------|---------|
| `assertCustomer` / `assertVehicle` / `assertStation` / `assertStations` | FK validation before connect/write |
| `assertBooking` / `assertInvoice` / `assertOrgMember` | Related entity scope |
| `assertBookingForeignKeys` | Batch validation for create/update payloads |
| `loadStationNameMap` | Org-scoped station enrichment reads |
| `updateBookingScoped` / `updateVehicleScoped` | `updateMany` with `{ id, organizationId }` |
| `linkVehicleDamagesForHandover` | Damage IDs must match org + vehicle |

Uniform not-found response: `BOOKING_TENANT_SCOPE_NOT_FOUND` / `Resource not found for organization` — no leak whether ID exists in another org.

## Findings and fixes

### High severity

| Area | Issue | Fix |
|------|-------|-----|
| Wizard draft create | `connect: { id }` for customer/vehicle/stations without pre-validation | `assertBookingForeignKeys` before `BookingsService.create` |
| `BookingsService.create` | Wizard path skipped customer org validation | Mandatory `assertBookingForeignKeys` for all creates |
| Handover pickup pre-check | Protocol `findUnique({ bookingId, kind })` before booking org check; leaked `existingProtocolId` | Load booking first; `findFirst({ organizationId, bookingId, kind })`; removed protocol id from conflict |
| Handover `actualStationId` | Station connect without org validation | `assertStation` before transaction |
| Handover vehicle/damage writes | `vehicle.update` / `vehicleDamage.updateMany` by id only | `updateMany` with `organizationId`; `linkVehicleDamagesForHandover` |

### Medium severity (defense-in-depth)

| Area | Issue | Fix |
|------|-------|-----|
| `BookingsService` list/detail/today | `station.findMany({ id })` without org | `loadStationNameMap` / `where: { organizationId, id }` |
| `BookingsService` today returns | `vehicleLatestState.findMany({ vehicleId })` without org | `vehicle: { organizationId }` filter |
| `BookingsService` update/cancel/no-show | `booking.update({ where: { id } })` | `updateBookingScoped` / `updateMany` + org |
| Wizard draft quote update | id-only booking update | `updateBookingScoped` in transaction |
| Allowed drivers | id-only booking update | `updateBookingScoped` |
| Eligibility recheck worker | `vehicle.findUnique({ id })` | `findFirst({ id, organizationId })` |
| Document generation worker | Job mutations by id only | All `mark*` methods require `organizationId` |

### Already safe (no change)

- Primary booking reads: `findFirst({ id, organizationId })`
- `PricingQuoteService`: org-scoped quote lifecycle
- `BookingPaymentRequestRepository`: org in all queries
- `BookingDocumentBundleService.getOrCreateBundle`: org mismatch check
- `loadProtocolsMap`: `where: { organizationId, bookingId }`
- `StationValidationService.validateBookingStations`: org-scoped station load
- Eligibility recheck scheduler: re-loads booking with org per row
- Document generation processor: `assertTenantPayload` on queue data

## Database

Migration `20260722300000_booking_tenant_scope_indexes`:
- `(organization_id, booking_id, kind)` on `booking_handover_protocols`
- `(organization_id, booking_id, customer_id)` on `booking_allowed_drivers`

## Tests

- `booking-foreign-key-scope.service.spec.ts` — cross-tenant customer/vehicle/station/booking rejection
- Existing booking module specs updated for scoped repository signatures

## Out of scope

- UI changes (none)
- Payment intent routes (already org-scoped via `BookingPaymentRequestRepository`)
- Generic task module patterns (reference: `TasksService.assertLinksBelongToOrg`)
