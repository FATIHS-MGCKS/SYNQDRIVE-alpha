import { randomUUID } from 'crypto';
import type { Prisma } from '@prisma/client';
import type { PrismaService } from '@shared/database/prisma.service';
import { deriveCompletionCountsFromRows } from '../shadow-persistence/di-v0-shadow-completion';
import { buildDiV0ShadowRunIdempotencyKey } from '../shadow-persistence/di-v0-shadow-idempotency';
import { DiV0ShadowPersistenceRepository } from '../shadow-persistence/di-v0-shadow-persistence.repository';
import type { DiV0ShadowPersistedIntervalInput, DiV0ShadowRunIdentity } from '../shadow-persistence/di-v0-shadow-types';
import { validateShadowIntervalRow, validateShadowSourceFamily } from '../shadow-persistence/di-v0-shadow-validation';
import { DiV0S4TransitionRejectedError } from './di-v0-s4a-errors';

export interface DiV0S4FencedS2Result {
  shadowRunId: string;
  reusedExistingRun: boolean;
}

interface ExistingRunRow {
  id: string;
  organization_id: string;
  vehicle_id: string;
  trip_id: string;
  input_evidence_version: string;
  status: string;
}

/**
 * S2 persistence inside the T06 transaction (S4A_IDENTITY_AND_FENCING §6 step 3).
 * `INSERT … ON CONFLICT DO NOTHING` never aborts the surrounding transaction; a conflicting row is
 * reused only when it is the same semantic execution, otherwise the caller's transaction rolls back
 * with S2_EXECUTION_IDENTITY_MISMATCH. Intervals are written only for a newly inserted run.
 * Replaces S2 `createOrGetRun` inside a transaction (DI-GAP-S2-IN-TX-CREATE-RACE-001).
 */
export async function persistDiV0S4FencedS2Run(
  tx: Prisma.TransactionClient,
  identity: DiV0ShadowRunIdentity,
  intervals: readonly DiV0ShadowPersistedIntervalInput[],
): Promise<DiV0S4FencedS2Result> {
  try {
    validateShadowSourceFamily(identity.sourceFamily);
    if (intervals.length === 0) {
      throw new Error('DI_V0_S4_S2_REQUIRES_INTERVALS');
    }
    const starts = new Set<number>();
    for (const row of intervals) {
      validateShadowIntervalRow(row);
      const start = row.intervalStart.getTime();
      if (starts.has(start)) {
        throw new Error('DI_V0_S4_S2_DUPLICATE_INTERVAL_START');
      }
      starts.add(start);
    }
  } catch (error) {
    throw new DiV0S4TransitionRejectedError(
      'T06_COMPLETE',
      'S2_INTERVALS_INVALID',
      error instanceof Error ? error.message : undefined,
    );
  }

  const idempotencyKey = buildDiV0ShadowRunIdempotencyKey(identity);
  const counts = deriveCompletionCountsFromRows([...intervals]);
  const inserted = await tx.$queryRaw<Array<{ id: string }>>`
    INSERT INTO di_v0_shadow_runs (
      id, organization_id, vehicle_id, trip_id, source_family,
      structural_version, estimator_version, calibration_version, source_family_policy_version,
      input_evidence_version, idempotency_key, status, started_at, completed_at,
      interval_count, numeric_speed_count, abstention_count, conflict_count, created_at, updated_at
    ) VALUES (
      ${randomUUID()}, ${identity.organizationId}, ${identity.vehicleId}, ${identity.tripId}, ${identity.sourceFamily},
      ${identity.versions.structuralVersion}, ${identity.versions.estimatorVersion},
      ${identity.versions.calibrationVersion}, ${identity.versions.sourceFamilyPolicyVersion},
      ${identity.inputEvidenceVersion}, ${idempotencyKey}, 'COMPLETED',
      clock_timestamp() AT TIME ZONE 'UTC', clock_timestamp() AT TIME ZONE 'UTC',
      ${counts.intervalCount}, ${counts.numericSpeedCount}, ${counts.abstentionCount}, ${counts.conflictCount},
      clock_timestamp() AT TIME ZONE 'UTC', clock_timestamp() AT TIME ZONE 'UTC'
    )
    ON CONFLICT (organization_id, idempotency_key) DO NOTHING
    RETURNING id`;

  if (inserted.length === 1) {
    const shadowRunId = inserted[0].id;
    const s2 = new DiV0ShadowPersistenceRepository(tx as unknown as PrismaService);
    const written = await s2.insertIntervalBatch(
      {
        id: shadowRunId,
        organizationId: identity.organizationId,
        vehicleId: identity.vehicleId,
        tripId: identity.tripId,
      } as Parameters<DiV0ShadowPersistenceRepository['insertIntervalBatch']>[0],
      [...intervals],
      identity.versions,
      tx,
    );
    if (written !== intervals.length) {
      throw new DiV0S4TransitionRejectedError('T06_COMPLETE', 'S2_INTERVALS_INVALID', 'interval insert count mismatch');
    }
    return { shadowRunId, reusedExistingRun: false };
  }

  const existing = await tx.$queryRaw<ExistingRunRow[]>`
    SELECT id, organization_id, vehicle_id, trip_id, input_evidence_version, status
    FROM di_v0_shadow_runs
    WHERE organization_id = ${identity.organizationId} AND idempotency_key = ${idempotencyKey}`;
  const row = existing[0];
  if (
    !row ||
    row.input_evidence_version !== identity.inputEvidenceVersion ||
    row.organization_id !== identity.organizationId ||
    row.vehicle_id !== identity.vehicleId ||
    row.trip_id !== identity.tripId
  ) {
    throw new DiV0S4TransitionRejectedError('T06_COMPLETE', 'S2_EXECUTION_IDENTITY_MISMATCH');
  }
  if (row.status !== 'COMPLETED') {
    throw new DiV0S4TransitionRejectedError('T06_COMPLETE', 'S2_EXISTING_RUN_NOT_COMPLETED', row.status);
  }
  return { shadowRunId: row.id, reusedExistingRun: true };
}
