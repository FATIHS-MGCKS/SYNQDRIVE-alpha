# EXP-021 C1D.10C — S4 authority / contract / validator closure

**Date:** 2026-09-27 · **Graph:** DI-EVID-EXP021-C1D10C-001 · **Decision:** DI-DEC-V0-S4A-CONTRACT-V2-001 (amends DI-DEC-V0-S4A-CONTRACT-001) · **PR:** #1810 (not merged in this task)

> CONTROLLED AUTHORITY AND CONTRACT CHANGE · NO RUNTIME IMPLEMENTATION · NO DEPLOY · PRODUCTION READ ONLY · NO PROVIDER MUTATION

Machine contract: [`design/s4a/s4a-contract.v2.json`](../design/s4a/s4a-contract.v2.json) (`DI_V0_S4A_CONTRACT_V2`, supersedes `DI_V0_S4A_CONTRACT_V1`; [`s4a-contract.v1.json`](../design/s4a/s4a-contract.v1.json) kept unchanged as history). Validator: `bash architecture/drivingintelligence/scripts/validate-s4a-contract.sh` (contract validator + red-team suite). New design authority: [`design/s4a/S4A_CONTROL_PLANE.md`](../design/s4a/S4A_CONTROL_PLANE.md).

## 1. Baselines

| Item | Value |
|------|-------|
| PR head before C1D.10C | `e5eb7150c35e9f6a638734b15c868133d7771c17` |
| `origin/main` at start | `60d55a670` (#1809, ERD evidence only) — `MAIN_DELTA_S4_SEMANTIC_CONFLICT=NO` |
| C1D.10B input | Read-only red-team of C1D.10A (result: 4 P1). Findings were reported in the agent run, not committed; they are reproduced in §2 and covered by the negative suite (§6) |

## 2. C1D.10B findings and closure

| P1 | C1D.10B finding | C1D.10C closure | Validator proof |
|----|-----------------|-----------------|-----------------|
| **P1-A** | S2 execution identity under-bound: the S2 idempotency key hashes `inputEvidenceVersion`, but C1D.10A wrote only the combined input identity there. Two executions differing in boundary fingerprint, pipeline version key, purpose, discriminator, pin or tenant could alias one S2 key | `DI_V0_S4_EXECUTION_IDENTITY_V1` = sha256 over `[version, organizationId, vehicleId, tripId, boundaryFingerprint, pipelineVersionKey, calibrationBundleHash, s4OrchestrationContractVersion, runPurpose, purposeDiscriminator, pinnedEvidenceSnapshotHash, combinedInputIdentity]`, written as S2 `inputEvidenceVersion`. S2 key function `buildDiV0ShadowRunIdempotencyKey` unchanged (no S2 runtime change). Collision with a different identity → T08 `S2_EXECUTION_IDENTITY_MISMATCH` (FAIL_CLOSED); same identity → `REUSE_SAME_EXECUTION_ONLY`. Forbidden components: workerId, lease epoch, wall clock, attempt. Identity layers kept distinct: logical key ≠ evidence key ≠ S2 execution identity | 11 fixture mutations → 11 distinct identities, **0 S2-key aliases**; N14–N17, N30, N34 |
| **P1-B** | Machine contract + validator did not enforce: 8 of 13 invalid mutations were accepted (e.g. illegal transitions, stale holder writes, missing guards) | Validator rewritten as an enforcing model: required sections, limits, per-transition guard rules, legal/illegal pair sets (14 legal / 42 illegal), replay rules, pipeline version, boundary fingerprint, channel model, S2 identity alias check, tenancy (contract + design docs), control-plane evaluator (23 scenarios), channel runs (11), migration, settlement, retirement, activation gates, and a guard-driven race model (R01–R25) | 47 negative cases, **0 false accepts, 0 wrong-reason rejections**; 21 positive cases, **0 false rejects**; the 13 original C1D.10B mutations are N01–N13; the whole v1 contract is rejected (N46) |
| **P1-C** | Tenancy scope guard referenced nonexistent `vehicle_trips.organization_id` | Tenancy authority `TRIP_VEHICLE_ORGANIZATION`: `EXISTS (SELECT 1 FROM vehicle_trips t JOIN vehicles v ON v.id = t.vehicle_id WHERE t.id = NEW.trip_id AND t.vehicle_id = NEW.vehicle_id AND v.organization_id = NEW.organization_id)` on work items, evidence snapshots and shadow runs; intervals must match the parent run. Precedent `vehicle_trip_route_artifact_scope_guard` (migration `20260829140000`). `dbEnforcementExistsToday=false` (S2 tenant integrity is repository-only until S4A). Contradiction DI-CONTRA-S4A-TENANCY-SCHEMA-001 RESOLVED | N18, N18B (any unmarked reference in contract or `design/s4a/*.md` rejected), N37; Production: `vehicle_trips.organization_id` columns = **0** |
| **P1-D** | Control plane incomplete: no flag set, allowlist semantics, kill switch, or pipeline retirement | [`S4A_CONTROL_PLANE.md`](../design/s4a/S4A_CONTROL_PLANE.md): flags `DI_V0_S4_MASTER_ENABLED`, `_DISCOVERY_`, `_WORKER_`, `_POSITION_` (mandatory), `_R1_`, `_NATIVE_` — default `false` via repo `parseBooleanEnv(value, false)`; allowlists `DI_V0_S4_ORGANIZATION_ALLOWLIST` / `DI_V0_S4_VEHICLE_ALLOWLIST` (token `^[A-Za-z0-9_-]{1,128}$`, EMPTY = NONE, any malformed token → whole list NONE, wildcard forbidden, duplicates collapse, effective scope = intersection); DB kill row `di_v0_s4_control` (`id='GLOBAL'`, not seeded → missing row = KILLED, read error = KILLED, read inside the gated transaction, only KILLED may be cached, disable-only — the row can never enable S4); pipeline registry `di_v0_s4_pipeline_versions` (ACTIVE / RETIRED, RETIRED → ACTIVE forbidden) with T12 retirement reaper | N19–N22, N35, N40, N41, N45; control-plane scenarios 23/23 |

## 3. Further contract corrections (C1D.10B P2 / edge findings)

| Topic | v2 contract |
|-------|-------------|
| State machine | 7 states, **13 transitions** (T12_RETIRE → SUPERSEDED `PIPELINE_RETIRED`, no successor; T13_HOLDER_SUPERSEDE fenced by holder). Every LEASE_HOLDER transition requires `EPOCH_MATCH` + `LEASE_NOT_EXPIRED_DB_CLOCK` (T07–T09 now included) |
| Expired lease | An expired holder writes nothing — no FAILED_RETRYABLE, FAILED_TERMINAL or SKIPPED (N23, N24); only a new claim (T04 takeover) moves the item |
| Replay vs SKIPPED | T09 requires `PIN_NOT_SET` + `RUN_PURPOSE_NOT_RECALIBRATION_REPLAY`; ineligible replay → T08 `REPLAY_INELIGIBLE` (N25) |
| Lease limits | work budget 240 s < lease 300 s; heartbeat 60 s; absolute ceiling 900 s = `MAX_CUMULATIVE_LEASE_LIFETIME_FROM_ATTEMPT_CLAIM`, anchor `lease_acquired_at`, heartbeat sets `LEAST(now + 300 s, lease_acquired_at + 900 s)` — the ceiling is not a single-compute permission (N27–N29) |
| Guards | `CONTROL_PLANE_WORKER_ENABLED` (T02, T04, T05, T06, T13), `CONTROL_PLANE_DISCOVERY_ENABLED` (T01), `CONTROL_PLANE_MAINTENANCE_ENABLED` (T10–T12), `PIPELINE_VERSION_ACTIVE` (T01, T02, T04, T06); `writesAllowedWhileDisabled` = T07 only (a disabled worker may release its own item) |
| Old pipeline retirement | Registry distinguishes `NO_ACTIVE_REPLICA_TEMPORARY` from `PIPELINE_RETIRED`; only retirement supersedes orphaned old-version items (N26, N39) |
| Combined identity | field `channelSnapshotVersion` renamed `channelEvidenceHash` (`<format>:sha256:<hex>`); V0_3 hash values unchanged (N17) |
| Versions | contract `DI_V0_S4A_CONTRACT_V2`, orchestration `DI_V0_S4_ORCHESTRATION_CONTRACT_V2` (N42); fixture pvk `DI_V0_S4_PIPELINE_V1:sha256:4d09bc46…5a4b67`; fixture boundary fingerprint unchanged; fixture S2 execution identity `DI_V0_S4_EXECUTION_IDENTITY_V1:sha256:63a5c563…9861a1` |
| Boundary mutations | `everyBoundaryMutationRearmsQuietTimer=false`: only **recorded** mutations (APPLIED `trip_repairs`) move the quiet anchor; unrecorded mutations are caught by fingerprint difference at attempt start (after claim) and in the completion transaction before the S2 write (N31, N44) |
| Migration | preconditions S2 empty (re-read, §5), checked by `IN_MIGRATION_DO_BLOCK_RAISE_EXCEPTION`; `DORMANT_ONLY`; seed rows NONE (N43); 4 new tables (work items, evidence snapshots, control, pipeline versions); no migration created in this task |
| Native | readiness authority `NONE_EXISTING`; legacy markers (`behaviorEnrichedAt`, `nativeQuerySucceeded`, V2 NATIVE_EVENTS COMPLETED, zero count) are not attestation → NOT_READY (N33) |
| Activation gates | `S4A_DORMANT_SCHEMA_MERGE` (S2 empty, flags default OFF, no caller); `REPLAY_CAPABLE_SHADOW` and `TINY_ACTIVATION` blocked by DI-GAP-S4-REPLAY-DESERIALIZER-001 (N32) and, for tiny activation, DI-GAP-S4-PROVIDER-BACKPRESSURE-001; `NATIVE_CHANNEL_ENABLE` blocked by DI-GAP-S4-NATIVE-READINESS-001 + DIM-GAP-007 |

## 4. Settlement time authority (timezone proof)

`vehicle_trips.start_time`, `end_time`, `created_at` and `trip_repairs.applied_at`, `created_at` are `timestamp without time zone`. Read-only Production evidence (2026-09-27):

| Check | Result |
|-------|--------|
| `current_setting('TimeZone')` | `Etc/UTC`, source configuration file; no role or database override (`pg_db_role_setting` empty for TimeZone) |
| Writer | `trip-reconciliation.service.ts` sets `appliedAt: new Date()` through Prisma (JS `Date` serialized as UTC) |
| Consistency | 209 APPLIED `trip_repairs`: `applied_at − created_at` (DB default `now()`) ∈ [−0.002 s, 0.738 s]; 0 rows applied before created |

Conclusion **CONFIRMED UTC**. Contract rule: every naive column is converted with `AT TIME ZONE 'UTC'` before comparison with S4 `timestamptz` columns.

## 5. S2 empty precondition re-read (Production, read only)

`2026-09-27 17:01:15 UTC` (`default_transaction_read_only=on`): `di_v0_shadow_runs` = 0, `di_v0_shadow_intervals` = 0; `pg_stat_user_tables` n_tup_ins / upd / del = 0 / 0 / 0 for both; tables matching `di_v0_s4%` = 0; `vehicle_trips.organization_id` columns = 0. The execution-identity change is therefore applied before any S2 row exists; no backfill or rehash is needed.

ID format check (read only): 4 organizations (1 non-UUID), 9 vehicles (1 non-UUID), 2 336 trips (all UUID); all match the allowlist token pattern; 0 trips without a vehicle.

## 6. Validation

| Suite | Result |
|-------|--------|
| `validate-s4a-contract.mjs` on v2 | PASS (8 design docs scanned) |
| Negative suite | `NEGATIVE_CONTRACT_CASES=47`, `FALSE_ACCEPT=0`, wrong-reason rejections 0 (N01–N46 + N18B; each case must fail with its expected reason) |
| Positive suite | `POSITIVE_CONTRACT_CASES=21` (6 contract variants P01–P06 + 15 behavior scenarios), `FALSE_REJECT=0` |
| Frozen v1 | rejected under v2 invariants (N46) — v1 file unchanged |

## 7. Contract version bump record

| Field | V1 (C1D.10A) | V2 (C1D.10C) | Why |
|-------|--------------|--------------|-----|
| `contractVersion` | `DI_V0_S4A_CONTRACT_V1` | `DI_V0_S4A_CONTRACT_V2` | semantic change of S2 identity, tenancy, state machine, control plane |
| Orchestration version | `…_V1` | `DI_V0_S4_ORCHESTRATION_CONTRACT_V2` | enters the pvk, so V1 and V2 executions never share a key |
| Transitions | 11 | 13 | retirement + holder supersession |
| S2 `inputEvidenceVersion` | combined input identity | S2 execution identity | P1-A |
| Tenancy | `vehicle_trips.organization_id` (NONEXISTENT) | TRIP_VEHICLE_ORGANIZATION | P1-C |
| Combined identity field | `channelSnapshotVersion` | `channelEvidenceHash` | unambiguous hash format |

## 8. Zero-runtime audit

`git diff origin/main...HEAD` touches only `architecture/**` and the SynqDrive Code views (`frontend/src/master/components/ChangesView.tsx`, `ArchitekturView.tsx`). No change under `backend/src/**`, `backend/prisma/**` (no migration, no schema), no Nest registration, worker, scheduler, BullMQ wiring, provider acquisition runtime, DB writer, endpoint, detector, threshold or learning code. No Production write, flag change, deploy or provider mutation.

## 9. P2 reconciliation

Classes: `CLOSED` · `OPEN_ACCEPTED_FOR_S4A` (tracked, does not block the dormant S4A slice) · `PROMOTED_P1` (raised into a P1 closure) · `NOT_APPLICABLE`.

| # | Item | Class | Resolution / owner |
|---|------|-------|--------------------|
| 1 | Provider backpressure | OPEN_ACCEPTED_FOR_S4A | Request context + shared budget authority fixed in contract; circuit breaker DI-GAP-S4-PROVIDER-BACKPRESSURE-001 (S4C) blocks TINY_ACTIVATION |
| 2 | 240 s budget vs 900 s ceiling | CLOSED | §3 lease limits; N27–N29 |
| 3 | Expired-lease edge writes | PROMOTED_P1 → CLOSED | part of P1-B; DB-clock expiry on T07–T09; N23, N24 |
| 4 | Replay may become SKIPPED | CLOSED | T09 guard + `REPLAY_INELIGIBLE`; N25 |
| 5 | Old-version orphans | CLOSED | pipeline registry + T12 retirement; N26, N39 |
| 6 | `trip_repairs.applied_at` timezone | CLOSED | §4 proof |
| 7 | Unrecorded boundary changes | CLOSED | fingerprint re-check at attempt start and in completion tx; N31, N44 |
| 8 | Snapshot deserializer | OPEN_ACCEPTED_FOR_S4A | DI-GAP-S4-REPLAY-DESERIALIZER-001 (S4D); blocks REPLAY_CAPABLE_SHADOW + TINY_ACTIVATION (N32) |
| 9 | Cascade deletion audit | OPEN_ACCEPTED_FOR_S4A | DI-GAP-S4-SHADOW-DELETION-AUDIT-001; CASCADE stays mandatory |
| 10 | Location retention | OPEN_ACCEPTED_FOR_S4A | DI-GAP-S4-LOCATION-RETENTION-001; governance note gate for TINY_ACTIVATION |
| 11 | Gear authority | NOT_APPLICABLE | gear removed from V0_3 (DI-GAP-S3B-R1-FIELD-AUTHORITY-001 residual); no S4 effect |
| 12 | Multi-sample R1 AVG | OPEN_ACCEPTED_FOR_S4A | versioned by query spec in the pvk; S4F metric |
| 13 | Unversioned DIMO schema | OPEN_ACCEPTED_FOR_S4A | `MALFORMED` fails closed; introspection check before scale-up |
| — | C1D.10A P2 #1, #3, #4, #6 (designed in S4A) | CLOSED at contract level | unchanged by C1D.10C |
| — | C1D.10A P2 #8 (V2 flag wording) | CLOSED | unchanged |

Open P1: **0**. Items blocking S4A dormant implementation: **0**. Items blocking tiny activation: #1, #8, #10 (+ operator authorization).

## 10. Non-effects

No S4 worker, scheduler, runtime caller, migration, table, flag, seed row or provider call exists. S2 runtime and key function unchanged. DIMO Integration and Trips: consulted, no code change. DI V0 remains dormant and not customer-facing.
