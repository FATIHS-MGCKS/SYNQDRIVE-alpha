# ERD E5.2 — Canonical VEE RECHARGE projector idempotency (2026-09-25)

**Status:** IMPLEMENTED (persistence projector + tests only; **no runtime activation**, no cutover).  
**Baseline main:** `592a98887024e08e61048c58731ab3feaa619c3a` (post E5.1 merge)  
**Workstream stage:** `ERD_E5_2_PROJECTOR_IDEMPOTENCY`

## Purpose

Prove **one canonical `HvChargeSession` → at most one canonical `VehicleEnergyEvent.RECHARGE`** under retries, duplicate calls, independent Prisma clients, multi-replica lock contention, and transaction rollback — without product cutover or E5.3 late-native handoff.

## Transaction sequence (binding)

1. `BEGIN`
2. `acquireErdHvChargeSessionVehicleAuthorityLock(tx, vehicleId)` — **same E3 vehicle advisory lock**
3. Re-read `HvChargeSession` by `chargeSessionId` (locator only; pre-lock reads untrusted)
4. Scope + `evaluateErdRechargeProjectionEligibility`
5. Resolve existing identities (sourceEventKey, canonicalChargeSessionId, legacy dimo collision)
6. CREATE | RECONCILE | NO_OP | bounded failure
7. `COMMIT`

## Identity resolution order

1. By `canonicalChargeSessionId = session.id`
2. By `vehicleId + sourceEventKey` (mint key from `session.segmentFingerprint` at first mint)
3. If both resolve different rows → `IDENTITY_CONFLICT`
4. Legacy `dimoSegmentId` owner check before CREATE

## Immutable vs mutable (E5.2 same-authority reconciliation)

| Immutable | Mutable (projection-owned) |
|-----------|----------------------------|
| `id`, `vehicleId`, `kind`, `detectionSource`, `sourceEventKey`, `canonicalChargeSessionId`, anchor fingerprint | `dimoSegmentId`, times, duration, SOC/energy, odometer, `confidence`, `rawDetectionMeta` |

Reconcile uses anchor from existing VEE `rawDetectionMeta.anchorSegmentFingerprint` (or parsed key suffix).

`rawDetectionMeta` equality for NO_OP uses semantic JSON compare (sorted keys; null/omitted equivalent; float tolerance on scalar projection fields).

## Bounded outcomes

`CREATED`, `RECONCILED`, `NO_OP`, `NOT_PROJECTABLE`, `HANDOFF_REQUIRED`, `LEGACY_DIMO_COLLISION`, `IDENTITY_CONFLICT`, `AUTHORITY_CONFLICT`

### E5.3 boundary

When an existing ERD projection row matches `sourceEventKey` but `canonicalChargeSessionId !== session.id` → **`HANDOFF_REQUIRED`** (no mutation). E5.2 does **not** reassign authority.

### Legacy DIMO collision

If native projection would use a real `dimoSegmentId` already owned by a non-ERD (or foreign ERD) row → **`LEGACY_DIMO_COLLISION`** (fail closed; no adoption).

## Runtime reachability

| Flag | Value |
|------|-------|
| `PROJECTOR_IMPLEMENTED` | YES — `projectCanonicalRecharge()` |
| Nest provider registered | NO |
| Automatic triggers | NO |
| Production runtime reachable | NO |

Call sites: unit tests + `erd-e5-2-recharge-projector.postgres.integration.spec.ts` only.

## Tests

- Unit: reconciliation policy + E5.1 policy specs (unchanged regressions)
- PostgreSQL: T1–T20 matrix + two-`PrismaClient` race + rollback injection
- CI: `boundary-repair-postgres-ci.sh` step **9/9**

## Explicit non-goals (E5.2)

- E5.3 late-native handoff / `canonicalChargeSessionId` reassignment
- Shadow parity, product read dedupe, legacy writer disable, cutover flags
- Scheduler / worker / persist hook wiring

## Next

`ERD_E5_3_LATE_NATIVE_HANDOFF` — atomic authority reassignment under same vehicle lock.
