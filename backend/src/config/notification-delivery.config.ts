import { registerAs } from '@nestjs/config';

export default registerAs('notificationDelivery', () => ({
  enabled: process.env.NOTIFICATIONS_DELIVERY_ENABLED === 'true',
  maxAttempts: parseInt(process.env.NOTIFICATIONS_DELIVERY_MAX_ATTEMPTS ?? '5', 10),
  backoffMs: parseInt(process.env.NOTIFICATIONS_DELIVERY_BACKOFF_MS ?? '60000', 10),
  pollBatchSize: parseInt(process.env.NOTIFICATIONS_DELIVERY_POLL_BATCH ?? '50', 10),
  quietHoursStart: process.env.NOTIFICATION_QUIET_HOURS_START ?? '22:00',
  quietHoursEnd: process.env.NOTIFICATION_QUIET_HOURS_END ?? '07:00',
  digestHourLocal: parseInt(process.env.NOTIFICATION_DIGEST_HOUR_LOCAL ?? '8', 10),
  jobAttempts: parseInt(process.env.NOTIFICATIONS_DELIVERY_JOB_ATTEMPTS ?? '5', 10),
  jobBackoffMs: parseInt(process.env.NOTIFICATIONS_DELIVERY_JOB_BACKOFF_MS ?? '30000', 10),
}));
