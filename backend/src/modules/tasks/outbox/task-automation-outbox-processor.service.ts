import { Inject, Injectable } from '@nestjs/common';
import { ConfigType } from '@nestjs/config';
import taskAutomationOutboxConfig from '@config/task-automation-outbox.config';
import { TaskAutomationOutboxRepository } from './task-automation-outbox.repository';
import { TaskAutomationOutboxExecutorService } from './task-automation-outbox-executor.service';
import { TaskAutomationOutboxObservabilityService } from './task-automation-outbox-observability.service';
import { sanitizeAutomationError } from './task-automation-outbox-error.util';

@Injectable()
export class TaskAutomationOutboxProcessorService {
  constructor(
    @Inject(taskAutomationOutboxConfig.KEY)
    private readonly config: ConfigType<typeof taskAutomationOutboxConfig>,
    private readonly outboxRepo: TaskAutomationOutboxRepository,
    private readonly executor: TaskAutomationOutboxExecutorService,
    private readonly observability: TaskAutomationOutboxObservabilityService,
  ) {}

  async processOutboxId(
    outboxId: string,
  ): Promise<'completed' | 'retry' | 'dead_letter' | 'skipped'> {
    const started = Date.now();
    const claimed = await this.outboxRepo.claimForProcessing(outboxId);
    if (!claimed) return 'skipped';

    this.observability.log({
      organizationId: claimed.organizationId,
      ruleId: claimed.ruleId,
      entityType: claimed.entityType,
      entityId: claimed.entityId,
      operation: 'process_started',
      outboxId: claimed.id,
      attempts: claimed.attempts,
    });

    try {
      await this.executor.execute(claimed);
      await this.outboxRepo.markCompleted(claimed.id);
      const durationSec = (Date.now() - started) / 1000;
      this.observability.observeProcessingDuration(durationSec);
      this.observability.recordCompleted(claimed.ruleId);
      this.observability.log({
        organizationId: claimed.organizationId,
        ruleId: claimed.ruleId,
        entityType: claimed.entityType,
        entityId: claimed.entityId,
        operation: 'completed',
        outboxId: claimed.id,
        attempts: claimed.attempts,
      });
      return 'completed';
    } catch (err: unknown) {
      const errorMessage = sanitizeAutomationError(err);
      const errorCode = err instanceof Error ? err.name : 'UNKNOWN';

      if (claimed.attempts >= this.config.maxAttempts) {
        await this.outboxRepo.markDeadLetter(claimed.id, errorMessage);
        this.observability.recordFailed(claimed.ruleId, errorCode);
        this.observability.logWarn({
          organizationId: claimed.organizationId,
          ruleId: claimed.ruleId,
          entityType: claimed.entityType,
          entityId: claimed.entityId,
          operation: 'dead_letter',
          outboxId: claimed.id,
          attempts: claimed.attempts,
          errorCode,
        });
        return 'dead_letter';
      }

      const retryAt = new Date(
        Date.now() + this.config.backoffMs * Math.pow(2, Math.max(0, claimed.attempts - 1)),
      );
      await this.outboxRepo.markRetry(claimed.id, errorMessage, retryAt);
      this.observability.recordRetry(claimed.ruleId);
      this.observability.recordFailed(claimed.ruleId, errorCode);
      this.observability.logWarn({
        organizationId: claimed.organizationId,
        ruleId: claimed.ruleId,
        entityType: claimed.entityType,
        entityId: claimed.entityId,
        operation: 'retry_scheduled',
        outboxId: claimed.id,
        attempts: claimed.attempts,
        errorCode,
      });
      return 'retry';
    }
  }
}
