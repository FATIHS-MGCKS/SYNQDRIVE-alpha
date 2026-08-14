# CI Recovery R3A — Vehicle Trip migration history authority audit

> **Documentation-only authority audit.** No migration, schema, runtime, test, workflow, or
> dependency was changed. Disposable local PostgreSQL 16 was used for read/write diagnostics only
> and then destroyed. **CI-R3A.7 / CI-R3A.7.1** performed authorized **read-only** production
> PostgreSQL catalog queries (catalog tables only; proven `BEGIN READ ONLY` … `ROLLBACK`; no business
> rows; no connection or infrastructure metadata in committed evidence). This audit determines the
> safe, evidence-backed repair strategy for CI-R3B; it does **not** implement it.
>
> Correction history: **CI-R3A.1** added two missing tables + the 27-migration matrix.
> **CI-R3A.2** completed the schema-object inventory. **CI-R3A.3** corrected model/enum
> introduction commits. **CI-R3A.4** (this revision, §17) corrects the classified universe to 55,
> adds full initial/current table shapes (appendix, no ellipses) and per-model evolution commits,
> separates missing **creation** DDL from existing **evolution** DDL, and replaces the grouped
> pseudo-ledger with a mechanically-validated **atomic** critical-unknown table. **CI-R3A.7.1** (§17d)
> supersedes the initial CI-R3A.7 capture with redacted infrastructure metadata and complete committed
> catalog evidence in `ci-r3a7-production-catalog-evidence-2026-08.json`. Superseded values are marked
> "SUPERSEDED BY CI-R3A.4".
>
> **CI-R3B.0 (§17k)** locks the executable CI-R3B migration contract and supersedes **only** the earlier
> CI-R3B bootstrap **exclusion** of `brake_trip_metrics`: the transitional bootstrap inventory is **19**
> objects, not 18. The U043 product decision (`DEPRECATE_AND_REMOVE`) is unchanged and remains
> unimplemented. Full contract:
> `docs/audits/ci-recovery/ci-r3b-executable-contract-2026-08.md`. **CI-R3B.0.1 (§17l)** and
> **CI-R3B.0.2 (§17m)** separate minimal replay predecessor shape from final accepted shape; ledger:
> `docs/audits/ci-recovery/ci-r3b-bootstrap-predecessor-shape-ledger-2026-08.md`.

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
| 23 | `20260716310000_driving_attribution_roles` | **direct** `ALTER TABLE "vehicle_trips" ADD` `booking_customer_id`/`assigned_driver_id`/`actual_driver_id` | lower | ORDERING_DEFECT (direct vehicle_trips evolution DDL) |
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
| 2 | `BrakeTripMetric` / `brake_trip_metrics` | 77c26dad | 9025 | NO | — | 0 | none | CAPTURED (§17d — 11 cols/2 constraints/3 indexes) | **TRANSITIONAL_BOOTSTRAP_REQUIRED** (§17k; product disposition remains PRODUCT_APPROVED_REMOVAL, unimplemented) |
| 3 | `VehicleTrip` / `vehicle_trips` | 77c26dad | 9516 | YES | 17 material (see §4a) | 0 | 9 files (see §5) | UNKNOWN_CURRENT_DATABASE_STATE | BOOTSTRAP_REPLAY_REQUIRED |
| 4 | `VehicleTripWaypoint` / `vehicle_trip_waypoints` | 77c26dad | 9691 | NO | — | 0 | `20260609000000` (ALTER SET) | UNKNOWN_CURRENT_DATABASE_STATE | BOOTSTRAP_REPLAY_REQUIRED |
| 5 | `TripBehaviorEvent` / `trip_behavior_events` | 77c26dad | 9775 | YES | `df1b5a6e` (composite index `tripId,eventCategory`) | 0 | `20260413230000` (CREATE INDEX) | UNKNOWN_CURRENT_DATABASE_STATE | BOOTSTRAP_REPLAY_REQUIRED |
| 6 | `VehicleTripDetectionState` / `vehicle_trip_detection_states` | 77c26dad | 13162 | NO | — | 0 | none | UNKNOWN_CURRENT_DATABASE_STATE | SCHEMA_PARITY_ONLY |
| 7 | `VehicleTripTrackingRun` / `vehicle_trip_tracking_runs` | 77c26dad | 13229 | NO | — | 0 | `20260609000000` (ALTER SET) | UNKNOWN_CURRENT_DATABASE_STATE | BOOTSTRAP_REPLAY_REQUIRED |
| 8 | `TripRepair` / `trip_repairs` | **17019787** (`chore: sync local SynqDrive state before VPS deployment`) | 13268 | NO (since intro) | — | 0 | `20260609000000` (ALTER SET) | UNKNOWN_CURRENT_DATABASE_STATE | BOOTSTRAP_REPLAY_REQUIRED |
| 9 | `TripDrivingImpact` / `trip_driving_impact` | 77c26dad | 13309 | YES | `f54cbece` (checkpoint sync), `d6334d42` (diagnostics/consent), `f03f5061` (P41 provenance), `046f38b2` (P42 braking kinematics), `fc05a1a9` (P43 load components), `e14efca0` (P44 coverage authoritative) | 0 | `20260425000000` (camel ALTER DROP), `20260716250000`, `20260716260000`, `20260716270000`, `20260717180000` (ALTER/index/UPDATE) | UNKNOWN_CURRENT_DATABASE_STATE | BOOTSTRAP_REPLAY_REQUIRED |

`TABLE_MODEL_EVOLUTION_OMISSION_COUNT` = 0; `TABLE_EVOLUTION_COMMIT_OMISSION_COUNT` = 0;
`FALSE_UNKNOWN_REPOSITORY_TABLE_SHAPE_COUNT` = 0 (repo intended shapes are PROVEN — §18).

### 4a. Complete `VehicleTrip` model-evolution provenance

Independently revalidated with `git log -L '/^model VehicleTrip {/,/^}/:backend/prisma/schema.prisma'`,
which is exhaustive for commits that changed lines inside the model block. The 22 touching commits
classify as **1 introduction + 17 material non-merge + 3 merge (content attributed to sources) + 1
formatting-only** (no double-counting of merges):

| Commit | Date | Material VehicleTrip change |
|--------|------|-----------------------------|
| 77c26dad | 2026-04-10 | **Introduction** (initial shape — §18 A3) |
| 17019787 | 2026-04-16 | `assignment_status`, `assignment_subject_type`, `assignment_subject_id`, `assigned_booking_id`, `is_private_trip`; aggregate counters `total_acceleration_events`, `hard_acceleration_events`, `total_braking_events`, `hard_braking_events`, `full_braking_events`, `cornering_events`, `abuse_events`, `speeding_events`; `trip_source`, `is_repaired`, `merge_parent_trip_id`; `quality_status`, `behavior_summary_status`, `driving_impact_status`; `repairs` relation (`TripRepair[]`); indexes `[tripSource]`, `[assignmentStatus, isPrivateTrip]`, `[assignmentSubjectType, assignmentSubjectId]`, `[assignedBookingId]` |
| df1b5a6e | 2026-04-17 | composite index `[vehicleId, startTime]` (remaining diff is whitespace re-alignment — non-material) |
| c8fcccad | 2026-06-15 | `misuseCases` relation (`MisuseCase[]`) |
| 90d43466 | 2026-06-28 | `rpmWebhookCandidates` relation (`RpmWebhookCandidate[]`) |
| c07f06b0 | 2026-07-05 | `trip_analysis_status` + the `analysis_*` fields; `[tripAnalysisStatus]` index (the three readiness fields `quality_status`/`behavior_summary_status`/`driving_impact_status` were introduced earlier by `17019787`, not here) |
| 575c7317 | 2026-07-08 | Phase-4 attribution: `booking_link_source` (`TripBookingLinkSource`) + attribution wiring |
| b89cb302 | 2026-07-16 | `tripAssessabilities` relation |
| 3dce7ed4 | 2026-07-16 | `drivingEvidence` relation |
| 3b9012e6 | 2026-07-16 | `drivingAnalysisRuns` relation |
| 02c6e76d | 2026-07-16 | `drivingIntelligenceJobs` relation |
| d4c7ac17 | 2026-07-17 | `booking_customer_id`, `assigned_driver_id`, `actual_driver_id` fields (P53 booking/driver split) |
| 32dc81a0 | 2026-07-17 | `driverAttributions` relation (P54) |
| d58d6c68 | 2026-07-16 | `tireTripUsageLedgers` relation |
| 850e2306 | 2026-07-16 | `tire_usage_attribution_status`, `tire_usage_processed_at` fields; `tireUsageAttributionStatus` index |
| a7944b33 | 2026-07-16 | `batteryMeasurementSessions` relation |
| af2fb811 | 2026-07-17 | `dimoBrakingEventIntakes` relation |
| b0f68346 | 2026-07-17 | `brakingEventLedgerEntries` relation |

Non-material (excluded, not double-counted): merges `9ea43948`, `0f46a565`, `e707ce3e` (their
material content is attributed to the source commits above); formatting-only `039d0221` (whitespace
alignment of the relations block only — verified no field/relation/index change). Every current
`VehicleTrip` field, relation and index is thereby traceable to its introduction or an enumerated
material evolution commit.

## 5. CREATE-DDL vs EVOLUTION-DDL separation (tables)

For every missing table the **clean creation DDL is missing** while **evolution DDL may exist**;
these are never conflated (`CREATE_EVOLUTION_DDL_CONFLATION_COUNT` = 0;
`TABLE_EVOLUTION_DDL_OMISSION_COUNT` = 0):

| Table | CLEAN_CREATE_TABLE_DDL_COUNT | CLEAN_CREATE_TABLE_DDL_STATUS | EVOLUTION_DDL_FILE_COUNT | Evolution statement types | Assumes missing predecessor |
|-------|------------------------------|-------------------------------|--------------------------|---------------------------|-----------------------------|
| `vehicle_trips` | 0 | MISSING | 9 | ALTER TABLE, CREATE INDEX, UPDATE (incl. camelCase `"VehicleTrip"` casing-defective ALTER/UPDATE in `20260425000000`) | YES |
| `driving_events` | 0 | MISSING | 3 | ALTER TABLE, CREATE INDEX | YES |
| `trip_behavior_events` | 0 | MISSING | 1 | CREATE INDEX | YES |
| `vehicle_trip_waypoints` | 0 | MISSING | 1 | ALTER TABLE … SET (storage) | YES |
| `vehicle_trip_tracking_runs` | 0 | MISSING | 1 | ALTER TABLE … SET | YES |
| `trip_repairs` | 0 | MISSING | 1 | ALTER TABLE … SET | YES |
| `trip_driving_impact` | 0 | MISSING | 5 | ALTER TABLE, DROP COLUMN, CREATE INDEX, UPDATE | YES |
| `vehicle_trip_detection_states` | 0 | MISSING | 0 | (none) | n/a |
| `brake_trip_metrics` | 0 | MISSING | 0 | (none) | n/a |

`VEHICLE_TRIPS_EVOLUTION_DDL_FILE_COUNT` = **9**; `VEHICLE_TRIPS_CLEAN_CREATE_TABLE_DDL_COUNT` = 0
(evolution DDL is never reinterpreted as clean creation DDL). The complete direct-mutation set for
`vehicle_trips` (statements that directly `ALTER`/`UPDATE`/index the table, **excluding** FKs from
other tables that merely reference it):

1. `20260325161142_trip_architecture_refactor` — `ALTER TABLE "vehicle_trips"` (add/guarded add/drop) + `CREATE INDEX …trip_status`
2. `20260410000000_add_enrichment_status_fields` — `ALTER TABLE "vehicle_trips" ADD` + index
3. `20260413230000_add_composite_indexes_batch_c` — `CREATE INDEX … ON "vehicle_trips" (vehicle_id, start_time)`
4. `20260425000000_retire_user_assignment_and_speeding_severity` — **direct** `UPDATE "VehicleTrip"` + `ALTER TABLE "VehicleTrip"` (camelCase — **casing-defective** direct evolution DDL, not a mere reference)
5. `20260705140000_trip_analysis_status` — `ALTER TABLE "vehicle_trips" ADD` (analysis columns)
6. `20260705200000_trip_analysis_status_guard` — `ALTER TABLE "vehicle_trips" ADD COLUMN IF NOT EXISTS`
7. `20260708044000_trip_booking_link_source` — `ALTER TABLE "vehicle_trips" ADD` + `UPDATE "vehicle_trips"`
8. `20260716220000_tire_trip_usage_attribution` — `ALTER TABLE "vehicle_trips" ADD` (tire-usage columns)
9. `20260716310000_driving_attribution_roles` — `ALTER TABLE "vehicle_trips" ADD COLUMN "booking_customer_id"/"assigned_driver_id"/"actual_driver_id"`

(The earlier CI-R3A.4 count of 7 omitted #4 — miscategorised as a camelCase "reference" — and #9 —
miscategorised as a generic `trip_id` reference. SUPERSEDED BY CI-R3A.5.)

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
| U001 | vehicle_trips | Does the table exist in the target DB? | production catalog JSON: present=true (§17d) | — | idempotent bootstrap must CREATE-or-skip | information_schema.tables | no bootstrap until verified | **RESOLVED (YES)** |
| U002 | driving_events | Does the table exist in the target DB? | production catalog JSON: present=true (§17d) | — | idempotent bootstrap must CREATE-or-skip | information_schema.tables | no bootstrap until verified | **RESOLVED (YES)** |
| U003 | trip_behavior_events | Does the table exist in the target DB? | production catalog JSON: present=true (§17d) | — | idempotent bootstrap must CREATE-or-skip | information_schema.tables | no bootstrap until verified | **RESOLVED (YES)** |
| U004 | vehicle_trip_waypoints | Does the table exist in the target DB? | production catalog JSON: present=true (§17d) | — | idempotent bootstrap must CREATE-or-skip | information_schema.tables | no bootstrap until verified | **RESOLVED (YES)** |
| U005 | vehicle_trip_tracking_runs | Does the table exist in the target DB? | production catalog JSON: present=true (§17d) | — | idempotent bootstrap must CREATE-or-skip | information_schema.tables | no bootstrap until verified | **RESOLVED (YES)** |
| U006 | trip_repairs | Does the table exist in the target DB? | production catalog JSON: present=true (§17d) | — | idempotent bootstrap must CREATE-or-skip | information_schema.tables | no bootstrap until verified | **RESOLVED (YES)** |
| U007 | trip_driving_impact | Does the table exist in the target DB? | production catalog JSON: present=true (§17d) | — | idempotent bootstrap must CREATE-or-skip | information_schema.tables | no bootstrap until verified | **RESOLVED (YES)** |
| U008 | vehicle_trip_detection_states | Does the table exist in the target DB? | production catalog JSON: present=true (§17d) | — | schema-parity bootstrap must CREATE-or-skip | information_schema.tables | no bootstrap until verified | **RESOLVED (YES)** |
| U009 | brake_trip_metrics | Does the table exist in the target DB? | production catalog JSON: present=true (§17d) | — | orphan decision + CREATE-or-skip depend on it | information_schema.tables | no action until verified | **RESOLVED (YES)** |
| U010 | TripSource | Does the enum type exist in the target DB? | JSON enums[] present=true (§17d) | — | bootstrap must CREATE-or-skip the type | pg_type | no bootstrap until verified | **RESOLVED (YES)** |
| U011 | TripAssignmentStatus | Does the enum type exist in the target DB? | JSON enums[] present=true (§17d) | — | bootstrap must CREATE-or-skip the type | pg_type | no bootstrap until verified | **RESOLVED (YES)** |
| U012 | TripAssignmentSubjectType | Does the enum type exist in the target DB? | JSON enums[] present=true (§17d) | — | bootstrap must CREATE-or-skip the type | pg_type | no bootstrap until verified | **RESOLVED (YES)** |
| U013 | DrivingEventType | Does the enum type exist in the target DB? | JSON enums[] present=true (§17d) | — | ALTER TYPE ADD VALUE needs the type present | pg_type | no bootstrap until verified | **RESOLVED (YES)** |
| U014 | BehaviorEventCategory | Does the enum type exist in the target DB? | JSON enums[] present=true (§17d) | — | needed to build trip_behavior_events at parity | pg_type | no bootstrap until verified | **RESOLVED (YES)** |
| U015 | BehaviorEventClassification | Does the enum type exist in the target DB? | JSON enums[] present=true (§17d) | — | needed to build trip_behavior_events at parity | pg_type | no bootstrap until verified | **RESOLVED (YES)** |
| U016 | TripDetectionState | Does the enum type exist in the target DB? | JSON enums[] present=true (§17d) | — | schema-parity bootstrap must CREATE-or-skip | pg_type | no bootstrap until verified | **RESOLVED (YES)** |
| U017 | TripTrackingRunType | Does the enum type exist in the target DB? | JSON enums[] present=true (§17d) | — | schema-parity bootstrap must CREATE-or-skip | pg_type | no bootstrap until verified | **RESOLVED (YES)** |
| U018 | VehicleDetectionProfile | Does the enum type exist in the target DB? | JSON enums[] present=true (§17d) | — | schema-parity bootstrap must CREATE-or-skip | pg_type | no bootstrap until verified | **RESOLVED (YES)** |
| U019 | DetectionConfidence | Does the enum type exist in the target DB? | JSON enums[] present=true (§17d) | — | schema-parity bootstrap must CREATE-or-skip | pg_type | no bootstrap until verified | **RESOLVED (YES)** |
| U020 | vehicle_trips | Exact live physical column/type/constraint set? | JSON: 110 columns, 2 constraints, 13 indexes; repo diff totals all 0 (§17d) | — | detect drift vs bootstrap DDL | information_schema.columns | no bootstrap if live shape diverges | **RESOLVED (CAPTURED)** |
| U021 | driving_events | Exact live physical column/type/constraint set? | JSON: 21 columns, 3 constraints, 11 indexes; repo diff totals all 0 (§17d) | — | detect drift vs bootstrap DDL | information_schema.columns | no bootstrap if live shape diverges | **RESOLVED (CAPTURED)** |
| U022 | trip_behavior_events | Exact live physical column/type/constraint set? | JSON: 20 columns, 3 constraints, 6 indexes; repo diff totals all 0 (§17d) | — | detect drift vs bootstrap DDL | information_schema.columns | no bootstrap if live shape diverges | **RESOLVED (CAPTURED)** |
| U023 | vehicle_trip_waypoints | Exact live physical column/type/constraint set? | JSON: 7 columns, 2 constraints, 3 indexes; repo diff totals all 0 (§17d) | — | detect drift vs bootstrap DDL | information_schema.columns | no bootstrap if live shape diverges | **RESOLVED (CAPTURED)** |
| U024 | vehicle_trip_tracking_runs | Exact live physical column/type/constraint set? | JSON: 16 columns, 2 constraints, 5 indexes; repo diff totals all 0 (§17d) | — | detect drift vs bootstrap DDL | information_schema.columns | no bootstrap if live shape diverges | **RESOLVED (CAPTURED)** |
| U025 | trip_repairs | Exact live physical column/type/constraint set? | JSON: 12 columns, 3 constraints, 6 indexes; repo diff totals all 0 (§17d) | — | detect drift vs bootstrap DDL | information_schema.columns | no bootstrap if live shape diverges | **RESOLVED (CAPTURED)** |
| U026 | trip_driving_impact | Exact live physical column/type/constraint set? | JSON: 61 columns, 2 constraints, 6 indexes; no `speeding_severity_score`; repo diff 0 (§17d) | — | detect drift vs bootstrap DDL | information_schema.columns | no bootstrap if live shape diverges | **RESOLVED (CAPTURED)** |
| U027 | vehicle_trip_detection_states | Exact live physical column/type/constraint set? | JSON: 30 columns, 2 constraints, 5 indexes; repo diff totals all 0 (§17d) | — | detect drift vs bootstrap DDL | information_schema.columns | no bootstrap if live shape diverges | **RESOLVED (CAPTURED)** |
| U028 | brake_trip_metrics | Exact live physical column/type/constraint set? | JSON: 11 columns, 2 constraints, 3 indexes; repo diff totals all 0 (§17d) | — | orphan decision depends on live shape | information_schema.columns | no action if live shape diverges | **RESOLVED (CAPTURED)** |
| U029 | TripSource | Exact live enum value set? | JSON labels `{V2_LIVE, REPAIRED}` ordered (§17d) | — | bootstrap/inserts must match live values | pg_enum | no bootstrap if values diverge | **RESOLVED (MATCH)** |
| U030 | TripAssignmentStatus | Exact live enum value set? | JSON: 4 ordered labels; no `ASSIGNED_USER` (§17d) | — | bootstrap/inserts must match live values | pg_enum | no bootstrap if values diverge | **RESOLVED (MATCH)** |
| U031 | TripAssignmentSubjectType | Exact live enum value set? | JSON: `{DRIVER, BOOKING_CUSTOMER}` ordered; no `USER` (§17d) | — | bootstrap/inserts must match live values | pg_enum | no bootstrap if values diverge | **RESOLVED (MATCH)** |
| U032 | DrivingEventType | Exact live enum value set? | JSON: 8 ordered labels incl. `UNMAPPED_PROVIDER_EVENT`, `SAFETY_COLLISION` (§17d) | — | ADD VALUE idempotency depends on live set | pg_enum | no bootstrap if values diverge | **RESOLVED (MATCH)** |
| U033 | BehaviorEventCategory | Exact live enum value set? | JSON: 3 ordered labels (§17d) | — | bootstrap/inserts must match live values | pg_enum | no bootstrap if values diverge | **RESOLVED (MATCH)** |
| U034 | BehaviorEventClassification | Exact live enum value set? | JSON: 7 ordered labels (§17d) | — | bootstrap/inserts must match live values | pg_enum | no bootstrap if values diverge | **RESOLVED (MATCH)** |
| U035 | TripDetectionState | Exact live enum value set? | JSON: 6 ordered labels (§17d) | — | bootstrap/inserts must match live values | pg_enum | no bootstrap if values diverge | **RESOLVED (MATCH)** |
| U036 | TripTrackingRunType | Exact live enum value set? | JSON: 5 ordered labels (§17d) | — | bootstrap/inserts must match live values | pg_enum | no bootstrap if values diverge | **RESOLVED (MATCH)** |
| U037 | VehicleDetectionProfile | Exact live enum value set? | JSON: 4 ordered labels (§17d) | — | bootstrap/inserts must match live values | pg_enum | no bootstrap if values diverge | **RESOLVED (MATCH)** |
| U038 | DetectionConfidence | Exact live enum value set? | JSON: `{LOW, MEDIUM, HIGH}` ordered (§17d) | — | bootstrap/inserts must match live values | pg_enum | no bootstrap if values diverge | **RESOLVED (MATCH)** |
| U039 | vehicle_trips | Live table identifier casing (lowercase vs camelCase)? | JSON casing: relname lowercase; camelCase ghost absent (§17d) | — | decides casing-repair need + Option J direction | pg_class | no casing repair until known | **RESOLVED (lowercase)** |
| U040 | trip_driving_impact | Live table identifier casing (lowercase vs camelCase)? | JSON casing: relname lowercase; camelCase ghost absent (§17d) | — | decides casing-repair need + Option J direction | pg_class | no casing repair until known | **RESOLVED (lowercase)** |
| U041 | 20260425000000 | Is this migration recorded applied in target _prisma_migrations? | JSON migration_metadata: finished, not rolled back, applied_steps_count=0 (§17d) | — | Option J guard branches on applied-state | _prisma_migrations | no Option J guard until known | **RESOLVED (APPLIED)** |
| U042 | casing repair | Which mechanism (Option B edit vs Option J append) is safe? | JSON casing + U041; CI-R3A.8–CI-R3A.8.3 authority (§17e–§17h); CI-R3A.9 controlled entry authorization (§17i) | executable CI-R3B proof (gates 2–7) | end-to-end replay must pass 20260425000000 safely across separate migration boundaries | reviewer sign-off + executable replay + F01–F04 gates | no production deployment until CI-R3B acceptance gates pass | **PASS_FOR_CONTROLLED_CI_R3B_PROOF** |
| U043 | brake_trip_metrics | Should it be bootstrapped or removed from the schema? | JSON table present (11 cols/2 constraints/3 indexes); 0 migration refs (§4); CI-R3A.8 search: 0 runtime readers/writers, 0 contracts (§17e); independent evidence review PASS; product-owner decision DEPRECATE_AND_REMOVE (§17i); CI-R3B.0 executable disposition TRANSITIONAL_BOOTSTRAP_REQUIRED (§17k) | explicit product-owner decision (retain vs destructive removal) | determines inclusion in bootstrap vs schema removal | product/architecture owner | removal requires separate scoped implementation; CI-R3B must bootstrap the table for parity and must not drop it | **PRODUCT_OWNER_DECISION_APPROVED** |

<!-- ATOMIC_UNKNOWN_LEDGER_END -->

`IMPLEMENTATION_CRITICAL_UNKNOWN_COUNT` = `ATOMIC_UNKNOWN_LEDGER_ROW_COUNT` =
`ATOMIC_UNKNOWN_UNIQUE_ID_COUNT` = **43**. `PRODUCTION_AUTHORITY_RESOLVED_UNKNOWN_COUNT` (U001–U041) =
**41** (CI-R3A.7.1). `INDEPENDENT_REVIEW_CORRECTION_LEDGER_ROW_COUNT` (U042) = **1** (CI-R3A.8.1 §17f +
CI-R3A.8.2 §17g + CI-R3A.8.3 §17h; CI-R3A.9 §17i entry authorization).
`PRODUCT_DECISION_LEDGER_ROW_COUNT` (U043) = **1**. `U042_RESOLVED_COUNT` = **0** (final technical
acceptance only — `U042_ENTRY_AUTHORITY_RESOLVED_COUNT` = 1; `U042_FINAL_ACCEPTANCE_RESOLVED_COUNT` = 0).
`U043_RESOLVED_COUNT` = **1**. `REMAINING_IMPLEMENTATION_BLOCKER_COUNT` = **0**.
`R3B_FINAL_ACCEPTANCE_BLOCKER_GROUP_COUNT` = **1** (CI-R3B acceptance gates 2–7 — final acceptance only).
`ATOMIC_UNKNOWN_DUPLICATE_ID_COUNT` = 0;
`ATOMIC_UNKNOWN_MISSING_COLUMN_ROW_COUNT` = 0; `GROUPED_UNKNOWN_RANGE_COUNT` = 0;
`GROUPED_UNCOUNTED_CRITICAL_UNKNOWN_COUNT` = 0; `UNMATRIXED_IMPLEMENTATION_CRITICAL_UNKNOWN_COUNT` = 0;
`STALE_CRITICAL_UNKNOWN_COUNT` = 0. Mechanical validation command + output are in §17.

Non-critical observations (excluded from the counter): the exact out-of-band baseline creation
method (contextual); prior audit observations are dated historical evidence, not current live
authority.

## 11. CI-R3B contract (entry authorized after CI-R3A.9 merge; bootstrap inventory locked by CI-R3B.0)

`KNOWN_MISSING_SCHEMA_OBJECT_COUNT` = **19** (9 tables + 10 enums);
`UNCLASSIFIED_MISSING_SCHEMA_OBJECT_COUNT` = 0. Executable partition (**CI-R3B.0 — §17k**):

| Class | Objects | Count |
|-------|---------|-------|
| BOOTSTRAP_REPLAY_REQUIRED | tables `vehicle_trips`, `driving_events`, `trip_behavior_events`, `vehicle_trip_waypoints`, `vehicle_trip_tracking_runs`, `trip_repairs`, `trip_driving_impact`, **`brake_trip_metrics`** (transitional — §17k); enums `TripAssignmentStatus`, `TripAssignmentSubjectType`, `DrivingEventType` | 11 |
| BOOTSTRAP_EVENTUAL_REPLAY_REQUIRED | enums to build `trip_behavior_events` at parity: `BehaviorEventCategory`, `BehaviorEventClassification` | 2 |
| SCHEMA_PARITY_ONLY | table `vehicle_trip_detection_states`; enums `TripSource`, `TripDetectionState`, `TripTrackingRunType`, `VehicleDetectionProfile`, `DetectionConfidence` | 6 |

- `BOOTSTRAP_REPLAY_REQUIRED_COUNT` = **11**; `BOOTSTRAP_EVENTUAL_REPLAY_REQUIRED_COUNT` = **2**;
  `SCHEMA_PARITY_ONLY_COUNT` = **6** (sums to 19).
- `R3B_TRANSITIONAL_BOOTSTRAP_OBJECT_COUNT` = **19**; `R3B_BOOTSTRAP_OMITTED_OBJECT_COUNT` = **0**;
  `R3B_FINAL_PARITY_EXCEPTION_COUNT` = **0**.
- `PRODUCT_APPROVED_REMOVAL_COUNT` = **1** (`brake_trip_metrics`) — a **product-disposition** label on a
  separate axis, not a bootstrap-exclusion class; `PRODUCT_REMOVAL_IMPLEMENTED_COUNT` = **0**;
  `PRODUCTION_DROP_AUTHORIZED` = **NO**.
- `ORPHAN_REVIEW_REQUIRED_COUNT` = **0**; `U043_PENDING_OBJECT_COUNT` = **0**.
- `PROVISIONAL_BOOTSTRAP_OBJECT_COUNT` = 18 with `brake_trip_metrics` excluded, and
  `BOOTSTRAP_REPLAY_REQUIRED_COUNT` = 10, are **SUPERSEDED BY CI-R3B.0** (§17k): product approval to
  remove is not removal, the Prisma schema still owns the model, and exact fresh-replay parity with the
  accepted CI-R3A.7.1 shape is unreachable while the table is excluded.
- `PROVISIONAL_BOOTSTRAP_OMITTED_OBJECT_COUNT` = 0.
- `INSUFFICIENT_AUTHORITY_COUNT` = **0** — U043 product decision resolved (§17i); `brake_trip_metrics`
  remains product-approved for removal but is **transitionally bootstrapped** until that separately
  scoped removal is implemented (§17k). Option **D** bootstrap targets remain authorized against
  captured lowercase production shapes.
- `BASE_GAP_STRATEGY_STATUS` = SAFE_CANDIDATE (**production-authorized** — §17d);
  `CASING_STRATEGY_STATUS` = INSUFFICIENT_AUTHORITY (U042 — Option J candidate until CI-R3B proof;
  CI-R3A.9 §17i);
  `END_TO_END_R3B_STRATEGY_STATUS` = **AUTHORIZED_FOR_ISOLATED_NON_PRODUCTION_PROOF** (controlled
  implementation and proof may begin after PR #1029 merge; final acceptance gates 2–7 pending).
  `CI_R3B_IMPLEMENTATION_COUNT` = 0.

Per-object rationale: the 7 replay-blocking tables + 3 replay-required enums are directly referenced
by a migration (ALTER/INDEX/FK/rebuild) and block replay; `BehaviorEventCategory`/
`BehaviorEventClassification` are eventual because `trip_behavior_events` (replay-required) has
columns typed on them; the 6 schema-parity objects are never referenced by any migration but exist
in the schema; `brake_trip_metrics` has no migration reference and no code reader/writer, yet the
CI-R3B bootstrap is the **only** authorized creator of it and acceptance gate 5 requires exact parity
with the accepted CI-R3A.7.1 shape — so CI-R3B.0 classifies it **BOOTSTRAP_REPLAY_REQUIRED
(transitional)** while its product disposition stays **PRODUCT_APPROVED_REMOVAL**
(`U043_REMOVAL_IMPLEMENTATION_COUNT` = 0; `PRODUCTION_DROP_AUTHORIZED` = NO — §17k).

## 12. Scope counters

Scope is reported per commit. **Current phase = CI-R3B.0** (executable contract lock):

| Counter | Value |
|---------|-------|
| `CHANGED_FILE_COUNT` | 3 |
| `AUDIT_REPORT_CHANGE_COUNT` | 1 (this file — §17k + bootstrap-inventory reconciliation) |
| `DECISION_PACKAGE_FILE_CHANGE_COUNT` | 1 (`ci-r3a8-u042-u043-decision-package-2026-08.md`, §14) |
| `EXECUTABLE_CONTRACT_FILE_CHANGE_COUNT` | 1 (new `ci-r3b-executable-contract-2026-08.md`) |
| `DOCUMENTATION_FILE_CHANGE_COUNT` | 3 |
| `JSON_EVIDENCE_CHANGE_COUNT` | 0 |
| `JSON_EVIDENCE_HASH_MATCH` | YES |
| `HISTORICAL_MIGRATION_EDIT_COUNT` / `NEW_MIGRATION_COUNT` / `PRISMA_SCHEMA_CHANGE_COUNT` | 0 |
| `RUNTIME_CHANGE_COUNT` / `TEST_LOGIC_CHANGE_COUNT` / `WORKFLOW_CHANGE_COUNT` | 0 |
| `DEPENDENCY_CHANGE_COUNT` / `LOCKFILE_CHANGE_COUNT` / `PRODUCTION_CONFIG_CHANGE_COUNT` | 0 |
| `PRODUCTION_DATABASE_ACCESS_COUNT` | 0 |
| `PRODUCTION_DEPLOYMENT_COUNT` / `CI_R3B_IMPLEMENTATION_COUNT` | 0 |
| `E6`/`E7`/`E8`/`E9` scope / `OUT_OF_SCOPE_FILE_COUNT` | 0 |
| `PRODUCT_APPROVED_REMOVAL_COUNT` | 1 |
| `PRODUCT_REMOVAL_IMPLEMENTED_COUNT` | 0 |
| `PRODUCTION_DROP_AUTHORIZED` | NO |
| `ORPHAN_REVIEW_REQUIRED_COUNT` | 0 |
| `U043_PENDING_OBJECT_COUNT` | 0 |
| `U043_REMOVAL_IMPLEMENTATION_COUNT` | 0 |
| `R3B_TRANSITIONAL_BOOTSTRAP_OBJECT_COUNT` | 19 |
| `R3B_FINAL_PARITY_EXCEPTION_COUNT` | 0 |
| `REMAINING_IMPLEMENTATION_BLOCKER_COUNT` | 0 |
| `R3B_FINAL_ACCEPTANCE_BLOCKER_GROUP_COUNT` | 1 |
| `U042_ENTRY_AUTHORITY_RESOLVED_COUNT` | 1 |
| `U042_FINAL_ACCEPTANCE_RESOLVED_COUNT` | 0 |
| `STALE_ORPHAN_PENDING_U043_CLAIM_COUNT` | 0 |
| `STALE_ORPHAN_REVIEW_REQUIRED_CURRENT_AUTHORITY_COUNT` | 0 |
| `MISCLASSIFIED_R3B_ACCEPTANCE_AS_IMPLEMENTATION_BLOCKER_COUNT` | 0 |
| `UNQUALIFIED_OPTION_J_NOT_INDEPENDENTLY_APPROVED_CLAIM_COUNT` | 0 |
| `STALE_R3B_BOOTSTRAP_18_CURRENT_CLAIM_COUNT` | 0 |
| `FALSE_U043_REMOVAL_IMPLEMENTED_CLAIM_COUNT` | 0 |
| `FALSE_R3B_PRODUCTION_DROP_AUTHORITY_CLAIM_COUNT` | 0 |
| `R3B_PARITY_CONTRADICTION_COUNT` | 0 |
| `STALE_CURRENT_AUTHORITY_COUNT` | 0 |

Prior phase **CI-R3A.8** (historical, for reference):

| Counter | Value |
|---------|-------|
| `CHANGED_FILE_COUNT` | 2 |
| `AUDIT_REPORT_CHANGE_COUNT` | 1 |
| `EVIDENCE_FILE_CHANGE_COUNT` | 1 |
| `DOCUMENTATION_FILE_CHANGE_COUNT` | 2 |
| `HISTORICAL_MIGRATION_EDIT_COUNT` / `NEW_MIGRATION_COUNT` / `SCHEMA_CHANGE_COUNT` | 0 |
| `RUNTIME_CHANGE_COUNT` / `TEST_LOGIC_CHANGE_COUNT` / `WORKFLOW_CHANGE_COUNT` | 0 |
| `DEPENDENCY_CHANGE_COUNT` / `LOCKFILE_CHANGE_COUNT` / `PRODUCTION_CONFIG_CHANGE_COUNT` | 0 |
| `PRODUCTION_DATABASE_ACCESS_COUNT` | 1 (read-only catalog; §17d) |
| `PRODUCTION_DEPLOYMENT_COUNT` / `CI_R3B_IMPLEMENTATION_COUNT` | 0 |
| `E6`/`E7`/`E8`/`E9` scope / `OUT_OF_SCOPE_FILE_COUNT` | 0 |

## 13. Stale-claim sweep

`STALE_MIGRATION_UNIVERSE_CLAIM_COUNT` = 0 (universe stated as 55 throughout);
`STALE_ATOMIC_LEDGER_CLAIM_COUNT` = 0 (43 physical rows, no ID ranges);
`STALE_DDL_AUTHORITY_CLAIM_COUNT` = 0 (creation vs evolution DDL separated — §5/§6);
`STALE_CHECKSUM_CRITICALITY_CLAIM_COUNT` = 0 (checksum unknowns removed — §9/§10);
`STALE_MODEL_HISTORY_CLAIM_COUNT` = 0 (`TripRepair` = 17019787; not all nine at 77c26dad);
`STALE_U042_U043_STATUS_CLAIM_COUNT` = 0 (current statuses in §17j/§17k; §17e–§17i marked superseded where needed);
`STALE_U042_ATOMIC_WORKFLOW_CLAIM_COUNT` = 0;
`STALE_U042_ZERO_PARTIAL_PERSISTENCE_CLAIM_COUNT` = 0;
`STALE_U042_COMPLETE_GUARD_AUTHORITY_CLAIM_COUNT` = 0;
`STALE_U042_TECHNICALLY_APPROVED_CLAIM_COUNT` = 0;
`STALE_U042_AUTHORITY_CLAIM_COUNT` = 0;
`STALE_POST_SHIM_SELF_ROW_FAILURE_CLAIM_COUNT` = 0;
`STALE_RAW_GUARD_MUTUAL_EXCLUSIVITY_CLAIM_COUNT` = 0;
`STALE_UNQUALIFIED_GUARD_OVERLAP_ZERO_CLAIM_COUNT` = 0;
`STALE_FALSE_PRISMA_SOURCE_PATH_COUNT` = 0;
`FALSE_SOURCE_PATH_ALIAS_CLAIM_COUNT` = 0;
`UNDEFINED_POST_PRE_GUARD_ROW_REFERENCE_COUNT` = 0;
`STALE_PRE_SHIM_OUTCOME_COUNT_20_CLAIM_COUNT` = 0;
`STALE_PRE_SHIM_FAIL_CLOSED_COUNT_13_CLAIM_COUNT` = 0;
`STALE_TOTAL_FAIL_CLOSED_COUNT_23_CLAIM_COUNT` = 0;
`U042_GUARD_COUNTER_ARITHMETIC_MISMATCH_COUNT` = 0;
`STALE_U043_AWAITING_DECISION_CLAIM_COUNT` = 0;
`STALE_U043_NO_APPROVAL_CLAIM_COUNT` = 0;
`STALE_U042_FULL_ENTRY_BLOCK_CLAIM_COUNT` = 0;
`CIRCULAR_R3B_START_GATE_STATEMENT_COUNT` = 0;
`FALSE_OPTION_J_FINAL_ACCEPTANCE_CLAIM_COUNT` = 0;
`FALSE_CI_R3B_IMPLEMENTED_CLAIM_COUNT` = 0;
`FALSE_PRODUCTION_AUTHORIZATION_CLAIM_COUNT` = 0;
`STALE_ORPHAN_PENDING_U043_CLAIM_COUNT` = 0;
`STALE_ORPHAN_REVIEW_REQUIRED_CURRENT_AUTHORITY_COUNT` = 0;
`MISCLASSIFIED_R3B_ACCEPTANCE_AS_IMPLEMENTATION_BLOCKER_COUNT` = 0;
`UNQUALIFIED_OPTION_J_NOT_INDEPENDENTLY_APPROVED_CLAIM_COUNT` = 0;
`STALE_R3B_BOOTSTRAP_18_CURRENT_CLAIM_COUNT` = 0 (18-object statements labelled superseded by CI-R3B.0 — §17k);
`FALSE_U043_REMOVAL_IMPLEMENTED_CLAIM_COUNT` = 0;
`FALSE_R3B_PRODUCTION_DROP_AUTHORITY_CLAIM_COUNT` = 0;
`FALSE_U043_REVERSAL_CLAIM_COUNT` = 0;
`R3B_PARITY_CONTRADICTION_COUNT` = 0;
`STALE_CURRENT_AUTHORITY_COUNT` = 0.
Superseded prior values (universe 54; 56 grouped unknowns; grouped ID ranges; "all nine models at
77c26dad") are marked "SUPERSEDED BY CI-R3A.4".

## 14. CI-R3A.1 (prior)

Added `trip_behavior_events`/`trip_repairs`; the 27-migration matrix; cascade + legacy/guarded
column corrections; out-of-band PROVEN existence / UNKNOWN method; Option J.

## 15. CI-R3A.2 (prior)

Added orphan `brake_trip_metrics` (tables 8→9); 10-entry enum inventory; temporal PK correction;
19 objects / 18 bootstrap (**the "18 bootstrap" figure is historical — SUPERSEDED BY CI-R3B.0 §17k;
current transitional bootstrap inventory = 19**).

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

## 17a. CI-R3A.5 — VehicleTrip git-history + evolution-DDL authority completion

Independent review rejected CI-R3A.4 for two proven authority gaps; both are now closed:

- **VehicleTrip model-evolution history completed.** The prior matrix omitted four material
  non-merge commits: `17019787` (assignment/source/repair fields, aggregate counters,
  readiness/status fields, `repairs` relation, assignment/source indexes), `df1b5a6e`
  (`[vehicleId, startTime]` composite index), `c8fcccad` (`misuseCases` relation), and `90d43466`
  (`rpmWebhookCandidates` relation). The complete history was independently revalidated with
  `git log -L` and is enumerated in §4a (1 introduction + **17 material** non-merge commits +
  3 merges attributed to sources + 1 formatting-only), with per-field/relation/index provenance in
  Appendix A3. `VEHICLE_TRIP_MISSING_MATERIAL_COMMITS_CORRECTED` = 4.
- **`vehicle_trips` evolution-DDL inventory corrected 7 → 9** (§5). Added `20260425000000`
  (direct `UPDATE`/`ALTER TABLE "VehicleTrip"` — a casing-defective **direct** mutation, not a mere
  reference) and `20260716310000` (direct `ALTER TABLE "vehicle_trips" ADD` `booking_customer_id`,
  `assigned_driver_id`, `actual_driver_id`). The §3a matrix row #23 is reclassified from a generic
  `trip_id` reference to a direct `vehicle_trips` ALTER. `VEHICLE_TRIPS_EVOLUTION_DDL_FILE_COUNT` = 9;
  `VEHICLE_TRIPS_CLEAN_CREATE_TABLE_DDL_COUNT` = 0 (evolution DDL is not reinterpreted as creation
  DDL); `CREATE_EVOLUTION_DDL_CONFLATION_COUNT` = 0.

The 55-file classified universe is unchanged (both files were already in the 27 direct set; only
their per-file descriptions were corrected): `MIGRATION_SEARCH_UNIVERSE_FILE_COUNT` = 55;
`DUPLICATE_MIGRATION_CLASSIFICATION_COUNT` = 0; `UNCLASSIFIED_MIGRATION_SEARCH_FILE_COUNT` = 0. The
43-row atomic unknown ledger is preserved and re-validated (§10/§17). No migration, schema, runtime,
test, workflow, dependency, config, database, or deployment change occurred; CI-R3B remains blocked;
E7/E8/E9 not started. `TABLE_MODEL_EVOLUTION_OMISSION_COUNT` = 0;
`TABLE_EVOLUTION_COMMIT_OMISSION_COUNT` = 0; `TABLE_EVOLUTION_DDL_OMISSION_COUNT` = 0.

## 17b. CI-R3A.6 — Final VehicleTrip Field-Provenance Correction

Independent review found one residual provenance error: the readiness fields `quality_status`,
`behavior_summary_status`, `driving_impact_status` were correctly attributed to `17019787` but were
**additionally and incorrectly** attributed to `c07f06b0`. Verified against Git:

- `READINESS_FIELD_TRUE_INTRO_COMMIT` = `17019787` — `git show 17019787` adds `quality_status`,
  `behavior_summary_status`, `driving_impact_status`.
- `POST_TRIP_ANALYSIS_TRUE_INTRO_COMMIT` = `c07f06b0` — `git show c07f06b0` adds **only**
  `trip_analysis_status`, `analysis_queued_at`, `analysis_started_at`, `analysis_partial_at`,
  `analysis_completed_at`, `analysis_failed_at`, `analysis_failed_reason`, `analysis_latency_ms`,
  `analysis_stages_json`, and the `[tripAnalysisStatus]` index.

The three readiness fields were removed from the `c07f06b0` descriptions in §4a and Appendix A3;
they remain attributed exclusively to `17019787`. Attribution now:

- `QUALITY_STATUS_INTRO_ATTRIBUTION` = 17019787; `BEHAVIOR_SUMMARY_STATUS_INTRO_ATTRIBUTION` =
  17019787; `DRIVING_IMPACT_STATUS_INTRO_ATTRIBUTION` = 17019787.
- `TRIP_ANALYSIS_STATUS_INTRO_ATTRIBUTION` = c07f06b0; `ANALYSIS_FIELDS_INTRO_ATTRIBUTION` =
  c07f06b0; `TRIP_ANALYSIS_STATUS_INDEX_INTRO_ATTRIBUTION` = c07f06b0.
- `FALSE_FIELD_INTRODUCTION_ATTRIBUTION_COUNT` = 0; `DUPLICATE_FIELD_INTRODUCTION_ATTRIBUTION_COUNT`
  = 0; `STALE_C07_READINESS_ATTRIBUTION_COUNT` = 0.

No model-history commit or DDL file was added or removed: the 17 material non-merge commit inventory
(§4a), the nine-file `vehicle_trips` evolution-DDL inventory (§5), the 55-file universe (§3), and the
43-row atomic ledger (§10) are all unchanged. No executable migration/schema/runtime change occurred.
CI-R3B remains blocked on U042/U043; E7/E8/E9 not started.

## 17c. CI-R3A.7 — Initial production capture (superseded)

Initial read-only production catalog capture occurred **2026-08-14**. Independent review rejected
that revision for: (1) prohibited infrastructure metadata in committed prose; (2) U020–U028 marked
resolved without complete committed column/constraint/index evidence; (3) read-only transaction /
rollback / session closure asserted but not demonstrated; (4) Option **J** inconsistently labeled
**SAFE**; (5) `applied_steps_count=0` interpreted too conclusively.

`CI_R3A7_INITIAL_CAPTURE_STATUS` = **SUPERSEDED BY CI-R3A.7.1** (§17d). Do not cite §17c prose as
authority; cite §17d and the JSON evidence artifact only.

## 17d. CI-R3A.7.1 — Redacted production catalog evidence correction

Authorized read-only production catalog capture re-executed **2026-08-14** using the preconfigured
access mechanism (values redacted; not recorded in git).

### Sanitized evidence artifact

Machine-readable, sanitized catalog evidence:

`docs/audits/ci-recovery/ci-r3a7-production-catalog-evidence-2026-08.json`

The JSON contains complete live column, constraint, index and enum-label catalogs for all nine tables
and ten enums, casing probes, the single required `_prisma_migrations` metadata row, and repository
comparison totals. No connection URL, credential path, host, SSH identity or secret values appear in
the artifact.

### Read-only session proof

| Field | Value |
|-------|-------|
| `TARGET_ENVIRONMENT` | PRODUCTION |
| `TARGET_DATABASE_IDENTITY_PROVEN` | YES |
| `TARGET_DATABASE_IDENTITY_REDACTED` | YES |
| `READ_ONLY_TRANSACTION_PROVEN` | YES (`current_setting('transaction_read_only')` = `on`) |
| `DATABASE_TRANSACTION_END` | ROLLBACK |
| `DATABASE_SESSION_CLOSED` | YES |
| `PRODUCTION_DATABASE_READ_SESSION_COUNT` | 1 |
| `PRODUCTION_DATABASE_WRITE_COUNT` | 0 |
| `PRODUCTION_DDL_DML_MUTATION_COUNT` | 0 |
| `BUSINESS_DATA_QUERY_COUNT` | 0 |
| `BUSINESS_DATA_ROW_READ_COUNT` | 0 |
| `MIGRATION_METADATA_ROW_QUERY_COUNT` | 1 |

Queries were limited to `pg_catalog`, `information_schema`, and the single `_prisma_migrations` row
for `20260425000000_retire_user_assignment_and_speeding_severity`.

### Live catalog evidence counts (authoritative)

| Counter | Value |
|---------|-------|
| `LIVE_TABLE_EVIDENCE_COUNT` | 9 |
| `LIVE_COLUMN_EVIDENCE_ROW_COUNT` | 288 |
| `LIVE_CONSTRAINT_EVIDENCE_ROW_COUNT` | 21 |
| `LIVE_INDEX_EVIDENCE_ROW_COUNT` | 58 |
| `LIVE_ENUM_TYPE_EVIDENCE_COUNT` | 10 |
| `LIVE_ENUM_VALUE_EVIDENCE_ROW_COUNT` | 44 |

Per-table column / constraint / index row counts are recorded in the JSON (`tables[].columns`,
`tables[].constraints`, `tables[].indexes`) with no placeholders or ellipses.

### Repository comparison (complete)

Comparator: Prisma `@map` scalar fields + unmapped snake_case scalars vs live `information_schema`
rows (see JSON `repository_comparison`).

| Counter | Value |
|---------|-------|
| `LIVE_REPO_COLUMN_DIFF_COUNT` | 0 |
| `LIVE_REPO_TYPE_DIFF_COUNT` | 0 |
| `LIVE_REPO_NULLABILITY_DIFF_COUNT` | 0 |
| `LIVE_REPO_DEFAULT_DIFF_COUNT` | 0 |
| `LIVE_REPO_CONSTRAINT_DIFF_COUNT` | 0 |
| `LIVE_REPO_INDEX_DIFF_COUNT` | 0 |
| `UNCLASSIFIED_LIVE_REPO_DIFF_COUNT` | 0 |

U020–U028 may remain **RESOLVED (CAPTURED)** because the JSON contains complete per-table columns,
constraints and indexes and the comparison totals above are all zero.

### U039–U040 — casing (lowercase)

JSON `casing`: `vehicle_trips_relname=vehicle_trips`, `trip_driving_impact_relname=trip_driving_impact`,
camelCase ghost relations **absent**, `public_uppercase_relation_count=0`.

### U041 — `_prisma_migrations` applied-state

JSON `migration_metadata[0]`:

| Field | Value |
|-------|-------|
| `migration_name` | `20260425000000_retire_user_assignment_and_speeding_severity` |
| `finished` | true |
| `rolled_back` | false |
| `applied_steps_count` | 0 |
| `started_finished_equal` | true |
| `checksum_match` | null (not verified in this capture) |

`applied_steps_count=0`, together with a finished row, is consistent with a migration marked
applied/baselined without Prisma-recorded successful SQL steps. It does **not** by itself prove the
exact historical mechanism. Live enum/column state is nonetheless consistent with the migration
intent (retired enum values absent; `speeding_severity_score` absent).

### U042 — casing-repair recommendation (not selected)

Production live casing is already lowercase — **no production casing mutation is required**.

| Option | Authority |
|--------|-----------|
| **B** — edit applied migration | **REJECTED** — editing an applied migration is unsafe |
| **J** — append-only guarded replay shim | **CANDIDATE / INSUFFICIENT_AUTHORITY** — requires independent review and proven empty-database replay |

Additional constraints recorded:

- Normal later migrations cannot repair a failure that occurs **before** they execute (`20260425000000`
  runs before many downstream migrations).
- Any retroactively ordered guarded pre/post shim requires reviewer sign-off and proven end-to-end
  empty-database replay.
- **No casing strategy is selected yet.**

At CI-R3A.7.1 this read: `U042_STATUS` = RECOMMENDATION_ONLY; `CASING_STRATEGY_STATUS` =
INSUFFICIENT_AUTHORITY; `END_TO_END_R3B_STRATEGY_STATUS` = BLOCKED; `CI_R3B_IMPLEMENTATION_COUNT` = 0.

Recorded recommendation (non-binding at that time): pair Option **D** bootstrap with an append-only
Option **J** family replay shim for fresh databases — **without** editing the applied production
migration row.

**Superseded by §17e (CI-R3A.8):** the Option J candidate now carries complete statement, ordering,
guard and dependency authority. Current values: `U042_STATUS` =
TECHNICALLY_SPECIFIED_PENDING_INDEPENDENT_APPROVAL_AND_REPLAY; `CASING_STRATEGY_STATUS` =
CANDIDATE_NOT_IMPLEMENTED. `END_TO_END_R3B_STRATEGY_STATUS` = BLOCKED and
`CI_R3B_IMPLEMENTATION_COUNT` = 0 are unchanged.

### U043 — unchanged at CI-R3A.7.1

At CI-R3A.7.1: `U043_STATUS` = PRODUCT_DECISION_REQUIRED. `brake_trip_metrics` live shape is captured
in JSON; the orphan bootstrap vs schema-removal decision remains with product/architecture.

**Superseded by §17e (CI-R3A.8):** current value `U043_STATUS` = AWAITING_PRODUCT_OWNER_DECISION with
a recorded technical recommendation (`DEPRECATE_AND_REMOVE_CANDIDATE`).

### Safety / redaction counters (committed evidence scan)

| Counter | Value |
|---------|-------|
| `CONNECTION_URI_OUTPUT_COUNT` | 0 |
| `PASSWORD_OUTPUT_COUNT` | 0 |
| `TOKEN_OUTPUT_COUNT` | 0 |
| `PRIVATE_KEY_OUTPUT_COUNT` | 0 |
| `VPS_ENDPOINT_OUTPUT_COUNT` | 0 |
| `CREDENTIAL_PATH_OUTPUT_COUNT` | 0 |
| `SECRET_VALUE_OUTPUT_COUNT` | 0 |
| `PROHIBITED_INFRASTRUCTURE_METADATA_COUNT` | 0 |

### CI-R3A.7.1 resolution counters

| Counter | Value |
|---------|-------|
| `PRODUCTION_AUTHORITY_RESOLVED_UNKNOWN_COUNT` | 41 (U001–U041) |
| `RECOMMENDATION_ONLY_UNKNOWN_COUNT` | 1 (U042) |
| `PRODUCT_DECISION_UNKNOWN_COUNT` | 1 (U043) |
| `REMAINING_IMPLEMENTATION_BLOCKER_COUNT` | 2 (**SUPERSEDED BY CI-R3A.9.1** — was 2 at §17e delivery) |
| `CI_R3A71_PRODUCTION_AUTHORITY_CAPTURE_STATUS` | **SUCCESS** |

Prior failure token `CI_R3A7_PRODUCTION_AUTHORITY_CAPTURE_FAILED` is superseded when §17d preconditions
are met.

## 17e. CI-R3A.8 — U042/U043 decision authority package

Full decision record: **`docs/audits/ci-recovery/ci-r3a8-u042-u043-decision-package-2026-08.md`**
(analysis and decision authority only; created at branch head `03de93b9`).

### U042 — casing/replay strategy (CI-R3A.8 delivery — U042 approval claims **SUPERSEDED BY CI-R3A.8.1 §17f**)

| Field | Value |
|-------|-------|
| `U042_TARGET_MIGRATION_STATEMENT_COUNT` | 11 |
| `U042_CAMELCASE_TABLE_REFERENCE_COUNT` | 5 (`"VehicleTrip"` ×4, `"TripDrivingImpact"` ×1) |
| `U042_ENUM_REBUILD_SEQUENCE_COUNT` | 2 (`TripAssignmentStatus`, `TripAssignmentSubjectType`) |
| `U042_UNCLASSIFIED_STATEMENT_COUNT` | 0 |
| `OPTION_D_ORDER_BEFORE_FIRST_FAILURE` | YES (`20260325161141…` < `20260325161142`) |
| `OPTION_J_PRE_ORDER_BEFORE_TARGET` | YES (`20260424235959…` < `20260425000000`) |
| `OPTION_J_POST_ORDER_AFTER_TARGET` | YES (`20260425000001…` > `20260425000000`) |
| `OPTION_J_POST_ORDER_BEFORE_DOWNSTREAM` | YES (< `20260426220000` < `20260609000000`) |
| `EXISTING_MIGRATION_EDIT_COUNT` / `CHECKSUM_MUTATION_COUNT` | 0 / 0 |
| `U042_GUARD_TRUTH_TABLE_ROW_COUNT` | 17 (2 fresh-replay action + 2 applied-state no-op + 13 fail-closed) |
| `U042_UNCLASSIFIED_STATE_COUNT` / `U042_PARTIAL_MUTATION_ALLOWED_COUNT` | 0 / 0 |
| `DUMMY_TABLE_STRATEGY_ACCEPTED` | NO (dummy relation leaves the real column bound to `…_old`; `DROP TYPE` fails `2BP01`) |
| `LOWERCASE_FINAL_RELATION_COUNT` / `CAMELCASE_FINAL_RELATION_COUNT` | 2 / 0 |
| `OLD_ENUM_DEPENDENCY_REMAINDER_COUNT` / `UNRESOLVED_DEPENDENCY_EFFECT_COUNT` | 0 / 0 |
| `FINAL_SHAPE_TARGET` | ACCEPTED_CI_R3A7_JSON |
| `OPTION_B_STATUS` | REJECTED_UNSAFE |
| `END_OF_HISTORY_REPAIR_STATUS` | REJECTED_TOO_LATE |
| `DUMMY_TABLE_STATUS` | REJECTED |
| `OPTION_J_IMPLEMENTATION_COUNT` | 0 |
| `U042_TECHNICAL_RECOMMENDATION` | **OPTION_J_GUARDED_PRE_POST_CANDIDATE** |
| `U042_STATUS` | **TECHNICALLY_SPECIFIED_PENDING_INDEPENDENT_APPROVAL_AND_REPLAY** (**SUPERSEDED BY §17i**) |
| `CASING_STRATEGY_STATUS` | **CANDIDATE_NOT_IMPLEMENTED** (**SUPERSEDED BY §17i**) |
| `END_TO_END_R3B_STRATEGY_STATUS` | **BLOCKED** (**SUPERSEDED BY §17i** — current: AUTHORIZED_FOR_ISOLATED_NON_PRODUCTION_PROOF) |

Option J is a **candidate**, not safe, not accepted and not implemented. Full empty-database replay
reaching head, plus proof that the replayed shape equals the accepted CI-R3A.7.1 JSON, remains a
mandatory CI-R3B acceptance gate.

### U043 — `brake_trip_metrics` (product decision approved — §17i)

| Field | Value |
|-------|-------|
| `U043_SEARCH_HIT_COUNT` | 45 (case-insensitive, whole tree, measured at `03de93b9`) |
| `U043_UNCLASSIFIED_SEARCH_HIT_COUNT` | 0 |
| `U043_EXECUTABLE_RUNTIME_READER_COUNT` / `…_WRITER_COUNT` | 0 / 0 |
| `U043_RAW_SQL_RUNTIME_USAGE_COUNT` | 0 |
| `U043_API_UI_CONTRACT_COUNT` | 0 |
| `U043_MIGRATION_DDL_COUNT` | 0 |
| `U043_PRISMA_SCHEMA_MODEL_COUNT` / `U043_PRISMA_RELATION_ONLY_COUNT` | 2 / 1 |
| `U043_AUDIT_SCRIPT_ONLY_COUNT` / `U043_DOCUMENTATION_ONLY_COUNT` | 1 / 41 |
| `U043_LIVE_TABLE_EXISTS` / `U043_LIVE_SHAPE_CAPTURED` | YES / YES (11 columns, 2 constraints, 3 indexes) |
| `U043_CREATION_MIGRATION_EXISTS` | NO |
| `U043_CANONICAL_REPLACEMENT_PATH_EXISTS` | YES (`TripDrivingImpact` → `BrakeHealthCurrent`) |
| `U043_AUTHORITATIVE_PRODUCT_RETENTION_REQUIREMENT_COUNT` | 0 |
| `U043_TECHNICAL_RECOMMENDATION` | **DEPRECATE_AND_REMOVE** |
| `U043_PRODUCT_OWNER_DECISION` | **DEPRECATE_AND_REMOVE** |
| `U043_STATUS` | **PRODUCT_OWNER_DECISION_APPROVED** |
| `U043_PRODUCT_OWNER_APPROVAL_PRESENT` | **YES** |
| `U043_RESOLVED_COUNT` | **1** |
| `U043_REMOVAL_IMPLEMENTATION_COUNT` | **0** |
| `U043_FRESH_PREFLIGHT_REQUIRED` | YES |
| `U043_NONZERO_ROW_DROP_ALLOWED` | NO |
| `U043_APPEND_ONLY_IF_APPROVED` | YES |
| `U043_HISTORICAL_MIGRATION_EDIT_ALLOWED` | NO |
| `U043_DESTRUCTIVE_CHANGE_IMPLEMENTATION_COUNT` / `U043_DROP_TABLE_COUNT` | 0 / 0 |

Historical (**SUPERSEDED BY CI-R3A.9**): `U043_STATUS` = AWAITING_PRODUCT_OWNER_DECISION;
`U043_PRODUCT_OWNER_APPROVAL_PRESENT` = NO. Zero usage alone is **not** permission to drop without
product-owner approval — now recorded. Removal is **not** implemented in CI-R3A.9.

### CI-R3A.8 phase counters

| Counter | Value |
|---------|-------|
| `DECISION_PACKAGE_COMPLETED_COUNT` | 1 |
| `U042_RESOLVED_COUNT` / `U043_RESOLVED_COUNT` | 0 / 0 |
| `REMAINING_IMPLEMENTATION_BLOCKER_COUNT` | 2 (**SUPERSEDED BY CI-R3A.9.1** — was 2 at §17e delivery) |
| `PRODUCTION_DATABASE_ACCESS_COUNT` (this phase) | 0 |
| `NEW_MIGRATION_COUNT` / `HISTORICAL_MIGRATION_EDIT_COUNT` / `PRISMA_SCHEMA_CHANGE_COUNT` | 0 / 0 / 0 |
| `RUNTIME_CHANGE_COUNT` / `TEST_LOGIC_CHANGE_COUNT` / `WORKFLOW_CHANGE_COUNT` | 0 / 0 / 0 |
| `JSON_EVIDENCE_CHANGE_COUNT` | 0 (byte-identical) |
| `CI_R3B_IMPLEMENTATION_COUNT` / `E7_E8_E9_RUNTIME_SCOPE_COUNT` | 0 / 0 |
| `PRODUCTION_DEPLOYMENT_COUNT` | 0 |

`CI_R3A8_DECISION_PACKAGE_STATUS` = **COMPLETED** — U043 evidence valid; U042 approval claims
superseded by §17f.

## 17f. CI-R3A.8.1 — U042 transaction and recovery authority correction

Independent review rejected U042 approval from CI-R3A.8 because the prior package incorrectly treated
the pre-shim / target / post-shim workflow as one atomic unit and claimed a complete, non-overlapping
guard state space. U043 evidence was independently verified and remains unchanged in substance.

Corrected decision-package authority (same file, corrected at branch head `1dea0ad8`):

| Topic | CI-R3A.8.1 authority |
|-------|----------------------|
| Transaction scope | pre/target/post are **three separate migration boundaries**; `PRE_TARGET_POST_SINGLE_TRANSACTION` = NO; `CROSS_MIGRATION_ATOMICITY` = NO; target-file atomicity does not cover shims; no cross-migration rollback guarantee |
| Target file | 11 statements; `TARGET_MIGRATION_EXPLICIT_BEGIN_COUNT` = 0; `TARGET_MIGRATION_EXPLICIT_COMMIT_COUNT` = 0; `TARGET_FILE_ATOMICITY_AUTHORITY` = PINNED_BEHAVIOR_REQUIRES_REPLAY_CONFIRMATION (Prisma CLI 5.22.0 / engine 605197351a3c8bdd595af2d2a9bc3025bca48ea2) |
| Persistence windows | 2 documented (`U042_CROSS_MIGRATION_PERSISTENCE_WINDOW_COUNT` = 2); `U042_PARTIAL_PERSISTENCE_RISK_PRESENT` = YES; `U042_ZERO_PARTIAL_PERSISTENCE_PROVEN` = NO |
| Recovery states | R01–R04 documented (`U042_RECOVERY_STATE_ROW_COUNT` = 4; overlap 0); authority only — not executable |
| Guard model | precedence-ordered deterministic first-match evaluation order (**SUPERSEDED BY CI-R3A.8.2 §17g** for self-row and raw/effective semantics); historical CI-R3A.8.1 claim `U042_GUARD_ROW_OVERLAP_COUNT` = 0 — **SUPERSEDED BY CI-R3A.8.2**; `U042_GUARD_STATE_SPACE_STATUS` = INCOMPLETE_PENDING_EXECUTABLE_REPLAY; `U042_UNCLASSIFIED_STATE_COUNT` = NOT_PROVEN_ZERO |
| Fault injection | F01–F04 required (`U042_REQUIRED_FAULT_INJECTION_GATE_COUNT` = 4); executed 0; recovery procedures implemented 0, accepted 0 |
| U042 status | `OPTION_J_CANDIDATE_WITH_UNRESOLVED_CROSS_MIGRATION_RECOVERY`; `INDEPENDENT_REVIEW_CORRECTION_REQUIRED`; `CASING_STRATEGY_STATUS` = INSUFFICIENT_AUTHORITY; `U042_INDEPENDENT_APPROVAL_PRESENT` = NO |
| U043 status | independent evidence review **PASS**; all CI-R3A.8 counters unchanged; `AWAITING_PRODUCT_OWNER_DECISION` (**SUPERSEDED BY §17i**) |

Superseded CI-R3A.8 claims (must not appear as current authority):

- three-file Option J workflow is one transaction — **NO**
- target rollback restores the pre-shim — **NO**
- no partial state can persist (`U042_PARTIAL_MUTATION_ALLOWED_COUNT` = 0) — **SUPERSEDED**
- G01–G17 exhaustive merely because row counts sum to 17 — **SUPERSEDED**
- Option J guard authority complete — **NO** (`INCOMPLETE_PENDING_EXECUTABLE_REPLAY`)
- Option J independently accepted / U042 resolved / CI-R3B may begin — **NO**

| Counter | Value |
|---------|-------|
| `STALE_U042_ATOMIC_WORKFLOW_CLAIM_COUNT` | 0 |
| `STALE_U042_ZERO_PARTIAL_PERSISTENCE_CLAIM_COUNT` | 0 |
| `STALE_U042_COMPLETE_GUARD_AUTHORITY_CLAIM_COUNT` | 0 |
| `STALE_U042_TECHNICALLY_APPROVED_CLAIM_COUNT` | 0 |
| `STALE_U042_AUTHORITY_CLAIM_COUNT` | 0 |
| `U043_INDEPENDENT_EVIDENCE_REVIEW` | **PASS** |
| `CI_R3B_IMPLEMENTATION_COUNT` | 0 |
| `PRODUCTION_DATABASE_ACCESS_COUNT` (this phase) | 0 |
| `JSON_EVIDENCE_CHANGE_COUNT` | 0 |

`CI_R3A81_CORRECTION_STATUS` = **COMPLETED** — superseded for guard/self-row authority by §17g;
transaction/persistence/recovery content remains valid.

## 17g. CI-R3A.8.2 — Post-shim self-row and guard-semantics correction

Independent review identified two remaining U042 authority defects in CI-R3A.8.1. This phase is
documentation-only; no migration, schema, runtime, test, workflow, dependency or production change
occurred. U043 substance is unchanged.

#### Pinned Prisma execution sequence

Independently verified at engine commit **`605197351a3c8bdd595af2d2a9bc3025bca48ea2`** (CLI **5.22.0**)
in `schema-engine/core/src/commands/apply_migrations.rs` (**SUPERSEDED BY CI-R3A.8.3** — CI-R3A.8.2
incorrectly cited `schema-engine/commands/src/commands/apply_migrations.rs`, which does not exist at
this commit) and
`schema-engine/connectors/sql-schema-connector/src/sql_migration_persistence.rs`:

1. `record_migration_started` → INSERT `_prisma_migrations` row (`started_at` populated; `finished_at`
   NULL)
2. `apply_script` → execute migration SQL
3. on success: `record_successful_step` → increment `applied_steps_count`
4. on success: `record_migration_finished` → SET `finished_at`
5. on failure: `record_failed_step` → write logs; **`finished_at` is not set**

| Counter | Value |
|---------|-------|
| `PINNED_ENGINE_SOURCE_VERIFIED` | **YES** |
| `MIGRATION_ROW_CREATED_BEFORE_SCRIPT` | **YES** |
| `FINISHED_AT_NULL_DURING_SCRIPT` | **YES** |
| `FINISHED_AT_SET_AFTER_SCRIPT_SUCCESS` | **YES** |

#### Why former POST-FC01 was self-blocking

CI-R3A.8.1 rule (**SUPERSEDED BY CI-R3A.8.2**):

> POST-FC01: post-shim row present and (`finished_at` is null or `rolled_back_at` is not null) → FAIL_CLOSED

That predicate matched the post-shim's own normal active migration row during `apply_script` and
prevented POST-ACT01 and POST-NOOP01 from ever executing.

#### Corrected post-shim authority

During normal post-shim execution, exactly **one** expected current active self-row is present
(`finished_at` NULL, `rolled_back_at` NULL, `started_at` NOT NULL). This is
`EXPECTED_CURRENT_ATTEMPT`, not a failure condition. The migration SQL must not require its own row
to already be finished. Prisma's `detect_failed_migrations()` preflight (between migrations) remains
relevant for prior **unresolved** failed rows — it must not be misrepresented as an in-script
`finished_at` check on the current attempt.

| Counter | Value |
|---------|-------|
| `EXPECTED_ACTIVE_POST_SHIM_SELF_ROW_COUNT` | **1** |
| `POST_SHIM_SELF_ROW_FALSE_FAILURE_COUNT` | **0** |
| `STALE_UNRESOLVED_POST_SHIM_ATTEMPT_ALLOWED_COUNT` | **0** |

#### Three-phase post-shim model

| Phase | Name | Authority |
|-------|------|-----------|
| A | Precondition evaluation | POST-PRE-FC01–10 (history + catalog) before action SQL |
| B | Action | POST-ACT01 (fresh replay rename) or POST-NOOP01 (existing-applied no-op) — candidate only |
| C | In-script postcondition assertions | verify lowercase final state; self-row still `finished_at` NULL inside `apply_script` |

| Counter | Value |
|---------|-------|
| `POST_SHIM_PHASE_COUNT` | **3** |
| `POST_SHIM_PRECONDITION_PHASE_PRESENT` | **YES** |
| `POST_SHIM_ACTION_PHASE_PRESENT` | **YES** |
| `POST_SHIM_POSTCONDITION_PHASE_PRESENT` | **YES** |
| `POSTCONDITION_REQUIRES_SELF_FINISHED_AT_COUNT` | **0** |

POST-FC01–POST-FC07 are **not** simply rerun after the action. Distinct names: POST-PRE-FC* (history
preconditions), POST-ACT01/POST-NOOP01 (action), Phase C postcondition assertions.

#### Reachability (logical authority only — not executable replay)

| Path | Outcome |
|------|---------|
| Fresh replay | POST-ACT01 reachable (`POST_ACTION_PATH_SELF_BLOCKED` = NO) |
| Existing-applied database | POST-NOOP01 reachable (`POST_NOOP_PATH_SELF_BLOCKED` = NO) |

#### Raw vs effective guard semantics

First-match precedence makes **effective outcomes** disjoint; raw predicates may overlap.

| Counter | Value |
|---------|-------|
| `U042_RAW_GUARD_PREDICATE_OVERLAP_COUNT` | **NOT_PROVEN_ZERO** |
| `U042_EFFECTIVE_OUTCOME_OVERLAP_COUNT` | **0** |
| `U042_EFFECTIVE_OUTCOME_DEFINITION_PRESENT` | **YES** |
| `U042_FIRST_MATCH_PRECEDENCE_PRESENT` | **YES** |
| `U042_RAW_PREDICATES_CLAIMED_MUTUALLY_EXCLUSIVE` | **NO** |

Do not describe the model as "mutually exclusive raw predicates". Use **precedence-ordered
deterministic guard model**.

#### R04 correction

The expected current active post-shim self-row during normal `apply_script` is **not** R04. R04 applies
only to a genuinely failed or abandoned post-shim attempt after `apply_script` failure.

| Counter | Value |
|---------|-------|
| `EXPECTED_ACTIVE_SELF_ROW_MISCLASSIFIED_AS_R04_COUNT` | **0** |

#### Superseded CI-R3A.8.1 claims (must not appear as current authority)

- POST-FC01 treating the active self-row as FAIL_CLOSED — **SUPERSEDED BY CI-R3A.8.2**
- `U042_GUARD_ROW_OVERLAP_COUNT` = 0 as proof of non-overlapping raw predicates — **SUPERSEDED BY CI-R3A.8.2**
- "mutually exclusive raw predicates" — **NO** (`U042_RAW_PREDICATES_CLAIMED_MUTUALLY_EXCLUSIVE` = NO)
- POST-FC01–POST-FC07 rerun as post-action guards — **SUPERSEDED BY CI-R3A.8.2** (three-phase model)
- executable replay completed in this phase — **NO**
- CI-R3B may begin — **NO**

| Counter | Value |
|---------|-------|
| `STALE_POST_SHIM_SELF_ROW_FAILURE_CLAIM_COUNT` | **0** |
| `STALE_RAW_GUARD_MUTUAL_EXCLUSIVITY_CLAIM_COUNT` | **0** |
| `STALE_UNQUALIFIED_GUARD_OVERLAP_ZERO_CLAIM_COUNT` | **0** |
| `U043_INDEPENDENT_EVIDENCE_REVIEW` | **PASS** (substance unchanged at §17g phase) |
| `U043_STATUS` | **AWAITING_PRODUCT_OWNER_DECISION** (at §17g phase — **SUPERSEDED BY §17i**) |
| `U043_RESOLVED_COUNT` | **0** (at §17g phase — **SUPERSEDED BY §17i**) |
| `CI_R3B_IMPLEMENTATION_COUNT` | **0** |
| `PRODUCTION_DATABASE_ACCESS_COUNT` (this phase) | **0** |
| `JSON_EVIDENCE_CHANGE_COUNT` | **0** |

`CI_R3A82_CORRECTION_STATUS` = **COMPLETED** — superseded for source-path, guard-definition and counter
accounting by §17h; self-row and raw/effective semantics remain valid.

## 17h. CI-R3A.8.3 — Guard definition and counter integrity correction

Independent review identified three remaining U042 authority defects in CI-R3A.8.2. This phase is
documentation-only; no migration, schema, runtime, test, workflow, dependency or production change
occurred. U043 substance is unchanged.

#### Pinned Prisma source paths (corrected)

| Counter | Value |
|---------|-------|
| `PINNED_ORCHESTRATION_SOURCE_PATH` | **schema-engine/core/src/commands/apply_migrations.rs** |
| `PINNED_PERSISTENCE_SOURCE_PATH` | **schema-engine/connectors/sql-schema-connector/src/sql_migration_persistence.rs** |
| `PINNED_ORCHESTRATION_SOURCE_EXISTS` | **YES** |
| `PINNED_PERSISTENCE_SOURCE_EXISTS` | **YES** |
| `FALSE_COMMANDS_SOURCE_PATH_EXISTS` | **NO** |
| `STALE_FALSE_PRISMA_SOURCE_PATH_COUNT` | **0** |
| `FALSE_SOURCE_PATH_ALIAS_CLAIM_COUNT` | **0** |

CI-R3A.8.2 incorrectly documented `schema-engine/commands/src/commands/apply_migrations.rs` as the
authoritative orchestration file and described the core path as a user-facing alias. At pinned commit
`605197351a3c8bdd595af2d2a9bc3025bca48ea2`, only the core path exists. Execution sequence
(record_migration_started → apply_script → record_successful_step → record_migration_finished) remains
valid.

#### POST-PRE-FC05–POST-PRE-FC10 individually defined

All ten post-shim precondition guards are now defined in the decision package §3.3.1 guard table:

| Category | Rows | Count |
|----------|------|-------|
| history fail-closed | POST-PRE-FC01–04 | 4 |
| catalog fail-closed | POST-PRE-FC05–10 | 6 |
| action/no-op | POST-ACT01, POST-NOOP01 | 2 |

| Counter | Value |
|---------|-------|
| `DEFINED_POST_PRE_FC01_FC10_ROW_COUNT` | **10** |
| `UNDEFINED_POST_PRE_GUARD_ROW_REFERENCE_COUNT` | **0** |
| `MISSING_POST_PRE_GUARD_ROW_ID_COUNT` | **0** |
| `DUPLICATE_POST_PRE_GUARD_ROW_ID_COUNT` | **0** |

#### Complete 23-outcome guard accounting

| Segment | Fail-closed | Action/no-op | Outcome total |
|---------|-------------|--------------|---------------|
| pre-shim | 9 (PRE-FC01–09) | 2 (PRE-ACT01, PRE-NOOP01) | 11 |
| post-shim | 10 (POST-PRE-FC01–10) | 2 (POST-ACT01, POST-NOOP01) | 12 |
| **total** | **19** | **4** | **23** |

| Counter | Value |
|---------|-------|
| `U042_PRE_SHIM_OUTCOME_ROW_COUNT` | **11** |
| `U042_POST_SHIM_OUTCOME_ROW_COUNT` | **12** |
| `U042_FAIL_CLOSED_ROW_COUNT` | **19** |
| `U042_ACTION_NOOP_ROW_COUNT` | **4** |
| `U042_GUARD_OUTCOME_ROW_COUNT` | **23** |
| `U042_GUARD_COUNTER_ARITHMETIC_MISMATCH_COUNT` | **0** |

Historical CI-R3A.8.2 counters (**SUPERSEDED BY CI-R3A.8.3**): "20 pre-shim rows"; pre-shim
fail-closed 13; total fail-closed 23.

#### Reachability revalidated against all ten POST-PRE-FC guards

| Path | Counters |
|------|----------|
| Fresh replay → POST-ACT01 | `POST_ACT01_ALL_PRECONDITIONS_ENUMERATED` = YES; `POST_ACT01_FALSE_GUARD_COUNT` = 10; reachable |
| Existing-applied → POST-NOOP01 | `POST_NOOP01_ALL_PRECONDITIONS_ENUMERATED` = YES; `POST_NOOP01_FALSE_GUARD_COUNT` = 10; reachable |

Self-row lifecycle, three-phase post-shim model and R04 correction from §17g remain valid. No
executable replay claimed.

#### Superseded CI-R3A.8.2 claims (must not appear as current authority)

- `schema-engine/commands/src/commands/apply_migrations.rs` as authoritative path — **SUPERSEDED BY CI-R3A.8.3**
- core path described as user-facing alias — **SUPERSEDED BY CI-R3A.8.3**
- POST-PRE-FC05–10 referenced without individual definitions — **SUPERSEDED BY CI-R3A.8.3**
- `U042_GUARD_OUTCOME_ROW_COUNT` = 20 pre-shim rows — **SUPERSEDED BY CI-R3A.8.3**
- `U042_FAIL_CLOSED_ROW_COUNT` = 23 — **SUPERSEDED BY CI-R3A.8.3** (correct total = 19)

| Counter | Value |
|---------|-------|
| `STALE_PRE_SHIM_OUTCOME_COUNT_20_CLAIM_COUNT` | **0** |
| `STALE_PRE_SHIM_FAIL_CLOSED_COUNT_13_CLAIM_COUNT` | **0** |
| `STALE_TOTAL_FAIL_CLOSED_COUNT_23_CLAIM_COUNT` | **0** |
| `U043_INDEPENDENT_EVIDENCE_REVIEW` | **PASS** (substance unchanged at §17g phase) |
| `U043_STATUS` | **AWAITING_PRODUCT_OWNER_DECISION** (at §17g phase — **SUPERSEDED BY §17i**) |
| `U043_RESOLVED_COUNT` | **0** (at §17g phase — **SUPERSEDED BY §17i**) |
| `CI_R3B_IMPLEMENTATION_COUNT` | **0** |
| `PRODUCTION_DATABASE_ACCESS_COUNT` (this phase) | **0** |
| `JSON_EVIDENCE_CHANGE_COUNT` | **0** |

`CI_R3A83_CORRECTION_STATUS` = **COMPLETED** — superseded for entry authorization and U043 closure by
§17i.

## 17i. CI-R3A.9 — Final authority closure

CI-R3A.8.3 passed independent review. The product owner accepted the U043 technical recommendation.
This phase is documentation-only; no migration, schema, runtime, test, workflow, dependency,
production access or deployment occurred.

| Counter / field | Value |
|-----------------|-------|
| `CI_R3A83_INDEPENDENT_REVIEW` | **PASS** |
| `CI_R3A83_CRITICAL_FINDING_COUNT` | **0** |
| `U042_INDEPENDENT_REVIEW_STATUS` | **PASS_FOR_CONTROLLED_CI_R3B_PROOF** |
| `U042_CONTROLLED_CI_R3B_ENTRY_AUTHORIZED` | **YES** |
| `U042_FINAL_TECHNICAL_ACCEPTANCE` | **NO** |
| `U042_REPLAY_PROVEN` / `U042_RECOVERY_PROVEN` | **NO** / **NO** |
| `U042_PRODUCTION_AUTHORIZED` / `U042_PRODUCTION_DEPLOYMENT_AUTHORIZED` | **NO** / **NO** |
| `END_TO_END_R3B_STRATEGY_STATUS` | **AUTHORIZED_FOR_ISOLATED_NON_PRODUCTION_PROOF** |
| `U043_PRODUCT_OWNER_DECISION` | **DEPRECATE_AND_REMOVE** |
| `U043_PRODUCT_OWNER_APPROVAL_PRESENT` | **YES** |
| `U043_STATUS` | **PRODUCT_OWNER_DECISION_APPROVED** |
| `U043_INDEPENDENT_EVIDENCE_REVIEW` | **PASS** |
| `U043_TECHNICAL_RECOMMENDATION` | **DEPRECATE_AND_REMOVE** |
| `U043_RESOLVED_COUNT` | **1** |
| `U043_REMOVAL_IMPLEMENTATION_COUNT` | **0** |
| `CI_R3A_AUTHORITY_STATUS` | **CI_R3A_AUTHORITY_COMPLETED** |
| `CI_R3B_ENTRY_STATUS` | **AUTHORIZED_AFTER_CI_R3A_REVIEW_AND_MERGE** |
| `CI_R3B_START_BLOCKER_COUNT` | **0** |
| `R3B_ACCEPTANCE_GATE_TOTAL_COUNT` | **7** |
| `R3B_ACCEPTANCE_GATE_PASSED_COUNT` | **1** |
| `R3B_ACCEPTANCE_GATE_PENDING_COUNT` | **6** |
| `R3B_FINAL_ACCEPTANCE` / `R3B_MERGE_AUTHORIZED` / `R3B_DEPLOYMENT_AUTHORIZED` | **NO** / **NO** / **NO** |
| `R3B_PRODUCTION_AUTHORIZED` | **NO** |
| `CI_R3B_IMPLEMENTATION_COUNT` | **0** |
| `CIRCULAR_R3B_START_GATE_STATEMENT_COUNT` | **0** |
| `PRODUCTION_DATABASE_ACCESS_COUNT` (this phase) | **0** |
| `JSON_EVIDENCE_CHANGE_COUNT` | **0** |

Clarifications:

- CI-R3A authority is complete.
- PR #1029 must pass independent review and be merged before controlled CI-R3B work begins.
- CI-R3B starts afterward on a dedicated branch from updated `main`.
- Option J is authorized only for controlled CI-R3B implementation and proof in isolated
  non-production environments — not finally accepted, not production-authorized.
- CI-R3B must not be accepted, merged or deployed until acceptance gates 2–7 pass.
- `brake_trip_metrics` removal is product-owner approved but **not** implemented here.

Superseded current-authority claims (**SUPERSEDED BY CI-R3A.9**):

- U043 awaiting product-owner decision — **NO**
- U043 has no product-owner approval — **NO**
- U042 entirely blocked from controlled implementation — **NO**
- executable replay must pass before implementation may begin — **NO** (circular start gate removed)
- Option J already finally accepted or safe — **NO**
- CI-R3B already implemented — **NO**
- production execution authorized — **NO**

| Counter | Value |
|---------|-------|
| `STALE_U043_AWAITING_DECISION_CLAIM_COUNT` | **0** |
| `STALE_U043_NO_APPROVAL_CLAIM_COUNT` | **0** |
| `STALE_U042_FULL_ENTRY_BLOCK_CLAIM_COUNT` | **0** |
| `FALSE_OPTION_J_FINAL_ACCEPTANCE_CLAIM_COUNT` | **0** |
| `FALSE_CI_R3B_IMPLEMENTED_CLAIM_COUNT` | **0** |
| `FALSE_PRODUCTION_AUTHORIZATION_CLAIM_COUNT` | **0** |

`CI_R3A9_AUTHORITY_STATUS` = **COMPLETED** — superseded for inventory/blocker consistency by §17j.

## 17j. CI-R3A.9.1 — Final authority consistency cleanup

Independent review of CI-R3A.9 found three current-authority inconsistencies. This phase corrects them
only; no migration, schema, runtime, test, workflow, dependency, production access or deployment
occurred.

| Correction | Authority |
|------------|-----------|
| U043 disposition | `brake_trip_metrics` reclassified from ORPHAN_REVIEW_REQUIRED to **PRODUCT_APPROVED_REMOVAL** in §4 matrix and §11 contract; present in production until separately controlled removal (**the derived bootstrap exclusion is SUPERSEDED BY CI-R3B.0 §17k** — executable disposition is now TRANSITIONAL_BOOTSTRAP_REQUIRED; the product disposition is unchanged) |
| Blocker vs acceptance | `REMAINING_IMPLEMENTATION_BLOCKER_COUNT` = 0; `R3B_FINAL_ACCEPTANCE_BLOCKER_GROUP_COUNT` = 1; gates 2–7 block final acceptance only |
| Historical Option J | decision-package §5 Option-J “not independently approved” explicitly **HISTORICAL — SUPERSEDED BY CI-R3A.9** |

| Counter | Value |
|---------|-------|
| `PRODUCT_APPROVED_REMOVAL_OBJECT_COUNT` | **1** |
| `ORPHAN_REVIEW_REQUIRED_COUNT` | **0** |
| `U043_PENDING_OBJECT_COUNT` | **0** |
| `U043_REMOVAL_IMPLEMENTATION_COUNT` | **0** |
| `U043_PRODUCT_OWNER_DECISION` | **DEPRECATE_AND_REMOVE** |
| `U043_RESOLVED_COUNT` | **1** |
| `REMAINING_IMPLEMENTATION_BLOCKER_COUNT` | **0** |
| `R3B_FINAL_ACCEPTANCE_BLOCKER_GROUP_COUNT` | **1** |
| `R3B_ACCEPTANCE_GATE_TOTAL_COUNT` | **7** |
| `R3B_ACCEPTANCE_GATE_PASSED_COUNT` | **1** |
| `R3B_ACCEPTANCE_GATE_PENDING_COUNT` | **6** |
| `U042_ENTRY_AUTHORITY_RESOLVED_COUNT` | **1** |
| `U042_FINAL_ACCEPTANCE_RESOLVED_COUNT` | **0** |
| `U042_CONTROLLED_CI_R3B_ENTRY_AUTHORIZED` | **YES** |
| `U042_FINAL_TECHNICAL_ACCEPTANCE` | **NO** |
| `U042_PRODUCTION_AUTHORIZED` | **NO** |
| `CI_R3A_AUTHORITY_STATUS` | **CI_R3A_AUTHORITY_COMPLETED** |
| `CI_R3B_ENTRY_STATUS` | **AUTHORIZED_AFTER_CI_R3A_REVIEW_AND_MERGE** |
| `CI_R3B_START_BLOCKER_COUNT` | **0** |
| `R3B_FINAL_ACCEPTANCE` / `R3B_MERGE_AUTHORIZED` / `R3B_DEPLOYMENT_AUTHORIZED` | **NO** / **NO** / **NO** |
| `CI_R3B_IMPLEMENTATION_COUNT` | **0** |
| `STALE_ORPHAN_PENDING_U043_CLAIM_COUNT` | **0** |
| `STALE_ORPHAN_REVIEW_REQUIRED_CURRENT_AUTHORITY_COUNT` | **0** |
| `MISCLASSIFIED_R3B_ACCEPTANCE_AS_IMPLEMENTATION_BLOCKER_COUNT` | **0** |
| `UNQUALIFIED_OPTION_J_NOT_INDEPENDENTLY_APPROVED_CLAIM_COUNT` | **0** |
| `STALE_CURRENT_AUTHORITY_COUNT` | **0** |
| `JSON_EVIDENCE_CHANGE_COUNT` | **0** |

`CI_R3A91_CORRECTION_STATUS` = **COMPLETED** — current-authority inventory, blocker classification
and historical Option-J wording aligned; superseded for CI-R3B bootstrap inventory by §17k.

## 17k. CI-R3B.0 — Executable Contract Reconciliation

This section supersedes **only** the earlier CI-R3B bootstrap **exclusion** of `brake_trip_metrics`
(and the derived 18-object bootstrap accounting). It does **not** rewrite historical evidence and does
**not** reverse the U043 product decision. Full contract:
`docs/audits/ci-recovery/ci-r3b-executable-contract-2026-08.md`.

CI-R3B.0 is documentation and authority reconciliation only: no migration file, Prisma schema,
runtime, test, workflow or dependency change; no production access; no deployment; E7/E8/E9 not
started.

### Proven contradiction (repository evidence at `main @ 1948f00d`)

| ID | Proposition | Evidence | Result |
|----|-------------|----------|--------|
| A | `brake_trip_metrics` present in accepted production evidence | `ci-r3a7-production-catalog-evidence-2026-08.json` `tables[]` → `present = true`, 11 cols / 2 constraints / 3 indexes | YES |
| B | model still owned by the repository schema | `schema.prisma` line 9025 `model BrakeTripMetric`, line 9042 `@@map("brake_trip_metrics")`, line 2940 `Vehicle.brakeTripMetrics` | YES |
| C | no committed migration creates it | 0 hits for `brake_trip_metrics`/`BrakeTripMetric` across `backend/prisma/migrations/**` | 0 |
| D | U043 product decision | `DEPRECATE_AND_REMOVE`, approved, **not** implemented (§17i/§17j) | approved |
| E | accepted bootstrap excluded it | §11 previously recorded `PROVISIONAL_BOOTSTRAP_OBJECT_COUNT` = 18 | YES |
| F | exact fresh-replay parity required | decision package §5a gate 5 + §4 D7 (`FINAL_SHAPE_TARGET` = ACCEPTED_CI_R3A7_JSON) | YES |

| Counter | Value |
|---------|-------|
| `BRAKE_TRIP_METRICS_IN_PRODUCTION_EVIDENCE` | **YES** |
| `BRAKE_TRIP_METRICS_IN_SCHEMA_PRISMA` | **YES** |
| `BRAKE_TRIP_METRICS_CREATE_MIGRATION_COUNT` | **0** |
| `BRAKE_TRIP_METRICS_EXCLUDED_FROM_ACCEPTED_BOOTSTRAP` | **YES** (superseded by this section) |
| `R3B_EXACT_PARITY_REQUIRED` | **YES** |
| `EXECUTABLE_CONTRACT_CONTRADICTION_CONFIRMED` | **YES** |

Gate 5 could not pass while the only authorized creator of the table omitted it. Product approval to
remove is not removal.

### Locked transitional authority

`R3B_TRANSITIONAL_BRAKE_TRIP_METRICS_STRATEGY` = **BOOTSTRAP_UNTIL_SEPARATE_REMOVAL**

| Field | Value |
|-------|-------|
| U043 product disposition | **DEPRECATE_AND_REMOVE** (still approved, unchanged) |
| current executable disposition | **TRANSITIONAL_BOOTSTRAP_REQUIRED** |
| removal implemented | **NO** |
| production drop authorized | **NO** |
| separate removal phase required | **YES** |
| Prisma model / back-relation removal in CI-R3B | **NO** |
| exact R3B parity exception count | **0** |

`brake_trip_metrics` is included in the CI-R3B bootstrap **only until** the separately scoped removal
phase, which must update schema ownership and perform a fresh authorized production preflight
(decision package §9 gates). CI-R3B is not authorized to drop it from production.

### Reconciled bootstrap accounting

| Counter | Value |
|---------|-------|
| `BOOTSTRAP_REPLAY_REQUIRED_COUNT` | **11** |
| `BOOTSTRAP_EVENTUAL_REPLAY_REQUIRED_COUNT` | **2** |
| `SCHEMA_PARITY_ONLY_COUNT` | **6** |
| `R3B_TRANSITIONAL_BOOTSTRAP_OBJECT_COUNT` | **19** |
| `R3B_BOOTSTRAP_OMITTED_OBJECT_COUNT` | **0** |
| `R3B_FINAL_PARITY_EXCEPTION_COUNT` | **0** |
| `PRODUCT_APPROVED_REMOVAL_COUNT` | **1** (product-disposition axis; earlier name `PRODUCT_APPROVED_REMOVAL_OBJECT_COUNT`, same object, same value) |
| `PRODUCT_REMOVAL_IMPLEMENTED_COUNT` | **0** |
| `PRODUCTION_DROP_AUTHORIZED` | **NO** |
| `R3B_PLANNED_NEW_MIGRATION_COUNT` | **3** (bootstrap, pre-shim, post-shim — none created) |
| `NEW_MIGRATION_COUNT` (this phase) | **0** |
| `R3B_ACCEPTANCE_GATE_TOTAL_COUNT` / `…_PASSED_COUNT` / `…_PENDING_COUNT` | **7** / **1** / **6** |
| `R3B_FINAL_ACCEPTANCE` / `R3B_MERGE_AUTHORIZED` / `R3B_DEPLOYMENT_AUTHORIZED` | **NO** / **NO** / **NO** |
| `CI_R3B_IMPLEMENTATION_COUNT` | **0** |
| `PRODUCTION_DATABASE_ACCESS_COUNT` (this phase) | **0** |
| `JSON_EVIDENCE_CHANGE_COUNT` | **0** |

Arithmetic: 11 + 2 + 6 = 19 = `KNOWN_MISSING_SCHEMA_OBJECT_COUNT`. The three bootstrap classes
partition the executable inventory; `PRODUCT_APPROVED_REMOVAL` is a disposition label on a separate
axis and no longer subtracts objects from the bootstrap.

### Superseded current-authority claims (**SUPERSEDED BY CI-R3B.0**)

- executable CI-R3B bootstrap contains exactly 18 objects — **NO** (19)
- `BOOTSTRAP_REPLAY_REQUIRED_COUNT` = 10 — **NO** (11)
- `brake_trip_metrics` must be absent from a fresh replay — **NO** (it must be created)
- `PRODUCT_APPROVED_REMOVAL` as a bootstrap-exclusion partition class — **NO** (disposition axis)
- U043 removal already implemented — **NO**
- exact parity can pass while the table is excluded — **NO**
- CI-R3B may drop the production table — **NO**
- CI-R3B already implemented or accepted — **NO**

| Counter | Value |
|---------|-------|
| `STALE_R3B_BOOTSTRAP_18_CURRENT_CLAIM_COUNT` | **0** |
| `FALSE_U043_REMOVAL_IMPLEMENTED_CLAIM_COUNT` | **0** |
| `FALSE_R3B_PRODUCTION_DROP_AUTHORITY_CLAIM_COUNT` | **0** |
| `FALSE_U043_REVERSAL_CLAIM_COUNT` | **0** |
| `R3B_PARITY_CONTRADICTION_COUNT` | **0** |
| `FALSE_CI_R3B_IMPLEMENTED_CLAIM_COUNT` | **0** |
| `STALE_CURRENT_AUTHORITY_COUNT` | **0** |

`CI_R3B0_CONTRACT_LOCK_STATUS` = **COMPLETED** — bootstrap/parity contract locked; CI-R3B.1
implementation awaits independent review.

## 17l. CI-R3B.0.1 — Bootstrap predecessor-shape authority correction (**SUPERSEDED BY CI-R3B.0.2 §17m**)

Independent review of CI-R3B.0 identified a **second executable contradiction**: the contract
required the Option-D bootstrap to create all 19 objects at **final accepted production shape**, but
committed downstream migrations contain **unguarded** DDL that would duplicate objects if the bootstrap
pre-created them (minimum proven: 17 column overlaps, 2 index overlaps, 2 late-type dependencies —
see predecessor ledger §2).

CI-R3B.0.1 is documentation-only: no migration, schema, runtime, test, workflow, dependency,
production access or deployment change; `CI_R3B_IMPLEMENTATION_COUNT` remains **0**; E7/E8/E9 not
started.

### Two-shape model (current authority)

| Field | Value |
|-------|-------|
| `BOOTSTRAP_SHAPE_AUTHORITY` | **PREDECESSOR_AT_INSERTION_POINT** — `ci-r3b-bootstrap-predecessor-shape-ledger-2026-08.md` |
| `FINAL_SHAPE_AUTHORITY` | **ACCEPTED_CI_R3A71_PRODUCTION_JSON** — post-replay only |
| `BOOTSTRAP_PREDECESSOR_EQUALS_FINAL_FOR_ALL_OBJECTS` | **NO** |
| `FULL_REPLAY_MUST_PRODUCE_FINAL_ACCEPTED_SHAPE` | **YES** |
| `EARLY_BOOTSTRAP_FINAL_SHAPE_EXECUTABLE` | **NO** |
| `BOOTSTRAP_OBJECT_LEDGER_ROW_COUNT` | **19** |
| `BOOTSTRAP_PREDECESSOR_SHAPE_UNKNOWN_COUNT` | **0** |
| `IMPLEMENTATION_CRITICAL_UNKNOWN_COUNT` | **0** |
| `FINAL_PARITY_EXCEPTION_COUNT` | **0** |

The bootstrap creates all 19 objects at exact **predecessor shape**; downstream migrations evolve them;
full replay must equal the accepted production catalog. `brake_trip_metrics` remains
**TRANSITIONAL_BOOTSTRAP_REQUIRED** with U043 **DEPRECATE_AND_REMOVE** unchanged and unimplemented.

Historical (**SUPERSEDED BY CI-R3B.0.1**): “create all 19 at accepted/final shape at bootstrap”.

| Counter | Value |
|---------|-------|
| `STALE_BOOTSTRAP_FINAL_SHAPE_AUTHORITY_CLAIM_COUNT` | **0** |
| `CURRENT_ALL_19_ACCEPTED_SHAPE_CLAIM_COUNT` | **0** |
| `JSON_EVIDENCE_CHANGE_COUNT` | **0** |

`CI_R3B01_PREDECESSOR_SHAPE_CORRECTION_STATUS` = **COMPLETED** — superseded by §17m for SQL-ready authority.

## 17m. CI-R3B.0.2 — Complete replay-safe predecessor and final-parity authority

Independent review of CI-R3B.0.1 proved the predecessor ledger was still non-executable:

1. `driving_events` referenced future type `DrivingEventTripAssignment` at bootstrap.
2. Predecessor indexes referenced columns deliberately omitted (for example `organization_id`).
3. 53 predecessor index entries had empty `btree ()` column lists.
4. Downstream DDL matrix was incomplete (missing DROP TYPE and CREATE UNIQUE INDEX rows).
5. Committed replay leaves `vehicle_trips.trip_status` DEFAULT `'COMPLETED'` while accepted JSON requires `'ONGOING'`.

CI-R3B.0.2 is documentation-only. Corrected authority:

| Field | Value |
|-------|-------|
| `BOOTSTRAP_SHAPE_AUTHORITY` | **MINIMAL_REPLAY_PREDECESSOR_SHAPE** |
| `FINAL_SHAPE_AUTHORITY` | accepted JSON + **post-replay reconciliation** |
| `BOOTSTRAP_TABLE_OBJECT_COUNT` / `BOOTSTRAP_ENUM_OBJECT_COUNT` | **9** / **10** |
| `R3B_PLANNED_NEW_MIGRATION_COUNT` | **4** (includes `20260814130000_ci_r3b_post_replay_parity_reconciliation`) |
| `POST_REPLAY_RECONCILIATION_REQUIRED` | **YES** |
| `FINAL_REPLAY_DEFAULT_MISMATCH_COUNT_AFTER_COMMITTED_HISTORY` | **1** (`trip_status`) |
| `IMPLEMENTATION_CRITICAL_UNKNOWN_COUNT` | **0** |

Full ledger: `docs/audits/ci-recovery/ci-r3b-bootstrap-predecessor-shape-ledger-2026-08.md` (§3 matrix, §4 predecessor, §5 convergence).

`CI_R3B02_REPLAY_AUTHORITY_STATUS` = **COMPLETED** — superseded by §17n for final-convergence completion.

## 17n. CI-R3B.0.2.1 — 19-object final-convergence ledger completion

Independent review of CI-R3B.0.2 found:

1. declared `FINAL_CONVERGENCE_LEDGER_OBJECT_COUNT` = 19 but only 11 object rows present;
2. eight table convergence rows missing;
3. Assignment enums used ambiguous `5/3 bootstrap` notation;
4. zero mismatch/unknown counters not sufficiently proven.

CI-R3B.0.2.1 is documentation-only. Corrected authority:

| Field | Value |
|-------|-------|
| `FINAL_CONVERGENCE_LEDGER_OBJECT_COUNT` | **19** (§5.1 physical rows) |
| `FINAL_CONVERGENCE_TABLE_ROW_COUNT` / `FINAL_CONVERGENCE_ENUM_ROW_COUNT` | **9** / **10** |
| `FINAL_CONVERGENCE_TABLE_PROPERTY_CATEGORY_COUNT` | **54** |
| `TripAssignmentStatus` bootstrap label count | **5** |
| `TripAssignmentSubjectType` bootstrap label count | **3** |
| `FINAL_REPLAY_DEFAULT_MISMATCH_COUNT_AFTER_COMMITTED_HISTORY` | **1** |
| `FINAL_REPLAY_*_MISMATCH_COUNT_AFTER_AUTHORIZED_RECONCILIATION` | all **0** |
| `FULL_REPLAY_FINAL_SHAPE_PROVEN_BY_AUTHORITY` | **YES** |
| `STALE_FINAL_CONVERGENCE_19_OBJECT_CLAIM_COUNT` | **0** |
| `STALE_AMBIGUOUS_ASSIGNMENT_ENUM_COUNT_CLAIM` | **0** |
| `MIRRORED_AUTHORITY_MISMATCH_COUNT` | **0** |

Full ledger: `docs/audits/ci-recovery/ci-r3b-bootstrap-predecessor-shape-ledger-2026-08.md` (§5).

`CI_R3B021_FINAL_CONVERGENCE_STATUS` = **COMPLETED** — CI-R3B.1 awaits independent review.

## 18. Final audit status

Introduction commits, schema positions, full initial/current shapes, per-model evolution,
CREATE-vs-evolution DDL separation, the 55-file classified universe, a mechanically-validated
43-row atomic unknown ledger, and **redacted production live-database authority capture (§17d +
`ci-r3a7-production-catalog-evidence-2026-08.json`)** are complete and internally consistent. Option
**D** is a SAFE_CANDIDATE for the base-gap and is **production-authorized** against captured lowercase
shapes; casing repair remains an Option J **candidate** authorized for controlled non-production CI-R3B
proof only (`INSUFFICIENT_AUTHORITY` for final acceptance — U042, §17i); `brake_trip_metrics`
product-owner decision **DEPRECATE_AND_REMOVE** recorded (U043, §17i); its executable disposition is
**TRANSITIONAL_BOOTSTRAP_REQUIRED** (§17k); removal not implemented.

**Status: CI_R3B021_FINAL_CONVERGENCE_COMPLETED** — repository audit authority complete; minimal replay
predecessor ledger, complete 19-object final-convergence ledger (§17n), and post-replay reconciliation
authority locked; U043 approved and unimplemented; CI-R3B.1 not started; E7/E8/E9 unstarted.

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

Provenance of the current adds (see §4a for the full commit table): assignment/source/repair fields,
aggregate counters, readiness/status fields, `repairs` relation and the assignment/source indexes →
`17019787`; `[vehicleId, startTime]` → `df1b5a6e`; `misuseCases` → `c8fcccad`;
`rpmWebhookCandidates` → `90d43466`; `booking_customer_id`/`assigned_driver_id`/`actual_driver_id`
→ `d4c7ac17` (schema) materialised as SQL in `20260716310000`; `trip_analysis_status`, the
`analysis_*` fields and the `[tripAnalysisStatus]` index → `c07f06b0` (the three readiness fields
`quality_status`/`behavior_summary_status`/`driving_impact_status` are attributed exclusively to
`17019787`, above); DI-v2 relations → `b89cb302`/`3dce7ed4`/`3b9012e6`/`02c6e76d`;
`driverAttributions` →
`32dc81a0`; tire-usage fields/relation → `d58d6c68`/`850e2306`; `batteryMeasurementSessions` →
`a7944b33`; braking relations → `af2fb811`/`b0f68346`. `VEHICLE_TRIP_INITIAL_SHAPE_OMISSION_COUNT`
= 0; `VEHICLE_TRIP_CURRENT_SHAPE_OMISSION_COUNT` = 0.

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
