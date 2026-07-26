# Concurrency Protection — Phase 2E.4

**Date:** 2026-07-26  
**Scope:** Critical write paths — DIMO import, vehicle creation/linking, organization creation, subscription activation, booking creation  
**Status:** Implemented (application + migration)

---

## Executive summary

This review analyzed race conditions, duplicate inserts, parallel workers, lost updates, missing transactions, and missing idempotency across six critical write domains. **Booking creation was already protected** (reference pattern). **Gaps were found and remediated** in DIMO vehicle registration, organization+admin bootstrap, subscription draft creation, and manual vehicle creation. DIMO mirror sync uses per-row upserts and is inherently safe at the row level.

| Domain | Pre-remediation | Post-remediation |
|--------|-----------------|------------------|
| Booking creation | Advisory lock + overlap check in `$transaction` | Unchanged (reference) |
| DIMO mirror import (`dimo_vehicles`) | Per-row `upsert` by `externalId` | Unchanged (atomic per row) |
| DIMO → fleet registration (`registerFromDimo`) | **P1 race** — no lock, no duplicate check | Advisory lock + binding check + partial UNIQUE index |
| Manual vehicle create | DB `@@unique([vin, organizationId])` only | P2002 → `ConflictException` |
| Organization + admin bootstrap | Email check outside transaction | Transaction + advisory lock on email |
| Subscription draft | TOCTOU on `findFirst` then `create` | Advisory lock per org inside transaction |
| Subscription activate | Optimistic `lockVersion` | Unchanged (already safe) |

---

## Methodology

1. Traced write paths from controllers → services → Prisma.
2. Checked for: `$transaction`, advisory locks, optimistic locking, idempotency keys, DB unique constraints.
3. Compared against existing patterns (`bookings.service.ts`, `stripe-checkout.service.ts`, `payment-reconciliation.service.ts`).
4. Implemented minimal surgical fixes reusing shared utilities.

---

## 1. Booking creation

**Path:** `bookings.service.ts` → `create()`

**Protection (existing):**
- `pg_advisory_xact_lock(hashtext(bookingVehicleOverlapLockKey(orgId, vehicleId)))`
- Overlap assertion inside same transaction
- Quote consumption before lock (acceptable — quote is idempotent per `quoteId`)

**Test:** `booking-parallel-create.smoke.spec.ts`

**Verdict:** No change required.

---

## 2. DIMO import / mirror sync

**Paths:**
- `dimo-vehicle-sync.service.ts` — `syncMirroredVehicles()` — `upsert` by `externalId`
- `dimo-api-sync.service.ts` — identity API import (same upsert pattern)

**Analysis:**
- Each `dimo_vehicles` row is upserted atomically; no batch transaction needed.
- Parallel workers may race on the same `externalId` — last upsert wins, no duplicate rows (unique on `externalId`).
- `getNonRegisteredVehicles()` reads registered IDs then filters — eventual consistency window only affects UI list, not writes.

**Verdict:** Row-level upsert is sufficient. No code change.

---

## 3. DIMO → fleet vehicle registration (`registerFromDimo`)

**Path:** `vehicles.service.ts` → `registerFromDimo()`

### Gap (P1)

```
Request A                          Request B
─────────                          ─────────
findUniqueOrThrow(dimoVehicle)     findUniqueOrThrow(dimoVehicle)
vehicle.create(dimoVehicleId=X)    vehicle.create(dimoVehicleId=X)  ← duplicate binding
```

No application-level duplicate check. No DB unique on `vehicles.dimo_vehicle_id` (identified in 2E.3).

### Remediation

**Application (`vehicles.service.ts`):**
```typescript
await prisma.$transaction(async (tx) => {
  await acquirePgAdvisoryXactLock(tx, vehicleDimoBindingLockKey(dimoVehicleId));
  const existing = await tx.vehicle.findFirst({ where: { dimoVehicleId } });
  if (existing) throw ConflictException('DIMO_VEHICLE_ALREADY_REGISTERED');
  return tx.vehicle.create({ ... });
});
```
- Catches `P2002` on `dimo_vehicle_id` and `vin+organizationId` as fallback.

**Database (migration `20260726140000_vehicles_dimo_vehicle_id_partial_unique`):**
```sql
CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS vehicles_dimo_vehicle_id_unique
  ON vehicles (dimo_vehicle_id) WHERE dimo_vehicle_id IS NOT NULL;
```

**Pre-deploy:** Run duplicate audit (from 2E.3):
```sql
SELECT dimo_vehicle_id, COUNT(*) FROM vehicles
WHERE dimo_vehicle_id IS NOT NULL
GROUP BY 1 HAVING COUNT(*) > 1;
```

**Test:** `register-from-dimo-concurrency.smoke.spec.ts`

---

## 4. Manual vehicle creation

**Path:** `vehicles.service.ts` → `create()`

**Existing:** `@@unique([vin, organizationId])` in Prisma schema.

**Gap:** Raw Prisma `P2002` bubbled to client without structured error.

**Remediation:** Catch `P2002` → `ConflictException({ code: 'VEHICLE_VIN_ALREADY_EXISTS' })`.

---

## 5. Organization creation

### 5a. Simple `create()`

Single `organization.create` — no cross-entity race. Unchanged.

### 5b. `createWithAdmin()` (org + user + membership)

**Gap:**
```
A: findUnique(email) → null
B: findUnique(email) → null
A: create org, create user(email)
B: create org, create user(email) → P2002 or orphan org
```

**Remediation:**
- `buildOrganizationCreateInput()` extracted for reuse.
- Entire flow in `$transaction` with `pg_advisory_xact_lock(hashtext(userEmailRegistrationLockKey(email)))`.
- Email uniqueness re-checked inside transaction.

---

## 6. Subscription lifecycle

### 6a. `createDraft()`

**Gap:** `findFirst` (open subscription) outside transaction → two parallel drafts for same org.

**Remediation:**
- Advisory lock `subscription-draft:{organizationId}` inside transaction.
- Re-check `findFirst` inside locked transaction before `create`.
- Return existing contract if found (idempotent semantics preserved).

**Note:** `BillingSubscriptionAdminService.createDraft` already wraps via `BillingCommandService` idempotency — application lock adds defense in depth.

### 6b. `activate()` and transitions

**Existing:** Optimistic concurrency via `lockVersion` + `updateMany` with version check → `OPTIMISTIC_LOCK_FAILED`.

**Verdict:** No change required.

---

## 7. Shared infrastructure added

| File | Purpose |
|------|---------|
| `shared/database/pg-advisory-lock.util.ts` | `acquirePgAdvisoryXactLock`, lock key helpers |
| `shared/database/prisma-error.util.ts` | `isPrismaUniqueViolation()` for P2002 handling |

**Lock key conventions:**
| Key | Scope |
|-----|-------|
| `booking-vehicle-overlap:{orgId}:{vehicleId}` | Booking overlap (existing) |
| `vehicle-dimo-binding:{dimoVehicleId}` | DIMO registration |
| `subscription-draft:{organizationId}` | Subscription draft |
| `user-email-registration:{email}` | Org+admin bootstrap |

All use `pg_advisory_xact_lock(hashtext(key))` — released automatically at transaction end.

---

## 8. Parallel workers

| Worker / job | Concurrency risk | Mitigation |
|--------------|------------------|------------|
| DIMO vehicle sync | Upsert races | `externalId` unique — safe |
| DIMO poll / webhook | Per-vehicle signal writes | Existing per-vehicle paths; no duplicate trip boundaries (DIMO Segments canonical) |
| Billing command runner | Duplicate commands | `BillingCommandService` idempotency keys |
| Notification delivery | Duplicate sends | Redis distributed lock + occurrence idempotency (pre-existing) |

No new worker changes in 2E.4 — write-path hardening at service layer.

---

## 9. Risk register (residual)

| ID | Risk | Severity | Mitigation status |
|----|------|----------|-------------------|
| C1 | Duplicate `dimo_vehicle_id` binding | P1 | Fixed (app + DB) |
| C2 | Duplicate org admin email | P2 | Fixed (transaction + lock) |
| C3 | Duplicate subscription draft per org | P2 | Fixed (transaction + lock) |
| C4 | VIN duplicate without clear error | P3 | Fixed (ConflictException) |
| C5 | Orphan org if user create fails mid-flow | P2 | Fixed (single transaction) |
| C6 | Historical duplicate `dimo_vehicle_id` rows block migration | P1 ops | Pre-migration audit required |

---

## 10. Files changed

| File | Change |
|------|--------|
| `backend/src/shared/database/pg-advisory-lock.util.ts` | New |
| `backend/src/shared/database/prisma-error.util.ts` | New |
| `backend/src/modules/vehicles/vehicles.service.ts` | `registerFromDimo`, `create` hardened |
| `backend/src/modules/organizations/organizations.service.ts` | `createWithAdmin` transaction + lock |
| `backend/src/modules/billing/subscription-lifecycle.service.ts` | `createDraft` lock inside tx |
| `backend/prisma/migrations/20260726140000_vehicles_dimo_vehicle_id_partial_unique/` | Partial UNIQUE + index |
| `backend/src/modules/vehicles/register-from-dimo-concurrency.smoke.spec.ts` | New smoke test |
| `backend/src/shared/database/prisma-error.util.spec.ts` | New unit test |

---

## 11. Deployment notes

1. **Run duplicate audit** on `vehicles.dimo_vehicle_id` before migration.
2. Apply migration `20260726140000_vehicles_dimo_vehicle_id_partial_unique` (CONCURRENTLY — no table lock).
3. Deploy application code (advisory locks are backward-compatible).
4. Monitor `DIMO_VEHICLE_ALREADY_REGISTERED` and `VEHICLE_VIN_ALREADY_EXISTS` conflict rates.

---

## Related documents

- `docs/remediation/tenant-boundary-validation.md` (2E.1)
- `docs/remediation/dimo-vehicle-integrity.md` (2E.2)
- `docs/remediation/database-integrity-review.md` (2E.3)
- `architecture/MASTER_ADMIN_CONCURRENCY_PROTECTION_2026-07-26.md`
