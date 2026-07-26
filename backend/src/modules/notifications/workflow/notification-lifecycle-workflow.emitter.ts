import { Injectable, Logger, Optional } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { WorkflowEventService } from '@modules/workflows/workflow-event.service';
import type { NotificationLifecycleEventType } from '@modules/workflows/workflow.constants';
import type {
  NotificationLifecycleEmitInput,
  NotificationLifecycleWorkflowPayload,
} from './notification-lifecycle-workflow.types';
import { NotificationAuditService } from '../audit/notification-audit.service';
import { TripMetricsService } from '@modules/observability/trip-metrics.service';
import { recordNotificationWorkflowTriggered } from '../observability/notification-prometheus.metrics';

@Injectable()
export class NotificationLifecycleWorkflowEmitter {
  private readonly logger = new Logger(NotificationLifecycleWorkflowEmitter.name);

  constructor(
    @Optional() private readonly workflowEvents?: WorkflowEventService,
    @Optional() private readonly notificationAudit?: NotificationAuditService,
    @Optional() private readonly metrics?: TripMetricsService,
  ) {}

  emit(input: NotificationLifecycleEmitInput): void {
    if (!this.workflowEvents) return;

    const occurredAt = input.occurredAt ?? new Date();
    const correlationId = input.correlationId ?? randomUUID();
    const { notification, lifecycleEvent } = input;

    const idempotencyKey = this.buildIdempotencyKey(lifecycleEvent, notification);

    const payload: NotificationLifecycleWorkflowPayload = {
      organizationId: notification.organizationId,
      notificationId: notification.id,
      fingerprint: notification.fingerprint,
      lifecycleGeneration: notification.lifecycleGeneration,
      reopenCount: notification.reopenCount,
      eventType: notification.eventType,
      entityType: notification.entityType,
      entityId: notification.entityId,
      severity: notification.severity,
      occurredAt: occurredAt.toISOString(),
      correlationId,
      triggerEventId: idempotencyKey,
    };

    this.workflowEvents.scheduleEmit({
      organizationId: notification.organizationId,
      type: lifecycleEvent,
      entityType: notification.entityType,
      entityId: notification.entityId,
      idempotencyKey,
      occurredAt,
      payload: payload as unknown as Record<string, unknown>,
    });

    if (this.metrics) {
      recordNotificationWorkflowTriggered(this.metrics, lifecycleEvent);
    }

    this.notificationAudit?.recordFireAndForget({
      organizationId: notification.organizationId,
      notificationId: notification.id,
      eventType: 'WORKFLOW_TRIGGERED',
      actorType: 'WORKFLOW',
      correlationId,
      reasonCode: lifecycleEvent,
      nextState: {
        eventType: notification.eventType,
        severity: notification.severity,
        lifecycleGeneration: notification.lifecycleGeneration,
      },
    });

    this.logger.debug(
      `Workflow lifecycle event ${lifecycleEvent} for notification ${notification.id} gen=${notification.lifecycleGeneration}`,
    );
  }

  private buildIdempotencyKey(
    lifecycleEvent: NotificationLifecycleEventType,
    notification: NotificationLifecycleEmitInput['notification'],
  ): string {
    if (lifecycleEvent === 'notification.reopened') {
      return `${lifecycleEvent}:${notification.id}:reopen:${notification.reopenCount}`;
    }
    return `${lifecycleEvent}:${notification.id}:gen:${notification.lifecycleGeneration}`;
  }
}
