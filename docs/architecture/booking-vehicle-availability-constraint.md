# Booking Vehicle Availability — Database-Level Double-Booking Protection (Prompt 11)

Production-readiness layer preventing parallel double bookings for the same vehicle within an organization.

## Problem

`BookingsService.create` previously ran overlap checks **outside** the insert transaction. Two concurrent requests could both pass the check and insert overlapping bookings.

## Chosen solution: A + B (belt and suspenders)

| Layer | Mechanism | Purpose |
|-------|-----------|---------|
| **A — PostgreSQL exclusion constraint** | GiST `EXCLUDE` on `(organization_id, vehicle_id, tstzrange)` | Hard DB guarantee against committed overlaps |
| **B — Transactional advisory lock** | `pg_advisory_xact_lock(hashtext('booking-vehicle:org:vehicle'))` | Serialize writers per vehicle; re-check inside transaction before insert |

Application code maps both paths to stable **`409 BOOKING_CONFLICT`**.

## Interval semantics

Half-open windows: **`[pickupAt, returnAt + turnaroundBufferMinutes)`**

- Rental interval: `[start_date, end_date)`
- Effective blocked range includes turnaround buffer after `end_date`
- Adjacent bookings are allowed when `endA + bufferA <= startB` (zero buffer → `endA == startB` is OK)

Example with 60 min buffer:

```
Booking A: [Mon 08:00, Wed 08:00) + 60 min → blocks until Wed 09:00
Booking B starting Wed 08:00 → CONFLICT (inside buffer)
Booking B starting Wed 09:00 → OK (half-open, adjacent)
```

## Blocking statuses

Only these statuses occupy availability (partial index + application check):

- `PENDING`
- `CONFIRMED`
- `ACTIVE`

Non-blocking (do not appear in exclusion constraint `WHERE` clause):

- `CANCELLED`
- `NO_SHOW`
- `COMPLETED`

## Turnaround buffer source

`bookings.turnaround_buffer_minutes` is snapshotted at create/update from:

`TenantInsightPolicy.policyOverrides.handoverBufferMin` (default **60** via `DEFAULT_POLICY`)

Same field used by tight-handover business insights — single source of truth for handover buffer.

## Migration `20260722280000_booking_vehicle_availability_exclusion`

1. `CREATE EXTENSION IF NOT EXISTS btree_gist`
2. Add `turnaround_buffer_minutes` column + backfill from tenant policy
3. Detect existing buffer-aware overlaps among blocking bookings
4. Insert pairs into `booking_availability_overlap_reports` (audit, no data loss)
5. Add `bookings_vehicle_availability_excl` **only when report is empty**

If overlaps exist in production data, migration **succeeds** but skips the constraint with a `RAISE WARNING`. Application advisory locks + in-transaction checks remain active until ops resolves reported pairs.

## API error contract

```json
{
  "statusCode": 409,
  "message": "Dieses Fahrzeug ist im gewählten Zeitraum bereits gebucht.",
  "code": "BOOKING_CONFLICT",
  "conflictingBookingId": "uuid-or-null",
  "conflictRange": { "startDate": "...", "endDate": "...", "status": "CONFIRMED", "turnaroundBufferMinutes": 60 }
}
```

PostgreSQL `23P01` (exclusion_violation) is translated via `BookingVehicleAvailabilityService.rethrowAvailabilityError()`.

## Wired code paths

| Path | Lock | In-tx check | DB constraint |
|------|------|-------------|---------------|
| `BookingsService.create` | ✓ | ✓ | ✓ |
| `BookingUpdateService.updateSchedule` | ✓ | ✓ | ✓ |
| `BookingUpdateService.updateVehicle` | ✓ | ✓ | ✓ |
| Status cancel/complete | — | — | Partial index auto-frees slot |

Pre-transaction optimistic `assertNoVehicleOverlap` remains as fast-fail (same `BOOKING_CONFLICT` code).

## Concurrency test

```bash
cd backend
BOOKING_AVAILABILITY_INTEGRATION=1 npm test -- booking-vehicle-availability.concurrency.integration.spec.ts
```

Requires `DATABASE_URL` pointing to PostgreSQL 16+ with migration applied.

Asserts **100** parallel identical create attempts → exactly **1** success, **99** `BOOKING_CONFLICT`, no orphan side objects.

## Ops: reviewing pre-migration overlaps

```sql
SELECT * FROM booking_availability_overlap_reports ORDER BY detected_at DESC;
```

Resolve conflicts manually (reschedule, cancel, or correct status) then add constraint in a follow-up migration if it was skipped.

## Related modules

- `booking-availability.constants.ts` — blocking statuses, error codes
- `booking-availability-buffer.service.ts` — buffer resolution
- `booking-vehicle-availability.service.ts` — lock, conflict SQL, error mapping
- `booking-conflict.util.ts` — optimistic pre-check (`buildOverlapWhere`)
