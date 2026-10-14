import { randomUUID } from 'crypto';
import { gzipSync } from 'zlib';
import type { PrismaClient } from '@prisma/client';
import {
  CALIBRATION_UNSET_V0_BUNDLE,
  computeDiV0TripIntervals,
  DEFAULT_DI_V0_VERSION_TUPLE,
} from '../../core';
import {
  acquireDiV0HistoricalPositions,
  toDiV0S1PositionInput,
} from '../../position-acquisition/di-v0-position-acquisition';
import {
  API_SYNTHETIC_IDENTITY,
  expectAcquired,
  row,
  signalsBody,
  staticTransport,
} from '../../position-acquisition/__tests__/position-acquisition-test-helpers';
import { DI_V0_S4_EVIDENCE_CONTAINER_VERSION } from '../../s4a-foundation/di-v0-s4a-contract';
import { parseDiV0S4ControlPlaneConfig } from '../../s4a-foundation/di-v0-s4a-control-plane';
import {
  currentFingerprint,
  seedS4aTenant,
  type S4aTenant,
} from '../../s4a-foundation/__tests__/di-v0-s4a-postgres-harness';
import { serializeDiV0S4EvidenceContainer } from '../../s4a-foundation/di-v0-s4a-identity';
import {
  buildDiV0S4cNativeChannelInput,
  buildDiV0S4cPositionPresentChannel,
  buildDiV0S4cR1ChannelInput,
} from '../../s4c-executor/di-v0-s4c-evidence-channels';
import { mapComputeOutputToPersistRows } from '../../shadow-persistence/di-v0-shadow-mapper';
import type { DiV0ShadowPersistedIntervalInput } from '../../shadow-persistence/di-v0-shadow-types';
import { buildDiV0TripSpeedQualityProjectionV1 } from '../build-di-v0-trip-speed-quality-projection.v1';
import type { DiV0TripSpeedQualityProjectionV1 } from '../di-v0-trip-speed-quality-projection.types';
import { syntheticHighway130Input } from '../../speed-qc/__tests__/fixtures/synthetic-scenarios';
import { verifyAndParseDiV0PinnedEvidenceSnapshot } from '../../s4d-replay/di-v0-s4d-verified-snapshot';

export interface P2CompletedPrimaryFixture {
  tenant: S4aTenant;
  pipelineVersionKey: string;
  boundaryFingerprint: string;
  snapshotHash: string;
  shadowRunId: string;
  workItemId: string;
}

export async function cleanupP2Tenant(db: PrismaClient, tenant: S4aTenant): Promise<void> {
  await db.$executeRaw`DELETE FROM di_v0_trip_speed_quality_projections_v1 WHERE trip_id = ${tenant.tripId}`;
  await db.$executeRaw`DELETE FROM di_v0_s4_work_items WHERE trip_id = ${tenant.tripId}`;
  await db.$executeRaw`DELETE FROM di_v0_s4_evidence_snapshots WHERE trip_id = ${tenant.tripId}`;
  await db.$executeRaw`DELETE FROM di_v0_shadow_intervals WHERE trip_id = ${tenant.tripId}`;
  await db.$executeRaw`DELETE FROM di_v0_shadow_runs WHERE trip_id = ${tenant.tripId}`;
  await db.$executeRaw`DELETE FROM vehicle_trips WHERE id = ${tenant.tripId}`;
  await db.$executeRaw`DELETE FROM vehicles WHERE id = ${tenant.vehicleId}`;
  await db.$executeRaw`DELETE FROM organizations WHERE id = ${tenant.organizationId}`;
}

export function buildSyntheticTripSpeedProjection(
  tenant: S4aTenant,
  input: {
    workItemId: string;
    shadowRunId: string;
    snapshotHash: string;
    boundaryFingerprint: string;
  },
): DiV0TripSpeedQualityProjectionV1 {
  const qc = syntheticHighway130Input();
  return buildDiV0TripSpeedQualityProjectionV1({
    organizationId: tenant.organizationId,
    vehicleId: tenant.vehicleId,
    tripId: tenant.tripId,
    workItemId: input.workItemId,
    shadowRunId: input.shadowRunId,
    pinnedSnapshotHash: input.snapshotHash,
    boundaryFingerprint: input.boundaryFingerprint,
    sourceFamily: 'API_SYNTHETIC',
    combinedInputIdentity: 'ci-p2',
    shadowInputEvidenceVersion: 'iev-p2',
    workItemCompletedAt: new Date(),
    snapshotVerified: true,
    evidence: {
      positions: qc.positions,
      positionStateByLabel: new Map(qc.positions.map((p) => [p.bucketLabel, p.positionState ?? 'FRESH'])),
      r1Obd: qc.r1Obd ?? [],
    },
    shadowIntervals: [
      {
        intervalStart: new Date(qc.shadow.intervalStart),
        intervalEnd: new Date(qc.shadow.intervalEnd),
        referenceTime: new Date(qc.shadow.referenceTime),
        motionState: qc.shadow.motionState,
        positionState: qc.shadow.positionState,
        estimatedSpeedKmh: qc.shadow.estimatedSpeedKmh,
        speedEvidenceState: qc.shadow.speedEvidenceState,
        valueConfidence: qc.shadow.valueConfidence,
        sourceRelation: qc.shadow.sourceRelation,
        abstentionReason: qc.shadow.abstentionReason,
        evidenceSources: qc.shadow.evidenceSources,
        sourceQualityFlags: qc.shadow.sourceQualityFlags,
      },
    ],
  });
}

const P2_TEST_DIMO_TOKEN_ID = 424_242;

function utcIsoNoMs(date: Date): string {
  return date.toISOString().replace(/\.\d{3}Z$/, 'Z');
}

/** S4D-verifiable pinned snapshot + shadow intervals aligned to the tenant trip window. */
async function seedP2VerifiablePinnedEvidence(
  db: PrismaClient,
  tenant: S4aTenant,
): Promise<{
  snapshotHash: string;
  boundaryFingerprint: string;
  combinedInputIdentity: string;
  shadowIntervals: DiV0ShadowPersistedIntervalInput[];
}> {
  const boundaryFingerprint = await currentFingerprint(db, tenant.tripId);
  const fromUtc = utcIsoNoMs(tenant.startTime);
  const toUtc = utcIsoNoMs(tenant.endTime);
  const providerRows = Array.from({ length: 12 }, (_, i) =>
    row(utcIsoNoMs(new Date(tenant.startTime.getTime() + i * 1000)), 52 + i * 0.000_01, 9),
  );
  const acquired = expectAcquired(
    await acquireDiV0HistoricalPositions(
      {
        organizationId: tenant.organizationId,
        vehicleId: tenant.vehicleId,
        tripId: tenant.tripId,
        dimoTokenId: P2_TEST_DIMO_TOKEN_ID,
        dimoDeviceIdentity: API_SYNTHETIC_IDENTITY,
        fromUtc,
        toUtc,
      },
      staticTransport(signalsBody(providerRows)),
      {},
    ),
  );
  const control = parseDiV0S4ControlPlaneConfig({
    DI_V0_S4_MASTER_ENABLED: 'true',
    DI_V0_S4_R1_ENABLED: 'false',
  });
  const serialized = serializeDiV0S4EvidenceContainer({
    organizationId: tenant.organizationId,
    vehicleId: tenant.vehicleId,
    tripId: tenant.tripId,
    boundaryFingerprint,
    windowStart: tenant.startTime,
    windowEnd: tenant.endTime,
    channels: [
      buildDiV0S4cNativeChannelInput(control, 'API_SYNTHETIC'),
      buildDiV0S4cPositionPresentChannel(acquired),
      buildDiV0S4cR1ChannelInput(control, 'API_SYNTHETIC', P2_TEST_DIMO_TOKEN_ID, tenant.vehicleId, null, null),
    ],
  });
  const raw = Buffer.from(serialized.container, 'utf8');
  const gzip = gzipSync(raw);
  await db.$executeRaw`
    INSERT INTO di_v0_s4_evidence_snapshots (id, organization_id, vehicle_id, trip_id, snapshot_hash, container_version,
      boundary_fingerprint, acquisition_window_start, acquisition_window_end, channel_manifest, payload_gzip,
      payload_bytes, uncompressed_bytes, retention_until)
    VALUES (${randomUUID()}, ${tenant.organizationId}, ${tenant.vehicleId}, ${tenant.tripId}, ${serialized.snapshotHash},
      ${DI_V0_S4_EVIDENCE_CONTAINER_VERSION}, ${boundaryFingerprint}, ${tenant.startTime.toISOString()}::timestamptz,
      ${tenant.endTime.toISOString()}::timestamptz, ${JSON.stringify(serialized.channelManifest)}::jsonb, ${gzip},
      ${gzip.length}::int, ${raw.length}::int, now() + interval '90 days')`;
  const [snapshotRow] = await db.$queryRaw<
    Array<{
      organization_id: string;
      vehicle_id: string;
      trip_id: string;
      boundary_fingerprint: string;
      acquisition_window_start: Date;
      acquisition_window_end: Date;
      channel_manifest: unknown;
      payload_gzip: Buffer;
      uncompressed_bytes: number | bigint;
    }>
  >`
    SELECT organization_id, vehicle_id, trip_id, boundary_fingerprint, acquisition_window_start,
      acquisition_window_end, channel_manifest, payload_gzip, uncompressed_bytes
    FROM di_v0_s4_evidence_snapshots
    WHERE organization_id = ${tenant.organizationId} AND trip_id = ${tenant.tripId}
      AND snapshot_hash = ${serialized.snapshotHash}
    LIMIT 1`;
  const verified = verifyAndParseDiV0PinnedEvidenceSnapshot(snapshotRow, {
    organizationId: tenant.organizationId,
    vehicleId: tenant.vehicleId,
    tripId: tenant.tripId,
    boundaryFingerprint,
    snapshotHash: serialized.snapshotHash,
    sourceFamily: 'API_SYNTHETIC',
  });
  if (!verified.ok) {
    throw new Error(`P2 fixture snapshot failed S4D verify: ${verified.code}${verified.detail ? `:${verified.detail}` : ''}`);
  }
  const v = DEFAULT_DI_V0_VERSION_TUPLE;
  const computeOut = computeDiV0TripIntervals(toDiV0S1PositionInput(acquired), {
    versions: v,
    calibration: CALIBRATION_UNSET_V0_BUNDLE,
  });
  const shadowIntervals = mapComputeOutputToPersistRows(computeOut, v);
  if (shadowIntervals.length === 0) {
    throw new Error('P2 fixture shadow interval compute produced no rows');
  }
  return {
    snapshotHash: serialized.snapshotHash,
    boundaryFingerprint,
    combinedInputIdentity: serialized.combinedInputIdentity,
    shadowIntervals,
  };
}

export async function seedP2CompletedPrimaryFixture(db: PrismaClient): Promise<P2CompletedPrimaryFixture> {
  const tenant = await seedS4aTenant(db);
  const evidence = await seedP2VerifiablePinnedEvidence(db, tenant);
  const snapshotHash = evidence.snapshotHash;
  const boundaryFingerprint = evidence.boundaryFingerprint;
  const pipelineVersionKey = `DI_V0_S4_PIPELINE_V1:sha256:${'c'.repeat(64)}`;
  await db.$executeRaw`
    INSERT INTO di_v0_s4_pipeline_versions (pipeline_version_key, manifest, status)
    VALUES (${pipelineVersionKey}, '{}'::jsonb, 'ACTIVE')
    ON CONFLICT DO NOTHING`;
  const shadowRunId = randomUUID();
  const workItemId = randomUUID();
  const v = DEFAULT_DI_V0_VERSION_TUPLE;
  await db.$executeRaw`
    INSERT INTO di_v0_shadow_runs (
      id, organization_id, vehicle_id, trip_id, source_family, structural_version, estimator_version,
      calibration_version, source_family_policy_version, input_evidence_version, idempotency_key, status, updated_at
    ) VALUES (
      ${shadowRunId}, ${tenant.organizationId}, ${tenant.vehicleId}, ${tenant.tripId}, 'API_SYNTHETIC',
      ${v.structuralVersion}, ${v.estimatorVersion}, ${CALIBRATION_UNSET_V0_BUNDLE.calibrationVersion},
      ${v.sourceFamilyPolicyVersion}, 'p2-iev', ${randomUUID()}, 'COMPLETED', now()
    )`;
  for (const interval of evidence.shadowIntervals) {
    await db.$executeRaw`
      INSERT INTO di_v0_shadow_intervals (
        id, shadow_run_id, organization_id, vehicle_id, trip_id, interval_start, interval_end, reference_time,
        motion_state, position_state, causal_position_state, temporal_confidence, value_confidence, source_relation,
        claim_level, derivation_method, derivation_version, structural_version, estimator_version, calibration_version,
        source_family_policy_version, provenance, estimated_speed_kmh, speed_evidence_state
      ) VALUES (
        ${randomUUID()}, ${shadowRunId}, ${tenant.organizationId}, ${tenant.vehicleId}, ${tenant.tripId},
        ${interval.intervalStart}, ${interval.intervalEnd}, ${interval.referenceTime},
        ${interval.motionState}, ${interval.positionState}, ${interval.causalPositionState},
        ${interval.temporalConfidence}, ${interval.valueConfidence}, ${interval.sourceRelation},
        ${interval.claimLevel}, ${interval.derivationMethod}, ${interval.derivationVersion},
        ${v.structuralVersion}, ${v.estimatorVersion}, ${CALIBRATION_UNSET_V0_BUNDLE.calibrationVersion},
        ${v.sourceFamilyPolicyVersion}, ${JSON.stringify(interval.provenance)}::jsonb,
        ${interval.estimatedSpeedKmh}, ${interval.speedEvidenceState}
      )`;
  }
  const combinedInputIdentity = evidence.combinedInputIdentity;
  const executionIdentity = `DI_V0_S4_EXECUTION_IDENTITY_V1:sha256:${'e'.repeat(64)}`;
  await db.$executeRaw`
    INSERT INTO di_v0_s4_work_items (
      id, organization_id, vehicle_id, trip_id, source_family, run_purpose, purpose_discriminator,
      boundary_fingerprint, boundary_occurrence, pipeline_version_key, pipeline_version_manifest, status,
      shadow_run_id, pinned_snapshot_hash, pinned_at, pinned_epoch, combined_input_identity, execution_identity,
      completed_at, next_attempt_at, settlement_anchor_at, eligible_at
    ) VALUES (
      ${workItemId}, ${tenant.organizationId}, ${tenant.vehicleId}, ${tenant.tripId}, 'API_SYNTHETIC',
      'PRIMARY', 'PRIMARY', ${boundaryFingerprint}, 0, ${pipelineVersionKey}, '{}'::jsonb, 'COMPLETED',
      ${shadowRunId}, ${snapshotHash}, now(), 1, ${combinedInputIdentity}, ${executionIdentity},
      now(), NULL, now() - interval '1 hour', now() - interval '30 minutes'
    )`;
  return {
    tenant,
    pipelineVersionKey,
    boundaryFingerprint,
    snapshotHash,
    shadowRunId,
    workItemId,
  };
}
