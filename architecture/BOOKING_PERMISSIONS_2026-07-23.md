# Booking Permissions — Granular IAM Model

**Date:** 2026-07-23  
**Prompt:** 2/34 Booking Production-Readiness  
**Status:** Model + role templates + backfill — controller enforcement in Prompt 3

## Summary

Introduced a canonical granular booking permission model aligned with tasks/payments/legal-documents patterns:

- 20 `booking.*` actions mapped to 8 membership JSON module keys
- `BookingPermissionService` + `@RequireBookingPermission()` decorator
- Updated system role templates with least-privilege defaults
- Backfill script for existing org system templates

## Module keys (new)

`bookings-sensitive`, `bookings-schedule`, `bookings-customer`, `bookings-vehicle`, `bookings-finance`, `bookings-documents`, `bookings-handover`, `bookings-audit`

Core `bookings` module retained for lifecycle read/write/manage.

## Key files

- `backend/src/modules/bookings/booking-permission.constants.ts`
- `backend/src/modules/bookings/booking-permission.defaults.ts`
- `backend/src/modules/users/defaults/organization-role.defaults.ts`
- `backend/scripts/ops/backfill-booking-permissions.ts`
- `docs/security/booking-permission-matrix.md`

## Security notes

- Driver role no longer receives `bookings.write` by default
- Sensitive/finance/signature reads require explicit submodule grants
- Org membership alone does not grant booking actions (except ORG_ADMIN/MASTER_ADMIN bypass)

## Next step (Prompt 3)

Wire `PermissionsGuard` + `@RequireBookingPermission` on `BookingsController` routes.
