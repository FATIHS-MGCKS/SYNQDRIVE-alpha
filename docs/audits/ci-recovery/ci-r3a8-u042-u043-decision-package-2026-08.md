# CI-R3A.8 — U042 / U043 decision authority package

**Phase:** CI-R3A.8 + **CI-R3A.8.1** (analysis and decision authority only)
**Branch:** `fix/ci-r3a-vehicle-trips-migration-authority-audit-2026-08`
**Base HEAD analysed:** `03de93b9179011525e12fd90f1399a501e2a7e5e`
**Latest correction:** CI-R3A.8.1 (U042 transaction, persistence-window and recovery authority)
**Master audit:** `docs/audits/ci-recovery/ci-r3a-vehicle-trips-migration-authority-audit-2026-08.md` (§17e, §17f)
**Accepted live evidence:** `docs/audits/ci-recovery/ci-r3a7-production-catalog-evidence-2026-08.json` (unchanged by CI-R3A.8 / CI-R3A.8.1)

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

## 3. Guard evaluation model (CI-R3A.8.1 — mutually exclusive)

The CI-R3A.8 G01–G17 table is **superseded**. It was not mutually exclusive (for example G02 could
overlap G10; G12 could overlap G16 or G17) and incorrectly implied a complete, non-overlapping guard
state space.

Both shims are **guard-first**: they read catalog state and `_prisma_migrations`, evaluate the ordered
predicates below, and either perform a complete allowed action or raise. They are **not** executable
recovery logic in this phase.

### 3.1 Evaluation order (fail-closed precedence)

The first matching row below determines the outcome. Fail-closed checks **always** take precedence
over action or no-op states.

1. invalid or contradictory `_prisma_migrations` history for the target and/or post-shim rows
2. duplicate relation presence (lowercase **and** PascalCase for the same logical table)
3. missing relation presence (neither lowercase nor PascalCase for either table)
4. mixed casing across the two affected tables
5. `_old` enum type residue (`TripAssignmentStatus_old`, `TripAssignmentSubjectType_old`)
6. missing replacement enum types (`TripAssignmentStatus`, `TripAssignmentSubjectType`)
7. invalid retired-label state (label `ASSIGNED_USER` or `USER` still present where the target
   expects retirement)
8. target prerequisite failures (required columns absent; assignment columns not typed on the
   expected predecessor enums; non-null assignment values not castable to replacement label sets;
   relation kinds not ordinary tables; relations not in `public`; conflicting relation names)
9. only if steps 1–8 are all false: fresh-replay action or existing-applied no-op

`EXISTING_APPLIED_NOOP` for the pre-shim is allowed **only if** all fail-closed predicates (steps
1–8) are false **and** the target row is finished with `rolled_back_at` null, both lowercase relations
present and both PascalCase relations absent.

`EXISTING_APPLIED_NOOP` for the post-shim is allowed **only if** all fail-closed predicates are
false **and** both lowercase relations are already present with both PascalCase relations absent.

### 3.2 Pre-shim outcome rows (first match wins)

| Row | Compound predicate (all parts must hold) | Classification | Allowed action | Automatic continuation |
|-----|------------------------------------------|----------------|----------------|------------------------|
| PRE-FC01 | target row present and (`finished_at` is null **or** `rolled_back_at` is not null) | FAIL_CLOSED | abort; no rename | NO — manual reviewer intervention required |
| PRE-FC02 | for either table, lowercase **and** PascalCase relations both exist | FAIL_CLOSED | abort | NO |
| PRE-FC03 | for either table, neither lowercase nor PascalCase relation exists | FAIL_CLOSED | abort | NO |
| PRE-FC04 | mixed casing across the two tables (one lowercase, one PascalCase) | FAIL_CLOSED | abort | NO |
| PRE-FC05 | `TripAssignmentStatus_old` and/or `TripAssignmentSubjectType_old` exists | FAIL_CLOSED | abort | NO |
| PRE-FC06 | `TripAssignmentStatus` and/or `TripAssignmentSubjectType` missing | FAIL_CLOSED | abort | NO |
| PRE-FC07 | retired label `ASSIGNED_USER` or `USER` still present in live enum label sets where target expects retirement | FAIL_CLOSED | abort | NO |
| PRE-FC08 | required columns (`assignment_status`, `assignment_subject_type`, `assignment_subject_id`) absent, wrong types, non-castable values, non-table relation kind, wrong schema, or conflicting names | FAIL_CLOSED | abort | NO |
| PRE-FC09 | target row finished with `rolled_back_at` null **while** any PascalCase relation exists | FAIL_CLOSED | abort | NO |
| PRE-ACT01 | steps PRE-FC01–PRE-FC09 all false; target row absent; both lowercase relations present; both PascalCase absent; enum prerequisites satisfied | FRESH_REPLAY_ACTION | rename both relations to PascalCase inside the pre-shim file submission | YES — target may run next |
| PRE-NOOP01 | steps PRE-FC01–PRE-FC09 all false; target row finished with `rolled_back_at` null; both lowercase present; both PascalCase absent | EXISTING_APPLIED_NOOP | no-op | YES — target/post-shim evaluation continues |

### 3.3 Post-shim outcome rows (first match wins)

| Row | Compound predicate (all parts must hold) | Classification | Allowed action | Automatic continuation |
|-----|------------------------------------------|----------------|----------------|------------------------|
| POST-FC01 | post-shim row present and (`finished_at` is null **or** `rolled_back_at` is not null) | FAIL_CLOSED | abort | NO — manual reviewer intervention required |
| POST-FC02 | for either table, lowercase **and** PascalCase relations both exist | FAIL_CLOSED | abort | NO |
| POST-FC03 | for either table, neither lowercase nor PascalCase relation exists | FAIL_CLOSED | abort | NO |
| POST-FC04 | mixed casing across the two tables | FAIL_CLOSED | abort | NO |
| POST-FC05 | any `_old` enum type residue remains | FAIL_CLOSED | abort | NO |
| POST-FC06 | replacement enum type missing or retired labels still present | FAIL_CLOSED | abort | NO |
| POST-FC07 | target row not finished successfully while post-shim is being evaluated on a fresh replay path | FAIL_CLOSED | abort | NO |
| POST-ACT01 | steps POST-FC01–POST-FC07 all false; target finished; both PascalCase present; both lowercase absent; enum final-state predicates satisfied | FRESH_REPLAY_ACTION | rename both relations back to lowercase inside the post-shim file submission | YES — downstream migrations may continue |
| POST-NOOP01 | steps POST-FC01–POST-FC07 all false; both lowercase present; both PascalCase absent | EXISTING_APPLIED_NOOP | no-op | YES |

### 3a. Guard counters (CI-R3A.8.1)

| Counter | Value |
|---------|-------|
| `U042_GUARD_OUTCOME_ROW_COUNT` | **20** (PRE-FC01–PRE-FC09, PRE-ACT01, PRE-NOOP01, POST-FC01–POST-FC07, POST-ACT01, POST-NOOP01) |
| `U042_GUARD_ROW_OVERLAP_COUNT` | **0** (first-match evaluation order; CI-R3A.8 G-table overlap defect corrected) |
| `U042_GUARD_STATE_SPACE_STATUS` | **INCOMPLETE_PENDING_EXECUTABLE_REPLAY** |
| `U042_FRESH_REPLAY_ACTION_ROW_COUNT` | **2** (PRE-ACT01, POST-ACT01) |
| `U042_EXISTING_APPLIED_NOOP_ROW_COUNT` | **2** (PRE-NOOP01, POST-NOOP01) |
| `U042_FAIL_CLOSED_ROW_COUNT` | **16** (PRE-FC01–PRE-FC09, POST-FC01–POST-FC07) |
| `U042_UNCLASSIFIED_STATE_COUNT` | **NOT_PROVEN_ZERO** (CI-R3A.8 numeric-zero claim **SUPERSEDED BY CI-R3A.8.1**) |
| `U042_PARTIAL_MUTATION_ALLOWED_COUNT` (CI-R3A.8) | **0** — **SUPERSEDED BY CI-R3A.8.1** |
| `U042_PARTIAL_PERSISTENCE_RISK_PRESENT` | **YES** |
| `U042_ZERO_PARTIAL_PERSISTENCE_PROVEN` | **NO** |
| `U042_PRODUCTION_RENAME_COUNT` (production-like applied state, when all fail-closed predicates false) | **0** |
| `U042_PRODUCTION_DATA_MUTATION_COUNT` | **0** |

Historical CI-R3A.8 counters retained for traceability only: `U042_GUARD_TRUTH_TABLE_ROW_COUNT` = 17
(G01–G17 table, superseded).

On a production-like applied database where accepted live evidence holds (§17d), PRE-NOOP01 +
POST-NOOP01 remain the intended no-op path — **zero renames and zero data mutation** — but that path
is not independently approved until executable replay and fault-injection proof exist (§3.6).

### 3.5 Mutually exclusive recovery states (authority documentation only)

These rows describe observable cross-migration states. They are **not** executable recovery logic.

| Row | `_prisma_migrations` predicates | Lowercase relations | PascalCase relations | Replacement enums | `_old` enum residue | Automatic continuation | Manual intervention | Allowed recovery class | Prohibited action |
|-----|--------------------------------|---------------------|----------------------|-------------------|---------------------|------------------------|---------------------|------------------------|-------------------|
| **R01** | pre-shim row finished; target row **absent**; post-shim row **absent** | absent | `"VehicleTrip"` + `"TripDrivingImpact"` present | present (pre-target set) | absent unless target partially ran outside Prisma | NO | YES — inspect why deploy stopped after pre-shim | disposable DB: destroy/recreate; non-disposable: separately approved procedure only | auto-continue deploy; manual `resolve --applied`; `db push`; edit historical target |
| **R02** | pre-shim finished; target row present but unfinished or failed; post-shim absent | absent | present | mixed possible if target failed mid-file | possible if target failed during enum rebuild | NO | YES | disposable DB: destroy/recreate; non-disposable: separately approved procedure only | pretend target succeeded; skip post-shim; edit applied migration |
| **R03** | pre-shim finished; target finished successfully; post-shim row **absent** | absent | present | replacement enums present; retired labels absent; `speeding_severity_score` dropped | absent | NO | YES — post-shim still required | disposable DB: destroy/recreate or rerun from authorized checkpoint; non-disposable: separately approved procedure only | treat PascalCase as final authority; run downstream lowercase migrations |
| **R04** | target finished; post-shim row present but unfinished or failed | absent or mixed if post-shim failed mid-rename | present (full or partial) | final enum labels expected | must be absent for success | NO | YES | disposable DB: destroy/recreate; non-disposable: separately approved procedure only | manual rename hacks without approved procedure; checksum edits |

| Counter | Value |
|---------|-------|
| `U042_RECOVERY_STATE_ROW_COUNT` | **4** |
| `U042_RECOVERY_STATE_OVERLAP_COUNT` | **0** |
| `U042_UNCLASSIFIED_RECOVERY_STATE_COUNT` | **0** |

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
| D6 | How does the post-shim restore lowercase relation names? | POST-ACT01 renames `"VehicleTrip"` → `vehicle_trips` and `"TripDrivingImpact"` → `trip_driving_impact` inside the post-shim file submission, then POST-FC01–POST-FC07 re-verify that no PascalCase relation, no `_old` type and no retired enum label survives. If the post-shim never runs, WINDOW 2 persists (§2b, R03). |
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
| `U043_INDEPENDENT_EVIDENCE_REVIEW` | **PASS** (substance unchanged by CI-R3A.8.1) |
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

Current phase = **CI-R3A.8.1** (U042 transaction/recovery authority correction; U043 substance unchanged):

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
| `CI_R3A81_CORRECTION_COMPLETED_COUNT` | 1 |
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

- **U042** — CI-R3A.8 statement, ordering and dependency authority remain valid. Independent review
  rejected U042 approval because the prior package incorrectly treated the three-file Option J workflow
  as atomic and claimed a complete non-overlapping guard state space. CI-R3A.8.1 corrects transaction
  scope (§1c), documents two persistence windows (§2b), four recovery states (§3.5), a mutually
  exclusive guard model (§3) and recovery/fault-injection requirements (§3.6). Option J remains a
  **candidate only**: `INDEPENDENT_REVIEW_CORRECTION_REQUIRED`; `CASING_STRATEGY_STATUS` =
  `INSUFFICIENT_AUTHORITY`. Executable replay plus fault-injection and recovery proof are mandatory
  before CI-R3B may begin.
- **U043** — independent evidence review **PASS**; substance unchanged (45 classified hits, 0 runtime
  readers/writers, 0 contracts, 0 migration DDL). Technical recommendation
  **DEPRECATE_AND_REMOVE_CANDIDATE**; product decision remains open
  (`AWAITING_PRODUCT_OWNER_DECISION`).
- No migration, schema, runtime or test change; no production access; the accepted JSON evidence is
  byte-identical; CI-R3B remains blocked; E7/E8/E9 remain unstarted.

**Status: CI_R3A81_CORRECTION_COMPLETED** — awaiting independent review (U042 executable replay +
fault-injection/recovery proof) and product-owner decision (U043).
