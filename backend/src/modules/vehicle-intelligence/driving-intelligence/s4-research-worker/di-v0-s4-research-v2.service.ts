import { Injectable } from '@nestjs/common';
import type { PrismaClient } from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import {
  evaluateDiV0S4KillRow,
  parseDiV0S4ControlPlaneConfig,
  type DiV0S4ControlPlaneConfig,
} from '../s4a-foundation/di-v0-s4a-control-plane';
import { DiV0S4ResearchOutboxRepository } from './di-v0-s4-research-outbox.repository';
import { processDiV0S4ResearchRoadMatchingV2 } from './di-v0-s4-research-processor';
import { DiV0S4ResearchRunRepository } from './di-v0-s4-research-run.repository';
import {
  evaluateDiV0S4ResearchEnablement,
  parseDiV0S4ResearchControlPlaneConfig,
} from './di-v0-s4-research-control-plane';
import {
  isDiV0S4ResearchV2Runnable,
  parseDiV0S4ResearchV2RuntimeConfig,
  type DiV0S4ResearchV2RuntimeConfig,
  DI_V0_S4_RESEARCH_V2_TUNING,
} from './di-v0-s4-research-v2.config';
import { DiV0S4ResearchNullOsmProvider } from './di-v0-s4-research-osm-context';

export type DiV0S4ResearchV2PassResult = {
  configured: boolean;
  discovered: number;
  claimed: number;
  succeeded: number;
  failedRetryable: number;
  neutral: number;
};

@Injectable()
export class DiV0S4ResearchV2Service {
  private readonly outbox: DiV0S4ResearchOutboxRepository;
  private readonly runs: DiV0S4ResearchRunRepository;
  private readonly runtimeConfig: DiV0S4ResearchV2RuntimeConfig;
  private readonly s4ControlPlane: DiV0S4ControlPlaneConfig;

  constructor(
    private readonly prisma: PrismaService,
    private readonly osmProvider: DiV0S4ResearchNullOsmProvider,
  ) {
    const researchCp = parseDiV0S4ResearchControlPlaneConfig(process.env);
    this.runtimeConfig = parseDiV0S4ResearchV2RuntimeConfig(researchCp, process.env);
    this.s4ControlPlane = parseDiV0S4ControlPlaneConfig(process.env);
    this.outbox = new DiV0S4ResearchOutboxRepository(prisma as unknown as PrismaClient);
    this.runs = new DiV0S4ResearchRunRepository(prisma as unknown as PrismaClient);
  }

  isConfigured(): boolean {
    return isDiV0S4ResearchV2Runnable(this.runtimeConfig);
  }

  getRuntimeConfig(): DiV0S4ResearchV2RuntimeConfig {
    return this.runtimeConfig;
  }

  async runPass(now = new Date()): Promise<DiV0S4ResearchV2PassResult> {
    const empty: DiV0S4ResearchV2PassResult = {
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
      researchOrgAllowlist: [...cp.organizationAllowlist],
      researchVehicleAllowlist: [...cp.vehicleAllowlist],
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
      } catch {
        const next = new Date(now.getTime() + DI_V0_S4_RESEARCH_V2_TUNING.baseRetryDelayMs);
        await this.outbox.markFailedRetryable(row.workItemId, row.claimToken, 'PROCESSING_ERROR', next);
        result.failedRetryable += 1;
      }
    }
    return result;
  }

  private async processClaimedRow(
    row: { workItemId: string; organizationId: string; tripId: string; vehicleId: string; claimToken: string },
    now: Date,
  ): Promise<'SUCCEEDED' | 'NEUTRAL' | 'FAILED'> {
    const killRow = await this.prisma.diV0S4Control.findFirst();
    const kill = evaluateDiV0S4KillRow(
      killRow ? { kind: 'ROW', killState: killRow.killState } : { kind: 'MISSING' },
    );
    const vehicle = await this.prisma.vehicle.findUnique({
      where: { id: row.vehicleId },
      select: { organizationId: true },
    });
    const enable = evaluateDiV0S4ResearchEnablement(
      this.runtimeConfig.controlPlane,
      this.s4ControlPlane,
      kill,
      {
        organizationId: row.organizationId,
        vehicleId: row.vehicleId,
        vehicleOrganizationId: vehicle?.organizationId ?? null,
      },
    );
    if (!enable.enabled) {
      await this.outbox.markSkipped(row.workItemId, row.claimToken, enable.reason ?? 'INELIGIBLE');
      return 'FAILED';
    }

    const wi = await this.prisma.diV0S4WorkItem.findFirst({
      where: { id: row.workItemId, organizationId: row.organizationId, tripId: row.tripId },
    });
    if (!wi || wi.status !== 'COMPLETED' || !wi.pinnedSnapshotHash) {
      await this.outbox.markSkipped(row.workItemId, row.claimToken, 'WORK_ITEM_INELIGIBLE');
      return 'FAILED';
    }

    const snap = await this.prisma.diV0S4EvidenceSnapshot.findFirst({
      where: {
        organizationId: row.organizationId,
        tripId: row.tripId,
        snapshotHash: wi.pinnedSnapshotHash,
      },
    });
    if (!snap) {
      await this.outbox.markSkipped(row.workItemId, row.claimToken, 'SNAPSHOT_MISSING');
      return 'FAILED';
    }

    const shadowL3 = new Map<string, number | null>();
    if (wi.shadowRunId) {
      const intervals = await this.prisma.diV0ShadowInterval.findMany({
        where: { shadowRunId: wi.shadowRunId, organizationId: row.organizationId, tripId: row.tripId },
        select: { intervalStart: true, estimatedSpeedKmh: true },
      });
      for (const iv of intervals) {
        shadowL3.set(iv.intervalStart.toISOString().replace(/\.\d{3}Z$/, 'Z'), iv.estimatedSpeedKmh);
      }
    }

    const runResult = await processDiV0S4ResearchRoadMatchingV2({
      organizationId: row.organizationId,
      vehicleId: row.vehicleId,
      tripId: row.tripId,
      workItemId: row.workItemId,
      boundaryFingerprint: wi.boundaryFingerprint,
      snapshotHash: wi.pinnedSnapshotHash,
      sourceFamily: wi.sourceFamily,
      combinedInputIdentity: wi.combinedInputIdentity ?? '',
      snapshotRow: {
        organization_id: snap.organizationId,
        vehicle_id: snap.vehicleId,
        trip_id: snap.tripId,
        boundary_fingerprint: snap.boundaryFingerprint,
        acquisition_window_start: snap.acquisitionWindowStart,
        acquisition_window_end: snap.acquisitionWindowEnd,
        channel_manifest: snap.channelManifest,
        payload_gzip: Buffer.from(snap.payloadGzip),
        uncompressed_bytes: snap.uncompressedBytes,
      },
      shadowL3ByBucket: shadowL3,
      osmProvider: this.osmProvider,
    });

    const inserted = await this.runs.insertRun({
      organizationId: row.organizationId,
      vehicleId: row.vehicleId,
      tripId: row.tripId,
      workItemId: row.workItemId,
      combinedInputIdentity: wi.combinedInputIdentity ?? '',
      pinnedSnapshotHash: wi.pinnedSnapshotHash,
      result: runResult,
    });
    if (!inserted) {
      await this.outbox.markSucceeded(row.workItemId, row.claimToken);
      return runResult.researchStatus === 'SUCCEEDED' ? 'SUCCEEDED' : 'NEUTRAL';
    }
    await this.outbox.markSucceeded(row.workItemId, row.claimToken);
    return runResult.researchStatus === 'SUCCEEDED' ? 'SUCCEEDED' : 'NEUTRAL';
  }
}
