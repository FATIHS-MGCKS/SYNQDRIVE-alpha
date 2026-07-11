import { JobsOptions } from 'bullmq';
import { ConfigType } from '@nestjs/config';
import notificationDeliveryConfig from '@config/notification-delivery.config';

export const NOTIFICATION_DELIVERY_JOB_NAME = 'deliver';

export function buildDeliveryJobId(outboxId: string): string {
  return `notification-delivery:${outboxId}`;
}

export function buildDeliveryJobOptions(
  config: ConfigType<typeof notificationDeliveryConfig>,
  outboxId: string,
): JobsOptions {
  return {
    jobId: buildDeliveryJobId(outboxId),
    attempts: config.jobAttempts,
    backoff: {
      type: 'exponential',
      delay: config.jobBackoffMs,
    },
    removeOnComplete: true,
    removeOnFail: { count: 200, age: 7 * 24 * 3600 },
  };
}
