import { Injectable, Logger, Optional } from '@nestjs/common';
import {
  DeviceConnectionEpisodeResolutionMethod,
  DeviceConnectionEpisodeStatus,
} from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import { ConnectivityObservabilityService } from '../connectivity/connectivity-observability.service';
import { DeviceConnectionEpisodeService } from '../device-connection-episode.service';
import { DeviceConnectionEpisodeResolutionService } from '../device-connection-episode-resolution/device-connection-episode-resolution.service';
import type { EpisodeReconciliationEvidencePackage } from './device-connection-episode-reconciliation-evidence-package.types';
import {
  validateEvidencePackageAgainstDatabase,
  validateEvidencePackageCanonical,
} from './device-connection-episode-reconciliation-evidence-package.validator';
import { isAutoApplicableClassification } from './device-connection-episode-reconciliation-evidence-package.builder';

export interface EpisodeReconciliationApplyItem {
  vehicleId: string;
  organizationId: string;
  episodeId: string;
  evidenceHash: string;
  classification: EpisodeReconciliationEvidencePackage['classification'];
  recommendedResolutionMethod: DeviceConnectionEpisodeResolutionMethod | null;
  applyEligible: boolean;
  outcome: 'applied' | 'skipped' | 'failed' | 'rejected';
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
    rejected: number;
  };
  items: EpisodeReconciliationApplyItem[];
  generatedAt: string;
}

@Injectable()
export class DeviceConnectionEpisodeReconciliationApplyService {
  private readonly logger = new Logger(DeviceConnectionEpisodeReconciliationApplyService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly episodeService: DeviceConnectionEpisodeService,
    private readonly resolutionService: DeviceConnectionEpisodeResolutionService,
    @Optional() private readonly observability?: ConnectivityObservabilityService,
  ) {}

  async runApply(opts: {
    organizationId: string;
    evidencePackages: EpisodeReconciliationEvidencePackage[];
    apply: boolean;
    batchSize: number;
    operator: string;
    reason: string;
    gitCommit?: string | null;
    auditReportHash?: string | null;
  }): Promise<EpisodeReconciliationApplyReport> {
    const scoped = opts.evidencePackages
      .filter((pkg) => pkg.organizationId === opts.organizationId)
      .slice(0, opts.batchSize);

    const items: EpisodeReconciliationApplyItem[] = [];
    let applied = 0;
    let skipped = 0;
    let failed = 0;
    let rejected = 0;
    let applyEligible = 0;

    for (const pkg of scoped) {
      const baseItem = {
        vehicleId: pkg.vehicleId,
        organizationId: pkg.organizationId,
        episodeId: pkg.episodeId,
        evidenceHash: pkg.evidenceHash,
        classification: pkg.classification,
        recommendedResolutionMethod: pkg.recommendedResolutionMethod,
        applyEligible: true,
      };

      const canonical = validateEvidencePackageCanonical(pkg);
      if (!canonical.valid || !isAutoApplicableClassification(pkg.classification)) {
        rejected += 1;
        items.push({
          ...baseItem,
          applyEligible: false,
          outcome: 'rejected',
          detail: canonical.detail ?? canonical.reason ?? 'invalid_package',
        });
        continue;
      }

      const dbValidation = await validateEvidencePackageAgainstDatabase(this.prisma, pkg);
      if (!dbValidation.valid) {
        rejected += 1;
        items.push({
          ...baseItem,
          applyEligible: false,
          outcome: 'rejected',
          detail: dbValidation.detail ?? dbValidation.reason ?? 'stale_package',
        });
        continue;
      }

      applyEligible += 1;

      if (!opts.apply) {
        skipped += 1;
        items.push({
          ...baseItem,
          outcome: 'skipped',
          detail: 'dry_run',
        });
        continue;
      }

      try {
        const detail = await this.applyEvidencePackage(pkg);
        if (detail === 'already_resolved' || detail === 'same_snapshot_applied') {
          skipped += 1;
          items.push({
            ...baseItem,
            outcome: 'skipped',
            detail,
          });
        } else {
          applied += 1;
          items.push({
            ...baseItem,
            outcome: 'applied',
            detail,
          });
          this.observability?.log('reconciliation', {
            classification: pkg.classification,
            outcome: 'applied',
            method: pkg.recommendedResolutionMethod ?? undefined,
          });
        }
      } catch (err) {
        failed += 1;
        const message = err instanceof Error ? err.message : String(err);
        items.push({
          ...baseItem,
          outcome: 'failed',
          detail: message,
        });
        this.observability?.logWarn('reconciliation', {
          classification: pkg.classification,
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
        scanned: scoped.length,
        applyEligible,
        applied,
        skipped,
        failed,
        rejected,
      },
      items,
      generatedAt: new Date().toISOString(),
    };
  }

  private async applyEvidencePackage(pkg: EpisodeReconciliationEvidencePackage): Promise<string> {
    const providerObservedAt = new Date(pkg.providerObservedAt);
    const receivedAt = new Date(pkg.receivedAt);

    if (pkg.recoveryEvidenceType === 'snapshot_signal') {
      const result = await this.resolutionService.tryResolveFromSnapshotPlugSignal({
        organizationId: pkg.organizationId,
        vehicleId: pkg.vehicleId,
        provider: pkg.provider,
        hardwareType: pkg.hardwareType,
        obdIsPluggedIn: pkg.obdIsPluggedIn,
        providerObservedAt,
        receivedAt,
        snapshotSource: pkg.sourceType === 'resolution_audit' ? 'dimo' : 'dimo',
        providerBindingId: pkg.deviceBindingId,
        providerDeviceIdHash: null,
        snapshotReferenceId: pkg.resolutionSnapshotId,
        sourceSubtype: null,
      });
      return result.outcome;
    }

    if (pkg.recoveryEvidenceType === 'telemetry_resumed') {
      const result = await this.resolutionService.tryResolveFromSustainedTelemetry({
        organizationId: pkg.organizationId,
        vehicleId: pkg.vehicleId,
        provider: pkg.provider,
        hardwareType: pkg.hardwareType,
        obdIsPluggedIn: pkg.obdIsPluggedIn,
        providerObservedAt,
        receivedAt,
        snapshotSource: 'dimo',
        sourceSubtype: null,
        providerBindingId: pkg.deviceBindingId,
        providerDeviceIdHash: null,
        snapshotReferenceId: pkg.resolutionSnapshotId,
        hasOperationalSignal: pkg.operationalSignalSummary.hasOperationalSignal,
        providerConnectionStatus: pkg.operationalSignalSummary.providerConnectionStatus,
      });
      return result.outcome;
    }

    if (pkg.recoveryEvidenceType === 'explicit_plug') {
      if (!pkg.plugEventId) {
        throw new Error('missing_plug_event');
      }
      const plugEvent = await this.prisma.dimoDeviceConnectionEvent.findFirst({
        where: {
          id: pkg.plugEventId,
          organizationId: pkg.organizationId,
          vehicleId: pkg.vehicleId,
        },
        select: { id: true, tokenId: true, observedAt: true, receivedAt: true },
      });
      if (!plugEvent) {
        throw new Error('missing_plug_event');
      }
      const result = await this.episodeService.resolveFromExplicitPlugEvent({
        organizationId: pkg.organizationId,
        vehicleId: pkg.vehicleId,
        provider: pkg.provider,
        eventId: plugEvent.id,
        tokenId: plugEvent.tokenId,
        observedAt: plugEvent.observedAt,
        receivedAt: plugEvent.receivedAt,
      });
      return result.outcome;
    }

    if (pkg.recoveryEvidenceType === 'binding_change') {
      const open = await this.prisma.deviceConnectionEpisode.findFirst({
        where: {
          id: pkg.episodeId,
          organizationId: pkg.organizationId,
          vehicleId: pkg.vehicleId,
          status: DeviceConnectionEpisodeStatus.OPEN,
        },
      });
      if (!open) return 'already_resolved';

      await this.prisma.deviceConnectionEpisode.update({
        where: { id: open.id },
        data: {
          status: DeviceConnectionEpisodeStatus.SUPERSEDED,
          resolvedAt: providerObservedAt,
          resolutionMethod: DeviceConnectionEpisodeResolutionMethod.DEVICE_BINDING_CHANGED,
          resolutionEvidenceAt: providerObservedAt,
          stateVersion: { increment: 1 },
        },
      });
      this.observability?.log('binding_changed', { provider: pkg.provider, outcome: 'superseded' });
      return 'superseded';
    }

    throw new Error(`unsupported_recovery_type:${pkg.recoveryEvidenceType}`);
  }
}
