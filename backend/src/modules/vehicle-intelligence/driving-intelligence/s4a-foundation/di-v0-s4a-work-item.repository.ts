import { randomUUID } from 'crypto';
import { gunzipSync, gzipSync } from 'zlib';
import { Prisma, type PrismaClient } from '@prisma/client';
import { readCurrentBoundaryRepairGeneration } from '../../trips/boundary-repair.state.util';
import type { DiV0VersionTuple } from '../core/versions';
import type { DiV0ShadowPersistedIntervalInput } from '../shadow-persistence/di-v0-shadow-types';
import {
  DI_V0_S4_EVIDENCE_CONTAINER_VERSION,
  DI_V0_S4_LIMITS,
  DI_V0_S4_RUN_PURPOSES,
  DI_V0_S4_SKIP_REASONS,
  DI_V0_S4_SNAPSHOT_RETENTION_DAYS,
  DI_V0_S4_SOURCE_FAMILIES,
  type DiV0S4PipelineManifest,
  type DiV0S4RunPurpose,
  DI_V0_S4_EXECUTOR_TERMINAL_STATES,
  type DiV0S4SkipReason,
  type DiV0S4SourceFamily,
  type DiV0S4State,
  type DiV0S4SupersededReason,
  type DiV0S4TransitionId,
} from './di-v0-s4a-contract';
import {
  evaluateDiV0S4Enablement,
  evaluateDiV0S4KillRow,
  evaluateDiV0S4MaintenanceEnablement,
  type DiV0S4ControlPlaneConfig,
  type DiV0S4ControlRole,
  type DiV0S4EnablementResult,
  type DiV0S4KillEvaluation,
} from './di-v0-s4a-control-plane';
import { DiV0S4TransitionRejectedError, type DiV0S4RejectionCode } from './di-v0-s4a-errors';
import {
  assertDiV0S4ExecutionIdentityConsistency,
  assertDiV0S4RuntimePipelineManifest,
  buildDiV0CombinedInputIdentityV03,
  buildDiV0S4BoundaryFingerprint,
  buildDiV0S4EvidenceSnapshotHash,
  buildDiV0S4ExecutionIdentity,
  buildDiV0S4PipelineVersionKey,
  evaluateDiV0S4ChannelRun,
  pinsFromDiV0S4ChannelManifest,
  serializeDiV0S4EvidenceContainer,
  type DiV0S4EvidenceChannelInput,
  type DiV0S4EvidenceChannelManifestEntry,
} from './di-v0-s4a-identity';
import { persistDiV0S4FencedS2Run } from './di-v0-s4a-s2-fenced-persistence';
import { assertDiV0S4TransitionFrom } from './di-v0-s4a-state-machine';

type Db = Prisma.TransactionClient;

/** Fencing token (`executionAuthority.fencingToken`) plus the owner the lease was granted to. */
export interface DiV0S4Lease {
  workItemId: string;
  leaseEpoch: bigint;
  leaseOwner: string;
}

export interface DiV0S4ClaimResult extends DiV0S4Lease {
  attemptCount: number;
  transitionId: 'T02_CLAIM' | 'T04_TAKEOVER';
}

export interface DiV0S4CreateWorkItemInput {
  tripId: string;
  sourceFamily: DiV0S4SourceFamily;
  runPurpose: DiV0S4RunPurpose;
  replaySourceSnapshotHash?: string | null;
  reacquisitionRequestId?: string | null;
  pipelineManifest: DiV0S4PipelineManifest;
  /** Optional caller expectation; compared against the repository-resolved scope, never trusted. */
  expectedOrganizationId?: string;
  expectedVehicleId?: string;
}

export interface DiV0S4CreateWorkItemResult {
  workItemId: string;
  organizationId: string;
  vehicleId: string;
  boundaryFingerprint: string;
  pipelineVersionKey: string;
}

export interface DiV0S4PinEvidenceInput {
  windowStart: Date;
  windowEnd: Date;
  channels: readonly DiV0S4EvidenceChannelInput[];
}

export interface DiV0S4PinEvidenceResult {
  snapshotHash: string;
  combinedInputIdentity: string;
}

export interface DiV0S4CompleteInput {
  pipelineManifest: DiV0S4PipelineManifest;
  intervals: readonly DiV0ShadowPersistedIntervalInput[];
}

export interface DiV0S4CompleteResult {
  shadowRunId: string;
  reusedExistingRun: boolean;
  executionIdentity: string;
  combinedInputIdentity: string;
}

/** Read-only attempt-start boundary recheck (`fingerprintRecheckPoints.ATTEMPT_START_AFTER_CLAIM`). */
export type DiV0S4AttemptStartRecheckResult =
  | { kind: 'CURRENT' }
  | { kind: 'SUPERSEDE'; reason: DiV0S4SupersededReason }
  | { kind: 'LEASE_LOST'; code: DiV0S4RejectionCode };

export interface DiV0S4ExecutionPostcondition {
  status: DiV0S4State;
  terminal: boolean;
  leaseActivelyHeld: boolean;
}

interface WorkItemRow {
  id: string;
  organization_id: string;
  vehicle_id: string;
  trip_id: string;
  source_family: string;
  run_purpose: string;
  purpose_discriminator: string;
  boundary_fingerprint: string;
  boundary_occurrence: number;
  pipeline_version_key: string;
  pipeline_version_manifest: DiV0S4PipelineManifest;
  status: string;
  lease_epoch: bigint;
  lease_owner: string | null;
  attempt_count: number;
  pinned_snapshot_hash: string | null;
  lease_valid: boolean;
  lease_expired: boolean;
}

interface TripScopeRow {
  trip_id: string;
  vehicle_id: string;
  organization_id: string;
  trip_status: string;
  start_time: Date;
  end_time: Date | null;
  dimo_segment_id: string | null;
  merge_parent_trip_id: string | null;
  raw_detection_meta: unknown;
}

interface SnapshotRow {
  organization_id: string;
  vehicle_id: string;
  trip_id: string;
  boundary_fingerprint: string;
  acquisition_window_start: Date;
  acquisition_window_end: Date;
  channel_manifest: unknown;
  payload_gzip: Buffer;
  uncompressed_bytes: number;
}

const HOLDER_REASON_PATTERN = /^[A-Z0-9_]{1,128}$/;
const REQUEST_ID_PATTERN = /^[A-Za-z0-9_-]{1,128}$/;
const SNAPSHOT_HASH_PATTERN = /^DI_V0_S4_EVIDENCE_V1:sha256:[0-9a-f]{64}$/;
const DRIFT_REASONS: readonly DiV0S4SupersededReason[] = ['BOUNDARY_CHANGED', 'TRIP_NOT_COMPLETED', 'TRIP_CANCELLED', 'OPERATOR'];
const HOLDER_SUPERSEDE_REASONS: readonly DiV0S4SupersededReason[] = ['BOUNDARY_CHANGED', 'TRIP_NOT_COMPLETED', 'TRIP_CANCELLED'];

const reject = (transitionId: DiV0S4TransitionId, code: DiV0S4RejectionCode, detail?: string): never => {
  throw new DiV0S4TransitionRejectedError(transitionId, code, detail);
};

/**
 * DI V0 S4 work-item repository (DI_V0_S4A_CONTRACT_V2). One method per contract transition; there
 * is no generic status setter. Every method runs in one READ COMMITTED transaction and follows the
 * contract lock order: work-item rows FOR UPDATE → `di_v0_s4_control` FOR UPDATE (kill proof) →
 * pipeline registry FOR SHARE. All lease arithmetic uses `clock_timestamp()`.
 *
 * Dormant: nothing in the application graph constructs this class (S4A dormant audit spec).
 */
export class DiV0S4WorkItemRepository {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly config: DiV0S4ControlPlaneConfig,
  ) {}

  // ── T01 ──────────────────────────────────────────────────────────────────

  async createWorkItem(input: DiV0S4CreateWorkItemInput, tx?: Db): Promise<DiV0S4CreateWorkItemResult> {
    const tid: DiV0S4TransitionId = 'T01_CREATE';
    const purpose = this.resolvePurpose(input);
    if (!(DI_V0_S4_SOURCE_FAMILIES as readonly string[]).includes(input.sourceFamily)) {
      reject(tid, 'INPUT_INVALID', 'sourceFamily');
    }
    const pipelineVersionKey = this.runtimePipelineKey(tid, input.pipelineManifest);

    return this.inTx(tx, async (db) => {
      const kill = await this.requireNotKilled(db, tid);
      const scope = await this.readTripScope(db, input.tripId);
      if (!scope) return reject(tid, 'TENANT_SCOPE_INVALID', 'trip not found');
      if (
        (input.expectedOrganizationId !== undefined && input.expectedOrganizationId !== scope.organization_id) ||
        (input.expectedVehicleId !== undefined && input.expectedVehicleId !== scope.vehicle_id)
      ) {
        reject(tid, 'TENANT_SCOPE_INVALID', 'caller scope differs from trip -> vehicle -> organization');
      }
      this.requireEnabled(
        tid,
        this.enablement('DISCOVERY', scope.organization_id, scope.vehicle_id, scope.organization_id, kill),
      );
      if (scope.trip_status !== 'COMPLETED' || scope.end_time == null) reject(tid, 'TRIP_NOT_COMPLETED');
      const boundaryFingerprint = this.fingerprintOf(scope);

      if (purpose.runPurpose === 'RECALIBRATION_REPLAY') {
        const snapshot = await db.$queryRaw<Array<{ boundary_fingerprint: string }>>`
          SELECT boundary_fingerprint FROM di_v0_s4_evidence_snapshots
          WHERE organization_id = ${scope.organization_id} AND trip_id = ${scope.trip_id}
            AND snapshot_hash = ${purpose.replaySourceSnapshotHash}`;
        if (snapshot.length !== 1 || snapshot[0].boundary_fingerprint !== boundaryFingerprint) {
          reject(tid, 'SNAPSHOT_SCOPE_INVALID', 'replay snapshot must belong to this trip and boundary');
        }
      }

      await db.$executeRaw`
        INSERT INTO di_v0_s4_pipeline_versions (pipeline_version_key, manifest, status)
        VALUES (${pipelineVersionKey}, ${JSON.stringify(input.pipelineManifest)}::jsonb, 'ACTIVE')
        ON CONFLICT (pipeline_version_key) DO NOTHING`;
      await this.requireRegistryStatus(db, tid, pipelineVersionKey, 'ACTIVE');

      const id = randomUUID();
      const replay = purpose.runPurpose === 'RECALIBRATION_REPLAY';
      const boundaryOccurrence =
        purpose.runPurpose === 'PRIMARY' && purpose.purposeDiscriminator === 'PRIMARY'
          ? await this.allocatePrimaryBoundaryOccurrence(db, scope.organization_id, scope.trip_id)
          : 0;
      const inserted = await db.$queryRaw<Array<{ id: string }>>`
        INSERT INTO di_v0_s4_work_items (
          id, organization_id, vehicle_id, trip_id, source_family, run_purpose, purpose_discriminator,
          replay_source_snapshot_hash, reacquisition_request_id, boundary_fingerprint, boundary_occurrence,
          pipeline_version_key, pipeline_version_manifest, status, lease_epoch, attempt_count,
          next_attempt_at, settlement_anchor_at, eligible_at, pinned_snapshot_hash, pinned_at, pinned_epoch
        )
        SELECT ${id}, ${scope.organization_id}, ${scope.vehicle_id}, ${scope.trip_id}, ${input.sourceFamily},
          ${purpose.runPurpose}, ${purpose.purposeDiscriminator}, ${purpose.replaySourceSnapshotHash}::text,
          ${purpose.reacquisitionRequestId}::text, ${boundaryFingerprint}, ${boundaryOccurrence},
          ${pipelineVersionKey}, ${JSON.stringify(input.pipelineManifest)}::jsonb, 'PENDING', 0, 0,
          a.anchor + interval '24 hours', a.anchor, a.anchor + interval '24 hours',
          ${purpose.replaySourceSnapshotHash}::text,
          CASE WHEN ${replay}::boolean THEN clock_timestamp() END,
          CASE WHEN ${replay}::boolean THEN 0::bigint END
        FROM (${this.settlementAnchorSql(scope.trip_id)}) a
        ON CONFLICT DO NOTHING
        RETURNING id`;
      if (inserted.length !== 1) reject(tid, 'DUPLICATE_WORK_ITEM');
      return {
        workItemId: id,
        organizationId: scope.organization_id,
        vehicleId: scope.vehicle_id,
        boundaryFingerprint,
        pipelineVersionKey,
      };
    });
  }

  // ── T02 / T04 ────────────────────────────────────────────────────────────

  async claim(
    input: { leaseOwner: string; pipelineManifest: DiV0S4PipelineManifest; workItemId?: string },
    tx?: Db,
  ): Promise<DiV0S4ClaimResult> {
    const tid: DiV0S4TransitionId = 'T02_CLAIM';
    if (!REQUEST_ID_PATTERN.test(input.leaseOwner)) reject(tid, 'INPUT_INVALID', 'leaseOwner');
    const pipelineVersionKey = this.runtimePipelineKey(tid, input.pipelineManifest);
    if (!this.config.masterEnabled || !this.config.workerEnabled || !this.config.positionEnabled) {
      reject(tid, 'CONTROL_PLANE_DISABLED', 'worker flags');
    }
    const orgs = [...this.config.organizationAllowlist];
    const vehicles = [...this.config.vehicleAllowlist];
    const onlyId = input.workItemId ?? null;

    return this.inTx(tx, async (db) => {
      const candidates = await db.$queryRaw<WorkItemRow[]>`
        SELECT ${this.rowColumns()} FROM di_v0_s4_work_items
        WHERE pipeline_version_key = ${pipelineVersionKey}
          AND attempt_count < ${DI_V0_S4_LIMITS.maxAttempts}
          AND organization_id = ANY(${orgs}::text[])
          AND vehicle_id = ANY(${vehicles}::text[])
          AND (${onlyId}::text IS NULL OR id = ${onlyId}::text)
          AND ((status IN ('PENDING', 'FAILED_RETRYABLE') AND next_attempt_at <= clock_timestamp())
            OR (status = 'LEASED' AND lease_expires_at < clock_timestamp()))
        ORDER BY next_attempt_at NULLS FIRST, id
        LIMIT 1
        FOR UPDATE SKIP LOCKED`;
      const kill = await this.requireNotKilled(db, tid);
      const row = candidates[0];
      if (!row) return reject(tid, 'NO_CLAIMABLE_WORK_ITEM');
      const transitionId: 'T02_CLAIM' | 'T04_TAKEOVER' = row.status === 'LEASED' ? 'T04_TAKEOVER' : 'T02_CLAIM';
      assertDiV0S4TransitionFrom(transitionId, row.status);
      await this.requireRegistryStatus(db, transitionId, pipelineVersionKey, 'ACTIVE');
      this.requireEnabled(transitionId, await this.rowEnablement(db, 'WORKER', row, kill));

      const updated = await db.$queryRaw<Array<{ lease_epoch: bigint; attempt_count: number }>>`
        UPDATE di_v0_s4_work_items
        SET status = 'LEASED', lease_epoch = lease_epoch + 1, attempt_count = attempt_count + 1,
            lease_owner = ${input.leaseOwner}, lease_acquired_at = clock_timestamp(),
            lease_expires_at = clock_timestamp() + make_interval(secs => ${DI_V0_S4_LIMITS.leaseDurationSeconds}::int),
            last_heartbeat_at = clock_timestamp(), next_attempt_at = NULL
        WHERE id = ${row.id} AND lease_epoch = ${row.lease_epoch} AND pipeline_version_key = ${pipelineVersionKey}
          AND attempt_count < ${DI_V0_S4_LIMITS.maxAttempts}
          AND ((status IN ('PENDING', 'FAILED_RETRYABLE') AND next_attempt_at <= clock_timestamp())
            OR (status = 'LEASED' AND lease_expires_at < clock_timestamp()))
        RETURNING lease_epoch, attempt_count`;
      if (updated.length !== 1) return reject(transitionId, 'CONDITIONAL_UPDATE_LOST');
      return {
        workItemId: row.id,
        leaseEpoch: BigInt(updated[0].lease_epoch),
        leaseOwner: input.leaseOwner,
        attemptCount: Number(updated[0].attempt_count),
        transitionId,
      };
    });
  }

  // ── T03 ──────────────────────────────────────────────────────────────────

  async heartbeat(lease: DiV0S4Lease, tx?: Db): Promise<{ leaseExpiresAt: Date }> {
    const tid: DiV0S4TransitionId = 'T03_HEARTBEAT';
    return this.inTx(tx, async (db) => {
      const row = await this.lockRow(db, tid, lease.workItemId);
      const kill = await this.requireNotKilled(db, tid);
      this.requireEnabled(tid, evaluateDiV0S4MaintenanceEnablement(this.config, kill));
      this.requireHolder(tid, row, lease);
      const updated = await db.$queryRaw<Array<{ lease_expires_at: Date }>>`
        UPDATE di_v0_s4_work_items
        SET lease_expires_at = LEAST(
              clock_timestamp() + make_interval(secs => ${DI_V0_S4_LIMITS.leaseDurationSeconds}::int),
              lease_acquired_at + make_interval(secs => ${DI_V0_S4_LIMITS.absoluteLeaseLifetimeCeilingSeconds}::int)),
            last_heartbeat_at = clock_timestamp()
        WHERE ${this.holderPredicate(lease)}
        RETURNING lease_expires_at`;
      if (updated.length !== 1) return reject(tid, 'CONDITIONAL_UPDATE_LOST');
      return { leaseExpiresAt: updated[0].lease_expires_at };
    });
  }

  // ── T05 ──────────────────────────────────────────────────────────────────

  async pinEvidence(lease: DiV0S4Lease, input: DiV0S4PinEvidenceInput, tx?: Db): Promise<DiV0S4PinEvidenceResult> {
    const tid: DiV0S4TransitionId = 'T05_PIN';
    return this.inTx(tx, async (db) => {
      const row = await this.lockRow(db, tid, lease.workItemId);
      const kill = await this.requireNotKilled(db, tid);
      this.requireHolder(tid, row, lease);
      if (row.pinned_snapshot_hash != null) reject(tid, 'PIN_ALREADY_SET');
      this.requireEnabled(tid, await this.rowEnablement(db, 'WORKER', row, kill));

      let serialized: ReturnType<typeof serializeDiV0S4EvidenceContainer>;
      try {
        serialized = serializeDiV0S4EvidenceContainer({
          organizationId: row.organization_id,
          vehicleId: row.vehicle_id,
          tripId: row.trip_id,
          boundaryFingerprint: row.boundary_fingerprint,
          windowStart: input.windowStart,
          windowEnd: input.windowEnd,
          channels: input.channels,
        });
      } catch (error) {
        return reject(tid, 'SNAPSHOT_INVALID', error instanceof Error ? error.message : undefined);
      }
      if (evaluateDiV0S4ChannelRun(this.config, serialized.pins, row.source_family) !== 'RUNNABLE') reject(tid, 'CHANNEL_SET_NOT_RUNNABLE');

      const uncompressed = Buffer.from(serialized.container, 'utf8');
      const gzip = gzipSync(uncompressed, { level: 9 });
      await db.$executeRaw`
        INSERT INTO di_v0_s4_evidence_snapshots (
          id, organization_id, vehicle_id, trip_id, snapshot_hash, container_version, boundary_fingerprint,
          acquisition_window_start, acquisition_window_end, channel_manifest, payload_gzip, payload_bytes,
          uncompressed_bytes, retention_until
        ) VALUES (
          ${randomUUID()}, ${row.organization_id}, ${row.vehicle_id}, ${row.trip_id}, ${serialized.snapshotHash},
          ${DI_V0_S4_EVIDENCE_CONTAINER_VERSION}, ${row.boundary_fingerprint},
          ${input.windowStart.toISOString()}::timestamptz, ${input.windowEnd.toISOString()}::timestamptz,
          ${JSON.stringify(serialized.channelManifest)}::jsonb, ${gzip}, ${gzip.length}::int, ${uncompressed.length}::int,
          clock_timestamp() + make_interval(days => ${DI_V0_S4_SNAPSHOT_RETENTION_DAYS}::int)
        )
        ON CONFLICT (organization_id, snapshot_hash) DO NOTHING`;
      const updated = await db.$executeRaw`
        UPDATE di_v0_s4_work_items
        SET pinned_snapshot_hash = ${serialized.snapshotHash}, pinned_at = clock_timestamp(), pinned_epoch = lease_epoch
        WHERE ${this.holderPredicate(lease)} AND pinned_snapshot_hash IS NULL`;
      if (updated !== 1) reject(tid, 'CONDITIONAL_UPDATE_LOST');
      return { snapshotHash: serialized.snapshotHash, combinedInputIdentity: serialized.combinedInputIdentity };
    });
  }

  // ── T06 ──────────────────────────────────────────────────────────────────

  /**
   * S4A_IDENTITY_AND_FENCING §6: fence under row lock, unlocked canonical re-read, pinned snapshot
   * re-hash, fenced S2 write, conditional COMPLETED update — one transaction. Pass `tx` to run
   * inside a caller transaction (the caller's rollback then discards S2 as well).
   */
  async completeWithS2(lease: DiV0S4Lease, input: DiV0S4CompleteInput, tx?: Db): Promise<DiV0S4CompleteResult> {
    const tid: DiV0S4TransitionId = 'T06_COMPLETE';
    const pipelineVersionKey = this.runtimePipelineKey(tid, input.pipelineManifest);
    return this.inTx(tx, async (db) => {
      const row = await this.lockRow(db, tid, lease.workItemId);
      const kill = await this.requireNotKilled(db, tid);
      this.requireHolder(tid, row, lease);
      if (row.pinned_snapshot_hash == null) return reject(tid, 'PIN_NOT_SET');
      if (row.pipeline_version_key !== pipelineVersionKey) reject(tid, 'PIPELINE_VERSION_MISMATCH');
      await this.requireRegistryStatus(db, tid, pipelineVersionKey, 'ACTIVE');
      this.requireEnabled(tid, await this.rowEnablement(db, 'WORKER', row, kill));

      const scope = await this.readTripScope(db, row.trip_id);
      if (!scope || scope.organization_id !== row.organization_id || scope.vehicle_id !== row.vehicle_id) {
        return reject(tid, 'TENANT_SCOPE_INVALID');
      }
      if (this.fingerprintOf(scope) !== row.boundary_fingerprint) reject(tid, 'BOUNDARY_FINGERPRINT_CHANGED');

      const pins = await this.loadPinnedSnapshotPins(db, tid, row, row.pinned_snapshot_hash);
      if (evaluateDiV0S4ChannelRun(this.config, pins, row.source_family) !== 'RUNNABLE') reject(tid, 'CHANNEL_SET_NOT_RUNNABLE');
      const combinedInputIdentity = buildDiV0CombinedInputIdentityV03(pins);

      const manifest = row.pipeline_version_manifest;
      const identityInput = {
        organizationId: row.organization_id,
        vehicleId: row.vehicle_id,
        tripId: row.trip_id,
        boundaryFingerprint: row.boundary_fingerprint,
        boundaryOccurrence: row.boundary_occurrence,
        pipelineVersionKey: row.pipeline_version_key,
        calibrationBundleHash: manifest.calibrationBundleHash,
        s4OrchestrationContractVersion: manifest.s4OrchestrationContractVersion,
        runPurpose: row.run_purpose as DiV0S4RunPurpose,
        purposeDiscriminator: row.purpose_discriminator,
        pinnedEvidenceSnapshotHash: row.pinned_snapshot_hash,
        combinedInputIdentity,
      };
      try {
        assertDiV0S4ExecutionIdentityConsistency(identityInput, manifest);
      } catch (error) {
        return reject(tid, 'PIPELINE_VERSION_MISMATCH', error instanceof Error ? error.message : undefined);
      }
      const executionIdentity = buildDiV0S4ExecutionIdentity(identityInput);
      const versions = {
        structuralVersion: manifest.structuralVersion,
        estimatorVersion: manifest.estimatorVersion,
        calibrationVersion: manifest.calibrationVersion,
        sourceFamilyPolicyVersion: manifest.sourceFamilyPolicyVersion,
      } as DiV0VersionTuple;

      const s2 = await persistDiV0S4FencedS2Run(
        db,
        {
          organizationId: row.organization_id,
          vehicleId: row.vehicle_id,
          tripId: row.trip_id,
          sourceFamily: row.source_family,
          versions,
          inputEvidenceVersion: executionIdentity,
        },
        input.intervals,
      );

      const updated = await db.$executeRaw`
        UPDATE di_v0_s4_work_items
        SET status = 'COMPLETED', shadow_run_id = ${s2.shadowRunId}, combined_input_identity = ${combinedInputIdentity},
            execution_identity = ${executionIdentity}, completed_at = clock_timestamp(),
            lease_owner = NULL, lease_expires_at = NULL, lease_acquired_at = NULL
        WHERE ${this.holderPredicate(lease)} AND pinned_snapshot_hash = ${row.pinned_snapshot_hash}
          AND pipeline_version_key = ${pipelineVersionKey}`;
      if (updated !== 1) reject(tid, 'CONDITIONAL_UPDATE_LOST');
      return { ...s2, executionIdentity, combinedInputIdentity };
    });
  }

  // ── T07 (the only write allowed while killed; reads neither flags nor the kill row) ──

  async failRetryable(lease: DiV0S4Lease, failureReason: string, tx?: Db): Promise<{ nextAttemptAt: Date }> {
    const tid: DiV0S4TransitionId = 'T07_FAIL_RETRYABLE';
    if (!HOLDER_REASON_PATTERN.test(failureReason)) reject(tid, 'REASON_INVALID');
    return this.inTx(tx, async (db) => {
      const row = await this.lockRow(db, tid, lease.workItemId);
      this.requireHolder(tid, row, lease);
      if (row.attempt_count >= DI_V0_S4_LIMITS.maxAttempts) reject(tid, 'ATTEMPTS_EXHAUSTED');
      const backoffSeconds = DI_V0_S4_LIMITS.retryBackoffSeconds[row.attempt_count - 1];
      if (backoffSeconds === undefined) return reject(tid, 'ATTEMPTS_EXHAUSTED');
      const updated = await db.$queryRaw<Array<{ next_attempt_at: Date }>>`
        UPDATE di_v0_s4_work_items
        SET status = 'FAILED_RETRYABLE', failure_class = 'RETRYABLE', failure_reason = ${failureReason},
            next_attempt_at = clock_timestamp() + make_interval(secs => ${backoffSeconds}::int),
            lease_owner = NULL, lease_expires_at = NULL, lease_acquired_at = NULL
        WHERE ${this.holderPredicate(lease)} AND attempt_count < ${DI_V0_S4_LIMITS.maxAttempts}
        RETURNING next_attempt_at`;
      if (updated.length !== 1) return reject(tid, 'CONDITIONAL_UPDATE_LOST');
      return { nextAttemptAt: updated[0].next_attempt_at };
    });
  }

  // ── T08 ──────────────────────────────────────────────────────────────────

  async failTerminal(lease: DiV0S4Lease, failureReason: string, tx?: Db): Promise<void> {
    const tid: DiV0S4TransitionId = 'T08_FAIL_TERMINAL';
    if (!HOLDER_REASON_PATTERN.test(failureReason)) reject(tid, 'REASON_INVALID');
    await this.inTx(tx, async (db) => {
      const row = await this.lockRow(db, tid, lease.workItemId);
      const kill = await this.requireNotKilled(db, tid);
      this.requireEnabled(tid, evaluateDiV0S4MaintenanceEnablement(this.config, kill));
      this.requireHolder(tid, row, lease);
      const updated = await db.$executeRaw`
        UPDATE di_v0_s4_work_items
        SET status = 'FAILED_TERMINAL', failure_class = 'TERMINAL', failure_reason = ${failureReason},
            lease_owner = NULL, lease_expires_at = NULL, lease_acquired_at = NULL
        WHERE ${this.holderPredicate(lease)}`;
      if (updated !== 1) reject(tid, 'CONDITIONAL_UPDATE_LOST');
    });
  }

  // ── T09 ──────────────────────────────────────────────────────────────────

  async skipIneligible(lease: DiV0S4Lease, skipReason: DiV0S4SkipReason, tx?: Db): Promise<void> {
    const tid: DiV0S4TransitionId = 'T09_SKIP_INELIGIBLE';
    if (!(DI_V0_S4_SKIP_REASONS as readonly string[]).includes(skipReason)) reject(tid, 'REASON_INVALID');
    await this.inTx(tx, async (db) => {
      const row = await this.lockRow(db, tid, lease.workItemId);
      const kill = await this.requireNotKilled(db, tid);
      this.requireEnabled(tid, evaluateDiV0S4MaintenanceEnablement(this.config, kill));
      this.requireHolder(tid, row, lease);
      if (row.run_purpose === 'RECALIBRATION_REPLAY') reject(tid, 'RUN_PURPOSE_FORBIDS_TRANSITION');
      if (row.pinned_snapshot_hash != null) reject(tid, 'PIN_ALREADY_SET');
      const updated = await db.$executeRaw`
        UPDATE di_v0_s4_work_items
        SET status = 'SKIPPED_INELIGIBLE', skip_reason = ${skipReason},
            lease_owner = NULL, lease_expires_at = NULL, lease_acquired_at = NULL
        WHERE ${this.holderPredicate(lease)} AND pinned_snapshot_hash IS NULL AND run_purpose <> 'RECALIBRATION_REPLAY'`;
      if (updated !== 1) reject(tid, 'CONDITIONAL_UPDATE_LOST');
    });
  }

  // ── T10 ──────────────────────────────────────────────────────────────────

  async reapExhausted(input: { workItemId?: string; limit?: number } = {}, tx?: Db): Promise<string[]> {
    const tid: DiV0S4TransitionId = 'T10_EXHAUST';
    const onlyId = input.workItemId ?? null;
    const limit = Math.max(1, Math.min(input.limit ?? 100, 1000));
    return this.inTx(tx, async (db) => {
      const rows = await db.$queryRaw<Array<{ id: string; status: string }>>`
        SELECT id, status FROM di_v0_s4_work_items
        WHERE status = 'LEASED' AND lease_expires_at < clock_timestamp()
          AND attempt_count >= ${DI_V0_S4_LIMITS.maxAttempts}
          AND (${onlyId}::text IS NULL OR id = ${onlyId}::text)
        ORDER BY lease_expires_at, id
        LIMIT ${limit}
        FOR UPDATE SKIP LOCKED`;
      const kill = await this.requireNotKilled(db, tid);
      this.requireEnabled(tid, evaluateDiV0S4MaintenanceEnablement(this.config, kill));
      if (rows.length === 0) return reject(tid, 'NO_EXHAUSTED_WORK_ITEM');
      rows.forEach((r) => assertDiV0S4TransitionFrom(tid, r.status));
      const ids = rows.map((r) => r.id);
      const updated = await db.$queryRaw<Array<{ id: string }>>`
        UPDATE di_v0_s4_work_items
        SET status = 'FAILED_TERMINAL', failure_class = 'EXHAUSTED', failure_reason = 'ATTEMPTS_EXHAUSTED',
            lease_epoch = lease_epoch + 1, lease_owner = NULL, lease_expires_at = NULL, lease_acquired_at = NULL
        WHERE id = ANY(${ids}::text[]) AND status = 'LEASED' AND lease_expires_at < clock_timestamp()
          AND attempt_count >= ${DI_V0_S4_LIMITS.maxAttempts}
        RETURNING id`;
      if (updated.length !== ids.length) reject(tid, 'CONDITIONAL_UPDATE_LOST');
      return updated.map((r) => r.id).sort();
    });
  }

  // ── T11 (+ W_SUCCESSOR_PRIMARY_INSERT) ─────────────────────────────────────

  async supersedeOnDrift(
    input: { workItemId: string; reason: DiV0S4SupersededReason },
    tx?: Db,
  ): Promise<{ successorWorkItemId: string | null }> {
    const tid: DiV0S4TransitionId = 'T11_SUPERSEDE';
    if (!DRIFT_REASONS.includes(input.reason)) reject(tid, 'REASON_INVALID');
    return this.inTx(tx, async (db) => {
      const row = await this.lockRow(db, tid, input.workItemId);
      const kill = await this.requireNotKilled(db, tid);
      this.requireEnabled(tid, evaluateDiV0S4MaintenanceEnablement(this.config, kill));
      assertDiV0S4TransitionFrom(tid, row.status);
      const scope = await this.readTripScope(db, row.trip_id);
      if (!scope) return reject(tid, 'TENANT_SCOPE_INVALID', 'trip not found');
      const currentFingerprint = this.fingerprintOf(scope);
      if (currentFingerprint === row.boundary_fingerprint) reject(tid, 'BOUNDARY_FINGERPRINT_UNCHANGED');
      this.requireReasonMatchesTrip(tid, input.reason, scope);

      const successorId = await this.successorIdIfEligible(db, row, scope, currentFingerprint);
      const updated = await db.$executeRaw`
        UPDATE di_v0_s4_work_items
        SET status = 'SUPERSEDED', superseded_reason = ${input.reason}, superseded_at = clock_timestamp(),
            superseded_by_work_item_id = ${successorId}::text, lease_epoch = lease_epoch + 1,
            lease_owner = NULL, lease_expires_at = NULL, lease_acquired_at = NULL, next_attempt_at = NULL
        WHERE id = ${row.id} AND status = ${row.status} AND lease_epoch = ${row.lease_epoch}`;
      if (updated !== 1) reject(tid, 'CONDITIONAL_UPDATE_LOST');
      if (successorId) {
        const successorOccurrence = await this.allocatePrimaryBoundaryOccurrence(db, row.organization_id, row.trip_id);
        try {
          await db.$executeRaw`
            INSERT INTO di_v0_s4_work_items (
              id, organization_id, vehicle_id, trip_id, source_family, run_purpose, purpose_discriminator,
              boundary_fingerprint, boundary_occurrence, pipeline_version_key, pipeline_version_manifest, status, lease_epoch,
              attempt_count, next_attempt_at, settlement_anchor_at, eligible_at
            )
            SELECT ${successorId}, ${row.organization_id}, ${row.vehicle_id}, ${row.trip_id}, ${row.source_family},
              'PRIMARY', 'PRIMARY', ${currentFingerprint}, ${successorOccurrence}, ${row.pipeline_version_key},
              ${JSON.stringify(row.pipeline_version_manifest)}::jsonb, 'PENDING', 0, 0,
              a.anchor + interval '24 hours', a.anchor, a.anchor + interval '24 hours'
            FROM (${this.settlementAnchorSql(row.trip_id)}) a`;
        } catch (error) {
          return reject(tid, 'SUCCESSOR_INSERT_REJECTED', error instanceof Error ? error.message.slice(0, 200) : undefined);
        }
      }
      return { successorWorkItemId: successorId };
    });
  }

  // ── T12 ──────────────────────────────────────────────────────────────────

  async retirePipelineItems(input: { pipelineVersionKey: string; limit?: number }, tx?: Db): Promise<string[]> {
    const tid: DiV0S4TransitionId = 'T12_RETIRE';
    const limit = Math.max(1, Math.min(input.limit ?? 100, 1000));
    return this.inTx(tx, async (db) => {
      const rows = await db.$queryRaw<Array<{ id: string; status: string }>>`
        SELECT id, status FROM di_v0_s4_work_items
        WHERE pipeline_version_key = ${input.pipelineVersionKey}
          AND (status IN ('PENDING', 'FAILED_RETRYABLE') OR (status = 'LEASED' AND lease_expires_at < clock_timestamp()))
        ORDER BY id
        LIMIT ${limit}
        FOR UPDATE SKIP LOCKED`;
      const kill = await this.requireNotKilled(db, tid);
      this.requireEnabled(tid, evaluateDiV0S4MaintenanceEnablement(this.config, kill));
      await this.requireRegistryStatus(db, tid, input.pipelineVersionKey, 'RETIRED');
      if (rows.length === 0) return reject(tid, 'NO_RETIRABLE_WORK_ITEM');
      rows.forEach((r) => assertDiV0S4TransitionFrom(tid, r.status));
      const ids = rows.map((r) => r.id);
      const updated = await db.$queryRaw<Array<{ id: string }>>`
        UPDATE di_v0_s4_work_items
        SET status = 'SUPERSEDED', superseded_reason = 'PIPELINE_RETIRED', superseded_at = clock_timestamp(),
            superseded_by_work_item_id = NULL, lease_epoch = lease_epoch + 1,
            lease_owner = NULL, lease_expires_at = NULL, lease_acquired_at = NULL, next_attempt_at = NULL
        WHERE id = ANY(${ids}::text[]) AND pipeline_version_key = ${input.pipelineVersionKey}
          AND (status IN ('PENDING', 'FAILED_RETRYABLE') OR (status = 'LEASED' AND lease_expires_at < clock_timestamp()))
        RETURNING id`;
      if (updated.length !== ids.length) reject(tid, 'CONDITIONAL_UPDATE_LOST');
      return updated.map((r) => r.id).sort();
    });
  }

  // ── T13 ──────────────────────────────────────────────────────────────────

  /**
   * Holder-side supersession. The successor PRIMARY is not inserted here: the registry binds
   * W_SUCCESSOR_PRIMARY_INSERT to T11 only (DI-CONTRA-S4A-T13-SUCCESSOR-WRITE-BINDING-001), so the
   * successor comes from the next T01 discovery pass.
   */
  async holderSupersede(lease: DiV0S4Lease, reason: DiV0S4SupersededReason, tx?: Db): Promise<void> {
    const tid: DiV0S4TransitionId = 'T13_HOLDER_SUPERSEDE';
    if (!HOLDER_SUPERSEDE_REASONS.includes(reason)) reject(tid, 'REASON_INVALID');
    await this.inTx(tx, async (db) => {
      const row = await this.lockRow(db, tid, lease.workItemId);
      const kill = await this.requireNotKilled(db, tid);
      this.requireHolder(tid, row, lease);
      this.requireEnabled(tid, await this.rowEnablement(db, 'WORKER', row, kill));
      const scope = await this.readTripScope(db, row.trip_id);
      if (!scope) return reject(tid, 'TENANT_SCOPE_INVALID', 'trip not found');
      if (this.fingerprintOf(scope) === row.boundary_fingerprint) reject(tid, 'BOUNDARY_FINGERPRINT_UNCHANGED');
      this.requireReasonMatchesTrip(tid, reason, scope);
      const updated = await db.$executeRaw`
        UPDATE di_v0_s4_work_items
        SET status = 'SUPERSEDED', superseded_reason = ${reason}, superseded_at = clock_timestamp(),
            superseded_by_work_item_id = NULL, lease_epoch = lease_epoch + 1,
            lease_owner = NULL, lease_expires_at = NULL, lease_acquired_at = NULL, next_attempt_at = NULL
        WHERE ${this.holderPredicate(lease)}`;
      if (updated !== 1) reject(tid, 'CONDITIONAL_UPDATE_LOST');
    });
  }

  // ── S4B read helpers (no authoritative writes) ───────────────────────────

  /**
   * Post-claim, pre-acquisition boundary fingerprint recheck. Unlocked canonical trip read;
   * compares through `buildDiV0S4BoundaryFingerprint` (same as T06 / T13).
   */
  async evaluateAttemptStartBoundary(lease: DiV0S4Lease): Promise<DiV0S4AttemptStartRecheckResult> {
    const rows = await this.prisma.$queryRaw<
      Array<{
        status: string;
        lease_epoch: bigint;
        lease_owner: string | null;
        boundary_fingerprint: string;
        trip_id: string;
        lease_valid: boolean;
      }>
    >`
      SELECT status, lease_epoch, lease_owner, boundary_fingerprint, trip_id,
        (lease_expires_at IS NOT NULL AND lease_expires_at > clock_timestamp()) AS lease_valid
      FROM di_v0_s4_work_items WHERE id = ${lease.workItemId}`;
    const row = rows[0];
    if (!row || row.status !== 'LEASED' || row.lease_epoch !== lease.leaseEpoch || row.lease_owner !== lease.leaseOwner) {
      return { kind: 'LEASE_LOST', code: 'LEASE_NOT_HELD' };
    }
    if (!row.lease_valid) return { kind: 'LEASE_LOST', code: 'LEASE_EXPIRED' };

    const scope = await this.readTripScope(this.prisma, row.trip_id);
    if (!scope) return { kind: 'LEASE_LOST', code: 'TENANT_SCOPE_INVALID' };

    const current = this.fingerprintOf(scope);
    if (current === row.boundary_fingerprint) return { kind: 'CURRENT' };

    let reason: DiV0S4SupersededReason = 'BOUNDARY_CHANGED';
    if (scope.trip_status === 'CANCELLED') reason = 'TRIP_CANCELLED';
    else if (scope.trip_status === 'ONGOING') reason = 'TRIP_NOT_COMPLETED';
    return { kind: 'SUPERSEDE', reason };
  }

  /** Durable terminal postcondition for S4B after an executor reports SETTLED. */
  async readExecutionPostcondition(workItemId: string): Promise<DiV0S4ExecutionPostcondition> {
    const rows = await this.prisma.$queryRaw<
      Array<{ status: string; lease_valid: boolean }>
    >`
      SELECT status,
        (status = 'LEASED' AND lease_expires_at IS NOT NULL AND lease_expires_at > clock_timestamp()) AS lease_valid
      FROM di_v0_s4_work_items WHERE id = ${workItemId}`;
    const row = rows[0];
    if (!row) {
      return { status: 'PENDING', terminal: false, leaseActivelyHeld: false };
    }
    const status = row.status as DiV0S4State;
    const terminal = (DI_V0_S4_EXECUTOR_TERMINAL_STATES as readonly string[]).includes(status);
    return { status, terminal, leaseActivelyHeld: row.lease_valid === true };
  }

  // ── internals ────────────────────────────────────────────────────────────

  private inTx<T>(tx: Db | undefined, fn: (db: Db) => Promise<T>): Promise<T> {
    if (tx) return fn(tx);
    return this.prisma.$transaction(fn, {
      isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted,
      maxWait: 10_000,
      timeout: 30_000,
    });
  }

  private resolvePurpose(input: DiV0S4CreateWorkItemInput): {
    runPurpose: DiV0S4RunPurpose;
    purposeDiscriminator: string;
    replaySourceSnapshotHash: string | null;
    reacquisitionRequestId: string | null;
  } {
    const tid: DiV0S4TransitionId = 'T01_CREATE';
    const replay = input.replaySourceSnapshotHash ?? null;
    const request = input.reacquisitionRequestId ?? null;
    if (!(DI_V0_S4_RUN_PURPOSES as readonly string[]).includes(input.runPurpose)) reject(tid, 'INPUT_INVALID', 'runPurpose');
    if (input.runPurpose === 'PRIMARY') {
      if (replay != null || request != null) reject(tid, 'INPUT_INVALID', 'PRIMARY takes no discriminator');
      return { runPurpose: 'PRIMARY', purposeDiscriminator: 'PRIMARY', replaySourceSnapshotHash: null, reacquisitionRequestId: null };
    }
    if (input.runPurpose === 'RECALIBRATION_REPLAY') {
      if (replay == null || !SNAPSHOT_HASH_PATTERN.test(replay) || request != null) {
        reject(tid, 'INPUT_INVALID', 'RECALIBRATION_REPLAY requires only a snapshot hash');
      }
      return { runPurpose: 'RECALIBRATION_REPLAY', purposeDiscriminator: replay!, replaySourceSnapshotHash: replay, reacquisitionRequestId: null };
    }
    if (request == null || !REQUEST_ID_PATTERN.test(request) || replay != null) {
      reject(tid, 'INPUT_INVALID', 'REACQUISITION requires only a request id');
    }
    return { runPurpose: 'REACQUISITION', purposeDiscriminator: request!, replaySourceSnapshotHash: null, reacquisitionRequestId: request };
  }

  private runtimePipelineKey(tid: DiV0S4TransitionId, manifest: DiV0S4PipelineManifest): string {
    try {
      assertDiV0S4RuntimePipelineManifest(manifest, this.config);
      return buildDiV0S4PipelineVersionKey(manifest);
    } catch (error) {
      return reject(tid, 'PIPELINE_MANIFEST_INVALID', error instanceof Error ? error.message : undefined);
    }
  }

  /** `killPolicy.serialization.controlRowLock`; missing, unreadable or malformed row = KILLED. */
  private async requireNotKilled(db: Db, tid: DiV0S4TransitionId): Promise<DiV0S4KillEvaluation> {
    let kill: DiV0S4KillEvaluation;
    try {
      const rows = await db.$queryRaw<Array<{ kill_state: unknown }>>`
        SELECT kill_state FROM di_v0_s4_control WHERE id = 'GLOBAL' FOR UPDATE`;
      kill = evaluateDiV0S4KillRow(rows.length === 1 ? { kind: 'ROW', killState: rows[0].kill_state } : { kind: 'MISSING' });
    } catch {
      kill = evaluateDiV0S4KillRow({ kind: 'READ_ERROR' });
    }
    if (kill.state !== 'NOT_KILLED') reject(tid, kill.reason ?? 'DB_KILL_ACTIVE');
    return kill;
  }

  private async requireRegistryStatus(
    db: Db,
    tid: DiV0S4TransitionId,
    pipelineVersionKey: string,
    expected: 'ACTIVE' | 'RETIRED',
  ): Promise<void> {
    const rows = await db.$queryRaw<Array<{ status: string }>>`
      SELECT status FROM di_v0_s4_pipeline_versions WHERE pipeline_version_key = ${pipelineVersionKey} FOR SHARE`;
    if (rows[0]?.status !== expected) {
      reject(tid, expected === 'ACTIVE' ? 'PIPELINE_VERSION_NOT_ACTIVE' : 'PIPELINE_VERSION_NOT_RETIRED', rows[0]?.status ?? 'MISSING');
    }
  }

  private requireEnabled(tid: DiV0S4TransitionId, result: DiV0S4EnablementResult): void {
    if (!result.enabled) reject(tid, 'CONTROL_PLANE_DISABLED', result.failedTerms.join(','));
  }

  private enablement(
    role: DiV0S4ControlRole,
    organizationId: string,
    vehicleId: string,
    vehicleOrganizationId: string | null,
    kill: DiV0S4KillEvaluation,
  ): DiV0S4EnablementResult {
    return evaluateDiV0S4Enablement(this.config, role, { organizationId, vehicleId, vehicleOrganizationId }, kill);
  }

  private async rowEnablement(
    db: Db,
    role: DiV0S4ControlRole,
    row: WorkItemRow,
    kill: DiV0S4KillEvaluation,
  ): Promise<DiV0S4EnablementResult> {
    const vehicle = await db.$queryRaw<Array<{ organization_id: string }>>`
      SELECT organization_id FROM vehicles WHERE id = ${row.vehicle_id}`;
    return this.enablement(role, row.organization_id, row.vehicle_id, vehicle[0]?.organization_id ?? null, kill);
  }

  private rowColumns(): Prisma.Sql {
    return Prisma.sql`id, organization_id, vehicle_id, trip_id, source_family, run_purpose, purpose_discriminator,
      boundary_fingerprint, boundary_occurrence, pipeline_version_key, pipeline_version_manifest, status, lease_epoch, lease_owner,
      attempt_count, pinned_snapshot_hash,
      (lease_expires_at IS NOT NULL AND lease_expires_at > clock_timestamp()) AS lease_valid,
      (lease_expires_at IS NOT NULL AND lease_expires_at < clock_timestamp()) AS lease_expired`;
  }

  private async lockRow(db: Db, tid: DiV0S4TransitionId, workItemId: string): Promise<WorkItemRow> {
    const rows = await db.$queryRaw<WorkItemRow[]>`
      SELECT ${this.rowColumns()} FROM di_v0_s4_work_items WHERE id = ${workItemId} FOR UPDATE`;
    if (rows.length !== 1) return reject(tid, 'WORK_ITEM_NOT_FOUND');
    return {
      ...rows[0],
      lease_epoch: BigInt(rows[0].lease_epoch),
      attempt_count: Number(rows[0].attempt_count),
      boundary_occurrence: Number(rows[0].boundary_occurrence),
    };
  }

  /** Source state, then (`id`, `lease_epoch`, `lease_owner`), then DB-clock lease validity. */
  private requireHolder(tid: DiV0S4TransitionId, row: WorkItemRow, lease: DiV0S4Lease): void {
    assertDiV0S4TransitionFrom(tid, row.status);
    if (row.lease_epoch !== lease.leaseEpoch || row.lease_owner !== lease.leaseOwner) reject(tid, 'LEASE_NOT_HELD');
    if (!row.lease_valid) reject(tid, 'LEASE_EXPIRED');
  }

  private holderPredicate(lease: DiV0S4Lease): Prisma.Sql {
    return Prisma.sql`id = ${lease.workItemId} AND lease_epoch = ${lease.leaseEpoch} AND lease_owner = ${lease.leaseOwner}
      AND status = 'LEASED' AND lease_expires_at > clock_timestamp()`;
  }

  /** Unlocked canonical read: S4 never blocks canonical trip writers. */
  private async readTripScope(db: Db, tripId: string): Promise<TripScopeRow | null> {
    const rows = await db.$queryRaw<TripScopeRow[]>`
      SELECT t.id AS trip_id, t.vehicle_id, v.organization_id, t.trip_status::text AS trip_status,
        t.start_time AT TIME ZONE 'UTC' AS start_time, t.end_time AT TIME ZONE 'UTC' AS end_time,
        t.dimo_segment_id, t.merge_parent_trip_id, t.raw_detection_meta
      FROM vehicle_trips t JOIN vehicles v ON v.id = t.vehicle_id
      WHERE t.id = ${tripId}`;
    return rows[0] ?? null;
  }

  private fingerprintOf(scope: TripScopeRow): string {
    return buildDiV0S4BoundaryFingerprint({
      organizationId: scope.organization_id,
      vehicleId: scope.vehicle_id,
      tripId: scope.trip_id,
      tripStatus: scope.trip_status,
      startTime: scope.start_time,
      endTime: scope.end_time,
      dimoSegmentId: scope.dimo_segment_id,
      mergeParentTripId: scope.merge_parent_trip_id,
      boundaryRepairGeneration: readCurrentBoundaryRepairGeneration(scope.raw_detection_meta),
    });
  }

  /** `settlement.anchor` with every naive canonical timestamp interpreted as UTC. */
  private settlementAnchorSql(tripId: string): Prisma.Sql {
    return Prisma.sql`
      SELECT GREATEST(
        t.end_time AT TIME ZONE 'UTC',
        t.created_at AT TIME ZONE 'UTC',
        (SELECT max(r.applied_at) FROM trip_repairs r WHERE r.trip_id = t.id AND r.status = 'APPLIED') AT TIME ZONE 'UTC'
      ) AS anchor
      FROM vehicle_trips t WHERE t.id = ${tripId}`;
  }

  private requireReasonMatchesTrip(tid: DiV0S4TransitionId, reason: DiV0S4SupersededReason, scope: TripScopeRow): void {
    if (reason === 'TRIP_CANCELLED' && scope.trip_status !== 'CANCELLED') reject(tid, 'REASON_INVALID', 'trip is not CANCELLED');
    if (reason === 'TRIP_NOT_COMPLETED' && scope.trip_status !== 'ONGOING') reject(tid, 'REASON_INVALID', 'trip is not ONGOING');
  }

  /** Allocates the next PRIMARY boundary_occurrence under row lock on the per-trip sequence table. */
  private async allocatePrimaryBoundaryOccurrence(db: Db, organizationId: string, tripId: string): Promise<number> {
    const rows = await db.$queryRaw<Array<{ allocated: number }>>`
      INSERT INTO di_v0_s4_trip_primary_boundary_seq (organization_id, trip_id, next_boundary_occurrence)
      VALUES (${organizationId}, ${tripId}, 1)
      ON CONFLICT (organization_id, trip_id) DO UPDATE
        SET next_boundary_occurrence = di_v0_s4_trip_primary_boundary_seq.next_boundary_occurrence + 1
      RETURNING (di_v0_s4_trip_primary_boundary_seq.next_boundary_occurrence - 1) AS allocated`;
    if (rows.length !== 1) {
      throw new Error('di_v0_s4_allocate_primary_boundary_occurrence: allocation failed');
    }
    return Number(rows[0].allocated);
  }

  /**
   * A successor PRIMARY exists only for a PRIMARY predecessor whose trip is again COMPLETED in the
   * same tenant, under a still-ACTIVE pipeline. boundary_occurrence is allocated on insert so a
   * reverted fingerprint still receives a fresh generation (S4A_BOUNDARY_REVERT_AUTHORITY §5).
   */
  private async successorIdIfEligible(
    db: Db,
    row: WorkItemRow,
    scope: TripScopeRow,
    _currentFingerprint: string,
  ): Promise<string | null> {
    if (row.run_purpose !== 'PRIMARY') return null;
    if (scope.trip_status !== 'COMPLETED' || scope.end_time == null) return null;
    if (scope.organization_id !== row.organization_id || scope.vehicle_id !== row.vehicle_id) return null;
    const registry = await db.$queryRaw<Array<{ status: string }>>`
      SELECT status FROM di_v0_s4_pipeline_versions WHERE pipeline_version_key = ${row.pipeline_version_key} FOR SHARE`;
    if (registry[0]?.status !== 'ACTIVE') return null;
    return randomUUID();
  }

  /** Re-hash on load (`replay.rehashOnLoadRequired`) and rebuild the channel pins from the container. */
  private async loadPinnedSnapshotPins(
    db: Db,
    tid: DiV0S4TransitionId,
    row: WorkItemRow,
    snapshotHash: string,
  ): Promise<ReturnType<typeof pinsFromDiV0S4ChannelManifest>> {
    const rows = await db.$queryRaw<SnapshotRow[]>`
      SELECT organization_id, vehicle_id, trip_id, boundary_fingerprint, acquisition_window_start,
        acquisition_window_end, channel_manifest, payload_gzip, uncompressed_bytes
      FROM di_v0_s4_evidence_snapshots
      WHERE organization_id = ${row.organization_id} AND trip_id = ${row.trip_id} AND snapshot_hash = ${snapshotHash}`;
    const snapshot = rows[0];
    if (!snapshot || snapshot.vehicle_id !== row.vehicle_id || snapshot.boundary_fingerprint !== row.boundary_fingerprint) {
      return reject(tid, 'SNAPSHOT_SCOPE_INVALID');
    }
    let container: string;
    try {
      const raw = gunzipSync(Buffer.from(snapshot.payload_gzip), { maxOutputLength: DI_V0_S4_LIMITS.maxUncompressedSnapshotBytes });
      if (raw.length !== Number(snapshot.uncompressed_bytes)) throw new Error('uncompressed size mismatch');
      container = raw.toString('utf8');
    } catch (error) {
      return reject(tid, 'SNAPSHOT_INVALID', error instanceof Error ? error.message : undefined);
    }
    if (buildDiV0S4EvidenceSnapshotHash(container) !== snapshotHash) reject(tid, 'SNAPSHOT_HASH_MISMATCH');

    const header = `${DI_V0_S4_EVIDENCE_CONTAINER_VERSION}\n${JSON.stringify([
      row.organization_id,
      row.vehicle_id,
      row.trip_id,
      row.boundary_fingerprint,
      new Date(snapshot.acquisition_window_start).toISOString(),
      new Date(snapshot.acquisition_window_end).toISOString(),
    ])}\n`;
    if (!container.startsWith(header)) reject(tid, 'SNAPSHOT_INVALID', 'container header does not match the work item');
    const lines = new Set(container.split('\n'));
    try {
      const manifest = snapshot.channel_manifest as DiV0S4EvidenceChannelManifestEntry[];
      const pins = pinsFromDiV0S4ChannelManifest(manifest);
      for (const entry of manifest) {
        const line = JSON.stringify([entry.channel, entry.outcome, entry.reasonCode, entry.formatVersion, entry.payloadSha256, entry.attestationRef]);
        const expectedHash = entry.payloadSha256 == null ? null : `${entry.formatVersion}:sha256:${entry.payloadSha256}`;
        if (!lines.has(line) || expectedHash !== entry.channelEvidenceHash) throw new Error(`manifest entry ${entry.channel} not in container`);
      }
      return pins;
    } catch (error) {
      return reject(tid, 'SNAPSHOT_INVALID', error instanceof Error ? error.message : undefined);
    }
  }
}
