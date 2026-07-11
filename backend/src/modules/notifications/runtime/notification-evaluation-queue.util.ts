import { JobsOptions } from 'bullmq';
import { ConfigType } from '@nestjs/config';
import notificationEvaluationConfig from '@config/notification-evaluation.config';
import type { NotificationEvaluationTriggerClass } from './notification-evaluation.types';

export const NOTIFICATION_EVALUATION_JOB_NAME = 'evaluate';

export function buildNotificationEvaluationJobId(
  organizationId: string,
  triggerClass: NotificationEvaluationTriggerClass,
): string {
  return `notification-evaluation:${organizationId}:${triggerClass}`;
}

export function buildNotificationEvaluationJobOptions(
  config: ConfigType<typeof notificationEvaluationConfig>,
  organizationId: string,
  triggerClass: NotificationEvaluationTriggerClass,
  delayMs = 0,
): JobsOptions {
  return {
    jobId: buildNotificationEvaluationJobId(organizationId, triggerClass),
    delay: delayMs,
    attempts: config.jobAttempts,
    backoff: {
      type: 'exponential',
      delay: config.jobBackoffMs,
    },
    removeOnComplete: { count: 500, age: 24 * 3600 },
    removeOnFail: { count: 2000, age: 7 * 24 * 3600 },
  };
}

export const PENDING_EVENTS_KEY_PREFIX = 'notification:eval:pending:';
export const FOLLOW_UP_KEY_PREFIX = 'notification:eval:followup:';

export function pendingEventsKey(organizationId: string): string {
  return `${PENDING_EVENTS_KEY_PREFIX}${organizationId}`;
}

export function followUpKey(organizationId: string): string {
  return `${FOLLOW_UP_KEY_PREFIX}${organizationId}`;
}
