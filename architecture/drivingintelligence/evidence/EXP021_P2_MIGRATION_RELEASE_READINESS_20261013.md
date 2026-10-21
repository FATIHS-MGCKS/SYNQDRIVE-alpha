# EXP021 P2 — Migration release readiness (`20261013180000_di_v0_trip_speed_quality_projection_v1`)

**Status:** DOCUMENTATION (no production apply in this workstream)  
**Migration:** `backend/prisma/migrations/20261013180000_di_v0_trip_speed_quality_projection_v1/migration.sql`

## Standard SynqDrive deploy behavior

Production VPS deploy (`backend/scripts/ops/vps-deploy-release.sh` via `.cursor/scripts/cloud-agent-deploy.sh`) runs **`npx prisma migrate deploy`** against the release checkout as part of the normal backend release path. **All pending Prisma migrations in the deployed commit are applied automatically** — there is no per-migration feature flag in the deploy script.

Therefore, when this PR merges to `main` and a **regular** production deploy follows, this migration **will run** unless explicitly held back by not deploying or by operational process outside the script.

## Schema change summary (additive)

| Object | Action |
|--------|--------|
| `di_v0_trip_speed_quality_projections_v1` | **CREATE TABLE** (new) |
| `di_v0_tsqp_v1_idempotency_uq` | UNIQUE on `idempotency_key` |
| `di_v0_tsqp_v1_current_scope_uq` | UNIQUE partial index (one `CURRENT` per org/trip/qc/projection version) |
| `di_v0_tsqp_v1_org_trip_idx`, `di_v0_tsqp_v1_work_item_idx` | secondary indexes |
| FKs | `organizations`, `vehicles`, `vehicle_trips` — `ON DELETE CASCADE` |

**No changes** to existing S4/S2 tables, settlement policy, global kill, or runtime modules.

## Backward compatibility

- **Application code:** P2 projector is **not wired** into AppModule / S4C T06; pre-migration binaries ignore the new table.
- **Post-migration without P2 wiring:** empty table only; no read/write from production runtime until explicit ops invocation.
- **Rollback:** Prisma does not auto-downgrade. Rollback = forward-fix migration or restore DB backup; dropping the new table is safe only if no ops data was written.

## Lock / performance / risk

- `CREATE TABLE` + index builds: short exclusive lock on new catalog objects only; **no rewrite of large existing tables**.
- Partial unique index on `CURRENT` scope: low cardinality at launch (empty).
- Concurrent writers use application-level advisory locks; DB unique indexes prevent duplicate `CURRENT` / idempotency keys.

## Release recommendation

| Question | Answer |
|----------|--------|
| Additive? | **Yes** — new table only |
| Safe with runtime wiring OFF? | **Yes** — dormant module |
| Requires separate DBA approval? | **Recommended** if org policy treats any new production table as gated; technically coupled to **next standard deploy** once merged |
| Can ship with next joint deploy? | **Yes**, if product accepts empty ops table + no customer surface; **no separate migration run** needed beyond `migrate deploy` |
| Hold without deploy? | **Yes** — do not run VPS deploy until explicitly approved |

**Explicit approval:** Treat P2 DB footprint as **approved for merge** but **ops activation** remains a separate decision (wiring + projector invocation), consistent with prior P2 scope.
