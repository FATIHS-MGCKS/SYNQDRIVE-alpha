import { toSafeMetricLabel } from '../compliance/notification-data-minimization';

/** Short stable org reference for logs — never use as Prometheus label. */
export function toOrganizationLogRef(organizationId: string): string {
  return organizationId.slice(0, 8);
}

export type NotificationObservabilityResult = 'success' | 'error' | 'ignored' | 'skipped';

export interface NotificationStructuredLogFields {
  msg: string;
  correlationId?: string;
  organizationRef: string;
  eventType?: string;
  notificationId?: string;
  action: string;
  result: NotificationObservabilityResult;
  latencyMs?: number;
  errorCode?: string;
  domain?: string;
  channel?: string;
  deliveryId?: string;
  triggerClass?: string;
}

export function buildNotificationLogFields(input: {
  msg: string;
  organizationId: string;
  action: string;
  result: NotificationObservabilityResult;
  correlationId?: string;
  eventType?: string;
  notificationId?: string;
  latencyMs?: number;
  errorCode?: string;
  domain?: string;
  channel?: string;
  deliveryId?: string;
  triggerClass?: string;
}): NotificationStructuredLogFields {
  return {
    msg: input.msg,
    correlationId: input.correlationId,
    organizationRef: toOrganizationLogRef(input.organizationId),
    eventType: input.eventType ? toSafeMetricLabel(input.eventType) : undefined,
    notificationId: input.notificationId,
    action: toSafeMetricLabel(input.action),
    result: input.result,
    latencyMs: input.latencyMs,
    errorCode: input.errorCode ? toSafeMetricLabel(input.errorCode) : undefined,
    domain: input.domain ? toSafeMetricLabel(input.domain) : undefined,
    channel: input.channel ? toSafeMetricLabel(input.channel) : undefined,
    deliveryId: input.deliveryId,
    triggerClass: input.triggerClass ? toSafeMetricLabel(input.triggerClass) : undefined,
  };
}
