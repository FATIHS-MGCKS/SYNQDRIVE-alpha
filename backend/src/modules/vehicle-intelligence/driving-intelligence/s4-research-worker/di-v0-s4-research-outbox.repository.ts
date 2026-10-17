import type { PrismaClient } from '@prisma/client';
import { DI_V0_S4_RESEARCH_BUNDLE_VERSION_V2 } from './di-v0-s4-research-bundle.version';

export type DiV0S4ResearchOutboxStatus =
  | 'PENDING'
  | 'PROCESSING'
  | 'SUCCEEDED'
  | 'FAILED_RETRYABLE'
  | 'SKIPPED_INELIGIBLE';

export interface DiV0S4ResearchOutboxRow {
  workItemId: string;
  organizationId: string;
  tripId: string;
  vehicleId: string;
  researchBundleVersion: string;
  status: DiV0S4ResearchOutboxStatus;
  attemptCount: number;
  nextAttemptAt: Date;
  lastErrorCode: string | null;
  claimToken: string;
}

export const DI_V0_S4_RESEARCH_OUTBOX_TUNING = {
  claimLeaseMs: 10 * 60_000,
} as const;

export class DiV0S4ResearchOutboxRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async discoverEligible(input: {
    enabledSince: Date;
    researchOrgAllowlist: readonly string[];
    researchVehicleAllowlist: readonly string[];
    limit: number;
    now: Date;
  }): Promise<number> {
    if (input.researchOrgAllowlist.length === 0 || input.researchVehicleAllowlist.length === 0) return 0;
    const orgs = input.researchOrgAllowlist;
    const vehicles = input.researchVehicleAllowlist;
    const rows = await this.prisma.$queryRaw<Array<{ work_item_id: string }>>`
      WITH active_primary AS (
        SELECT DISTINCT ON (organization_id, trip_id)
          id, organization_id, trip_id, vehicle_id
        FROM di_v0_s4_work_items
        WHERE run_purpose = 'PRIMARY'
          AND purpose_discriminator = 'PRIMARY'
          AND status <> 'SUPERSEDED'
        ORDER BY organization_id, trip_id, boundary_occurrence DESC, created_at DESC
      )
      INSERT INTO di_v0_s4_research_outbox_v1 (
        work_item_id, organization_id, trip_id, vehicle_id, research_bundle_version, status, next_attempt_at
      )
      SELECT wi.id, wi.organization_id, wi.trip_id, wi.vehicle_id, ${DI_V0_S4_RESEARCH_BUNDLE_VERSION_V2}, 'PENDING', ${input.now}
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
        AND NOT EXISTS (
          SELECT 1 FROM di_v0_s4_research_runs_v1 r
          WHERE r.work_item_id = wi.id
            AND r.research_bundle_version = ${DI_V0_S4_RESEARCH_BUNDLE_VERSION_V2}
            AND r.pinned_snapshot_hash = wi.pinned_snapshot_hash
        )
        AND NOT EXISTS (
          SELECT 1 FROM di_v0_s4_research_outbox_v1 o WHERE o.work_item_id = wi.id
        )
      ORDER BY wi.completed_at ASC
      LIMIT ${input.limit}
      ON CONFLICT (work_item_id) DO NOTHING
      RETURNING work_item_id`;
    return rows.length;
  }

  async claimBatch(limit: number, now: Date): Promise<DiV0S4ResearchOutboxRow[]> {
    const claimExpiresAt = new Date(now.getTime() + DI_V0_S4_RESEARCH_OUTBOX_TUNING.claimLeaseMs);
    return this.prisma.$transaction(async (tx) => {
      const claimed = await tx.$queryRaw<
        Array<{
          work_item_id: string;
          organization_id: string;
          trip_id: string;
          vehicle_id: string;
          research_bundle_version: string;
          status: string;
          attempt_count: number;
          next_attempt_at: Date;
          last_error_code: string | null;
          claim_token: string;
        }>
      >`
        WITH picked AS (
          SELECT work_item_id
          FROM di_v0_s4_research_outbox_v1
          WHERE (
            status IN ('PENDING', 'FAILED_RETRYABLE') AND next_attempt_at <= ${now}
          ) OR (
            status = 'PROCESSING' AND claim_expires_at IS NOT NULL AND claim_expires_at <= ${now}
          )
          ORDER BY created_at ASC
          LIMIT ${limit}
          FOR UPDATE SKIP LOCKED
        )
        UPDATE di_v0_s4_research_outbox_v1 o
        SET status = 'PROCESSING',
          claim_token = gen_random_uuid()::text,
          claim_expires_at = ${claimExpiresAt},
          attempt_count = o.attempt_count + 1,
          updated_at = clock_timestamp()
        FROM picked
        WHERE o.work_item_id = picked.work_item_id
        RETURNING o.work_item_id, o.organization_id, o.trip_id, o.vehicle_id, o.research_bundle_version,
          o.status, o.attempt_count, o.next_attempt_at, o.last_error_code, o.claim_token`;
      return claimed.map((r) => ({
        workItemId: r.work_item_id,
        organizationId: r.organization_id,
        tripId: r.trip_id,
        vehicleId: r.vehicle_id,
        researchBundleVersion: r.research_bundle_version,
        status: r.status as DiV0S4ResearchOutboxStatus,
        attemptCount: r.attempt_count,
        nextAttemptAt: r.next_attempt_at,
        lastErrorCode: r.last_error_code,
        claimToken: r.claim_token,
      }));
    });
  }

  async markSucceeded(workItemId: string, claimToken: string): Promise<boolean> {
    const n = await this.prisma.$executeRaw`
      UPDATE di_v0_s4_research_outbox_v1
      SET status = 'SUCCEEDED', claim_token = NULL, claim_expires_at = NULL, updated_at = clock_timestamp()
      WHERE work_item_id = ${workItemId} AND claim_token = ${claimToken} AND status = 'PROCESSING'`;
    return Number(n) === 1;
  }

  async markFailedRetryable(workItemId: string, claimToken: string, code: string, nextAttemptAt: Date): Promise<boolean> {
    const n = await this.prisma.$executeRaw`
      UPDATE di_v0_s4_research_outbox_v1
      SET status = 'FAILED_RETRYABLE',
        last_error_code = ${code},
        last_error_at = clock_timestamp(),
        next_attempt_at = ${nextAttemptAt},
        claim_token = NULL,
        claim_expires_at = NULL,
        updated_at = clock_timestamp()
      WHERE work_item_id = ${workItemId} AND claim_token = ${claimToken} AND status = 'PROCESSING'`;
    return Number(n) === 1;
  }

  async markSkipped(workItemId: string, claimToken: string, code: string): Promise<boolean> {
    const n = await this.prisma.$executeRaw`
      UPDATE di_v0_s4_research_outbox_v1
      SET status = 'SKIPPED_INELIGIBLE',
        last_error_code = ${code},
        last_error_at = clock_timestamp(),
        claim_token = NULL,
        claim_expires_at = NULL,
        updated_at = clock_timestamp()
      WHERE work_item_id = ${workItemId} AND claim_token = ${claimToken} AND status = 'PROCESSING'`;
    return Number(n) === 1;
  }
}
