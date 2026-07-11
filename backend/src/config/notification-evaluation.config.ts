import { registerAs } from '@nestjs/config';

export default registerAs('notificationEvaluation', () => ({
  /** Master switch for BullMQ-backed notification evaluation jobs. */
  queueEnabled: process.env.NOTIFICATION_EVALUATION_QUEUE_ENABLED !== 'false',
  debounceWindowMs: parseInt(process.env.NOTIFICATION_EVALUATION_DEBOUNCE_MS || '120000', 10),
  /** Org-scoped distributed lock TTL — extended on heartbeat during long runs. */
  lockTtlMs: parseInt(process.env.NOTIFICATION_EVALUATION_LOCK_TTL_MS || '300000', 10),
  lockHeartbeatMs: parseInt(process.env.NOTIFICATION_EVALUATION_LOCK_HEARTBEAT_MS || '60000', 10),
  jobAttempts: parseInt(process.env.NOTIFICATION_EVALUATION_JOB_ATTEMPTS || '4', 10),
  jobBackoffMs: parseInt(process.env.NOTIFICATION_EVALUATION_JOB_BACKOFF_MS || '5000', 10),
  /** Boot stagger — avoids thundering herd after deploy. */
  bootStaggerMs: parseInt(process.env.NOTIFICATION_EVALUATION_BOOT_STAGGER_MS || '15000', 10),
}));
