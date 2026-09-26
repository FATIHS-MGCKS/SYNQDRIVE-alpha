# EXP-021 C1D.6 — DI V0 shadow persistence (S2)

**Date:** 2026-09-26  
**Base main:** `6200be1f244d8b75259bc947a28ce16600db5e94`  
**Gate:** `C1D6B_GATE_READY_FOR_FINAL_PREMERGE` (after C1D.6B hardening closure).

## Scope

- Prisma models + migration `20260926193000_di_v0_shadow_persistence` (amended pre-merge; not applied to Production)
- `shadow-persistence/` repository + service (persist pre-computed S1 output only)
- Tests: schema, idempotency, validation, tenant matrix, DB CHECK probes, transaction rollback, Postgres integration (`DI_V0_SHADOW_PERSISTENCE_INTEGRATION=1`)

## Out of scope

Runtime worker, BullMQ, DIMO fetch, customer controllers, legacy trip mutation, production migration execution.

## C1D.6B hardening (closure)

| Control | Mechanism |
|---------|-----------|
| Tenant integrity | `assertShadowRunTripIdentity` — trip must match vehicle + organization before any run create |
| Interval identity | `organizationId` / `vehicleId` / `tripId` on intervals always copied from persisted run |
| Completion authority | `completeRun` derives all summary counts from persisted interval rows (conflict = `CONFLICTING` only) |
| Status machine | PENDING→RUNNING→COMPLETED\|FAILED; terminal states immutable |
| DB contract | PostgreSQL CHECK on run status, source family, interval enums, speeds, interval ordering |
| Transactions | `persistCompletedRun` passes `Prisma.TransactionClient` into repository methods |

## Idempotency

- **Run:** `sha256(tripId|sourceFamily|4 version fields|inputEvidenceVersion)` → `idempotency_key`; unique `(organization_id, idempotency_key)`.
- **Interval:** unique `(shadow_run_id, interval_start)`; batch `createMany({ skipDuplicates: true })`.

## Test DB bootstrap

`bash backend/scripts/test/di-v0-shadow-persistence-postgres-bootstrap.sh` (resilient `migrate deploy`). Optional documented drift repair: `DI_V0_SHADOW_PG_SCHEMA_DRIFT_REPAIR=db-push` when canonical schema.prisma leads migrations (unrelated columns).

## Rollback (conceptual)

Drop `di_v0_shadow_intervals`, then `di_v0_shadow_runs` — no canonical trip columns touched.
