import { randomUUID } from 'crypto';
import type { PrismaClient } from '@prisma/client';
import { CALIBRATION_UNSET_V0_BUNDLE, DEFAULT_DI_V0_VERSION_TUPLE } from '../../core';
import {
  currentFingerprint,
  s4aIntervals,
  seedS4aSnapshot,
  seedS4aTenant,
  type S4aTenant,
} from '../../s4a-foundation/__tests__/di-v0-s4a-postgres-harness';
import { buildDiV0TripSpeedQualityProjectionV1 } from '../build-di-v0-trip-speed-quality-projection.v1';
import type { DiV0TripSpeedQualityProjectionV1 } from '../di-v0-trip-speed-quality-projection.types';
import { syntheticHighway130Input } from '../../speed-qc/__tests__/fixtures/synthetic-scenarios';

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

const S4A_INTERVAL_EPOCH_MS = Date.parse('2026-01-01T00:00:00Z');

function shiftS4aIntervalTime(date: Date, tenantStart: Date): Date {
  return new Date(date.getTime() + tenantStart.getTime() - S4A_INTERVAL_EPOCH_MS);
}

export async function seedP2CompletedPrimaryFixture(db: PrismaClient): Promise<P2CompletedPrimaryFixture> {
  const tenant = await seedS4aTenant(db);
  const snapshotHash = await seedS4aSnapshot(db, tenant, `p2-${randomUUID()}`);
  const boundaryFingerprint = await currentFingerprint(db, tenant.tripId);
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
  for (const interval of s4aIntervals()) {
    const intervalStart = shiftS4aIntervalTime(interval.intervalStart, tenant.startTime);
    const intervalEnd = shiftS4aIntervalTime(interval.intervalEnd, tenant.startTime);
    const referenceTime = shiftS4aIntervalTime(interval.referenceTime, tenant.startTime);
    await db.$executeRaw`
      INSERT INTO di_v0_shadow_intervals (
        id, shadow_run_id, organization_id, vehicle_id, trip_id, interval_start, interval_end, reference_time,
        motion_state, position_state, causal_position_state, temporal_confidence, value_confidence, source_relation,
        claim_level, derivation_method, derivation_version, structural_version, estimator_version, calibration_version,
        source_family_policy_version, provenance, estimated_speed_kmh, speed_evidence_state
      ) VALUES (
        ${randomUUID()}, ${shadowRunId}, ${tenant.organizationId}, ${tenant.vehicleId}, ${tenant.tripId},
        ${intervalStart}, ${intervalEnd}, ${referenceTime},
        ${interval.motionState}, ${interval.positionState}, ${interval.causalPositionState},
        ${interval.temporalConfidence}, ${interval.valueConfidence}, ${interval.sourceRelation},
        ${interval.claimLevel}, ${interval.derivationMethod}, ${interval.derivationVersion},
        ${v.structuralVersion}, ${v.estimatorVersion}, ${CALIBRATION_UNSET_V0_BUNDLE.calibrationVersion},
        ${v.sourceFamilyPolicyVersion}, ${JSON.stringify(interval.provenance)}::jsonb,
        ${interval.estimatedSpeedKmh}, ${interval.speedEvidenceState}
      )`;
  }
  const combinedInputIdentity = `DI_V0_COMBINED_INPUT_IDENTITY_V0_3:sha256:${'d'.repeat(64)}`;
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
