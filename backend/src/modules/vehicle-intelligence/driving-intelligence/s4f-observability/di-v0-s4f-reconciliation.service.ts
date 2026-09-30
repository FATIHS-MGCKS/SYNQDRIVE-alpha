import type { PrismaClient } from '@prisma/client';
import { DI_V0_S4A_CONTRACT_VERSION, DI_V0_S4_LIMITS, DI_V0_S4_STATES } from '../s4a-foundation/di-v0-s4a-contract';
import type { DiV0S4ExecutorRegistry } from '../s4b-orchestration/di-v0-s4b-executor.port';
import {
  reconcileDiV0S4BeyondDriftHorizonBatch,
  type DiV0S4fBeyondHorizonCursor,
} from './di-v0-s4f-beyond-horizon';
import { DI_V0_S4F_TUNING } from './di-v0-s4f-config';
import { evaluateDiV0S4fExecutorLiveness } from './di-v0-s4f-executor-liveness';
import {
  DI_V0_S4_OBSERVABILITY_SNAPSHOT_V1,
  type DiV0S4fObservabilitySnapshotV1,
  type DiV0S4fWorkLifecycleCounts,
} from './di-v0-s4f-observability-contract';

const TERMINAL_STATES = new Set(['COMPLETED', 'FAILED_TERMINAL', 'SKIPPED_INELIGIBLE', 'SUPERSEDED']);

function emptyWorkCounts(): DiV0S4fWorkLifecycleCounts {
  return {
    PENDING: 0,
    LEASED: 0,
    FAILED_RETRYABLE: 0,
    FAILED_TERMINAL: 0,
    SUPERSEDED: 0,
    COMPLETED: 0,
    SKIPPED_INELIGIBLE: 0,
  };
}

export interface DiV0S4fReconciliationOptions {
  organizationId?: string;
  workBatchLimit?: number;
  beyondHorizonBatchLimit?: number;
  beyondHorizonCursor?: DiV0S4fBeyondHorizonCursor;
  executorRegistry?: DiV0S4ExecutorRegistry | null;
}

/** Read-only bounded reconciliation — no mutations, no provider calls. */
export class DiV0S4fReconciliationService {
  constructor(private readonly prisma: PrismaClient) {}

  async buildObservabilitySnapshot(options: DiV0S4fReconciliationOptions = {}): Promise<DiV0S4fObservabilitySnapshotV1> {
    const orgFilter = options.organizationId;
    const workLimit = Math.min(
      options.workBatchLimit ?? DI_V0_S4F_TUNING.defaultWorkBatchLimit,
      DI_V0_S4F_TUNING.maxWorkBatchLimit,
    );
    const beyondLimit = Math.min(
      options.beyondHorizonBatchLimit ?? DI_V0_S4F_TUNING.defaultBeyondHorizonBatchLimit,
      DI_V0_S4F_TUNING.maxBeyondHorizonBatchLimit,
    );
    const beyondCursor: DiV0S4fBeyondHorizonCursor = options.beyondHorizonCursor ?? {
      settlementAnchorAt: null,
      workItemId: null,
    };

    const [workLifecycle, leaseHealth, pipelineHealth, evidenceStorage, controlReadable, beyondBatch, activePipelines] =
      await Promise.all([
        this.loadWorkLifecycleCounts(orgFilter),
        this.loadLeaseHealth(orgFilter),
        this.loadPipelineHealth(orgFilter),
        this.loadEvidenceStorage(orgFilter),
        this.isControlPlaneReadable(),
        reconcileDiV0S4BeyondDriftHorizonBatch(this.prisma, beyondLimit, beyondCursor, orgFilter),
        this.countActivePipelines(),
      ]);

    const executorLiveness = evaluateDiV0S4fExecutorLiveness(
      activePipelines,
      options.executorRegistry ?? null,
    );

    const anomalySamples: DiV0S4fObservabilitySnapshotV1['anomalySamples'] = {};
    if (pipelineHealth.retiredPendingPrimaryCount > 0) {
      anomalySamples.RETIRED_PENDING_PRIMARY = await this.sampleRetiredPendingPrimary(orgFilter, workLimit);
    }
    if (leaseHealth.expiredLeasedCount > 0) {
      anomalySamples.EXPIRED_LEASE = await this.sampleExpiredLeases(orgFilter, workLimit);
    }
    if (!controlReadable) {
      anomalySamples.CONTROL_PLANE_UNREADABLE = ['di_v0_s4_control'];
    }
    if (beyondBatch.mismatchCount > 0) {
      anomalySamples.BOUNDARY_MISMATCH_BEYOND_HORIZON = beyondBatch.mismatchWorkItemIds;
    }
    if (activePipelines > 0 && !executorLiveness.localExecutorReady) {
      anomalySamples.ACTIVE_PIPELINE_EXECUTOR_UNAVAILABLE = ['LOCAL_REPLICA_REGISTRY_ONLY'];
    }

    const observedAtRows = await this.prisma.$queryRaw<Array<{ ts: Date }>>`SELECT clock_timestamp() AS ts`;
    const observedAt = (observedAtRows[0]?.ts ?? new Date()).toISOString();

    return {
      contractVersion: DI_V0_S4_OBSERVABILITY_SNAPSHOT_V1,
      s4aContractVersion: DI_V0_S4A_CONTRACT_VERSION,
      observedAt,
      timeAuthority: 'DB_CLOCK_TIMESTAMP',
      organizationScope: orgFilter ? 'SINGLE' : 'ALL',
      organizationId: orgFilter,
      reconciliation: {
        readOnly: true,
        bounded: true,
        cursorAuthority: 'SETTLEMENT_ANCHOR_AT_THEN_WORK_ITEM_ID',
        partial: beyondBatch.scannedCount >= beyondLimit,
      },
      operational: {
        workLifecycle,
        leaseHealth,
        pipelineHealth,
        evidenceStorage,
        beyondHorizon: {
          beyondDriftHorizonBoundaryMismatchCount: beyondBatch.mismatchCount,
          beyondHorizonScannedCount: beyondBatch.scannedCount,
          cursor: {
            settlementAnchorAt: beyondBatch.nextCursor.settlementAnchorAt?.toISOString() ?? null,
            workItemId: beyondBatch.nextCursor.workItemId,
          },
        },
        executorLiveness,
      },
      anomalySamples,
    };
  }

  private async loadWorkLifecycleCounts(organizationId?: string): Promise<DiV0S4fWorkLifecycleCounts> {
    const counts = emptyWorkCounts();
    const rows = organizationId
      ? await this.prisma.$queryRaw<Array<{ status: string; n: bigint }>>`
          SELECT status::text AS status, count(*)::bigint AS n
          FROM di_v0_s4_work_items
          WHERE organization_id = ${organizationId}
          GROUP BY status`
      : await this.prisma.$queryRaw<Array<{ status: string; n: bigint }>>`
          SELECT status::text AS status, count(*)::bigint AS n
          FROM di_v0_s4_work_items
          GROUP BY status`;
    for (const row of rows) {
      const key = row.status as keyof DiV0S4fWorkLifecycleCounts;
      if (key in counts) counts[key] = Number(row.n);
    }
    for (const s of DI_V0_S4_STATES) {
      if (!(s in counts)) continue;
    }
    return counts;
  }

  private async loadLeaseHealth(organizationId?: string) {
    const maxAttempts = DI_V0_S4_LIMITS.maxAttempts;
    const base = organizationId
      ? await this.prisma.$queryRaw<
          Array<{
            expired_leased: bigint;
            active_leased: bigint;
            retryable_due: bigint;
            retryable_future: bigint;
            attempts_exhausted: bigint;
            oldest_pending: Date | null;
            oldest_retry_due: Date | null;
          }>
        >`
          SELECT
            count(*) FILTER (WHERE status = 'LEASED' AND lease_expires_at < clock_timestamp())::bigint AS expired_leased,
            count(*) FILTER (WHERE status = 'LEASED' AND lease_expires_at >= clock_timestamp())::bigint AS active_leased,
            count(*) FILTER (WHERE status = 'FAILED_RETRYABLE' AND next_attempt_at <= clock_timestamp())::bigint AS retryable_due,
            count(*) FILTER (WHERE status = 'FAILED_RETRYABLE' AND next_attempt_at > clock_timestamp())::bigint AS retryable_future,
            count(*) FILTER (WHERE status = 'FAILED_RETRYABLE' AND attempt_count >= ${maxAttempts})::bigint AS attempts_exhausted,
            min(eligible_at) FILTER (WHERE status = 'PENDING') AS oldest_pending,
            min(next_attempt_at) FILTER (WHERE status = 'FAILED_RETRYABLE' AND next_attempt_at <= clock_timestamp()) AS oldest_retry_due
          FROM di_v0_s4_work_items
          WHERE organization_id = ${organizationId}`
      : await this.prisma.$queryRaw<
          Array<{
            expired_leased: bigint;
            active_leased: bigint;
            retryable_due: bigint;
            retryable_future: bigint;
            attempts_exhausted: bigint;
            oldest_pending: Date | null;
            oldest_retry_due: Date | null;
          }>
        >`
          SELECT
            count(*) FILTER (WHERE status = 'LEASED' AND lease_expires_at < clock_timestamp())::bigint AS expired_leased,
            count(*) FILTER (WHERE status = 'LEASED' AND lease_expires_at >= clock_timestamp())::bigint AS active_leased,
            count(*) FILTER (WHERE status = 'FAILED_RETRYABLE' AND next_attempt_at <= clock_timestamp())::bigint AS retryable_due,
            count(*) FILTER (WHERE status = 'FAILED_RETRYABLE' AND next_attempt_at > clock_timestamp())::bigint AS retryable_future,
            count(*) FILTER (WHERE status = 'FAILED_RETRYABLE' AND attempt_count >= ${maxAttempts})::bigint AS attempts_exhausted,
            min(eligible_at) FILTER (WHERE status = 'PENDING') AS oldest_pending,
            min(next_attempt_at) FILTER (WHERE status = 'FAILED_RETRYABLE' AND next_attempt_at <= clock_timestamp()) AS oldest_retry_due
          FROM di_v0_s4_work_items`;

    const row = base[0];
    const nowRows = await this.prisma.$queryRaw<Array<{ ts: Date }>>`SELECT clock_timestamp() AS ts`;
    const now = nowRows[0]?.ts?.getTime() ?? Date.now();

    const oldestPendingAgeSeconds = row?.oldest_pending
      ? Math.max(0, Math.floor((now - row.oldest_pending.getTime()) / 1000))
      : null;
    const oldestRetryableDueAgeSeconds = row?.oldest_retry_due
      ? Math.max(0, Math.floor((now - row.oldest_retry_due.getTime()) / 1000))
      : null;

    return {
      expiredLeasedCount: Number(row?.expired_leased ?? 0),
      activeLeasedCount: Number(row?.active_leased ?? 0),
      retryableDueCount: Number(row?.retryable_due ?? 0),
      retryableFutureCount: Number(row?.retryable_future ?? 0),
      attemptsExhaustedCount: Number(row?.attempts_exhausted ?? 0),
      oldestPendingAgeSeconds,
      oldestRetryableDueAgeSeconds,
    };
  }

  private async loadPipelineHealth(organizationId?: string) {
    const registryRows = await this.prisma.$queryRaw<Array<{ status: string; n: bigint }>>`
      SELECT status::text AS status, count(*)::bigint AS n FROM di_v0_s4_pipeline_versions GROUP BY status`;
    let activeRegistryCount = 0;
    let retiredRegistryCount = 0;
    for (const r of registryRows) {
      if (r.status === 'ACTIVE') activeRegistryCount = Number(r.n);
      if (r.status === 'RETIRED') retiredRegistryCount = Number(r.n);
    }

    const retiredWork = organizationId
      ? await this.prisma.$queryRaw<
          Array<{ retired_pending_primary: bigint; retired_nonterminal: bigint; retired_legacy: bigint }>
        >`
          SELECT
            count(*) FILTER (
              WHERE pv.status = 'RETIRED' AND wi.status = 'PENDING' AND wi.run_purpose = 'PRIMARY'
            )::bigint AS retired_pending_primary,
            count(*) FILTER (
              WHERE pv.status = 'RETIRED' AND wi.status NOT IN ('COMPLETED','FAILED_TERMINAL','SKIPPED_INELIGIBLE','SUPERSEDED')
            )::bigint AS retired_nonterminal,
            count(*) FILTER (
              WHERE pv.status = 'RETIRED' AND wi.status NOT IN ('COMPLETED','FAILED_TERMINAL','SKIPPED_INELIGIBLE','SUPERSEDED')
                AND wi.status = 'LEASED' AND wi.lease_expires_at >= clock_timestamp()
            )::bigint AS retired_legacy
          FROM di_v0_s4_work_items wi
          JOIN di_v0_s4_pipeline_versions pv ON pv.pipeline_version_key = wi.pipeline_version_key
          WHERE wi.organization_id = ${organizationId}`
      : await this.prisma.$queryRaw<
          Array<{ retired_pending_primary: bigint; retired_nonterminal: bigint; retired_legacy: bigint }>
        >`
          SELECT
            count(*) FILTER (
              WHERE pv.status = 'RETIRED' AND wi.status = 'PENDING' AND wi.run_purpose = 'PRIMARY'
            )::bigint AS retired_pending_primary,
            count(*) FILTER (
              WHERE pv.status = 'RETIRED' AND wi.status NOT IN ('COMPLETED','FAILED_TERMINAL','SKIPPED_INELIGIBLE','SUPERSEDED')
            )::bigint AS retired_nonterminal,
            count(*) FILTER (
              WHERE pv.status = 'RETIRED' AND wi.status NOT IN ('COMPLETED','FAILED_TERMINAL','SKIPPED_INELIGIBLE','SUPERSEDED')
                AND wi.status = 'LEASED' AND wi.lease_expires_at >= clock_timestamp()
            )::bigint AS retired_legacy
          FROM di_v0_s4_work_items wi
          JOIN di_v0_s4_pipeline_versions pv ON pv.pipeline_version_key = wi.pipeline_version_key`;

    const w = retiredWork[0];
    const retiredNonterminal = Number(w?.retired_nonterminal ?? 0);
    const retiredLegacy = Number(w?.retired_legacy ?? 0);

    return {
      activeRegistryCount,
      retiredRegistryCount,
      retiredNonterminalWorkCount: retiredNonterminal,
      retiredPendingPrimaryCount: Number(w?.retired_pending_primary ?? 0),
      retiredNonterminalLegacyCount: retiredLegacy,
    };
  }

  private async loadEvidenceStorage(organizationId?: string) {
    const snap = organizationId
      ? await this.prisma.$queryRaw<
          Array<{
            n: bigint;
            compressed: bigint | null;
            uncompressed: bigint | null;
            retention_due: bigint;
            oldest_created: Date | null;
          }>
        >`
          SELECT count(*)::bigint AS n,
            coalesce(sum(payload_bytes), 0)::bigint AS compressed,
            coalesce(sum(uncompressed_bytes), 0)::bigint AS uncompressed,
            count(*) FILTER (WHERE retention_until <= clock_timestamp())::bigint AS retention_due,
            min(created_at) AS oldest_created
          FROM di_v0_s4_evidence_snapshots
          WHERE organization_id = ${organizationId}`
      : await this.prisma.$queryRaw<
          Array<{
            n: bigint;
            compressed: bigint | null;
            uncompressed: bigint | null;
            retention_due: bigint;
            oldest_created: Date | null;
          }>
        >`
          SELECT count(*)::bigint AS n,
            coalesce(sum(payload_bytes), 0)::bigint AS compressed,
            coalesce(sum(uncompressed_bytes), 0)::bigint AS uncompressed,
            count(*) FILTER (WHERE retention_until <= clock_timestamp())::bigint AS retention_due,
            min(created_at) AS oldest_created
          FROM di_v0_s4_evidence_snapshots`;

    const pin = organizationId
      ? await this.prisma.$queryRaw<Array<{ with_pin: bigint; completed_missing_pin: bigint }>>`
          SELECT
            count(*) FILTER (WHERE pinned_snapshot_hash IS NOT NULL)::bigint AS with_pin,
            count(*) FILTER (WHERE status = 'COMPLETED' AND pinned_snapshot_hash IS NULL)::bigint AS completed_missing_pin
          FROM di_v0_s4_work_items
          WHERE organization_id = ${organizationId}`
      : await this.prisma.$queryRaw<Array<{ with_pin: bigint; completed_missing_pin: bigint }>>`
          SELECT
            count(*) FILTER (WHERE pinned_snapshot_hash IS NOT NULL)::bigint AS with_pin,
            count(*) FILTER (WHERE status = 'COMPLETED' AND pinned_snapshot_hash IS NULL)::bigint AS completed_missing_pin
          FROM di_v0_s4_work_items`;

    const nowRows = await this.prisma.$queryRaw<Array<{ ts: Date }>>`SELECT clock_timestamp() AS ts`;
    const now = nowRows[0]?.ts?.getTime() ?? Date.now();
    const oldest = snap[0]?.oldest_created;
    const oldestSnapshotAgeSeconds = oldest ? Math.max(0, Math.floor((now - oldest.getTime()) / 1000)) : null;

    return {
      snapshotCount: Number(snap[0]?.n ?? 0),
      totalCompressedBytes: Number(snap[0]?.compressed ?? 0),
      totalUncompressedBytes: Number(snap[0]?.uncompressed ?? 0),
      retentionDueCount: Number(snap[0]?.retention_due ?? 0),
      oldestSnapshotAgeSeconds,
      workItemsWithPinCount: Number(pin[0]?.with_pin ?? 0),
      pinRequiredButMissingCount: Number(pin[0]?.completed_missing_pin ?? 0),
    };
  }

  private async isControlPlaneReadable(): Promise<boolean> {
    const rows = await this.prisma.$queryRaw<Array<{ n: bigint }>>`SELECT count(*)::bigint AS n FROM di_v0_s4_control`;
    return Number(rows[0]?.n ?? 0) >= 1;
  }

  private async countActivePipelines(): Promise<number> {
    const rows = await this.prisma.$queryRaw<Array<{ n: bigint }>>`
      SELECT count(*)::bigint AS n FROM di_v0_s4_pipeline_versions WHERE status = 'ACTIVE'`;
    return Number(rows[0]?.n ?? 0);
  }

  private async sampleRetiredPendingPrimary(organizationId?: string, limit = 20): Promise<string[]> {
    const rows = organizationId
      ? await this.prisma.$queryRaw<Array<{ id: string }>>`
          SELECT wi.id FROM di_v0_s4_work_items wi
          JOIN di_v0_s4_pipeline_versions pv ON pv.pipeline_version_key = wi.pipeline_version_key
          WHERE pv.status = 'RETIRED' AND wi.status = 'PENDING' AND wi.run_purpose = 'PRIMARY'
            AND wi.organization_id = ${organizationId}
          ORDER BY wi.id ASC LIMIT ${limit}`
      : await this.prisma.$queryRaw<Array<{ id: string }>>`
          SELECT wi.id FROM di_v0_s4_work_items wi
          JOIN di_v0_s4_pipeline_versions pv ON pv.pipeline_version_key = wi.pipeline_version_key
          WHERE pv.status = 'RETIRED' AND wi.status = 'PENDING' AND wi.run_purpose = 'PRIMARY'
          ORDER BY wi.id ASC LIMIT ${limit}`;
    return rows.map((r) => r.id);
  }

  private async sampleExpiredLeases(organizationId?: string, limit = 20): Promise<string[]> {
    const rows = organizationId
      ? await this.prisma.$queryRaw<Array<{ id: string }>>`
          SELECT id FROM di_v0_s4_work_items
          WHERE status = 'LEASED' AND lease_expires_at < clock_timestamp() AND organization_id = ${organizationId}
          ORDER BY id ASC LIMIT ${limit}`
      : await this.prisma.$queryRaw<Array<{ id: string }>>`
          SELECT id FROM di_v0_s4_work_items
          WHERE status = 'LEASED' AND lease_expires_at < clock_timestamp()
          ORDER BY id ASC LIMIT ${limit}`;
    return rows.map((r) => r.id);
  }

  /** Pagination proof helper: list work item ids in deterministic cursor order (read-only). */
  async listWorkItemIdsPage(
    limit: number,
    cursor: { settlementAnchorAt: Date | null; workItemId: string | null },
    organizationId?: string,
  ): Promise<string[]> {
    const anchor = cursor.settlementAnchorAt;
    const afterId = cursor.workItemId ?? '';
    const rows = organizationId
      ? await this.prisma.$queryRaw<Array<{ id: string }>>`
          SELECT id FROM di_v0_s4_work_items
          WHERE organization_id = ${organizationId}
            AND (
              ${anchor}::timestamptz IS NULL
              OR settlement_anchor_at > ${anchor}::timestamptz
              OR (settlement_anchor_at = ${anchor}::timestamptz AND id > ${afterId})
            )
          ORDER BY settlement_anchor_at ASC, id ASC
          LIMIT ${limit}`
      : await this.prisma.$queryRaw<Array<{ id: string }>>`
          SELECT id FROM di_v0_s4_work_items
          WHERE (
              ${anchor}::timestamptz IS NULL
              OR settlement_anchor_at > ${anchor}::timestamptz
              OR (settlement_anchor_at = ${anchor}::timestamptz AND id > ${afterId})
            )
          ORDER BY settlement_anchor_at ASC, id ASC
          LIMIT ${limit}`;
    return rows.map((r) => r.id);
  }
}

export { TERMINAL_STATES as DI_V0_S4F_TERMINAL_STATES };
