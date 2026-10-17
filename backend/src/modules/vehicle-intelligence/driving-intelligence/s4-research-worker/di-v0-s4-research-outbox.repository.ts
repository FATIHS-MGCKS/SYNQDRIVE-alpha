import type { PrismaClient } from '@prisma/client';
import { S4_RESEARCH_GEOMETRY_PROJECTION_ID } from '../s4-research/version';
import { DI_V0_S4_RESEARCH_BUNDLE_VERSION_V2 } from './di-v0-s4-research-bundle.version';

export type DiV0S4ResearchOutboxStatus =
  | 'PENDING'
  | 'PROCESSING'
  | 'SUCCEEDED'
  | 'FAILED_RETRYABLE'
  | 'SKIPPED_INELIGIBLE';

export interface DiV0S4ResearchOutboxRow {
  outboxId: string;
  workItemId: string;
  researchIntentKey: string;
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
    osmDataVersion: string;
    limit: number;
    now: Date;
  }): Promise<number> {
    if (input.researchOrgAllowlist.length === 0 || input.researchVehicleAllowlist.length === 0) return 0;
    const orgs = input.researchOrgAllowlist;
    const vehicles = input.researchVehicleAllowlist;
    const rows = await this.prisma.$queryRaw<Array<{ outbox_id: string }>>`
      WITH active_primary AS (
        SELECT DISTINCT ON (organization_id, trip_id)
          id, organization_id, trip_id, vehicle_id
        FROM di_v0_s4_work_items
        WHERE run_purpose = 'PRIMARY'
          AND purpose_discriminator = 'PRIMARY'
          AND status <> 'SUPERSEDED'
        ORDER BY organization_id, trip_id, boundary_occurrence DESC, created_at DESC
      ),
      candidates AS (
        SELECT
          wi.id AS work_item_id,
          wi.organization_id,
          wi.trip_id,
          wi.vehicle_id,
          wi.pinned_snapshot_hash,
          coalesce(wi.combined_input_identity, '') AS combined_input_identity,
          'DI_V0_S4_RESEARCH_INTENT_V1:sha256:' || encode(
            digest(
              convert_to(
                json_build_object(
                  'b', ${DI_V0_S4_RESEARCH_BUNDLE_VERSION_V2},
                  'c', coalesce(wi.combined_input_identity, ''),
                  'g', ${S4_RESEARCH_GEOMETRY_PROJECTION_ID},
                  'o', ${input.osmDataVersion},
                  'p', wi.pinned_snapshot_hash
                )::text,
                'UTF8'
              ),
              'sha256'
            ),
            'hex'
          ) AS research_intent_key
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
      INSERT INTO di_v0_s4_research_outbox_v1 (
        outbox_id, work_item_id, research_intent_key, organization_id, trip_id, vehicle_id,
        research_bundle_version, status, next_attempt_at
      )
      SELECT
        gen_random_uuid()::text,
        c.work_item_id,
        c.research_intent_key,
        c.organization_id,
        c.trip_id,
        c.vehicle_id,
        ${DI_V0_S4_RESEARCH_BUNDLE_VERSION_V2},
        'PENDING',
        ${input.now}
      FROM candidates c
      WHERE NOT EXISTS (
        SELECT 1 FROM di_v0_s4_research_runs_v1 r
        WHERE r.work_item_id = c.work_item_id
          AND r.research_intent_key = c.research_intent_key
          AND r.research_status IN ('SUCCEEDED', 'SNAPSHOT_INVALID')
      )
      AND NOT EXISTS (
        SELECT 1 FROM di_v0_s4_research_outbox_v1 o
        WHERE o.work_item_id = c.work_item_id
          AND o.research_intent_key = c.research_intent_key
          AND o.status IN ('PENDING', 'PROCESSING', 'FAILED_RETRYABLE')
      )
      ORDER BY c.work_item_id
      LIMIT ${input.limit}
      ON CONFLICT (work_item_id, research_intent_key) DO NOTHING
      RETURNING outbox_id`;
    return rows.length;
  }

  async claimBatch(limit: number, now: Date): Promise<DiV0S4ResearchOutboxRow[]> {
    const claimExpiresAt = new Date(now.getTime() + DI_V0_S4_RESEARCH_OUTBOX_TUNING.claimLeaseMs);
    return this.prisma.$transaction(async (tx) => {
      const claimed = await tx.$queryRaw<
        Array<{
          outbox_id: string;
          work_item_id: string;
          research_intent_key: string;
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
          SELECT outbox_id
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
        WHERE o.outbox_id = picked.outbox_id
        RETURNING o.outbox_id, o.work_item_id, o.research_intent_key, o.organization_id, o.trip_id, o.vehicle_id,
          o.research_bundle_version, o.status, o.attempt_count, o.next_attempt_at, o.last_error_code, o.claim_token`;
      return claimed.map((r) => ({
        outboxId: r.outbox_id,
        workItemId: r.work_item_id,
        researchIntentKey: r.research_intent_key,
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

  async renewClaimLease(outboxId: string, claimToken: string, now: Date): Promise<boolean> {
    const claimExpiresAt = new Date(now.getTime() + DI_V0_S4_RESEARCH_OUTBOX_TUNING.claimLeaseMs);
    const rows = await this.prisma.$queryRaw<Array<{ outbox_id: string }>>`
      UPDATE di_v0_s4_research_outbox_v1
      SET claim_expires_at = ${claimExpiresAt}, updated_at = clock_timestamp()
      WHERE outbox_id = ${outboxId} AND claim_token = ${claimToken} AND status = 'PROCESSING'
      RETURNING outbox_id`;
    return rows.length > 0;
  }

  async markSucceeded(outboxId: string, claimToken: string): Promise<boolean> {
    const n = await this.prisma.$executeRaw`
      UPDATE di_v0_s4_research_outbox_v1
      SET status = 'SUCCEEDED', claim_token = NULL, claim_expires_at = NULL, updated_at = clock_timestamp()
      WHERE outbox_id = ${outboxId} AND claim_token = ${claimToken} AND status = 'PROCESSING'`;
    return Number(n) === 1;
  }

  async markFailedRetryable(
    outboxId: string,
    claimToken: string,
    code: string,
    nextAttemptAt: Date,
  ): Promise<boolean> {
    const n = await this.prisma.$executeRaw`
      UPDATE di_v0_s4_research_outbox_v1
      SET status = 'FAILED_RETRYABLE',
        last_error_code = ${code},
        last_error_at = clock_timestamp(),
        next_attempt_at = ${nextAttemptAt},
        claim_token = NULL,
        claim_expires_at = NULL,
        updated_at = clock_timestamp()
      WHERE outbox_id = ${outboxId} AND claim_token = ${claimToken} AND status = 'PROCESSING'`;
    return Number(n) === 1;
  }

  async markNeutralComplete(outboxId: string, claimToken: string): Promise<boolean> {
    const n = await this.prisma.$executeRaw`
      UPDATE di_v0_s4_research_outbox_v1
      SET status = 'SUCCEEDED',
        last_error_code = NULL,
        claim_token = NULL,
        claim_expires_at = NULL,
        updated_at = clock_timestamp()
      WHERE outbox_id = ${outboxId} AND claim_token = ${claimToken} AND status = 'PROCESSING'`;
    return Number(n) === 1;
  }

  /** Allows re-discovery after non-terminal neutral runs (e.g. ROAD_CONTEXT_UNAVAILABLE). */
  async releaseAfterNeutral(outboxId: string, claimToken: string): Promise<boolean> {
    const n = await this.prisma.$executeRaw`
      DELETE FROM di_v0_s4_research_outbox_v1
      WHERE outbox_id = ${outboxId} AND claim_token = ${claimToken} AND status = 'PROCESSING'`;
    return Number(n) === 1;
  }

  async markSkipped(outboxId: string, claimToken: string, code: string): Promise<boolean> {
    const n = await this.prisma.$executeRaw`
      UPDATE di_v0_s4_research_outbox_v1
      SET status = 'SKIPPED_INELIGIBLE',
        last_error_code = ${code},
        last_error_at = clock_timestamp(),
        claim_token = NULL,
        claim_expires_at = NULL,
        updated_at = clock_timestamp()
      WHERE outbox_id = ${outboxId} AND claim_token = ${claimToken} AND status = 'PROCESSING'`;
    return Number(n) === 1;
  }
}
