# CI Recovery R3A — Vehicle Trip migration history authority audit

> **Documentation-only authority audit.** No migration, schema, runtime, test, workflow,
> dependency, or production artifact was changed. Disposable local PostgreSQL 16 was used for
> read/write diagnostics only and then destroyed. This audit determines the safe, evidence-backed
> repair strategy for CI-R3B; it does **not** implement it.
>
> Correction history: **CI-R3A.1** (§14) added two missing tables + the 27-migration matrix.
> **CI-R3A.2** (§15) completed the schema-object inventory (orphan `brake_trip_metrics`, 10
> enum predecessors, temporal PK claim). **CI-R3A.3** (§16) corrects model/enum introduction
> commits from Git, records proven repository enum timelines, separates repository / committed-
> migration / live-database authority dimensions, rebuilds an **atomic** critical-unknown ledger,
> and provides a numeric false-positive migration count. All earlier statements are corrected in
> place for internal consistency.

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

Corroborated by the pre-existing `docs/audits/pr-recovery/phase3-e2-migration-validation-2026-08.md`
(`EXISTING_E2_MIGRATION_EVIDENCE_ACCOUNTED = YES`): it independently records the greenfield
`P3018` / `42P01`, missing `vehicle_trips`, first-failing `20260325161142_trip_architecture_refactor`
at migration #4, and 3 migrations applied before failure. That report is corroborating repository
evidence, not a substitute for this audit.

### 2b. Casing defect (independently confirmed)

With lowercase `vehicle_trips`/`trip_driving_impact` + `TripAssignment*` enums pre-seeded,
`20260425000000` fails: `ERROR: relation "VehicleTrip" does not exist` at `UPDATE "VehicleTrip"`.

## 3. Migration-inventory accounting (numeric)

Search universe = union of the direct quoted-identifier search and a bare case-insensitive `trip`
scan across all migration `*.sql` = **54** unique files. Every file is classified into exactly one
category (`UNCLASSIFIED_BROAD_SEARCH_MIGRATION_FILE_COUNT` = 0;
`DUPLICATE_MIGRATION_CLASSIFICATION_COUNT` = 0):

| Category | Count | Notes |
|----------|-------|-------|
| DIRECT_TRIP_IDENTIFIER_AUTHORITY | **27** | §3a matrix (26 contain bare `trip`; `20260331000000_v3_hardware_type` is matched only by `driving_events`) |
| BASELINE_OMISSION_AUTHORITY | 1 | `20260311224040_init` (matched lexically by `stripe`, but it is the baseline that **omits** all trip tables) |
| ENUM_DEPENDENCY_AUTHORITY | 1 | `20260716230000_driving_event_type_native_mapper` (`ALTER TYPE "DrivingEventType" ADD VALUE`; outside the lexical `trip` universe, found via enum search) |
| RELATED_PRESENT_TRIP_OBJECT | 11 | touch a **present** trip-domain object/column (see list) |
| LEXICAL_FALSE_POSITIVE | **15** | match only via `stripe`/`Stripe`/`STRIPE` substring |

- `DIRECT_TRIP_IDENTIFIER_MIGRATION_FILE_COUNT` = **27**; `UNMATRIXED_DIRECT_TRIP_MIGRATION_COUNT` = **0**.
- `FALSE_POSITIVE_MIGRATION_FILE_COUNT` = **15** (`FALSE_POSITIVE_MIGRATION_FILE_COUNT_NUMERIC` = YES).

RELATED_PRESENT_TRIP_OBJECT (11): `20260413183000_brake_health_canonical_refactor`
(`modeled_trip_count`), `20260420070000_vehicle_energy_events` (`trips`),
`20260422010000_vehicle_current_safety_score` (`trip`), `20260614120300_battery_health_tables_guard`
(`crank_trip_id`), `20260710100000_vehicle_driving_assessment_quality` (`consecutive_normal_trips`),
`20260711120000_notification_engine_tables` (`TRIP`), `20260716143000_battery_v2_enums`
(`CONTAMINATED_BY_ACTIVE_TRIP`), `20260716190000_driving_intelligence_v2_enums`
(`VEHICLE_TRIP_COUNTER`), `20260716230000_tire_trip_usage_replay_safety`
(`tire_trip_usage_ledger`, `superseded_by_trip_id`), `20260716340000_rental_driving_analysis_versioning`
(`source_trips_finalized_at`), `20260717120000_driving_decision_audits` (`TRIP`).

LEXICAL_FALSE_POSITIVE (15): `20260616180000_invoice_finance_workflow`,
`20260620120000_billing_pricebook_v2`, `20260714160000_end_customer_payments_domain`,
`20260714210000_booking_payment_checkout_ready`, `20260714220000_stripe_connect_webhook_unresolved_account`,
`20260715190000_billing_product_price_schema`, `20260715200000_billing_subscription_items_discounts_schema`,
`20260715210000_billing_usage_ledger_outbox_schema`, `20260715250000_stripe_catalog_mapping`,
`20260715260000_stripe_subscription_sync`, `20260715270000_billing_payment_methods_sepa`,
`20260715280000_stripe_webhook_matrix`, `20260715290000_billing_invoice_mirror`,
`20260715300000_billing_payment_ledger`, `20260715310000_billing_reconciliation_drift`.

### 3a. Chronological authority matrix (27 direct migrations)

| # | Migration | Trip statement(s) | Casing | Classification |
|---|-----------|-------------------|--------|----------------|
| 1 | `20260325161142_trip_architecture_refactor` | `CREATE TYPE "TripStatus"`; `ALTER "vehicle_trips"` unguarded | lower | MISSING_PREDECESSOR (first P3018) |
| 2 | `20260331000000_v3_hardware_type` | `CREATE TYPE "DrivingEventSource"`; `ALTER "driving_events"` unguarded | lower | MISSING_PREDECESSOR (`driving_events`) |
| 3 | `20260410000000_add_enrichment_status_fields` | `ALTER "vehicle_trips"`; index | lower | ORDERING_DEFECT |
| 4 | `20260413230000_add_composite_indexes_batch_c` | `CREATE INDEX` on `vehicle_trips`, `driving_events`, `trip_behavior_events` | lower | MISSING_PREDECESSOR (`trip_behavior_events`) |
| 5 | `20260425000000_retire_user_assignment_and_speeding_severity` | `UPDATE/ALTER "VehicleTrip"`; rebuild `TripAssignment*`; `ALTER "TripDrivingImpact"` | **camel** | CASE_MISMATCH + MISSING_PREDECESSOR |
| 6 | `20260609000000_autovacuum_tuning` | `ALTER "vehicle_trip_tracking_runs"/"trip_repairs"/"vehicle_trip_waypoints" SET` | lower | MISSING_PREDECESSOR (×3) |
| 7 | `20260615140000_misuse_cases` | FK `trip_id → "vehicle_trips"("id")` (first PK requirement) | lower | ORDERING_DEFECT |
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

## 4. Table authority matrix — `KNOWN_MISSING_TRIP_TABLE_COUNT` = 9

Model introduction commits reconstructed from Git (`git log --all --reverse -S…`). **Not all nine
models existed at the initial commit** (`FALSE_ALL_MODELS_EXISTED_AT_INITIAL_COMMIT_COUNT` = 0):
`TripRepair` was introduced later. Positions verified with `nl -ba backend/prisma/schema.prisma`
(`MODEL_INTRODUCTION_COMMIT_MISMATCH_COUNT` = 0; `TABLE_SCHEMA_POSITION_OMISSION_COUNT` = 0).

| # | Model | Table | Intro commit | Schema line | `CREATE TABLE` | Migration refs | Repo schema authority | Committed migration DDL | Live-DB authority | Bootstrap class |
|---|-------|-------|--------------|-------------|----------------|----------------|-----------------------|-------------------------|-------------------|-----------------|
| 1 | `DrivingEvent` | `driving_events` | 77c26dad | 7734 | 0 | 4 | PROVEN_BY_GIT_SCHEMA | missing | UNKNOWN_CURRENT_DATABASE_STATE | BOOTSTRAP_REPLAY_REQUIRED |
| 2 | `BrakeTripMetric` | `brake_trip_metrics` | 77c26dad | 9025 | 0 | 0 | PROVEN_BY_GIT_SCHEMA | missing | UNKNOWN_CURRENT_DATABASE_STATE | ORPHAN_REVIEW_REQUIRED |
| 3 | `VehicleTrip` | `vehicle_trips` | 77c26dad | 9516 | 0 | 19 | PROVEN_BY_GIT_SCHEMA | missing | UNKNOWN_CURRENT_DATABASE_STATE | BOOTSTRAP_REPLAY_REQUIRED |
| 4 | `VehicleTripWaypoint` | `vehicle_trip_waypoints` | 77c26dad | 9691 | 0 | 1 | PROVEN_BY_GIT_SCHEMA | missing | UNKNOWN_CURRENT_DATABASE_STATE | BOOTSTRAP_REPLAY_REQUIRED |
| 5 | `TripBehaviorEvent` | `trip_behavior_events` | 77c26dad | 9775 | 0 | 1 | PROVEN_BY_GIT_SCHEMA | missing | UNKNOWN_CURRENT_DATABASE_STATE | BOOTSTRAP_REPLAY_REQUIRED |
| 6 | `VehicleTripDetectionState` | `vehicle_trip_detection_states` | 77c26dad | 13162 | 0 | 0 | PROVEN_BY_GIT_SCHEMA | missing | UNKNOWN_CURRENT_DATABASE_STATE | SCHEMA_PARITY_ONLY |
| 7 | `VehicleTripTrackingRun` | `vehicle_trip_tracking_runs` | 77c26dad | 13229 | 0 | 1 | PROVEN_BY_GIT_SCHEMA | missing | UNKNOWN_CURRENT_DATABASE_STATE | BOOTSTRAP_REPLAY_REQUIRED |
| 8 | `TripRepair` | `trip_repairs` | **17019787** (`chore: sync local SynqDrive state before VPS deployment`) | 13268 | 0 | 1 | PROVEN_BY_GIT_SCHEMA | missing | UNKNOWN_CURRENT_DATABASE_STATE | BOOTSTRAP_REPLAY_REQUIRED |
| 9 | `TripDrivingImpact` | `trip_driving_impact` | 77c26dad | 13309 | 0 | 4 | PROVEN_BY_GIT_SCHEMA | missing | UNKNOWN_CURRENT_DATABASE_STATE | BOOTSTRAP_REPLAY_REQUIRED |

The repository **intended shape** of each table is PROVEN_BY_GIT_SCHEMA (the model block exists in
Git); what is unknown is the authoritative original executable SQL DDL and the live physical schema
(`FALSE_UNKNOWN_REPOSITORY_TABLE_SHAPE_COUNT` = 0 — repository shape is never labelled unknown).

## 5. Corrected temporal primary-key / column authority

`20260325161142`'s first unguarded statement requires **only that the relation `vehicle_trips`
exists** — not an `id` column, unique constraint, or primary key.

| Requirement | First committed statement that needs it |
|-------------|------------------------------------------|
| `RELATION_EXISTENCE_REQUIRED_AT` | `20260325161142_trip_architecture_refactor` |
| `COLUMN_REQUIRED_AT` | `20260413230000_add_composite_indexes_batch_c` (`vehicle_id`, `start_time`) |
| `UNIQUE_OR_PRIMARY_KEY_REQUIRED_AT` | `20260615140000_misuse_cases` (FK `trip_id → "vehicle_trips"("id")`) |
| `CURRENT_SCHEMA_STRUCTURAL_REQUIREMENT` | `id String @id @default(uuid())` |
| `BOOTSTRAP_EVENTUAL_REQUIREMENT` | bootstrap must give `vehicle_trips.id` a PK before `20260615140000` |

`FALSE_PRE_REFACTOR_PRIMARY_KEY_REQUIREMENT_COUNT` = 0; `FALSE_PROVEN_BASE_COLUMN_COUNT` = 0;
`GUESSED_BASE_COLUMN_COUNT` = 0. Legacy dropped columns = LEGACY_POSSIBLE/UNKNOWN_PREEXISTENCE;
guarded speeding adds = OPTIONAL_PREEXISTING_GUARDED (both required-before = NO).

## 6. Enum authority matrix — `KNOWN_MISSING_ENUM_PREDECESSOR_COUNT` = 10

Introduction commits and value sets reconstructed from Git and verified with `nl -ba`
(`ENUM_INTRODUCTION_COMMIT_MISMATCH_COUNT` = 0; `ENUM_SCHEMA_POSITION_OMISSION_COUNT` = 0;
`ENUM_CURRENT_VALUESET_OMISSION_COUNT` = 0; `ENUM_HISTORICAL_VALUESET_OMISSION_COUNT` = 0;
`FALSE_UNKNOWN_REPOSITORY_ENUM_AUTHORITY_COUNT` = 0). Repository schema authority (proven values)
is **separate** from committed-migration authority (SQL) and live-database authority (actual type).

### 6a. Seven enums present in the initial commit `77c26dad` (schema line)

| Enum | Line | Initial values (PROVEN_BY_GIT_SCHEMA) | Evolution | Current values | Migration ops | Clean predecessor CREATE | Replay-blocking |
|------|------|----------------------------------------|-----------|----------------|---------------|--------------------------|-----------------|
| `TripDetectionState` | 1121 | RESTING, POSSIBLE_START, ACTIVE_TRIP, IDLE_WITHIN_TRIP, POSSIBLE_END, ENDED | none | same | none | missing | NO |
| `VehicleDetectionProfile` | 1130 | ICE, EV, HYBRID, UNKNOWN | none | same | none | missing | NO |
| `DetectionConfidence` | 1137 | LOW, MEDIUM, HIGH | none | same | none | missing | NO |
| `TripTrackingRunType` | 1143 | POSSIBLE_START_VALIDATION, ACTIVE_TRACKING, POSSIBLE_END_CHECK, END_VALIDATION, FINALIZATION_CHECK | none | same | none | missing | NO |
| `DrivingEventType` | 1224 | HARSH_BRAKING, EXTREME_BRAKING, HARSH_ACCELERATION, HARSH_CORNERING, SPEEDING, IDLE_EXCESSIVE | +UNMAPPED_PROVIDER_EVENT, +SAFETY_COLLISION (`20260716230000`) | 8 values (all PROVEN) | `ALTER TYPE ADD VALUE` ×2 (`20260716230000`) | missing (never created) | **YES** |
| `BehaviorEventCategory` | 9759 | ACCELERATION, BRAKING, ABUSE | none | same | none | missing | NO |
| `BehaviorEventClassification` | 9765 | LIGHT, MODERATE, HARD, EXTREME, WARNING, SEVERE, CRITICAL | none | same | none | missing | NO |

### 6b. Three enums introduced in `17019787` (schema line)

| Enum | Line | Introduction values (PROVEN) | Migration proof | Current values (PROVEN) | Clean predecessor CREATE | Replay-blocking |
|------|------|------------------------------|-----------------|-------------------------|--------------------------|-----------------|
| `TripSource` | 9494 | V2_LIVE, REPAIRED | none | V2_LIVE, REPAIRED (unchanged) | missing | NO |
| `TripAssignmentStatus` | 9499 | ASSIGNED_DRIVER, ASSIGNED_USER, ASSIGNED_BOOKING_CUSTOMER, PRIVATE_UNASSIGNED, UNKNOWN_ASSIGNMENT | `20260425000000` maps ASSIGNED_USER→UNKNOWN_ASSIGNMENT and rebuilds without ASSIGNED_USER | ASSIGNED_DRIVER, ASSIGNED_BOOKING_CUSTOMER, PRIVATE_UNASSIGNED, UNKNOWN_ASSIGNMENT | missing (rebuild assumes predecessor) | **YES** |
| `TripAssignmentSubjectType` | 9506 | DRIVER, USER, BOOKING_CUSTOMER | `20260425000000` clears USER and rebuilds without it | DRIVER, BOOKING_CUSTOMER | missing (rebuild assumes predecessor) | **YES** |

For all ten enums: predecessor/current schema values are PROVEN_BY_GIT_SCHEMA; the intended
transitions for the assignment enums are PROVEN_BY_MIGRATION_SQL; the **live database enum value
sets** remain UNKNOWN_CURRENT_DATABASE_STATE. Repository-proven values are **not** classified as
unknown merely because a clean `CREATE TYPE` migration is missing.

## 7. Authority-dimension separation

`AUTHORITY_DIMENSION_CONFLATION_COUNT` = 0. Three independent dimensions are reported separately
for every object (§4, §6): **REPOSITORY_SCHEMA_AUTHORITY** (Git proves the declaration/values),
**COMMITTED_MIGRATION_AUTHORITY** (migration SQL creates/evolves the DB type — missing for all 19),
**LIVE_DATABASE_AUTHORITY** (actual object/values — UNKNOWN without DB access). Repository schema
authority does **not** prove how production was provisioned; absent migration SQL does **not**
erase provable Git history.

`OUT_OF_BAND_BASELINE_EXISTENCE` = PROVEN; `OUT_OF_BAND_BASELINE_CREATION_METHOD` = UNKNOWN
(`prisma db push`, manual SQL, untracked migration, dump/restore, or other — not asserted).
`AUTHORITATIVE_ORIGINAL_BASE_DDL_FOUND` = NO.

## 8. Replay-failure cascade (tables + enums)

| Order | Migration | Failing object | Class |
|-------|-----------|----------------|-------|
| 1 | `20260325161142` | `vehicle_trips` (ALTER) | replay-blocking table |
| 2 | `20260331000000` | `driving_events` (ALTER) | replay-blocking table |
| 3 | `20260413230000` | `trip_behavior_events` (INDEX) | replay-blocking table |
| 4 | `20260425000000` | `TripAssignment*` predecessor (RENAME) + camelCase `"VehicleTrip"`/`"TripDrivingImpact"` | replay-blocking enum + casing |
| 5 | `20260609000000` | `vehicle_trip_tracking_runs`, `trip_repairs`, `vehicle_trip_waypoints` (ALTER SET) | replay-blocking tables |
| 6 | `20260716230000` | `DrivingEventType` (`ALTER TYPE` on non-existent enum) | replay-blocking enum |
| 7 | `20260716250000`+ | `trip_driving_impact` (ALTER) | replay-blocking table |

Classes: replay-blocking (7 tables + 3 enums); schema-parity drift (`vehicle_trip_detection_states`
+ schema-only enums); orphan (`brake_trip_metrics`); production-authority unknowns (§10).

## 9. Repair-option decision matrix

| Opt | Strategy | Empty-DB | Existing-DB | Verdict |
|-----|----------|----------|-------------|---------|
| A/B | Edit `20260311224040_init` / `20260325161142` | fixes base | edits applied migration (checksum) | REJECTED_UNSAFE |
| C | Restore authoritative missing migration | would fix | new file | INSUFFICIENT_AUTHORITY (none exists) |
| **D** | New retroactive, idempotent bootstrap before the refactor | creates missing base | no-op via `IF NOT EXISTS` | **SAFE_CANDIDATE (base-gap only)** |
| E/F/G/H/I | end-of-history / squash / CI-only SQL / db push / resolve --applied | various | various | REJECTED_UNSAFE |
| J | Guarded retroactive pre/post casing-compat migrations | can pass | runtime-visible wrong-casing window; guard must gate on prod applied-state | INSUFFICIENT_AUTHORITY |

Option J remains a genuine in-repository, append-only alternative to editing the applied migration;
its existing-DB safety depends on prod `_prisma_migrations` state and live casing (unknown).
`UNASSESSED_CASING_REPAIR_STRATEGY_COUNT` = 0.

## 10. Atomic critical-unknown ledger — `IMPLEMENTATION_CRITICAL_UNKNOWN_COUNT` = 56

Rebuilt from atomic rows (grouped 23-item accounting deleted). Every row = one object + one
proposition. `GROUPED_UNCOUNTED_CRITICAL_UNKNOWN_COUNT` = 0; `STALE_CRITICAL_UNKNOWN_COUNT` = 0;
`UNMATRIXED_IMPLEMENTATION_CRITICAL_UNKNOWN_COUNT` = 0. Repository-proven shapes/values are **not**
counted here (they are PROVEN — §4, §6). Evidence available for every row: repository schema
declaration; missing evidence: current live-database authority; stop condition: do not implement
any object whose live proposition is unresolved.

- **U1–U19 · Live-object presence** (`LIVE_DATABASE_OBJECT_PRESENCE_LEDGER_COUNT` = 19): does the
  object currently exist in the target database? One atomic row per object — 9 tables
  (`vehicle_trips`, `driving_events`, `trip_behavior_events`, `vehicle_trip_waypoints`,
  `vehicle_trip_tracking_runs`, `trip_repairs`, `trip_driving_impact`,
  `vehicle_trip_detection_states`, `brake_trip_metrics`) + 10 enums (`TripSource`,
  `TripAssignmentStatus`, `TripAssignmentSubjectType`, `DrivingEventType`, `BehaviorEventCategory`,
  `BehaviorEventClassification`, `TripDetectionState`, `TripTrackingRunType`,
  `VehicleDetectionProfile`, `DetectionConfidence`). Each: UNKNOWN_CURRENT_DATABASE_STATE.
- **U20–U28 · Live physical table shape** (9): exact live columns/types/constraints per missing
  table (incl. `brake_trip_metrics`) — `MISSING_TABLE_UNKNOWN_LEDGER_OMISSION_COUNT` = 0;
  `BRAKE_TRIP_METRICS_UNKNOWN_LEDGER_ENTRY_COUNT` = 2 (U28 live shape + U56 orphan decision).
- **U29–U38 · Live enum value set** (10): exact live value set per missing enum.
- **U39 · Live casing of `vehicle_trips`** (lowercase vs `"VehicleTrip"`).
- **U40 · Live casing of `trip_driving_impact`** (lowercase vs `"TripDrivingImpact"`).
- **U41–U47 · `_prisma_migrations` applied-state** for the 7 defect migrations (`20260325161142`,
  `20260331000000`, `20260413230000`, `20260425000000`, `20260609000000`, `20260716230000`,
  `20260716250000`).
- **U48–U54 · Stored checksum** for the same 7 migrations (blocks Option B safety proof).
- **U55 · Safe casing-repair mechanism selection** (Option B vs J) — depends on U39/U40/U41–U54.
- **U56 · `brake_trip_metrics` orphan treatment** — bootstrap vs remove from schema (zero migration
  refs + zero backend readers/writers); source: product/architecture decision.

Total atomic rows = 19 + 9 + 10 + 2 + 7 + 7 + 1 + 1 = **56**.

Non-critical observations (excluded from the critical counter): the exact out-of-band baseline
creation method (§7) — contextual, not implementation-blocking; prior audit observations are dated
historical evidence, not current live authority.

## 11. Provisional CI-R3B contract (specification only — blocked)

`KNOWN_MISSING_SCHEMA_OBJECT_COUNT` = **19** (9 tables + 10 enums);
`UNCLASSIFIED_MISSING_SCHEMA_OBJECT_COUNT` = **0**. Partition:

| Class | Objects | Count |
|-------|---------|-------|
| BOOTSTRAP_REPLAY_REQUIRED | tables: `vehicle_trips`, `driving_events`, `trip_behavior_events`, `vehicle_trip_waypoints`, `vehicle_trip_tracking_runs`, `trip_repairs`, `trip_driving_impact`; enums: `TripAssignmentStatus`, `TripAssignmentSubjectType`, `DrivingEventType` | 10 |
| BOOTSTRAP_EVENTUAL_REPLAY_REQUIRED | enums needed to build a replay-required table at parity: `BehaviorEventCategory`, `BehaviorEventClassification` (on `trip_behavior_events`) | 2 |
| SCHEMA_PARITY_ONLY | table: `vehicle_trip_detection_states`; enums: `TripSource`, `TripDetectionState`, `TripTrackingRunType`, `VehicleDetectionProfile`, `DetectionConfidence` | 6 |
| ORPHAN_REVIEW_REQUIRED | table: `brake_trip_metrics` | 1 |

- `BOOTSTRAP_REPLAY_REQUIRED_COUNT` = 10; `BOOTSTRAP_EVENTUAL_REPLAY_REQUIRED_COUNT` = 2;
  `SCHEMA_PARITY_ONLY_COUNT` = 6; `ORPHAN_REVIEW_REQUIRED_COUNT` = 1 (partition sums to 19).
- `PROVISIONAL_BOOTSTRAP_OBJECT_COUNT` = **18** (10 + 2 + 6; excludes the 1 orphan pending decision).
- `PROVISIONAL_BOOTSTRAP_OMITTED_OBJECT_COUNT` = **0** (the only excluded object has an
  evidence-backed ORPHAN_REVIEW_REQUIRED reason).
- `INSUFFICIENT_AUTHORITY_COUNT` = **19** — executable DDL for every object remains
  INSUFFICIENT_IMPLEMENTATION_AUTHORITY: repository schema history proves intent but does not
  authorize executable SQL, and every object's live presence/shape (§10) is unknown. Proven
  intended enum values are **not** treated as permission to implement them in production.
- `BASE_GAP_STRATEGY_STATUS` = **SAFE_CANDIDATE**; `CASING_STRATEGY_STATUS` =
  **INSUFFICIENT_AUTHORITY**; `END_TO_END_R3B_STRATEGY_STATUS` = **BLOCKED**.

## 12. Scope counters

| Counter | Value |
|---------|-------|
| `CHANGED_FILE_COUNT` / `AUDIT_REPORT_CHANGE_COUNT` | 1 |
| `HISTORICAL_MIGRATION_EDIT_COUNT` / `NEW_MIGRATION_COUNT` / `SCHEMA_CHANGE_COUNT` | 0 |
| `RUNTIME_CHANGE_COUNT` / `TEST_LOGIC_CHANGE_COUNT` / `WORKFLOW_CHANGE_COUNT` | 0 |
| `DEPENDENCY_CHANGE_COUNT` / `LOCKFILE_CHANGE_COUNT` / `PRODUCTION_CONFIG_CHANGE_COUNT` | 0 |
| `PRODUCTION_DATABASE_ACCESS_COUNT` / `PRODUCTION_DEPLOYMENT_COUNT` / `CI_R3B_IMPLEMENTATION_COUNT` | 0 |
| `E6`/`E7`/`E8`/`E9` scope counts / `OUT_OF_SCOPE_FILE_COUNT` | 0 |

Diagnostics used a disposable local PostgreSQL 16 cluster (destroyed after use). No
remote/production `DATABASE_URL` was ever used.

## 13. Pre-refactor field-level contract

Minimal provable pre-refactor contract: relation `vehicle_trips` exists (§5). Every data column is
STRONGLY_DERIVED (by a later migration's first reference) or UNKNOWN; none is guessed.

## 14. CI-R3A.1 — Independent Review Corrections (prior)

Added `trip_behavior_events`/`trip_repairs`; enumerated the 27-migration matrix; corrected the
cascade and legacy/guarded column classifications; stated out-of-band origin as PROVEN existence /
UNKNOWN method; evaluated Option J. (Superseded numeric details corrected in §15/§16.)

## 15. CI-R3A.2 — Complete Trip Schema Authority Inventory (prior)

Added the orphan `brake_trip_metrics` (tables 8→9); added the 10-entry enum-predecessor inventory;
corrected the temporal primary-key claim; made baseline/schema-only/false-positive accounting
explicit; separated bootstrap candidates from schema-parity/orphan objects (19 objects, 18 bootstrap).
(Its "23 grouped unknowns" and "all nine models since 77c26dad" statements are corrected in §16.)

## 16. CI-R3A.3 — Git-History and Atomic Authority Ledger Correction

- **`TripRepair` introduction corrected** from `77c26dad` to **`17019787`**
  (`chore: sync local SynqDrive state before VPS deployment`). The false claim that all nine
  models existed at the initial commit is removed (§4);
  `FALSE_ALL_MODELS_EXISTED_AT_INITIAL_COMMIT_COUNT` = 0. The other eight models are confirmed
  present at `77c26dad`.
- **Exact schema positions recorded** for all 9 models (§4) and all 10 enums (§6), verified with
  `nl -ba`. `TABLE_SCHEMA_POSITION_OMISSION_COUNT` = 0; `ENUM_SCHEMA_POSITION_OMISSION_COUNT` = 0.
- **Repository-proven enum timelines/value sets recorded** (§6a/§6b): seven enums from `77c26dad`
  and three from `17019787`, with initial → current values and the `20260425000000` /
  `20260716230000` transitions. `FALSE_UNKNOWN_REPOSITORY_ENUM_AUTHORITY_COUNT` = 0.
- **Authority dimensions separated** (§7): REPOSITORY_SCHEMA vs COMMITTED_MIGRATION vs
  LIVE_DATABASE. `AUTHORITY_DIMENSION_CONFLATION_COUNT` = 0.
- **`brake_trip_metrics` added to the shape/authority ledger** (§4, §10 U28/U56);
  `MISSING_TABLE_UNKNOWN_LEDGER_OMISSION_COUNT` = 0.
- **Atomic critical-unknown ledger** rebuilt to **56** individually-counted rows (§10), including
  19 separate live-object-presence propositions. Prior value 23 superseded.
- **Numeric false-positive count** provided: `FALSE_POSITIVE_MIGRATION_FILE_COUNT` = 15 (§3);
  `FALSE_POSITIVE_MIGRATION_FILE_COUNT_NUMERIC` = YES.
- **E2 migration evidence cross-referenced** (§2): `EXISTING_E2_MIGRATION_EVIDENCE_ACCOUNTED` = YES.
- No migration, schema, runtime, test, workflow, dependency, config, database, or deployment change
  occurred. CI-R3B remains blocked. E7 was not started.

## 17. Final audit status

Introduction commits and schema positions for all 9 tables and 10 enums are now Git-accurate;
repository-proven enum timelines are recorded and no longer mislabelled unknown; repository /
committed-migration / live-database authority are reported as separate dimensions; the
critical-unknown ledger is atomic (56 rows, 19 separate live-presence propositions); and the
false-positive migration count is numeric (15). Option **D** is a SAFE_CANDIDATE for the base-gap;
casing repair is INSUFFICIENT_AUTHORITY; a single safe end-to-end CI-R3B strategy cannot be
finalized while the §10 live-database and provenance authority remain unresolved.

**Status: CI_R3A_AUTHORITY_BLOCKED** — audit complete and corrected; CI-R3B implementation
requires the §10 authority before a single safe strategy can be committed.
