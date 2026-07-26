# Master Admin — Concurrency Protection (Phase 2E.4)

**Date:** 2026-07-26  
**Version:** V4.9.894

## Summary

Phase 2E.4 hardens critical write paths against race conditions, duplicate inserts, and lost updates. Booking creation already used PostgreSQL advisory transaction locks; this phase extends the same pattern to DIMO vehicle registration, organization+admin bootstrap, and subscription draft creation, plus a partial UNIQUE index on `vehicles.dimo_vehicle_id`.

## Architecture decisions

### Advisory lock pattern (PostgreSQL)

Reused existing SynqDrive convention:
```
SELECT pg_advisory_xact_lock(hashtext(<deterministic-key>))
```
- Lock is transaction-scoped (auto-released on commit/rollback).
- Same pattern as bookings, payments, Stripe Connect, rental driving analysis.

### Layered defense for DIMO binding

1. **Application:** `vehicle-dimo-binding:{dimoVehicleId}` lock + `findFirst` check in `$transaction`.
2. **Database:** Partial `UNIQUE INDEX` on `vehicles(dimo_vehicle_id) WHERE dimo_vehicle_id IS NOT NULL`.

### Subscription draft idempotency

`createDraft` re-checks for open subscription inside locked transaction. Complements existing `BillingCommandService` idempotency at the admin API layer.

### Organization bootstrap atomicity

`createWithAdmin` now creates org + user + membership in a single transaction with email-scoped advisory lock.

## Signal flow (registerFromDimo)

```
POST /vehicles/register-from-dimo
  → VehiclesService.registerFromDimo
    → $transaction
      → pg_advisory_xact_lock(vehicle-dimo-binding:{id})
      → findFirst(vehicle WHERE dimoVehicleId)
      → vehicle.create OR ConflictException
    → post-create: consent, battery, brakes, tires (outside tx)
```

## Unchanged (verified safe)

| Path | Mechanism |
|------|-----------|
| Booking create | Advisory lock + overlap check |
| DIMO mirror upsert | `upsert` on `externalId` unique |
| Subscription activate | `lockVersion` optimistic concurrency |
| Billing admin commands | Idempotency keys via `BillingCommandService` |

## Migration

`20260726140000_vehicles_dimo_vehicle_id_partial_unique` — requires pre-deploy duplicate audit.

## References

- `docs/remediation/concurrency-protection.md`
- `backend/src/shared/database/pg-advisory-lock.util.ts`
