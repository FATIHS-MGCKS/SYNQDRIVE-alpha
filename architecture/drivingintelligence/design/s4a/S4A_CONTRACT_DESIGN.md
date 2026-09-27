# S4A — Contract design (frozen, design only)

**Date:** 2026-09-27 · **Slice:** EXP-021 C1D.10A · **Status:** `FROZEN_FOR_S4A_IMPLEMENTATION` (decision **PROPOSED**, DI-DEC-V0-S4A-CONTRACT-001)  
**Base main:** `9fece014adbfe5b2278275b6840c4bb698479b59` · **Evidence:** [EXP021_C1D10A_AUTHORITY_CORRECTION.md](../../evidence/EXP021_C1D10A_AUTHORITY_CORRECTION.md) (DI-EVID-EXP021-C1D10A-001)  
**Machine contract:** [`s4a-contract.v2.json`](s4a-contract.v2.json) (`DI_V0_S4A_CONTRACT_V2`, **AMENDED BY C1D.10C**; the C1D.10A [`s4a-contract.v1.json`](s4a-contract.v1.json) is kept unchanged as the historical artifact and is rejected by the v2 validator) · **Validator:** `bash architecture/drivingintelligence/scripts/validate-s4a-contract.sh` (positive validation + 47-case negative red-team suite) · **Amendment evidence:** [EXP021_C1D10C_AUTHORITY_CLOSURE.md](../../evidence/EXP021_C1D10C_AUTHORITY_CLOSURE.md) (DI-EVID-EXP021-C1D10C-001)

> DESIGN ONLY · NO S4 RUNTIME · NO WORKER · NO SWEEPER · NO SCHEDULER · NO QUEUE · NO MIGRATION CREATED · NO DEPLOY · NO ACTIVATION

## 0. Document map

| Document | Content |
|----------|---------|
| this file | scope freeze, schema (columns and constraints), settlement model, zero-impact invariants, the accel/brake/coast boundary, next slice |
| [S4A_STATE_MACHINE.md](S4A_STATE_MACHINE.md) | 7 states, 13 transitions (T12 retire, T13 holder supersede added by C1D.10C), legal/illegal matrix, per-state column invariants |
| [S4A_CONTROL_PLANE.md](S4A_CONTROL_PLANE.md) | C1D.10C: flags, allowlists, DB kill row, pipeline-version registry and retirement |
| [S4A_IDENTITY_AND_FENCING.md](S4A_IDENTITY_AND_FENCING.md) | identity hierarchy, logical key, run purposes, pipeline version key, boundary fingerprint, **S2 execution identity `DI_V0_S4_EXECUTION_IDENTITY_V1`**, lease and fencing |
| [S4A_CHANNEL_OUTCOME_MODEL.md](S4A_CHANNEL_OUTCOME_MODEL.md) | POSITION / R1_OBD / NATIVE_EVENT outcomes, native fail-closed, combined input identity V0_3 |
| [S4A_REPLAY_AND_EVIDENCE_PINNING.md](S4A_REPLAY_AND_EVIDENCE_PINNING.md) | content-addressed snapshots, pinning, replay, retention |
| [S4A_MIGRATION_SAFETY.md](S4A_MIGRATION_SAFETY.md) | dormant-deploy proof, migration rules, locks, rollback |
| [S4A_THREAT_MODEL.md](S4A_THREAT_MODEL.md) | races A–Q, attacker/failure model, multi-replica test list |
| [../../evidence/EXP021_C1D10A_P2_TRIAGE.md](../../evidence/EXP021_C1D10A_P2_TRIAGE.md) | P2 triage and the new findings N1–N10 (reconciled by C1D.10C, see the closure evidence §9) |

**Precedence.** If prose and `s4a-contract.v2.json` disagree, the JSON wins, the disagreement is a defect, and the validator must be extended to catch it.

## 1. Scope freeze

**S4A is exactly:** a Prisma schema and one migration (four new tables — work items, evidence snapshots, the control row table and the pipeline-version registry, C1D.10C — plus guards on the two empty S2 tables), a typed repository enforcing the state machine with conditional updates, pure builders (pipeline version key, boundary fingerprint, combined input identity V0_3, channel outcome types), and Postgres integration tests for the race fixtures.

**S4A is not:** a worker, discovery job, drift watcher, sweeper/reaper process, scheduler registration, BullMQ queue, Nest module registration in `AppModule`, provider call, feature flag read, API endpoint, or trip mutation. All of these belong to S4B–S4F (see §8).

## 2. Schema (frozen)

All identifiers are `text` (matching existing Prisma `String @id` UUID usage). All enumerations are `text` + `CHECK`, never PostgreSQL enums (additive evolution without `ALTER TYPE`).

### 2.1 `di_v0_s4_work_items`

| Column | Type | Null | Notes |
|--------|------|------|-------|
| `id` | text | NO | PK |
| `organization_id` | text | NO | FK `organizations(id)` ON DELETE CASCADE |
| `vehicle_id` | text | NO | FK `vehicles(id)` ON DELETE CASCADE |
| `trip_id` | text | NO | FK `vehicle_trips(id)` ON DELETE CASCADE |
| `source_family` | text | NO | `RUPTELA_R1` \| `API_SYNTHETIC` \| `UNKNOWN` (DI family, not `hardwareType`; see DI-CONTRA-HARDWARE-TYPE-INTEGRATION-001) |
| `run_purpose` | text | NO | `PRIMARY` \| `RECALIBRATION_REPLAY` \| `REACQUISITION` |
| `purpose_discriminator` | text | NO | `PRIMARY` for PRIMARY; equals `replay_source_snapshot_hash` / `reacquisition_request_id` otherwise |
| `replay_source_snapshot_hash` | text | YES | required iff RECALIBRATION_REPLAY |
| `reacquisition_request_id` | text | YES | required iff REACQUISITION |
| `boundary_fingerprint` | text | NO | `DI_V0_S4_BOUNDARY_FP_V1:sha256:<64 hex>` |
| `pipeline_version_key` | text | NO | `DI_V0_S4_PIPELINE_V1:sha256:<64 hex>`; C1D.10C: FK `di_v0_s4_pipeline_versions(pipeline_version_key)` (non-canonical registry, see [control plane §5](S4A_CONTROL_PLANE.md)) |
| `pipeline_version_manifest` | jsonb | NO | the 20 required keys; its hash must equal `pipeline_version_key` (repository-verified) |
| `status` | text | NO | 7 states ([state machine](S4A_STATE_MACHINE.md)) |
| `lease_epoch` | bigint | NO | default 0, `>= 0`, monotonic (trigger) |
| `lease_owner` | text | YES | opaque worker instance id; never hashed |
| `lease_expires_at` | timestamptz | YES | always computed from DB `clock_timestamp()` |
| `lease_acquired_at` | timestamptz | YES | C1D.10C: set by T02/T04 only; anchor of the 900 s absolute lease ceiling |
| `last_heartbeat_at` | timestamptz | YES | |
| `attempt_count` | integer | NO | default 0, `0..5` |
| `next_attempt_at` | timestamptz | YES | set in PENDING / FAILED_RETRYABLE |
| `settlement_anchor_at` | timestamptz | NO | `max(endTime, createdAt, latest APPLIED trip_repairs.appliedAt)` at creation |
| `eligible_at` | timestamptz | NO | `settlement_anchor_at + 24 h` |
| `pinned_snapshot_hash` | text | YES | immutable once set |
| `pinned_at` | timestamptz | YES | all-or-none with the hash |
| `pinned_epoch` | bigint | YES | epoch that pinned (audit) |
| `combined_input_identity` | text | YES | V0_3 hash, required when COMPLETED |
| `shadow_run_id` | text | YES | composite FK (see §2.4); required iff COMPLETED (retained if later SUPERSEDED) |
| `failure_class` | text | YES | `RETRYABLE` \| `TERMINAL` \| `EXHAUSTED` |
| `failure_reason` | text | YES | bounded reason code (≤ 128 chars), no provider payload; includes `REPLAY_INELIGIBLE` and `S2_EXECUTION_IDENTITY_MISMATCH` (C1D.10C) |
| `execution_identity` | text | YES | C1D.10C: `DI_V0_S4_EXECUTION_IDENTITY_V1:sha256:<hex>`, required when COMPLETED; equals the S2 run's `input_evidence_version` |
| `skip_reason` | text | YES | required iff SKIPPED_INELIGIBLE (for example `WINDOW_EXCEEDS_MAX_8H`, `POSITION_UNSUPPORTED_SOURCE`) |
| `superseded_reason` | text | YES | required iff SUPERSEDED: `BOUNDARY_CHANGED` \| `TRIP_NOT_COMPLETED` \| `TRIP_CANCELLED` \| `PIPELINE_RETIRED` \| `OPERATOR` |
| `superseded_by_work_item_id` | text | YES | composite self-FK, same org and trip |
| `superseded_at` | timestamptz | YES | |
| `completed_at` | timestamptz | YES | |
| `created_at` / `updated_at` | timestamptz | NO | DB default `now()`; never hashed |

**Constraints:**

| Name | Definition |
|------|------------|
| `di_v0_s4_wi_logical_key_uq` | UNIQUE (`organization_id`, `trip_id`, `boundary_fingerprint`, `pipeline_version_key`, `run_purpose`, `purpose_discriminator`) |
| `di_v0_s4_wi_active_primary_uq` | UNIQUE (`organization_id`, `trip_id`, `pipeline_version_key`) WHERE `run_purpose='PRIMARY' AND status<>'SUPERSEDED'` |
| `di_v0_s4_wi_id_scope_uq` | UNIQUE (`id`, `organization_id`, `trip_id`), the target for the composite self-FK |
| `…_status_ck` | `status IN (7 values)` |
| `…_purpose_ck` | PRIMARY ⇒ discriminator=`'PRIMARY'` ∧ both source columns NULL; RECALIBRATION_REPLAY ⇒ `replay_source_snapshot_hash` NOT NULL ∧ discriminator = it ∧ `pinned_snapshot_hash` = it (**AMENDED BY C1D.10C**: v1 also allowed a NULL pin; replay is pinned at creation, so the pin is mandatory); REACQUISITION ⇒ `reacquisition_request_id` NOT NULL ∧ discriminator = it |
| `…_lease_ck` | `status='LEASED'` ⇔ (`lease_owner` NOT NULL ∧ `lease_expires_at` NOT NULL) |
| `…_next_attempt_ck` | status ∈ {PENDING, FAILED_RETRYABLE} ⇔ `next_attempt_at` NOT NULL |
| `…_completed_ck` | `status='COMPLETED'` ⇒ `shadow_run_id`, `pinned_snapshot_hash`, `combined_input_identity`, `execution_identity`, `completed_at` NOT NULL |
| `…_shadow_run_state_ck` | `shadow_run_id` NOT NULL ⇒ status ∈ {COMPLETED, SUPERSEDED} |
| `…_skip_ck` | `status='SKIPPED_INELIGIBLE'` ⇒ `skip_reason` NOT NULL ∧ `pinned_snapshot_hash` IS NULL. C1D.10C: this makes SKIPPED unreachable for RECALIBRATION_REPLAY (always pinned) and for any pinned item; T09 therefore requires `PIN_NOT_SET` ∧ purpose ≠ replay, and post-pin ineligibility goes to FAILED_TERMINAL, so no transaction can loop on this CHECK |
| `…_superseded_ck` | `status='SUPERSEDED'` ⇔ (`superseded_reason` NOT NULL ∧ `superseded_at` NOT NULL) |
| `…_pin_all_or_none_ck` | the three `pinned_*` columns are all NULL or all NOT NULL |
| `…_attempts_ck` | `attempt_count BETWEEN 0 AND 5` |
| `…_format_ck` | prefixes of `boundary_fingerprint`, `pipeline_version_key`, `combined_input_identity`, `execution_identity`, `pinned_snapshot_hash` |
| `…_eligible_ck` | `eligible_at = settlement_anchor_at + interval '24 hours'` |

**Indexes (new table only):** claim index (`status`, `next_attempt_at`) WHERE status IN ('PENDING','FAILED_RETRYABLE'); reap index (`lease_expires_at`) WHERE status='LEASED'; (`organization_id`, `trip_id`).

**Triggers (new table only):**

- `di_v0_s4_work_item_scope_guard` (BEFORE INSERT OR UPDATE OF `organization_id`, `vehicle_id`, `trip_id`) — **AMENDED BY C1D.10C (P1-C)**. The organization is derived through the trip's vehicle, because `vehicle_trips` has no organization column (C1D.10B proved it; the v1 text referenced a NONEXISTENT trip-level organization column). The guard raises unless `EXISTS (SELECT 1 FROM vehicle_trips t JOIN vehicles v ON v.id = t.vehicle_id WHERE t.id = NEW.trip_id AND t.vehicle_id = NEW.vehicle_id AND v.organization_id = NEW.organization_id)`. This is the same relation as the `vehicle_trip_route_artifact_scope_guard` precedent (migration `20260829140000`: vehicle→organization, then trip→vehicle), expressed as one join. Contract: `tenancy.scopeGuards`.
- `di_v0_s4_work_item_immutable_guard` (BEFORE UPDATE): rejects any change to `organization_id`, `vehicle_id`, `trip_id`, `source_family`, `run_purpose`, `purpose_discriminator`, `replay_source_snapshot_hash`, `reacquisition_request_id`, `boundary_fingerprint`, `pipeline_version_key`, `pipeline_version_manifest`, `settlement_anchor_at`, `eligible_at`. Also rejects a `pinned_snapshot_hash` change once non-NULL, a `lease_epoch` decrease, and any update of a row whose OLD status is SUPERSEDED.

### 2.2 `di_v0_s4_evidence_snapshots`

| Column | Type | Null | Notes |
|--------|------|------|-------|
| `id` | text | NO | PK |
| `organization_id` / `vehicle_id` / `trip_id` | text | NO | FKs ON DELETE CASCADE |
| `snapshot_hash` | text | NO | `DI_V0_S4_EVIDENCE_V1:sha256:<hex>` over the canonical uncompressed container |
| `container_version` | text | NO | `DI_V0_S4_EVIDENCE_CONTAINER_V1` |
| `boundary_fingerprint` | text | NO | fingerprint at acquisition |
| `acquisition_window_start` / `_end` | timestamptz | NO | `end - start <= 28 800 s` (CHECK) |
| `channel_manifest` | jsonb | NO | per channel: outcome, reason, snapshot version, channel payload hash, attestation ref |
| `payload_gzip` | bytea | NO | gzip of the canonical container |
| `payload_bytes` / `uncompressed_bytes` | integer | NO | `> 0`; `uncompressed_bytes <= 16 777 216` (CHECK) |
| `retention_until` | timestamptz | NO | see [replay §5](S4A_REPLAY_AND_EVIDENCE_PINNING.md) |
| `created_at` | timestamptz | NO | never hashed |

Constraints: UNIQUE (`organization_id`, `snapshot_hash`); UNIQUE (`organization_id`, `trip_id`, `snapshot_hash`) (FK target); scope-guard trigger (as in §2.1); **immutability trigger rejects every UPDATE**. Only DELETE is allowed (canonical cascade or retention purge).

### 2.3 Guards on existing S2 tables (both empty in Production: 0 rows, 0 inserts ever)

- `di_v0_shadow_runs`: add UNIQUE (`id`, `organization_id`, `trip_id`) (FK target), plus scope-guard trigger `di_v0_shadow_run_scope_guard` (the same trip→vehicle→organization check as §2.1; `di_v0_shadow_runs` carries `organization_id`, `vehicle_id`, `trip_id`). This closes N9: S2 tenant integrity moves from repository-only to the DB.
- `di_v0_shadow_intervals` (carries `shadow_run_id`, `organization_id`, `vehicle_id`, `trip_id`, per `schema.prisma` `DiV0ShadowInterval`): scope-guard trigger `di_v0_shadow_interval_scope_guard` checking that the parent run has the same `organization_id`, `vehicle_id` and `trip_id`.

Because both tables are empty, the index builds and trigger creation are instant. The migration still asserts emptiness first ([migration safety §3](S4A_MIGRATION_SAFETY.md)).

### 2.4 Tenant-integrity FKs (declarative)

| From (work item) | To | ON DELETE |
|------------------|----|-----------|
| (`shadow_run_id`, `organization_id`, `trip_id`) | `di_v0_shadow_runs` (`id`, `organization_id`, `trip_id`) | CASCADE |
| (`organization_id`, `trip_id`, `pinned_snapshot_hash`) | `di_v0_s4_evidence_snapshots` (`organization_id`, `trip_id`, `snapshot_hash`) | CASCADE |
| (`organization_id`, `trip_id`, `replay_source_snapshot_hash`) | same | CASCADE |
| (`superseded_by_work_item_id`, `organization_id`, `trip_id`) | `di_v0_s4_work_items` (`id`, `organization_id`, `trip_id`) | CASCADE |

MATCH SIMPLE: when the nullable leading column is NULL the FK is not checked, as intended. Every referenced row belongs to the same trip, so a canonical trip deletion removes the whole set in one statement. CASCADE, not SET NULL: SET NULL would null `organization_id` / `trip_id` (NOT NULL) or `shadow_run_id` (CHECK-guarded) and fail the canonical delete, which is forbidden by invariant `NO_CONSTRAINT_THAT_CAN_FAIL_A_CANONICAL_WRITE_OR_DELETE`.

**`CROSS_TENANT_WORK_ITEM_POSSIBLE = NO`:** every cross-row reference is either a scope-guard-checked canonical FK or a composite FK that includes `organization_id` and `trip_id`.

**Tenancy authority (C1D.10C, contract `tenancy`).** `TENANCY_ORG_SOURCE = TRIP_VEHICLE_ORGANIZATION`: the organization of a work item, snapshot or S2 run is `vehicles.organization_id` of `vehicle_trips.vehicle_id`, resolved by the repository and re-checked by the trigger. A caller-supplied organization is never trusted. The future DB invariants are: work item (org, vehicle, trip) = trip.vehicle.organization; snapshot same scope (trigger + composite FK); S2 run same scope (trigger + composite FK); S2 intervals match their parent run (trigger). None of these exist in the DB today (`dbEnforcementExistsToday=false`); they are the S4A implementation contract.

### 2.5 Control tables (C1D.10C)

- `di_v0_s4_control`: singleton DB kill row (`id='GLOBAL'`, `kill_state` KILLED/NOT_KILLED, `reason`, `actor`, `updated_at`), disable-only, **not seeded** (missing row = KILLED). See [control plane §4](S4A_CONTROL_PLANE.md).
- `di_v0_s4_pipeline_versions`: pipeline-version registry (`pipeline_version_key` PK, `manifest` jsonb, `status` ACTIVE/RETIRED, `registered_at`, `retired_at`, `retired_by`, `retired_reason`); RETIRED→ACTIVE forbidden by trigger. See [control plane §5](S4A_CONTROL_PLANE.md).

## 3. Execution authority

| Question | Answer |
|----------|--------|
| `BULLMQ_IS_IDEMPOTENCY_AUTHORITY` | **NO.** BullMQ jobs, if used at all (S4B), carry only `workItemId` and are a wake-up hint. Duplicate or lost jobs are harmless |
| `DB_LEASE_IS_EXECUTION_AUTHORITY` | **YES.** Claim, heartbeat, pin and completion are conditional updates on the work-item row fenced by `lease_epoch` |
| `S2_IDEMPOTENCY_IS_FINAL_PERSISTENCE_GUARD` | **YES.** The S2 `idempotencyKey` unique constraint is the last line: even a fencing bug cannot produce two S2 runs for one execution identity. **AMENDED BY C1D.10C (P1-A):** S4 writes the full `DI_V0_S4_EXECUTION_IDENTITY_V1` into S2 `inputEvidenceVersion`, so the S2 key binds pipeline version, calibration bundle hash, boundary fingerprint, run purpose and evidence; a key collision with a different stored identity fails closed ([identity §6](S4A_IDENTITY_AND_FENCING.md)) |
| Scheduler leadership | Discovery and the drift watcher (S4B/S4E) run under `SchedulerLeaderGuardService`. Leadership is an efficiency optimization, never a correctness requirement (two discoverers are safe, race A) |

## 4. Limits (frozen; lease names AMENDED BY C1D.10C)

`maxAcquisitionWindowSeconds` 28 800 (8 h; applies to every channel, the stricter R1 limit wins over position's 12 h), `LEASE_DURATION` 300 s, `HEARTBEAT_INTERVAL` 60 s, `WORK_EXECUTION_BUDGET` 240 s (one attempt's compute budget; the worker self-aborts), `ABSOLUTE_LEASE_LIFETIME_CEILING` 900 s (the maximum cumulative lifetime of one attempt's lease from its claim, including all heartbeat extensions; **not** permission for a 900 s compute attempt), max attempts 5, backoff 15 m / 1 h / 4 h / 4 h / 4 h, settlement quiet 86 400 s, drift horizon 864 000 s. Trips longer than 8 h are `SKIPPED_INELIGIBLE` (`WINDOW_EXCEEDS_MAX_8H`); Production has 0 such trips in 60 days (INFERRED from the C1D.10 duration distribution).

## 5. Settlement model (P1-4, closed at contract level)

| Candidate delay after `endTime` | mutations still pending (n=208 / 653 trips) | Verdict |
|------------------|-------------------------------------|---------|
| 10 min | 186 | rejected: most repairs arrive later |
| 1 h | 150 | rejected |
| 6 h | 36 | rejected |
| 12 h | 13 | rejected |
| 16 h (C1D.10 proposal) | 11 (1.7 % of trips) | rejected: based on a 5-row sample (corrected) |
| **24 h after `max(endTime, createdAt, latest repair)`** | **2/157 post-creation mutations (0.3 %)** | **SELECTED** as the initial settlement delay |

- **Initial settlement delay (`INITIAL_SETTLEMENT_DELAY_FINAL`):** 24 h quiet period. The anchor is `max(endTime, createdAt, latest APPLIED trip_repairs.appliedAt)`. It re-arms on every **recorded** repair: the maximum consecutive repair gap observed is 9.2 h, so no chain spans a 24 h quiet window. **AMENDED BY C1D.10C:** merge reopen, discard and `deleteMany`-style mutations are not necessarily written to `trip_repairs`, so they do not re-arm the timer (`everyBoundaryMutationRearmsQuietTimer=false`). Correctness does not depend on repair history: unrecorded boundary changes are detected by a boundary-fingerprint difference at attempt start (after claim), inside the completion transaction, and by the 10-day drift watcher, and are resolved by the supersession transaction.
- **Time authority (C1D.10C):** `trip_repairs.applied_at`, `vehicle_trips.start_time/end_time/created_at` are `timestamp without time zone` holding **UTC** (proof: [closure evidence §4](../../evidence/EXP021_C1D10C_AUTHORITY_CLOSURE.md)). The anchor is computed with `AT TIME ZONE 'UTC'` before comparison with the `timestamptz` S4 columns; naive and aware timestamps are never compared directly. Separating the anchor from `endTime` matters because REPAIRED trips are created up to 60 h after their end.
- **Drift horizon (`DRIFT_LOOKBACK_FINAL`):** 10 days after the anchor. The drift watcher (S4E) re-reads trip rows and **re-hashes the boundary fingerprint**, because `VehicleTrip` has no `updatedAt` and `rawDetectionMeta` can be overwritten. The maximum observed post-end mutation is about 6.4 days and the cold reconciliation tier is 7 days. A mismatch leads to T11 SUPERSEDE plus a successor PRIMARY. Beyond 10 days, mutations are counted by an S4F reconciliation metric only (no supersession), and the count is expected to be 0.
- **Supersession model (`SUPERSESSION_MODEL_FINAL`):** the old work item goes to SUPERSEDED (terminal, epoch incremented, S2 run and pin retained). A new PRIMARY with the new fingerprint is inserted in the same transaction and linked by `superseded_by_work_item_id`. The active-PRIMARY partial unique makes "at most one live PRIMARY per (org, trip, pvk)" a DB fact. S2 rows are never updated or deleted by supersession.
- **Boundary fingerprint fields (`BOUNDARY_FINGERPRINT_FIELDS_FINAL`):** `organizationId, vehicleId, tripId, tripStatus, startTime, endTime, dimoSegmentId, mergeParentTripId, boundaryRepairGeneration` (see [identity §4](S4A_IDENTITY_AND_FENCING.md)).

## 6. Zero-impact invariants (§13)

Enforced by the contract (`zeroImpactInvariants`, 15 entries) and in S4A–S4F by static tests extending `di-v0-shadow-no-public-api.spec.ts`: no import of DI V0 / S4 symbols from controllers, customer services, the Trip FSM, `trip-decision.engine.ts`, finalize hooks, health, telemetry ingest, notifications or route geometry. No Prisma write to any canonical model from `driving-intelligence/**/s4*`. No trigger, index or ALTER on canonical tables. No threshold or calibration write.

Expected counts after S4A: `CUSTOMER_READ_PATH_COUNT=0`, `CUSTOMER_WRITE_PATH_COUNT=0`, `TRIP_STATE_MUTATION_PATH_COUNT=0`, `ONLINE_LEARNING_PRESENT=NO`, `AUTOMATIC_THRESHOLD_MUTATION_PRESENT=NO`.

## 7. Acceleration / braking / coasting boundary (§14)

S4 orchestrates the **existing** S1 core (`computeDiV0TripIntervals`) on pinned inputs. It adds no detector: no acceleration, braking or coasting classification, threshold, native-event fusion, calibration fitting or score. The intervals S2 persists are exactly S1's output. Any detector work is a separate experiment with its own authority and needs S4 replay (RECALIBRATION_REPLAY) only as a consumer. `CALIBRATION_UNSET_V0_BUNDLE` stays the only bundle, and changing it produces a new `pipeline_version_key` (via `calibrationBundleHash`), never an in-place update.

## 8. Slice plan after C1D.10A

| Slice | Scope | Runtime effect |
|-------|-------|----------------|
| **S4A** (next, separately authorized) | schema + migration (§2), repository with guarded transitions, builders, channel outcome types, Postgres race tests (R01–R25 of contract v2 + threat-model races A–Y), control plane tables (`di_v0_s4_control`, `di_v0_s4_pipeline_versions`) | none (dormant tables, no caller) |
| S4B | discovery + claim loop behind a kill switch (code default OFF), leader-guarded | none until flag |
| S4C | position acquisition wrapper with `runWithDimoRequestContext({category:'POST_TRIP_ENRICHMENT', priority:'BACKGROUND'})`, R1 acquisition | provider reads when enabled |
| S4D | evidence snapshot store + **deserializer** (DI-GAP-S4-REPLAY-DESERIALIZER-001), replay | none |
| S4E | drift watcher and supersession | none |
| S4F | metrics, reconciliation, tiny activation runbook (1 vehicle, position + R1 only) | shadow writes only |

**Before tiny activation (not before S4A):** S4C DIMO priority wrapper and provider backpressure (DI-GAP-S4-PROVIDER-BACKPRESSURE-001, C1D.10C), S4D deserializer plus snapshot re-hash verification (DI-GAP-S4-REPLAY-DESERIALIZER-001), the location retention governance note (DI-GAP-S4-LOCATION-RETENTION-001), explicit operator authorization. Encoded as contract `activationGates`. Native stays `NOT_READY` until DI-GAP-S4-NATIVE-READINESS-001 is closed by the native-ingest owner.

## 9. C1D.10C amendment log (C1D.10B P1 closure)

Historical C1D.10A statements are preserved in git history and in `s4a-contract.v1.json`; this table records BEFORE → AFTER for every merge-critical change.

| Finding | BEFORE (C1D.10A, contract v1) | AFTER (C1D.10C, contract v2) |
|---------|-------------------------------|------------------------------|
| P1-A S2 identity | S2 `inputEvidenceVersion` = combined input identity; the S2 key did not bind pvk, calibration bundle hash, boundary fingerprint or run purpose | `DI_V0_S4_EXECUTION_IDENTITY_V1` (11 components) written into `inputEvidenceVersion`; collision with a different identity → T08 `S2_EXECUTION_IDENTITY_MISMATCH` |
| P1-A naming | combined-identity field `channelSnapshotVersion` held a content hash | renamed `channelEvidenceHash` (`<format>:sha256:<hex>`); serialized values and V0_3 hashes unchanged |
| P1-B contract/validator | invariants in prose or hardcoded; 8/13 invalid contracts accepted | invariants encoded in 27 required sections; guard-driven race model; 47 invalid contracts rejected for the intended reason, 0 false accepts |
| P1-C tenancy | scope guard referenced a trip-level organization column (NONEXISTENT in Production) | trip → vehicle → organization join; validator scans the contract and all S4A docs for the nonexistent reference |
| P1-D control plane | one "kill switch" guard, env flag only | 6 default-OFF flags, EMPTY=NONE allowlists (intersection), disable-only DB kill row failing closed ([S4A_CONTROL_PLANE.md](S4A_CONTROL_PLANE.md)) |
| Lease timing | "run budget 240 s, hard ceiling 900 s (total per attempt including retries of a single provider call)" | 240 s single-attempt compute budget; 900 s cumulative lease lifetime ceiling from claim (`lease_acquired_at`) |
| Expired lease | T07/T08/T09 required epoch but not lease validity | every lease-holder write requires `LEASE_NOT_EXPIRED_DB_CLOCK`; after expiry only takeover, reaper, retirement reaper or drift watcher may write |
| Replay vs SKIPPED | replay pinned at create but SKIPPED requires no pin (unreachable CHECK) | replay/pinned ineligibility → FAILED_TERMINAL (`REPLAY_INELIGIBLE`); SKIPPED only for unpinned PRIMARY/REACQUISITION |
| Old pipeline versions | "superseded with `PIPELINE_RETIRED` by an operator step" | registry `di_v0_s4_pipeline_versions` + T12_RETIRE by the retirement reaper; claims require an ACTIVE pvk |
| Orchestration version | `DI_V0_S4_ORCHESTRATION_CONTRACT_V1` | `DI_V0_S4_ORCHESTRATION_CONTRACT_V2` (fixture pvk changed accordingly) |

## 10. C1D.10E amendment log (P1-E kill write-set)

| Finding | BEFORE (C1D.10C) | AFTER (C1D.10E) |
|---------|------------------|-----------------|
| P1-E kill while disabled | prose + `writesAllowedWhileDisabled=[T07]` but T03/T08/T09 had no `CONTROL_PLANE_DB_NOT_KILLED`; race model allowed heartbeat/terminal/skip after kill | `writesAllowedWhileKilled=[T07_FAIL_RETRYABLE]` only; all other transitions include `CONTROL_PLANE_DB_NOT_KILLED`; `authoritativeWrites` (19 classes) + `killPolicy.serialization` (kill read in same tx as mutation); pinned races **K01–K18**; validator exhaustiveness (65 negative cases) |
| Contract version | — | **unchanged** `DI_V0_S4A_CONTRACT_V2` (control-plane closure only; S2 execution identity / pvk / orchestration version unchanged) |
