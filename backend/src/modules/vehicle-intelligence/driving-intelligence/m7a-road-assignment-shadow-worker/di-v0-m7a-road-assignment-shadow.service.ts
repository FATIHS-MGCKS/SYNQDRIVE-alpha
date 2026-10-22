import { Inject, Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'crypto';
import type { PrismaClient } from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import {
  evaluateDiV0S4KillRow,
  parseDiV0S4ControlPlaneConfig,
  type DiV0S4ControlPlaneConfig,
} from '../s4a-foundation/di-v0-s4a-control-plane';
import type { DiV0S4SourceFamily } from '../s4a-foundation/di-v0-s4a-contract';
import { DiV0S4ResearchS4ReadRepository } from '../s4-research-worker/di-v0-s4-research-s4-read.repository';
import { buildShadowEvidenceByBucket } from '../s4-research-worker/di-v0-s4-research-shadow-evidence';
import type { DiV0S4ResearchOsmProvider } from '../s4-research-worker/di-v0-s4-research-osm-context';
import { DI_V0_S4_RESEARCH_OSM_PROVIDER } from '../s4-research-worker/di-v0-s4-research.tokens';
import { DI_V0_M7A_ROAD_ASSIGNMENT_SHADOW_BUNDLE_VERSION_V1 } from './di-v0-m7a-road-assignment-shadow.bundle.version';
import {
  DI_V0_M7A_ROAD_ASSIGNMENT_SHADOW_TUNING,
  isDiV0M7aRoadAssignmentShadowWorkerRunnable,
  parseDiV0M7aRoadAssignmentShadowRuntimeConfig,
  type DiV0M7aRoadAssignmentShadowRuntimeConfig,
} from './di-v0-m7a-road-assignment-shadow.config';
import { evaluateDiV0M7aRoadAssignmentShadowEnablement } from './di-v0-m7a-road-assignment-shadow-control-plane';
import { DiV0M7aRoadAssignmentShadowOutboxRepository } from './di-v0-m7a-road-assignment-shadow-outbox.repository';
import { processDiV0M7aRoadAssignmentShadowTrip } from './di-v0-m7a-road-assignment-shadow-processor';
import { DiV0M7aRoadAssignmentShadowRunRepository } from './di-v0-m7a-road-assignment-shadow-run.repository';
import { resolveM7aRoadAssignmentShadowOsmDataVersion } from './di-v0-m7a-road-assignment-shadow-intent';

export type DiV0M7aRoadAssignmentShadowPassResult = {
  configured: boolean;
  discovered: number;
  claimed: number;
  succeeded: number;
  failedRetryable: number;
  neutral: number;
};

@Injectable()
export class DiV0M7aRoadAssignmentShadowService {
  private readonly logger = new Logger(DiV0M7aRoadAssignmentShadowService.name);
  private readonly runtimeConfig: DiV0M7aRoadAssignmentShadowRuntimeConfig;
  private readonly s4ControlPlane: DiV0S4ControlPlaneConfig;
  private readonly osmDataVersion: string;
  private readonly outbox: DiV0M7aRoadAssignmentShadowOutboxRepository;
  private readonly runs: DiV0M7aRoadAssignmentShadowRunRepository;
  private readonly s4Read: DiV0S4ResearchS4ReadRepository;

  constructor(
    private readonly prisma: PrismaService,
    @Inject(DI_V0_S4_RESEARCH_OSM_PROVIDER) private readonly osmProvider: DiV0S4ResearchOsmProvider,
  ) {
    this.runtimeConfig = parseDiV0M7aRoadAssignmentShadowRuntimeConfig(process.env);
    this.s4ControlPlane = parseDiV0S4ControlPlaneConfig(process.env);
    this.osmDataVersion = resolveM7aRoadAssignmentShadowOsmDataVersion(process.env);
    this.outbox = new DiV0M7aRoadAssignmentShadowOutboxRepository(prisma as unknown as PrismaClient);
    this.runs = new DiV0M7aRoadAssignmentShadowRunRepository(prisma as unknown as PrismaClient);
    this.s4Read = new DiV0S4ResearchS4ReadRepository(prisma as unknown as PrismaClient);
  }

  isConfigured(): boolean {
    return isDiV0M7aRoadAssignmentShadowWorkerRunnable(this.runtimeConfig);
  }

  getRuntimeConfig(): DiV0M7aRoadAssignmentShadowRuntimeConfig {
    return this.runtimeConfig;
  }

  async runPass(now = new Date()): Promise<DiV0M7aRoadAssignmentShadowPassResult> {
    const empty: DiV0M7aRoadAssignmentShadowPassResult = {
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
      osmDataVersion: this.osmDataVersion,
      limit: this.runtimeConfig.batchLimit * 5,
      now,
    });

    const result = { ...empty, configured: true, discovered, claimed: 0 };

    /** One active decode per tick — avoids stacked PROCESSING leases while earlier trips decode. */
    for (let i = 0; i < this.runtimeConfig.batchLimit; i++) {
      const claimed = await this.outbox.claimBatch(1, now);
      if (claimed.length === 0) break;
      const row = claimed[0];
      result.claimed += 1;
      try {
        const processed = await this.processClaimedRow(row, now);
        if (processed === 'SUCCEEDED') result.succeeded += 1;
        else if (processed === 'NEUTRAL') result.neutral += 1;
        else result.failedRetryable += 1;
      } catch (error) {
        const next = new Date(now.getTime() + DI_V0_M7A_ROAD_ASSIGNMENT_SHADOW_TUNING.baseRetryDelayMs);
        await this.outbox.markFailedRetryable(row.outboxId, row.claimToken, 'PROCESSING_ERROR', next);
        result.failedRetryable += 1;
        this.logger.warn(
          `m7a road-assignment shadow tick error workItemId=${row.workItemId}: ${
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
    if (row.attemptCount > DI_V0_M7A_ROAD_ASSIGNMENT_SHADOW_TUNING.maxProcessingAttempts) {
      await this.outbox.markSkipped(row.outboxId, row.claimToken, 'ATTEMPT_BUDGET_EXCEEDED');
      return 'FAILED';
    }

    const leaseOk = await this.outbox.renewClaimLease(row.outboxId, row.claimToken, now);
    if (!leaseOk) return 'FAILED';

    const killState = await this.s4Read.loadGlobalKillState();
    const kill = evaluateDiV0S4KillRow(
      killState != null ? { kind: 'ROW', killState: killState as 'KILLED' | 'NOT_KILLED' } : { kind: 'MISSING' },
    );
    const vehicleOrganizationId = await this.s4Read.loadVehicleOrganizationId(row.vehicleId);
    const enable = evaluateDiV0M7aRoadAssignmentShadowEnablement(
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

    let shadowByBucket = new Map();
    if (wi.shadowRunId) {
      const intervals = await this.s4Read.loadShadowIntervals({
        shadowRunId: wi.shadowRunId,
        organizationId: row.organizationId,
        tripId: row.tripId,
      });
      shadowByBucket = buildShadowEvidenceByBucket(intervals);
    }

    let processed;
    const leaseRenew = setInterval(() => {
      void this.outbox.renewClaimLease(row.outboxId, row.claimToken, new Date());
    }, DI_V0_M7A_ROAD_ASSIGNMENT_SHADOW_TUNING.claimLeaseRenewIntervalMs);
    try {
      processed = await processDiV0M7aRoadAssignmentShadowTrip({
        organizationId: row.organizationId,
        vehicleId: row.vehicleId,
        tripId: row.tripId,
        workItemId: row.workItemId,
        boundaryFingerprint: wi.boundaryFingerprint,
        snapshotHash: wi.pinnedSnapshotHash,
        sourceFamily: wi.sourceFamily as DiV0S4SourceFamily,
        combinedInputIdentity: wi.combinedInputIdentity,
        discoveryIntentKey: row.shadowIntentKey,
        osmDataVersion: this.osmDataVersion,
        snapshotRow: {
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
        shadowByBucket,
        osmProvider: this.osmProvider,
        processingDeadlineMs: DI_V0_M7A_ROAD_ASSIGNMENT_SHADOW_TUNING.maxProcessingMsPerTrip,
        computedAt: now,
      });
    } catch (error) {
      const next = new Date(now.getTime() + DI_V0_M7A_ROAD_ASSIGNMENT_SHADOW_TUNING.baseRetryDelayMs);
      await this.outbox.markFailedRetryable(
        row.outboxId,
        row.claimToken,
        error instanceof Error ? error.message.slice(0, 120) : 'COMPUTE_FAILED',
        next,
      );
      return 'FAILED';
    } finally {
      clearInterval(leaseRenew);
    }

    if (processed.kind === 'SNAPSHOT_INVALID') {
      await this.outbox.markSkipped(row.outboxId, row.claimToken, processed.summary.errorCode ?? 'SNAPSHOT_INVALID');
      return 'FAILED';
    }

    const runIntentKey =
      processed.kind === 'SUCCEEDED' ? processed.runIntentKey : processed.runIntentKey;
    const existingRun = await this.runs.findSucceededForIntent(row.workItemId, runIntentKey);
    if (existingRun) {
      await this.outbox.markSucceeded(row.outboxId, row.claimToken);
      return 'NEUTRAL';
    }

    if (processed.kind === 'ROAD_CONTEXT_UNAVAILABLE') {
      await this.runs.insertFailedRun({
        runId: randomUUID(),
        organizationId: row.organizationId,
        vehicleId: row.vehicleId,
        tripId: row.tripId,
        workItemId: row.workItemId,
        shadowIntentKey: runIntentKey,
        shadowBundleVersion: DI_V0_M7A_ROAD_ASSIGNMENT_SHADOW_BUNDLE_VERSION_V1,
        pinnedSnapshotHash: wi.pinnedSnapshotHash,
        combinedInputIdentity: wi.combinedInputIdentity,
        contentFingerprint: processed.summary.contentFingerprint,
        summary: processed.summary,
      });
      await this.outbox.markSucceeded(row.outboxId, row.claimToken);
      return 'NEUTRAL';
    }

    const insert = await this.runs.insertSucceededRun({
      runId: randomUUID(),
      organizationId: row.organizationId,
      vehicleId: row.vehicleId,
      tripId: row.tripId,
      workItemId: row.workItemId,
      shadowIntentKey: runIntentKey,
      shadowBundleVersion: DI_V0_M7A_ROAD_ASSIGNMENT_SHADOW_BUNDLE_VERSION_V1,
      pinnedSnapshotHash: wi.pinnedSnapshotHash,
      combinedInputIdentity: wi.combinedInputIdentity,
      contentFingerprint: processed.contentFingerprint,
      summary: processed.summary,
      payload: processed.payload,
    });

    if (insert.outcome === 'sql_error') {
      const next = new Date(now.getTime() + DI_V0_M7A_ROAD_ASSIGNMENT_SHADOW_TUNING.baseRetryDelayMs);
      await this.outbox.markFailedRetryable(row.outboxId, row.claimToken, insert.code, next);
      return 'FAILED';
    }

    await this.outbox.markSucceeded(row.outboxId, row.claimToken);
    return insert.outcome === 'inserted' ? 'SUCCEEDED' : 'NEUTRAL';
  }
}
