import { Injectable, Logger, Optional } from '@nestjs/common';
import {
  DeviceConnectionEpisodeResolutionMethod,
  DeviceConnectionEpisodeStatus,
  DimoDeviceConnectionEventType,
} from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import { extractConnectivitySnapshot } from '@shared/utils/connectivity-signals';
import { ConnectivityObservabilityService } from '../connectivity/connectivity-observability.service';
import { DeviceConnectionEpisodeService } from '../device-connection-episode.service';
import {
  buildSnapshotReferenceId,
} from '../device-connection-episode-resolution/device-connection-episode-resolution.snapshot-evaluator';
import { DeviceConnectionEpisodeResolutionService } from '../device-connection-episode-resolution/device-connection-episode-resolution.service';
import { VehicleConnectivityRuntimeProjectionService } from '../device-connection-episode-resolution/vehicle-connectivity-runtime-projection.service';
import { DeviceConnectionEpisodeReconciliationService } from './device-connection-episode-reconciliation.service';
import type { EpisodeReconciliationClassification } from './device-connection-episode-reconciliation.types';

export interface EpisodeReconciliationApplyItem {
  vehicleId: string;
  organizationId: string;
  classification: EpisodeReconciliationClassification;
  recommendedResolutionMethod: DeviceConnectionEpisodeResolutionMethod | null;
  applyEligible: boolean;
  outcome: 'applied' | 'skipped' | 'failed';
  detail: string;
}

export interface EpisodeReconciliationApplyReport {
  mode: 'DRY_RUN' | 'APPLY';
  organizationId: string;
  operator: string;
  reason: string;
  gitCommit: string | null;
  auditReportHash: string | null;
  batchSize: number;
  summary: {
    scanned: number;
    applyEligible: number;
    applied: number;
    skipped: number;
    failed: number;
  };
  items: EpisodeReconciliationApplyItem[];
  generatedAt: string;
}

function isAutoApplicable(classification: EpisodeReconciliationClassification): boolean {
  return (
    classification === 'RESOLVED_EXPLICIT' ||
    classification === 'SHOULD_RESOLVE_BY_SNAPSHOT_SIGNAL' ||
    classification === 'SHOULD_RESOLVE_BY_TELEMETRY' ||
    classification === 'SUPERSEDED_BY_BINDING_CHANGE'
  );
}

@Injectable()
export class DeviceConnectionEpisodeReconciliationApplyService {
  private readonly logger = new Logger(DeviceConnectionEpisodeReconciliationApplyService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: DeviceConnectionEpisodeReconciliationService,
    private readonly episodeService: DeviceConnectionEpisodeService,
    private readonly resolutionService: DeviceConnectionEpisodeResolutionService,
    private readonly runtimeProjection: VehicleConnectivityRuntimeProjectionService,
    @Optional() private readonly observability?: ConnectivityObservabilityService,
  ) {}

  async runApply(opts: {
    organizationId: string;
    vehicleId?: string;
    apply: boolean;
    batchSize: number;
    operator: string;
    reason: string;
    gitCommit?: string | null;
    auditReportHash?: string | null;
  }): Promise<EpisodeReconciliationApplyReport> {
    const vehicles = await this.prisma.vehicle.findMany({
      where: {
        organizationId: opts.organizationId,
        ...(opts.vehicleId ? { id: opts.vehicleId } : {}),
        deviceConnectionEpisodes: {
          some: { status: DeviceConnectionEpisodeStatus.OPEN },
        },
      },
      select: { id: true, organizationId: true },
      take: opts.batchSize,
      orderBy: { updatedAt: 'asc' },
    });

    const items: EpisodeReconciliationApplyItem[] = [];
    let applied = 0;
    let skipped = 0;
    let failed = 0;
    let applyEligible = 0;

    for (const vehicle of vehicles) {
      const readOnly = await this.audit.runReadOnlyAudit({
        organizationId: opts.organizationId,
        vehicleId: vehicle.id,
      });

      const candidate = readOnly.candidates.find((c) => c.applyEligible);
      if (!candidate || !isAutoApplicable(candidate.classification)) {
        skipped += 1;
        items.push({
          vehicleId: vehicle.id,
          organizationId: vehicle.organizationId,
          classification: candidate?.classification ?? 'NOT_ENOUGH_DATA',
          recommendedResolutionMethod: candidate?.recommendedResolutionMethod ?? null,
          applyEligible: false,
          outcome: 'skipped',
          detail: candidate ? 'not_auto_applicable' : 'no_candidate',
        });
        continue;
      }

      applyEligible += 1;

      if (!opts.apply) {
        skipped += 1;
        items.push({
          vehicleId: vehicle.id,
          organizationId: vehicle.organizationId,
          classification: candidate.classification,
          recommendedResolutionMethod: candidate.recommendedResolutionMethod,
          applyEligible: true,
          outcome: 'skipped',
          detail: 'dry_run',
        });
        continue;
      }

      try {
        const detail = await this.applyCandidate(vehicle.id, vehicle.organizationId, candidate);
        applied += 1;
        items.push({
          vehicleId: vehicle.id,
          organizationId: vehicle.organizationId,
          classification: candidate.classification,
          recommendedResolutionMethod: candidate.recommendedResolutionMethod,
          applyEligible: true,
          outcome: 'applied',
          detail,
        });
        this.observability?.log('reconciliation', {
          classification: candidate.classification,
          outcome: 'applied',
          method: candidate.recommendedResolutionMethod ?? undefined,
        });
      } catch (err) {
        failed += 1;
        const message = err instanceof Error ? err.message : String(err);
        items.push({
          vehicleId: vehicle.id,
          organizationId: vehicle.organizationId,
          classification: candidate.classification,
          recommendedResolutionMethod: candidate.recommendedResolutionMethod,
          applyEligible: true,
          outcome: 'failed',
          detail: message,
        });
        this.observability?.logWarn('reconciliation', {
          classification: candidate.classification,
          outcome: 'failed',
          reason: message,
        });
      }
    }

    return {
      mode: opts.apply ? 'APPLY' : 'DRY_RUN',
      organizationId: opts.organizationId,
      operator: opts.operator,
      reason: opts.reason,
      gitCommit: opts.gitCommit ?? null,
      auditReportHash: opts.auditReportHash ?? null,
      batchSize: opts.batchSize,
      summary: {
        scanned: vehicles.length,
        applyEligible,
        applied,
        skipped,
        failed,
      },
      items,
      generatedAt: new Date().toISOString(),
    };
  }

  private async applyCandidate(
    vehicleId: string,
    organizationId: string,
    candidate: {
      classification: EpisodeReconciliationClassification;
      recommendedResolutionMethod: DeviceConnectionEpisodeResolutionMethod | null;
    },
  ): Promise<string> {
    const latest = await this.prisma.vehicleLatestState.findUnique({
      where: { vehicleId },
      select: { id: true, lastSeenAt: true, rawPayloadJson: true, dimoTokenId: true, source: true },
    });
    const vehicleRow = await this.prisma.vehicle.findUnique({
      where: { id: vehicleId },
      select: { hardwareType: true },
    });
    const conn = extractConnectivitySnapshot(
      (latest?.rawPayloadJson as Record<string, unknown> | undefined) ?? undefined,
    );
    const snapshotRef = latest?.id
      ? buildSnapshotReferenceId({
          vehicleLatestStateId: latest.id,
          providerObservedAt: latest.lastSeenAt ?? new Date(),
        })
      : `reconciliation:${vehicleId}:${Date.now()}`;
    const hardwareType = vehicleRow?.hardwareType ?? null;

    if (candidate.classification === 'SHOULD_RESOLVE_BY_SNAPSHOT_SIGNAL') {
      const result = await this.resolutionService.tryResolveFromSnapshotPlugSignal({
        organizationId,
        vehicleId,
        provider: 'DIMO',
        hardwareType,
        obdIsPluggedIn: conn.obdIsPluggedIn,
        providerObservedAt: latest?.lastSeenAt ?? null,
        receivedAt: new Date(),
        snapshotSource: latest?.source ?? null,
        providerBindingId: latest?.dimoTokenId != null ? String(latest.dimoTokenId) : null,
        providerDeviceIdHash: null,
        snapshotReferenceId: snapshotRef,
        sourceSubtype: null,
      });
      this.observability?.log('snapshot_recovery', { outcome: result.outcome });
      await this.runtimeProjection.projectForVehicle(organizationId, vehicleId);
      return result.outcome;
    }

    if (candidate.classification === 'SHOULD_RESOLVE_BY_TELEMETRY') {
      const result = await this.resolutionService.tryResolveFromSustainedTelemetry({
        organizationId,
        vehicleId,
        provider: 'DIMO',
        hardwareType,
        obdIsPluggedIn: conn.obdIsPluggedIn,
        providerObservedAt: latest?.lastSeenAt ?? null,
        receivedAt: new Date(),
        snapshotSource: latest?.source ?? null,
        sourceSubtype: null,
        providerBindingId: latest?.dimoTokenId != null ? String(latest.dimoTokenId) : null,
        providerDeviceIdHash: null,
        snapshotReferenceId: snapshotRef,
        hasOperationalSignal: true,
        providerConnectionStatus: 'CONNECTED',
      });
      this.observability?.log('telemetry_recovery', { outcome: result.outcome });
      await this.runtimeProjection.projectForVehicle(organizationId, vehicleId);
      return result.outcome;
    }

    if (candidate.classification === 'RESOLVED_EXPLICIT') {
      const plugEvent = await this.prisma.dimoDeviceConnectionEvent.findFirst({
        where: {
          vehicleId,
          organizationId,
          eventType: DimoDeviceConnectionEventType.OBD_DEVICE_PLUGGED_IN,
        },
        orderBy: { observedAt: 'desc' },
      });
      if (!plugEvent) {
        throw new Error('missing_explicit_plug_event');
      }
      const result = await this.episodeService.resolveFromExplicitPlugEvent({
        organizationId,
        vehicleId,
        provider: 'DIMO',
        eventId: plugEvent.id,
        tokenId: plugEvent.tokenId,
        observedAt: plugEvent.observedAt,
        receivedAt: plugEvent.createdAt,
      });
      await this.runtimeProjection.projectForVehicle(organizationId, vehicleId);
      return result.outcome;
    }

    if (candidate.classification === 'SUPERSEDED_BY_BINDING_CHANGE') {
      const open = await this.prisma.deviceConnectionEpisode.findFirst({
        where: {
          organizationId,
          vehicleId,
          status: DeviceConnectionEpisodeStatus.OPEN,
        },
      });
      if (!open) return 'no_open_episode';
      await this.prisma.deviceConnectionEpisode.update({
        where: { id: open.id },
        data: {
          status: DeviceConnectionEpisodeStatus.SUPERSEDED,
          resolvedAt: new Date(),
          resolutionMethod: DeviceConnectionEpisodeResolutionMethod.DEVICE_BINDING_CHANGED,
          resolutionEvidenceAt: new Date(),
          stateVersion: { increment: 1 },
        },
      });
      this.observability?.log('binding_changed', { provider: 'DIMO', outcome: 'superseded' });
      await this.runtimeProjection.projectForVehicle(organizationId, vehicleId);
      return 'superseded';
    }

    throw new Error(`unsupported_classification:${candidate.classification}`);
  }
}
