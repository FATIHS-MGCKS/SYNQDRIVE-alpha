import { Inject, Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigType } from '@nestjs/config';
import { WorkflowEventOutboxStatus } from '@prisma/client';
import workflowEventOutboxConfig from '@config/workflow-event-outbox.config';
import { WorkflowEventOutboxRepository } from './workflow-event-outbox.repository';
import { WorkflowEventOutboxDispatchService } from './workflow-event-outbox-dispatch.service';
import { WorkflowEventOutboxObservabilityService } from './workflow-event-outbox-observability.service';
import { resolveWorkflowEventOutboxWorkerId } from './workflow-event-outbox-worker-id.util';
import {
  classifyProcessingError,
  computeWorkflowOutboxBackoffMs,
  shouldRetryErrorClass,
} from './workflow-event-outbox-error.util';

export type WorkflowEventOutboxProcessOutcome =
  | 'dispatched'
  | 'retry_scheduled'
  | 'dead_letter'
  | 'skipped';

@Injectable()
export class WorkflowEventOutboxProcessorService implements OnModuleDestroy {
  private readonly logger = new Logger(WorkflowEventOutboxProcessorService.name);
  private readonly workerId = resolveWorkflowEventOutboxWorkerId();
  private inFlight = 0;
  private shuttingDown = false;

  constructor(
    @Inject(workflowEventOutboxConfig.KEY)
    private readonly config: ConfigType<typeof workflowEventOutboxConfig>,
    private readonly outboxRepo: WorkflowEventOutboxRepository,
    private readonly dispatchService: WorkflowEventOutboxDispatchService,
    private readonly observability: WorkflowEventOutboxObservabilityService,
  ) {}

  getWorkerId(): string {
    return this.workerId;
  }

  isShuttingDown(): boolean {
    return this.shuttingDown;
  }

  getInFlightCount(): number {
    return this.inFlight;
  }

  async onModuleDestroy(): Promise<void> {
    this.shuttingDown = true;
    const deadline = Date.now() + this.config.shutdownDrainMs;
    while (this.inFlight > 0 && Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    if (this.inFlight > 0) {
      this.logger.warn(
        `Workflow event outbox shutdown drain timed out with ${this.inFlight} in-flight item(s)`,
      );
    }
  }

  async processOutboxId(outboxId: string): Promise<WorkflowEventOutboxProcessOutcome> {
    if (this.shuttingDown) return 'skipped';

    const existing = await this.outboxRepo.findById(outboxId);
    if (!existing) return 'skipped';
    if (existing.status === WorkflowEventOutboxStatus.DISPATCHED) return 'skipped';
    if (existing.status === WorkflowEventOutboxStatus.DEAD_LETTER) return 'skipped';

    const claimed = await this.outboxRepo.claimForProcessing(
      outboxId,
      this.workerId,
      this.config.leaseMs,
    );
    if (!claimed) return 'skipped';

    this.inFlight += 1;
    const heartbeat = this.startLeaseHeartbeat(claimed.id);
    const started = Date.now();

    this.observability.log({
      organizationId: claimed.organizationId,
      eventType: claimed.eventType,
      eventId: claimed.eventId,
      correlationId: claimed.correlationId,
      operation: 'process_started',
      outboxId: claimed.id,
      workerId: this.workerId,
      attempts: claimed.attemptCount,
    });

    try {
      const runIds = await this.dispatchService.dispatchClaimedRow(claimed);
      await this.outboxRepo.markDispatched(claimed.id, runIds);

      const durationSec = (Date.now() - started) / 1000;
      this.observability.observeProcessingDuration(durationSec);
      this.observability.recordDispatched(claimed.eventType);
      this.observability.log({
        organizationId: claimed.organizationId,
        eventType: claimed.eventType,
        eventId: claimed.eventId,
        correlationId: claimed.correlationId,
        operation: 'dispatched',
        outboxId: claimed.id,
        workerId: this.workerId,
        attempts: claimed.attemptCount,
      });
      return 'dispatched';
    } catch (err: unknown) {
      return this.handleFailure(claimed, err);
    } finally {
      clearInterval(heartbeat);
      this.inFlight -= 1;
    }
  }

  async recoverExpiredClaims(): Promise<string[]> {
    const staleBefore = new Date();
    const rows = await this.outboxRepo.findExpiredClaimsBatch(
      staleBefore,
      this.config.pollBatchSize,
    );
    const recovered: string[] = [];
    for (const row of rows) {
      const released = await this.outboxRepo.releaseExpiredClaim(row.id, staleBefore);
      if (released) recovered.push(row.id);
    }
    return recovered;
  }

  private startLeaseHeartbeat(outboxId: string): NodeJS.Timeout {
    return setInterval(() => {
      void this.outboxRepo
        .renewLease(outboxId, this.workerId, this.config.leaseMs)
        .catch((err: unknown) => {
          const message = err instanceof Error ? err.message : String(err);
          this.logger.warn(`Lease heartbeat failed for outbox ${outboxId}: ${message}`);
        });
    }, this.config.heartbeatMs);
  }

  private async handleFailure(
    claimed: NonNullable<Awaited<ReturnType<WorkflowEventOutboxRepository['claimForProcessing']>>>,
    err: unknown,
  ): Promise<WorkflowEventOutboxProcessOutcome> {
    const { errorClass, errorCode, message } = classifyProcessingError(err);
    const retryable = shouldRetryErrorClass(errorClass);
    const attempts = claimed.attemptCount;

    if (!retryable || attempts >= this.config.maxAttempts) {
      await this.outboxRepo.markDeadLetter(claimed.id, {
        errorCode,
        errorSummary: message,
      });
      this.observability.recordDeadLetter(claimed.eventType);
      this.observability.recordFailed(claimed.eventType, errorClass, errorCode);
      this.observability.logError({
        organizationId: claimed.organizationId,
        eventType: claimed.eventType,
        eventId: claimed.eventId,
        correlationId: claimed.correlationId,
        operation: 'dead_letter',
        outboxId: claimed.id,
        workerId: this.workerId,
        attempts,
        errorClass,
        errorCode,
      });
      return 'dead_letter';
    }

    const retryAt = new Date(
      Date.now()
        + computeWorkflowOutboxBackoffMs(
          this.config.baseBackoffMs,
          this.config.maxBackoffMs,
          this.config.jitterMs,
          attempts,
        ),
    );
    await this.outboxRepo.markRetryScheduled(claimed.id, {
      errorCode,
      errorSummary: message,
      retryAt,
    });
    this.observability.recordRetry(claimed.eventType);
    this.observability.recordFailed(claimed.eventType, errorClass, errorCode);
    this.observability.logWarn({
      organizationId: claimed.organizationId,
      eventType: claimed.eventType,
      eventId: claimed.eventId,
      correlationId: claimed.correlationId,
      operation: 'retry_scheduled',
      outboxId: claimed.id,
      workerId: this.workerId,
      attempts,
      errorClass,
      errorCode,
    });
    return 'retry_scheduled';
  }
}
