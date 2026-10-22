import type { PrismaClient } from '@prisma/client';
import { DI_V0_M7A_ROAD_ASSIGNMENT_SHADOW_BUNDLE_VERSION_V1 } from './di-v0-m7a-road-assignment-shadow.bundle.version';
import { frozenM7aAlgorithmFingerprint } from './di-v0-m7a-road-assignment-shadow-intent';
import { DI_V0_M7A_ROAD_ASSIGNMENT_SHADOW_TUNING } from './di-v0-m7a-road-assignment-shadow.config';

export type DiV0M7aRoadAssignmentShadowOutboxStatus =
  | 'PENDING'
  | 'PROCESSING'
  | 'SUCCEEDED'
  | 'FAILED_RETRYABLE'
  | 'SKIPPED_INELIGIBLE';

export interface DiV0M7aRoadAssignmentShadowOutboxRow {
  outboxId: string;
  workItemId: string;
  shadowIntentKey: string;
  organizationId: string;
  tripId: string;
  vehicleId: string;
  status: DiV0M7aRoadAssignmentShadowOutboxStatus;
  attemptCount: number;
  nextAttemptAt: Date;
  lastErrorCode: string | null;
  claimToken: string;
}

export class DiV0M7aRoadAssignmentShadowOutboxRepository {
  constructor(private readonly prisma: PrismaClient) {}

  /**
   * Enqueue durable shadow work for eligible completed PRIMARY S4 items.
   * Rows already in outbox or already SUCCEEDED for the same discovery intent are excluded
   * before ORDER BY/LIMIT so processed trips cannot occupy the discovery window.
   */
  async discoverEligible(input: {
    enabledSince: Date;
    organizationAllowlist: readonly string[];
    vehicleAllowlist: readonly string[];
    osmDataVersion: string;
    limit: number;
    now: Date;
  }): Promise<number> {
    if (input.organizationAllowlist.length === 0 || input.vehicleAllowlist.length === 0) return 0;
    const orgs = input.organizationAllowlist;
    const vehicles = input.vehicleAllowlist;
    const bundleVersion = DI_V0_M7A_ROAD_ASSIGNMENT_SHADOW_BUNDLE_VERSION_V1;
    const algorithmFingerprint = frozenM7aAlgorithmFingerprint();
    const osmDataVersion = input.osmDataVersion;

    const rows = await this.prisma.$queryRaw<Array<{ outbox_id: string }>>`
      WITH active_primary AS (
        SELECT DISTINCT ON (organization_id, trip_id)
          id, organization_id, trip_id
        FROM di_v0_s4_work_items
        WHERE run_purpose = 'PRIMARY'
          AND purpose_discriminator = 'PRIMARY'
          AND status <> 'SUPERSEDED'
        ORDER BY organization_id, trip_id, boundary_occurrence DESC, created_at DESC
      ),
      eligible AS (
        SELECT
          wi.id AS work_item_id,
          wi.organization_id,
          wi.trip_id,
          wi.vehicle_id,
          wi.pinned_snapshot_hash,
          coalesce(wi.combined_input_identity, '') AS combined_input_identity,
          wi.completed_at,
          (
            'DI_V0_M7A_ROAD_ASSIGNMENT_SHADOW_INTENT_V1:sha256:' || encode(
              digest(
                json_build_object(
                  'b', ${bundleVersion},
                  'a', ${algorithmFingerprint},
                  'c', coalesce(wi.combined_input_identity, ''),
                  'o', ${osmDataVersion},
                  'p', wi.pinned_snapshot_hash
                )::text,
                'sha256'
              ),
              'hex'
            )
          ) AS shadow_intent_key
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
          AND wi.organization_id = ANY(${orgs}::text[])
          AND wi.vehicle_id = ANY(${vehicles}::text[])
      )
      INSERT INTO di_v0_m7a_road_assignment_shadow_outbox_v1 (
        work_item_id, shadow_intent_key, organization_id, trip_id, vehicle_id,
        shadow_bundle_version, status, next_attempt_at
      )
      SELECT
        e.work_item_id,
        e.shadow_intent_key,
        e.organization_id,
        e.trip_id,
        e.vehicle_id,
        ${bundleVersion},
        'PENDING',
        ${input.now}
      FROM eligible e
      WHERE NOT EXISTS (
        SELECT 1 FROM di_v0_m7a_road_assignment_shadow_runs_v1 r
        WHERE r.work_item_id = e.work_item_id
          AND r.shadow_intent_key = e.shadow_intent_key
          AND r.shadow_status = 'SUCCEEDED'
      )
      AND NOT EXISTS (
        SELECT 1 FROM di_v0_m7a_road_assignment_shadow_outbox_v1 o
        WHERE o.work_item_id = e.work_item_id
          AND o.shadow_intent_key = e.shadow_intent_key
      )
      ORDER BY e.completed_at ASC
      LIMIT ${input.limit}
      ON CONFLICT (work_item_id, shadow_intent_key) DO NOTHING
      RETURNING outbox_id`;

    return rows.length;
  }

  async claimBatch(limit: number, now: Date): Promise<DiV0M7aRoadAssignmentShadowOutboxRow[]> {
    const claimExpiresAt = new Date(now.getTime() + DI_V0_M7A_ROAD_ASSIGNMENT_SHADOW_TUNING.claimLeaseMs);
    return this.prisma.$transaction(async (tx) => {
      const claimed = await tx.$queryRaw<
        Array<{
          outbox_id: string;
          work_item_id: string;
          shadow_intent_key: string;
          organization_id: string;
          trip_id: string;
          vehicle_id: string;
          status: string;
          attempt_count: number;
          next_attempt_at: Date;
          last_error_code: string | null;
          claim_token: string;
        }>
      >`
        WITH pick AS (
          SELECT outbox_id
          FROM di_v0_m7a_road_assignment_shadow_outbox_v1
          WHERE (
            status IN ('PENDING', 'FAILED_RETRYABLE') AND next_attempt_at <= ${now}
          ) OR (
            status = 'PROCESSING' AND claim_expires_at IS NOT NULL AND claim_expires_at <= ${now}
          )
          ORDER BY next_attempt_at ASC, created_at ASC
          LIMIT ${limit}
          FOR UPDATE SKIP LOCKED
        )
        UPDATE di_v0_m7a_road_assignment_shadow_outbox_v1 o
        SET status = 'PROCESSING',
            attempt_count = o.attempt_count + 1,
            claim_token = gen_random_uuid()::text,
            claim_expires_at = ${claimExpiresAt},
            updated_at = ${now}
        FROM pick
        WHERE o.outbox_id = pick.outbox_id
        RETURNING o.outbox_id, o.work_item_id, o.shadow_intent_key, o.organization_id, o.trip_id,
          o.vehicle_id, o.status, o.attempt_count, o.next_attempt_at, o.last_error_code, o.claim_token`;
      return claimed.map((r) => ({
        outboxId: r.outbox_id,
        workItemId: r.work_item_id,
        shadowIntentKey: r.shadow_intent_key,
        organizationId: r.organization_id,
        tripId: r.trip_id,
        vehicleId: r.vehicle_id,
        status: r.status as DiV0M7aRoadAssignmentShadowOutboxStatus,
        attemptCount: r.attempt_count,
        nextAttemptAt: r.next_attempt_at,
        lastErrorCode: r.last_error_code,
        claimToken: r.claim_token,
      }));
    });
  }

  async renewClaimLease(outboxId: string, claimToken: string, now: Date): Promise<boolean> {
    const claimExpiresAt = new Date(now.getTime() + DI_V0_M7A_ROAD_ASSIGNMENT_SHADOW_TUNING.claimLeaseMs);
    const rows = await this.prisma.$queryRaw<Array<{ outbox_id: string }>>`
      UPDATE di_v0_m7a_road_assignment_shadow_outbox_v1
      SET claim_expires_at = ${claimExpiresAt}, updated_at = ${now}
      WHERE outbox_id = ${outboxId}
        AND claim_token = ${claimToken}
        AND status = 'PROCESSING'
      RETURNING outbox_id`;
    return rows.length > 0;
  }

  async markSucceeded(outboxId: string, claimToken: string): Promise<boolean> {
    const rows = await this.prisma.$queryRaw<Array<{ outbox_id: string }>>`
      UPDATE di_v0_m7a_road_assignment_shadow_outbox_v1
      SET status = 'SUCCEEDED', claim_token = NULL, claim_expires_at = NULL, last_error_code = NULL, updated_at = now()
      WHERE outbox_id = ${outboxId} AND claim_token = ${claimToken} AND status = 'PROCESSING'
      RETURNING outbox_id`;
    return rows.length > 0;
  }

  async markSkipped(outboxId: string, claimToken: string, code: string): Promise<boolean> {
    const rows = await this.prisma.$queryRaw<Array<{ outbox_id: string }>>`
      UPDATE di_v0_m7a_road_assignment_shadow_outbox_v1
      SET status = 'SKIPPED_INELIGIBLE', last_error_code = ${code}, claim_token = NULL, claim_expires_at = NULL, updated_at = now()
      WHERE outbox_id = ${outboxId} AND claim_token = ${claimToken} AND status = 'PROCESSING'
      RETURNING outbox_id`;
    return rows.length > 0;
  }

  async markFailedRetryable(
    outboxId: string,
    claimToken: string,
    code: string,
    nextAttemptAt: Date,
  ): Promise<boolean> {
    const rows = await this.prisma.$queryRaw<Array<{ outbox_id: string }>>`
      UPDATE di_v0_m7a_road_assignment_shadow_outbox_v1
      SET status = 'FAILED_RETRYABLE',
          last_error_code = ${code},
          next_attempt_at = ${nextAttemptAt},
          claim_token = NULL,
          claim_expires_at = NULL,
          updated_at = now()
      WHERE outbox_id = ${outboxId} AND claim_token = ${claimToken} AND status = 'PROCESSING'
      RETURNING outbox_id`;
    return rows.length > 0;
  }
}
