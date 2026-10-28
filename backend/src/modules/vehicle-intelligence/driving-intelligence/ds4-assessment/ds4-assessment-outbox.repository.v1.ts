import type { PrismaClient } from '@prisma/client';
import { randomUUID } from 'crypto';
import { DS4_ASSESSMENT_FLEET_VEHICLES_V1, isVehicleInDs4AssessmentFleetV1 } from './ds4-assessment-fleet-admission.v1';
import { computeDs4AssessmentInputFingerprint } from './ds4-assessment-input-fingerprint';
import { DS4_TRIP_ASSESSMENT_VERSION_V1 } from './ds4-trip-assessment-v1.contract';

export type Ds4AssessmentOutboxStatus =
  | 'PENDING'
  | 'PROCESSING'
  | 'SUCCEEDED'
  | 'FAILED_RETRYABLE'
  | 'SKIPPED_INELIGIBLE';

export class Ds4AssessmentOutboxRepositoryV1 {
  constructor(private readonly prisma: PrismaClient) {}

  async discoverFromSucceededMotionRuns(input: { limit: number; now: Date }): Promise<number> {
    if (input.limit <= 0) return 0;
    const fleetIds = DS4_ASSESSMENT_FLEET_VEHICLES_V1.map((v) => v.vehicleId);
    const rows = await this.prisma.$queryRaw<
      Array<{
        id: string;
        organization_id: string;
        trip_id: string;
        vehicle_id: string;
        pinned_snapshot_hash: string;
        combined_input_identity: string;
        content_fingerprint: string;
        summary_json: { eventRowContract?: string | null };
        created_at: Date;
      }>
    >`
      SELECT r.id, r.organization_id, r.trip_id, r.vehicle_id, r.pinned_snapshot_hash,
        r.combined_input_identity, r.content_fingerprint, r.summary_json, r.created_at
      FROM di_v0_motion_core_shadow_runs_v1 r
      WHERE r.shadow_status = 'SUCCEEDED'
        AND r.vehicle_id = ANY(${fleetIds}::text[])
        AND NOT EXISTS (
          SELECT 1 FROM di_v0_ds4_trip_assessment_v1 a
          WHERE a.trip_id = r.trip_id
            AND a.source_motion_run_id = r.id
            AND a.assessment_version = ${DS4_TRIP_ASSESSMENT_VERSION_V1}
        )
      ORDER BY r.created_at ASC
      LIMIT ${input.limit}`;

    let inserted = 0;
    for (const row of rows) {
      if (!isVehicleInDs4AssessmentFleetV1(row.vehicle_id)) continue;
      const eventRowContract = row.summary_json?.eventRowContract ?? null;
      const fingerprint = computeDs4AssessmentInputFingerprint({
        sourceMotionRunId: row.id,
        pinnedSnapshotHash: row.pinned_snapshot_hash,
        combinedInputIdentity: row.combined_input_identity,
        contentFingerprint: row.content_fingerprint,
        eventRowContract,
      });
      try {
        await this.prisma.diV0Ds4AssessmentOutboxV1.create({
          data: {
            sourceMotionRunId: row.id,
            organizationId: row.organization_id,
            tripId: row.trip_id,
            vehicleId: row.vehicle_id,
            inputFingerprint: fingerprint,
            status: 'PENDING',
            nextAttemptAt: input.now,
          },
        });
        inserted += 1;
      } catch {
        // unique violation — already queued
      }
    }
    return inserted;
  }

  async claimBatch(input: { limit: number; now: Date; leaseMs: number }): Promise<
    Array<{
      outboxId: string;
      sourceMotionRunId: string;
      organizationId: string;
      tripId: string;
      vehicleId: string;
      claimToken: string;
    }>
  > {
    const claimToken = randomUUID();
    const claimExpiresAt = new Date(input.now.getTime() + input.leaseMs);
    const rows = await this.prisma.$queryRaw<
      Array<{
        outbox_id: string;
        source_motion_run_id: string;
        organization_id: string;
        trip_id: string;
        vehicle_id: string;
      }>
    >`
      UPDATE di_v0_ds4_assessment_outbox_v1 o
      SET status = 'PROCESSING', claim_token = ${claimToken}, claim_expires_at = ${claimExpiresAt},
          updated_at = NOW()
      WHERE o.outbox_id IN (
        SELECT outbox_id FROM di_v0_ds4_assessment_outbox_v1
        WHERE status = 'PENDING' AND next_attempt_at <= ${input.now}
        ORDER BY next_attempt_at ASC, created_at ASC
        LIMIT ${input.limit}
        FOR UPDATE SKIP LOCKED
      )
      RETURNING o.outbox_id, o.source_motion_run_id, o.organization_id, o.trip_id, o.vehicle_id`;

    return rows.map((r) => ({
      outboxId: r.outbox_id,
      sourceMotionRunId: r.source_motion_run_id,
      organizationId: r.organization_id,
      tripId: r.trip_id,
      vehicleId: r.vehicle_id,
      claimToken,
    }));
  }

  async markSucceeded(outboxId: string, claimToken: string): Promise<void> {
    await this.prisma.diV0Ds4AssessmentOutboxV1.updateMany({
      where: { outboxId, claimToken, status: 'PROCESSING' },
      data: { status: 'SUCCEEDED', claimToken: null, claimExpiresAt: null },
    });
  }

  async markFailedRetryable(
    outboxId: string,
    claimToken: string,
    input: { nextAttemptAt: Date; errorCode: string; now: Date },
  ): Promise<void> {
    await this.prisma.$executeRaw`
      UPDATE di_v0_ds4_assessment_outbox_v1
      SET status = 'FAILED_RETRYABLE',
          attempt_count = attempt_count + 1,
          next_attempt_at = ${input.nextAttemptAt},
          last_error_code = ${input.errorCode},
          last_error_at = ${input.now},
          claim_token = NULL,
          claim_expires_at = NULL,
          updated_at = NOW()
      WHERE outbox_id = ${outboxId}::uuid AND claim_token = ${claimToken} AND status = 'PROCESSING'`;
  }

  async markSkipped(outboxId: string, claimToken: string, errorCode: string): Promise<void> {
    await this.prisma.diV0Ds4AssessmentOutboxV1.updateMany({
      where: { outboxId, claimToken, status: 'PROCESSING' },
      data: {
        status: 'SKIPPED_INELIGIBLE',
        lastErrorCode: errorCode,
        lastErrorAt: new Date(),
        claimToken: null,
        claimExpiresAt: null,
      },
    });
  }
}
