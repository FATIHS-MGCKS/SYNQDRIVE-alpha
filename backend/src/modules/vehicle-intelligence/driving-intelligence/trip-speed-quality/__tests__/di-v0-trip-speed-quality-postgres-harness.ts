import { randomUUID } from 'crypto';
import type { PrismaClient } from '@prisma/client';
import { CALIBRATION_UNSET_V0_BUNDLE, DEFAULT_DI_V0_VERSION_TUPLE } from '../../core';
import {
  currentFingerprint,
  seedS4aTenant,
  seedS4aVerifiablePinnedEvidenceBundle,
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
  await db.$executeRaw`DELETE FROM di_v0_trip_speed_quality_auto_projection_outbox_v1 WHERE trip_id = ${tenant.tripId}`;
  await db.$executeRaw`DELETE FROM di_v0_trip_speed_quality_projections_v1 WHERE trip_id = ${tenant.tripId}`;
  await db.$executeRaw`DELETE FROM di_v0_s4_work_items WHERE trip_id = ${tenant.tripId}`;
  await db.$executeRaw`DELETE FROM di_v0_s4_evidence_snapshots WHERE trip_id = ${tenant.tripId}`;
  await db.$executeRaw`DELETE FROM di_v0_shadow_intervals WHERE trip_id = ${tenant.tripId}`;
  await db.$executeRaw`DELETE FROM di_v0_shadow_runs WHERE trip_id = ${tenant.tripId}`;
  await db.$executeRaw`DELETE FROM vehicle_trips WHERE id = ${tenant.tripId}`;
  await db.$executeRaw`DELETE FROM vehicles WHERE id = ${tenant.vehicleId}`;
  await db.$executeRaw`DELETE FROM organizations WHERE id = ${tenant.organizationId}`;
}

/**
 * Breaks S4D scope binding for the pinned snapshot while keeping the work item row.
 * (Deleting the snapshot cascades to work items via di_v0_s4_wi_pinned_snapshot_scope_fkey.)
 */
export async function driftP2PinnedSnapshotBoundaryFingerprint(
  db: PrismaClient,
  tenant: S4aTenant,
  snapshotHash: string,
  driftedBoundaryFingerprint: string,
): Promise<void> {
  await db.$executeRaw`
    ALTER TABLE di_v0_s4_evidence_snapshots DISABLE TRIGGER di_v0_s4_evidence_snapshot_immutable_guard_trg`;
  await db.$executeRaw`
    UPDATE di_v0_s4_evidence_snapshots
    SET boundary_fingerprint = ${driftedBoundaryFingerprint}
    WHERE organization_id = ${tenant.organizationId}
      AND trip_id = ${tenant.tripId}
      AND snapshot_hash = ${snapshotHash}`;
  await db.$executeRaw`
    ALTER TABLE di_v0_s4_evidence_snapshots ENABLE TRIGGER di_v0_s4_evidence_snapshot_immutable_guard_trg`;
}

export const P2_DRIFTED_BOUNDARY_FINGERPRINT = `DI_V0_S4_BOUNDARY_FP_V1:sha256:${'d'.repeat(64)}`;

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

export async function seedP2CompletedPrimaryFixture(db: PrismaClient): Promise<P2CompletedPrimaryFixture> {
  const tenant = await seedS4aTenant(db);
  const evidence = await seedS4aVerifiablePinnedEvidenceBundle(db, tenant);
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
