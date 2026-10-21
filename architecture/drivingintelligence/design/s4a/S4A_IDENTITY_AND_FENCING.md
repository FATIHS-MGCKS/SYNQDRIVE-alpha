# S4A — Identity hierarchy and fencing (P1-2, closed at contract level)

**Contract:** `identity`, `identityLayers`, `s2ExecutionIdentity`, `executionAuthority`, `runPurposes`, `pipelineVersion`, `boundaryFingerprint`, `limits`, `fixtures.races` in [`s4a-contract.v2.json`](s4a-contract.v2.json) (**AMENDED BY C1D.10C**; v1 historical) · **Parent:** [S4A_CONTRACT_DESIGN.md](S4A_CONTRACT_DESIGN.md) · **Threats:** [S4A_THREAT_MODEL.md](S4A_THREAT_MODEL.md)

## 1. Identity hierarchy

| Level | Key | Purpose | Enforced by |
|-------|-----|---------|-------------|
| 1. Trip anchor | (`organization_id`, `vehicle_id`, `trip_id`) | tenant and trip | canonical FKs + scope-guard trigger |
| 2. Boundary fingerprint | `DI_V0_S4_BOUNDARY_FP_V1:sha256:…` | which boundary version of the trip | builder (pure), drift watcher re-hash |
| 3. Pipeline version key | `DI_V0_S4_PIPELINE_V1:sha256:…` | which code/config computed it | builder (pure), manifest stored next to the key |
| 4. **Logical key** (`LOGICAL_KEY_FINAL`) | (`organization_id`, `trip_id`, `boundary_fingerprint`, `pipeline_version_key`, `run_purpose`, `purpose_discriminator`, `boundary_occurrence`) — occurrence monotonic per trip for **PRIMARY** only ([S4A_BOUNDARY_REVERT_AUTHORITY.md](S4A_BOUNDARY_REVERT_AUTHORITY.md)) | one work item per logical question | `di_v0_s4_wi_logical_key_uq` |
| 5. Active PRIMARY | (`organization_id`, `trip_id`, `pipeline_version_key`) WHERE PRIMARY ∧ ≠ SUPERSEDED | at most one live authoritative answer | `di_v0_s4_wi_active_primary_uq` |
| 6. Evidence key | (`organization_id`, `snapshot_hash`) | content-addressed input | unique + re-hash on load |
| 7. **S2 result execution identity** (C1D.10C, **AMENDED C1D.10F**) | `DI_V0_S4_EXECUTION_IDENTITY_V2:sha256:…` (adds `boundaryOccurrence`), carried in S2 `inputEvidenceVersion`, enforced through (`organization_id`, `idempotencyKey`) | one persisted S2 run per semantic execution | existing S2 unique + identity comparison on conflict (§4a) |
| 8. Fencing token | (`work_item_id`, `lease_epoch`) | which lease holder may write | conditional updates + row lock |

`WORK_ITEM_LOGICAL_IDENTITY` (level 4) ≠ `EVIDENCE_IDENTITY` (level 6) ≠ `S2_RESULT_EXECUTION_IDENTITY` (level 7): the logical key names the question, the evidence key names the input bytes, the execution identity names the complete semantic computation (question + input + versions). Contract `identityLayers`; the validator rejects evidence components in the logical key and requires every logical-key component inside the execution identity.

`excludedFromEveryHash`: `createdAt`, `updatedAt`, `leaseOwner`, `leaseEpoch`, `workerId`, `hostname`, `attemptCount`, `acquiredAtWallClock`, `bullmqJobId`, `workItemId`. Identity never depends on who ran it, when, or how often (validator: the fixtures reject `workerId` in the manifest).

## 2. Run purposes (`RUN_PURPOSE_MODEL_FINAL`)

| Purpose | Discriminator | Provider acquisition | Authoritative | Pin source |
|---------|---------------|:--------------------:|:-------------:|-----------|
| PRIMARY | constant `PRIMARY` | yes (once, then pinned) | **yes** | first terminal acquisition |
| RECALIBRATION_REPLAY | replay source snapshot hash | **never** | no | existing snapshot, pinned at create |
| REACQUISITION | operator request id | yes | no | first terminal acquisition |

- Only PRIMARY answers "the DI V0 result of this trip for this pipeline". REPLAY and REACQUISITION are experiments and never compete for the active-PRIMARY slot.
- REPLAY items are created already pinned (`pinned_snapshot_hash = replay_source_snapshot_hash`, CHECK). The worker skips acquisition, so `LIVE_DIMO_REQUERY_IS_REPLAY = NO` holds by construction.
- The REACQUISITION discriminator is caller-chosen and bounded; two concurrent requests with the same id collapse into one item (R12).

## 3. Pipeline version key (`PIPELINE_VERSION_IDENTITY_FINAL`)

`DI_V0_S4_PIPELINE_V1:sha256(JSON.stringify(sortedEntries(manifest)))`. There are 20 required keys (contract `pipelineVersion.requiredKeys`): structural, estimator, calibration version **and `calibrationBundleHash`**, source-family policy, channel policy, combined-identity version, evidence container version, S4 orchestration contract version, S2 shadow record version, boundary fingerprint version, and per channel the adapter version, query spec id and snapshot version, plus **`channelEnablement`**.

- `calibrationBundleHash` closes N4: `CALIBRATION_UNSET_V0_BUNDLE` is a label, and a label can alias different numeric content. The hash is over the bundle's canonical numeric content.
- `channelEnablement` (for example `{"POSITION":true,"R1_OBD":true,"NATIVE_EVENT":false}`): enabling a channel changes what was asked, so it gets a new pvk rather than reinterpreting old items.
- The key is order-independent (validator reorders keys and asserts the same hash) and every mutation of any value changes it (validator: `pipelineVersionMutations`).
- **Mixed-version replicas:** during a rolling PM2 restart, `synqdrive` and `synqdrive-b` can run different code. T02, T04 and T06 carry `PIPELINE_VERSION_MATCH`: a worker claims and completes only items whose `pipeline_version_key` equals its own computed key. An old replica therefore never completes a new-version item or the reverse (races R15, R16). **AMENDED BY C1D.10C:** v1 said retired pvks are superseded by an operator step. Now the operator marks the pvk RETIRED in `di_v0_s4_pipeline_versions`, and the leader-guarded retirement reaper moves every non-terminal item to SUPERSEDED(`PIPELINE_RETIRED`) via T12 ([control plane §5](S4A_CONTROL_PLANE.md), races R20, R21). "No replica currently computes this pvk" is a different, temporary condition: the item waits unchanged.

## 4. Boundary fingerprint

`DI_V0_S4_BOUNDARY_FP_V1:sha256(JSON.stringify([version, organizationId, vehicleId, tripId, tripStatus, startTimeIso, endTimeIsoOrNull, dimoSegmentIdOrNull, mergeParentTripIdOrNull, boundaryRepairGenerationOrNull]))`. Timestamps use `toISOString()`.

| Included | Why |
|----------|-----|
| `tripStatus` | COMPLETED→ONGOING (merge reopen) and →CANCELLED (discard) must supersede |
| `startTime`, `endTime` | split, extension and repair change the window |
| `dimoSegmentId` | segment is the canonical boundary source (DIMO rule) |
| `mergeParentTripId` | merge lineage |
| `boundaryRepairGeneration` | from `readCurrentBoundaryRepairGeneration` (`auditId\|segment\|start\|end`): a repair that re-lands on identical times still marks a new generation |

| Excluded | Why |
|----------|-----|
| `boundaryRefresh.state/stages/attempts` | refresh bookkeeping churns without changing boundaries, and would cause supersession storms |
| `tripSource`, `isRepaired` | provenance, not boundary |
| distance, speeds, duration, `behaviorEnrichedAt`, analysis statuses | derived. Duration is implied by start/end |

**Organization source (C1D.10C).** `organizationId` = `vehicles.organization_id` of the vehicle referenced by `vehicle_trips.vehicle_id`, resolved by the repository from canonical rows. A caller-supplied organization is never trusted. The field list is unchanged from C1D.10A, so the fixture fingerprint is unchanged; only the source of `organizationId` is now explicit.

**Known fragility.** `discardTrip` and `splitTripAtGap` overwrite `rawDetectionMeta`, which can erase `boundaryRepair` and change `boundaryRepairGeneration` to NULL. That is a fingerprint change and leads to supersession: fail-safe (an extra item) rather than fail-silent.

## 4a. S2 execution identity (`DI_V0_S4_EXECUTION_IDENTITY_V2`, P1-A, C1D.10C, C1D.10F)

**AMENDED BY C1D.10F:** V2 adds `boundaryOccurrence` after `boundaryFingerprint` so a boundary revert cannot alias a prior COMPLETED S2 row. V1 remains historical for pre-amendment references only.

**Definition (V2).** Same component list as V1 with `boundaryOccurrence` inserted after `boundaryFingerprint` (see `s2ExecutionIdentity.components` in contract v2).

## 4a-hist. S2 execution identity V1 (`DI_V0_S4_EXECUTION_IDENTITY_V1`, superseded by V2)

**Problem (C1D.10B).** The S2 key is `sha256(tripId|sourceFamily|structural|estimator|calibrationVersion|sourceFamilyPolicy|inputEvidenceVersion)`. In C1D.10A, `inputEvidenceVersion` was the combined input identity, so two work items differing only in `pipelineVersionKey`, `calibrationBundleHash`, S4 orchestration version, boundary fingerprint or run purpose could alias to one persisted S2 run.

**Definition.** `DI_V0_S4_EXECUTION_IDENTITY_V1:sha256(JSON.stringify([version, organizationId, vehicleId, tripId, boundaryFingerprint, pipelineVersionKey, calibrationBundleHash, s4OrchestrationContractVersion, runPurpose, purposeDiscriminator, pinnedEvidenceSnapshotHash, combinedInputIdentity]))`. `calibrationBundleHash` and `s4OrchestrationContractVersion` are already inside the pvk and are bound again explicitly; they must equal the manifest values (validator).

**Binding into S2 without an S2 runtime change.** S4 passes the full execution identity string as S2 `inputEvidenceVersion`. The unchanged S2 key function therefore binds every component. The validator proves 0 S2-key aliases by mutating each component. Excluded: worker, lease owner/epoch, attempt count, wall-clock acquisition time, work item id, BullMQ id.

| Invariant | Result |
|-----------|--------|
| different `pipelineVersionKey` / `calibrationBundleHash` / `boundaryFingerprint` / `runPurpose` / discriminator / evidence / orchestration version | different identity and different S2 key |
| same semantic execution | same identity (stable across retries and replicas) |
| wall clock, `acquiredAt`, worker, epoch, attempt | no effect (not components) |

**Collision behavior.** T06 uses `INSERT … ON CONFLICT (organization_id, idempotency_key) DO NOTHING RETURNING id`. If no row is returned, it reads the stored run and compares `input_evidence_version`, `organization_id`, `vehicle_id` and `trip_id`. Equal means the same semantic execution: reuse is allowed. Different means `FAIL_CLOSED / TERMINAL_CONTRACT_VIOLATION`: the completion transaction rolls back, and the lease holder writes T08 `S2_EXECUTION_IDENTITY_MISMATCH` (race R25). A result from a different semantic execution is never reused. `S2_SEMANTIC_ALIAS_POSSIBLE = NO`.

## 5. Lease authority (`LEASE_AUTHORITY_FINAL`, AMENDED BY C1D.10C)

The DB row is the lease. `LEASE_DURATION` 300 s, `HEARTBEAT_INTERVAL` 60 s, `WORK_EXECUTION_BUDGET` 240 s (one attempt's compute budget; the worker aborts itself), `ABSOLUTE_LEASE_LIFETIME_CEILING` 900 s. The ceiling is the maximum cumulative lifetime of one attempt's lease, measured from `lease_acquired_at` (set by T02/T04) and including every heartbeat extension. It is **not** permission for a 900 s compute attempt: a correct worker stops at 240 s, and the ceiling only bounds a worker whose budget enforcement failed but which keeps heartbeating (race R19). The v1 wording ("hard ceiling 900 s, total per attempt including retries of a single provider call") is superseded. All expiry comparisons use `clock_timestamp()` in SQL, never the worker's wall clock, so replica clock skew cannot extend a lease.

**Claim** (T02/T04, one statement):

```sql
WITH c AS (
  SELECT id FROM di_v0_s4_work_items
  WHERE pipeline_version_key = $pvk AND attempt_count < 5
    AND EXISTS (SELECT 1 FROM di_v0_s4_pipeline_versions p WHERE p.pipeline_version_key = $pvk AND p.status = 'ACTIVE')
    AND EXISTS (SELECT 1 FROM di_v0_s4_control k WHERE k.id = 'GLOBAL' AND k.kill_state = 'NOT_KILLED')
    AND ((status IN ('PENDING','FAILED_RETRYABLE') AND next_attempt_at <= clock_timestamp())
      OR (status = 'LEASED' AND lease_expires_at < clock_timestamp()))
  ORDER BY next_attempt_at NULLS FIRST LIMIT $n
  FOR UPDATE SKIP LOCKED)
UPDATE di_v0_s4_work_items w SET status='LEASED', lease_epoch=w.lease_epoch+1,
  attempt_count=w.attempt_count+1, lease_owner=$owner,
  lease_acquired_at=clock_timestamp(), lease_expires_at=clock_timestamp()+interval '300 seconds', last_heartbeat_at=clock_timestamp(),
  next_attempt_at=NULL
FROM c WHERE w.id=c.id RETURNING w.id, w.lease_epoch;
```

Env flags and allowlists are evaluated by the worker before it issues the statement (the claim is additionally restricted to allowlisted `organization_id` / `vehicle_id` values); the kill row and the registry are evaluated inside the statement, so a kill committed by an operator is seen by every replica's next claim ([control plane](S4A_CONTROL_PLANE.md)).

**Heartbeat** (T03): `UPDATE … SET lease_expires_at=LEAST(clock_timestamp()+interval '300 seconds', lease_acquired_at+interval '900 seconds') WHERE id=$id AND lease_epoch=$e AND status='LEASED' AND lease_expires_at > clock_timestamp()`. Rowcount 0 means the lease was lost, and the worker must abort without any further write.

**Pin** (T05): insert the snapshot with `ON CONFLICT (organization_id, snapshot_hash) DO NOTHING`, then `UPDATE … SET pinned_snapshot_hash=$h … WHERE id=$id AND lease_epoch=$e AND status='LEASED' AND pinned_snapshot_hash IS NULL AND lease_expires_at > clock_timestamp()`. Rowcount 0 means re-reading the row. If another epoch pinned first, the worker aborts; it never overwrites a pin.

## 6. Fencing contract (`FENCING_CONTRACT_FINAL`)

The completion transaction (T06) is a single PostgreSQL transaction, `READ COMMITTED`:

1. `SELECT … FROM di_v0_s4_work_items WHERE id=$id FOR UPDATE`. Require `status='LEASED'`, `lease_epoch=$e`, `lease_owner=$owner`, `lease_expires_at > clock_timestamp()`, `pinned_snapshot_hash IS NOT NULL`, `pipeline_version_key=$pvk`, registry status ACTIVE and kill row NOT_KILLED (C1D.10C). On any mismatch, ROLLBACK and write nothing.
2. Re-read the trip row (`SELECT … FROM vehicle_trips WHERE id=$trip`, **no lock**, so canonical writers are never blocked), recompute the fingerprint, and require equality plus the tenant match. On a mismatch, ROLLBACK; the drift watcher supersedes.
3. Write S2 with `inputEvidenceVersion = execution identity` (§4a): `INSERT INTO di_v0_shadow_runs … ON CONFLICT (organization_id, idempotency_key) DO NOTHING RETURNING id`. If there is no row, `SELECT` the existing run and require an identical execution identity; otherwise ROLLBACK and fail terminal (`S2_EXECUTION_IDENTITY_MISMATCH`). Insert intervals only when the run was newly inserted. This replaces S2 `createOrGetRun` catch-and-reread inside the transaction (DI-GAP-S2-IN-TX-CREATE-RACE-001: a caught unique violation aborts the PostgreSQL transaction).
4. `UPDATE di_v0_s4_work_items SET status='COMPLETED', shadow_run_id=$run, combined_input_identity=$cii, completed_at=clock_timestamp(), lease_owner=NULL, lease_expires_at=NULL WHERE id=$id AND lease_epoch=$e AND status='LEASED'`. **Require rowcount = 1**, otherwise ROLLBACK.
5. COMMIT.

Takeover (T04), reap (T10) and supersede (T11) increment `lease_epoch` under the same row lock. A stale holder's step 1 therefore either blocks until the competitor commits and then sees a different epoch, or sees an expired lease. Both lead to ROLLBACK.

**Results:**

- `STALE_WORKER_WRITE_POSSIBLE = NO`: every write by a lease holder (T03, T05, T06, T07, T08, T09, T13) is conditional on (`id`, `lease_epoch`) **and** `lease_expires_at > clock_timestamp()` (C1D.10C closed the v1 gap where T07–T09 checked only the epoch), and S2 is written inside the same transaction. `EXPIRED_LEASE_WORKER_STATUS_WRITE_POSSIBLE = NO`: after expiry, the old worker can write nothing authoritative; status is then decided only by the takeover path (T04), the reaper (T10), the retirement reaper (T12) or the drift watcher (T11), each of which increments the epoch under a row lock (race R18). A stale worker's provider reads are wasted but never persisted.
- `DOUBLE_PRIMARY_COMPLETION_POSSIBLE = NO`: there is at most one PRIMARY per (org, trip, fp, pvk) (logical unique) and at most one non-superseded PRIMARY per (org, trip, pvk) (partial unique). COMPLETED requires the single current epoch, and S2 idempotency is the final guard.
- Residual (accepted): a lease can expire between step 1's check and COMMIT while the row lock is held. No competitor can take over during that time (it needs the lock), so the commit is still single-writer. The lease is a liveness bound, not a correctness bound.
