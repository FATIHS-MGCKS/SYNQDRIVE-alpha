import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigType } from '@nestjs/config';
import { DeviceConnectionPhysicalStateActionOutboxStatus } from '@prisma/client';
import deviceConnectionPhysicalStateActionOutboxConfig from '@config/device-connection-physical-state-action-outbox.config';
import {
  computePhysicalStateActionOutboxBackoffMs,
  DeviceConnectionPhysicalStateActionOutboxRepository,
} from './device-connection-physical-state-action-outbox.repository';

export type PhysicalStateActionOutboxProcessOutcome =
  | 'completed'
  | 'retry_scheduled'
  | 'dead_letter'
  | 'skipped';

/**
 * P2.1 skeleton processor — manages outbox row lifecycle only.
 * P2.6 owns episode/alert external effect execution.
 */
@Injectable()
export class DeviceConnectionPhysicalStateActionOutboxProcessorService {
  private readonly logger = new Logger(
    DeviceConnectionPhysicalStateActionOutboxProcessorService.name,
  );

  constructor(
    @Inject(deviceConnectionPhysicalStateActionOutboxConfig.KEY)
    private readonly config: ConfigType<typeof deviceConnectionPhysicalStateActionOutboxConfig>,
    private readonly outboxRepo: DeviceConnectionPhysicalStateActionOutboxRepository,
  ) {}

  async processOutboxId(outboxId: string): Promise<PhysicalStateActionOutboxProcessOutcome> {
    const existing = await this.outboxRepo.findById(outboxId);
    if (!existing) return 'skipped';

    if (existing.status === DeviceConnectionPhysicalStateActionOutboxStatus.COMPLETED) {
      return 'skipped';
    }

    if (
      existing.status === DeviceConnectionPhysicalStateActionOutboxStatus.DEAD_LETTER ||
      existing.status === DeviceConnectionPhysicalStateActionOutboxStatus.FAILED
    ) {
      return 'skipped';
    }

    const now = new Date();
    const leaseExpiresAt = new Date(now.getTime() + this.config.processingLeaseMs);
    const claimed = await this.outboxRepo.claimForProcessing(outboxId, now, leaseExpiresAt);
    if (!claimed) return 'skipped';

    return this.acknowledgeClaimedRow(claimed);
  }

  async processPendingBatch(limit = this.config.pollBatchSize): Promise<number> {
    const now = new Date();
    const leaseExpiresAt = new Date(now.getTime() + this.config.processingLeaseMs);
    const claimed = await this.outboxRepo.claimBatchWithSkipLocked(limit, now, leaseExpiresAt);
    let completed = 0;
    for (const row of claimed) {
      const outcome = await this.acknowledgeClaimedRow(row);
      if (outcome === 'completed') completed += 1;
    }
    return completed;
  }

  async recoverExpiredLeases(): Promise<number> {
    const staleBefore = new Date(Date.now() - this.config.processingStaleMs);
    const rows = await this.outboxRepo.findStaleProcessingBatch(
      staleBefore,
      this.config.pollBatchSize,
    );
    let recovered = 0;
    for (const row of rows) {
      const released = await this.outboxRepo.releaseExpiredLease(row.id, new Date());
      if (released) recovered += 1;
    }
    return recovered;
  }

  private async acknowledgeClaimedRow(
    row: Awaited<ReturnType<DeviceConnectionPhysicalStateActionOutboxRepository['claimForProcessing']>>,
  ): Promise<PhysicalStateActionOutboxProcessOutcome> {
    if (!row) return 'skipped';

    try {
      // P2.1: no episode/alert/notification side effects — row lifecycle only.
      await this.outboxRepo.markCompleted(row.id);
      return 'completed';
    } catch (error) {
      return this.handleProcessingFailure(row.id, row.processingAttempts, error);
    }
  }

  private async handleProcessingFailure(
    outboxId: string,
    attempt: number,
    error: unknown,
  ): Promise<PhysicalStateActionOutboxProcessOutcome> {
    const errorCode = error instanceof Error ? error.name : 'processing_error';
    const errorMessage = error instanceof Error ? error.message : String(error);

    if (attempt >= this.config.maxAttempts) {
      await this.outboxRepo.markDeadLetter(outboxId, { errorCode, errorMessage });
      this.logger.warn(
        `physical_state_action_outbox dead_letter id=${outboxId} attempts=${attempt}`,
      );
      return 'dead_letter';
    }

    const nextRetryAt = new Date(
      Date.now() + computePhysicalStateActionOutboxBackoffMs(this.config.baseBackoffMs, attempt),
    );
    await this.outboxRepo.markRetryableFailed(outboxId, {
      errorCode,
      errorMessage,
      nextRetryAt,
    });
    return 'retry_scheduled';
  }
}
