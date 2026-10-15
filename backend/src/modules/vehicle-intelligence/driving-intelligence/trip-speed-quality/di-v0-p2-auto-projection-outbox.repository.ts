import type { PrismaClient } from '@prisma/client';
import { DI_V0_TRIP_SPEED_QUALITY_PROJECTION_V1 } from './di-v0-trip-speed-quality-projection.version';

export type DiV0P2AutoProjectionOutboxStatus =
  | 'PENDING'
  | 'PROCESSING'
  | 'SUCCEEDED'
  | 'FAILED_RETRYABLE'
  | 'SKIPPED_INELIGIBLE';

export interface DiV0P2AutoProjectionOutboxRow {
  workItemId: string;
  organizationId: string;
  tripId: string;
  qcPolicyVersion: string;
  status: DiV0P2AutoProjectionOutboxStatus;
  attemptCount: number;
  nextAttemptAt: Date;
  lastErrorCode: string | null;
}

export class DiV0P2AutoProjectionOutboxRepository {
  constructor(private readonly prisma: PrismaClient) {}

  /**
   * Enqueue durable work for eligible completed PRIMARY items missing a CURRENT V2 projection.
   * Does not mutate S4 work items.
   */
  async discoverEligible(input: {
    qcPolicyVersion: string;
    enabledSince: Date;
    limit: number;
  }): Promise<number> {
    const rows = await this.prisma.$queryRaw<Array<{ work_item_id: string }>>`
      WITH active_primary AS (
        SELECT DISTINCT ON (organization_id, trip_id)
          id, organization_id, trip_id
        FROM di_v0_s4_work_items
        WHERE run_purpose = 'PRIMARY'
          AND purpose_discriminator = 'PRIMARY'
          AND status <> 'SUPERSEDED'
        ORDER BY organization_id, trip_id, boundary_occurrence DESC, created_at DESC
      )
      INSERT INTO di_v0_trip_speed_quality_auto_projection_outbox_v1 (
        work_item_id, organization_id, trip_id, qc_policy_version, status, next_attempt_at
      )
      SELECT wi.id, wi.organization_id, wi.trip_id, ${input.qcPolicyVersion}, 'PENDING', clock_timestamp()
      FROM di_v0_s4_work_items wi
      INNER JOIN active_primary ap
        ON ap.id = wi.id AND ap.organization_id = wi.organization_id AND ap.trip_id = wi.trip_id
      WHERE wi.status = 'COMPLETED'
        AND wi.run_purpose = 'PRIMARY'
        AND wi.purpose_discriminator = 'PRIMARY'
        AND wi.pinned_snapshot_hash IS NOT NULL
        AND wi.shadow_run_id IS NOT NULL
        AND wi.completed_at IS NOT NULL
        AND wi.completed_at >= ${input.enabledSince}
        AND EXISTS (
          SELECT 1 FROM di_v0_s4_evidence_snapshots es
          WHERE es.organization_id = wi.organization_id
            AND es.trip_id = wi.trip_id
            AND es.snapshot_hash = wi.pinned_snapshot_hash
        )
        AND NOT EXISTS (
          SELECT 1 FROM di_v0_trip_speed_quality_projections_v1 p
          WHERE p.work_item_id = wi.id
            AND p.qc_policy_version = ${input.qcPolicyVersion}
            AND p.projection_version = ${DI_V0_TRIP_SPEED_QUALITY_PROJECTION_V1}
            AND p.lifecycle_status = 'CURRENT'
        )
      ORDER BY wi.completed_at ASC
      LIMIT ${input.limit}
      ON CONFLICT (work_item_id) DO NOTHING
      RETURNING work_item_id`;
    return rows.length;
  }

  async claimBatch(limit: number, now: Date): Promise<DiV0P2AutoProjectionOutboxRow[]> {
    return this.prisma.$transaction(async (tx) => {
      const claimed = await tx.$queryRaw<
        Array<{
          work_item_id: string;
          organization_id: string;
          trip_id: string;
          qc_policy_version: string;
          status: string;
          attempt_count: number;
          next_attempt_at: Date;
          last_error_code: string | null;
        }>
      >`
        SELECT work_item_id, organization_id, trip_id, qc_policy_version, status, attempt_count,
          next_attempt_at, last_error_code
        FROM di_v0_trip_speed_quality_auto_projection_outbox_v1
        WHERE status IN ('PENDING', 'FAILED_RETRYABLE')
          AND next_attempt_at <= ${now}
        ORDER BY created_at ASC
        LIMIT ${limit}
        FOR UPDATE SKIP LOCKED`;
      if (claimed.length === 0) return [];

      const ids = claimed.map((r) => r.work_item_id);
      await tx.$executeRaw`
        UPDATE di_v0_trip_speed_quality_auto_projection_outbox_v1
        SET status = 'PROCESSING', updated_at = clock_timestamp()
        WHERE work_item_id = ANY(${ids}::text[])`;

      return claimed.map((r) => ({
        workItemId: r.work_item_id,
        organizationId: r.organization_id,
        tripId: r.trip_id,
        qcPolicyVersion: r.qc_policy_version,
        status: r.status as DiV0P2AutoProjectionOutboxStatus,
        attemptCount: r.attempt_count,
        nextAttemptAt: r.next_attempt_at,
        lastErrorCode: r.last_error_code,
      }));
    });
  }

  async markSucceeded(workItemId: string): Promise<void> {
    await this.prisma.$executeRaw`
      UPDATE di_v0_trip_speed_quality_auto_projection_outbox_v1
      SET status = 'SUCCEEDED', last_error_code = NULL, last_error_at = NULL, updated_at = clock_timestamp()
      WHERE work_item_id = ${workItemId}`;
  }

  async markSkipped(workItemId: string, errorCode: string): Promise<void> {
    await this.prisma.$executeRaw`
      UPDATE di_v0_trip_speed_quality_auto_projection_outbox_v1
      SET status = 'SKIPPED_INELIGIBLE', last_error_code = ${errorCode}, last_error_at = clock_timestamp(),
        updated_at = clock_timestamp()
      WHERE work_item_id = ${workItemId}`;
  }

  async markFailedRetryable(workItemId: string, errorCode: string, nextAttemptAt: Date): Promise<void> {
    await this.prisma.$executeRaw`
      UPDATE di_v0_trip_speed_quality_auto_projection_outbox_v1
      SET status = 'FAILED_RETRYABLE',
        attempt_count = attempt_count + 1,
        last_error_code = ${errorCode},
        last_error_at = clock_timestamp(),
        next_attempt_at = ${nextAttemptAt},
        updated_at = clock_timestamp()
      WHERE work_item_id = ${workItemId}`;
  }
}
