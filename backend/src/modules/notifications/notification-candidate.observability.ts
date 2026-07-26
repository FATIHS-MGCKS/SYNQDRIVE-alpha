import type { NotificationCandidate } from './notification.types';

export interface NotificationCandidateRejectionContext {
  field: string;
  reason: string;
  eventType?: string;
  organizationId?: string;
  sourceSystem?: string;
}

type RejectionMetricHook = (ctx: NotificationCandidateRejectionContext) => void;

let rejectionMetricHook: RejectionMetricHook | undefined;

/** Wired from NotificationsModule on bootstrap to increment Prometheus counters. */
export function bindNotificationCandidateRejectionMetric(hook: RejectionMetricHook): void {
  rejectionMetricHook = hook;
}

export function clearNotificationCandidateRejectionMetric(): void {
  rejectionMetricHook = undefined;
}

export function logNotificationCandidateRejection(
  ctx: NotificationCandidateRejectionContext,
  candidate?: Partial<NotificationCandidate>,
): void {
  const payload = {
    level: 'error',
    component: 'notification-candidate',
    field: ctx.field,
    reason: ctx.reason,
    eventType: ctx.eventType ?? candidate?.eventType,
    organizationId: ctx.organizationId ?? candidate?.organizationId,
    sourceSystem: ctx.sourceSystem ?? candidate?.sourceSystem ?? candidate?.sourceType,
    nodeEnv: process.env.NODE_ENV ?? 'unknown',
  };

  if (process.env.NODE_ENV === 'production') {
    console.error(JSON.stringify(payload));
  }

  rejectionMetricHook?.({
    field: ctx.field,
    reason: ctx.reason,
    eventType: payload.eventType,
    organizationId: payload.organizationId,
    sourceSystem: payload.sourceSystem,
  });
}
