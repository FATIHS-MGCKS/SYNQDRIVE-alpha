# CI Recovery R3A — Vehicle Trip migration history authority audit

> **Documentation-only authority audit.** No migration, schema, runtime, test, workflow,
> dependency, or production artifact was changed. Disposable local PostgreSQL 16 was used for
> read/write diagnostics only and then destroyed. This audit determines the safe, evidence-backed
> repair strategy for CI-R3B; it does **not** implement it.
>
> Correction history: **CI-R3A.1** (§14) added two missing tables, the full 27-migration matrix,
> corrected column-authority and out-of-band-origin statements, and evaluated casing Option J.
> **CI-R3A.2** (§15) completes the schema-object inventory: the orphan `brake_trip_metrics`
> table, a ten-entry enum-predecessor inventory, the corrected temporal primary-key claim,
> explicit baseline/schema-only/false-positive migration accounting, and per-object bootstrap
> classification. All earlier statements are corrected in place for internal consistency.

## 1. Authoritative base and branch

- Authoritative base: `main @ 5015a17d250f0c2823580a1ff567f580dcac51aa` (CI-R2 merged).
- Audit branch: `fix/ci-r3a-vehicle-trips-migration-authority-audit-2026-08`.
- `PRE_CI_R3A_SHA` = `5015a17d250f0c2823580a1ff567f580dcac51aa`.
- Total committed migrations on base: **283** (+ `migration_lock.toml`).

## 2. Reproduced failure (independent)

Disposable PostgreSQL 16 (native cluster, user `synqdrive`, trust auth, `127.0.0.1:5432`),
fresh empty database, then `npx prisma migrate deploy`:

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
| Failing SQL | line 5: `ALTER TABLE "vehicle_trips" ADD COLUMN "trip_status" …` (unguarded) |
| `SUCCESSFULLY_APPLIED_MIGRATION_COUNT_BEFORE_FAILURE` | 3 |

### 2b. Independently confirmed casing defect

With lowercase `vehicle_trips`/`trip_driving_impact` + `TripAssignment*` enums pre-seeded,
`20260425000000`'s SQL run verbatim fails: `ERROR: relation "VehicleTrip" does not exist` at
`UPDATE "VehicleTrip"`. Quoted identifiers are case-sensitive; camelCase
`"VehicleTrip"`/`"TripDrivingImpact"` can never resolve to the canonical lowercase tables.

## 3. Migration-inventory accounting

Direct quoted-identifier search (`vehicle_trips`, `"VehicleTrip"`, `vehicle_trip_waypoints`,
`"VehicleTripWaypoint"`, `trip_behavior_events`, `"TripBehaviorEvent"`, `driving_events`,
`"DrivingEvent"`, `trip_driving_impact`, `"TripDrivingImpact"`, `vehicle_trip_detection_states`,
`vehicle_trip_tracking_runs`, `trip_repairs`, `"TripRepair"`, `TripStatus`, `TripSource`,
`TripAssignmentStatus`, `TripAssignmentSubjectType`, `TripBookingLinkSource`, `trip_id`):

- `DIRECT_TRIP_IDENTIFIER_MIGRATION_FILE_COUNT` = **27** (all matrixed in §3a).
- `UNMATRIXED_DIRECT_TRIP_MIGRATION_COUNT` = **0**.

Separately accounted authority evidence (not part of the 27, but not discarded):

- **Baseline-omission authority**: `20260311224040_init` — the generated init migration that
  **omits** every trip base table. `UNACCOUNTED_BASELINE_AUTHORITY_FILE_COUNT` = **0** (accounted here).
- **Enum-dependency migration**: `20260716230000_driving_event_type_native_mapper` —
  `ALTER TYPE "DrivingEventType" ADD VALUE …` on an enum no migration creates. Relevant via enum
  dependency (§4), not via a trip **table** identifier, so it is outside the 27 by construction.
- **Schema-only missing objects** (no migration reference at all): `vehicle_trip_detection_states`,
  `brake_trip_metrics`, and 7 enums (§4). `UNACCOUNTED_SCHEMA_ONLY_MISSING_OBJECT_COUNT` = **0**
  (all accounted in §4).
- **False-positive matches** (documented, not silently dropped),
  `FALSE_POSITIVE_MIGRATION_FILE_COUNT` categories: the bare substring `trip` inside `sTRIPe`
  (billing/Stripe migrations, e.g. `stripe_webhook_events`, `billing_stripe_*`); `tire_trip_usage_*`
  migrations that touch only `tire_trip_usage_ledger` (its own created table) — verified in
  `20260716230000_tire_trip_usage_replay_safety`, `20260717120000_driving_decision_audits`,
  `20260710100000_vehicle_driving_assessment_quality`, `20260716340000_rental_driving_analysis_versioning`
  (none reference a trip base table); and column-name substrings such as `driving_events_count`,
  `crank_trip_id`, `superseded_by_trip_id`, and `DrivingEventType` when loosely matching `DrivingEvent`.

### 3a. Chronological authority matrix (all 27 direct migrations)

| # | Migration | Trip statement(s) | Casing | Classification |
|---|-----------|-------------------|--------|----------------|
| 1 | `20260325161142_trip_architecture_refactor` | `CREATE TYPE "TripStatus"`; `ALTER "vehicle_trips"` (unguarded) + guarded ADD/DROP; `CREATE INDEX …trip_status` | lower | MISSING_PREDECESSOR (first P3018) |
| 2 | `20260331000000_v3_hardware_type` | `CREATE TYPE "DrivingEventSource"`; `ALTER "driving_events"` (unguarded); index | lower | MISSING_PREDECESSOR (`driving_events`) |
| 3 | `20260410000000_add_enrichment_status_fields` | `ALTER "vehicle_trips" ADD behavior_enrichment_status`; index | lower | ORDERING_DEFECT |
| 4 | `20260413230000_add_composite_indexes_batch_c` | `CREATE INDEX CONCURRENTLY IF NOT EXISTS` on `vehicle_trips`, `driving_events`, `trip_behavior_events` | lower | MISSING_PREDECESSOR (`trip_behavior_events`) |
| 5 | `20260425000000_retire_user_assignment_and_speeding_severity` | `UPDATE/ALTER "VehicleTrip"`; enum rebuild `TripAssignmentStatus`/`TripAssignmentSubjectType`; `ALTER "TripDrivingImpact" DROP COLUMN` | **camel** | CASE_MISMATCH + MISSING_PREDECESSOR |
| 6 | `20260609000000_autovacuum_tuning` | `ALTER "vehicle_trip_tracking_runs"/"trip_repairs"/"vehicle_trip_waypoints" SET (...)` | lower | MISSING_PREDECESSOR (×3) |
| 7 | `20260615140000_misuse_cases` | FK `trip_id → "vehicle_trips"("id")` (first PK requirement) | lower | ORDERING_DEFECT |
| 8 | `20260628150000_rpm_webhook_candidate` | references `vehicle_trips`/`trip_id` | lower | ORDERING_DEFECT |
| 9 | `20260705140000_trip_analysis_status` | `ALTER "vehicle_trips"` analysis cols | lower | ORDERING_DEFECT |
| 10 | `20260705200000_trip_analysis_status_guard` | `ADD COLUMN IF NOT EXISTS` analysis cols | lower | ORDERING_DEFECT (idempotent) |
| 11 | `20260708044000_trip_booking_link_source` | `CREATE TYPE "TripBookingLinkSource"`; `ALTER "vehicle_trips"`; `UPDATE` | lower | ORDERING_DEFECT |
| 12 | `20260716150000_battery_v2_measurement_sessions` | FK `trip_id → "vehicle_trips"("id")` | lower | ORDERING_DEFECT |
| 13 | `20260716194500_trip_assessabilities` | `CREATE TABLE trip_assessabilities` (FK → vehicle_trips) | lower | ORDERING_DEFECT |
| 14 | `20260716200000_driving_evidence` | `CREATE TABLE driving_evidence` (FK → vehicle_trips) | lower | ORDERING_DEFECT |
| 15 | `20260716203000_driving_analysis_runs` | `CREATE TABLE` (FK → vehicle_trips) | lower | ORDERING_DEFECT |
| 16 | `20260716210000_driving_intelligence_jobs` | `CREATE TABLE` (FK → vehicle_trips) | lower | ORDERING_DEFECT |
| 17 | `20260716210000_tire_trip_usage_ledger` | `CREATE TABLE` (FK → vehicle_trips) | lower | ORDERING_DEFECT |
| 18 | `20260716220000_tire_trip_usage_attribution` | `ALTER "vehicle_trips"` add tire-usage cols | lower | ORDERING_DEFECT |
| 19 | `20260716240000_driving_event_native_identity` | `ALTER "driving_events"` | lower | ORDERING_DEFECT |
| 20 | `20260716250000_driving_impact_provenance` | `ALTER "trip_driving_impact"` | lower | MISSING_PREDECESSOR (`trip_driving_impact`) |
| 21 | `20260716260000_driving_impact_braking_provenance` | `ALTER "trip_driving_impact"` | lower | ORDERING_DEFECT |
| 22 | `20260716270000_driving_impact_load_components` | `ALTER "trip_driving_impact"` | lower | ORDERING_DEFECT |
| 23 | `20260716310000_driving_attribution_roles` | references trip/`trip_id` | lower | ORDERING_DEFECT |
| 24 | `20260716320000_driver_attributions` | `CREATE TABLE driver_attributions` (FK → vehicle_trips) | lower | ORDERING_DEFECT |
| 25 | `20260717180000_trip_driving_impact_authoritative_coverage` | `CREATE TYPE "TripDrivingImpactAnalysisStatus"`; `ALTER "trip_driving_impact"` | lower | ORDERING_DEFECT |
| 26 | `20260717190000_dimo_braking_event_intake` | FK → `vehicle_trips`/`driving_events` | lower | ORDERING_DEFECT |
| 27 | `20260717200000_braking_event_ledger` | FK → `vehicle_trips` | lower | ORDERING_DEFECT |

## 4. Schema-driven object inventory

Built from the authoritative Prisma schema (not a fixed identifier list). Consistent
classification rule for every missing object, whether or not a migration references it.

### 4a. Missing base tables — `KNOWN_MISSING_TRIP_TABLE_COUNT` = **9**; `UNASSESSED_MISSING_TRIP_TABLE_COUNT` = **0**; `KNOWN_MISSING_BASE_TABLE_OMISSION_COUNT` = **0**

| # | Prisma model | Table | 1st schema commit | `CREATE TABLE` count | Migration refs | 1st unguarded ref | Replay requires? | Runtime status | Historical DDL | Bootstrap class |
|---|-------------|-------|-------------------|----------------------|----------------|-------------------|------------------|----------------|----------------|-----------------|
| 1 | `VehicleTrip` | `vehicle_trips` | 77c26dad | 0 | 19 | `20260325161142` ALTER | YES | runtime-used | UNKNOWN | BOOTSTRAP_REPLAY_REQUIRED |
| 2 | `DrivingEvent` | `driving_events` | 77c26dad | 0 | 4 | `20260331000000` ALTER | YES | runtime-used | UNKNOWN | BOOTSTRAP_REPLAY_REQUIRED |
| 3 | `TripBehaviorEvent` | `trip_behavior_events` | 77c26dad | 0 | 1 | `20260413230000` INDEX | YES | runtime-used | UNKNOWN | BOOTSTRAP_REPLAY_REQUIRED |
| 4 | `VehicleTripWaypoint` | `vehicle_trip_waypoints` | 77c26dad | 0 | 1 | `20260609000000` ALTER SET | YES | runtime-used | UNKNOWN | BOOTSTRAP_REPLAY_REQUIRED |
| 5 | `VehicleTripTrackingRun` | `vehicle_trip_tracking_runs` | 77c26dad | 0 | 1 | `20260609000000` ALTER SET | YES | runtime-used | UNKNOWN | BOOTSTRAP_REPLAY_REQUIRED |
| 6 | `TripRepair` | `trip_repairs` | 77c26dad | 0 | 1 | `20260609000000` ALTER SET | YES | runtime-used | UNKNOWN | BOOTSTRAP_REPLAY_REQUIRED |
| 7 | `TripDrivingImpact` | `trip_driving_impact` | 77c26dad | 0 | 4 | `20260425000000` (camel), `20260716250000` (lower) | YES | runtime-used | UNKNOWN | BOOTSTRAP_REPLAY_REQUIRED |
| 8 | `VehicleTripDetectionState` | `vehicle_trip_detection_states` | 77c26dad | 0 | **0** | none | NO | runtime-used (no migration ref) | UNKNOWN | SCHEMA_PARITY_ONLY |
| 9 | `BrakeTripMetric` | `brake_trip_metrics` | 77c26dad | 0 | **0** | none | NO | **orphan** (no backend/src readers/writers) | UNKNOWN | ORPHAN_REVIEW_REQUIRED |

Consistency rule: `vehicle_trip_detection_states` and `brake_trip_metrics` both have **zero**
migration references. Neither blocks replay. `vehicle_trip_detection_states` is retained as
SCHEMA_PARITY_ONLY (it is a live, runtime-used trip state table); `brake_trip_metrics` is
ORPHAN_REVIEW_REQUIRED (no migration reference **and** no code reader/writer — a product decision
is required whether to bootstrap it or remove it from the schema). Both are explicitly classified;
neither is silently dropped and neither is auto-promoted into the bootstrap.

Present (not missing, 1 `CREATE TABLE` each): `trip_assessabilities`, `driving_evidence`,
`driving_analysis_runs`, `driving_intelligence_jobs`, `driver_attributions`,
`tire_trip_usage_ledger`, `misuse_cases`, `rpm_webhook_candidates`, `braking_event_ledger`,
`dimo_braking_event_intake`, `battery_measurement_sessions`. `tire_trip_usage_attribution` is
**not** a table (columns on `vehicle_trips`).

`TRIP_BEHAVIOR_EVENTS_CREATE_COUNT` = 0 (first ref `20260413230000_add_composite_indexes_batch_c`).
`TRIP_REPAIRS_CREATE_COUNT` = 0 (first ref `20260609000000_autovacuum_tuning`).

### 4b. Enum-dependency inventory — `KNOWN_MISSING_ENUM_PREDECESSOR_COUNT` = **10**; `UNASSESSED_MISSING_ENUM_PREDECESSOR_COUNT` = **0**

| # | Enum | Consumed by (model.field) | `CREATE TYPE` | `ALTER TYPE` | 1st unguarded ref | Later clean create? | Replay-blocking? | Bootstrap class |
|---|------|---------------------------|---------------|--------------|-------------------|---------------------|------------------|-----------------|
| 1 | `TripSource` | `VehicleTrip.trip_source` | 0 | 0 | none | no | NO | SCHEMA_PARITY_ONLY |
| 2 | `TripAssignmentStatus` | `VehicleTrip.assignment_status` | 1 (rebuild) | 1 (RENAME old) | `20260425000000` (RENAME assumes predecessor) | no (rebuild after assumed predecessor) | YES | BOOTSTRAP_REPLAY_REQUIRED |
| 3 | `TripAssignmentSubjectType` | `VehicleTrip.assignment_subject_type` | 1 (rebuild) | 1 (RENAME old) | `20260425000000` | no | YES | BOOTSTRAP_REPLAY_REQUIRED |
| 4 | `DrivingEventType` | `DrivingEvent.event_type`, `TripBehaviorEvent`-adjacent | 0 | 2 (`20260716230000` ADD VALUE) | `20260716230000` (`ALTER TYPE` on non-existent type) | no | YES | BOOTSTRAP_REPLAY_REQUIRED |
| 5 | `BehaviorEventCategory` | `TripBehaviorEvent.event_category` | 0 | 0 | none | no | NO (but needed to build table #3 at parity) | SCHEMA_PARITY_ONLY |
| 6 | `BehaviorEventClassification` | `TripBehaviorEvent.classification` | 0 | 0 | none | no | NO | SCHEMA_PARITY_ONLY |
| 7 | `TripDetectionState` | `VehicleTripDetectionState.state`, `VehicleTripTrackingRun.state_at_run` | 0 | 0 | none | no | NO | SCHEMA_PARITY_ONLY |
| 8 | `TripTrackingRunType` | `VehicleTripTrackingRun.run_type` | 0 | 0 | none | no | NO | SCHEMA_PARITY_ONLY |
| 9 | `VehicleDetectionProfile` | `VehicleTrip.detection_profile`, `VehicleTripDetectionState.detection_profile` | 0 | 0 | none | no | NO | SCHEMA_PARITY_ONLY |
| 10 | `DetectionConfidence` | `VehicleTrip.start_confidence/end_confidence`, detection tables | 0 | 0 | none | no | NO | SCHEMA_PARITY_ONLY |

Created enums (not missing): `TripStatus` (`20260325161142`), `DrivingEventSource`
(`20260331000000`), `TripBookingLinkSource` (`20260708044000`), `TripDrivingImpactAnalysisStatus`
(`20260717180000`).

Important: `TripAssignmentStatus`/`TripAssignmentSubjectType` are **not** properly created — the
only `CREATE TYPE` occurs inside `20260425000000` **after** first `ALTER TYPE … RENAME TO …_old`,
which assumes an earlier enum exists. `DrivingEventType` is only `ALTER`ed (never created). None of
these three count as a clean predecessor creation.

## 5. Corrected temporal primary-key / column authority

The first unguarded statement of `20260325161142` (`ALTER TABLE "vehicle_trips" ADD COLUMN …`)
requires **only that the relation `vehicle_trips` exists**. It does **not** require an `id` column,
a unique constraint, or a primary key.

| Requirement | First committed statement that needs it |
|-------------|------------------------------------------|
| `RELATION_EXISTENCE_REQUIRED_AT` | `20260325161142_trip_architecture_refactor` (relation must exist) |
| `COLUMN_REQUIRED_AT` | `20260413230000_add_composite_indexes_batch_c` (index needs `vehicle_id`, `start_time` to exist) |
| `UNIQUE_OR_PRIMARY_KEY_REQUIRED_AT` | `20260615140000_misuse_cases` (FK `trip_id → "vehicle_trips"("id")` needs `id` to be a unique/PK key) |
| `CURRENT_SCHEMA_STRUCTURAL_REQUIREMENT` | `id String @id @default(uuid())` — PK in the current schema |
| `BOOTSTRAP_EVENTUAL_REQUIREMENT` | bootstrap must give `vehicle_trips.id` a PK before `20260615140000` applies |

- `FALSE_PRE_REFACTOR_PRIMARY_KEY_REQUIREMENT_COUNT` = **0** (the earlier "must exist with a
  primary key before `20260325161142`" claim is withdrawn — only relation existence is required
  at that point).
- Legacy conditionally-dropped columns (`dimo_mechanism`, `road_surface_type`, `road_surface_score`,
  `climate_factor`, `tire_wear_contrib_km`, `dtc_codes_found`, `avg_temperature_c`) →
  LEGACY_POSSIBLE / UNKNOWN_PREEXISTENCE, required-before = NO.
- Guarded speeding adds (`speeding_percent`, `max_over_speed_kmh`, `speeding_segments`) →
  OPTIONAL_PREEXISTING_GUARDED, required-before = NO.
- `FALSE_PROVEN_BASE_COLUMN_COUNT` = **0**; `GUESSED_BASE_COLUMN_COUNT` = **0**.

## 6. Git-history evidence

```
git log --all -S'CREATE TABLE "vehicle_trips"' -- backend/prisma      → (none)
git log --all -S'CREATE TABLE "VehicleTrip"'   -- backend/prisma      → (none)
git log --all -S'model VehicleTrip'   -- schema.prisma                → 77c26dad
git log --all -S'@@map("vehicle_trips")' -- schema.prisma             → 77c26dad
model BrakeTripMetric introduced (diff-filter=A)                       → 77c26dad
```

- All 9 missing tables' models exist since the initial commit `77c26dad`; no `CREATE TABLE` for
  any exists in any ref. `AUTHORITATIVE_ORIGINAL_BASE_DDL_FOUND` = **NO**.
- `OUT_OF_BAND_BASELINE_EXISTENCE` = **PROVEN**; `OUT_OF_BAND_BASELINE_CREATION_METHOD` =
  **UNKNOWN** (`prisma db push`, manual SQL, untracked migration, dump/restore, or other external
  provisioning — not asserted as fact).

## 7. Replay-failure cascade (tables + enums)

Each step assumes all earlier dependencies were hypothetically satisfied.

| Order | Migration | Failing object | Class |
|-------|-----------|----------------|-------|
| 1 | `20260325161142` | `vehicle_trips` (ALTER) | replay-blocking table |
| 2 | `20260331000000` | `driving_events` (ALTER) | replay-blocking table |
| 3 | `20260413230000` | `trip_behavior_events` (INDEX) | replay-blocking table |
| 4 | `20260425000000` | `TripAssignmentStatus`/`TripAssignmentSubjectType` predecessor (RENAME) **and** camelCase `"VehicleTrip"`/`"TripDrivingImpact"` | replay-blocking enum predecessor + casing |
| 5 | `20260609000000` | `vehicle_trip_tracking_runs`, `trip_repairs`, `vehicle_trip_waypoints` (ALTER SET) | replay-blocking tables |
| 6 | `20260716230000` | `DrivingEventType` (`ALTER TYPE` on non-existent enum) | replay-blocking enum predecessor |
| 7 | `20260716250000`+ | `trip_driving_impact` (ALTER) | replay-blocking table |

Separated classes: **replay-blocking defects** (7 tables + 3 enums); **schema-parity drift**
(`vehicle_trip_detection_states` + 7 enums, never referenced by a migration but present in the
schema); **orphan** (`brake_trip_metrics`); **production-authority unknowns** (§12).

## 8. Existing-database compatibility

CI-R3B must satisfy **A.** empty-DB replay of all 283 migrations and **B.** existing DB where trip
tables exist and later migrations are recorded in `_prisma_migrations`. Editing an already-applied
migration risks a checksum/history conflict on B (unsafe by default); a retroactive insert must be
fully idempotent to be a no-op on B; the casing defect fails on A regardless of the base bootstrap.

## 9. Repair-option decision matrix

| Opt | Strategy | Empty-DB (A) | Existing-DB (B) | Verdict |
|-----|----------|-------------|-----------------|---------|
| A | Edit `20260311224040_init` | fixes base | edits applied migration (checksum) | REJECTED_UNSAFE |
| B | Edit `20260325161142` | fixes base | edits applied migration | REJECTED_UNSAFE |
| C | Restore authoritative missing migration | would fix | new file | INSUFFICIENT_AUTHORITY (no such file exists) |
| **D** | New retroactive, idempotent bootstrap before the refactor | creates missing base | no-op via `IF NOT EXISTS` | **SAFE_CANDIDATE (base-gap only)** |
| E | End-of-history migration | too late | n/a | REJECTED_UNSAFE |
| F | Squash/replace history | fixes A | baseline reset on B | REJECTED_UNSAFE |
| G | CI-only bootstrap SQL | greens CI | n/a | REJECTED_UNSAFE (hides) |
| H | `prisma db push` | drift | drift | REJECTED_UNSAFE |
| I | `migrate resolve --applied` | table absent on A | n/a | REJECTED_UNSAFE |
| J | Guarded retroactive pre/post casing-compat migrations (rename lowercase→camel before `20260425000000`, back after) | can pass | runtime-visible wrong-casing window; guard must gate on prod applied-state | INSUFFICIENT_AUTHORITY |

Option J detail: `migrate deploy` applies interleaved pending migrations, so M1 (pre) and M2
(post) both run on B. A naive "rename if lowercase exists and camel absent" guard is **true** on B
→ would rename the live table, creating a non-atomic (two-transaction) runtime window with the
wrong casing. Safe gating requires reading prod `_prisma_migrations` applied-state — unknown.
`ALTER TABLE RENAME` preserves FKs/indexes/OIDs; the enum rebuild is name-independent. Verdict
`INSUFFICIENT_AUTHORITY`. Option J is nonetheless a genuine **in-repository, append-only**
alternative, so the claim that editing `20260425000000` is the *only* in-repo remedy is withdrawn.
`UNASSESSED_CASING_REPAIR_STRATEGY_COUNT` = **0**.

## 10. Provisional CI-R3B contract (specification only — blocked)

`KNOWN_MISSING_SCHEMA_OBJECT_COUNT` = **19** (9 tables + 10 enums);
`UNCLASSIFIED_MISSING_SCHEMA_OBJECT_COUNT` = **0**. Per-object classification (§4):

| Class | Objects | Count |
|-------|---------|-------|
| BOOTSTRAP_REPLAY_REQUIRED | tables: `vehicle_trips`, `driving_events`, `trip_behavior_events`, `vehicle_trip_waypoints`, `vehicle_trip_tracking_runs`, `trip_repairs`, `trip_driving_impact`; enums: `TripAssignmentStatus`, `TripAssignmentSubjectType`, `DrivingEventType` | 10 |
| SCHEMA_PARITY_ONLY | table: `vehicle_trip_detection_states`; enums: `TripSource`, `BehaviorEventCategory`, `BehaviorEventClassification`, `TripDetectionState`, `TripTrackingRunType`, `VehicleDetectionProfile`, `DetectionConfidence` | 8 |
| ORPHAN_REVIEW_REQUIRED | table: `brake_trip_metrics` | 1 |

- `PROVISIONAL_BOOTSTRAP_OBJECT_COUNT` = **18** (10 replay-required + 8 schema-parity; excludes the
  1 orphan pending product decision).
- `PROVISIONAL_BOOTSTRAP_OMITTED_OBJECT_COUNT` = **0** — every replay-required object is included;
  the single excluded object (`brake_trip_metrics`) has an explicit evidence-backed classification
  (ORPHAN_REVIEW_REQUIRED: zero migration references and zero backend readers/writers → product
  decision required before it is bootstrapped or removed from the schema).
- Not every missing object must be one bootstrap migration: schema-parity enums typed onto
  replay-required tables (e.g. `BehaviorEventCategory` on `trip_behavior_events`) may be created as
  their enum type or provisionally as `TEXT` pending historical-value authority — flagged
  INSUFFICIENT_AUTHORITY, not silently promoted.
- Authority for each object's exact DDL remains the current Prisma schema behind `IF NOT EXISTS`
  guards — requires reviewer authorization (§12), not historical proof.
- `BASE_GAP_STRATEGY_STATUS` = **SAFE_CANDIDATE**; `CASING_STRATEGY_STATUS` =
  **INSUFFICIENT_AUTHORITY**; `END_TO_END_R3B_STRATEGY_STATUS` = **BLOCKED**.

### Recommendation counters (findings, not authorization)

`HISTORICAL_APPLIED_MIGRATION_EDIT_REQUIRED` = UNKNOWN (avoidable only if Option J proven safe with
prod authority); `RETROACTIVE_MIGRATION_REQUIRED` = YES; `CURRENT_SCHEMA_CHANGE_REQUIRED` = NO;
`RUNTIME_CHANGE_REQUIRED` = NO; `TEST_LOGIC_CHANGE_REQUIRED` = NO; `WORKFLOW_CHANGE_REQUIRED` = NO;
`PRODUCTION_DATA_REPAIR_REQUIRED` = NO; `PRODUCTION_DEPLOYMENT_REQUIRED` = NO.

## 11. Pre-refactor field-level contract

Minimal provable pre-refactor contract: relation `vehicle_trips` exists (no column/PK proven
required at that instant — §5). Every data column is STRONGLY_DERIVED (by a later migration's first
reference) or UNKNOWN. No column is guessed.

## 12. Critical unknowns — `IMPLEMENTATION_CRITICAL_UNKNOWN_COUNT` = **23**

Each item: exact object · missing evidence · why it blocks implementation · possible source · stop
condition.

Historical table shapes (8):
1. `vehicle_trips` exact historical columns — original base DDL absent; bootstrap shape unproven; source: prod DB introspection; stop if a column cannot be classified.
2. `driving_events` exact historical columns — same.
3. `trip_behavior_events` exact historical columns — same.
4. `vehicle_trip_waypoints` exact historical columns — same.
5. `vehicle_trip_tracking_runs` exact historical columns — same.
6. `trip_repairs` exact historical columns — same.
7. `trip_driving_impact` exact historical columns — same.
8. `vehicle_trip_detection_states` exact historical columns — same.

Historical enum origins/values (10):
9. `TripSource` origin/values.
10. `TripAssignmentStatus` predecessor values (pre-rebuild).
11. `TripAssignmentSubjectType` predecessor values.
12. `DrivingEventType` base values (only ADD VALUEs are committed).
13. `BehaviorEventCategory` origin/values.
14. `BehaviorEventClassification` origin/values.
15. `TripDetectionState` origin/values.
16. `TripTrackingRunType` origin/values.
17. `VehicleDetectionProfile` origin/values.
18. `DetectionConfidence` origin/values.

Environment/authority (5):
19. Existing-database object presence (which of the 19 already exist on prod/staging).
20. Live table casing (lowercase vs camelCase) for `vehicle_trips`/`trip_driving_impact`.
21. `_prisma_migrations` applied-state and checksums (esp. `20260425000000`).
22. A proven-safe casing-repair mechanism (Option B vs J) given (20)/(21).
23. `brake_trip_metrics` orphan treatment — bootstrap it or remove from schema (zero migration
    refs + zero readers/writers); source: product/architecture decision.

`GUESSED_BASE_COLUMN_COUNT` = 0. `STALE_CRITICAL_UNKNOWN_COUNT` = **0** (prior value 12 superseded).
`GROUPED_UNCOUNTED_CRITICAL_UNKNOWN_COUNT` = **0** (each table/enum counted individually).

## 13. Scope counters

| Counter | Value |
|---------|-------|
| `CHANGED_FILE_COUNT` / `AUDIT_REPORT_CHANGE_COUNT` | 1 |
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
| `CI_R3B_IMPLEMENTATION_COUNT` | 0 |
| `E6`/`E7`/`E8`/`E9` scope counts | 0 |
| `OUT_OF_SCOPE_FILE_COUNT` | 0 |

Diagnostics used a disposable local PostgreSQL 16 cluster (destroyed after use). No
remote/production `DATABASE_URL` was ever used.

## 14. CI-R3A.1 — Independent Review Corrections (prior)

Added `trip_behavior_events` and `trip_repairs`; enumerated the 27-migration matrix; corrected the
replay cascade (driving_events/trip_behavior_events fail before the casing defect); reclassified
legacy/guarded columns; stated the out-of-band origin as PROVEN existence / UNKNOWN method;
evaluated casing Option J. (Superseded counts from this pass are corrected in §15.)

## 15. CI-R3A.2 — Complete Trip Schema Authority Inventory

Independent review found the schema-object inventory still incomplete. Corrections (all integrated
above):

- **`brake_trip_metrics`** identified as an additional missing schema table (model since
  `77c26dad`; `CREATE TABLE` = 0; migration refs = 0; no backend readers/writers) →
  `KNOWN_MISSING_TRIP_TABLE_COUNT` corrected from 8 to **9**, classified ORPHAN_REVIEW_REQUIRED
  under the same consistency rule already applied to `vehicle_trip_detection_states` (§4a).
- **Ten-entry enum-predecessor inventory** added (§4b): `TripSource`, `TripAssignmentStatus`,
  `TripAssignmentSubjectType`, `DrivingEventType`, `BehaviorEventCategory`,
  `BehaviorEventClassification`, `TripDetectionState`, `TripTrackingRunType`,
  `VehicleDetectionProfile`, `DetectionConfidence` → `KNOWN_MISSING_ENUM_PREDECESSOR_COUNT` = 10.
  `DrivingEventType` is `ALTER`ed (`20260716230000`) but never created;
  `TripAssignmentStatus`/`TripAssignmentSubjectType` are only rebuilt after assuming a predecessor.
- **Temporal primary-key claim corrected** (§5): only relation existence is required before
  `20260325161142`; column requirement at `20260413230000`; PK/unique requirement at
  `20260615140000`. `FALSE_PRE_REFACTOR_PRIMARY_KEY_REQUIREMENT_COUNT` = 0.
- **Migration accounting made explicit** (§3): `DIRECT_TRIP_IDENTIFIER_MIGRATION_FILE_COUNT` = 27,
  distinguished from baseline authority (`20260311224040_init`), the enum-dependency migration
  (`20260716230000_driving_event_type_native_mapper`), schema-only missing objects, and documented
  false positives (Stripe substring, `tire_trip_usage_*`, column-name substrings).
- **Bootstrap candidates separated** from schema-parity and orphan objects (§10):
  `KNOWN_MISSING_SCHEMA_OBJECT_COUNT` = 19, `PROVISIONAL_BOOTSTRAP_OBJECT_COUNT` = 18,
  `PROVISIONAL_BOOTSTRAP_OMITTED_OBJECT_COUNT` = 0.
- **Critical unknowns recalculated individually** to **23** (§12); prior value 12 superseded;
  `GROUPED_UNCOUNTED_CRITICAL_UNKNOWN_COUNT` = 0.
- No migration, schema, runtime, test, workflow, dependency, config, database, or deployment change
  occurred. CI-R3B remains blocked. E7 was not started.

## 16. Final audit status

The inventory is now complete and internally consistent: 9 missing tables (incl. the orphan
`brake_trip_metrics`), 10 missing enum predecessors, 19 total missing schema objects (0
unclassified), corrected temporal primary-key authority, explicit direct/baseline/schema-only/
false-positive migration accounting, and 23 individually-counted critical unknowns. Option **D**
is a SAFE_CANDIDATE for the base-gap; casing repair is INSUFFICIENT_AUTHORITY; and a single safe
end-to-end CI-R3B strategy cannot be finalized while the §12 authority items remain unresolved.

**Status: CI_R3A_AUTHORITY_BLOCKED** — audit complete and corrected; CI-R3B implementation
requires the §12 authority before a single safe strategy can be committed.
