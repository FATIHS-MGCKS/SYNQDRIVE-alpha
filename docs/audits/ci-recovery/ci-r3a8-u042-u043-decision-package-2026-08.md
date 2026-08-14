# CI-R3A.8 — U042 / U043 decision authority package

**Phase:** CI-R3A.8 + **CI-R3A.8.1** + **CI-R3A.8.2** + **CI-R3A.8.3** (analysis and decision authority only)
**Branch:** `fix/ci-r3a-vehicle-trips-migration-authority-audit-2026-08`
**Base HEAD analysed:** `03de93b9179011525e12fd90f1399a501e2a7e5e`
**Latest correction:** CI-R3A.8.3 (U042 guard definition, source authority and counter integrity)
**Master audit:** `docs/audits/ci-recovery/ci-r3a-vehicle-trips-migration-authority-audit-2026-08.md` (§17e, §17f, §17g, §17h)
**Accepted live evidence:** `docs/audits/ci-recovery/ci-r3a7-production-catalog-evidence-2026-08.json` (unchanged by CI-R3A.8 / CI-R3A.8.1 / CI-R3A.8.2 / CI-R3A.8.3)

Pinned Prisma authority (read from `backend/package-lock.json` at analysed HEAD):

| Field | Value |
|-------|-------|
| `PINNED_PRISMA_CLI_VERSION` | **5.22.0** |
| `PINNED_PRISMA_ENGINE_COMMIT` | **605197351a3c8bdd595af2d2a9bc3025bca48ea2** |

## 0. Purpose, authority basis and non-goals

This package converts the two remaining ledger blockers of the CI-R3A audit into an
independently reviewable decision record:

- **U042** — which mechanism may safely repair the casing/replay defect around
  `20260425000000_retire_user_assignment_and_speeding_severity`.
- **U043** — whether the orphan table `brake_trip_metrics` is retained + bootstrapped or deprecated
  + removed.

Authority used:

| Source | Role |
|--------|------|
| `backend/prisma/migrations/20260425000000_retire_user_assignment_and_speeding_severity/migration.sql` | statement-level authority (read at the analysed HEAD) |
| `backend/prisma/migrations/` directory listing | lexical ordering authority |
| `backend/prisma/schema.prisma` | repository schema authority |
| `ci-r3a7-production-catalog-evidence-2026-08.json` | accepted live-database authority (§17d) |
| Repository-wide identifier search | current runtime/contract authority for U043 |
| `docs/audits/brake-health-production-readiness-2026-07.md` + its data artifacts | dated prior brake-health evidence |

**Non-goals (all zero in this phase):** no migration file created or edited, no Prisma schema edit,
no runtime or test change, no production access, no SSH/VPS/database credential use, no deployment,
no CI-R3B implementation, no E7/E8/E9 work.

`PRODUCTION_DATABASE_ACCESS_COUNT` = 0; `CI_R3B_IMPLEMENTATION_COUNT` = 0;
`E7_E8_E9_RUNTIME_SCOPE_COUNT` = 0.

---

# PART I — U042: casing / replay strategy

## 1. Statement-level failure authority

Target file (11 SQL statements, comments excluded; **no** explicit `BEGIN`/`COMMIT` wrapper in the
file — `TARGET_MIGRATION_EXPLICIT_BEGIN_COUNT` = 0, `TARGET_MIGRATION_EXPLICIT_COMMIT_COUNT` = 0):

`backend/prisma/migrations/20260425000000_retire_user_assignment_and_speeding_severity/migration.sql`

Per-statement failure behaviour within the target file is documented in §1c. Cross-migration
persistence and recovery authority are documented in §2b, §3.5 and §3.6.

| # | Statement | Required pre-state | Object casing expected | Enum dependency | Effect | Expected post-state | Failure within target file (§1c) | Operates on |
|---|-----------|--------------------|------------------------|-----------------|--------|---------------------|------------------------------|-------------|
| S1 | `UPDATE "VehicleTrip" SET assignment_status='UNKNOWN_ASSIGNMENT', assignment_subject_type=NULL, assignment_subject_id=NULL WHERE assignment_status::text='ASSIGNED_USER'` | relation `"VehicleTrip"` exists with columns `assignment_status`, `assignment_subject_type`, `assignment_subject_id` | **PascalCase** `"VehicleTrip"` | `TripAssignmentStatus` must exist and contain label `UNKNOWN_ASSIGNMENT`; predecessor label `ASSIGNED_USER` is **not** required (comparison is `::text`) | normalises retired rows | no row carries `ASSIGNED_USER` | YES | real table (DML) |
| S2 | `ALTER TYPE "TripAssignmentStatus" RENAME TO "TripAssignmentStatus_old"` | type `TripAssignmentStatus` exists; no type named `TripAssignmentStatus_old` exists | type identifier PascalCase | predecessor enum type must exist (type presence, not label set) | renames the type; dependent columns follow the type OID | dependent columns typed `TripAssignmentStatus_old` | YES | enum type |
| S3 | `CREATE TYPE "TripAssignmentStatus" AS ENUM ('ASSIGNED_DRIVER','ASSIGNED_BOOKING_CUSTOMER','PRIVATE_UNASSIGNED','UNKNOWN_ASSIGNMENT')` | name `TripAssignmentStatus` free (released by S2) | type identifier PascalCase | creates the replacement enum (4 ordered labels) | new type exists | replacement type present, no column bound to it yet | YES | enum type |
| S4 | `ALTER TABLE "VehicleTrip" ALTER COLUMN "assignment_status" TYPE "TripAssignmentStatus" USING ("assignment_status"::text::"TripAssignmentStatus")` | relation `"VehicleTrip"` exists; its `assignment_status` column is typed on `TripAssignmentStatus_old`; every non-null value is a label of the replacement type | **PascalCase** `"VehicleTrip"` | both `TripAssignmentStatus_old` (source) and `TripAssignmentStatus` (target) must exist | rewrites the **real** column onto the replacement type; removes the last dependency on `_old` | real column typed on replacement enum | YES | real table (DDL on real column) |
| S5 | `DROP TYPE "TripAssignmentStatus_old"` | zero remaining dependencies on `TripAssignmentStatus_old` | — | drops the predecessor type | predecessor type gone | only the replacement type remains | YES (fails with SQLSTATE `2BP01` "cannot drop … other objects depend on it" if any column still depends) | enum type |
| S6 | `UPDATE "VehicleTrip" SET assignment_subject_type=NULL, assignment_subject_id=NULL WHERE assignment_subject_type::text='USER'` | relation `"VehicleTrip"` exists with both subject columns | **PascalCase** `"VehicleTrip"` | `TripAssignmentSubjectType` must exist; label `USER` not required (`::text`) | clears retired subject rows | no row carries `USER` | YES | real table (DML) |
| S7 | `ALTER TYPE "TripAssignmentSubjectType" RENAME TO "TripAssignmentSubjectType_old"` | type exists; `..._old` name free | type identifier PascalCase | predecessor enum type must exist | renames type; dependent columns follow the OID | dependent column typed `..._old` | YES | enum type |
| S8 | `CREATE TYPE "TripAssignmentSubjectType" AS ENUM ('DRIVER','BOOKING_CUSTOMER')` | name free (released by S7) | type identifier PascalCase | creates replacement enum (2 ordered labels) | new type exists | replacement type present | YES | enum type |
| S9 | `ALTER TABLE "VehicleTrip" ALTER COLUMN "assignment_subject_type" TYPE "TripAssignmentSubjectType" USING (…::text::"TripAssignmentSubjectType")` | relation `"VehicleTrip"` exists; column typed on `..._old`; all non-null values are `DRIVER`/`BOOKING_CUSTOMER` | **PascalCase** `"VehicleTrip"` | source `..._old` + target replacement type | rewrites the **real** column; removes last `_old` dependency | real column typed on replacement enum | YES | real table (DDL on real column) |
| S10 | `DROP TYPE "TripAssignmentSubjectType_old"` | zero remaining dependencies | — | drops predecessor type | predecessor type gone | only replacement type remains | YES (`2BP01` if a dependency remains) | enum type |
| S11 | `ALTER TABLE "TripDrivingImpact" DROP COLUMN IF EXISTS "speeding_severity_score"` | relation `"TripDrivingImpact"` **must exist** — `IF EXISTS` guards the *column*, never the *relation* | **PascalCase** `"TripDrivingImpact"` | none | drops the retired column if present, else no-op | relation has no `speeding_severity_score` | YES (`42P01` when the relation is absent under that casing) | real table (DDL) |

### 1a. Statement counters

| Counter | Value |
|---------|-------|
| `U042_TARGET_MIGRATION_STATEMENT_COUNT` | **11** |
| `U042_CAMELCASE_TABLE_REFERENCE_COUNT` | **5** (S1, S4, S6, S9 → `"VehicleTrip"`; S11 → `"TripDrivingImpact"`) |
| `U042_ENUM_REBUILD_SEQUENCE_COUNT` | **2** (`TripAssignmentStatus` = S2–S5; `TripAssignmentSubjectType` = S7–S10) |
| `U042_UNCLASSIFIED_STATEMENT_COUNT` | **0** |
| Statements operating on a real table | 5 (S1, S4, S6, S9, S11) |
| Statements operating on an enum type only | 6 (S2, S3, S5, S7, S8, S10) |
| Distinct PascalCase relations referenced | 2 (`"VehicleTrip"`, `"TripDrivingImpact"`) |
| Retired column referenced | 1 (`speeding_severity_score`, S11) |

Arithmetic: 5 + 6 = 11 = `U042_TARGET_MIGRATION_STATEMENT_COUNT`.

### 1b. Why the file cannot succeed on a fresh replay today

The accepted live evidence and the repository both use **lowercase** physical relations
(`vehicle_trips`, `trip_driving_impact`; §17d `casing`, `@@map` in `schema.prisma`). No migration in
the repository ever creates `"VehicleTrip"`/`"TripDrivingImpact"`, and only this one file references
them (`"VehicleTrip"`/`"TripDrivingImpact"` quoted-identifier search: 1 file). On a fresh database
the first PascalCase statement (S1) therefore raises `42P01` and the target migration fails —
independently reproduced in §2b of the master audit. Whether that failure rolls back only the target
file's own statements is scoped in §1c; it does **not** undo a separately committed pre-shim (§2b).

### 1c. Transaction-scope authority (CI-R3A.8.1 correction)

The CI-R3A.8 draft incorrectly implied that the pre-shim, target and post-shim behave as one atomic
workflow. This section replaces that claim.

#### A. Target-file execution behaviour

The 11 statements in `20260425000000_retire_user_assignment_and_speeding_severity/migration.sql`
contain no explicit transaction wrapper (`TARGET_MIGRATION_EXPLICIT_BEGIN_COUNT` = 0;
`TARGET_MIGRATION_EXPLICIT_COMMIT_COUNT` = 0).

Under the pinned Prisma CLI **5.22.0** / engine commit
**605197351a3c8bdd595af2d2a9bc3025bca48ea2**, if the complete file is submitted to PostgreSQL as one
multi-statement Simple Query, PostgreSQL's normal transactional DDL/DML rules apply **within that
single submission**. A mid-file statement failure may therefore abort the remainder of that file's
statements in the same submission.

This package does **not** state that as a universal Prisma guarantee across all engines, drivers or
execution paths. Exact pinned-engine behaviour for this repository's `prisma migrate deploy` path has
not been replay-proven here.

| Field | Value |
|-------|-------|
| `TARGET_FILE_ATOMICITY_AUTHORITY` | **PINNED_BEHAVIOR_REQUIRES_REPLAY_CONFIRMATION** |

#### B. Cross-migration workflow behaviour

The proposed Option J workflow uses **three separate migration files**:

1. pre-shim (`20260424235959_ci_r3b_trip_casing_pre_shim` — candidate only)
2. unchanged target (`20260425000000_retire_user_assignment_and_speeding_severity`)
3. post-shim (`20260425000001_ci_r3b_trip_casing_post_shim` — candidate only)

These are **not** one shared transaction.

| Counter | Value |
|---------|-------|
| `PRE_TARGET_POST_SINGLE_TRANSACTION` | **NO** |
| `CROSS_MIGRATION_ATOMICITY` | **NO** |
| `TARGET_FILE_ATOMICITY_DOES_NOT_COVER_SHIMS` | **YES** |
| `CROSS_MIGRATION_ROLLBACK_GUARANTEE` | **NO** |

Consequences (authoritative):

- A completed pre-shim **remains committed** if execution stops before or during the target.
- A completed target **remains committed** while PascalCase relation names persist if execution stops
  before or during the post-shim.
- Target-file rollback (if it occurs) does **not** restore changes committed by the pre-shim.
- `prisma migrate deploy` aborts at the first failing migration file; it does not roll back earlier
  successfully applied migration files.

### 1d. Pinned Prisma engine migration lifecycle (CI-R3A.8.2 / CI-R3A.8.3)

Independently inspected upstream Prisma engines at commit **`605197351a3c8bdd595af2d2a9bc3025bca48ea2`**
(matching `@prisma/engines-version` **5.22.0-44.605197351a3c8bdd595af2d2a9bc3025bca48ea2** in
`backend/package-lock.json`).

| File (pinned commit) | Role |
|----------------------|------|
| `schema-engine/core/src/commands/apply_migrations.rs` | per-migration orchestration |
| `schema-engine/connectors/sql-schema-connector/src/sql_migration_persistence.rs` | `_prisma_migrations` row writes |

At this pinned commit, `schema-engine/commands/src/commands/apply_migrations.rs` **does not exist**
(**SUPERSEDED BY CI-R3A.8.3** — CI-R3A.8.2 incorrectly documented that path as authoritative).

Confirmed execution order inside `apply_migrations()` for each unapplied migration:

1. `record_migration_started(migration_name, script)` → INSERT row (`started_at` populated;
   `finished_at` absent)
2. `apply_script(migration_name, script)` → execute migration SQL
3. on success: `record_successful_step(id)` → increment `applied_steps_count`
4. on success: `record_migration_finished(id)` → SET `finished_at`
5. on failure: `record_failed_step(id, logs)` → write logs; **`finished_at` is not set**

Additional preflight authority (`detect_failed_migrations()` in the orchestration file): before
applying any new migration, Prisma scans existing rows where `finished_at IS NULL AND rolled_back_at IS NULL`
and aborts deploy if any exist. That is a **between-migration** preflight — not an in-script requirement
that the current migration's own row already has `finished_at` set.

| Counter | Value |
|---------|-------|
| `PINNED_PRISMA_CLI_VERSION` | **5.22.0** |
| `PINNED_PRISMA_ENGINE_COMMIT` | **605197351a3c8bdd595af2d2a9bc3025bca48ea2** |
| `PINNED_ORCHESTRATION_SOURCE_PATH` | **schema-engine/core/src/commands/apply_migrations.rs** |
| `PINNED_PERSISTENCE_SOURCE_PATH` | **schema-engine/connectors/sql-schema-connector/src/sql_migration_persistence.rs** |
| `PINNED_ORCHESTRATION_SOURCE_EXISTS` | **YES** |
| `PINNED_PERSISTENCE_SOURCE_EXISTS` | **YES** |
| `FALSE_COMMANDS_SOURCE_PATH_EXISTS` | **NO** |
| `PINNED_ENGINE_SOURCE_VERIFIED` | **YES** |
| `MIGRATION_ROW_CREATED_BEFORE_SCRIPT` | **YES** |
| `FINISHED_AT_NULL_DURING_SCRIPT` | **YES** |
| `FINISHED_AT_SET_AFTER_SCRIPT_SUCCESS` | **YES** |
| `STALE_FALSE_PRISMA_SOURCE_PATH_COUNT` | **0** |
| `FALSE_SOURCE_PATH_ALIAS_CLAIM_COUNT` | **0** |

---

## 2. Ordering proof (no migration file created)

Neighbouring committed migrations at the analysed HEAD:

| Role | Directory |
|------|-----------|
| first lowercase-requiring migration (also `FIRST_FAILING_MIGRATION`) | `20260325161142_trip_architecture_refactor` |
| further earlier lowercase-requiring migrations | `20260331000000_v3_hardware_type`, `20260410000000_add_enrichment_status_fields`, `20260413230000_add_composite_indexes_batch_c` |
| last migration before the target | `20260422010000_vehicle_current_safety_score` |
| **target** | `20260425000000_retire_user_assignment_and_speeding_severity` |
| first migration after the target | `20260426220000_station_geofence_radius` |
| first *downstream* lowercase-requiring migration | `20260609000000_autovacuum_tuning` |

Candidate directory names (proposals only — **not created**; all are valid 14-digit
`YYYYMMDDHHMMSS` timestamps):

| Slot | Candidate directory | Timestamp read-back | Lexical constraint | Proof |
|------|--------------------|---------------------|--------------------|-------|
| Option **D** bootstrap | `20260325161141_ci_r3b_bootstrap_trip_schema_baseline` | 2026-03-25 16:11:41 | after `20260315000000`, before `20260325161142` | `20260315000000` < `20260325161141` < `20260325161142` |
| Option **J** pre-shim | `20260424235959_ci_r3b_trip_casing_pre_shim` | 2026-04-24 23:59:59 | after every earlier lowercase-requiring migration, immediately before the target | `20260422010000` < `20260424235959` < `20260425000000`; no committed directory sorts between them |
| target (unchanged) | `20260425000000_retire_user_assignment_and_speeding_severity` | 2026-04-25 00:00:00 | byte-identical, never edited | file untouched; checksum untouched |
| Option **J** post-shim | `20260425000001_ci_r3b_trip_casing_post_shim` | 2026-04-25 00:00:01 | immediately after the target, before all downstream migrations | `20260425000000` < `20260425000001` < `20260426220000` < `20260609000000`; no committed directory sorts between the target and the candidate |

Intended replay order: **D bootstrap → … → 20260413230000 → 20260422010000 → J pre-shim → target
(unchanged) → J post-shim → 20260426220000 → …**

Option D creates the lowercase base objects idempotently (`CREATE TABLE IF NOT EXISTS`,
`DO $$ … IF NOT EXISTS … CREATE TYPE`), so it is a no-op on any database that already holds them.

### 2a. Ordering counters

| Counter | Value |
|---------|-------|
| `OPTION_D_ORDER_BEFORE_FIRST_FAILURE` | **YES** |
| `OPTION_J_PRE_ORDER_BEFORE_TARGET` | **YES** |
| `OPTION_J_POST_ORDER_AFTER_TARGET` | **YES** |
| `OPTION_J_POST_ORDER_BEFORE_DOWNSTREAM` | **YES** |
| `EXISTING_MIGRATION_EDIT_COUNT` | **0** |
| `CHECKSUM_MUTATION_COUNT` | **0** |
| `INVALID_CANDIDATE_TIMESTAMP_COUNT` | **0** |
| `CANDIDATE_MIGRATION_FILE_CREATED_COUNT` | **0** |

### 2b. U042 cross-migration persistence windows (CI-R3A.8.1)

Because pre-shim, target and post-shim are **separate migration boundaries** (§1c), partial states
can persist across files even when each individual file's own submission is atomic.

| Window | Committed state | How it can persist |
|--------|-----------------|--------------------|
| **WINDOW 1** — after pre-shim, before target completion | pre-shim has committed the renames `vehicle_trips` → `"VehicleTrip"` and `trip_driving_impact` → `"TripDrivingImpact"`; relations remain PascalCase | process stops after the pre-shim; target migration fails; target migration row is left unfinished |
| **WINDOW 2** — after target completion, before post-shim completion | target migration row is finished; enum rebuild and column drop from S1–S11 have committed; relations remain PascalCase | process stops before the post-shim; post-shim fails; post-shim row is left unfinished |

| Counter | Value |
|---------|-------|
| `U042_CROSS_MIGRATION_PERSISTENCE_WINDOW_COUNT` | **2** |
| `U042_PARTIAL_PERSISTENCE_RISK_PRESENT` | **YES** |
| `U042_ZERO_PARTIAL_PERSISTENCE_PROVEN` | **NO** |
| `U042_PARTIAL_MUTATION_ALLOWED_COUNT` (CI-R3A.8) | **0** — **SUPERSEDED BY CI-R3A.8.1** (the prior zero claim incorrectly treated the three-file workflow as atomic) |

---

## 3. Precedence-ordered deterministic guard model (CI-R3A.8.2 / CI-R3A.8.3)

The CI-R3A.8 G01–G17 table is **superseded**. CI-R3A.8.1 corrected transaction scope and introduced
first-match evaluation. CI-R3A.8.2 corrected self-row lifecycle and raw/effective predicate semantics.
CI-R3A.8.3 completes guard definitions and counter accounting:

1. **POST-FC01 was self-blocking** — **SUPERSEDED BY CI-R3A.8.2**.
2. **Raw predicates were described as mutually exclusive** — **SUPERSEDED BY CI-R3A.8.2**.
3. **POST-PRE-FC05–POST-PRE-FC10 were referenced but not individually defined** — **SUPERSEDED BY CI-R3A.8.3**.
4. **Guard-row counters contained impossible arithmetic** (e.g. "20 pre-shim rows", fail-closed total 23) —
   **SUPERSEDED BY CI-R3A.8.3**.

Both shims are **guard-first**: they read catalog state and `_prisma_migrations`, evaluate ordered
predicates, and either perform a complete allowed action or raise. They are **not** executable
recovery logic in this phase.

### 3.0 Raw vs effective predicate semantics

For each outcome row *i*:

- `RAW_PREDICATE_i` = the predicate written for row *i* before precedence is applied
- `EFFECTIVE_PREDICATE_i` = `RAW_PREDICATE_i` AND NOT(any earlier `RAW_PREDICATE` matched)

First-match evaluation makes **effective outcomes** disjoint even when raw predicates overlap.

| Counter | Value |
|---------|-------|
| `U042_RAW_GUARD_PREDICATE_OVERLAP_COUNT` | **NOT_PROVEN_ZERO** |
| `U042_EFFECTIVE_OUTCOME_OVERLAP_COUNT` | **0** (by first-match definition) |
| `U042_EFFECTIVE_OUTCOME_DEFINITION_PRESENT` | **YES** |
| `U042_FIRST_MATCH_PRECEDENCE_PRESENT` | **YES** |
| `U042_RAW_PREDICATES_CLAIMED_MUTUALLY_EXCLUSIVE` | **NO** |
| `U042_GUARD_ROW_OVERLAP_COUNT` (CI-R3A.8.1) | **0** — **SUPERSEDED BY CI-R3A.8.2** (replaced by raw/effective distinction above) |

### 3.1 Evaluation order (fail-closed precedence)

The first matching **effective** outcome row determines the result. Fail-closed checks **always** take
precedence over action or no-op states.

1. invalid or contradictory `_prisma_migrations` history (excluding the expected current active
   post-shim self-row — §3.3.1)
2. duplicate relation presence (lowercase **and** PascalCase for the same logical table)
3. missing relation presence (neither lowercase nor PascalCase for either table)
4. mixed casing across the two affected tables
5. `_old` enum type residue
6. missing replacement enum types
7. invalid retired-label state
8. target / enum / relation prerequisite failures
9. only if steps 1–8 are all false: fresh-replay action or existing-applied no-op

### 3.2 Pre-shim outcome rows (first effective match wins)

| Row | RAW_PREDICATE (all parts must hold) | Classification | Allowed action |
|-----|-------------------------------------|----------------|----------------|
| PRE-FC01 | target row present and (`finished_at` is null **or** `rolled_back_at` is not null) | FAIL_CLOSED | abort |
| PRE-FC02 | for either table, lowercase **and** PascalCase relations both exist | FAIL_CLOSED | abort |
| PRE-FC03 | for either table, neither lowercase nor PascalCase relation exists | FAIL_CLOSED | abort |
| PRE-FC04 | mixed casing across the two tables | FAIL_CLOSED | abort |
| PRE-FC05 | any `_old` enum type residue | FAIL_CLOSED | abort |
| PRE-FC06 | replacement enum type missing | FAIL_CLOSED | abort |
| PRE-FC07 | retired label still present | FAIL_CLOSED | abort |
| PRE-FC08 | target prerequisite failure (columns/types/cast/schema/kind) | FAIL_CLOSED | abort |
| PRE-FC09 | target row finished while any PascalCase relation exists | FAIL_CLOSED | abort |
| PRE-ACT01 | PRE-FC01–PRE-FC09 all false; target row absent; both lowercase present; both PascalCase absent | FRESH_REPLAY_ACTION | rename to PascalCase |
| PRE-NOOP01 | PRE-FC01–PRE-FC09 all false; target finished; both lowercase present; both PascalCase absent | EXISTING_APPLIED_NOOP | no-op |

### 3.3 Post-shim three-phase model (CI-R3A.8.2)

The post-shim no longer uses a single ambiguous outcome table. It separates **preconditions**,
**action**, and **in-script postconditions**.

#### 3.3.1 Post-shim self-row lifecycle (pinned Prisma authority)

While the post-shim SQL executes inside `apply_script`, Prisma has **already** inserted exactly one
current row for this migration (§1d). During normal execution that row is **expected**, not a failure:

| Field | Expected during `apply_script` |
|-------|--------------------------------|
| `migration_name` | matches the post-shim candidate name |
| `started_at` | NOT NULL |
| `finished_at` | NULL (Prisma sets this only after `apply_script` returns successfully) |
| `rolled_back_at` | NULL |
| row count for this attempt | **1** current active self-row |

The migration SQL must **not** require its own row to already be finished. Prisma's
`detect_failed_migrations()` preflight (between migrations, before starting a new one) rejects prior
**unresolved** failed rows (`finished_at` NULL AND `rolled_back_at` NULL) — that is separate from,
and must not be conflated with, the in-script expected active self-row.

**Invalid rule (CI-R3A.8.1 — SUPERSEDED BY CI-R3A.8.2):**

> POST-FC01: post-shim row present and (`finished_at` is null or `rolled_back_at` is not null) → FAIL_CLOSED

That rule matched the normal active self-row and blocked POST-ACT01 / POST-NOOP01.

| Counter | Value |
|---------|-------|
| `EXPECTED_ACTIVE_POST_SHIM_SELF_ROW_COUNT` | **1** |
| `EXPECTED_ACTIVE_POST_SHIM_FINISHED_AT_NULL` | **YES** |
| `EXPECTED_ACTIVE_POST_SHIM_ROLLED_BACK_AT_NULL` | **YES** |
| `POST_SHIM_SELF_ROW_CLASSIFICATION` | **EXPECTED_CURRENT_ATTEMPT** |
| `POST_SHIM_SELF_ROW_FALSE_FAILURE_COUNT` | **0** |
| `STALE_UNRESOLVED_POST_SHIM_ATTEMPT_ALLOWED_COUNT` | **0** |

Fail-closed **history** predicates (distinct from the expected self-row):

| Row | Category | RAW_PREDICATE | Classification | Action |
|-----|----------|---------------|----------------|--------|
| POST-PRE-FC01 | history | two or more unresolved active rows (`finished_at` NULL AND `rolled_back_at` NULL) for the post-shim `migration_name` | FAIL_CLOSED | abort |
| POST-PRE-FC02 | history | a finished post-shim row (`finished_at` NOT NULL, `rolled_back_at` NULL) **and** an additional unresolved row for the same `migration_name` coexist | FAIL_CLOSED | abort |
| POST-PRE-FC03 | history | the current self-row has `rolled_back_at` NOT NULL | FAIL_CLOSED | abort |
| POST-PRE-FC04 | history | any older row for the post-shim `migration_name` is unresolved **and** is not the current self-row id | FAIL_CLOSED | abort |
| POST-PRE-FC05 | catalog | for either logical table, both its lowercase and PascalCase relation exist simultaneously (`vehicle_trips` and `"VehicleTrip"`, or `trip_driving_impact` and `"TripDrivingImpact"`) | FAIL_CLOSED | abort before rename/no-op |
| POST-PRE-FC06 | catalog | for either logical table, neither its lowercase nor PascalCase relation exists | FAIL_CLOSED | abort before rename/no-op |
| POST-PRE-FC07 | catalog | exactly one affected logical table is lowercase while the other affected logical table is PascalCase (e.g. `vehicle_trips` + `"TripDrivingImpact"`, or `"VehicleTrip"` + `trip_driving_impact`) | FAIL_CLOSED | abort before rename/no-op |
| POST-PRE-FC08 | catalog | one or both temporary enum types exist: `TripAssignmentStatus_old`, `TripAssignmentSubjectType_old` | FAIL_CLOSED | abort before rename/no-op |
| POST-PRE-FC09 | catalog | replacement `TripAssignmentStatus` type missing; or replacement `TripAssignmentSubjectType` type missing; or `TripAssignmentStatus` contains retired `ASSIGNED_USER`; or `TripAssignmentSubjectType` contains retired `USER`; or final ordered label sets do not match accepted authority | FAIL_CLOSED | abort before rename/no-op |
| POST-PRE-FC10 | catalog | target migration row absent; or target `finished_at` is NULL; or target `rolled_back_at` is NOT NULL; or an affected relation is outside schema `public`; or an affected relation is not an ordinary table; or a conflicting relation name or incompatible catalog object exists | FAIL_CLOSED | abort before rename/no-op |
| POST-ACT01 | action | POST-PRE-FC01–POST-PRE-FC10 all false; PascalCase relations present; lowercase relations absent; fresh replay path | FRESH_REPLAY_ACTION | rename to lowercase |
| POST-NOOP01 | action | POST-PRE-FC01–POST-PRE-FC10 all false; lowercase relations present; PascalCase relations absent; existing-applied path | EXISTING_APPLIED_NOOP | no-op |

| Counter | Value |
|---------|-------|
| `POST_SHIM_HISTORY_FAIL_CLOSED_ROW_COUNT` | **4** (POST-PRE-FC01–04) |
| `POST_SHIM_CATALOG_FAIL_CLOSED_ROW_COUNT` | **6** (POST-PRE-FC05–10) |
| `DEFINED_POST_PRE_FC01_FC10_ROW_COUNT` | **10** |
| `UNDEFINED_POST_PRE_GUARD_ROW_REFERENCE_COUNT` | **0** |
| `MISSING_POST_PRE_GUARD_ROW_ID_COUNT` | **0** |
| `DUPLICATE_POST_PRE_GUARD_ROW_ID_COUNT` | **0** |

#### 3.3.2 PHASE A — precondition evaluation (before action SQL)

Before executing rename/no-op SQL, require (for the chosen path):

| Requirement | POST-ACT01 (fresh replay) | POST-NOOP01 (existing-applied) |
|-------------|---------------------------|--------------------------------|
| exactly one expected current active post-shim self-row (§3.3.1) | YES | YES |
| POST-PRE-FC01–POST-PRE-FC10 all false (§3.3.1 guard table) | YES | YES |
| target migration finished; `rolled_back_at` NULL | YES | YES |
| PascalCase relations present | YES | NO |
| lowercase relations absent | YES | NO |
| lowercase relations present | NO | YES |
| PascalCase relations absent | NO | YES |
| replacement enums present; `_old` absent; retired labels absent | YES | YES |
| relation kinds = ordinary tables in `public`; no conflicting names | YES | YES |

`POST_SHIM_PRECONDITION_PHASE_PRESENT` = **YES**

#### 3.3.3 PHASE B — action (candidate only; not implemented)

**POST-ACT01** (when Phase A satisfied for fresh replay):

- `ALTER TABLE "VehicleTrip" RENAME TO vehicle_trips`
- `ALTER TABLE "TripDrivingImpact" RENAME TO trip_driving_impact`

**POST-NOOP01** (when Phase A satisfied for existing-applied):

- no DDL/DML

`POST_SHIM_ACTION_PHASE_PRESENT` = **YES**

#### 3.3.4 PHASE C — in-script postcondition assertions (after action SQL)

After the action statements, assert (still inside `apply_script`, before return):

- both lowercase relations exist; both PascalCase relations absent
- both relations remain ordinary tables in `public`
- replacement enums present; `_old` types absent; retired labels absent
- the current post-shim self-row still has `finished_at` NULL (Prisma has not yet called
  `record_migration_finished`)

These are **postcondition assertions**, not a rerun of POST-PRE-FC01–POST-PRE-FC10. In particular,
`POSTCONDITION_REQUIRES_SELF_FINISHED_AT_COUNT` = **0**.

After `apply_script` returns successfully, Prisma calls `record_successful_step` then
`record_migration_finished` (§1d).

`POST_SHIM_POSTCONDITION_PHASE_PRESENT` = **YES**; `POST_SHIM_PHASE_COUNT` = **3**

### 3.4 Action and no-op reachability (logical authority only)

These are **logical** proofs that the corrected model is not self-blocked. They are **not** claims of
completed executable replay.

#### Fresh replay path → POST-ACT01

At post-shim execution (after target finished successfully), all ten POST-PRE-FC guards are false when:

| Guard | Why false on fresh replay path |
|-------|--------------------------------|
| POST-PRE-FC01 | exactly one expected current active self-row; no second unresolved row |
| POST-PRE-FC02 | no finished prior post-shim row coexisting with an additional unresolved row |
| POST-PRE-FC03 | current self-row `rolled_back_at` is NULL |
| POST-PRE-FC04 | no older unresolved row other than the current self-row |
| POST-PRE-FC05 | PascalCase present and lowercase absent — not both simultaneously |
| POST-PRE-FC06 | both PascalCase relations exist |
| POST-PRE-FC07 | both relations are PascalCase (not mixed) |
| POST-PRE-FC08 | target enum rebuild completed; no `_old` enum types remain |
| POST-PRE-FC09 | replacement enums present with accepted final label sets; retired labels absent |
| POST-PRE-FC10 | target row finished; relations are ordinary tables in `public`; no conflicting catalog objects |

→ **POST-ACT01 is reachable.** After action, postconditions pass; `apply_script` returns; Prisma sets
`finished_at`.

| Counter | Value |
|---------|-------|
| `POST_ACT01_ALL_PRECONDITIONS_ENUMERATED` | **YES** |
| `POST_ACT01_FALSE_GUARD_COUNT` | **10** |
| `POST_ACT01_FRESH_REPLAY_REACHABLE` | **YES** |
| `POST_ACTION_PATH_SELF_BLOCKED` | **NO** |

#### Existing-applied path → POST-NOOP01

When the retroactive post-shim is first applied to an already-lowercase database, all ten POST-PRE-FC
guards are false when:

| Guard | Why false on existing-applied path |
|-------|------------------------------------|
| POST-PRE-FC01 | exactly one expected current active self-row |
| POST-PRE-FC02 | no contradictory finished + unresolved post-shim history |
| POST-PRE-FC03 | current self-row `rolled_back_at` is NULL |
| POST-PRE-FC04 | no stale unresolved older attempt |
| POST-PRE-FC05 | lowercase present and PascalCase absent — not both simultaneously |
| POST-PRE-FC06 | both lowercase relations exist |
| POST-PRE-FC07 | both relations are lowercase (not mixed) |
| POST-PRE-FC08 | no `_old` enum types |
| POST-PRE-FC09 | replacement enums present with accepted final label sets |
| POST-PRE-FC10 | target row finished; relations are ordinary tables in `public` |

→ **POST-NOOP01 is reachable** (no-op action; postconditions trivially pass).

| Counter | Value |
|---------|-------|
| `POST_NOOP01_ALL_PRECONDITIONS_ENUMERATED` | **YES** |
| `POST_NOOP01_FALSE_GUARD_COUNT` | **10** |
| `POST_NOOP01_EXISTING_APPLIED_REACHABLE` | **YES** |
| `POST_NOOP_PATH_SELF_BLOCKED` | **NO** |

### 3a. Guard counters (CI-R3A.8.3)

#### Pre-shim accounting

| Counter | Value | Derivation |
|---------|-------|------------|
| `U042_PRE_SHIM_FAIL_CLOSED_ROW_COUNT` | **9** | PRE-FC01–PRE-FC09 |
| `U042_PRE_SHIM_ACTION_NOOP_ROW_COUNT` | **2** | PRE-ACT01, PRE-NOOP01 |
| `U042_PRE_SHIM_OUTCOME_ROW_COUNT` | **11** | 9 + 2 |

#### Post-shim accounting

| Counter | Value | Derivation |
|---------|-------|------------|
| `U042_POST_SHIM_HISTORY_FAIL_CLOSED_ROW_COUNT` | **4** | POST-PRE-FC01–04 |
| `U042_POST_SHIM_CATALOG_FAIL_CLOSED_ROW_COUNT` | **6** | POST-PRE-FC05–10 |
| `U042_POST_SHIM_FAIL_CLOSED_ROW_COUNT` | **10** | 4 + 6 |
| `U042_POST_SHIM_ACTION_NOOP_ROW_COUNT` | **2** | POST-ACT01, POST-NOOP01 |
| `U042_POST_SHIM_OUTCOME_ROW_COUNT` | **12** | 10 + 2 |

#### Total guard accounting

| Counter | Value | Derivation |
|---------|-------|------------|
| `U042_FAIL_CLOSED_ROW_COUNT` | **19** | 9 + 4 + 6 |
| `U042_ACTION_NOOP_ROW_COUNT` | **4** | 2 + 2 |
| `U042_GUARD_OUTCOME_ROW_COUNT` | **23** | 11 + 12 = 19 + 4 |
| `U042_GUARD_COUNTER_ARITHMETIC_MISMATCH_COUNT` | **0** |

The postcondition assertion phase (§3.3.4) is **not** counted as a guard outcome row.

| Counter | Value |
|---------|-------|
| `U042_GUARD_STATE_SPACE_STATUS` | **INCOMPLETE_PENDING_EXECUTABLE_REPLAY** |
| `U042_FRESH_REPLAY_ACTION_ROW_COUNT` | **2** (PRE-ACT01, POST-ACT01) |
| `U042_EXISTING_APPLIED_NOOP_ROW_COUNT` | **2** (PRE-NOOP01, POST-NOOP01) |
| `U042_UNCLASSIFIED_STATE_COUNT` | **NOT_PROVEN_ZERO** |
| `U042_PARTIAL_PERSISTENCE_RISK_PRESENT` | **YES** |
| `U042_ZERO_PARTIAL_PERSISTENCE_PROVEN` | **NO** |
| `U042_PRODUCTION_RENAME_COUNT` | **0** (when effective path is PRE-NOOP01 + POST-NOOP01) |
| `U042_PRODUCTION_DATA_MUTATION_COUNT` | **0** |
| `STALE_PRE_SHIM_OUTCOME_COUNT_20_CLAIM_COUNT` | **0** |
| `STALE_PRE_SHIM_FAIL_CLOSED_COUNT_13_CLAIM_COUNT` | **0** |
| `STALE_TOTAL_FAIL_CLOSED_COUNT_23_CLAIM_COUNT` | **0** |

Historical (**SUPERSEDED BY CI-R3A.8.3**): CI-R3A.8.2 claimed `U042_GUARD_OUTCOME_ROW_COUNT` = 20
pre-shim rows + misc post-shim parts; `U042_FAIL_CLOSED_ROW_COUNT` = 23 via 13 + 4 + 6. CI-R3A.8.1
`U042_GUARD_ROW_OVERLAP_COUNT` = 0 (superseded by raw/effective semantics — §3.0). G01–G17 table
superseded.

### 3.5 Recovery states (authority documentation only)

These rows describe observable cross-migration states. They are **not** executable recovery logic.
Effective recovery-state classification uses the same first-match precedence as §3.0.

| Row | `_prisma_migrations` predicates | Lowercase | PascalCase | Meaning |
|-----|--------------------------------|-----------|------------|---------|
| **R01** | pre-shim finished; target absent; post-shim absent | absent | present | stopped after pre-shim, before target |
| **R02** | pre-shim finished; target unfinished/failed; post-shim absent | absent | present | target failed after pre-shim |
| **R03** | pre-shim finished; target finished; post-shim absent | absent | present | stopped after target, before post-shim |
| **R04** | target finished; post-shim **`apply_script` failed or was abandoned** — unresolved row with logs and/or partial rename side effects; **not** the expected single active self-row during normal in-flight execution | absent or mixed | present (full or partial) | genuine post-shim failure state |

**R04 correction (CI-R3A.8.2):** the expected current active post-shim self-row during normal
`apply_script` (`finished_at` NULL, `rolled_back_at` NULL, no failure logs yet) is classified as
**EXPECTED_CURRENT_ATTEMPT**, **not** R04.

| Counter | Value |
|---------|-------|
| `U042_RECOVERY_STATE_ROW_COUNT` | **4** |
| `U042_RECOVERY_STATE_OVERLAP_COUNT` | **0** (effective classification by precedence) |
| `U042_UNCLASSIFIED_RECOVERY_STATE_COUNT` | **0** |
| `EXPECTED_ACTIVE_SELF_ROW_MISCLASSIFIED_AS_R04_COUNT` | **0** |

### 3.6 U042 recovery authority and replay requirements

#### Disposable fresh replay database

- preferred recovery after any failed or partial Option J attempt: **destroy the database and recreate
  from empty**, then rerun `prisma migrate deploy`
- do **not** normalize a failed replay by manually marking migrations applied
- do **not** use `db push`
- do **not** edit the historical target migration
- do **not** mutate migration checksums

#### Non-disposable database

- no automatic recovery is authorized by this package
- require independent inspection of catalog state and `_prisma_migrations`
- require a separately approved recovery procedure before any mutation
- this phase does **not** prescribe or execute production mutation

#### Future fault-injection gates (documented, not executed)

| Gate | Scenario | Must prove |
|------|----------|------------|
| **F01** | stop after pre-shim commit and before target start | observable catalog + `_prisma_migrations` match R01; safe reset/recovery; clean retry succeeds |
| **F02** | force target failure after pre-shim commit | observable state matches R02; safe reset/recovery; clean retry succeeds |
| **F03** | stop after target completion and before post-shim | observable state matches R03; safe reset/recovery; clean retry succeeds |
| **F04** | force post-shim failure | observable state matches R04; safe reset/recovery; clean retry succeeds |

Each gate must additionally prove: final lowercase casing; no `_old` enum residue; exact final parity
with accepted CI-R3A.7 evidence (`ci-r3a7-production-catalog-evidence-2026-08.json`).

| Counter | Value |
|---------|-------|
| `U042_REQUIRED_FAULT_INJECTION_GATE_COUNT` | **4** |
| `U042_FAULT_INJECTION_GATE_EXECUTED_COUNT` | **0** |
| `U042_RECOVERY_PROCEDURE_IMPLEMENTED_COUNT` | **0** |
| `U042_RECOVERY_PROCEDURE_ACCEPTED_COUNT` | **0** |

---

## 4. Dependency and final-shape proof

| # | Question | Answer (authority) |
|---|----------|--------------------|
| D1 | Why must the **actual** relation participate in the enum conversion instead of a disposable dummy table? | S2 renames the type, so the real `vehicle_trips.assignment_status` column silently becomes typed on `TripAssignmentStatus_old` (rename changes `pg_type.typname`, not the type OID the column points at). If a dummy `"VehicleTrip"` existed only to satisfy the identifier, S4 would convert the dummy column, the real column would stay bound to `TripAssignmentStatus_old`, and **S5 `DROP TYPE "TripAssignmentStatus_old"` would fail** with SQLSTATE `2BP01` (dependent objects). The same applies to S7–S10. A dummy table therefore cannot make the file succeed. |
| D2 | How do table renames affect foreign-key relation targets? | `ALTER TABLE … RENAME TO` mutates `pg_class.relname` only. `pg_constraint` rows store `conrelid`/`confrelid` OIDs, so both inbound and outbound foreign keys stay attached across a rename and re-render with the final name after the post-shim. |
| D3 | How do indexes and constraints remain attached? | `pg_index` (`indrelid`) and `pg_constraint` (`conrelid`) reference the relation OID, which a rename does not change; column defaults live in `pg_attrdef` keyed by `attrelid`. A table rename also does **not** rename indexes or constraints, so `vehicle_trips_pkey`, `brake_trip_metrics_*`-style names and all `*_idx` names created by Option D survive the pre/post window unchanged and match the accepted JSON `definition` strings after the post-shim. |
| D4 | How does the original enum rebuild move the real assignment columns onto the replacement types? | S4 and S9 execute `ALTER COLUMN … TYPE … USING (…::text::…)` against the real relation, rewriting each row through its text representation onto the replacement type. This is exactly why the real relation must carry the identifier the statement uses. |
| D5 | Why may no column remain dependent on a temporary `_old` enum? | S5/S10 `DROP TYPE` are unguarded. Any surviving dependency aborts them (`2BP01`) and, **within the target file's own submission**, may abort the remainder of that file (§1c). This does not roll back a separately committed pre-shim. At the point the target runs on a fresh replay, the only dependents are the two assignment columns on `"VehicleTrip"` (the later `misuse_cases` snapshot columns typed on these enums are created by `20260615140000`, i.e. after the target), so S4/S9 remove the last dependency and S5/S10 can succeed when the target completes. |
| D6 | How does the post-shim restore lowercase relation names? | POST-ACT01 (Phase B) renames `"VehicleTrip"` → `vehicle_trips` and `"TripDrivingImpact"` → `trip_driving_impact`; Phase C postcondition assertions verify lowercase final authority while the expected active self-row still has `finished_at` NULL inside `apply_script`. Prisma then sets `finished_at` after successful return (§1d). If the post-shim never runs, WINDOW 2 persists (§2b, R03). |
| D7 | Why must the final schema match the accepted JSON evidence? | The accepted CI-R3A.7.1 capture is the authority for the target shape: lowercase `relname`, camelCase ghosts absent, `public_uppercase_relation_count = 0`, `trip_driving_impact` without `speeding_severity_score`, `TripAssignmentStatus` with 4 labels and no `ASSIGNED_USER`, `TripAssignmentSubjectType` = `{DRIVER, BOOKING_CUSTOMER}`, repository/live diff totals all 0. Any replay ending in a different shape would create drift against production. |
| D8 | Why can ordinary later migrations not repair a failure that happens earlier? | `prisma migrate deploy` applies migrations in lexical order and aborts at the first failure (`P3018`). A repair dated after `20260425000000` never executes on a fresh database, so end-of-history repair cannot rescue this file. |

Additional checked dependency surfaces: no committed migration creates a view or materialized view
(`CREATE [OR REPLACE] [MATERIALIZED] VIEW` search over `backend/prisma/migrations` = 0 hits), so no
view depends on either relation name; the two affected relations use expression/`uuid` defaults, not
owned sequences.

### 4a. Dependency counters

| Counter | Value |
|---------|-------|
| `DUMMY_TABLE_STRATEGY_ACCEPTED` | **NO** |
| `LOWERCASE_FINAL_RELATION_COUNT` | **2** (`vehicle_trips`, `trip_driving_impact`) |
| `CAMELCASE_FINAL_RELATION_COUNT` | **0** |
| `OLD_ENUM_DEPENDENCY_REMAINDER_COUNT` | **0** |
| `FINAL_SHAPE_TARGET` | **ACCEPTED_CI_R3A7_JSON** |
| `UNRESOLVED_DEPENDENCY_EFFECT_COUNT` | **0** |
| `DEPENDENT_VIEW_COUNT` (committed migrations) | **0** |

---

## 5. U042 decision classification (CI-R3A.8.1)

| Option | Mechanism | Empty-DB replay | Existing production DB | Classification |
|--------|-----------|-----------------|------------------------|----------------|
| **B** | Edit the applied migration `20260425000000` (rewrite identifiers) | would pass | mutates the checksum of a migration already recorded finished; breaks history integrity for every deployed database | `OPTION_B_STATUS` = **REJECTED_UNSAFE** |
| **E/F (end-of-history)** | Append a repair migration after the current head | never reached — deploy aborts at `20260425000000` (D8) | no effect on the defect | `END_OF_HISTORY_REPAIR_STATUS` = **REJECTED_TOO_LATE** |
| **Dummy compatibility tables** | Create throwaway `"VehicleTrip"`/`"TripDrivingImpact"` relations to satisfy the identifiers | fails at S5 (`2BP01`, D1) | pollutes the schema with ghost relations | `DUMMY_TABLE_STATUS` = **REJECTED** |
| **J (guarded retroactive pre/post shim)** | Append-only guard-first shims immediately before/after the target; target byte-identical | ordering (§2) + dependency proof (§4) documented; guard model corrected (§3); cross-migration persistence windows documented (§2b); recovery/fault-injection proof **not yet executed** | intended PRE-NOOP01 + POST-NOOP01 path when all fail-closed predicates false — not independently approved | **candidate only** — not safe, not accepted, not recovery-proven |
| **No repair** | Leave the history broken | fresh replay stays red | production unaffected but no reproducible environment provisioning | rejected — the CI gate remains red |

### 5a. U042 status (CI-R3A.8.1)

| Field | Value |
|-------|-------|
| `U042_TECHNICAL_RECOMMENDATION` | **OPTION_J_CANDIDATE_WITH_UNRESOLVED_CROSS_MIGRATION_RECOVERY** |
| `U042_STATUS` | **INDEPENDENT_REVIEW_CORRECTION_REQUIRED** |
| `CASING_STRATEGY_STATUS` | **INSUFFICIENT_AUTHORITY** |
| `END_TO_END_R3B_STRATEGY_STATUS` | **BLOCKED** |
| `U042_INDEPENDENT_APPROVAL_PRESENT` | **NO** |
| `OPTION_B_STATUS` | **REJECTED_UNSAFE** |
| `END_OF_HISTORY_REPAIR_STATUS` | **REJECTED_TOO_LATE** |
| `DUMMY_TABLE_STATUS` | **REJECTED** |
| `OPTION_J_IMPLEMENTATION_COUNT` | **0** |
| `U042_RESOLVED_COUNT` | **0** |

CI-R3A.8 values (`OPTION_J_GUARDED_PRE_POST_CANDIDATE`,
`TECHNICALLY_SPECIFIED_PENDING_INDEPENDENT_APPROVAL_AND_REPLAY`, `CANDIDATE_NOT_IMPLEMENTED`) are
**SUPERSEDED BY CI-R3A.8.1**.

Option J is **not** safe, **not** accepted, **not** complete, **not** fully internally consistent,
**not** replay-proven and **not** recovery-proven. It must **not** be approved for CI-R3B
implementation until all gates below pass.

Mandatory CI-R3B acceptance gates (none executed):

1. independent review of §1c transaction scope, §2b persistence windows, §3 guard model, §3.5 recovery
   states and §3.6 recovery authority;
2. pinned-engine replay confirmation of target-file atomicity (`TARGET_FILE_ATOMICITY_AUTHORITY`);
3. full `prisma migrate deploy` replay on a **fresh empty database** reaching the current head;
4. all four fault-injection gates F01–F04 executed with documented evidence;
5. proof that the replayed schema equals the accepted CI-R3A.7.1 shape;
6. proof that on an already-applied production-like database both shims resolve to PRE-NOOP01 +
   POST-NOOP01 when all fail-closed predicates are false;
7. no edit to any existing migration file and no checksum mutation.

---

# PART II — U043: `brake_trip_metrics` retain vs deprecate

## 6. Complete current-authority search

Search executed at the analysed HEAD over the whole working tree (excluding `.git`, `node_modules`,
`dist`, `build`), case-insensitive, covering `BrakeTripMetric`, `brakeTripMetric`,
`brakeTripMetrics` and `brake_trip_metrics` in one pass. Each physical line is counted **once**.
The counts are the pre-existing baseline at `03de93b9…`, i.e. they exclude this decision package
itself.

| File | Hits | Lines | Classification |
|------|------|-------|----------------|
| `backend/prisma/schema.prisma` | 1 | 9025 (`model BrakeTripMetric {`) | PRISMA_SCHEMA_MODEL |
| `backend/prisma/schema.prisma` | 1 | 9042 (`@@map("brake_trip_metrics")`) | PRISMA_SCHEMA_MODEL |
| `backend/prisma/schema.prisma` | 1 | 2940 (`brakeTripMetrics BrakeTripMetric[]` on `Vehicle`) | PRISMA_RELATION_ONLY |
| `scripts/audits/audit-brake-health-production-readiness.ts` | 1 | 210 (`SELECT count(*) FROM brake_trip_metrics` inside an audit-only raw query) | AUDIT_SCRIPT_ONLY |
| `docs/audits/brake-health-production-readiness-2026-07.md` | 9 | 50, 193, 304, 420, 455, 817, 894, 895, 1360 | DOCUMENTATION_ONLY |
| `docs/audits/data/brake-health-integrity-findings-2026-07.json` | 4 | 51, 246, 248, 252 | DOCUMENTATION_ONLY |
| `docs/audits/data/brake-health-code-map-2026-07.csv` | 1 | 70 | DOCUMENTATION_ONLY |
| `docs/audits/data/brake-health-lifecycle-evidence-map-2026-07.csv` | 1 | 5 | DOCUMENTATION_ONLY |
| `docs/audits/driving-analysis-production-reality.md` | 1 | 271 | DOCUMENTATION_ONLY |
| `architecture/ARCHITECTURE_REVIEW_2026-04-10.md` | 1 | 157 | DOCUMENTATION_ONLY |
| `docs/audits/ci-recovery/ci-r3a-vehicle-trips-migration-authority-audit-2026-08.md` | 12 | 150, 212, 328, 347, 362, 389, 395, 408, 442, 671, 708, 733 | DOCUMENTATION_ONLY |
| `docs/audits/ci-recovery/ci-r3a7-production-catalog-evidence-2026-08.json` | 12 | 4012, 4161, 4166, 4173, 4174, 4177, 4178, 4181, 4182, 4391, 4411, 4422 | DOCUMENTATION_ONLY |

### 6a. Search counters

| Counter | Value |
|---------|-------|
| `U043_SEARCH_HIT_COUNT` | **45** |
| `U043_UNCLASSIFIED_SEARCH_HIT_COUNT` | **0** |
| `U043_DUPLICATE_COUNTED_HIT_COUNT` | **0** |
| `U043_PRISMA_SCHEMA_MODEL_COUNT` | **2** |
| `U043_PRISMA_RELATION_ONLY_COUNT` | **1** |
| `U043_EXECUTABLE_RUNTIME_READER_COUNT` | **0** |
| `U043_EXECUTABLE_RUNTIME_WRITER_COUNT` | **0** |
| `U043_RAW_SQL_RUNTIME_USAGE_COUNT` | **0** |
| `U043_TEST_OR_FIXTURE_USAGE_COUNT` | **0** |
| `U043_API_OR_UI_CONTRACT_COUNT` | **0** |
| `U043_MIGRATION_DDL_COUNT` | **0** |
| `U043_AUDIT_SCRIPT_ONLY_COUNT` | **1** |
| `U043_DOCUMENTATION_ONLY_COUNT` | **41** |
| `U043_PRODUCT_AUTHORITY_HIT_COUNT` | **0** |
| `U043_UNKNOWN_CLASSIFICATION_COUNT` | **0** |

Arithmetic: 2 + 1 + 0 + 0 + 0 + 0 + 0 + 0 + 1 + 41 + 0 + 0 = **45** = `U043_SEARCH_HIT_COUNT`.

Notes on classification boundaries:

- The single raw-SQL hit lives in `scripts/audits/audit-brake-health-production-readiness.ts`, an
  audit script executed on demand, not part of the NestJS application runtime. It is counted once as
  `AUDIT_SCRIPT_ONLY`, therefore `U043_RAW_SQL_RUNTIME_USAGE_COUNT` = 0.
- There is **no** `prisma.brakeTripMetric.*` call anywhere in `backend/src` or `frontend/src`
  (readers = writers = 0), no DTO/response type, no i18n label and no test fixture.
- Zero migration file references the table (`U043_MIGRATION_DDL_COUNT` = 0) — consistent with §4 of
  the master audit (`Clean CREATE TABLE` = 0, evolution-DDL migrations = none).

---

## 7. Existing authority reconciliation

| Authority dimension | Evidence | Statement |
|---------------------|----------|-----------|
| Live table existence | accepted JSON `tables[]` → `brake_trip_metrics` `present = true` | the physical table exists in production **today** |
| Live shape | accepted JSON: 11 columns (`id`, `vehicle_id`, `trip_id`, `brake_energy_kj`, `hard_brake_count`, `avg_deceleration_ms2`, `max_deceleration_ms2`, `brake_duration_sec`, `distance_km`, `recorded_at`, `created_at`), 2 constraints (`brake_trip_metrics_pkey`, `brake_trip_metrics_vehicle_id_fkey`), 3 indexes (`_pkey`, `_recorded_at_idx`, `_vehicle_id_idx`) | fully captured; repository/live diff totals 0 |
| Repository schema | `model BrakeTripMetric` (line 9025) + `Vehicle.brakeTripMetrics` back-relation (line 2940); unchanged since introduction commit `77c26dad` (master audit §A2) | schema intent exists and never evolved |
| Committed creation migration | none | `U043_CREATION_MIGRATION_EXISTS` = NO — the live table was created out-of-band |
| Current runtime usage | repository search §6 | 0 readers, 0 writers, 0 raw-SQL runtime usage, 0 API/UI contract |
| Dated prior row-count evidence | `brake-health-production-readiness-2026-07.md` lines 304 / 817 (`0`), `driving-analysis-production-reality.md` line 271 (`0 rows`, 30 d window), `brake-health-integrity-findings-2026-07.json` `brakeTripMetricsRows: 0` | **2026-07 dated** evidence of zero rows; it is historical, not a current measurement |
| Prior audit classification | `P0-BH-07` — "`BrakeTripMetric` orphan schema", confidence `CONFIRMED`, `productionBlocker: false`, recommendation **"Deprecate schema or implement writer"** | the prior audit deliberately left both branches open → no product decision on record |
| Canonical replacement path | `TripDrivingImpact` supplies per-trip brake wear inputs and is read by `brake-health.service.ts` (`prisma.tripDrivingImpact.findMany`, lines 1242 and 1873); the canonical read model is `BrakeHealthCurrent` (`schema.prisma` line 9050) maintained by `BrakeLifecycleService` / `recalculate()` | a live canonical path for per-trip brake wear exists **without** `brake_trip_metrics` |
| Future product requirement | no roadmap, ADR, issue or architecture document requires per-trip brake metrics in this table (search §6 found no `PRODUCT_AUTHORITY` hit) | none on record |

No new production query was performed in this phase.

### 7a. Reconciliation counters

| Counter | Value |
|---------|-------|
| `U043_LIVE_TABLE_EXISTS` | **YES** |
| `U043_LIVE_SHAPE_CAPTURED` | **YES** (11 columns / 2 constraints / 3 indexes) |
| `U043_CREATION_MIGRATION_EXISTS` | **NO** |
| `U043_CURRENT_RUNTIME_READER_COUNT` | **0** |
| `U043_CURRENT_RUNTIME_WRITER_COUNT` | **0** |
| `U043_CURRENT_API_UI_CONTRACT_COUNT` | **0** |
| `U043_CANONICAL_REPLACEMENT_PATH_EXISTS` | **YES** (`TripDrivingImpact` → `BrakeHealthCurrent`) |
| `U043_AUTHORITATIVE_PRODUCT_RETENTION_REQUIREMENT_COUNT` | **0** |
| `U043_PRODUCT_AUTHORITY_UNKNOWN_COUNT` | **2** |
| `U043_DATED_ROW_COUNT_EVIDENCE_COUNT` | **3** (all 2026-07, all zero) |
| `U043_CURRENT_ROW_COUNT_EVIDENCE_COUNT` | **0** |

The two open product-authority propositions (`U043_PRODUCT_AUTHORITY_UNKNOWN_COUNT` = 2):

| ID | Proposition | Status |
|----|-------------|--------|
| PA1 | Does the product owner approve destructive removal of a live production table? | UNKNOWN |
| PA2 | Is a per-trip brake-metrics capability (the prior audit's "implement writer" branch) still on the roadmap? | UNKNOWN |

**Explicitly not claimed:** "unused" is not product permission to drop a production table. Zero
runtime usage plus dated zero-row evidence is *technical* support for removal only.

---

## 8. U043 decision matrix

| Option | Required authority | Present? | Verdict |
|--------|--------------------|----------|---------|
| **RETAIN_AND_BOOTSTRAP** | (a) an active reader/writer, API contract or explicit product requirement; (b) executable bootstrap DDL matching the accepted live shape | (a) **absent** — 0 readers, 0 writers, 0 contracts, 0 retention requirements; (b) satisfiable — the accepted JSON gives the exact 11-column / 2-constraint / 3-index shape | **NOT_SUPPORTED** on authority (a) |
| **DEPRECATE_AND_REMOVE** | 0 runtime readers/writers **and** 0 API/UI contract **and** orphan classification **and** canonical replacement path **and** no retention requirement **and** product-owner approval of a destructive change **and** a fresh production row-count/preflight immediately before any drop | all technical conditions met (§6/§7); **product-owner approval absent** (PA1); **fresh preflight not performed and must not be pre-performed here** | **TECHNICAL_CANDIDATE, NOT AUTHORIZED** |
| **INSUFFICIENT_PRODUCT_AUTHORITY** | technical evidence supports removal while product ownership/roadmap authority is absent | exactly the current situation | **APPLIES** |

### 8a. U043 status

| Field | Value |
|-------|-------|
| `U043_TECHNICAL_RECOMMENDATION` | **DEPRECATE_AND_REMOVE_CANDIDATE** |
| `U043_STATUS` | **AWAITING_PRODUCT_OWNER_DECISION** |
| `U043_INDEPENDENT_EVIDENCE_REVIEW` | **PASS** (substance unchanged by CI-R3A.8.1 / CI-R3A.8.2) |
| `U043_RESOLVED_COUNT` | **0** |
| `U043_DESTRUCTIVE_CHANGE_IMPLEMENTATION_COUNT` | **0** |
| `U043_SCHEMA_CHANGE_COUNT` | **0** |
| `U043_DROP_TABLE_COUNT` | **0** |
| `U043_PRODUCTION_ROW_DELETE_COUNT` | **0** |

Until a product owner decides, CI-R3B must treat `brake_trip_metrics` as `ORPHAN_REVIEW_REQUIRED`:
it stays **outside** the Option D bootstrap object set (`PROVISIONAL_BOOTSTRAP_OBJECT_COUNT` = 18 of
19 known missing objects) and no removal is prepared.

---

## 9. Future U043 safety gates (documented, not implemented)

If the product owner selects `DEPRECATE_AND_REMOVE`, all ten gates below must pass in order. None is
implemented in this phase.

| # | Gate |
|---|------|
| 1 | Explicit, recorded product-owner approval of a destructive removal (PA1 resolved in writing). |
| 2 | Fresh authorized **read-only** production row count of `brake_trip_metrics` immediately before implementation (the 2026-07 zero-row evidence is too old to authorize a drop). |
| 3 | Repeated current runtime-reference sweep (`BrakeTripMetric` / `brakeTripMetric` / `brakeTripMetrics` / `brake_trip_metrics`) proving still-zero readers, writers, raw SQL and contracts. |
| 4 | Documented backup/restore and rollback strategy (pre-drop backup verified restorable). |
| 5 | Remove the Prisma model **and** the `Vehicle.brakeTripMetrics` back-relation in the same change. |
| 6 | Append-only forward migration for the drop; no historical migration touched. |
| 7 | No edit to any existing migration file and no checksum mutation. |
| 8 | Abort if the fresh production row count is nonzero, unless a separately approved preservation/export plan exists. |
| 9 | Full verification: Prisma validate/format, backend typecheck, backend + frontend test suites, and a fresh empty-database migration replay reaching head. |
| 10 | Independent review before merge and before any deployment. |

| Counter | Value |
|---------|-------|
| `U043_PRODUCT_OWNER_APPROVAL_PRESENT` | **NO** |
| `U043_FRESH_PREFLIGHT_REQUIRED` | **YES** |
| `U043_NONZERO_ROW_DROP_ALLOWED` | **NO** |
| `U043_APPEND_ONLY_IF_APPROVED` | **YES** |
| `U043_HISTORICAL_MIGRATION_EDIT_ALLOWED` | **NO** |
| `U043_FUTURE_SAFETY_GATE_COUNT` | **10** |
| `U043_FUTURE_SAFETY_GATE_IMPLEMENTED_COUNT` | **0** |

---

## 10. Scope, safety and phase counters

Current phase = **CI-R3A.8.3** (U042 guard definition, source authority and counter integrity;
U043 substance unchanged):

| Counter | Value |
|---------|-------|
| `CHANGED_FILE_COUNT` | 2 |
| `DOCUMENTATION_FILE_CHANGE_COUNT` | 2 |
| `JSON_EVIDENCE_CHANGE_COUNT` | 0 |
| `HISTORICAL_MIGRATION_EDIT_COUNT` | 0 |
| `NEW_MIGRATION_COUNT` | 0 |
| `PRISMA_SCHEMA_CHANGE_COUNT` | 0 |
| `RUNTIME_CHANGE_COUNT` | 0 |
| `TEST_LOGIC_CHANGE_COUNT` | 0 |
| `WORKFLOW_CHANGE_COUNT` | 0 |
| `DEPENDENCY_CHANGE_COUNT` / `LOCKFILE_CHANGE_COUNT` | 0 |
| `PRODUCTION_DATABASE_ACCESS_COUNT` | 0 |
| `PRODUCTION_CONFIG_CHANGE_COUNT` | 0 |
| `PRODUCTION_DEPLOYMENT_COUNT` | 0 |
| `CI_R3B_IMPLEMENTATION_COUNT` | 0 |
| `E7_E8_E9_RUNTIME_SCOPE_COUNT` | 0 |
| `OUT_OF_SCOPE_FILE_COUNT` | 0 |
| `DECISION_PACKAGE_COMPLETED_COUNT` | 1 (CI-R3A.8 delivery) |
| `CI_R3A81_CORRECTION_COMPLETED_COUNT` | 1 (historical — CI-R3A.8.1) |
| `CI_R3A82_CORRECTION_COMPLETED_COUNT` | 1 (historical — CI-R3A.8.2) |
| `CI_R3A83_CORRECTION_COMPLETED_COUNT` | 1 |
| `U042_GUARD_COUNTER_ARITHMETIC_MISMATCH_COUNT` | 0 |
| `DEFINED_POST_PRE_FC01_FC10_ROW_COUNT` | 10 |
| `UNDEFINED_POST_PRE_GUARD_ROW_REFERENCE_COUNT` | 0 |
| `STALE_FALSE_PRISMA_SOURCE_PATH_COUNT` | 0 |
| `FALSE_SOURCE_PATH_ALIAS_CLAIM_COUNT` | 0 |
| `STALE_PRE_SHIM_OUTCOME_COUNT_20_CLAIM_COUNT` | 0 |
| `STALE_PRE_SHIM_FAIL_CLOSED_COUNT_13_CLAIM_COUNT` | 0 |
| `STALE_TOTAL_FAIL_CLOSED_COUNT_23_CLAIM_COUNT` | 0 |
| `POST_SHIM_PHASE_COUNT` | 3 |
| `POSTCONDITION_REQUIRES_SELF_FINISHED_AT_COUNT` | 0 |
| `STALE_POST_SHIM_SELF_ROW_FAILURE_CLAIM_COUNT` | 0 |
| `STALE_RAW_GUARD_MUTUAL_EXCLUSIVITY_CLAIM_COUNT` | 0 |
| `STALE_UNQUALIFIED_GUARD_OVERLAP_ZERO_CLAIM_COUNT` | 0 |
| `REMAINING_IMPLEMENTATION_BLOCKER_COUNT` | 2 (U042 replay/fault-injection/recovery proof; U043 product decision) |
| `STALE_U042_ATOMIC_WORKFLOW_CLAIM_COUNT` | 0 |
| `STALE_U042_ZERO_PARTIAL_PERSISTENCE_CLAIM_COUNT` | 0 |
| `STALE_U042_COMPLETE_GUARD_AUTHORITY_CLAIM_COUNT` | 0 |
| `STALE_U042_TECHNICALLY_APPROVED_CLAIM_COUNT` | 0 |
| `STALE_U042_AUTHORITY_CLAIM_COUNT` | 0 |
| `CONNECTION_URI_OUTPUT_COUNT` / `PASSWORD_OUTPUT_COUNT` / `TOKEN_OUTPUT_COUNT` | 0 |
| `PRIVATE_KEY_OUTPUT_COUNT` / `VPS_ENDPOINT_OUTPUT_COUNT` / `CREDENTIAL_PATH_OUTPUT_COUNT` | 0 |
| `SECRET_VALUE_OUTPUT_COUNT` / `PROHIBITED_INFRASTRUCTURE_METADATA_COUNT` | 0 |

## 11. Final status

- **U042** — CI-R3A.8 statement, ordering and dependency authority remain valid. CI-R3A.8.1 corrected
  transaction scope (§1c), two persistence windows (§2b), recovery states (§3.5) and fault-injection
  requirements (§3.6). CI-R3A.8.2 corrected self-row lifecycle (§3.3.1), three-phase post-shim model,
  raw/effective guard semantics (§3.0) and reachability proofs. CI-R3A.8.3 corrects the pinned Prisma
  orchestration source path (§1d), individually defines POST-PRE-FC01–POST-PRE-FC10 (§3.3.1 guard
  table), and rebalances all guard counters to the 23-outcome / 19 fail-closed / 4 action-no-op model
  (§3a). Option J remains a **candidate only**: `INDEPENDENT_REVIEW_CORRECTION_REQUIRED`;
  `CASING_STRATEGY_STATUS` = `INSUFFICIENT_AUTHORITY`. No executable replay is claimed in this phase.
  Executable replay plus fault-injection and recovery proof remain mandatory before CI-R3B may begin.
- **U043** — independent evidence review **PASS**; substance unchanged (45 classified hits, 0 runtime
  readers/writers, 0 contracts, 0 migration DDL). Technical recommendation
  **DEPRECATE_AND_REMOVE_CANDIDATE**; product decision remains open
  (`AWAITING_PRODUCT_OWNER_DECISION`).
- No migration, schema, runtime or test change; no production access; the accepted JSON evidence is
  byte-identical; CI-R3B remains blocked; E7/E8/E9 remain unstarted.

**Status: CI_R3A83_CORRECTION_COMPLETED** — awaiting independent review (U042 executable replay +
fault-injection/recovery proof) and product-owner decision (U043).
