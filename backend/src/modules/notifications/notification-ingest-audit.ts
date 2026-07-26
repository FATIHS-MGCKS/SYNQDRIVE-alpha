import type { Logger } from '@nestjs/common';
import type { Notification } from '@prisma/client';
import type { MaterializeResult } from './notification-core.types';

export interface NotificationIngestAuditEvent {
  organizationId: string;
  eventType: string;
  fingerprint: string;
  sourceType: string;
  sourceRef: string;
  sourceEventId?: string;
  operation: MaterializeResult['operation'];
  notificationId?: string;
  occurrenceCount?: number;
  severity?: string;
  reason?: string;
  runId?: string;
}

/** Structured ingest audit trail — committed only after successful materialization. */
export function emitNotificationIngestAudit(
  logger: Logger,
  event: NotificationIngestAuditEvent,
): void {
  logger.log({
    msg: 'notification.ingest.audit',
    audit: true,
    ...event,
  });
}

export function auditFromMaterializeResult(
  notification: Notification,
  operation: MaterializeResult['operation'],
  extras: Omit<NotificationIngestAuditEvent, 'operation' | 'notificationId' | 'occurrenceCount' | 'severity'>,
  reason?: string,
): NotificationIngestAuditEvent {
  return {
    ...extras,
    operation,
    notificationId: notification.id,
    occurrenceCount: notification.occurrenceCount,
    severity: notification.severity,
    ...(reason ? { reason } : {}),
  };
}
