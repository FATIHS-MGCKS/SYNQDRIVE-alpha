# Prisma historical migration chain defect — CREATE INDEX CONCURRENTLY

**Date:** 2026-09-12  
**Scope:** Repository migration deploy chain (pre-RFRF F2)  
**Status:** OPEN — unrelated to RFRF F2 migration SQL correctness  
**Related workstream:** RFRF F2.2 final closure (PR #1620)

---

## Summary

Full-repository `prisma migrate deploy` against an isolated PostgreSQL database fails at migration **`20260413230000_add_composite_indexes_batch_c`**. This is a **pre-existing historical defect** and does **not** block independent proof of the RFRF F2 migration SQL file.

---

## Observed failure

| Field | Value |
|-------|-------|
| **Command** | `cd backend && DATABASE_URL=postgresql://postgres@localhost:5433/<db> npx prisma migrate deploy` |
| **Migration** | `20260413230000_add_composite_indexes_batch_c` |
| **Prisma wrapper** | `P3018` — migration failed to apply |
| **PostgreSQL error code** | `25001` |
| **PostgreSQL message** | `CREATE INDEX CONCURRENTLY cannot run inside a transaction block` |
| **First failing SQL statement** | `CREATE INDEX CONCURRENTLY IF NOT EXISTS "vehicle_trips_vehicle_id_start_time_idx" ON "vehicle_trips" ("vehicle_id", "start_time");` |

---

## Mechanism (observed, not speculative)

1. The migration file intentionally uses `CREATE INDEX CONCURRENTLY` and documents that it must not be wrapped in `BEGIN/COMMIT` when run manually via `psql`.
2. **`prisma migrate deploy` executes migrations inside a transaction** for this repository/toolchain combination.
3. PostgreSQL rejects `CREATE INDEX CONCURRENTLY` inside a transaction block (`25001`).
4. Therefore the **full historical chain cannot complete** via standard `prisma migrate deploy` in the isolated proof environment used for F2.2.

This is **not** caused by the RFRF F2 migration (`20260912123000_rfrf_f2_raw_refuel_candidates`).

---

## RFRF F2 epistemic separation

| Label | Meaning | F2.2 result |
|-------|---------|-------------|
| `FULL_REPOSITORY_MIGRATION_CHAIN` | Entire repo migrate deploy chain | **FAIL_PRE_EXISTING** |
| `F2_MIGRATION_SQL_REAL_POSTGRES` | Actual F2 `migration.sql` executed on pre-F2 schema | **PASS** (see F2 audit §12.3) |
| `REAL_POSTGRES_SCHEMA_PROOF` | Isolated PG schema matches expected F2 objects | **PASS** |
| `REAL_POSTGRES_INTEGRATION_TESTS` | Service integration suite on isolated PG | **PASS** |

`prisma db push` was used **only** to establish the pre-F2 baseline schema for F2 SQL proof and for integration-test schema bootstrap. It is **not** claimed as migration execution proof.

---

## Remediation (out of scope for PR #1620)

Fixing the historical migration requires a separate workstream (for example splitting CONCURRENTLY index builds into non-transactional deploy steps or replacing CONCURRENTLY in transactional migrations). **Not attempted in PR #1620.**

---

## References

- Migration file: `backend/prisma/migrations/20260413230000_add_composite_indexes_batch_c/migration.sql`
- F2 proof script: `backend/scripts/ops/prove-rfrf-f2-migration-sql.sh`
- Canonical F2 audit: `docs/audits/eed-rfrf-f2-candidate-persistence-2026-09-12.md`
