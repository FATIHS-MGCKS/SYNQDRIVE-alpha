import type { NotificationLifecycleEventType } from '@modules/workflows/workflow.constants';

/** Canonical workflow payload for notification lifecycle domain events. */
export interface NotificationLifecycleWorkflowPayload {
  organizationId: string;
  notificationId: string;
  fingerprint: string;
  lifecycleGeneration: number;
  reopenCount: number;
  /** Producer notification event type (e.g. INVOICE_OVERDUE). */
  eventType: string;
  entityType: string;
  entityId: string;
  severity: string;
  occurredAt: string;
  correlationId: string;
  /** Stable lifecycle transition id used for workflow run idempotency. */
  triggerEventId: string;
}

export interface NotificationLifecycleEmitInput {
  lifecycleEvent: NotificationLifecycleEventType;
  notification: {
    id: string;
    organizationId: string;
    fingerprint: string;
    lifecycleGeneration: number;
    reopenCount: number;
    eventType: string;
    entityType: string;
    entityId: string;
    severity: string;
  };
  occurredAt?: Date;
  correlationId?: string;
}
