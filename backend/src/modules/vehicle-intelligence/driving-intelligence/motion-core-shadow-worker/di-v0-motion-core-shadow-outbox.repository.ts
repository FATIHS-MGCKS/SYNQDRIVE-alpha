import type { PrismaClient } from '@prisma/client';
import type { DiV0MotionCoreShadowControlPlaneConfig } from './di-v0-motion-core-shadow-control-plane';
import {
  DI_V0_DS4_FLEET_MOTION_ADMISSION_POLICY_DEFAULT_OFF,
  isDiV0S4LegacyAllowlistAdmissionRequired,
  type DiV0Ds4FleetMotionAdmissionPolicySnapshotV1,
} from '../fleet-motion-admission/di-v0-ds4-fleet-motion-admission-policy.v1';
import {
  isC5_1PreferredSpeedEffective,
  resolveC5_1VehicleAdmissionFromLabels,
} from './di-v0-motion-core-c5-1-admission';
import { isFsmGapBridgeV1Effective } from './di-v0-motion-core-fsm-gap-bridge-v1-admission';
import { resolveMotionCoreShadowBundleVersion } from './di-v0-motion-core-shadow.bundle.version';
import { buildMotionCoreShadowIntentKey } from './di-v0-motion-core-shadow-intent';
import { DI_V0_MOTION_CORE_SHADOW_TUNING } from './di-v0-motion-core-shadow.config';

export type DiV0MotionCoreShadowOutboxStatus =
  | 'PENDING'
  | 'PROCESSING'
  | 'SUCCEEDED'
  | 'FAILED_RETRYABLE'
  | 'SKIPPED_INELIGIBLE';

export interface DiV0MotionCoreShadowOutboxRow {
  outboxId: string;
  workItemId: string;
  shadowIntentKey: string;
  organizationId: string;
  tripId: string;
  vehicleId: string;
  status: DiV0MotionCoreShadowOutboxStatus;
  attemptCount: number;
  nextAttemptAt: Date;
  lastErrorCode: string | null;
  claimToken: string;
}

type DiV0MotionCoreShadowDiscoveryCandidate = {
  work_item_id: string;
  organization_id: string;
  trip_id: string;
  vehicle_id: string;
  pinned_snapshot_hash: string;
  combined_input_identity: string;
  completed_at: Date;
  vehicle_make: string | null;
  vehicle_model: string | null;
};

export class DiV0MotionCoreShadowOutboxRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async discoverEligible(input: {
    enabledSince: Date;
    organizationAllowlist: readonly string[];
    vehicleAllowlist: readonly string[];
    controlPlane: DiV0MotionCoreShadowControlPlaneConfig;
    fleetMotionPolicy?: DiV0Ds4FleetMotionAdmissionPolicySnapshotV1;
    limit: number;
    now: Date;
  }): Promise<number> {
    const fleetMotionPolicy = input.fleetMotionPolicy ?? DI_V0_DS4_FLEET_MOTION_ADMISSION_POLICY_DEFAULT_OFF;
    const legacyAllowlist = isDiV0S4LegacyAllowlistAdmissionRequired(fleetMotionPolicy);
    if (legacyAllowlist && (input.organizationAllowlist.length === 0 || input.vehicleAllowlist.length === 0)) {
      return 0;
    }
    if (input.limit <= 0) return 0;

    const insertBudget = input.limit;
    const pageSize = DI_V0_MOTION_CORE_SHADOW_TUNING.discoveryCandidatePageSize;
    let inserted = 0;
    let cursor: { completedAt: Date; workItemId: string } | null = null;

    while (inserted < insertBudget) {
      const page = await this.fetchDiscoveryCandidatePage({
        enabledSince: input.enabledSince,
        organizationAllowlist: input.organizationAllowlist,
        vehicleAllowlist: input.vehicleAllowlist,
        fleetMotionPolicy,
        pageSize,
        cursor,
      });
      if (page.length === 0) break;

      for (const candidate of page) {
        if (inserted >= insertBudget) break;
        const didInsert = await this.tryInsertDiscoveryCandidate(candidate, input);
        if (didInsert) inserted += 1;
      }

      const last = page[page.length - 1]!;
      cursor = { completedAt: last.completed_at, workItemId: last.work_item_id };
      if (page.length < pageSize) break;
    }

    return inserted;
  }

  private async fetchDiscoveryCandidatePage(input: {
    enabledSince: Date;
    organizationAllowlist: readonly string[];
    vehicleAllowlist: readonly string[];
    fleetMotionPolicy?: DiV0Ds4FleetMotionAdmissionPolicySnapshotV1;
    pageSize: number;
    cursor: { completedAt: Date; workItemId: string } | null;
  }): Promise<DiV0MotionCoreShadowDiscoveryCandidate[]> {
    const legacyAllowlist = isDiV0S4LegacyAllowlistAdmissionRequired(
      input.fleetMotionPolicy ?? DI_V0_DS4_FLEET_MOTION_ADMISSION_POLICY_DEFAULT_OFF,
    );
    const orgs = input.organizationAllowlist;
    const vehicles = input.vehicleAllowlist;
    const cursor = input.cursor;

    if (!cursor) {
      return legacyAllowlist
        ? this.prisma.$queryRaw<DiV0MotionCoreShadowDiscoveryCandidate[]>`
        WITH active_primary AS (
          SELECT DISTINCT ON (organization_id, trip_id)
            id, organization_id, trip_id
          FROM di_v0_s4_work_items
          WHERE run_purpose = 'PRIMARY'
            AND purpose_discriminator = 'PRIMARY'
            AND status <> 'SUPERSEDED'
          ORDER BY organization_id, trip_id, boundary_occurrence DESC, created_at DESC
        )
        SELECT
          wi.id AS work_item_id,
          wi.organization_id,
          wi.trip_id,
          wi.vehicle_id,
          wi.pinned_snapshot_hash,
          coalesce(wi.combined_input_identity, '') AS combined_input_identity,
          wi.completed_at,
          v.make AS vehicle_make,
          v.model AS vehicle_model
        FROM di_v0_s4_work_items wi
        INNER JOIN vehicles v ON v.id = wi.vehicle_id AND v.organization_id = wi.organization_id
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
        ORDER BY wi.completed_at ASC, wi.id ASC
        LIMIT ${input.pageSize}`
        : this.prisma.$queryRaw<DiV0MotionCoreShadowDiscoveryCandidate[]>`
        WITH active_primary AS (
          SELECT DISTINCT ON (organization_id, trip_id)
            id, organization_id, trip_id
          FROM di_v0_s4_work_items
          WHERE run_purpose = 'PRIMARY'
            AND purpose_discriminator = 'PRIMARY'
            AND status <> 'SUPERSEDED'
          ORDER BY organization_id, trip_id, boundary_occurrence DESC, created_at DESC
        )
        SELECT
          wi.id AS work_item_id,
          wi.organization_id,
          wi.trip_id,
          wi.vehicle_id,
          wi.pinned_snapshot_hash,
          coalesce(wi.combined_input_identity, '') AS combined_input_identity,
          wi.completed_at,
          v.make AS vehicle_make,
          v.model AS vehicle_model
        FROM di_v0_s4_work_items wi
        INNER JOIN vehicles v ON v.id = wi.vehicle_id AND v.organization_id = wi.organization_id
        INNER JOIN active_primary ap
          ON ap.id = wi.id AND ap.organization_id = wi.organization_id AND ap.trip_id = wi.trip_id
        WHERE wi.status = 'COMPLETED'
          AND wi.run_purpose = 'PRIMARY'
          AND wi.purpose_discriminator = 'PRIMARY'
          AND wi.pinned_snapshot_hash IS NOT NULL
          AND wi.shadow_run_id IS NOT NULL
          AND wi.completed_at IS NOT NULL
          AND wi.completed_at >= ${input.enabledSince}
        ORDER BY wi.completed_at ASC, wi.id ASC
        LIMIT ${input.pageSize}`;
    }

    return legacyAllowlist
      ? this.prisma.$queryRaw<DiV0MotionCoreShadowDiscoveryCandidate[]>`
      WITH active_primary AS (
        SELECT DISTINCT ON (organization_id, trip_id)
          id, organization_id, trip_id
        FROM di_v0_s4_work_items
        WHERE run_purpose = 'PRIMARY'
          AND purpose_discriminator = 'PRIMARY'
          AND status <> 'SUPERSEDED'
        ORDER BY organization_id, trip_id, boundary_occurrence DESC, created_at DESC
      )
      SELECT
        wi.id AS work_item_id,
        wi.organization_id,
        wi.trip_id,
        wi.vehicle_id,
        wi.pinned_snapshot_hash,
        coalesce(wi.combined_input_identity, '') AS combined_input_identity,
        wi.completed_at,
        v.make AS vehicle_make,
        v.model AS vehicle_model
      FROM di_v0_s4_work_items wi
      INNER JOIN vehicles v ON v.id = wi.vehicle_id AND v.organization_id = wi.organization_id
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
        AND (wi.completed_at, wi.id) > (${cursor.completedAt}, ${cursor.workItemId})
      ORDER BY wi.completed_at ASC, wi.id ASC
      LIMIT ${input.pageSize}`
      : this.prisma.$queryRaw<DiV0MotionCoreShadowDiscoveryCandidate[]>`
      WITH active_primary AS (
        SELECT DISTINCT ON (organization_id, trip_id)
          id, organization_id, trip_id
        FROM di_v0_s4_work_items
        WHERE run_purpose = 'PRIMARY'
          AND purpose_discriminator = 'PRIMARY'
          AND status <> 'SUPERSEDED'
        ORDER BY organization_id, trip_id, boundary_occurrence DESC, created_at DESC
      )
      SELECT
        wi.id AS work_item_id,
        wi.organization_id,
        wi.trip_id,
        wi.vehicle_id,
        wi.pinned_snapshot_hash,
        coalesce(wi.combined_input_identity, '') AS combined_input_identity,
        wi.completed_at,
        v.make AS vehicle_make,
        v.model AS vehicle_model
      FROM di_v0_s4_work_items wi
      INNER JOIN vehicles v ON v.id = wi.vehicle_id AND v.organization_id = wi.organization_id
      INNER JOIN active_primary ap
        ON ap.id = wi.id AND ap.organization_id = wi.organization_id AND ap.trip_id = wi.trip_id
      WHERE wi.status = 'COMPLETED'
        AND wi.run_purpose = 'PRIMARY'
        AND wi.purpose_discriminator = 'PRIMARY'
        AND wi.pinned_snapshot_hash IS NOT NULL
        AND wi.shadow_run_id IS NOT NULL
        AND wi.completed_at IS NOT NULL
        AND wi.completed_at >= ${input.enabledSince}
        AND (wi.completed_at, wi.id) > (${cursor.completedAt}, ${cursor.workItemId})
      ORDER BY wi.completed_at ASC, wi.id ASC
      LIMIT ${input.pageSize}`;
  }

  private async tryInsertDiscoveryCandidate(
    c: DiV0MotionCoreShadowDiscoveryCandidate,
    input: {
      controlPlane: DiV0MotionCoreShadowControlPlaneConfig;
      now: Date;
    },
  ): Promise<boolean> {
    const vehicleAdmission = resolveC5_1VehicleAdmissionFromLabels(c.vehicle_make, c.vehicle_model);
    const c5_1Effective = isC5_1PreferredSpeedEffective(input.controlPlane, {
      vehicleAdmission,
      workItemCompletedAt: c.completed_at,
    });
    const fsmGapBridgeV1Effective = isFsmGapBridgeV1Effective(input.controlPlane, {
      workItemCompletedAt: c.completed_at,
    });
    const shadowBundleVersion = resolveMotionCoreShadowBundleVersion({
      c5_1PreferredSpeedEnabled: c5_1Effective,
      fsmGapBridgeV1Enabled: fsmGapBridgeV1Effective,
    });
    const shadowIntentKey = buildMotionCoreShadowIntentKey({
      pinnedSnapshotHash: c.pinned_snapshot_hash,
      combinedInputIdentity: c.combined_input_identity,
      bundleVersion: shadowBundleVersion,
    });

    const blockedRun = await this.prisma.$queryRaw<Array<{ one: number }>>`
      SELECT 1 AS one FROM di_v0_motion_core_shadow_runs_v1 r
      WHERE r.work_item_id = ${c.work_item_id}
        AND r.shadow_intent_key = ${shadowIntentKey}
        AND r.shadow_status = 'SUCCEEDED'
      LIMIT 1`;
    if (blockedRun.length > 0) return false;

    const existingOutbox = await this.prisma.$queryRaw<Array<{ one: number }>>`
      SELECT 1 AS one FROM di_v0_motion_core_shadow_outbox_v1 o
      WHERE o.work_item_id = ${c.work_item_id}
        AND o.shadow_intent_key = ${shadowIntentKey}
      LIMIT 1`;
    if (existingOutbox.length > 0) return false;

    const rows = await this.prisma.$queryRaw<Array<{ outbox_id: string }>>`
      INSERT INTO di_v0_motion_core_shadow_outbox_v1 (
        work_item_id, shadow_intent_key, organization_id, trip_id, vehicle_id,
        shadow_bundle_version, status, next_attempt_at
      ) VALUES (
        ${c.work_item_id}, ${shadowIntentKey}, ${c.organization_id}, ${c.trip_id}, ${c.vehicle_id},
        ${shadowBundleVersion}, 'PENDING', ${input.now}
      )
      ON CONFLICT (work_item_id, shadow_intent_key) DO NOTHING
      RETURNING outbox_id`;
    return rows.length > 0;
  }

  async claimBatch(limit: number, now: Date): Promise<DiV0MotionCoreShadowOutboxRow[]> {
    const claimExpiresAt = new Date(now.getTime() + DI_V0_MOTION_CORE_SHADOW_TUNING.claimLeaseMs);
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
          FROM di_v0_motion_core_shadow_outbox_v1
          WHERE status IN ('PENDING', 'FAILED_RETRYABLE')
            AND next_attempt_at <= ${now}
          ORDER BY next_attempt_at ASC, created_at ASC
          LIMIT ${limit}
          FOR UPDATE SKIP LOCKED
        )
        UPDATE di_v0_motion_core_shadow_outbox_v1 o
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
        status: r.status as DiV0MotionCoreShadowOutboxStatus,
        attemptCount: r.attempt_count,
        nextAttemptAt: r.next_attempt_at,
        lastErrorCode: r.last_error_code,
        claimToken: r.claim_token,
      }));
    });
  }

  async renewClaimLease(outboxId: string, claimToken: string, now: Date): Promise<boolean> {
    const claimExpiresAt = new Date(now.getTime() + DI_V0_MOTION_CORE_SHADOW_TUNING.claimLeaseMs);
    const rows = await this.prisma.$queryRaw<Array<{ outbox_id: string }>>`
      UPDATE di_v0_motion_core_shadow_outbox_v1
      SET claim_expires_at = ${claimExpiresAt}, updated_at = ${now}
      WHERE outbox_id = ${outboxId}
        AND claim_token = ${claimToken}
        AND status = 'PROCESSING'
      RETURNING outbox_id`;
    return rows.length > 0;
  }

  async markSucceeded(outboxId: string, claimToken: string): Promise<boolean> {
    const rows = await this.prisma.$queryRaw<Array<{ outbox_id: string }>>`
      UPDATE di_v0_motion_core_shadow_outbox_v1
      SET status = 'SUCCEEDED', claim_token = NULL, claim_expires_at = NULL, last_error_code = NULL, updated_at = now()
      WHERE outbox_id = ${outboxId} AND claim_token = ${claimToken} AND status = 'PROCESSING'
      RETURNING outbox_id`;
    return rows.length > 0;
  }

  async markSkipped(outboxId: string, claimToken: string, code: string): Promise<boolean> {
    const rows = await this.prisma.$queryRaw<Array<{ outbox_id: string }>>`
      UPDATE di_v0_motion_core_shadow_outbox_v1
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
      UPDATE di_v0_motion_core_shadow_outbox_v1
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
