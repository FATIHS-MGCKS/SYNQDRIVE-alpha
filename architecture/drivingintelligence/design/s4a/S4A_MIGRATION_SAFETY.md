# S4A — Migration safety (dormant deploy)

**Contract:** `migration`, `migrationRules`, `zeroImpactInvariants`, `activationGates.S4A_DORMANT_SCHEMA_MERGE` in [`s4a-contract.v2.json`](s4a-contract.v2.json) (AMENDED BY C1D.10C) · **Evidence:** [authority correction §2](../../evidence/EXP021_C1D10A_AUTHORITY_CORRECTION.md) (DI-CONTRA-S2-PROD-MIGRATION-001)

## 1. Premise: merge = Production migration

`vps-deploy-release.sh` runs `npm run prisma:migrate:deploy` unconditionally on every deploy. The S2 migration reached Production with an unrelated ERD fix (#1801). So **an S4A migration merged to `main` will be applied on the next deploy of any feature**, whatever the flags. Migration safety must hold with zero coordination and zero runtime code.

## 2. Rules (all mandatory, validator-listed)

| Rule | Reason |
|------|--------|
| New tables only, plus guards on the empty S2 tables | no rewrite or lock of populated tables |
| No ALTER / index / trigger on canonical tables | canonical write paths (`vehicle_trips`, `vehicles`, `organizations`) stay byte-identical in behavior |
| No backfill, no scan of canonical tables | constant-time migration regardless of fleet size |
| FKs to canonical tables only inside `CREATE TABLE`, ON DELETE CASCADE | see §4 |
| Never RESTRICT / NO ACTION to canonical; never SET NULL into a NOT NULL/CHECK column | a shadow row must never block a canonical delete |
| text + CHECK, not enums | additive evolution |
| Explicit `BEGIN; SET LOCAL lock_timeout='5s'; SET LOCAL statement_timeout='60s'; … COMMIT;` | Prisma does not wrap migrations in a transaction (repo note in `20260413230000_add_composite_indexes_batch_c`). A partial apply must be impossible, and lock waits bounded |
| Reversible by dropping only new objects | rollback never touches canonical data |

## 3. Lock analysis

| Statement | Lock | On |
|-----------|------|----|
| `CREATE TABLE di_v0_s4_* … REFERENCES vehicle_trips(id) ON DELETE CASCADE` | `SHARE ROW EXCLUSIVE` | `vehicle_trips`, `vehicles`, `organizations` (FK creation), held until COMMIT |
| `CREATE UNIQUE INDEX` on `di_v0_shadow_runs` | `SHARE` | empty S2 table |
| `CREATE TRIGGER` on S2 / new tables | `SHARE ROW EXCLUSIVE` | S2 / new tables |

`SHARE ROW EXCLUSIVE` on `vehicle_trips` conflicts with row writes (`ROW EXCLUSIVE`), so trip inserts/updates **wait** for the migration while it holds the lock. It is a new, empty table (no validation scan), so the hold time is milliseconds. `lock_timeout 5s` bounds the migration's own wait behind long canonical transactions. If it cannot get the lock it fails, and the deploy script aborts **before** PM2 restart, so the old release keeps running. Guard at the top of the migration:

```sql
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM di_v0_shadow_runs) OR EXISTS (SELECT 1 FROM di_v0_shadow_intervals) THEN
    RAISE EXCEPTION 'S4A migration requires empty S2 tables';
  END IF;
END $$;
```

(Production today: 0/0 rows, 0 inserts ever; re-read read-only in C1D.10C on 2026-09-27: `di_v0_shadow_runs=0`, `di_v0_shadow_intervals=0`, `n_tup_ins=0`.) If S2 ever gets rows before S4A deploys, the migration fails closed and a separate backfill-safe variant is needed.

**Machine contract (C1D.10C):** `migration.preconditions = [S2_SHADOW_RUNS_EMPTY, S2_SHADOW_INTERVALS_EMPTY]`, `preconditionEnforcement = IN_MIGRATION_DO_BLOCK_RAISE_EXCEPTION`, `effect = DORMANT_ONLY`, `seedRows = NONE` (the kill row is **not** seeded, so a migrated DB is effectively KILLED), rules `REQUIRES_EMPTY_S2_TABLES_PRECONDITION` and `DORMANT_ONLY_NO_SEED_ROWS`. The validator rejects a contract without them (N13, N43).

**Tables (C1D.10C):** four new tables (`di_v0_s4_work_items`, `di_v0_s4_evidence_snapshots`, `di_v0_s4_control`, `di_v0_s4_pipeline_versions`). The two control tables have no canonical FK and take no canonical lock.

**Scope guards (C1D.10C, P1-C):** every trip-anchored guard joins `vehicle_trips t JOIN vehicles v ON v.id = t.vehicle_id` and checks `t.id = NEW.trip_id AND t.vehicle_id = NEW.vehicle_id AND v.organization_id = NEW.organization_id`. The trigger reads canonical rows with a plain `SELECT` (no lock beyond the FK check) and fires only on shadow-table writes.

## 4. Why CASCADE into shadow tables is the only safe delete behavior

The ops script `repair-vehicle-trips-from-dimo.ts` uses `deleteMany` on trips, and organization/vehicle deletion already cascades. With RESTRICT or NO ACTION, any existing S4/S2 row would make those canonical deletes **fail**, which violates `NO_CONSTRAINT_THAT_CAN_FAIL_A_CANONICAL_WRITE_OR_DELETE`. With SET NULL, the delete would fail on NOT NULL/CHECK. CASCADE deletes only shadow rows. The cost is the audit loss (DI-GAP-S4-SHADOW-DELETION-AUDIT-001, P2).

Can a new constraint fail a canonical **write**? The scope-guard triggers are on the new tables and S2 only, so they fire only on shadow inserts/updates. FKs from shadow tables are checked on shadow writes and on canonical deletes (cascade). No constraint is evaluated on canonical inserts/updates. Canonical UPDATE of `vehicle_trips.id` is not an existing path (UUID PKs are immutable).

## 5. Verdict

- `S4A_MIGRATION_REQUIRED = YES` (the work items and evidence tables do not exist).
- `S4A_MIGRATION_DORMANT_SAFE = YES` under §2–§4.
- **`CAN_S4A_SCHEMA_BE_DEPLOYED_DORMANT_WITH_ZERO_RUNTIME_EFFECT = YES`.** After the migration: 0 rows, no code path writes them (S4A ships no caller: no Nest registration, no worker), canonical writes have no new trigger, index or constraint, and canonical deletes cascade through empty tables. The only runtime-visible effect is the millisecond `SHARE ROW EXCLUSIVE` hold during `CREATE TABLE`, which is bounded by `lock_timeout`.
- The S4A implementation must include a migration test that applies it to a Postgres with populated canonical fixtures, then deletes a trip, vehicle and organization, and asserts success plus cascaded shadow rows.

## 6. Rollback

`DROP TABLE di_v0_s4_work_items, di_v0_s4_evidence_snapshots, di_v0_s4_control, di_v0_s4_pipeline_versions; DROP TRIGGER di_v0_shadow_run_scope_guard …; DROP INDEX …` via a new down-migration file only, if ever needed. No canonical table changes, so no data restore is needed.
