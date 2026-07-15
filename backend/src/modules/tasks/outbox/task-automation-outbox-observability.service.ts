import { Injectable, Logger } from '@nestjs/common';
import { TripMetricsService } from '@modules/observability/trip-metrics.service';

export interface TaskAutomationOutboxLogEvent {
  organizationId: string;
  ruleId: string;
  entityType: string;
  entityId: string;
  operation: string;
  outboxId?: string;
  attempts?: number;
  errorCode?: string;
}

@Injectable()
export class TaskAutomationOutboxObservabilityService {
  private readonly logger = new Logger(TaskAutomationOutboxObservabilityService.name);

  constructor(private readonly metrics: TripMetricsService) {}

  log(event: TaskAutomationOutboxLogEvent): void {
    this.logger.log({
      msg: `task.automation.outbox.${event.operation}`,
      ...event,
    });
  }

  logWarn(event: TaskAutomationOutboxLogEvent): void {
    this.logger.warn({
      msg: `task.automation.outbox.${event.operation}`,
      ...event,
    });
  }

  recordEnqueued(ruleId: string): void {
    this.metrics.taskAutomationOutboxEnqueued.inc({ rule_id: ruleId });
  }

  recordCompleted(ruleId: string): void {
    this.metrics.taskAutomationOutboxCompleted.inc({ rule_id: ruleId });
  }

  recordFailed(ruleId: string, errorCode: string): void {
    this.metrics.taskAutomationOutboxFailed.inc({ rule_id: ruleId, error_code: errorCode });
  }

  recordRetry(ruleId: string): void {
    this.metrics.taskAutomationOutboxRetry.inc({ rule_id: ruleId });
  }

  recordRefreshed(): void {
    this.metrics.taskAutomationOutboxRefreshed.inc();
  }

  setQueueBacklog(count: number): void {
    this.metrics.taskAutomationOutboxBacklog.set(count);
  }

  observeProcessingDuration(seconds: number): void {
    this.metrics.taskAutomationOutboxProcessingDuration.observe(seconds);
  }
}
