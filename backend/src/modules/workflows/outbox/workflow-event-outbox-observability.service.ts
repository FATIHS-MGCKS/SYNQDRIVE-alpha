import { Injectable, Logger } from '@nestjs/common';
import { TripMetricsService } from '@modules/observability/trip-metrics.service';
import type { WorkflowEventOutboxErrorClass } from './workflow-event-outbox-error.util';

export interface WorkflowEventOutboxLogEvent {
  organizationId: string;
  eventType: string;
  eventId: string;
  correlationId: string;
  operation: string;
  outboxId?: string;
  workerId?: string;
  attempts?: number;
  errorClass?: WorkflowEventOutboxErrorClass;
  errorCode?: string;
  actorUserId?: string;
}

@Injectable()
export class WorkflowEventOutboxObservabilityService {
  private readonly logger = new Logger(WorkflowEventOutboxObservabilityService.name);

  constructor(private readonly metrics: TripMetricsService) {}

  log(event: WorkflowEventOutboxLogEvent): void {
    this.logger.log({
      msg: `workflow.event.outbox.${event.operation}`,
      ...event,
    });
  }

  logWarn(event: WorkflowEventOutboxLogEvent): void {
    this.logger.warn({
      msg: `workflow.event.outbox.${event.operation}`,
      ...event,
    });
  }

  logError(event: WorkflowEventOutboxLogEvent): void {
    this.logger.error({
      msg: `workflow.event.outbox.${event.operation}`,
      ...event,
    });
  }

  recordDispatched(eventType: string): void {
    this.metrics.workflowEventOutboxDispatched.inc({ event_type: eventType });
  }

  recordFailed(eventType: string, errorClass: WorkflowEventOutboxErrorClass, errorCode: string): void {
    this.metrics.workflowEventOutboxFailed.inc({
      event_type: eventType,
      error_class: errorClass,
      error_code: errorCode,
    });
  }

  recordRetry(eventType: string): void {
    this.metrics.workflowEventOutboxRetry.inc({ event_type: eventType });
  }

  recordDeadLetter(eventType: string): void {
    this.metrics.workflowEventOutboxDeadLetter.inc({ event_type: eventType });
  }

  setQueueLag(count: number): void {
    this.metrics.workflowEventOutboxQueueLag.set(count);
  }

  observeProcessingDuration(seconds: number): void {
    this.metrics.workflowEventOutboxProcessingDuration.observe(seconds);
  }
}
