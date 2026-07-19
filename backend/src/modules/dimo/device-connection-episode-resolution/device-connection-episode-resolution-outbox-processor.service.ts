import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigType } from '@nestjs/config';
import {
  DeviceConnectionEpisodeResolutionOutboxEventType,
  DeviceConnectionEpisodeResolutionOutboxStatus,
} from '@prisma/client';
import deviceConnectionEpisodeResolutionOutboxConfig from '@config/device-connection-episode-resolution-outbox.config';
import { ConnectivityAlertService } from '../connectivity-alert/connectivity-alert.service';
import type { DeviceRecoverySource } from '../connectivity-alert/connectivity-alert.types';
import {
  computeOutboxBackoffMs,
  DeviceConnectionEpisodeResolutionOutboxRepository,
  resolveOutboxErrorCode,
  resolveOutboxErrorMessage,
  type ResolutionOutboxRow,
} from './device-connection-episode-resolution-outbox.repository';
import { VehicleConnectivityRuntimeProjectionService } from './vehicle-connectivity-runtime-projection.service';

export type ResolutionOutboxProcessOutcome =
  | 'completed'
  | 'retry_scheduled'
  | 'dead_letter'
  | 'permanently_failed'
  | 'skipped';

@Injectable()
export class DeviceConnectionEpisodeResolutionOutboxProcessorService {
  private readonly logger = new Logger(
    DeviceConnectionEpisodeResolutionOutboxProcessorService.name,
  );

  constructor(
    @Inject(deviceConnectionEpisodeResolutionOutboxConfig.KEY)
    private readonly config: ConfigType<typeof deviceConnectionEpisodeResolutionOutboxConfig>,
    private readonly outboxRepo: DeviceConnectionEpisodeResolutionOutboxRepository,
    private readonly runtimeProjection: VehicleConnectivityRuntimeProjectionService,
    private readonly connectivityAlerts: ConnectivityAlertService,
  ) {}

  async processOutboxId(outboxId: string): Promise<ResolutionOutboxProcessOutcome> {
    const existing = await this.outboxRepo.findById(outboxId);
    if (!existing) {
      this.logger.warn(`Resolution outbox row ${outboxId} not found`);
      return 'skipped';
    }

    if (existing.status === DeviceConnectionEpisodeResolutionOutboxStatus.COMPLETED) {
      return 'skipped';
    }

    if (
      existing.status === DeviceConnectionEpisodeResolutionOutboxStatus.FAILED ||
      existing.status === DeviceConnectionEpisodeResolutionOutboxStatus.DEAD_LETTER
    ) {
      return 'skipped';
    }

    const claimed = await this.outboxRepo.claimForProcessing(outboxId);
    if (!claimed) return 'skipped';

    return this.executeClaimedRow(claimed);
  }

  async processPendingBatch(limit = this.config.pollBatchSize): Promise<number> {
    const rows = await this.outboxRepo.findClaimableBatch(limit);
    let completed = 0;
    for (const row of rows) {
      const outcome = await this.processOutboxId(row.id);
      if (outcome === 'completed') completed += 1;
    }
    return completed;
  }

  async recoverStaleProcessing(): Promise<number> {
    const staleBefore = new Date(Date.now() - this.config.processingStaleMs);
    const rows = await this.outboxRepo.findStaleProcessingBatch(staleBefore, this.config.pollBatchSize);
    let recovered = 0;
    for (const row of rows) {
      const result = await this.outboxRepo.releaseStaleProcessing(row.id);
      if (result.count > 0) recovered += 1;
    }
    return recovered;
  }

  private async executeClaimedRow(row: ResolutionOutboxRow): Promise<ResolutionOutboxProcessOutcome> {
    const outboxId = row.id;

    try {
      switch (row.eventType) {
        case DeviceConnectionEpisodeResolutionOutboxEventType.CONNECTIVITY_RUNTIME_RECALCULATE:
          await this.processRuntimeRecalculate(row);
          break;
        case DeviceConnectionEpisodeResolutionOutboxEventType.DEVICE_ALERT_RESOLVE_PREPARED:
          await this.processAlertResolvePrepared(row);
          break;
        default:
          await this.outboxRepo.markFailed(outboxId, {
            errorCode: 'unknown_event_type',
            errorMessage: `Unsupported outbox event type: ${String(row.eventType)}`,
          });
          return 'permanently_failed';
      }

      await this.outboxRepo.markCompleted(outboxId);
      return 'completed';
    } catch (err: unknown) {
      return this.handleProcessingFailure(row, err);
    }
  }

  private async processRuntimeRecalculate(row: ResolutionOutboxRow): Promise<void> {
    const episode = await this.outboxRepo.loadEpisodeForOutbox({
      organizationId: row.organizationId,
      vehicleId: row.vehicleId,
      episodeId: row.episodeId,
    });
    if (!episode) {
      throw new Error(`Episode ${row.episodeId} not found for runtime recalculation`);
    }

    await this.outboxRepo.loadBindingState(episode.deviceBindingId);

    await this.runtimeProjection.projectForVehicle(row.organizationId, row.vehicleId);
  }

  private async processAlertResolvePrepared(row: ResolutionOutboxRow): Promise<void> {
    const payload = (row.payload ?? {}) as Record<string, unknown>;
    const recoverySource = String(payload.recoverySource ?? 'snapshot_obd');

    const episode = await this.outboxRepo.loadEpisodeForOutbox({
      organizationId: row.organizationId,
      vehicleId: row.vehicleId,
      episodeId: row.episodeId,
    });
    if (!episode) {
      throw new Error(`Episode ${row.episodeId} not found for alert resolution`);
    }

    if (!episode.resolutionEvidenceAt) {
      throw new Error(
        `Episode ${row.episodeId} missing resolutionEvidenceAt for alert resolution`,
      );
    }

    const label =
      [episode.vehicle.make, episode.vehicle.model].filter(Boolean).join(' ').trim() ||
      row.vehicleId;

    await this.connectivityAlerts.onEpisodeRecovered({
      organizationId: row.organizationId,
      vehicleId: row.vehicleId,
      provider: episode.provider,
      deviceBindingId: episode.deviceBindingId,
      episodeId: episode.id,
      stateVersion: episode.stateVersion,
      recoverySource: this.resolveRecoverySource(recoverySource),
      resolutionMethod: episode.resolutionMethod,
      label,
      licensePlate: episode.vehicle.licensePlate,
      observedAt: episode.resolutionEvidenceAt,
    });
  }

  private resolveRecoverySource(source: string): DeviceRecoverySource {
    switch (source) {
      case 'plug_webhook':
      case 'explicit_plug_webhook':
        return 'plug_webhook';
      case 'telemetry_resumed':
        return 'telemetry_resumed';
      case 'duplicate_recovery':
        return 'duplicate_recovery';
      case 'binding_change':
        return 'binding_change';
      default:
        return 'snapshot_obd';
    }
  }

  private async handleProcessingFailure(
    row: ResolutionOutboxRow,
    err: unknown,
  ): Promise<ResolutionOutboxProcessOutcome> {
    const outboxId = row.id;
    const errorCode = resolveOutboxErrorCode(err);
    const errorMessage = resolveOutboxErrorMessage(err);
    const attempts = row.processingAttempts;

    if (attempts >= this.config.maxAttempts) {
      await this.outboxRepo.markDeadLetter(outboxId, { errorCode, errorMessage });
      this.logger.error(
        `Resolution outbox ${outboxId} dead-lettered after ${attempts} attempts: ${errorMessage}`,
      );
      return 'dead_letter';
    }

    const nextRetryAt = new Date(
      Date.now() + computeOutboxBackoffMs(this.config.baseBackoffMs, attempts),
    );
    await this.outboxRepo.markRetryableFailed(outboxId, {
      errorCode,
      errorMessage,
      nextRetryAt,
    });
    this.logger.warn(
      `Resolution outbox ${outboxId} failed (attempt ${attempts}), retry at ${nextRetryAt.toISOString()}: ${errorMessage}`,
    );
    return 'retry_scheduled';
  }
}
