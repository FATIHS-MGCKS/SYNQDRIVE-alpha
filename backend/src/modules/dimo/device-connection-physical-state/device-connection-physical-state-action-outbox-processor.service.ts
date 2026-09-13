import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigType } from '@nestjs/config';
import { DeviceConnectionPhysicalStateActionOutboxStatus } from '@prisma/client';
import deviceConnectionPhysicalStateActionOutboxConfig from '@config/device-connection-physical-state-action-outbox.config';
import {
  computePhysicalStateActionOutboxBackoffMs,
  DeviceConnectionPhysicalStateActionOutboxRepository,
  type PhysicalStateActionOutboxClaimedRow,
} from './device-connection-physical-state-action-outbox.repository';

export type PhysicalStateActionOutboxProcessOutcome =
  | 'completed'
  | 'retry_scheduled'
  | 'dead_letter'
  | 'ownership_lost'
  | 'skipped';

export type PhysicalStateActionOutboxProcessorTestSeam = {
  beforeAck?: () => Promise<void> | void;
  throwOnAck?: boolean | (() => Error);
};

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

  async processOutboxId(
    outboxId: string,
    testSeam?: PhysicalStateActionOutboxProcessorTestSeam,
  ): Promise<PhysicalStateActionOutboxProcessOutcome> {
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

    return this.acknowledgeClaimedRow(claimed, testSeam);
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
      if (!row.processingClaimToken || !row.processingLeaseExpiresAt) continue;
      const released = await this.outboxRepo.releaseExpiredLease(
        row.id,
        row.processingClaimToken,
        staleBefore,
        new Date(),
      );
      if (released.updated) recovered += 1;
    }
    return recovered;
  }

  private async acknowledgeClaimedRow(
    row: PhysicalStateActionOutboxClaimedRow,
    testSeam?: PhysicalStateActionOutboxProcessorTestSeam,
  ): Promise<PhysicalStateActionOutboxProcessOutcome> {
    try {
      if (testSeam?.beforeAck) {
        await testSeam.beforeAck();
      }

      if (testSeam?.throwOnAck) {
        const error =
          typeof testSeam.throwOnAck === 'function'
            ? testSeam.throwOnAck()
            : new Error('processor_test_seam_throw_on_ack');
        throw error;
      }

      // P2.1: no episode/alert/notification side effects — row lifecycle only.
      const ack = await this.outboxRepo.markCompleted(row.id, row.processingClaimToken);
      if (!ack.updated) return 'ownership_lost';
      return 'completed';
    } catch (error) {
      return this.handleProcessingFailure(row, error);
    }
  }

  private async handleProcessingFailure(
    row: PhysicalStateActionOutboxClaimedRow,
    error: unknown,
  ): Promise<PhysicalStateActionOutboxProcessOutcome> {
    const errorCode = error instanceof Error ? error.name : 'processing_error';
    const errorMessage = error instanceof Error ? error.message : String(error);

    if (row.processingAttempts >= this.config.maxAttempts) {
      const deadLetter = await this.outboxRepo.markDeadLetter(row.id, row.processingClaimToken, {
        errorCode,
        errorMessage,
      });
      if (!deadLetter.updated) return 'ownership_lost';
      this.logger.warn(
        `physical_state_action_outbox dead_letter id=${row.id} attempts=${row.processingAttempts}`,
      );
      return 'dead_letter';
    }

    const nextRetryAt = new Date(
      Date.now() +
        computePhysicalStateActionOutboxBackoffMs(
          this.config.baseBackoffMs,
          row.processingAttempts,
        ),
    );
    const retry = await this.outboxRepo.markRetryableFailed(row.id, row.processingClaimToken, {
      errorCode,
      errorMessage,
      nextRetryAt,
    });
    if (!retry.updated) return 'ownership_lost';
    return 'retry_scheduled';
  }
}
