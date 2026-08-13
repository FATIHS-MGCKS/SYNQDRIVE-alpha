# CI Recovery R3A — Vehicle Trip migration history authority audit

> **Documentation-only authority audit.** No migration, schema, runtime, test, workflow,
> dependency, or production artifact was changed. Disposable local PostgreSQL 16 was used for
> read/write diagnostics only and then destroyed. This audit determines the safe, evidence-backed
> repair strategy for CI-R3B; it does **not** implement it.
>
> Correction history: **CI-R3A.1** added two missing tables + the 27-migration matrix.
> **CI-R3A.2** completed the schema-object inventory. **CI-R3A.3** corrected model/enum
> introduction commits. **CI-R3A.4** (this revision, §17) corrects the classified universe to 55,
> adds full initial/current table shapes (appendix, no ellipses) and per-model evolution commits,
> separates missing **creation** DDL from existing **evolution** DDL, and replaces the grouped
> pseudo-ledger with a mechanically-validated **atomic** critical-unknown table. Superseded values
> are marked "SUPERSEDED BY CI-R3A.4".

## 1. Authoritative base and branch

- Authoritative base: `main @ 5015a17d250f0c2823580a1ff567f580dcac51aa` (CI-R2 merged).
- Audit branch: `fix/ci-r3a-vehicle-trips-migration-authority-audit-2026-08`.
- Total committed migrations on base: **283** (+ `migration_lock.toml`).

## 2. Reproduced failure (independent)

Disposable PostgreSQL 16, fresh empty database, `npx prisma migrate deploy`:

```
Applying migration `20260325161142_trip_architecture_refactor`
Error: P3018 … Database error code: 42P01
ERROR: relation "vehicle_trips" does not exist   (routine RangeVarGetRelidExtended)
```

| Field | Value |
|-------|-------|
| `FRESH_DB_MIGRATION_REPLAY` | FAIL |
| `PRISMA_ERROR_CODE` | P3018 |
| `POSTGRES_SQLSTATE` | 42P01 |
| `FIRST_FAILING_MIGRATION` | `20260325161142_trip_architecture_refactor` (migration #4) |
| `FIRST_MISSING_RELATION` | `vehicle_trips` |
| `SUCCESSFULLY_APPLIED_MIGRATION_COUNT_BEFORE_FAILURE` | 3 |

Corroborated by `docs/audits/pr-recovery/phase3-e2-migration-validation-2026-08.md`
(`EXISTING_E2_MIGRATION_EVIDENCE_ACCOUNTED = YES`): it independently records the same greenfield
`P3018` / `42P01`, missing `vehicle_trips`, first-failing `20260325161142` at migration #4, and 3
migrations applied before failure. Corroborating repository evidence, not a substitute.

### 2b. Casing defect (independently confirmed)

With lowercase `vehicle_trips`/`trip_driving_impact` + `TripAssignment*` enums pre-seeded,
`20260425000000` fails: `ERROR: relation "VehicleTrip" does not exist` at `UPDATE "VehicleTrip"`.

## 3. Migration search universe — TOTAL = 55

Two searches reproduced: bare case-insensitive `trip` scan = **53** files; direct quoted-identifier
scan = **27** files. Their union (`DIRECT_BARE_UNION_MIGRATION_FILE_COUNT`) = **54**. One
enum-dependency migration (`20260716230000_driving_event_type_native_mapper`,
`ALTER TYPE "DrivingEventType" ADD VALUE`) lies **outside** that union (it contains neither a bare
`trip` substring nor a trip-table identifier); `ADDITIONAL_ENUM_DEPENDENCY_MIGRATION_FILE_COUNT` =
**1**. Therefore `TOTAL_CLASSIFIED_MIGRATION_FILE_COUNT` = **55**.

Every one of the 55 files is classified into exactly one category
(`UNCLASSIFIED_BROAD_SEARCH_MIGRATION_FILE_COUNT` = 0; `DUPLICATE_MIGRATION_CLASSIFICATION_COUNT` = 0;
`MIGRATION_CLASSIFICATION_ARITHMETIC_MISMATCH_COUNT` = 0):

| Category | Count |
|----------|-------|
| DIRECT_TRIP_IDENTIFIER_AUTHORITY | 27 |
| BASELINE_OMISSION_AUTHORITY | 1 |
| ENUM_DEPENDENCY_AUTHORITY | 1 |
| RELATED_PRESENT_TRIP_OBJECT | 11 |
| LEXICAL_FALSE_POSITIVE | 15 |
| **Total** | **55** |

Arithmetic: 27 + 1 + 1 + 11 + 15 = **55**. `FALSE_POSITIVE_MIGRATION_FILE_COUNT` = **15**;
`UNMATRIXED_DIRECT_TRIP_MIGRATION_COUNT` = 0.

- **DIRECT_TRIP_IDENTIFIER_AUTHORITY (27):** the §3a matrix files.
- **BASELINE_OMISSION_AUTHORITY (1):** `20260311224040_init` (the baseline that omits all trip tables).
- **ENUM_DEPENDENCY_AUTHORITY (1):** `20260716230000_driving_event_type_native_mapper`.
- **RELATED_PRESENT_TRIP_OBJECT (11):** `20260413183000_brake_health_canonical_refactor`
  (`modeled_trip_count`), `20260420070000_vehicle_energy_events` (`trips`),
  `20260422010000_vehicle_current_safety_score` (`trip`), `20260614120300_battery_health_tables_guard`
  (`crank_trip_id`), `20260710100000_vehicle_driving_assessment_quality` (`consecutive_normal_trips`),
  `20260711120000_notification_engine_tables` (`TRIP`), `20260716143000_battery_v2_enums`
  (`CONTAMINATED_BY_ACTIVE_TRIP`), `20260716190000_driving_intelligence_v2_enums`
  (`VEHICLE_TRIP_COUNTER`), `20260716230000_tire_trip_usage_replay_safety`
  (`tire_trip_usage_ledger`), `20260716340000_rental_driving_analysis_versioning`
  (`source_trips_finalized_at`), `20260717120000_driving_decision_audits` (`TRIP`).
- **LEXICAL_FALSE_POSITIVE (15):** `20260616180000_invoice_finance_workflow`,
  `20260620120000_billing_pricebook_v2`, `20260714160000_end_customer_payments_domain`,
  `20260714210000_booking_payment_checkout_ready`, `20260714220000_stripe_connect_webhook_unresolved_account`,
  `20260715190000_billing_product_price_schema`, `20260715200000_billing_subscription_items_discounts_schema`,
  `20260715210000_billing_usage_ledger_outbox_schema`, `20260715250000_stripe_catalog_mapping`,
  `20260715260000_stripe_subscription_sync`, `20260715270000_billing_payment_methods_sepa`,
  `20260715280000_stripe_webhook_matrix`, `20260715290000_billing_invoice_mirror`,
  `20260715300000_billing_payment_ledger`, `20260715310000_billing_reconciliation_drift` (all match
  only via the `stripe` substring).

### 3a. Chronological authority matrix (27 direct migrations)

| # | Migration | Trip statement(s) | Casing | Classification |
|---|-----------|-------------------|--------|----------------|
| 1 | `20260325161142_trip_architecture_refactor` | `CREATE TYPE "TripStatus"`; `ALTER "vehicle_trips"` unguarded | lower | MISSING_PREDECESSOR (first P3018) |
| 2 | `20260331000000_v3_hardware_type` | `CREATE TYPE "DrivingEventSource"`; `ALTER "driving_events"` unguarded | lower | MISSING_PREDECESSOR (`driving_events`) |
| 3 | `20260410000000_add_enrichment_status_fields` | `ALTER "vehicle_trips"`; index | lower | ORDERING_DEFECT |
| 4 | `20260413230000_add_composite_indexes_batch_c` | `CREATE INDEX` on `vehicle_trips`, `driving_events`, `trip_behavior_events` | lower | MISSING_PREDECESSOR (`trip_behavior_events`) |
| 5 | `20260425000000_retire_user_assignment_and_speeding_severity` | `UPDATE/ALTER "VehicleTrip"`; rebuild `TripAssignment*`; `ALTER "TripDrivingImpact"` | **camel** | CASE_MISMATCH + MISSING_PREDECESSOR |
| 6 | `20260609000000_autovacuum_tuning` | `ALTER "vehicle_trip_tracking_runs"/"trip_repairs"/"vehicle_trip_waypoints" SET` | lower | MISSING_PREDECESSOR (×3) |
| 7 | `20260615140000_misuse_cases` | FK `trip_id → "vehicle_trips"("id")` | lower | ORDERING_DEFECT |
| 8 | `20260628150000_rpm_webhook_candidate` | refs `vehicle_trips`/`trip_id` | lower | ORDERING_DEFECT |
| 9 | `20260705140000_trip_analysis_status` | `ALTER "vehicle_trips"` | lower | ORDERING_DEFECT |
| 10 | `20260705200000_trip_analysis_status_guard` | `ADD COLUMN IF NOT EXISTS` | lower | ORDERING_DEFECT (idempotent) |
| 11 | `20260708044000_trip_booking_link_source` | `CREATE TYPE "TripBookingLinkSource"`; `ALTER "vehicle_trips"` | lower | ORDERING_DEFECT |
| 12 | `20260716150000_battery_v2_measurement_sessions` | FK `trip_id → "vehicle_trips"("id")` | lower | ORDERING_DEFECT |
| 13 | `20260716194500_trip_assessabilities` | `CREATE TABLE` (FK → vehicle_trips) | lower | ORDERING_DEFECT |
| 14 | `20260716200000_driving_evidence` | `CREATE TABLE` (FK → vehicle_trips) | lower | ORDERING_DEFECT |
| 15 | `20260716203000_driving_analysis_runs` | `CREATE TABLE` (FK → vehicle_trips) | lower | ORDERING_DEFECT |
| 16 | `20260716210000_driving_intelligence_jobs` | `CREATE TABLE` (FK → vehicle_trips) | lower | ORDERING_DEFECT |
| 17 | `20260716210000_tire_trip_usage_ledger` | `CREATE TABLE` (FK → vehicle_trips) | lower | ORDERING_DEFECT |
| 18 | `20260716220000_tire_trip_usage_attribution` | `ALTER "vehicle_trips"` | lower | ORDERING_DEFECT |
| 19 | `20260716240000_driving_event_native_identity` | `ALTER "driving_events"` | lower | ORDERING_DEFECT |
| 20 | `20260716250000_driving_impact_provenance` | `ALTER "trip_driving_impact"` | lower | MISSING_PREDECESSOR (`trip_driving_impact`) |
| 21 | `20260716260000_driving_impact_braking_provenance` | `ALTER "trip_driving_impact"` | lower | ORDERING_DEFECT |
| 22 | `20260716270000_driving_impact_load_components` | `ALTER "trip_driving_impact"` | lower | ORDERING_DEFECT |
| 23 | `20260716310000_driving_attribution_roles` | refs trip/`trip_id` | lower | ORDERING_DEFECT |
| 24 | `20260716320000_driver_attributions` | `CREATE TABLE` (FK → vehicle_trips) | lower | ORDERING_DEFECT |
| 25 | `20260717180000_trip_driving_impact_authoritative_coverage` | `CREATE TYPE "TripDrivingImpactAnalysisStatus"`; `ALTER "trip_driving_impact"` | lower | ORDERING_DEFECT |
| 26 | `20260717190000_dimo_braking_event_intake` | FK → `vehicle_trips`/`driving_events` | lower | ORDERING_DEFECT |
| 27 | `20260717200000_braking_event_ledger` | FK → `vehicle_trips` | lower | ORDERING_DEFECT |

## 4. Missing-table history matrix (9 tables)

Introduction commits reconstructed from Git; schema lines `nl -ba`-verified. **Not all nine models
existed at the initial commit** (`FALSE_ALL_MODELS_EXISTED_AT_INITIAL_COMMIT_COUNT` = 0):
`TripRepair` was introduced later. Initial/current full field shapes are in the Appendix (§18) with
**no ellipses** (`TABLE_INITIAL_SHAPE_OMISSION_COUNT` = 0; `TABLE_CURRENT_SHAPE_OMISSION_COUNT` = 0).

Authority dimensions are reported separately (`AUTHORITY_DIMENSION_CONFLATION_COUNT` = 0):
**repo-schema** = the model block proven in Git; **committed-migration** = SQL in migrations;
**live-database** = actual production/staging object. The current Prisma model proves the *current
intended repository shape*; the introduction commit proves the *initial repository shape*; neither
proves the *current physical production schema*.

| # | Model / table | Intro commit | Line | Changed since intro? | Material evolution commits | Clean CREATE TABLE | Evolution-DDL migrations | Live-DB authority | Bootstrap class |
|---|---------------|--------------|------|----------------------|----------------------------|--------------------|--------------------------|-------------------|-----------------|
| 1 | `DrivingEvent` / `driving_events` | 77c26dad | 7734 | YES | `df1b5a6e` (batch-c indexes), `07bf0bb6` (P24 provider identity + `tripAssignment`), `af2fb811` (braking intake relation) | 0 | `20260331000000` (ALTER+index), `20260413230000` (2 index), `20260716240000` (ALTER) | UNKNOWN_CURRENT_DATABASE_STATE | BOOTSTRAP_REPLAY_REQUIRED |
| 2 | `BrakeTripMetric` / `brake_trip_metrics` | 77c26dad | 9025 | NO | — | 0 | none | UNKNOWN_CURRENT_DATABASE_STATE | ORPHAN_REVIEW_REQUIRED |
| 3 | `VehicleTrip` / `vehicle_trips` | 77c26dad | 9516 | YES | `c07f06b0` (analysis status), `575c7317` (Phase-4 attribution), `b89cb302`/`3dce7ed4`/`3b9012e6`/`02c6e76d` (DI-v2), `d4c7ac17`/`32dc81a0` (attribution), `d58d6c68`/`850e2306` (tire usage), `a7944b33` (battery session), `af2fb811`/`b0f68346` (braking) | 0 | `20260325161142`, `20260410000000`, `20260413230000`, `20260705140000`, `20260705200000`, `20260708044000`, `20260716220000` (ALTER/index/UPDATE); referenced camelCase in `20260425000000` | UNKNOWN_CURRENT_DATABASE_STATE | BOOTSTRAP_REPLAY_REQUIRED |
| 4 | `VehicleTripWaypoint` / `vehicle_trip_waypoints` | 77c26dad | 9691 | NO | — | 0 | `20260609000000` (ALTER SET) | UNKNOWN_CURRENT_DATABASE_STATE | BOOTSTRAP_REPLAY_REQUIRED |
| 5 | `TripBehaviorEvent` / `trip_behavior_events` | 77c26dad | 9775 | YES | `df1b5a6e` (composite index `tripId,eventCategory`) | 0 | `20260413230000` (CREATE INDEX) | UNKNOWN_CURRENT_DATABASE_STATE | BOOTSTRAP_REPLAY_REQUIRED |
| 6 | `VehicleTripDetectionState` / `vehicle_trip_detection_states` | 77c26dad | 13162 | NO | — | 0 | none | UNKNOWN_CURRENT_DATABASE_STATE | SCHEMA_PARITY_ONLY |
| 7 | `VehicleTripTrackingRun` / `vehicle_trip_tracking_runs` | 77c26dad | 13229 | NO | — | 0 | `20260609000000` (ALTER SET) | UNKNOWN_CURRENT_DATABASE_STATE | BOOTSTRAP_REPLAY_REQUIRED |
| 8 | `TripRepair` / `trip_repairs` | **17019787** (`chore: sync local SynqDrive state before VPS deployment`) | 13268 | NO (since intro) | — | 0 | `20260609000000` (ALTER SET) | UNKNOWN_CURRENT_DATABASE_STATE | BOOTSTRAP_REPLAY_REQUIRED |
| 9 | `TripDrivingImpact` / `trip_driving_impact` | 77c26dad | 13309 | YES | `f54cbece` (checkpoint sync), `d6334d42` (diagnostics/consent), `f03f5061` (P41 provenance), `046f38b2` (P42 braking kinematics), `fc05a1a9` (P43 load components), `e14efca0` (P44 coverage authoritative) | 0 | `20260425000000` (camel ALTER DROP), `20260716250000`, `20260716260000`, `20260716270000`, `20260717180000` (ALTER/index/UPDATE) | UNKNOWN_CURRENT_DATABASE_STATE | BOOTSTRAP_REPLAY_REQUIRED |

`TABLE_MODEL_EVOLUTION_OMISSION_COUNT` = 0; `TABLE_EVOLUTION_COMMIT_OMISSION_COUNT` = 0;
`FALSE_UNKNOWN_REPOSITORY_TABLE_SHAPE_COUNT` = 0 (repo intended shapes are PROVEN — §18).

## 5. CREATE-DDL vs EVOLUTION-DDL separation (tables)

For every missing table the **clean creation DDL is missing** while **evolution DDL may exist**;
these are never conflated (`CREATE_EVOLUTION_DDL_CONFLATION_COUNT` = 0;
`TABLE_EVOLUTION_DDL_OMISSION_COUNT` = 0):

| Table | CLEAN_CREATE_TABLE_DDL_COUNT | CLEAN_CREATE_TABLE_DDL_STATUS | EVOLUTION_DDL_FILE_COUNT | Evolution statement types | Assumes missing predecessor |
|-------|------------------------------|-------------------------------|--------------------------|---------------------------|-----------------------------|
| `vehicle_trips` | 0 | MISSING | 7 | ALTER TABLE, CREATE INDEX, UPDATE | YES |
| `driving_events` | 0 | MISSING | 3 | ALTER TABLE, CREATE INDEX | YES |
| `trip_behavior_events` | 0 | MISSING | 1 | CREATE INDEX | YES |
| `vehicle_trip_waypoints` | 0 | MISSING | 1 | ALTER TABLE … SET (storage) | YES |
| `vehicle_trip_tracking_runs` | 0 | MISSING | 1 | ALTER TABLE … SET | YES |
| `trip_repairs` | 0 | MISSING | 1 | ALTER TABLE … SET | YES |
| `trip_driving_impact` | 0 | MISSING | 5 | ALTER TABLE, DROP COLUMN, CREATE INDEX, UPDATE | YES |
| `vehicle_trip_detection_states` | 0 | MISSING | 0 | (none) | n/a |
| `brake_trip_metrics` | 0 | MISSING | 0 | (none) | n/a |

## 6. Enum authority matrix + CREATE/EVOLUTION separation (10 enums)

Introduction commits/values reconstructed from Git; positions `nl -ba`-verified
(`ENUM_INTRODUCTION_COMMIT_MISMATCH_COUNT` = 0; `ENUM_SCHEMA_POSITION_OMISSION_COUNT` = 0;
`ENUM_CURRENT_VALUESET_OMISSION_COUNT` = 0; `ENUM_HISTORICAL_VALUESET_OMISSION_COUNT` = 0;
`FALSE_UNKNOWN_REPOSITORY_ENUM_AUTHORITY_COUNT` = 0; `ENUM_EVOLUTION_DDL_OMISSION_COUNT` = 0).
`CLEAN_PREDECESSOR_CREATE_TYPE_COUNT` = 0 for all ten; `ANY_CREATE_TYPE_COUNT` is nonzero only for
the two assignment enums (rebuild after renaming an unversioned predecessor).

| Enum | Line | Intro commit | Initial values | Current values | ANY CREATE TYPE | Clean predecessor CREATE | Evolution DDL | Replay-blocking | Bootstrap class |
|------|------|--------------|----------------|----------------|-----------------|--------------------------|---------------|-----------------|-----------------|
| `TripDetectionState` | 1121 | 77c26dad | RESTING, POSSIBLE_START, ACTIVE_TRIP, IDLE_WITHIN_TRIP, POSSIBLE_END, ENDED | same | 0 | missing | none | NO | SCHEMA_PARITY_ONLY |
| `VehicleDetectionProfile` | 1130 | 77c26dad | ICE, EV, HYBRID, UNKNOWN | same | 0 | missing | none | NO | SCHEMA_PARITY_ONLY |
| `DetectionConfidence` | 1137 | 77c26dad | LOW, MEDIUM, HIGH | same | 0 | missing | none | NO | SCHEMA_PARITY_ONLY |
| `TripTrackingRunType` | 1143 | 77c26dad | POSSIBLE_START_VALIDATION, ACTIVE_TRACKING, POSSIBLE_END_CHECK, END_VALIDATION, FINALIZATION_CHECK | same | 0 | missing | none | NO | SCHEMA_PARITY_ONLY |
| `DrivingEventType` | 1224 | 77c26dad | HARSH_BRAKING, EXTREME_BRAKING, HARSH_ACCELERATION, HARSH_CORNERING, SPEEDING, IDLE_EXCESSIVE | + UNMAPPED_PROVIDER_EVENT, SAFETY_COLLISION | 0 | missing | `20260716230000` (ALTER TYPE ADD VALUE ×2) | **YES** | BOOTSTRAP_REPLAY_REQUIRED |
| `TripSource` | 9494 | 17019787 | V2_LIVE, REPAIRED | same | 0 | missing | none | NO | SCHEMA_PARITY_ONLY |
| `TripAssignmentStatus` | 9499 | 17019787 | ASSIGNED_DRIVER, ASSIGNED_USER, ASSIGNED_BOOKING_CUSTOMER, PRIVATE_UNASSIGNED, UNKNOWN_ASSIGNMENT | ASSIGNED_DRIVER, ASSIGNED_BOOKING_CUSTOMER, PRIVATE_UNASSIGNED, UNKNOWN_ASSIGNMENT | 1 (rebuild) | missing | `20260425000000` (RENAME old + CREATE rebuild + ALTER COLUMN + DROP old) | **YES** | BOOTSTRAP_REPLAY_REQUIRED |
| `TripAssignmentSubjectType` | 9506 | 17019787 | DRIVER, USER, BOOKING_CUSTOMER | DRIVER, BOOKING_CUSTOMER | 1 (rebuild) | missing | `20260425000000` (RENAME old + CREATE rebuild + ALTER COLUMN + DROP old) | **YES** | BOOTSTRAP_REPLAY_REQUIRED |
| `BehaviorEventCategory` | 9759 | 77c26dad | ACCELERATION, BRAKING, ABUSE | same | 0 | missing | none | NO | BOOTSTRAP_EVENTUAL_REPLAY_REQUIRED |
| `BehaviorEventClassification` | 9765 | 77c26dad | LIGHT, MODERATE, HARD, EXTREME, WARNING, SEVERE, CRITICAL | same | 0 | missing | none | NO | BOOTSTRAP_EVENTUAL_REPLAY_REQUIRED |

Committed migration authority is **not** wholly missing: evolution SQL exists for `vehicle_trips`,
`driving_events`, `trip_behavior_events`, `vehicle_trip_waypoints`, `vehicle_trip_tracking_runs`,
`trip_repairs`, `trip_driving_impact`, `DrivingEventType`, `TripAssignmentStatus`,
`TripAssignmentSubjectType` (§5/§6). What is missing for every object is the **clean creation** DDL.

## 7. Temporal primary-key / column authority

`20260325161142`'s first unguarded statement requires **only that the relation exists** — not an
`id` column, unique constraint, or primary key.

| Requirement | First committed statement |
|-------------|---------------------------|
| `RELATION_EXISTENCE_REQUIRED_AT` | `20260325161142_trip_architecture_refactor` |
| `COLUMN_REQUIRED_AT` | `20260413230000` (`vehicle_id`, `start_time`) |
| `UNIQUE_OR_PRIMARY_KEY_REQUIRED_AT` | `20260615140000` (FK → `vehicle_trips("id")`) |
| `CURRENT_SCHEMA_STRUCTURAL_REQUIREMENT` | `id String @id @default(uuid())` |
| `BOOTSTRAP_EVENTUAL_REQUIREMENT` | PK on `vehicle_trips.id` before `20260615140000` |

`FALSE_PRE_REFACTOR_PRIMARY_KEY_REQUIREMENT_COUNT` = 0; `FALSE_PROVEN_BASE_COLUMN_COUNT` = 0;
`GUESSED_BASE_COLUMN_COUNT` = 0.

## 8. Replay-failure cascade

| Order | Migration | Failing object | Class |
|-------|-----------|----------------|-------|
| 1 | `20260325161142` | `vehicle_trips` (ALTER) | replay-blocking table |
| 2 | `20260331000000` | `driving_events` (ALTER) | replay-blocking table |
| 3 | `20260413230000` | `trip_behavior_events` (INDEX) | replay-blocking table |
| 4 | `20260425000000` | `TripAssignment*` predecessor (RENAME) + camelCase tables | replay-blocking enum + casing |
| 5 | `20260609000000` | `vehicle_trip_tracking_runs`, `trip_repairs`, `vehicle_trip_waypoints` | replay-blocking tables |
| 6 | `20260716230000` | `DrivingEventType` (ALTER TYPE on non-existent enum) | replay-blocking enum |
| 7 | `20260716250000`+ | `trip_driving_impact` (ALTER) | replay-blocking table |

## 9. Repair-option decision matrix

| Opt | Strategy | Empty-DB | Existing-DB | Verdict |
|-----|----------|----------|-------------|---------|
| A/B | Edit `init` / `20260325161142` (or `20260425000000`) | fixes | edits applied migration (checksum) | REJECTED_UNSAFE |
| C | Restore authoritative missing migration | would fix | new file | INSUFFICIENT_AUTHORITY (none exists) |
| **D** | New retroactive, idempotent bootstrap before the refactor | creates base | no-op via `IF NOT EXISTS` | **SAFE_CANDIDATE (base-gap)** |
| E/F/G/H/I | end-of-history / squash / CI-only / db push / resolve --applied | various | various | REJECTED_UNSAFE |
| J | Guarded retroactive pre/post casing-compat migrations | can pass | runtime-visible wrong-casing window; guard must gate on prod applied-state | INSUFFICIENT_AUTHORITY |

Still-considered strategies: **D** (base-gap) and **J** (casing). Both are append-only (new files);
**neither edits an existing migration**, so no existing migration's stored checksum is
implementation-critical (§10 removes checksum unknowns). Option J's guard branches on whether
`20260425000000` is already applied — the single applied-state row retained in §10.
`UNASSESSED_CASING_REPAIR_STRATEGY_COUNT` = 0.

## 10. Atomic critical-unknown ledger

The prior grouped ledger (ID ranges) is deleted (`GROUPED_UNKNOWN_RANGE_COUNT` = 0). Each row below
is one physical row = one object + one proposition, with all nine columns. Applied-state/checksum
criticality was reassessed row-by-row (§9): all seven checksum rows and six of seven applied-state
rows are **removed** as not implementation-critical for any still-considered strategy
(`UNJUSTIFIED_CHECKSUM_UNKNOWN_COUNT` = 0; `UNJUSTIFIED_APPLIED_STATE_UNKNOWN_COUNT` = 0). Only
`20260425000000` applied-state is retained (Option J append-only guard dependency).

Row composition: 19 live-object presence (`LIVE_DATABASE_OBJECT_PRESENCE_LEDGER_COUNT` = 19) + 9
live table shapes + 10 live enum value sets + 2 live casings + 1 applied-state + 1 casing-repair
selection + 1 orphan decision = **43**.

<!-- ATOMIC_UNKNOWN_LEDGER_BEGIN -->

| ID | Object | Exact unknown proposition | Available evidence | Missing evidence | Why implementation-critical | Possible evidence source | Stop condition | Status |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| U001 | vehicle_trips | Does the table exist in the target DB? | repo schema declares it (§4) | live catalog read | idempotent bootstrap must CREATE-or-skip | information_schema.tables | no bootstrap until verified | UNRESOLVED |
| U002 | driving_events | Does the table exist in the target DB? | repo schema declares it (§4) | live catalog read | idempotent bootstrap must CREATE-or-skip | information_schema.tables | no bootstrap until verified | UNRESOLVED |
| U003 | trip_behavior_events | Does the table exist in the target DB? | repo schema declares it (§4) | live catalog read | idempotent bootstrap must CREATE-or-skip | information_schema.tables | no bootstrap until verified | UNRESOLVED |
| U004 | vehicle_trip_waypoints | Does the table exist in the target DB? | repo schema declares it (§4) | live catalog read | idempotent bootstrap must CREATE-or-skip | information_schema.tables | no bootstrap until verified | UNRESOLVED |
| U005 | vehicle_trip_tracking_runs | Does the table exist in the target DB? | repo schema declares it (§4) | live catalog read | idempotent bootstrap must CREATE-or-skip | information_schema.tables | no bootstrap until verified | UNRESOLVED |
| U006 | trip_repairs | Does the table exist in the target DB? | repo schema declares it (§4) | live catalog read | idempotent bootstrap must CREATE-or-skip | information_schema.tables | no bootstrap until verified | UNRESOLVED |
| U007 | trip_driving_impact | Does the table exist in the target DB? | repo schema declares it (§4) | live catalog read | idempotent bootstrap must CREATE-or-skip | information_schema.tables | no bootstrap until verified | UNRESOLVED |
| U008 | vehicle_trip_detection_states | Does the table exist in the target DB? | repo schema declares it (§4) | live catalog read | schema-parity bootstrap must CREATE-or-skip | information_schema.tables | no bootstrap until verified | UNRESOLVED |
| U009 | brake_trip_metrics | Does the table exist in the target DB? | repo schema declares it (§4) | live catalog read | orphan decision + CREATE-or-skip depend on it | information_schema.tables | no action until verified | UNRESOLVED |
| U010 | TripSource | Does the enum type exist in the target DB? | repo schema declares it (§6) | live pg_type read | bootstrap must CREATE-or-skip the type | pg_type | no bootstrap until verified | UNRESOLVED |
| U011 | TripAssignmentStatus | Does the enum type exist in the target DB? | repo schema declares it (§6) | live pg_type read | bootstrap must CREATE-or-skip the type | pg_type | no bootstrap until verified | UNRESOLVED |
| U012 | TripAssignmentSubjectType | Does the enum type exist in the target DB? | repo schema declares it (§6) | live pg_type read | bootstrap must CREATE-or-skip the type | pg_type | no bootstrap until verified | UNRESOLVED |
| U013 | DrivingEventType | Does the enum type exist in the target DB? | repo schema declares it (§6) | live pg_type read | ALTER TYPE ADD VALUE needs the type present | pg_type | no bootstrap until verified | UNRESOLVED |
| U014 | BehaviorEventCategory | Does the enum type exist in the target DB? | repo schema declares it (§6) | live pg_type read | needed to build trip_behavior_events at parity | pg_type | no bootstrap until verified | UNRESOLVED |
| U015 | BehaviorEventClassification | Does the enum type exist in the target DB? | repo schema declares it (§6) | live pg_type read | needed to build trip_behavior_events at parity | pg_type | no bootstrap until verified | UNRESOLVED |
| U016 | TripDetectionState | Does the enum type exist in the target DB? | repo schema declares it (§6) | live pg_type read | schema-parity bootstrap must CREATE-or-skip | pg_type | no bootstrap until verified | UNRESOLVED |
| U017 | TripTrackingRunType | Does the enum type exist in the target DB? | repo schema declares it (§6) | live pg_type read | schema-parity bootstrap must CREATE-or-skip | pg_type | no bootstrap until verified | UNRESOLVED |
| U018 | VehicleDetectionProfile | Does the enum type exist in the target DB? | repo schema declares it (§6) | live pg_type read | schema-parity bootstrap must CREATE-or-skip | pg_type | no bootstrap until verified | UNRESOLVED |
| U019 | DetectionConfidence | Does the enum type exist in the target DB? | repo schema declares it (§6) | live pg_type read | schema-parity bootstrap must CREATE-or-skip | pg_type | no bootstrap until verified | UNRESOLVED |
| U020 | vehicle_trips | Exact live physical column/type/constraint set? | repo intended shape proven (§18) | live column catalog | detect drift vs bootstrap DDL | information_schema.columns | no bootstrap if live shape diverges | UNRESOLVED |
| U021 | driving_events | Exact live physical column/type/constraint set? | repo intended shape proven (§18) | live column catalog | detect drift vs bootstrap DDL | information_schema.columns | no bootstrap if live shape diverges | UNRESOLVED |
| U022 | trip_behavior_events | Exact live physical column/type/constraint set? | repo intended shape proven (§18) | live column catalog | detect drift vs bootstrap DDL | information_schema.columns | no bootstrap if live shape diverges | UNRESOLVED |
| U023 | vehicle_trip_waypoints | Exact live physical column/type/constraint set? | repo intended shape proven (§18) | live column catalog | detect drift vs bootstrap DDL | information_schema.columns | no bootstrap if live shape diverges | UNRESOLVED |
| U024 | vehicle_trip_tracking_runs | Exact live physical column/type/constraint set? | repo intended shape proven (§18) | live column catalog | detect drift vs bootstrap DDL | information_schema.columns | no bootstrap if live shape diverges | UNRESOLVED |
| U025 | trip_repairs | Exact live physical column/type/constraint set? | repo intended shape proven (§18) | live column catalog | detect drift vs bootstrap DDL | information_schema.columns | no bootstrap if live shape diverges | UNRESOLVED |
| U026 | trip_driving_impact | Exact live physical column/type/constraint set? | repo intended shape proven (§18) | live column catalog | detect drift vs bootstrap DDL | information_schema.columns | no bootstrap if live shape diverges | UNRESOLVED |
| U027 | vehicle_trip_detection_states | Exact live physical column/type/constraint set? | repo intended shape proven (§18) | live column catalog | detect drift vs bootstrap DDL | information_schema.columns | no bootstrap if live shape diverges | UNRESOLVED |
| U028 | brake_trip_metrics | Exact live physical column/type/constraint set? | repo intended shape proven (§18) | live column catalog | orphan decision depends on live shape | information_schema.columns | no action if live shape diverges | UNRESOLVED |
| U029 | TripSource | Exact live enum value set? | repo values proven (§6) | live pg_enum read | bootstrap/inserts must match live values | pg_enum | no bootstrap if values diverge | UNRESOLVED |
| U030 | TripAssignmentStatus | Exact live enum value set? | repo values proven (§6) | live pg_enum read | bootstrap/inserts must match live values | pg_enum | no bootstrap if values diverge | UNRESOLVED |
| U031 | TripAssignmentSubjectType | Exact live enum value set? | repo values proven (§6) | live pg_enum read | bootstrap/inserts must match live values | pg_enum | no bootstrap if values diverge | UNRESOLVED |
| U032 | DrivingEventType | Exact live enum value set? | repo values proven (§6) | live pg_enum read | ADD VALUE idempotency depends on live set | pg_enum | no bootstrap if values diverge | UNRESOLVED |
| U033 | BehaviorEventCategory | Exact live enum value set? | repo values proven (§6) | live pg_enum read | bootstrap/inserts must match live values | pg_enum | no bootstrap if values diverge | UNRESOLVED |
| U034 | BehaviorEventClassification | Exact live enum value set? | repo values proven (§6) | live pg_enum read | bootstrap/inserts must match live values | pg_enum | no bootstrap if values diverge | UNRESOLVED |
| U035 | TripDetectionState | Exact live enum value set? | repo values proven (§6) | live pg_enum read | bootstrap/inserts must match live values | pg_enum | no bootstrap if values diverge | UNRESOLVED |
| U036 | TripTrackingRunType | Exact live enum value set? | repo values proven (§6) | live pg_enum read | bootstrap/inserts must match live values | pg_enum | no bootstrap if values diverge | UNRESOLVED |
| U037 | VehicleDetectionProfile | Exact live enum value set? | repo values proven (§6) | live pg_enum read | bootstrap/inserts must match live values | pg_enum | no bootstrap if values diverge | UNRESOLVED |
| U038 | DetectionConfidence | Exact live enum value set? | repo values proven (§6) | live pg_enum read | bootstrap/inserts must match live values | pg_enum | no bootstrap if values diverge | UNRESOLVED |
| U039 | vehicle_trips | Live table identifier casing (lowercase vs camelCase)? | schema @@map lowercase; 20260425000000 uses camel | live pg_class relname | decides casing-repair need + Option J direction | pg_class | no casing repair until known | UNRESOLVED |
| U040 | trip_driving_impact | Live table identifier casing (lowercase vs camelCase)? | schema @@map lowercase; 20260425000000 uses camel | live pg_class relname | decides casing-repair need + Option J direction | pg_class | no casing repair until known | UNRESOLVED |
| U041 | 20260425000000 | Is this migration recorded applied in target _prisma_migrations? | repo migration present | live _prisma_migrations row | Option J guard branches on applied-state | _prisma_migrations | no Option J guard until known | UNRESOLVED |
| U042 | casing repair | Which mechanism (Option B edit vs Option J append) is safe? | option matrix (§9) | the two live-casing rows and the applied-state row must resolve, plus review | end-to-end replay must pass 20260425000000 safely | resolution of the live-casing and applied-state rows + reviewer | no casing repair until selected | UNRESOLVED |
| U043 | brake_trip_metrics | Should it be bootstrapped or removed from the schema? | 0 migration refs, 0 backend readers/writers (§4) | product/architecture decision | determines inclusion in bootstrap vs schema removal | product/architecture owner | no action until decided | UNRESOLVED |

<!-- ATOMIC_UNKNOWN_LEDGER_END -->

`IMPLEMENTATION_CRITICAL_UNKNOWN_COUNT` = `ATOMIC_UNKNOWN_LEDGER_ROW_COUNT` =
`ATOMIC_UNKNOWN_UNIQUE_ID_COUNT` = **43**. `ATOMIC_UNKNOWN_DUPLICATE_ID_COUNT` = 0;
`ATOMIC_UNKNOWN_MISSING_COLUMN_ROW_COUNT` = 0; `GROUPED_UNKNOWN_RANGE_COUNT` = 0;
`GROUPED_UNCOUNTED_CRITICAL_UNKNOWN_COUNT` = 0; `UNMATRIXED_IMPLEMENTATION_CRITICAL_UNKNOWN_COUNT` = 0;
`STALE_CRITICAL_UNKNOWN_COUNT` = 0. Mechanical validation command + output are in §17.

Non-critical observations (excluded from the counter): the exact out-of-band baseline creation
method (contextual); prior audit observations are dated historical evidence, not current live
authority.

## 11. Provisional CI-R3B contract (blocked)

`KNOWN_MISSING_SCHEMA_OBJECT_COUNT` = **19** (9 tables + 10 enums);
`UNCLASSIFIED_MISSING_SCHEMA_OBJECT_COUNT` = 0. Partition:

| Class | Objects | Count |
|-------|---------|-------|
| BOOTSTRAP_REPLAY_REQUIRED | tables `vehicle_trips`, `driving_events`, `trip_behavior_events`, `vehicle_trip_waypoints`, `vehicle_trip_tracking_runs`, `trip_repairs`, `trip_driving_impact`; enums `TripAssignmentStatus`, `TripAssignmentSubjectType`, `DrivingEventType` | 10 |
| BOOTSTRAP_EVENTUAL_REPLAY_REQUIRED | enums to build `trip_behavior_events` at parity: `BehaviorEventCategory`, `BehaviorEventClassification` | 2 |
| SCHEMA_PARITY_ONLY | table `vehicle_trip_detection_states`; enums `TripSource`, `TripDetectionState`, `TripTrackingRunType`, `VehicleDetectionProfile`, `DetectionConfidence` | 6 |
| ORPHAN_REVIEW_REQUIRED | table `brake_trip_metrics` | 1 |

- `BOOTSTRAP_REPLAY_REQUIRED_COUNT` = 10; `BOOTSTRAP_EVENTUAL_REPLAY_REQUIRED_COUNT` = 2;
  `SCHEMA_PARITY_ONLY_COUNT` = 6; `ORPHAN_REVIEW_REQUIRED_COUNT` = 1 (sums to 19).
- `PROVISIONAL_BOOTSTRAP_OBJECT_COUNT` = 18 (excludes the orphan pending U043).
- `PROVISIONAL_BOOTSTRAP_OMITTED_OBJECT_COUNT` = 0.
- `INSUFFICIENT_AUTHORITY_COUNT` = 19 — executable DDL for every object is unauthorized until its
  §10 live propositions resolve; repository schema history is **not** permission to write migration
  SQL, and proven intended enum values are not permission to implement them in production.
- `BASE_GAP_STRATEGY_STATUS` = SAFE_CANDIDATE; `CASING_STRATEGY_STATUS` = INSUFFICIENT_AUTHORITY;
  `END_TO_END_R3B_STRATEGY_STATUS` = BLOCKED.

Per-object rationale: the 7 replay-required tables + 3 replay-required enums are directly referenced
by a migration (ALTER/INDEX/FK/rebuild) and block replay; `BehaviorEventCategory`/
`BehaviorEventClassification` are eventual because `trip_behavior_events` (replay-required) has
columns typed on them; the 6 schema-parity objects are never referenced by any migration but exist
in the schema; `brake_trip_metrics` is orphan (no migration ref, no code reader/writer).

## 12. Scope counters

| Counter | Value |
|---------|-------|
| `CHANGED_FILE_COUNT` / `AUDIT_REPORT_CHANGE_COUNT` | 1 |
| `HISTORICAL_MIGRATION_EDIT_COUNT` / `NEW_MIGRATION_COUNT` / `SCHEMA_CHANGE_COUNT` | 0 |
| `RUNTIME_CHANGE_COUNT` / `TEST_LOGIC_CHANGE_COUNT` / `WORKFLOW_CHANGE_COUNT` | 0 |
| `DEPENDENCY_CHANGE_COUNT` / `LOCKFILE_CHANGE_COUNT` / `PRODUCTION_CONFIG_CHANGE_COUNT` | 0 |
| `PRODUCTION_DATABASE_ACCESS_COUNT` / `PRODUCTION_DEPLOYMENT_COUNT` / `CI_R3B_IMPLEMENTATION_COUNT` | 0 |
| `E6`/`E7`/`E8`/`E9` scope / `OUT_OF_SCOPE_FILE_COUNT` | 0 |

## 13. Stale-claim sweep

`STALE_MIGRATION_UNIVERSE_CLAIM_COUNT` = 0 (universe stated as 55 throughout);
`STALE_ATOMIC_LEDGER_CLAIM_COUNT` = 0 (43 physical rows, no ID ranges);
`STALE_DDL_AUTHORITY_CLAIM_COUNT` = 0 (creation vs evolution DDL separated — §5/§6);
`STALE_CHECKSUM_CRITICALITY_CLAIM_COUNT` = 0 (checksum unknowns removed — §9/§10);
`STALE_MODEL_HISTORY_CLAIM_COUNT` = 0 (`TripRepair` = 17019787; not all nine at 77c26dad).
Superseded prior values (universe 54; 56 grouped unknowns; grouped ID ranges; "all nine models at
77c26dad") are marked "SUPERSEDED BY CI-R3A.4".

## 14. CI-R3A.1 (prior)

Added `trip_behavior_events`/`trip_repairs`; the 27-migration matrix; cascade + legacy/guarded
column corrections; out-of-band PROVEN existence / UNKNOWN method; Option J.

## 15. CI-R3A.2 (prior)

Added orphan `brake_trip_metrics` (tables 8→9); 10-entry enum inventory; temporal PK correction;
19 objects / 18 bootstrap.

## 16. CI-R3A.3 (prior)

Corrected `TripRepair` intro to `17019787`; recorded schema positions + proven enum timelines;
separated authority dimensions. (Its "total universe 54" and "56-row grouped ledger" are SUPERSEDED
BY CI-R3A.4.)

## 17. CI-R3A.4 — Atomic Ledger and DDL Authority Finalization

- Classified migration universe corrected **54 → 55** (union 54 + 1 enum-dependency file, §3);
  category arithmetic 27+1+1+11+15 = 55.
- Full initial and current table shapes recorded with no ellipses (Appendix §18); per-model
  evolution and material evolution commits recorded (§4).
- Missing **creation** DDL separated from existing **evolution** DDL for all tables and enums
  (§5/§6); `CREATE_EVOLUTION_DDL_CONFLATION_COUNT` = 0.
- Grouped pseudo-ledger deleted; replaced with 43 physical atomic rows (§10), 19 of them separate
  live-object-presence propositions.
- Applied-state/checksum criticality reassessed row-by-row (§9): 7 checksum + 6 applied-state
  unknowns removed as tied only to the rejected edit-in-place option; 1 applied-state row retained
  for Option J's append-only guard.
- Critical count recalculated from physical rows = 43 (not forced to 56).
- No migration/schema/runtime/test/workflow/dependency/config/database/deployment change. CI-R3B
  remains blocked. E7 not started.

### Mechanical ledger validation (read-only)

Command:

```
awk '/ATOMIC_UNKNOWN_LEDGER_BEGIN/{f=1;next} /ATOMIC_UNKNOWN_LEDGER_END/{f=0}
 f && /^\| U[0-9][0-9][0-9] \|/{rows++; n=gsub(/\|/,"|"); if(n!=10) badcol++; id=$2; if(seen[id]++) dup++}
 END{print "rows="rows, "unique_ids="rows-dup, "dup_ids="dup+0, "bad_col_rows="badcol+0}' \
 docs/audits/ci-recovery/ci-r3a-vehicle-trips-migration-authority-audit-2026-08.md
```

Output (recorded in §17 evidence at commit time):

```
rows=43 unique_ids=43 dup_ids=0 bad_col_rows=0
```

`ATOMIC_UNKNOWN_LEDGER_ROW_COUNT` = 43; `ATOMIC_UNKNOWN_UNIQUE_ID_COUNT` = 43;
`ATOMIC_UNKNOWN_DUPLICATE_ID_COUNT` = 0; `ATOMIC_UNKNOWN_MISSING_COLUMN_ROW_COUNT` = 0.

## 18. Final audit status

Introduction commits, schema positions, full initial/current shapes, per-model evolution,
CREATE-vs-evolution DDL separation, the 55-file classified universe, and a mechanically-validated
43-row atomic unknown ledger are complete and internally consistent. Option **D** is a
SAFE_CANDIDATE for the base-gap; casing repair is INSUFFICIENT_AUTHORITY; a single safe end-to-end
CI-R3B strategy cannot be finalized while the 43 live-database/provenance unknowns (§10) remain
unresolved.

**Status: CI_R3A_AUTHORITY_BLOCKED** — audit complete and corrected; CI-R3B implementation requires
the §10 authority before a single safe strategy can be committed.

## Appendix A — Full initial vs current table shapes (no ellipses)

Authoritative field-level inventory for each missing table. "Initial" = the model block at its
introduction commit; "Current" = the model block at the unchanged schema head. These prove the
repository intended shapes (REPOSITORY_SCHEMA_AUTHORITY); they do not prove the live physical schema.

### A1. DrivingEvent → driving_events (intro 77c26dad, line 7734)

Initial columns: id, vehicle_id, organization_id, event_type (DrivingEventType), source
(DrivingEventSource, default TELEMETRY_EVENTS), severity (default 0), latitude, longitude,
speed_kmh, delta_kmh, duration_ms, driver_name, trip_id, metadata_json, recorded_at, created_at.
Initial indexes: vehicle_id, recorded_at, event_type, trip_id, source. Relations: vehicle, trip.

Current adds (evolution): provider, provider_event_name, provider_source_id, provider_fingerprint,
trip_assignment (DrivingEventTripAssignment, default UNASSIGNED); relation dimoBrakingEventIntake;
indexes unique(organization_id, provider_fingerprint), (vehicle_id, trip_assignment),
(organization_id, vehicle_id, recorded_at), (vehicle_id, recorded_at), (trip_id, event_type).
Changed = YES.

### A2. BrakeTripMetric → brake_trip_metrics (intro 77c26dad, line 9025)

Columns (initial = current): id, vehicle_id, trip_id, brake_energy_kj, hard_brake_count (default 0),
avg_deceleration_ms2, max_deceleration_ms2, brake_duration_sec, distance_km, recorded_at,
created_at. Indexes: vehicle_id, recorded_at. Relation: vehicle. Changed = NO.

### A3. VehicleTrip → vehicle_trips (intro 77c26dad, line 9516)

Initial columns: id, vehicle_id, dimo_segment_id (unique), trip_status (TripStatus, default
ONGOING), driver_name, start_time, end_time, start_latitude, start_longitude, end_latitude,
end_longitude, distance_km, duration_minutes, avg_speed_kmh, max_speed_kmh, driving_score,
fuel_used_liters, avg_consumption_l_per_100km, fuel_confidence, energy_used_kwh,
avg_consumption_kwh_per_100km, energy_confidence, city_share_percent, highway_share_percent,
country_share_percent, outside_temperature_start_c, engine_temp_start_c, engine_temp_end_c, avg_rpm,
avg_throttle_position, avg_engine_load, speeding_percent, max_over_speed_kmh, speeding_segments,
speeding_sections_json, speeding_section_count, speeding_distance_m, speeding_duration_s,
speeding_exposure_pct, avg_over_speed_kmh, harsh_brake_count, harsh_accel_count, harsh_corner_count,
acceleration_event_count, braking_event_count, abuse_event_count, hard_acceleration_count,
hard_braking_count, full_braking_count, possible_impact_count, kickdown_count, cold_engine_abuse_count,
long_idle_count, abuse_score, behavior_summary_json, behavior_enriched_at, behavior_enrichment_status,
behavior_enrichment_attempts, behavior_enrichment_error, behavior_enrichment_started_at,
driving_impact_computed_at, detection_profile (VehicleDetectionProfile), start_detection_mode,
end_detection_mode, start_confidence (DetectionConfidence), end_confidence (DetectionConfidence),
possible_start_at, possible_end_at, first_activity_at, last_activity_at, route_tracking_started_at,
driving_tracking_started_at, raw_detection_meta, gap_ended (default false), enriched_at, created_at.
Initial indexes: vehicle_id, start_time, trip_status, behavior_enrichment_status. Initial relations:
vehicle, waypoints, events, behaviorEvents.

Current adds (evolution): assignment_status (TripAssignmentStatus), assignment_subject_type
(TripAssignmentSubjectType), assignment_subject_id, assigned_booking_id, booking_link_source
(TripBookingLinkSource), booking_customer_id, assigned_driver_id, actual_driver_id, is_private_trip
(default false), total_acceleration_events, hard_acceleration_events, total_braking_events,
hard_braking_events, full_braking_events, cornering_events, abuse_events, speeding_events,
trip_analysis_status, analysis_queued_at, analysis_started_at, analysis_partial_at,
analysis_completed_at, analysis_failed_at, analysis_failed_reason, analysis_latency_ms,
analysis_stages_json, trip_source (TripSource, default V2_LIVE), is_repaired (default false),
merge_parent_trip_id, quality_status, behavior_summary_status, driving_impact_status,
tire_usage_attribution_status, tire_usage_processed_at; additional relations (tireTripUsageLedgers,
misuseCases, tripAssessabilities, drivingEvidence, drivingAnalysisRuns, drivingIntelligenceJobs,
driverAttributions, repairs, rpmWebhookCandidates, batteryMeasurementSessions, dimoBrakingEventIntakes,
brakingEventLedgerEntries); additional indexes (tripSource, [assignmentStatus, isPrivateTrip],
[assignmentSubjectType, assignmentSubjectId], assignedBookingId, tripAnalysisStatus,
tireUsageAttributionStatus, [vehicleId, startTime]). Changed = YES.

### A4. VehicleTripWaypoint → vehicle_trip_waypoints (intro 77c26dad, line 9691)

Columns (initial = current): id, trip_id, latitude, longitude, speed_kmh, heading, recorded_at.
Indexes: trip_id, recorded_at. Relation: trip. Changed = NO.

### A5. TripBehaviorEvent → trip_behavior_events (intro 77c26dad, line 9775)

Columns (initial = current): id, organization_id, vehicle_id, trip_id, event_category
(BehaviorEventCategory), event_type, classification (BehaviorEventClassification), started_at,
ended_at, duration_ms, start_speed_kmh, end_speed_kmh, peak_value, peak_value_unit, peak_g,
max_throttle_pos, max_engine_rpm, max_coolant_temp, metadata_json, created_at. Relations: vehicle,
trip. Initial indexes: trip_id, vehicle_id, event_category, started_at. Current adds index
[trip_id, event_category]. Changed = YES (index only).

### A6. VehicleTripDetectionState → vehicle_trip_detection_states (intro 77c26dad, line 13162)

Columns (initial = current): id, vehicle_id (unique), organization_id, state (TripDetectionState,
default RESTING), detection_profile (VehicleDetectionProfile, default UNKNOWN), active_trip_id,
possible_start_at, possible_end_at, last_activity_at, last_snapshot_evidence_at, last_core_processed_at,
last_route_processed_at, last_driving_processed_at, worker_locked_until, worker_run_token,
start_detection_mode, start_confidence (DetectionConfidence), end_detection_mode, end_confidence
(DetectionConfidence), last_evidence_summary, start_odometer_km, start_fuel_level, start_ev_soc,
last_meaningful_movement_at, end_validation_attempts (default 0), cusum_validated_at,
cusum_segment_start, cusum_segment_end, created_at, updated_at. Indexes: state, organization_id,
worker_locked_until. Relation: vehicle. Changed = NO.

### A7. VehicleTripTrackingRun → vehicle_trip_tracking_runs (intro 77c26dad, line 13229)

Columns (initial = current): id, vehicle_id, organization_id, trip_id, state_at_run
(TripDetectionState), run_type (TripTrackingRunType), requested_from, requested_to, core_points_count,
route_points_count, driving_points_count, result_state (TripDetectionState), result_summary,
error_message, duration_ms, created_at. Indexes: vehicle_id, trip_id, run_type, created_at.
Relation: vehicle. Changed = NO.

### A8. TripRepair → trip_repairs (intro 17019787, line 13268)

Columns (initial = current): id, vehicle_id, trip_id, repair_type, status (default "PROPOSED"),
reason, confidence, window_from, window_to, detector_evidence, applied_at, created_at. Indexes:
vehicle_id, trip_id, status, repair_type, created_at. Relations: vehicle, trip. Changed = NO
(since its 17019787 introduction).

### A9. TripDrivingImpact → trip_driving_impact (intro 77c26dad, line 13309)

Initial columns: id, organization_id, vehicle_id, trip_id (unique), trip_started_at, trip_ended_at,
distance_km, city_share_pct, highway_share_pct, country_road_share_pct, hard_accel_per_100km,
extreme_accel_per_100km, hard_brake_per_100km, extreme_brake_per_100km, full_braking_per_100km,
kickdown_per_100km, launch_like_per_100km, brakes_per_100km, stop_density, high_speed_brake_share,
mean_brake_energy_per_km, p95_negative_decel, longitudinal_stress_score, braking_stress_score,
stop_go_stress_score, high_speed_stress_score, thermal_brake_stress_score, driving_style_score,
model_version, source_summary_json, created_at, updated_at. Initial indexes:
[vehicle_id, trip_started_at], [organization_id, vehicle_id]. Relation: vehicle.

Current adds (evolution): p95_negative_decel_measured, p95_negative_decel_proxy,
mean_brake_energy_proxy_per_km, safety_score, speeding_exposure_pct, speeding_section_count,
primary_source, measured_share, provider_classified_share, reconstructed_share, estimated_proxy_share,
context_only_share, native_event_count, hf_event_count, measurement_coverage, hardware_profile,
capability_version, health_eligibility, provenance_maturity, provenance_version, load_components_json,
authoritative_distance_km, source_version, source_fingerprint, analysis_status
(TripDrivingImpactAnalysisStatus, default PENDING), calculated_at, source_completeness,
trip_distance_km_at_source, distance_discrepancy_km; indexes analysis_status, source_fingerprint.
Note: `driving_style_score` column is retained as the physical name for the renamed
`drivingStressScore` field. Changed = YES.
