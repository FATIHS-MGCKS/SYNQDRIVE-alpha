import { Inject, Injectable, forwardRef } from '@nestjs/common';
import { ConfigType } from '@nestjs/config';
import taskAutomationOutboxConfig from '@config/task-automation-outbox.config';
import { TaskAutomationOutboxRepository } from './task-automation-outbox.repository';
import { TaskAutomationOutboxSchedulerService } from './task-automation-outbox-scheduler.service';
import { TaskAutomationOutboxObservabilityService } from './task-automation-outbox-observability.service';
import type { TaskAutomationOutboxMeta } from './task-automation-outbox.types';
import { sanitizeAutomationError } from './task-automation-outbox-error.util';

@Injectable()
export class TaskAutomationOutboxEnqueueService {
  constructor(
    @Inject(taskAutomationOutboxConfig.KEY)
    private readonly config: ConfigType<typeof taskAutomationOutboxConfig>,
    private readonly outboxRepo: TaskAutomationOutboxRepository,
    @Inject(forwardRef(() => TaskAutomationOutboxSchedulerService))
    private readonly scheduler: TaskAutomationOutboxSchedulerService,
    private readonly observability: TaskAutomationOutboxObservabilityService,
  ) {}

  isEnabled(): boolean {
    return this.config.enabled;
  }

  async enqueueFailure(meta: TaskAutomationOutboxMeta, err: unknown): Promise<string | null> {
    if (!this.isEnabled()) return null;

    const row = await this.outboxRepo.enqueueOrRefresh({
      ...meta,
      lastError: sanitizeAutomationError(err),
    });

    const refreshed = row.attempts > 0 && row.status === 'PENDING';
    if (refreshed) {
      this.observability.recordRefreshed();
    } else {
      this.observability.recordEnqueued(meta.ruleId);
    }

    this.observability.logWarn({
      organizationId: meta.organizationId,
      ruleId: meta.ruleId,
      entityType: meta.entityType,
      entityId: meta.entityId,
      operation: 'enqueued',
      outboxId: row.id,
      errorCode: 'AUTOMATION_FAILED',
    });

    void this.scheduler.scheduleOutboxIds([row.id]);
    return row.id;
  }
}
