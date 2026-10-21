import { Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'crypto';
import type { PrismaClient } from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import {
  evaluateDiV0S4KillRow,
  parseDiV0S4ControlPlaneConfig,
  type DiV0S4ControlPlaneConfig,
} from '../s4a-foundation/di-v0-s4a-control-plane';
import type { DiV0S4SourceFamily } from '../s4a-foundation/di-v0-s4a-contract';
import { verifyAndParseDiV0PinnedEvidenceSnapshot } from '../s4d-replay/di-v0-s4d-verified-snapshot';
import { DiV0S4ResearchS4ReadRepository } from '../s4-research-worker/di-v0-s4-research-s4-read.repository';
import { DI_V0_MOTION_CORE_SHADOW_BUNDLE_VERSION_V1 } from './di-v0-motion-core-shadow.bundle.version';
import {
  DI_V0_MOTION_CORE_SHADOW_TUNING,
  isDiV0MotionCoreShadowWorkerRunnable,
  parseDiV0MotionCoreShadowRuntimeConfig,
  type DiV0MotionCoreShadowRuntimeConfig,
} from './di-v0-motion-core-shadow.config';
import {
  evaluateDiV0MotionCoreShadowEnablement,
} from './di-v0-motion-core-shadow-control-plane';
import { DiV0MotionCoreShadowOutboxRepository } from './di-v0-motion-core-shadow-outbox.repository';
import { processDiV0MotionCoreShadowTrip } from './di-v0-motion-core-shadow-processor';
import { DiV0MotionCoreShadowRunRepository } from './di-v0-motion-core-shadow-run.repository';

export type DiV0MotionCoreShadowPassResult = {
  configured: boolean;
  discovered: number;
  claimed: number;
  succeeded: number;
  failedRetryable: number;
  neutral: number;
};

@Injectable()
export class DiV0MotionCoreShadowService {
  private readonly logger = new Logger(DiV0MotionCoreShadowService.name);
  private readonly runtimeConfig: DiV0MotionCoreShadowRuntimeConfig;
  private readonly s4ControlPlane: DiV0S4ControlPlaneConfig;
  private readonly outbox: DiV0MotionCoreShadowOutboxRepository;
  private readonly runs: DiV0MotionCoreShadowRunRepository;
  private readonly s4Read: DiV0S4ResearchS4ReadRepository;

  constructor(private readonly prisma: PrismaService) {
    this.runtimeConfig = parseDiV0MotionCoreShadowRuntimeConfig(process.env);
    this.s4ControlPlane = parseDiV0S4ControlPlaneConfig(process.env);
    this.outbox = new DiV0MotionCoreShadowOutboxRepository(prisma as unknown as PrismaClient);
    this.runs = new DiV0MotionCoreShadowRunRepository(prisma as unknown as PrismaClient);
    this.s4Read = new DiV0S4ResearchS4ReadRepository(prisma as unknown as PrismaClient);
  }

  isConfigured(): boolean {
    return isDiV0MotionCoreShadowWorkerRunnable(this.runtimeConfig);
  }

  getRuntimeConfig(): DiV0MotionCoreShadowRuntimeConfig {
    return this.runtimeConfig;
  }

  async runPass(now = new Date()): Promise<DiV0MotionCoreShadowPassResult> {
    const empty: DiV0MotionCoreShadowPassResult = {
      configured: false,
      discovered: 0,
      claimed: 0,
      succeeded: 0,
      failedRetryable: 0,
      neutral: 0,
    };
    if (!this.isConfigured() || !this.runtimeConfig.enabledSince) return empty;

    const cp = this.runtimeConfig.controlPlane;
    const discovered = await this.outbox.discoverEligible({
      enabledSince: this.runtimeConfig.enabledSince,
      organizationAllowlist: [...cp.organizationAllowlist],
      vehicleAllowlist: [...cp.vehicleAllowlist],
      limit: this.runtimeConfig.batchLimit * 5,
      now,
    });

    const claimed = await this.outbox.claimBatch(this.runtimeConfig.batchLimit, now);
    const result = { ...empty, configured: true, discovered, claimed: claimed.length };

    for (const row of claimed) {
      try {
        const processed = await this.processClaimedRow(row, now);
        if (processed === 'SUCCEEDED') result.succeeded += 1;
        else if (processed === 'NEUTRAL') result.neutral += 1;
        else result.failedRetryable += 1;
      } catch (error) {
        const next = new Date(now.getTime() + DI_V0_MOTION_CORE_SHADOW_TUNING.baseRetryDelayMs);
        await this.outbox.markFailedRetryable(row.outboxId, row.claimToken, 'PROCESSING_ERROR', next);
        result.failedRetryable += 1;
        this.logger.warn(
          `motion-core shadow tick error workItemId=${row.workItemId}: ${
            error instanceof Error ? error.message.slice(0, 200) : 'unknown'
          }`,
        );
      }
    }
    return result;
  }

  private async processClaimedRow(
    row: {
      outboxId: string;
      workItemId: string;
      shadowIntentKey: string;
      organizationId: string;
      tripId: string;
      vehicleId: string;
      claimToken: string;
      attemptCount: number;
    },
    now: Date,
  ): Promise<'SUCCEEDED' | 'NEUTRAL' | 'FAILED'> {
    if (row.attemptCount > DI_V0_MOTION_CORE_SHADOW_TUNING.maxProcessingAttempts) {
      await this.outbox.markSkipped(row.outboxId, row.claimToken, 'ATTEMPT_BUDGET_EXCEEDED');
      return 'FAILED';
    }

    const leaseOk = await this.outbox.renewClaimLease(row.outboxId, row.claimToken, now);
    if (!leaseOk) return 'FAILED';

    const existing = await this.runs.findSucceededForIntent(row.workItemId, row.shadowIntentKey);
    if (existing) {
      await this.outbox.markSucceeded(row.outboxId, row.claimToken);
      return 'NEUTRAL';
    }

    const killState = await this.s4Read.loadGlobalKillState();
    const kill = evaluateDiV0S4KillRow(
      killState != null ? { kind: 'ROW', killState: killState as 'KILLED' | 'NOT_KILLED' } : { kind: 'MISSING' },
    );
    const vehicleOrganizationId = await this.s4Read.loadVehicleOrganizationId(row.vehicleId);
    const enable = evaluateDiV0MotionCoreShadowEnablement(
      this.runtimeConfig.controlPlane,
      this.s4ControlPlane,
      kill,
      {
        organizationId: row.organizationId,
        vehicleId: row.vehicleId,
        vehicleOrganizationId,
      },
    );
    if (!enable.enabled) {
      await this.outbox.markSkipped(row.outboxId, row.claimToken, enable.reason ?? 'INELIGIBLE');
      return 'FAILED';
    }

    const wi = await this.s4Read.loadWorkItemForResearch({
      workItemId: row.workItemId,
      organizationId: row.organizationId,
      tripId: row.tripId,
    });
    if (!wi || wi.status !== 'COMPLETED') {
      await this.outbox.markSkipped(row.outboxId, row.claimToken, 'WORK_ITEM_INELIGIBLE');
      return 'FAILED';
    }

    const snap = await this.s4Read.loadEvidenceSnapshot({
      organizationId: row.organizationId,
      tripId: row.tripId,
      snapshotHash: wi.pinnedSnapshotHash,
    });
    if (!snap) {
      await this.outbox.markSkipped(row.outboxId, row.claimToken, 'SNAPSHOT_MISSING');
      return 'FAILED';
    }

    const verified = verifyAndParseDiV0PinnedEvidenceSnapshot(
      {
        organization_id: snap.organizationId,
        vehicle_id: snap.vehicleId,
        trip_id: snap.tripId,
        boundary_fingerprint: snap.boundaryFingerprint,
        acquisition_window_start: snap.acquisitionWindowStart,
        acquisition_window_end: snap.acquisitionWindowEnd,
        channel_manifest: snap.channelManifest,
        payload_gzip: snap.payloadGzip,
        uncompressed_bytes: snap.uncompressedBytes,
      },
      {
        organizationId: row.organizationId,
        vehicleId: row.vehicleId,
        tripId: row.tripId,
        boundaryFingerprint: wi.boundaryFingerprint,
        snapshotHash: wi.pinnedSnapshotHash,
        sourceFamily: wi.sourceFamily as DiV0S4SourceFamily,
      },
    );
    if (!verified.ok) {
      await this.outbox.markSkipped(row.outboxId, row.claimToken, verified.code);
      return 'FAILED';
    }

    let processed;
    try {
      processed = processDiV0MotionCoreShadowTrip({
        parsed: verified.parsed,
        sourceFamily: wi.sourceFamily as DiV0S4SourceFamily,
        pinnedSnapshotHash: wi.pinnedSnapshotHash,
        combinedInputIdentity: wi.combinedInputIdentity,
        computedAt: now,
      });
    } catch (error) {
      await this.outbox.markSkipped(
        row.outboxId,
        row.claimToken,
        error instanceof Error ? error.message.slice(0, 120) : 'COMPUTE_FAILED',
      );
      return 'FAILED';
    }

    if (processed.intentKey !== row.shadowIntentKey) {
      await this.outbox.markSkipped(row.outboxId, row.claimToken, 'INTENT_MISMATCH');
      return 'FAILED';
    }

    const insert = await this.runs.insertSucceededRun({
      runId: randomUUID(),
      organizationId: row.organizationId,
      vehicleId: row.vehicleId,
      tripId: row.tripId,
      workItemId: row.workItemId,
      shadowIntentKey: row.shadowIntentKey,
      shadowBundleVersion: DI_V0_MOTION_CORE_SHADOW_BUNDLE_VERSION_V1,
      pinnedSnapshotHash: wi.pinnedSnapshotHash,
      combinedInputIdentity: wi.combinedInputIdentity,
      contentFingerprint: processed.payloadFingerprint,
      summary: processed.summary,
      payload: processed.payload,
    });

    if (insert.outcome === 'sql_error') {
      const next = new Date(now.getTime() + DI_V0_MOTION_CORE_SHADOW_TUNING.baseRetryDelayMs);
      await this.outbox.markFailedRetryable(row.outboxId, row.claimToken, insert.code, next);
      return 'FAILED';
    }

    await this.outbox.markSucceeded(row.outboxId, row.claimToken);
    return insert.outcome === 'inserted' ? 'SUCCEEDED' : 'NEUTRAL';
  }
}
