# CI-R3B — Executable migration contract (CI-R3B.0–CI-R3B.0.2)

**Phase:** CI-R3B.0 contract lock; CI-R3B.0.1 predecessor correction; **CI-R3B.0.2** replay-safe SQL-ready authority
**Branch:** `fix/ci-r3b-vehicle-trips-migration-replay-2026-08`
**Scope:** documentation and authority reconciliation only
**Minimal predecessor ledger:** `docs/audits/ci-recovery/ci-r3b-bootstrap-predecessor-shape-ledger-2026-08.md`

> **No migration file, Prisma schema, runtime, test, workflow or dependency was created or changed in
> CI-R3B.0. No production access. No deployment. E7/E8/E9 not started.**
> `NEW_MIGRATION_COUNT` = 0; `MIGRATION_CHANGE_COUNT` = 0; `SCHEMA_CHANGE_COUNT` = 0;
> `RUNTIME_CHANGE_COUNT` = 0; `TEST_LOGIC_CHANGE_COUNT` = 0; `WORKFLOW_CHANGE_COUNT` = 0;
> `DEPENDENCY_CHANGE_COUNT` = 0; `LOCKFILE_CHANGE_COUNT` = 0;
> `PRODUCTION_DATABASE_ACCESS_COUNT` = 0; `PRODUCTION_DEPLOYMENT_COUNT` = 0;
> `E7_E8_E9_RUNTIME_SCOPE_COUNT` = 0.

This document resolves the last executable contradiction blocking CI-R3B.1 implementation: the
accepted CI-R3A authority excluded `brake_trip_metrics` from the Option-D bootstrap while
simultaneously requiring a fresh replay whose schema is **exactly** the accepted production shape,
which contains that table. CI-R3B.0 locks the transitional resolution so that the CI-R3B.1
implementation and its schema-parity gate are mechanically unambiguous.

---

## 1. Accepted baseline

| Field | Value |
|-------|-------|
| `ACCEPTED_MAIN_SHA` | `1948f00d8423816beb5a76c2182f9c9bc6260857` |
| `ACCEPTED_MAIN_SUBJECT` | `CI Recovery R3A – Vehicle Trip migration authority audit (#1029)` |
| `ACCEPTED_MAIN_PARENT_SHA` | `5015a17d250f0c2823580a1ff567f580dcac51aa` (CI-R2 merged) |
| `CI_R3A_PR_NUMBER` | **1029** |
| `CI_R3A_PR_STATE` | **MERGED** |
| `CI_R3A_PR_MERGED_AT` | `2026-08-14T10:30:44Z` |
| `CI_R3A_PR_MERGE_COMMIT` | `1948f00d8423816beb5a76c2182f9c9bc6260857` |
| `CI_R3A_PR_BASE_REF` | `main` |
| `CI_R3A_PR_HEAD_REF` | `fix/ci-r3a-vehicle-trips-migration-authority-audit-2026-08` |
| `CI_R3B0_BRANCH` | `fix/ci-r3b-vehicle-trips-migration-replay-2026-08` |
| `CI_R3B0_BRANCH_BASE_SHA` | `1948f00d8423816beb5a76c2182f9c9bc6260857` |

CI-R3A entry authority: `CI_R3A_AUTHORITY_STATUS` = **CI_R3A_AUTHORITY_COMPLETED**;
`CI_R3B_ENTRY_STATUS` = **AUTHORIZED_AFTER_CI_R3A_REVIEW_AND_MERGE**; `CI_R3B_START_BLOCKER_COUNT` = 0
(master audit §17i / §17j). PR #1029 is merged, so controlled CI-R3B work is authorized.

### 1a. Accepted authority file hashes (SHA-256 at `1948f00d`)

| File | SHA-256 |
|------|---------|
| `docs/audits/ci-recovery/ci-r3a7-production-catalog-evidence-2026-08.json` | `81dcdcc4456a12818491b0edd565a142926b7f4f58f977fe73571290d61290c0` |
| `docs/audits/ci-recovery/ci-r3a-vehicle-trips-migration-authority-audit-2026-08.md` | `29067976c93720d02b33a8e385925e133f4e68a5219efc79e55836c1568ad263` |
| `docs/audits/ci-recovery/ci-r3a8-u042-u043-decision-package-2026-08.md` | `f91d0de5c9bd393f6f963616f2c4e12c4fbe7167a589913dd49fa61c45a36b11` |

The JSON evidence artifact is **immutable** for CI-R3B: `JSON_EVIDENCE_CHANGE_COUNT` = 0;
`JSON_EVIDENCE_HASH_MATCH` = YES (recorded before and after this phase). The two markdown authority
files are updated by CI-R3B.0 (§7) and therefore change hash by design; the hashes above pin the
reviewed baseline they were updated from.

### 1b. Pinned engine authority

| Field | Value |
|-------|-------|
| `PINNED_PRISMA_CLI_VERSION` | **5.22.0** (`backend/package-lock.json` → `node_modules/prisma`) |
| `PINNED_PRISMA_CLIENT_VERSION` | **5.22.0** |
| `PINNED_PRISMA_ENGINE_COMMIT` | **605197351a3c8bdd595af2d2a9bc3025bca48ea2** (`@prisma/engines-version` = `5.22.0-44.605197351a3c8bdd595af2d2a9bc3025bca48ea2`) |
| `PINNED_ORCHESTRATION_SOURCE_PATH` | `schema-engine/core/src/commands/apply_migrations.rs` |
| `PINNED_PERSISTENCE_SOURCE_PATH` | `schema-engine/connectors/sql-schema-connector/src/sql_migration_persistence.rs` |

Committed migration count at baseline: **283** migration directories + `migration_lock.toml`
(284 entries under `backend/prisma/migrations`).

### 1c. Accepted production catalog totals (parity target)

| Counter | Value |
|---------|-------|
| `LIVE_TABLE_EVIDENCE_COUNT` | 9 |
| `LIVE_COLUMN_EVIDENCE_ROW_COUNT` | 288 |
| `LIVE_CONSTRAINT_EVIDENCE_ROW_COUNT` | 21 |
| `LIVE_INDEX_EVIDENCE_ROW_COUNT` | 58 |
| `LIVE_ENUM_TYPE_EVIDENCE_COUNT` | 10 |
| `LIVE_ENUM_VALUE_EVIDENCE_ROW_COUNT` | 44 |
| `PUBLIC_UPPERCASE_RELATION_COUNT` | 0 (both affected relations lowercase; camelCase ghosts absent) |
| `LIVE_REPO_*_DIFF_COUNT` (column/type/nullability/default/constraint/index/unclassified) | 0 each |

---

## 2. Proven executable-contract contradiction

All six propositions were verified mechanically against the files at `1948f00d`, not against prior
summaries.

| ID | Proposition | Evidence | Result |
|----|-------------|----------|--------|
| A | `brake_trip_metrics` exists in accepted production-catalog evidence | `ci-r3a7-production-catalog-evidence-2026-08.json` → `tables[8]` `name = brake_trip_metrics`, `present = true`, 11 columns / 2 constraints / 3 indexes | **YES** |
| B | `BrakeTripMetric` / `brake_trip_metrics` is still represented in `backend/prisma/schema.prisma` | line 9025 `model BrakeTripMetric {`; line 9042 `@@map("brake_trip_metrics")`; line 2940 `brakeTripMetrics BrakeTripMetric[]` back-relation on `Vehicle` | **YES** |
| C | No committed historical migration creates the complete table | case-insensitive search for `brake_trip_metrics` / `BrakeTripMetric` over `backend/prisma/migrations/**` returns **0** hits of any kind; `CREATE TABLE … brake_trip_metrics` matches = 0 | **0 create migrations** |
| D | U043 records the approved product decision | master audit §17i / §17j and decision package §8a / §12c: `U043_PRODUCT_OWNER_DECISION` = **DEPRECATE_AND_REMOVE**; `U043_STATUS` = PRODUCT_OWNER_DECISION_APPROVED; `U043_REMOVAL_IMPLEMENTATION_COUNT` = 0 | **DEPRECATE_AND_REMOVE** |
| E | The accepted Option-D bootstrap inventory excludes the table (state **before** this lock) | master audit §11: `PROVISIONAL_BOOTSTRAP_OBJECT_COUNT` = **18** of 19, "excludes `brake_trip_metrics`"; decision package §8 repeats "18 of 19" | **YES / 18** — superseded by §4a |
| F | CI-R3B acceptance also requires fresh-replay parity with the accepted CI-R3A.7.1 shape | decision package §5a gate 5 ("proof that the replayed schema equals the accepted CI-R3A.7.1 shape") and §4 D7 (`FINAL_SHAPE_TARGET` = ACCEPTED_CI_R3A7_JSON) | **YES** |

| Counter | Value |
|---------|-------|
| `BRAKE_TRIP_METRICS_IN_PRODUCTION_EVIDENCE` | **YES** |
| `BRAKE_TRIP_METRICS_IN_SCHEMA_PRISMA` | **YES** |
| `BRAKE_TRIP_METRICS_CREATE_MIGRATION_COUNT` | **0** |
| `BRAKE_TRIP_METRICS_MIGRATION_REFERENCE_COUNT` | **0** |
| `BRAKE_TRIP_METRICS_EXCLUDED_FROM_ACCEPTED_BOOTSTRAP` | **YES** |
| `R3B_EXACT_PARITY_REQUIRED` | **YES** |
| `EXECUTABLE_CONTRACT_CONTRADICTION_CONFIRMED` | **YES** |

### 2a. Why this is a contradiction

1. Gate 5 requires the fresh-replay schema to equal the accepted production shape, which contains
   `brake_trip_metrics` with 11 columns, 2 constraints and 3 indexes.
2. No committed migration creates that table, so a fresh replay can only obtain it from the new
   CI-R3B bootstrap.
3. The accepted bootstrap inventory deliberately excluded it (18 of 19).
4. `schema.prisma` still owns the model, so Prisma's own drift view of a fresh replay database would
   also report the table as missing.

Therefore, as written, the accepted contract could not be satisfied: gate 5 would fail on every
fresh replay regardless of Option-D/Option-J correctness. The exclusion was a *product-disposition*
decision (removal approved) applied to an *executable-parity* inventory, which is a category error —
approval to remove is not the same as removal having been implemented.

---

## 3. Transitional `brake_trip_metrics` authority

`R3B_TRANSITIONAL_BRAKE_TRIP_METRICS_STRATEGY` = **BOOTSTRAP_UNTIL_SEPARATE_REMOVAL**

| Field | Value |
|-------|-------|
| product disposition | **DEPRECATE_AND_REMOVE** (unchanged, still approved) |
| current executable disposition | **TRANSITIONAL_BOOTSTRAP_REQUIRED** |
| removal implemented | **NO** |
| production drop authorized | **NO** |
| separate removal phase required | **YES** |
| exact R3B parity exception count | **0** |
| Prisma schema ownership | still owned by `model BrakeTripMetric` + `Vehicle.brakeTripMetrics` |

Binding rules:

- The U043 product decision remains **approved**. This section does **not** reverse, cancel or weaken
  it.
- Product approval alone does **not** mean removal has been implemented
  (`PRODUCT_REMOVAL_IMPLEMENTED_COUNT` = 0).
- Because the current Prisma schema still owns the model and CI-R3B must preserve exact fresh-replay
  parity with the accepted schema and production catalog, the CI-R3B bootstrap **must temporarily
  create** `brake_trip_metrics` at its **bootstrap predecessor shape**. For this object alone,
  predecessor shape **equals** the accepted final shape (no downstream migration creates or evolves
  it); see the predecessor ledger `U-BT-009`.
- CI-R3B must **not** drop the production table (`PRODUCTION_DROP_AUTHORIZED` = NO).
- CI-R3B must **not** remove the Prisma model or its back-relation.
- Removal must occur in a **separate, explicitly scoped change** that updates schema ownership,
  performs a fresh authorized production preflight, and satisfies the ten U043 safety gates in the
  decision package §9.
- The transitional bootstrap creates zero parity exceptions: after CI-R3B the replayed schema equals
  the accepted shape exactly, including this table.

| Counter | Value |
|---------|-------|
| `PRODUCT_APPROVED_REMOVAL_COUNT` | **1** |
| `PRODUCT_REMOVAL_IMPLEMENTED_COUNT` | **0** |
| `PRODUCTION_DROP_AUTHORIZED` | **NO** |
| `R3B_BRAKE_TRIP_METRICS_BOOTSTRAP_REQUIRED` | **YES** |
| `R3B_BRAKE_TRIP_METRICS_DROP_COUNT` | **0** |
| `R3B_PRISMA_MODEL_REMOVAL_COUNT` | **0** |
| `R3B_FINAL_PARITY_EXCEPTION_COUNT` | **0** |
| `U043_SEPARATE_REMOVAL_PHASE_REQUIRED` | **YES** |
| `U043_FRESH_PREFLIGHT_REQUIRED` | **YES** |

### 3a. Final accepted shape for the transitional bootstrap object (predecessor equals final — proven)

Columns (ordinal order, from the accepted JSON):

| # | Column | Type | Nullable | Default |
|---|--------|------|----------|---------|
| 1 | `id` | `text` | NO | — |
| 2 | `vehicle_id` | `text` | NO | — |
| 3 | `trip_id` | `text` | YES | — |
| 4 | `brake_energy_kj` | `double precision` | YES | — |
| 5 | `hard_brake_count` | `integer` | NO | `0` |
| 6 | `avg_deceleration_ms2` | `double precision` | YES | — |
| 7 | `max_deceleration_ms2` | `double precision` | YES | — |
| 8 | `brake_duration_sec` | `integer` | YES | — |
| 9 | `distance_km` | `double precision` | YES | — |
| 10 | `recorded_at` | `timestamp(3) without time zone` | NO | — |
| 11 | `created_at` | `timestamp(3) without time zone` | NO | `CURRENT_TIMESTAMP` |

Constraints: `brake_trip_metrics_pkey` — `PRIMARY KEY (id)`;
`brake_trip_metrics_vehicle_id_fkey` — `FOREIGN KEY (vehicle_id) REFERENCES vehicles(id) ON UPDATE CASCADE ON DELETE CASCADE`.

Indexes: `brake_trip_metrics_pkey` (unique btree `id`), `brake_trip_metrics_recorded_at_idx`
(btree `recorded_at`), `brake_trip_metrics_vehicle_id_idx` (btree `vehicle_id`).

The bootstrap DDL must be idempotent (`CREATE TABLE IF NOT EXISTS`, guarded index/constraint
creation) so it is a no-op on any database that already holds the table — including production.

---

## 4. Two-shape authority model (CI-R3B.0.1; corrected CI-R3B.0.2)

Independent review of CI-R3B.0 found a **non-executable** requirement: creating all 19 bootstrap
objects directly at their **final accepted production shape** would pre-create columns, indexes and
types that later migrations add **unguardedly**, causing duplicate-object replay failures.

CI-R3B.0.1 introduced predecessor vs final separation. CI-R3B.0.2 corrects the predecessor ledger to
**MINIMAL_REPLAY_PREDECESSOR_SHAPE** — SQL-ready, mechanically complete, with a post-replay
reconciliation slot for the one proven default delta (`vehicle_trips.trip_status`).

| Field | Value |
|-------|-------|
| `BOOTSTRAP_INSERTION_POINT` | `20260325161141` |
| `BOOTSTRAP_SHAPE_AUTHORITY` | **MINIMAL_REPLAY_PREDECESSOR_SHAPE** — ledger §4 |
| `FINAL_SHAPE_AUTHORITY` | **ACCEPTED_CI_R3A71_PRODUCTION_JSON** + post-replay reconciliation — ledger §5 |
| `BOOTSTRAP_PREDECESSOR_EQUALS_FINAL_FOR_ALL_OBJECTS` | **NO** |
| `FULL_REPLAY_MUST_PRODUCE_FINAL_ACCEPTED_SHAPE` | **YES** (committed history + reconciliation) |
| `EARLY_BOOTSTRAP_FINAL_SHAPE_EXECUTABLE` | **NO** |
| `POST_REPLAY_RECONCILIATION_REQUIRED` | **YES** |
| `POST_REPLAY_RECONCILIATION_IMPLEMENTED` | **NO** |
| `FINAL_PARITY_EXCEPTION_COUNT` | **0** |

Historical (**SUPERSEDED BY CI-R3B.0.2**): `BOOTSTRAP_SHAPE_AUTHORITY` = `PREDECESSOR_AT_INSERTION_POINT`
with incomplete index definitions, future-type references, and missing final-convergence authority.

Binding rules:

- Option-D bootstrap creates all **19** objects at **minimal replay predecessor shape** (ledger §4).
- Committed downstream migrations evolve objects toward the accepted catalog.
- One proven post-committed delta remains: `vehicle_trips.trip_status` DEFAULT `'COMPLETED'` → `'ONGOING'`.
- Authorized reconciliation (planned, not created): `20260814130000_ci_r3b_post_replay_parity_reconciliation`.
- CI-R3B.1 must not start until ledger validation counters are all zero (`IMPLEMENTATION_CRITICAL_UNKNOWN_COUNT` = 0).

Historical (**SUPERSEDED BY CI-R3B.0.1 / CI-R3B.0.2**): “create all 19 at accepted/final shape at bootstrap”.

## 5. Resolved bootstrap inventory (19 objects)

`R3B_TRANSITIONAL_BOOTSTRAP_OBJECT_COUNT` = **19** (9 tables + 10 enums);
`R3B_BOOTSTRAP_OMITTED_OBJECT_COUNT` = **0**; `UNCLASSIFIED_BOOTSTRAP_OBJECT_COUNT` = **0**.

| # | Object | Kind | Accepted shape | Bootstrap class | Why |
|---|--------|------|----------------|-----------------|-----|
| 1 | `vehicle_trips` | table | 110 cols / 2 constraints / 13 indexes | BOOTSTRAP_REPLAY_REQUIRED | `20260325161142` ALTERs it (first `P3018`); 9 evolution-DDL files |
| 2 | `driving_events` | table | 21 / 3 / 11 | BOOTSTRAP_REPLAY_REQUIRED | `20260331000000` ALTER + later indexes |
| 3 | `trip_behavior_events` | table | 20 / 3 / 6 | BOOTSTRAP_REPLAY_REQUIRED | `20260413230000` CREATE INDEX |
| 4 | `vehicle_trip_waypoints` | table | 7 / 2 / 3 | BOOTSTRAP_REPLAY_REQUIRED | `20260609000000` ALTER … SET |
| 5 | `vehicle_trip_tracking_runs` | table | 16 / 2 / 5 | BOOTSTRAP_REPLAY_REQUIRED | `20260609000000` ALTER … SET |
| 6 | `trip_repairs` | table | 12 / 3 / 6 | BOOTSTRAP_REPLAY_REQUIRED | `20260609000000` ALTER … SET |
| 7 | `trip_driving_impact` | table | 61 / 2 / 6 | BOOTSTRAP_REPLAY_REQUIRED | `20260425000000` (camelCase) + 4 later ALTER/index files |
| 8 | `vehicle_trip_detection_states` | table | 30 / 2 / 5 | SCHEMA_PARITY_ONLY | no migration references it; required only for accepted-shape parity |
| 9 | `brake_trip_metrics` | table | 11 / 2 / 3 | BOOTSTRAP_REPLAY_REQUIRED (**transitional**) | 0 migration references, but the bootstrap is the **only** authorized creator and gate 5 parity makes its creation mandatory; product disposition remains DEPRECATE_AND_REMOVE |
| 10 | `TripAssignmentStatus` | enum | 4 ordered labels | BOOTSTRAP_REPLAY_REQUIRED | `20260425000000` RENAME/CREATE/ALTER COLUMN/DROP rebuild |
| 11 | `TripAssignmentSubjectType` | enum | 2 ordered labels | BOOTSTRAP_REPLAY_REQUIRED | `20260425000000` rebuild |
| 12 | `DrivingEventType` | enum | 8 ordered labels | BOOTSTRAP_REPLAY_REQUIRED | `20260716230000` `ALTER TYPE … ADD VALUE` ×2 |
| 13 | `BehaviorEventCategory` | enum | 3 ordered labels | BOOTSTRAP_EVENTUAL_REPLAY_REQUIRED | types a column of replay-required `trip_behavior_events` |
| 14 | `BehaviorEventClassification` | enum | 7 ordered labels | BOOTSTRAP_EVENTUAL_REPLAY_REQUIRED | types a column of replay-required `trip_behavior_events` |
| 15 | `TripSource` | enum | 2 ordered labels | SCHEMA_PARITY_ONLY | no migration references it |
| 16 | `TripDetectionState` | enum | 6 ordered labels | SCHEMA_PARITY_ONLY | no migration references it |
| 17 | `TripTrackingRunType` | enum | 5 ordered labels | SCHEMA_PARITY_ONLY | no migration references it |
| 18 | `VehicleDetectionProfile` | enum | 4 ordered labels | SCHEMA_PARITY_ONLY | no migration references it |
| 19 | `DetectionConfidence` | enum | 3 ordered labels | SCHEMA_PARITY_ONLY | no migration references it |

### 5a. Physical kind accounting (CI-R3B.0.2)

| Counter | Value | Members |
|---------|-------|---------|
| `BOOTSTRAP_TABLE_OBJECT_COUNT` | **9** | all tables listed in §5 inventory |
| `BOOTSTRAP_ENUM_OBJECT_COUNT` | **10** | all enums listed in §5 inventory |
| `BOOTSTRAP_TOTAL_OBJECT_COUNT` | **19** | 9 + 10 |

### 5b. Executable classification accounting

| Counter | Value | Members |
|---------|-------|---------|
| `BOOTSTRAP_REPLAY_REQUIRED_COUNT` | **11** | objects 1–7, 9 (tables) + 10–12 (enums) |
| `BOOTSTRAP_EVENTUAL_REPLAY_REQUIRED_COUNT` | **2** | objects 13–14 |
| `SCHEMA_PARITY_ONLY_COUNT` | **6** | objects 8, 15–19 |
| `R3B_TRANSITIONAL_BOOTSTRAP_OBJECT_COUNT` | **19** | 11 + 2 + 6 |
| `R3B_FINAL_PARITY_EXCEPTION_COUNT` | **0** | — |

Arithmetic: 11 + 2 + 6 = **19** = `KNOWN_MISSING_SCHEMA_OBJECT_COUNT`.

Classification note (mechanically important): the three bootstrap classes above partition the
**executable** inventory — every one of the 19 objects is created by the CI-R3B bootstrap.
`PRODUCT_APPROVED_REMOVAL` is a **product-disposition** label on a different axis
(`PRODUCT_APPROVED_REMOVAL_COUNT` = 1, object 9); it is **not** a bootstrap-exclusion class and does
not subtract from the 19. Object 9 is classified BOOTSTRAP_REPLAY_REQUIRED because the bootstrap is
the only migration authorized to create it and parity gate 5 cannot pass without it, even though
`BRAKE_TRIP_METRICS_MIGRATION_REFERENCE_COUNT` = 0.

Superseded accounting (**SUPERSEDED BY CI-R3B.0**): `PROVISIONAL_BOOTSTRAP_OBJECT_COUNT` = 18 with
`brake_trip_metrics` excluded; `BOOTSTRAP_REPLAY_REQUIRED_COUNT` = 10;
`PRODUCT_APPROVED_REMOVAL_OBJECT_COUNT` = 1 used as a fourth bootstrap partition class.

---

## 6. Authorized migration layout for CI-R3B.1

Planned append-only files (**none created in CI-R3B.0**;
`CANDIDATE_MIGRATION_FILE_CREATED_COUNT` = 0):

| Slot | Path | Timestamp | Purpose |
|------|------|-----------|---------|
| bootstrap (Option D) | `backend/prisma/migrations/20260325161141_ci_r3b_bootstrap_trip_schema_baseline/migration.sql` | 2026-03-25 16:11:41 | idempotently create all 19 objects at **minimal replay predecessor shape** (lowercase); see ledger §4 |
| pre-shim (Option J) | `backend/prisma/migrations/20260424235959_ci_r3b_trip_casing_pre_shim/migration.sql` | 2026-04-24 23:59:59 | guard-first rename to PascalCase on the fresh-replay path; no-op on existing-applied |
| **target (unchanged)** | `backend/prisma/migrations/20260425000000_retire_user_assignment_and_speeding_severity/migration.sql` | 2026-04-25 00:00:00 | **must remain byte-identical** |
| post-shim (Option J) | `backend/prisma/migrations/20260425000001_ci_r3b_trip_casing_post_shim/migration.sql` | 2026-04-25 00:00:01 | guard-first rename back to lowercase; no-op on existing-applied |
| post-replay reconciliation | `backend/prisma/migrations/20260814130000_ci_r3b_post_replay_parity_reconciliation/migration.sql` | 2026-08-14 13:00:00 | final-state deltas after committed history; **not created in CI-R3B.0.2** |

| Counter | Value |
|---------|-------|
| `R3B_PLANNED_NEW_MIGRATION_COUNT` | **4** (bootstrap, pre-shim, post-shim, post-replay reconciliation) |
| `POST_REPLAY_RECONCILIATION_REQUIRED` | **YES** |
| `POST_REPLAY_RECONCILIATION_IMPLEMENTED` | **NO** |
| `R3B_PLANNED_EXISTING_MIGRATION_EDIT_COUNT` | **0** |
| `TARGET_MIGRATION_SHA256_AT_BASELINE` | `1c18164be77dead4db2ff500123754e8c924c9094bc09c41f2408dbcd56a4974` |
| `CANDIDATE_DIRECTORY_ALREADY_EXISTS_COUNT` | **0** (all four verified absent; reconciliation slot sorts after `20260811060000_evaluations_entity_references`) |

Ordering proof re-verified against the committed directory listing at `1948f00d`:

- `20260315000000_add_rental_driving_analysis` < `20260325161141…` < `20260325161142_trip_architecture_refactor`
- `20260422010000_vehicle_current_safety_score` < `20260424235959…` < `20260425000000_retire_user_assignment_and_speeding_severity`
- `20260425000000…` < `20260425000001…` < `20260426220000_station_geofence_radius` < `20260609000000_autovacuum_tuning`
- no committed directory sorts inside any of those three intervals

Intended replay order: **bootstrap → … → `20260413230000` → `20260422010000` → pre-shim → target
(unchanged) → post-shim → `20260426220000` → …**

Guard authority for both shims (precedence-ordered, first effective match, 23 outcome rows: 19
fail-closed + 4 action/no-op) is the decision package §3–§3a and is not restated here.

---

## 7. CI-R3B implementation stages

### CI-R3B.1 — implementation and replay proof

### Authorized post-replay reconciliation (minimum proven delta)

After minimal bootstrap + all committed downstream migrations, exactly one default mismatch is proven
against accepted CI-R3A.7.1 JSON / `schema.prisma`:

```sql
ALTER TABLE "vehicle_trips"
  ALTER COLUMN "trip_status"
  SET DEFAULT 'ONGOING'::"TripStatus";
```

Evidence: `20260325161142` adds DEFAULT `'COMPLETED'`; accepted JSON and `VehicleTrip.tripStatus @default(ONGOING)`
require `'ONGOING'`. No later committed migration alters this default. Full convergence ledger: predecessor
file §5.

- implement the Option-D bootstrap (all 19 objects, idempotent, **minimal replay predecessor shape** per
  ledger §4) and the Option-J guarded pre/post shims
- prove pinned-engine target-file atomicity (`TARGET_FILE_ATOMICITY_AUTHORITY` currently
  `PINNED_BEHAVIOR_REQUIRES_REPLAY_CONFIRMATION`)
- implement and apply the post-replay reconciliation migration for proven final-state deltas
- clean fresh PostgreSQL replay: `prisma migrate deploy` from an empty database reaching current head
  **plus** reconciliation migration
- exact retained schema parity against `ci-r3a7-production-catalog-evidence-2026-08.json`
- no existing migration mutation and no checksum mutation

### CI-R3B.2 — fault-injection and no-op proof

- execute the four disposable fault-injection/recovery gates **F01–F04** (R01–R04 states)
- execute the already-applied database gates **PRE-NOOP01** and **POST-NOOP01**
- prove clean retry and recovery for every injected fault

### CI-R3B.3 — review and acceptance

- independent final review
- CI-R3B acceptance
- merge authorization only after all seven acceptance gates pass

| Counter | Value |
|---------|-------|
| `R3B_STAGE_COUNT` | **3** |
| `R3B_STAGE_COMPLETED_COUNT` | **0** |
| `CI_R3B_IMPLEMENTATION_COUNT` | **0** |
| `U042_FAULT_INJECTION_GATE_EXECUTED_COUNT` | **0** |

---

## 8. Acceptance gates

The seven mandatory CI-R3B acceptance gates are preserved unchanged from the accepted decision
package §5a:

| # | Gate | Status at CI-R3B.0 |
|---|------|--------------------|
| 1 | independent review of transaction scope, persistence windows, guard model, recovery states and recovery authority | **PASSED** (CI-R3A.8.3 independent review) |
| 2 | pinned-engine replay confirmation of target-file atomicity | pending |
| 3 | full `prisma migrate deploy` replay on a fresh empty database reaching current head | pending |
| 4 | all four fault-injection gates F01–F04 executed with documented evidence | pending |
| 5 | proof that the replayed schema equals the accepted CI-R3A.7.1 shape (including `brake_trip_metrics`) | pending |
| 6 | proof that on an already-applied production-like database both shims resolve to PRE-NOOP01 + POST-NOOP01 | pending |
| 7 | no edit to any existing migration file and no checksum mutation | pending |

| Counter | Value |
|---------|-------|
| `R3B_ACCEPTANCE_GATE_TOTAL_COUNT` | **7** |
| `R3B_ACCEPTANCE_GATE_PASSED_COUNT` | **1** |
| `R3B_ACCEPTANCE_GATE_PENDING_COUNT` | **6** |
| `R3B_FINAL_ACCEPTANCE` | **NO** |
| `R3B_MERGE_AUTHORIZED` | **NO** |
| `R3B_DEPLOYMENT_AUTHORIZED` | **NO** |
| `R3B_PRODUCTION_AUTHORIZED` | **NO** |

Gates 2–7 block final acceptance, merge and deployment. They are **not** preconditions that forbid
writing the CI-R3B.1 implementation being tested (`REMAINING_IMPLEMENTATION_BLOCKER_COUNT` = 0;
`R3B_FINAL_ACCEPTANCE_BLOCKER_GROUP_COUNT` = 1; `CIRCULAR_R3B_START_GATE_STATEMENT_COUNT` = 0).

Gate 5 is now satisfiable: with the transitional bootstrap, the replayed schema contains all nine
accepted tables and all ten accepted enums, so parity carries zero exceptions.

---

## 9. Stale-authority sweep (CI-R3B.0 + CI-R3B.0.1)

Claims that must not appear as current authority anywhere in CI-R3A/CI-R3B documentation:

| Superseded claim | Current authority |
|------------------|-------------------|
| bootstrap creates all 19 objects at **final/accepted** shape | bootstrap creates all 19 at **predecessor** shape; full replay reaches accepted shape |
| accepted production JSON defines bootstrap DDL directly | accepted JSON is **final-state** authority only; predecessor ledger defines bootstrap DDL |
| the executable CI-R3B bootstrap contains exactly 18 objects | **19** (§5) — 18-object statements are labelled superseded historical accounting |
| `brake_trip_metrics` must be absent from a fresh replay | it must be **created** by the transitional bootstrap (§3) |
| U043 removal is already implemented | approved but **not** implemented (`PRODUCT_REMOVAL_IMPLEMENTED_COUNT` = 0) |
| exact parity can pass while the table is excluded | it cannot; that was the proven contradiction (§2) |
| CI-R3B may drop the production table | **NO** (`PRODUCTION_DROP_AUTHORIZED` = NO) |
| CI-R3B is already implemented or accepted | `CI_R3B_IMPLEMENTATION_COUNT` = 0; `R3B_FINAL_ACCEPTANCE` = NO |

| Counter | Value |
|---------|-------|
| `STALE_BOOTSTRAP_FINAL_SHAPE_AUTHORITY_CLAIM_COUNT` | **0** |
| `CURRENT_ALL_19_ACCEPTED_SHAPE_CLAIM_COUNT` | **0** |
| `STALE_R3B_BOOTSTRAP_18_CURRENT_CLAIM_COUNT` | **0** |
| `FALSE_U043_REMOVAL_IMPLEMENTED_CLAIM_COUNT` | **0** |
| `FALSE_R3B_PRODUCTION_DROP_AUTHORITY_CLAIM_COUNT` | **0** |
| `R3B_PARITY_CONTRADICTION_COUNT` | **0** |
| `FALSE_CI_R3B_IMPLEMENTED_CLAIM_COUNT` | **0** |
| `FALSE_U043_REVERSAL_CLAIM_COUNT` | **0** |
| `STALE_CURRENT_AUTHORITY_COUNT` | **0** |

---

## 10. CI-R3B.0 / CI-R3B.0.1 / CI-R3B.0.2 / CI-R3B.0.2.1 scope counters

| Counter | Value |
|---------|-------|
| `CHANGED_FILE_COUNT` | 4 |
| `NEW_FILE_COUNT` | 0 |
| `UPDATED_AUTHORITY_FILE_COUNT` | 4 (all four CI-R3B authority documents) |
| `MIGRATION_CHANGE_COUNT` / `NEW_MIGRATION_COUNT` / `HISTORICAL_MIGRATION_EDIT_COUNT` | 0 / 0 / 0 |
| `SCHEMA_CHANGE_COUNT` | 0 |
| `RUNTIME_CHANGE_COUNT` / `TEST_LOGIC_CHANGE_COUNT` / `WORKFLOW_CHANGE_COUNT` | 0 / 0 / 0 |
| `DEPENDENCY_CHANGE_COUNT` / `LOCKFILE_CHANGE_COUNT` | 0 / 0 |
| `JSON_EVIDENCE_CHANGE_COUNT` / `JSON_EVIDENCE_HASH_MATCH` | 0 / YES |
| `PRODUCTION_DATABASE_ACCESS_COUNT` / `PRODUCTION_DEPLOYMENT_COUNT` | 0 / 0 |
| `E7_E8_E9_RUNTIME_SCOPE_COUNT` / `OUT_OF_SCOPE_FILE_COUNT` | 0 / 0 |
| `CI_R3B_IMPLEMENTATION_COUNT` | 0 |

## 11. CI-R3B.0.2.1 — 19-object final-convergence ledger completion

Independent review of CI-R3B.0.2 found the final-convergence ledger incomplete:

| Defect | CI-R3B.0.2 state | CI-R3B.0.2.1 correction |
|--------|------------------|-------------------------|
| Object row count | declared 19, actual 11 | **19** physical object rows in ledger §5.1 |
| Missing table rows | 8 tables absent | all **9** table rows present |
| Assignment enum notation | ambiguous `5/3 bootstrap` | precise bootstrap counts (5 and 3 separately) |
| Zero mismatch counters | not sufficiently proven | mechanically verified state A/B counters |

Corrected final-convergence authority (ledger §5):

| Counter | Value |
|---------|-------|
| `FINAL_CONVERGENCE_LEDGER_OBJECT_COUNT` | **19** |
| `FINAL_CONVERGENCE_TABLE_ROW_COUNT` / `FINAL_CONVERGENCE_ENUM_ROW_COUNT` | **9** / **10** |
| `FINAL_CONVERGENCE_TABLE_PROPERTY_CATEGORY_COUNT` | **54** |
| `FINAL_REPLAY_DEFAULT_MISMATCH_COUNT_AFTER_COMMITTED_HISTORY` | **1** (`vehicle_trips.trip_status`) |
| `FINAL_REPLAY_*_MISMATCH_COUNT_AFTER_AUTHORIZED_RECONCILIATION` | all **0** |
| `FULL_REPLAY_FINAL_SHAPE_PROVEN_BY_AUTHORITY` | **YES** |
| `STALE_FINAL_CONVERGENCE_19_OBJECT_CLAIM_COUNT` | **0** |
| `STALE_AMBIGUOUS_ASSIGNMENT_ENUM_COUNT_CLAIM` | **0** |
| `MIRRORED_AUTHORITY_MISMATCH_COUNT` | **0** |

Historical incomplete convergence table (**SUPERSEDED BY CI-R3B.0.2.1**): 11-row partial ledger with
missing tables and ambiguous Assignment enum wording.

## 12. Final status

- CI-R3B.0 locked the `brake_trip_metrics` bootstrap/parity contradiction.
- CI-R3B.0.1 separated bootstrap predecessor from final accepted shape.
- CI-R3B.0.2 delivers a **SQL-ready minimal replay predecessor ledger**, complete downstream DDL matrix,
  and authorized fourth post-replay reconciliation migration.
- CI-R3B.0.2.1 completes the **19-object final-convergence ledger** with all table property categories
  and precise enum label-set proof.
- U043 remains **approved but unimplemented**; `brake_trip_metrics` remains transitional bootstrap-required.
- No migration, schema, runtime or test change; CI-R3B.1 awaits independent review.

**Status: CI_R3B021_FINAL_CONVERGENCE_COMPLETED** — awaiting independent review before CI-R3B.1 implementation.
