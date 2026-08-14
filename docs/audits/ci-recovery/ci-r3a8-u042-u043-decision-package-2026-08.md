# CI-R3A.8 — U042 / U043 decision authority package

**Phase:** CI-R3A.8 (analysis and decision authority only)
**Branch:** `fix/ci-r3a-vehicle-trips-migration-authority-audit-2026-08`
**Base HEAD analysed:** `03de93b9179011525e12fd90f1399a501e2a7e5e`
**Master audit:** `docs/audits/ci-recovery/ci-r3a-vehicle-trips-migration-authority-audit-2026-08.md` (§17e)
**Accepted live evidence:** `docs/audits/ci-recovery/ci-r3a7-production-catalog-evidence-2026-08.json` (unchanged by this phase)

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

Target file (11 SQL statements, comments excluded; PostgreSQL DDL is transactional and Prisma applies
one migration file as one transaction, so **every** statement failure rolls the whole file back and
`prisma migrate deploy` aborts before any later migration):

`backend/prisma/migrations/20260425000000_retire_user_assignment_and_speeding_severity/migration.sql`

| # | Statement | Required pre-state | Object casing expected | Enum dependency | Effect | Expected post-state | Failure rolls back migration | Operates on |
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
the first PascalCase statement (S1) therefore raises `42P01` and the whole migration rolls back —
independently reproduced in §2b of the master audit.

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

---

## 3. Guard truth table

Both shims are **guard-first**: they read catalog state, decide, and either mutate completely or
raise. The guard inputs are: the `_prisma_migrations` row for
`20260425000000_retire_user_assignment_and_speeding_severity`; the presence of
`vehicle_trips` / `"VehicleTrip"` and `trip_driving_impact` / `"TripDrivingImpact"` in `pg_class`;
the presence of `TripAssignmentStatus`, `TripAssignmentSubjectType` and any `…_old` residue in
`pg_type`.

Every row below is a single state, classified exactly once.

| Row | Shim | Observed state | Classification | Action | Mutation performed | Error behaviour |
|-----|------|----------------|----------------|--------|--------------------|-----------------|
| G01 | pre | target row **absent**; both lowercase relations present (Option D applied); both PascalCase relations absent; `TripAssignmentStatus` + `TripAssignmentSubjectType` present; no `…_old` residue | FRESH_REPLAY_ACTION | rename `vehicle_trips` → `"VehicleTrip"` and `trip_driving_impact` → `"TripDrivingImpact"` in one transaction | 2 relation renames (fresh replay database only) | — |
| G02 | pre | target row **finished**, `rolled_back_at` null; both lowercase relations present; both PascalCase relations absent | EXISTING_APPLIED_NOOP | no-op | none | — |
| G03 | pre | target row present but **unfinished** (`finished_at` null) | FAIL_CLOSED | abort | none | explicit error: prior failed attempt must be resolved by a reviewer |
| G04 | pre | target row present and **rolled back** (`rolled_back_at` not null) | FAIL_CLOSED | abort | none | explicit error: rolled-back history is not a replay precondition |
| G05 | pre | for the same table both lowercase **and** PascalCase relations exist | FAIL_CLOSED | abort | none | explicit error: ambiguous duplicate relation |
| G06 | pre | neither lowercase nor PascalCase relation exists (for either table) | FAIL_CLOSED | abort | none | explicit error: Option D bootstrap did not run / base gap unresolved |
| G07 | pre | mixed casing **across** the two tables (e.g. `vehicle_trips` lowercase while `"TripDrivingImpact"` is PascalCase) | FAIL_CLOSED | abort | none | explicit error: partially converted schema |
| G08 | pre | target row finished **while** a PascalCase relation exists | FAIL_CLOSED | abort | none | explicit error: applied history contradicts live casing |
| G09 | pre | target row absent and a required enum type (`TripAssignmentStatus` or `TripAssignmentSubjectType`) is **missing** | FAIL_CLOSED | abort | none | explicit error: S2/S7 would fail; bootstrap incomplete |
| G10 | pre | predecessor and replacement enum coexist unexpectedly (`TripAssignmentStatus` **and** `TripAssignmentStatus_old`, or the subject-type equivalent) | FAIL_CLOSED | abort | none | explicit error: residue of an interrupted rebuild |
| G11 | post | target applied in this run; both PascalCase relations present; lowercase absent; no `…_old` type remains | FRESH_REPLAY_ACTION | rename `"VehicleTrip"` → `vehicle_trips` and `"TripDrivingImpact"` → `trip_driving_impact` in one transaction | 2 relation renames (fresh replay database only) | — |
| G12 | post | both lowercase relations present; both PascalCase relations absent (pre-shim was a no-op) | EXISTING_APPLIED_NOOP | no-op | none | — |
| G13 | post | both lowercase **and** PascalCase relations exist | FAIL_CLOSED | abort | none | explicit error: impossible mixed state |
| G14 | post | neither lowercase nor PascalCase relation exists | FAIL_CLOSED | abort | none | explicit error: relation lost between shims |
| G15 | post | mixed casing across the two tables | FAIL_CLOSED | abort | none | explicit error: partial rename |
| G16 | post | a `TripAssignmentStatus_old` / `TripAssignmentSubjectType_old` type still exists | FAIL_CLOSED | abort | none | explicit error: predecessor type not dropped (S5/S10 did not complete) |
| G17 | post | a replacement enum type is missing, or a retired label (`ASSIGNED_USER` / `USER`) is still present in the live label set | FAIL_CLOSED | abort | none | explicit error: enum rebuild did not reach the accepted final label set |

### 3a. Guard counters

| Counter | Value |
|---------|-------|
| `U042_GUARD_TRUTH_TABLE_ROW_COUNT` | **17** |
| `U042_FRESH_REPLAY_ACTION_ROW_COUNT` | **2** (G01, G11) |
| `U042_EXISTING_APPLIED_NOOP_ROW_COUNT` | **2** (G02, G12) |
| `U042_FAIL_CLOSED_ROW_COUNT` | **13** (G03–G10, G13–G17) |
| `U042_UNCLASSIFIED_STATE_COUNT` | **0** |
| `U042_PARTIAL_MUTATION_ALLOWED_COUNT` | **0** |
| `U042_PRODUCTION_RENAME_COUNT` (production-like applied state) | **0** |
| `U042_PRODUCTION_DATA_MUTATION_COUNT` | **0** |

Arithmetic: 2 + 2 + 13 = 17 = `U042_GUARD_TRUTH_TABLE_ROW_COUNT`.

Every renaming action is confined to the fresh-replay branch (G01/G11). On a production-like applied
state the guard resolves to G02 + G12, i.e. **zero renames and zero data mutation**, which matches the
accepted live evidence (§17d: target row finished, `rolled_back` false, casing lowercase, camelCase
ghost relations absent).

---

## 4. Dependency and final-shape proof

| # | Question | Answer (authority) |
|---|----------|--------------------|
| D1 | Why must the **actual** relation participate in the enum conversion instead of a disposable dummy table? | S2 renames the type, so the real `vehicle_trips.assignment_status` column silently becomes typed on `TripAssignmentStatus_old` (rename changes `pg_type.typname`, not the type OID the column points at). If a dummy `"VehicleTrip"` existed only to satisfy the identifier, S4 would convert the dummy column, the real column would stay bound to `TripAssignmentStatus_old`, and **S5 `DROP TYPE "TripAssignmentStatus_old"` would fail** with SQLSTATE `2BP01` (dependent objects). The same applies to S7–S10. A dummy table therefore cannot make the file succeed. |
| D2 | How do table renames affect foreign-key relation targets? | `ALTER TABLE … RENAME TO` mutates `pg_class.relname` only. `pg_constraint` rows store `conrelid`/`confrelid` OIDs, so both inbound and outbound foreign keys stay attached across a rename and re-render with the final name after the post-shim. |
| D3 | How do indexes and constraints remain attached? | `pg_index` (`indrelid`) and `pg_constraint` (`conrelid`) reference the relation OID, which a rename does not change; column defaults live in `pg_attrdef` keyed by `attrelid`. A table rename also does **not** rename indexes or constraints, so `vehicle_trips_pkey`, `brake_trip_metrics_*`-style names and all `*_idx` names created by Option D survive the pre/post window unchanged and match the accepted JSON `definition` strings after the post-shim. |
| D4 | How does the original enum rebuild move the real assignment columns onto the replacement types? | S4 and S9 execute `ALTER COLUMN … TYPE … USING (…::text::…)` against the real relation, rewriting each row through its text representation onto the replacement type. This is exactly why the real relation must carry the identifier the statement uses. |
| D5 | Why may no column remain dependent on a temporary `_old` enum? | S5/S10 `DROP TYPE` are unguarded. Any surviving dependency aborts them (`2BP01`) and rolls the whole migration back. At the point the target runs on a fresh replay, the only dependents are the two `vehicle_trips` columns (the later `misuse_cases` snapshot columns typed on these enums are created by `20260615140000`, i.e. after the target), so S4/S9 remove the last dependency and S5/S10 can succeed. |
| D6 | How does the post-shim restore lowercase relation names? | G11 renames `"VehicleTrip"` → `vehicle_trips` and `"TripDrivingImpact"` → `trip_driving_impact` inside one transaction, then re-verifies (G13–G17) that no PascalCase relation, no `_old` type and no retired enum label survives. |
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

## 5. U042 decision classification

| Option | Mechanism | Empty-DB replay | Existing production DB | Classification |
|--------|-----------|-----------------|------------------------|----------------|
| **B** | Edit the applied migration `20260425000000` (rewrite identifiers) | would pass | mutates the checksum of a migration already recorded finished; breaks history integrity for every deployed database | `OPTION_B_STATUS` = **REJECTED_UNSAFE** |
| **E/F (end-of-history)** | Append a repair migration after the current head | never reached — deploy aborts at `20260425000000` (D8) | no effect on the defect | `END_OF_HISTORY_REPAIR_STATUS` = **REJECTED_TOO_LATE** |
| **Dummy compatibility tables** | Create throwaway `"VehicleTrip"`/`"TripDrivingImpact"` relations to satisfy the identifiers | fails at S5 (`2BP01`, D1) | pollutes the schema with ghost relations | `DUMMY_TABLE_STATUS` = **REJECTED** |
| **J (guarded retroactive pre/post shim)** | Append-only guard-first shims immediately before/after the target; target byte-identical | ordering (§2) + guards (§3) + dependency proof (§4) are internally complete and consistent | resolves to G02 + G12 → zero renames, zero data mutation | **technically preferred candidate** — not implemented, not replay-proven |
| **No repair** | Leave the history broken | fresh replay stays red | production unaffected but no reproducible environment provisioning | rejected — the CI gate remains red |

### 5a. U042 status

| Field | Value |
|-------|-------|
| `U042_TECHNICAL_RECOMMENDATION` | **OPTION_J_GUARDED_PRE_POST_CANDIDATE** |
| `U042_STATUS` | **TECHNICALLY_SPECIFIED_PENDING_INDEPENDENT_APPROVAL_AND_REPLAY** |
| `CASING_STRATEGY_STATUS` | **CANDIDATE_NOT_IMPLEMENTED** |
| `END_TO_END_R3B_STRATEGY_STATUS` | **BLOCKED** |
| `OPTION_B_STATUS` | **REJECTED_UNSAFE** |
| `END_OF_HISTORY_REPAIR_STATUS` | **REJECTED_TOO_LATE** |
| `DUMMY_TABLE_STATUS` | **REJECTED** |
| `OPTION_J_IMPLEMENTATION_COUNT` | **0** |
| `U042_RESOLVED_COUNT` | **0** |

Option J is **not** SAFE, **not** ACCEPTED and **not** IMPLEMENTED. Mandatory CI-R3B acceptance gates
before it may be called safe:

1. independent review of the ordering, guard truth table and dependency proof above;
2. full `prisma migrate deploy` replay on a **fresh empty database** reaching the current head;
3. proof that the replayed schema equals the accepted CI-R3A.7.1 shape (columns, constraints,
   indexes, enum labels, lowercase casing);
4. proof that on an already-applied database both shims resolve to a no-op (G02 + G12);
5. no edit to any existing migration file and no checksum mutation.

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
| `DECISION_PACKAGE_COMPLETED_COUNT` | 1 |
| `REMAINING_IMPLEMENTATION_BLOCKER_COUNT` | 2 (U042 approval + replay, U043 product decision) |
| `CONNECTION_URI_OUTPUT_COUNT` / `PASSWORD_OUTPUT_COUNT` / `TOKEN_OUTPUT_COUNT` | 0 |
| `PRIVATE_KEY_OUTPUT_COUNT` / `VPS_ENDPOINT_OUTPUT_COUNT` / `CREDENTIAL_PATH_OUTPUT_COUNT` | 0 |
| `SECRET_VALUE_OUTPUT_COUNT` / `PROHIBITED_INFRASTRUCTURE_METADATA_COUNT` | 0 |

## 11. Final status

- **U042** — statement, ordering, guard and dependency authority is complete and internally
  consistent. Option **J** (guarded append-only pre/post shim) is the **technically preferred
  candidate only**: `TECHNICALLY_SPECIFIED_PENDING_INDEPENDENT_APPROVAL_AND_REPLAY`. Full
  empty-database replay remains a mandatory CI-R3B acceptance gate.
- **U043** — the current-authority search is complete (45 classified hits, 0 unclassified, 0 runtime
  readers/writers, 0 contracts, 0 migration DDL). Technical recommendation
  **DEPRECATE_AND_REMOVE_CANDIDATE**; the product decision remains open
  (`AWAITING_PRODUCT_OWNER_DECISION`).
- No migration, schema, runtime or test change; no production access; the accepted JSON evidence is
  byte-identical; CI-R3B remains blocked; E7/E8/E9 remain unstarted.

**Status: CI_R3A8_DECISION_PACKAGE_COMPLETED** — awaiting independent review (U042) and
product-owner decision (U043).
