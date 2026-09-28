# EXP-021 S4A — Dormant execution foundation implementation (2026-09-27)

| Field | Value |
|-------|-------|
| **Evidence ID** | DI-EVID-EXP021-S4A-IMPL-001 |
| **Slice** | EXP-021 S4A (CONTROLLED_IMPLEMENTATION) |
| **Authority built from** | `design/s4a/s4a-contract.v2.json` (`DI_V0_S4A_CONTRACT_V2`) on `main` @ `5bcecc6c6` (merge of PR #1810) — **unchanged by this slice** |
| **Branch / PR** | Merged PR #1816 → `main` @ merge commit `2c321823a` (2026-09-28); implementation head `77d112dbab1a49e3f1b3c62a5b313c4b77da5f46` |
| **Epistemic** | CONFIRMED for code/test facts and the read-only Production baseline; INFERRED where marked |
| **Decision** | DI-DEC-V0-S4A-IMPL-001 (`PROPOSED`) |
| **Runtime effect** | None. No caller, no Nest provider, no worker, no queue, no scheduler, no provider call, no flag change, no Production write or deploy |

## 1. What was built

| Area | Path | Contract section |
|------|------|------------------|
| Migration (4 tables + S2 guards, empty-S2 precondition) | `backend/prisma/migrations/20260927200000_di_v0_s4a_dormant_foundation/migration.sql` | `migration`, `migrationRules`, `tenancy.scopeGuards` |
| Prisma models (no runtime delegate use) | `backend/prisma/schema.prisma` | `migration.newTables` |
| Contract mirror (versions, limits, 7 states, 13 transitions, 19 write classes, kill policy, manifest keys, channel rules) | `s4a-foundation/di-v0-s4a-contract.ts` | whole contract |
| State machine (no generic setter) | `s4a-foundation/di-v0-s4a-state-machine.ts` | `transitions`, `mustBeIllegal` |
| Identities: pipeline key, boundary fingerprint, combined input identity V0_3, execution identity V1, evidence container V1 | `s4a-foundation/di-v0-s4a-identity.ts` | `pipelineVersion`, `boundaryFingerprint`, `combinedInputIdentity`, `s2ExecutionIdentity`, `replay` |
| Control plane (pure; env snapshot passed in, never read) | `s4a-foundation/di-v0-s4a-control-plane.ts` | `controlPlane`, `killPolicy` |
| Fenced S2 persistence | `s4a-foundation/di-v0-s4a-s2-fenced-persistence.ts` | `s2ExecutionIdentity.collision`, T06 |
| Work-item repository (one method per transition) | `s4a-foundation/di-v0-s4a-work-item.repository.ts` | T01–T13, `authoritativeWrites` |
| Tests | `s4a-foundation/__tests__/*` | `fixtures.*` |
| Ephemeral Postgres tooling | `backend/scripts/test/di-v0-s4a-postgres-bootstrap.sh`, `di-v0-s4a-postgres-ci.sh`, `di-v0-s4a-strip-to-pre-s4a.sql`; npm `test:di:s4a`, `test:di:s4a:postgres` | — |

### 1.1 Mechanisms

- **Lock order (every transition):** work-item row `FOR UPDATE` (claim: `FOR UPDATE SKIP LOCKED`), then `SELECT kill_state FROM di_v0_s4_control WHERE id='GLOBAL' FOR UPDATE`, then pipeline registry `FOR SHARE`. The kill read happens before any fence check. For a claim, the control row is locked even when there is no candidate, so a kill reason beats `NO_CLAIMABLE_WORK_ITEM`.
- **Kill row:** missing, unreadable or malformed means KILLED (`evaluateDiV0S4KillRow`). Only T07 (`failRetryable`) reads no control state. No production code writes `di_v0_s4_control`; `W_CONTROL_ROW_OPERATOR_UPDATE` has no code path.
- **Enablement:** WORKER role for T02/T04/T05/T06/T13; MASTER ∧ NOT_KILLED for T03/T08/T09/T10/T11/T12; DISCOVERY role for T01. Default config is all OFF with EMPTY=NONE allowlists.
- **Lease / fencing:** the holder predicate is `id, lease_epoch, lease_owner, status='LEASED', lease_expires_at > clock_timestamp()`. Takeover requires `lease_expires_at < clock_timestamp()`. Heartbeat sets `LEAST(clock_timestamp()+300 s, lease_acquired_at+900 s)`. T07 backoff is `[900, 3600, 14400, 14400, 14400][attempt−1]` and requires `attempt_count < 5`. Transactions are READ COMMITTED.
- **Tenancy:** the organization always comes from `vehicle_trips → vehicles.organization_id`, inside the transaction. Caller-supplied scope is only compared, never trusted. The DB enforces it through scope-guard triggers on `di_v0_s4_work_items`, `di_v0_s4_evidence_snapshots`, `di_v0_shadow_runs` and `di_v0_shadow_intervals`, plus composite FKs (`(id, organization_id, trip_id)`) from work items to S2 runs, snapshots and successors.
- **S2 fenced persistence (T06):** inside the holder transaction, `INSERT … ON CONFLICT (organization_id, idempotency_key) DO NOTHING` runs first. The existing row is then compared on its full execution identity (`inputEvidenceVersion`); a mismatch is `S2_EXECUTION_IDENTITY_MISMATCH` and the transaction rolls back. The S2 idempotency key function `buildDiV0ShadowRunIdempotencyKey` is unchanged.
- **Channel policy V1 source-family rule:** a flag-on optional channel is `NOT_APPLICABLE` exactly when the item's `source_family` is outside `channelPolicyV1{R1,Native}ApplicableFamilies` (`['RUPTELA_R1']`). A flag-off channel must be `DISABLED`. Only `POSITION=PRESENT` is runnable.

### 1.2 Stricter than the contract (fail-closed choices, no semantic change)

| Choice | Contract text | Implementation |
|--------|---------------|----------------|
| T01 trip state | eligible trip | trip must be `COMPLETED` with `end_time` set, else `TRIP_NOT_COMPLETED` |
| Replay snapshot | pinned snapshot | replay snapshot `boundary_fingerprint` must equal the current fingerprint |
| T05 | pin evidence | channel-run verdict must be `RUNNABLE` (`CHANNEL_SET_NOT_RUNNABLE` otherwise) |
| T06 | complete with S2 | re-gunzips (bounded by `maxOutputLength`), re-hashes, checks the container header and manifest lines, and recomputes the combined input identity before writing S2 |
| Runtime manifest | pipeline manifest | `channelEnablement` must equal the replica flags; orchestration V2, identity V0_3, FP_V1 and policy V1 must match; `evidenceSnapshotContainerVersion` is **not** compared (DI-CONTRA-S4A-CONTAINER-VERSION-NAMING-001) |
| Supersession reason | reason set | `TRIP_CANCELLED` requires trip `CANCELLED`; `TRIP_NOT_COMPLETED` requires `ONGOING` |

## 2. Test evidence (local PostgreSQL 16, real multi-connection)

| Suite | File | Result |
|-------|------|--------|
| Contract parity (TS mirror == JSON) | `di-v0-s4a-contract-parity.spec.ts` | 9 / 9 |
| Fixtures + state machine (14 legal / 42 illegal pairs, all `mustBeIllegal`, pipeline / boundary / combined / execution identity fixtures and mutations, 23 control-plane scenarios, 11 channel-run scenarios, family rule, container) | `di-v0-s4a-fixtures.spec.ts` | 98 / 98 |
| Dormant-by-construction audit | `di-v0-s4a-dormant-audit.spec.ts` | 7 / 7 — `DI_S4A_RUNTIME_CALL_SITE_COUNT=0` |
| Races R01–R25, kill races K01–K18, KS1–KS3, all-off default, tenancy, immutability, fingerprint | `di-v0-s4a-races.postgres.integration.spec.ts` | 51 / 51 (plus 3 + 3 stability reruns, 51 / 51 each) |
| Migration M01–M08 | `di-v0-s4a-migration.postgres.integration.spec.ts` | 10 / 10 |
| **Total S4A** | `npx jest s4a-foundation --runInBand` (Postgres env set) | **175 / 175** |

Race mechanics: a barrier transaction holds the control row. Each competitor starts only after the previous one is seen in `pg_stat_activity` as a `Lock` waiter, which makes PostgreSQL's lock queue order equal the fixture order. There are no sleeps. Time is simulated by shifting mutable lease timestamps. The registry is global and `RETIRED` is permanent, so each scenario salts `calibrationBundleHash`. The R24 harness appends a `['create','d-next','PRIMARY']` step (DI-CONTRA-S4A-T13-SUCCESSOR-WRITE-BINDING-001).

Every scenario asserts: no stale write succeeds, at most one active PRIMARY exists, the S2 row count matches, and K-race rejections match `^DB_KILL_`.

| Kill proof | Result |
|------------|--------|
| KS1 holder takes the control lock first | the operator kill waits; the completion commits whole |
| KS2 operator kill takes the control lock first | the in-flight completion blocks, then rejects `DB_KILL_ACTIVE`; no S2 row; T07 still relinquishes |
| KS3 concurrent stale completion vs takeover | exactly one epoch wins; the stale S2 write never commits (`LEASE_NOT_HELD`) |

### 2.1 Migration cases

| Case | Observed |
|------|----------|
| M01 empty S2 | applies; exactly 4 new tables; 0 rows in S4 and S2 tables; no control row seeded |
| M02 S2 rows (psql) | `S4A migration requires empty S2 tables`; the whole catalog and row snapshot are unchanged |
| M02b S2 rows (`prisma migrate deploy`) | refuses. Prisma reports `current transaction is aborted` (the statement after the RAISE) and records the migration as failed (`finished_at` NULL). No S4 objects. An operator would need `prisma migrate resolve --rolled-back` |
| M03 open S2 writer | fails after `lock_timeout` (≥ 4.5 s, < 30 s); no partial objects |
| M04 open canonical `vehicle_trips` transaction | migration yields with a lock timeout (the FK needs `SHARE ROW EXCLUSIVE` on `vehicle_trips` / `vehicles` / `organizations`); the canonical write commits |
| M05 concurrent short canonical inserts | all commit; migration succeeds |
| M06 no rewrite / no side effect | every pre-existing table keeps its `relfilenode` and xmin+row hash; no trigger, index or constraint is added to canonical tables; S2 gains only `di_v0_shadow_runs_id_scope_uq` and 2 scope triggers; 7 new functions |
| M07 tenancy triggers | cross-tenant inserts into work items, snapshots, S2 runs and intervals, and S2 org updates, fail with `scope mismatch` |
| M08 rerun | a second psql apply fails (`already exists`) with the catalog unchanged; `prisma migrate deploy` applies once, then `No pending migrations to apply` |

**Reversibility:** `di-v0-s4a-strip-to-pre-s4a.sql` applied to a full deploy gives a `pg_dump --schema-only` byte-identical to a pristine pre-S4A database (14,258 lines; only pg_dump's random `\restrict` token differs), with the same 363 applied migrations.

## 3. Read-only Production baseline (2026-09-27T21:52Z)

Session: `sudo -u postgres psql -d synqdrive` with `default_transaction_read_only=on` (`txn_read_only=on`). No write was issued.

| Fact | Value |
|------|-------|
| Deployed release | `/opt/synqdrive/releases/20260927212254_v4994` at `5bcecc6c6` = `main` merge base of this branch (the earlier drift, release `7d3b7ed9` not an ancestor of main, has resolved) |
| `di_v0_shadow_runs` / `di_v0_shadow_intervals` rows | 0 / 0 (`n_tup_ins` 0) |
| S4 tables / S4 guard functions | 0 / 0 |
| S4A migration applied | no; last migration `20260927140000_battery_longitudinal_reconciliation_freshness_authority` (same as the local pre-S4A template) |

**Merge consequence:** `vps-deploy-release.sh` always runs `prisma:migrate:deploy`, so merging this PR and deploying applies the S4A migration to Production. The precondition (S2 empty) holds as of this reading. If S2 gains rows before that deploy, the migration refuses and leaves a failed migration record (M02b).

## 4. Contradictions and drift (recorded, not silently fixed)

| ID | Summary | Status |
|----|---------|--------|
| DI-CONTRA-S4A-T13-SUCCESSOR-WRITE-BINDING-001 | T13 lists `SUCCESSOR_SAME_TENANT_AND_TRIP_OR_NULL` and R24 expects `itemCount: 2`, but `W_SUCCESSOR_PRIMARY_INSERT` is bound only to T11. The implementation writes no successor in T13; the R24 harness creates the successor as a separate T01 | OPEN (authority clarification; no semantic change made) |
| DI-CONTRA-S4A-CONTAINER-VERSION-NAMING-001 | Fixture manifest `evidenceSnapshotContainerVersion = DI_V0_S4_EVIDENCE_SNAPSHOT_V1`, but the container, DB CHECK and design doc use `DI_V0_S4_EVIDENCE_CONTAINER_V1`. The runtime manifest check does not compare this key | OPEN |
| DI-CONTRA-S4A-ON-UPDATE-CASCADE-IMMUTABILITY-001 | Canonical FKs use `ON UPDATE CASCADE`, while S4 immutability and scope triggers reject changes to scope columns, so an update to a canonical PK (`organizations.id`, `vehicles.id`, `vehicle_trips.id`) that has S4 rows would fail. This conflicts with `NO_CONSTRAINT_THAT_CAN_FAIL_A_CANONICAL_WRITE_OR_DELETE`. Canonical PK updates are INFERRED not to happen (no code path found); deletes cascade normally | OPEN (P2) |
| Drift: contract `migration.migrationCreated: false` | The migration now exists. The field is a C1D.10C historical snapshot and is left unchanged, because changing the contract is out of scope | RECORDED |

## 5. Gaps

| ID | Status | Note |
|----|--------|------|
| DI-GAP-S4A-BOUNDARY-REVERT-SUCCESSOR-001 | OPEN (new) | T11 creates a successor only when the predecessor is PRIMARY, the trip is COMPLETED, the tenant is the same, the registry is ACTIVE and the logical key is free. A boundary revert to an earlier fingerprint whose key is taken by a SUPERSEDED row gets no successor (proven by the race suite) |
| DI-GAP-S4A-POSTGRES-CI-WIRING-001 | **CLOSED** (2026-09-28) | `.github/workflows/s4a-postgres-integration.yml` + `npm run test:di:s4a:postgres:ci`; evidence [EXP021_S4A_POSTGRES_CI_WIRING.md](EXP021_S4A_POSTGRES_CI_WIRING.md) |
| DI-GAP-S4A-CONTROL-ROW-SERIALIZATION-001 | OPEN (new, P2) | Every transition takes the singleton control row `FOR UPDATE`, which serializes all S4 writes globally. This is correct for kill serialization, but it is a throughput ceiling to revisit before multi-worker scale |
| DI-GAP-S4-REPLAY-DESERIALIZER-001 | OPEN (unchanged) | No deserializer; replay-capable shadow and tiny activation stay blocked |
| DI-GAP-S4-PROVIDER-BACKPRESSURE-001 | OPEN (unchanged) | S4C scope |
| DI-GAP-S4-NATIVE-READINESS-001 | OPEN (unchanged) | Native `NOT_READY` only under policy V1 |
| DI-GAP-S4-LOCATION-RETENTION-001 | OPEN (unchanged) | Snapshots carry `retention_until = clock_timestamp()+90 d`; no purge job exists (dormant) |
| DI-GAP-S4-SHADOW-DELETION-AUDIT-001 | OPEN (unchanged) | |
| DI-GAP-S2-IN-TX-CREATE-RACE-001 | OPEN (unchanged) | The S4 path uses `ON CONFLICT DO NOTHING` + identity compare, but the S2 library path is unchanged |

All C1D.10A/C1D.10C P2 items remain as recorded. None was closed or downgraded by this slice.

## 6. Non-effects

No S4 discovery sweeper, scheduler registration, cron, BullMQ queue/producer/consumer, worker, runtime bootstrap or Nest provider registration. No trip discovery, provider acquisition, DIMO API call, R1 or native acquisition, S1 automatic compute or S2 automatic persistence. No customer, admin or ops endpoint. No feature activation, flag change, allowlisting, threshold, calibration or online learning. No acceleration, braking or coasting logic. No Production deployment, migration or write. S1/S2/S3A/S3B behavior is unchanged: the S2 public-API isolation spec now excludes `s4a-foundation`, whose own isolation the dormant audit proves.

## 7. Validation commands

```bash
cd backend && npm run test:di:s4a                                   # parity + fixtures + dormant audit (114)
DI_V0_S4A_PG_ADMIN_URL=postgresql://<local-admin>@127.0.0.1:5432/postgres npm run test:di:s4a:postgres   # M01–M08 + races (61)
bash architecture/drivingintelligence/scripts/validate-s4a-contract.sh
bash architecture/drivingintelligence/scripts/validate-graph.sh
bash architecture/drivingintelligence/scripts/validate-docs.sh
bash architecture/scripts/validate-module-registry.sh
```
