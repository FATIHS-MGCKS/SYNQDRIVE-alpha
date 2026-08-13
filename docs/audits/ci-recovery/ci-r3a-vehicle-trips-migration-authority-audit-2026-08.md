# CI Recovery R3A — Vehicle Trip migration history authority audit

> **Documentation-only authority audit.** No migration, schema, runtime, test, workflow,
> dependency, or production artifact was changed. Disposable local PostgreSQL 16 was used for
> read/write diagnostics only and then destroyed. This audit determines the safe, evidence-backed
> repair strategy for CI-R3B; it does **not** implement it.

## 1. Authoritative base and branch

- Authoritative base: `main @ 5015a17d250f0c2823580a1ff567f580dcac51aa` (CI-R2 merged).
- Audit branch: `fix/ci-r3a-vehicle-trips-migration-authority-audit-2026-08`.
- `PRE_CI_R3A_SHA` = `5015a17d250f0c2823580a1ff567f580dcac51aa`.
- Total committed migrations on base: **283** (+ `migration_lock.toml`).

## 2. Reproduced failure (independent)

Disposable PostgreSQL 16 (`postgres:16-alpine`-equivalent native cluster,
user `synqdrive`, trust auth, `127.0.0.1:5432`), fresh empty database
`synqdrive_ci_r3a_empty`, then `npx prisma migrate deploy`:

```
Applying migration `20260311224040_init`
Applying migration `20260312120232_add_dimo_vehicle_snapshot_fields`
Applying migration `20260315000000_add_rental_driving_analysis`
Applying migration `20260325161142_trip_architecture_refactor`
Error: P3018
Migration name: 20260325161142_trip_architecture_refactor
Database error code: 42P01
ERROR: relation "vehicle_trips" does not exist   (routine RangeVarGetRelidExtended)
```

| Field | Value |
|-------|-------|
| `FRESH_DB_MIGRATION_REPLAY` | FAIL |
| `PRISMA_ERROR_CODE` | P3018 |
| `POSTGRES_SQLSTATE` | 42P01 |
| `FIRST_FAILING_MIGRATION` | `20260325161142_trip_architecture_refactor` |
| `FIRST_MISSING_RELATION` | `vehicle_trips` |
| Failing SQL statement | line 5: `ALTER TABLE "vehicle_trips" ADD COLUMN "trip_status" …` (unguarded) |
| `SUCCESSFULLY_APPLIED_MIGRATION_COUNT_BEFORE_FAILURE` | 3 (`init`, `add_dimo_vehicle_snapshot_fields`, `add_rental_driving_analysis`) |
| Later migration reached | No — replay halts at migration #4 |

The result matches the expected baseline exactly.

### 2b. Independently confirmed SECOND (latent) defect — casing

A separate disposable database was seeded with a lowercase `vehicle_trips`, a lowercase
`trip_driving_impact`, and the `TripAssignment*` enums, then `20260425000000`'s SQL was run
verbatim:

```
psql …/20260425000000_…/migration.sql
ERROR:  relation "VehicleTrip" does not exist
LINE 1: UPDATE "VehicleTrip"
```

This proves that **even after the base-table creation gap is repaired, a second replay
failure occurs** at `20260425000000_retire_user_assignment_and_speeding_severity`, because
that migration references camel-case `"VehicleTrip"` / `"TripDrivingImpact"` while the
canonical tables are lowercase `vehicle_trips` / `trip_driving_impact`. Quoted identifiers
are case-sensitive in PostgreSQL, so this is a genuine, independent defect.

## 3. Chronological migration authority matrix (trip lineage)

| # | Migration | Statement(s) | Identifier / casing | Predecessor required | Predecessor present in fresh replay? | Idempotent? | Classification |
|---|-----------|-------------|--------------------|----------------------|--------------------------------------|-------------|----------------|
| 1 | `20260311224040_init` | creates `vehicle_latest_states`, billing, etc. — **no** `vehicle_trips` | n/a | — | — | mixed | HISTORICAL_VALID (but omits trip tables) |
| 2 | `20260315000000_add_rental_driving_analysis` | no trip references | n/a | — | — | — | HISTORICAL_VALID |
| 3 | `20260325161142_trip_architecture_refactor` | `CREATE TYPE "TripStatus"`; **`ALTER TABLE "vehicle_trips"` (unguarded)**; guarded ADD/DROP of legacy cols; `CREATE INDEX …trip_status_idx`; guarded `vehicle_latest_states` alter | lowercase `vehicle_trips` | `vehicle_trips` table | **NO** | partial (DO-blocks guard some; first ALTER unguarded) | **MISSING_PREDECESSOR** (first P3018) |
| 4 | `20260410000000_add_enrichment_status_fields` | `ALTER TABLE "vehicle_trips" ADD …behavior_enrichment_status`; index | lowercase | `vehicle_trips` | NO (blocked earlier) | no | ORDERING_DEFECT (depends on missing base) |
| 5 | `20260413230000_add_composite_indexes_batch_c` | `CREATE INDEX … ON "vehicle_trips" ("vehicle_id","start_time")` | lowercase | `vehicle_trips` (+ `vehicle_id`, `start_time`) | NO | no | ORDERING_DEFECT |
| 6 | `20260425000000_retire_user_assignment_and_speeding_severity` | `UPDATE/ALTER "VehicleTrip"`; enum rename-rebuild of `TripAssignmentStatus`, `TripAssignmentSubjectType`; `ALTER "TripDrivingImpact" DROP COLUMN` | **camelCase** `VehicleTrip`, `TripDrivingImpact` | `VehicleTrip` table, `TripAssignment*` enums, `TripDrivingImpact` table, `assignment_*` cols | NO | no | **CASE_MISMATCH + MISSING_PREDECESSOR** |
| 7 | `20260615140000_misuse_cases` | FK `trip_id → "vehicle_trips"("id")` | lowercase | `vehicle_trips(id)` | NO | no | ORDERING_DEFECT |
| 8 | `20260705140000_trip_analysis_status` / `20260705200000_..._guard` | `ADD COLUMN IF NOT EXISTS` many analysis cols | lowercase | `vehicle_trips` | NO | **yes** (IF NOT EXISTS) | IDEMPOTENCY_RISK-free but ORDERING_DEFECT |
| 9 | `20260708044000_trip_booking_link_source` | `CREATE TYPE "TripBookingLinkSource"`; `ALTER "vehicle_trips" ADD booking_link_source`; `UPDATE` | lowercase | `vehicle_trips` | NO | no | ORDERING_DEFECT |
| 10 | `20260716150000_battery_v2_measurement_sessions` | FK `trip_id → "vehicle_trips"("id")` | lowercase | `vehicle_trips(id)` | NO | no | ORDERING_DEFECT |
| 11 | `20260716250000` / `…260000` / `…270000_driving_impact_*` | `ALTER TABLE "trip_driving_impact"` | lowercase | `trip_driving_impact` | NO | no | ORDERING_DEFECT (missing base) |
| 12 | `20260717180000_trip_driving_impact_authoritative_coverage` | `CREATE TYPE "TripDrivingImpactAnalysisStatus"`; `ALTER "trip_driving_impact"` | lowercase | `trip_driving_impact` | NO | no | ORDERING_DEFECT |

The current Prisma model `VehicleTrip @@map("vehicle_trips")` (schema line 9516–9689) is the
`CURRENT_CORRECT` canonical target: lowercase `vehicle_trips`.

## 4. Base-table creation-gap proof

Searched every `.sql` migration (case-sensitive and case-insensitive) for
`CREATE TABLE … vehicle_trips` / `VehicleTrip`:

| Object | `CREATE TABLE` occurrences in all migrations | Status |
|--------|---------------------------------------------|--------|
| `vehicle_trips` | **0** | MISSING base |
| `vehicle_trip_waypoints` | **0** | MISSING base |
| `trip_driving_impact` | **0** | MISSING base |
| `vehicle_trip_detection_states` | **0** | MISSING base |
| `vehicle_trip_tracking_runs` | **0** | MISSING base |
| `driving_events` | **0** | MISSING base |
| `trip_assessabilities` | 1 (`20260716194500`) | present |
| `driving_evidence` | 1 (`20260716200000`) | present |

`20260311224040_init` contains **zero** references to `vehicle_trip*`, `trip_driving_impact`,
or `driving_events` (the only `trip` substrings are inside `stripe_*`). So the base table was
never created by `init` and never by any later migration.

- `VEHICLE_TRIPS_CREATE_BEFORE_FIRST_ALTER_COUNT` = **0**
- `VEHICLE_TRIP_WAYPOINTS_CREATE_BEFORE_FIRST_REFERENCE_COUNT` = **0**
- `TRIP_RELATED_ENUM_CREATE_COUNTS`: `TripStatus` = 1 (refactor, clean); `TripBookingLinkSource` = 1;
  `TripDrivingImpactAnalysisStatus` = 1; **`TripAssignmentStatus` = 0 clean** (only rename-rebuild
  in `20260425000000`, which assumes it already exists); **`TripAssignmentSubjectType` = 0 clean**
  (same); **`TripSource` = 0** (used by schema with `@default(V2_LIVE)`, never created in any SQL).

### Answers to the required creation-gap questions

1. **Which migration should have created the base table?** A pre-`20260325161142` "init-era"
   migration (logically an extension of `20260311224040_init` or a dedicated
   `…_vehicle_trips` migration). None exists.
2. **Is its SQL present anywhere in committed history?** No (see §6).
3. **Deleted, omitted, or assumed?** **Assumed to pre-exist.** The `VehicleTrip` model with
   `@@map("vehicle_trips")` is present in `schema.prisma` since the initial commit, but the
   committed `init` migration does not create it — evidence the original database was
   materialized out-of-band (`prisma db push`) and the migration history was retrofitted
   without a matching base-creation migration.
4. **Exact table shape required immediately before `20260325161142`?** At minimum: `id` (PK,
   FK target), plus whatever columns the refactor drops/alters (legacy cols, guarded) and the
   columns later migrations reference-but-never-add (`assignment_status`,
   `assignment_subject_type`, `assignment_subject_id`, `vehicle_id`, `start_time`). See §7.
5. **Columns/enums/indexes/FKs belonging to the missing base creation:** `vehicle_trips` base
   (id + pre-refactor columns), enums `TripAssignmentStatus`, `TripAssignmentSubjectType`,
   `TripSource`; base tables `vehicle_trip_waypoints`, `trip_driving_impact`,
   `vehicle_trip_detection_states`, `vehicle_trip_tracking_runs`, `driving_events`.
6. **Columns that must NOT be in the base (added later):** everything the refactor adds
   unguarded (`trip_status`, `avg_consumption_*`, `energy_*`, `outside_temperature_start_c`,
   `engine_temp_*`, `avg_rpm`, `avg_throttle_position`, `avg_engine_load`, `gap_ended`,
   `enriched_at`), plus later additions (`behavior_enrichment_status` @ `20260410000000`,
   `booking_link_source` @ `20260708044000`, `trip_analysis_status` + analysis_* @
   `20260705*`, etc.).
7. **Statements using wrong table casing:** `20260425000000` — 4 statements on `"VehicleTrip"`
   (2× `UPDATE`, 2× `ALTER TABLE`) and 1 on `"TripDrivingImpact"` (`ALTER TABLE`).
8. **Other trip base tables missing?** Yes — `vehicle_trip_waypoints`, `trip_driving_impact`,
   `vehicle_trip_detection_states`, `vehicle_trip_tracking_runs`, `driving_events` (§4 table).

## 5. Identifier / casing analysis

- `FIRST_LOWERCASE_VEHICLE_TRIPS_REFERENCE` = `20260325161142_trip_architecture_refactor` (line 5).
- `FIRST_CAMELCASE_VEHICLETRIP_REFERENCE` = `20260425000000_retire_user_assignment_and_speeding_severity` (line 16).
- `LOWERCASE_CAMELCASE_AUTHORITY_MISMATCH_COUNT` = **2 objects** (`VehicleTrip` vs `vehicle_trips`;
  `TripDrivingImpact` vs `trip_driving_impact`), spanning **5 statements**, all inside the single
  migration `20260425000000`. Canonical authority (current schema `@@map`) is lowercase; the
  camelCase references are the defect.

## 6. Git-history evidence

Searched all local refs and history:

```
git log --all -S'CREATE TABLE "vehicle_trips"' -- backend/prisma      → (none)
git log --all -S'CREATE TABLE "VehicleTrip"'   -- backend/prisma      → (none)
git log --all -S'model VehicleTrip'   -- backend/prisma/schema.prisma → 77c26dad (initial commit)
git log --all -S'@@map("vehicle_trips")' -- …/schema.prisma           → 77c26dad (initial commit)
```

- The `VehicleTrip` model **and** its `@@map("vehicle_trips")` exist from the very first commit
  `77c26dad`. The `20260325161142_trip_architecture_refactor` migration is also present at
  `77c26dad`, already altering a table nothing ever created.
- No `CREATE TABLE` for `vehicle_trips` / `VehicleTrip` exists in **any** ref (branches,
  remotes, initial commit).
- `AUTHORITATIVE_ORIGINAL_BASE_DDL_FOUND` = **NO**. The original base DDL is unrecoverable from
  the repository; it lived only in a `db push`-materialized database outside version control.

## 7. Pre-refactor field-level contract (state required before `20260325161142`)

Confidence legend: **PROVEN** (directly required by committed SQL) / **STRONGLY_DERIVED**
(required by a later committed migration) / **UNKNOWN** (cannot be proven from history).

| SQL column | Type (schema) | Evidence source | Confidence | Base membership |
|------------|---------------|-----------------|------------|-----------------|
| `id` | text/uuid PK | FK targets `vehicle_trips("id")` (`20260615140000`, `20260716150000`) | PROVEN | base |
| `dimo_mechanism` | — | refactor `DROP COLUMN IF EXISTS` | PROVEN (legacy) | base (dropped by refactor) |
| `road_surface_type` | — | refactor `DROP COLUMN IF EXISTS` | PROVEN (legacy) | base (dropped) |
| `road_surface_score` | — | refactor `DROP COLUMN IF EXISTS` | PROVEN (legacy) | base (dropped) |
| `climate_factor` | — | refactor `DROP COLUMN IF EXISTS` | PROVEN (legacy) | base (dropped) |
| `tire_wear_contrib_km` | — | refactor `DROP COLUMN IF EXISTS` | PROVEN (legacy) | base (dropped) |
| `dtc_codes_found` | — | refactor `DROP COLUMN IF EXISTS` | PROVEN (legacy) | base (dropped) |
| `avg_temperature_c` | — | refactor `DROP COLUMN IF EXISTS` | PROVEN (legacy) | base (dropped) |
| `speeding_percent` | double | refactor guarded ADD ("may already exist") | STRONGLY_DERIVED | base (uncertain) |
| `max_over_speed_kmh` | double | refactor guarded ADD | STRONGLY_DERIVED | base (uncertain) |
| `speeding_segments` | int | refactor guarded ADD | STRONGLY_DERIVED | base (uncertain) |
| `vehicle_id` | text | index `("vehicle_id","start_time")` (`20260413230000`) + FK to Vehicle | STRONGLY_DERIVED | base |
| `start_time` | timestamp | same composite index | STRONGLY_DERIVED | base |
| `assignment_status` | enum | `UPDATE "VehicleTrip" SET assignment_status …` (`20260425000000`); never added by any migration | STRONGLY_DERIVED | base (missing predecessor) |
| `assignment_subject_type` | enum | `UPDATE "VehicleTrip"` (`20260425000000`); never added | STRONGLY_DERIVED | base |
| `assignment_subject_id` | text | `UPDATE "VehicleTrip"` (`20260425000000`); never added | STRONGLY_DERIVED | base |
| ~85 other current-schema columns (`driver_name`, `end_time`, `distance_km`, `driving_score`, all `*_count`/`*_events`, detection/tracking cols, etc.) | various | present only in current schema; no migration creates them and no pre-refactor migration references them | **UNKNOWN** | cannot classify base vs later without lost DDL |

- Columns that must exist **before** the refactor: `id`, the 7 legacy dropped columns, the 3
  guarded speeding columns, `vehicle_id`, `start_time`, `assignment_*` (proven/derived above).
- Columns **added by** the refactor: `trip_status`, `avg_consumption_l_per_100km`,
  `fuel_confidence`, `energy_used_kwh`, `avg_consumption_kwh_per_100km`, `energy_confidence`,
  `outside_temperature_start_c`, `engine_temp_start_c`, `engine_temp_end_c`, `avg_rpm`,
  `avg_throttle_position`, `avg_engine_load`, `gap_ended`, `enriched_at`.
- Columns added by **later** migrations: `behavior_enrichment_status` (`20260410000000`),
  `booking_link_source` (`20260708044000`), `trip_analysis_status`/`analysis_*`/`quality_status`/
  `behavior_summary_status` (`20260705200000`, idempotent), etc.
- Legacy columns conditionally removed by the refactor: the 7 `DROP COLUMN IF EXISTS` above.
- Columns visible only in the current Prisma schema: the ~85 UNKNOWN rows.
- **`GUESSED_BASE_COLUMN_COUNT` = 0** — every column is classified by explicit evidence; none
  is invented. Columns that cannot be proven are labelled UNKNOWN rather than assumed.

## 8. Existing-database compatibility analysis (no production access)

CI-R3B must satisfy **both** targets:

- **A. Empty database** replaying all 283 migrations from scratch (the CI job).
- **B. Existing database** where `vehicle_trips` (and the other trip tables) already exist and
  later migrations are already recorded in `_prisma_migrations` (production/staging created via
  `db push` + retrofit).

Requirements and constraints:

- **Checksums**: `prisma migrate deploy` records a checksum per applied migration. Editing any
  already-applied migration risks a checksum/history conflict on B. **Default: unsafe.**
- **Already-applied migrations**: on B, `20260325161142`, `20260425000000`, etc. are (presumably)
  already recorded applied; a repair must not require them to re-run or to change.
- **Inserting an earlier-timestamped migration**: adding a bootstrap dated before
  `20260325161142` means, on B, Prisma sees a not-yet-applied migration ordered *before*
  applied ones. `migrate deploy` still applies pending migrations, but the bootstrap **must be
  fully idempotent** (no-op when objects already exist) to be safe on B, and reviewers must
  accept Prisma's out-of-order/"gap" reporting.
- **Idempotency**: every DDL in a retroactive bootstrap must use `CREATE TABLE IF NOT EXISTS`,
  `CREATE TYPE` guarded by `DO $$ … IF NOT EXISTS (pg_type) … $$`, `ADD COLUMN IF NOT EXISTS`,
  `CREATE INDEX IF NOT EXISTS`, and guarded FK creation, so B is untouched and A is created.
- **Data preservation**: a bootstrap that only creates-if-absent never drops or rewrites data on B.
- **Casing (§2b/§5)**: on A, `20260425000000` fails regardless of the base bootstrap because it
  references camelCase `"VehicleTrip"`/`"TripDrivingImpact"`. Making A pass requires either
  (i) editing `20260425000000` to lowercase (an **already-applied** migration edit → unsafe by
  default, checksum impact on B unproven) or (ii) knowing B's actual table casing and applied
  state. This is the blocking unknown.

## 9. Repair-option decision matrix

| Opt | Strategy | Empty-DB (A) | Existing-DB (B) | Checksum impact | Data-loss risk | Repairs real history? | Only hides? | Verdict |
|-----|----------|-------------|-----------------|-----------------|----------------|-----------------------|-------------|---------|
| A | Edit `20260311224040_init` to add trip tables | fixes base | edits an applied migration | **breaks** (checksum) | none | partially | no | REJECTED_UNSAFE |
| B | Edit `20260325161142` (add guarded CREATE) | fixes base | edits an applied migration | **breaks** | none | partially | partly | REJECTED_UNSAFE |
| C | Restore an authoritative missing pre-refactor migration | would fix base | new file, safe | none (new) | none | yes | no | **INSUFFICIENT_AUTHORITY** (no such file exists — §6) |
| **D** | **New retroactive, fully-idempotent bootstrap migration before the refactor** | **creates missing base objects** | **no-op via IF NOT EXISTS** | none (new file) | none | yes (captures the real gap) | no | **SAFE_CANDIDATE (for the creation gap)** |
| E | Normal end-of-history migration | too late — refactor already failed at #4 | n/a | none | none | no | no | REJECTED_UNSAFE (wrong order) |
| F | Squash/replace entire migration history | fixes A | forces baseline reset on B | high | high | resets, not repairs | partly | REJECTED_UNSAFE (needs prod coordination) |
| G | CI-only bootstrap SQL outside migrations | greens CI | n/a | none | none | no | **yes** | REJECTED_UNSAFE (hides defect) |
| H | `prisma db push` | diverges from migrations | drift | n/a | possible | no | yes | REJECTED_UNSAFE |
| I | `migrate resolve --applied` to skip failures | greens CI | leaves table absent on A | n/a | data-correctness risk | no | yes | REJECTED_UNSAFE |

**Leading candidate:** Option **D** for the base-table/enum creation gap. **However**, Option D
alone does **not** resolve the `20260425000000` casing defect (§2b), whose only in-repo remedy
is editing an already-applied migration (Option B-class, unsafe by default).

## 10. Proposed CI-R3B implementation contract (specification only)

- **Proposed path**: `backend/prisma/migrations/20260325161141_vehicle_trips_bootstrap/migration.sql`
  (timestamp one second before `20260325161142` so it applies immediately prior to the refactor).
- **Historical files changed**: none (new directory only).
- **Authority for each DDL element**: `id` + legacy/derived columns and enums from the §7
  PROVEN/STRONGLY_DERIVED set; the remaining base column set and the full shape of the other
  missing base tables require the **current Prisma schema as canonical authority**, gated behind
  `IF NOT EXISTS` — this is the item that needs explicit reviewer authorization because it means
  reconstructing base shape from the schema (see critical unknowns §11).
- **Objects it may create (all idempotent)**: enums `TripAssignmentStatus`,
  `TripAssignmentSubjectType`, `TripSource`; tables `vehicle_trips`, `vehicle_trip_waypoints`,
  `trip_driving_impact`, `vehicle_trip_detection_states`, `vehicle_trip_tracking_runs`,
  `driving_events`, restricted to columns **not** added by any later migration.
- **Fresh-DB behavior**: creates the base so migrations #4+ apply.
- **Existing-DB behavior**: every statement `IF NOT EXISTS` → no-op, no data change.
- **Idempotency strategy**: `CREATE TABLE IF NOT EXISTS`, enum-guard `DO`-blocks,
  `ADD COLUMN IF NOT EXISTS`, `CREATE INDEX IF NOT EXISTS`, guarded FK.
- **Data-preservation strategy**: create-if-absent only; never `DROP`/`UPDATE` existing rows.
- **Required verification databases**: (1) empty → full 283-migration replay must pass end-to-end;
  (2) simulated existing DB (schema pre-created) → bootstrap must be a no-op and later migrations
  still succeed.
- **Required CI jobs**: `Legal Documents — Production Readiness CI / Migration tests (PostgreSQL)`
  and `Backend integration tests`.
- **Rollback/stop conditions**: stop if the empty replay still fails at `20260425000000`
  (casing) — that defect requires a separately-authorized decision (edit an applied migration or
  prod-coordinated remedy).
- **Files allowed in CI-R3B**: the single new migration directory (+ its evidence doc);
  and — only if separately authorized — the casing correction to `20260425000000`.
- **Files forbidden in CI-R3B**: `schema.prisma`, any other existing migration, runtime, tests,
  workflows, dependencies, lockfiles, production config.

### Recommendation counters (audit findings, not authorization)

| Counter | Value |
|---------|-------|
| `HISTORICAL_APPLIED_MIGRATION_EDIT_REQUIRED` | YES — to clear the `20260425000000` casing defect (blocked on authority) |
| `RETROACTIVE_MIGRATION_REQUIRED` | YES — Option D bootstrap |
| `CURRENT_SCHEMA_CHANGE_REQUIRED` | NO |
| `RUNTIME_CHANGE_REQUIRED` | NO |
| `TEST_LOGIC_CHANGE_REQUIRED` | NO |
| `WORKFLOW_CHANGE_REQUIRED` | NO |
| `PRODUCTION_DATA_REPAIR_REQUIRED` | NO (idempotent bootstrap preserves data) |
| `PRODUCTION_DEPLOYMENT_REQUIRED` | NO (within CI-R3B; deploy handled by normal release) |

## 11. Critical unknowns (`IMPLEMENTATION_CRITICAL_UNKNOWN_COUNT` = 6)

1. **Exact pre-refactor column set of `vehicle_trips`** — ~85 current-schema columns cannot be
   proven pre-refactor vs added-by-lost-migration (§7 UNKNOWN rows).
2. **`TripSource` enum origin** — used by the schema (`@default(V2_LIVE)`) but created by no SQL.
3. **Production `_prisma_migrations` state of `20260425000000`** — is it recorded applied? its
   stored checksum?
4. **Production actual table casing** — is the live table `vehicle_trips`/`trip_driving_impact`
   (lowercase) or camelCase? Determines whether the casing edit is even needed on B.
5. **Whether editing `20260425000000` (checksum change) is acceptable on B** — unprovable without #3.
6. **Full DDL of the 5 other missing base tables** (`vehicle_trip_waypoints`,
   `trip_driving_impact`, `vehicle_trip_detection_states`, `vehicle_trip_tracking_runs`,
   `driving_events`) — same schema-vs-history authority gap as #1.

`GUESSED_BASE_COLUMN_COUNT` = 0.

## 12. Scope counters

| Counter | Value |
|---------|-------|
| `CHANGED_FILE_COUNT` | 1 |
| `HISTORICAL_MIGRATION_EDIT_COUNT` | 0 |
| `NEW_MIGRATION_COUNT` | 0 |
| `SCHEMA_CHANGE_COUNT` | 0 |
| `RUNTIME_CHANGE_COUNT` | 0 |
| `TEST_LOGIC_CHANGE_COUNT` | 0 |
| `WORKFLOW_CHANGE_COUNT` | 0 |
| `DEPENDENCY_CHANGE_COUNT` | 0 |
| `LOCKFILE_CHANGE_COUNT` | 0 |
| `PRODUCTION_CONFIG_CHANGE_COUNT` | 0 |
| `PRODUCTION_DATABASE_ACCESS_COUNT` | 0 |
| `PRODUCTION_DEPLOYMENT_COUNT` | 0 |
| `E6_CHANGE_COUNT` | 0 |
| `E7_RUNTIME_SCOPE_COUNT` | 0 |
| `E8_RUNTIME_SCOPE_COUNT` | 0 |
| `E9_RUNTIME_SCOPE_COUNT` | 0 |
| `OUT_OF_SCOPE_FILE_COUNT` | 0 |

Diagnostics used a disposable local PostgreSQL 16 cluster (`/tmp`, trust auth, destroyed after
use). No remote/production `DATABASE_URL` was ever used.

## 13. Final audit status

The fresh-database failure is independently reproduced; the complete vehicle-trip lineage,
creation gap, casing/ordering defects, and git-history absence of authoritative DDL are
documented; the pre-refactor contract contains zero guessed columns and every unknown is
recorded; repair alternatives are evaluated.

Option **D** (retroactive, idempotent bootstrap) is the leading, safe candidate for the
base-table/enum **creation gap**. But a single end-to-end safe CI-R3B strategy **cannot yet be
finalized** because (a) the exact historical base column set is unprovable from the repository
(original DDL lost), and (b) the independent **casing defect** in the already-committed,
likely-already-applied `20260425000000` cannot be repaired safely without production
`_prisma_migrations` authority (applied-state + checksum) and knowledge of the live table
casing — editing an applied migration is unsafe by default.

**Status: CI_R3A_AUTHORITY_BLOCKED** — audit complete; CI-R3B implementation requires the
authority items in §11 (2)–(6) before a single safe strategy can be committed.
