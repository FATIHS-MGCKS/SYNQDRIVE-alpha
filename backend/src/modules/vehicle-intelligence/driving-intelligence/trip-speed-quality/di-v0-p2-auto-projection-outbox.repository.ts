import type { PrismaClient } from '@prisma/client';
import { DI_V0_P2_AUTO_PROJECTION_V2_TUNING } from './di-v0-p2-auto-projection-v2.config';
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
  claimToken: string;
}

export class DiV0P2AutoProjectionOutboxRepository {
  constructor(private readonly prisma: PrismaClient) {}

  /**
   * Enqueue durable work for eligible completed PRIMARY items missing a CURRENT V2 projection.
   * Rows already present in the outbox (any status) are excluded before ORDER BY/LIMIT.
   */
  async discoverEligible(input: {
    qcPolicyVersion: string;
    enabledSince: Date;
    limit: number;
    now: Date;
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
      SELECT wi.id, wi.organization_id, wi.trip_id, ${input.qcPolicyVersion}, 'PENDING', ${input.now}
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
        AND NOT EXISTS (
          SELECT 1 FROM di_v0_trip_speed_quality_auto_projection_outbox_v1 o
          WHERE o.work_item_id = wi.id
        )
      ORDER BY wi.completed_at ASC
      LIMIT ${input.limit}
      ON CONFLICT (work_item_id) DO NOTHING
      RETURNING work_item_id`;
    return rows.length;
  }

  async claimBatch(limit: number, now: Date, leaseMs = DI_V0_P2_AUTO_PROJECTION_V2_TUNING.claimLeaseMs): Promise<DiV0P2AutoProjectionOutboxRow[]> {
    const claimExpiresAt = new Date(now.getTime() + leaseMs);
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
          claim_token: string;
        }>
      >`
        WITH picked AS (
          SELECT work_item_id
          FROM di_v0_trip_speed_quality_auto_projection_outbox_v1
          WHERE (
            status IN ('PENDING', 'FAILED_RETRYABLE')
            AND next_attempt_at <= ${now}
          ) OR (
            status = 'PROCESSING'
            AND claim_expires_at IS NOT NULL
            AND claim_expires_at <= ${now}
          )
          ORDER BY created_at ASC
          LIMIT ${limit}
          FOR UPDATE SKIP LOCKED
        )
        UPDATE di_v0_trip_speed_quality_auto_projection_outbox_v1 o
        SET status = 'PROCESSING',
          claim_token = gen_random_uuid()::text,
          claim_expires_at = ${claimExpiresAt},
          updated_at = clock_timestamp()
        FROM picked p
        WHERE o.work_item_id = p.work_item_id
        RETURNING o.work_item_id, o.organization_id, o.trip_id, o.qc_policy_version, o.status,
          o.attempt_count, o.next_attempt_at, o.last_error_code, o.claim_token`;

      return claimed.map((r) => ({
        workItemId: r.work_item_id,
        organizationId: r.organization_id,
        tripId: r.trip_id,
        qcPolicyVersion: r.qc_policy_version,
        status: r.status as DiV0P2AutoProjectionOutboxStatus,
        attemptCount: r.attempt_count,
        nextAttemptAt: r.next_attempt_at,
        lastErrorCode: r.last_error_code,
        claimToken: r.claim_token,
      }));
    });
  }

  async markSucceeded(workItemId: string, claimToken: string): Promise<boolean> {
    const rows = await this.prisma.$queryRaw<Array<{ work_item_id: string }>>`
      UPDATE di_v0_trip_speed_quality_auto_projection_outbox_v1
      SET status = 'SUCCEEDED',
        last_error_code = NULL,
        last_error_at = NULL,
        claim_token = NULL,
        claim_expires_at = NULL,
        updated_at = clock_timestamp()
      WHERE work_item_id = ${workItemId}
        AND claim_token = ${claimToken}
        AND status = 'PROCESSING'
      RETURNING work_item_id`;
    return rows.length > 0;
  }

  async markSkipped(workItemId: string, claimToken: string, errorCode: string): Promise<boolean> {
    const rows = await this.prisma.$queryRaw<Array<{ work_item_id: string }>>`
      UPDATE di_v0_trip_speed_quality_auto_projection_outbox_v1
      SET status = 'SKIPPED_INELIGIBLE',
        last_error_code = ${errorCode},
        last_error_at = clock_timestamp(),
        claim_token = NULL,
        claim_expires_at = NULL,
        updated_at = clock_timestamp()
      WHERE work_item_id = ${workItemId}
        AND claim_token = ${claimToken}
        AND status = 'PROCESSING'
      RETURNING work_item_id`;
    return rows.length > 0;
  }

  async markFailedRetryable(
    workItemId: string,
    claimToken: string,
    errorCode: string,
    nextAttemptAt: Date,
  ): Promise<boolean> {
    const rows = await this.prisma.$queryRaw<Array<{ work_item_id: string }>>`
      UPDATE di_v0_trip_speed_quality_auto_projection_outbox_v1
      SET status = 'FAILED_RETRYABLE',
        attempt_count = attempt_count + 1,
        last_error_code = ${errorCode},
        last_error_at = clock_timestamp(),
        next_attempt_at = ${nextAttemptAt},
        claim_token = NULL,
        claim_expires_at = NULL,
        updated_at = clock_timestamp()
      WHERE work_item_id = ${workItemId}
        AND claim_token = ${claimToken}
        AND status = 'PROCESSING'
      RETURNING work_item_id`;
    return rows.length > 0;
  }
}
