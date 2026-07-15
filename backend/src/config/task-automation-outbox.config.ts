import { registerAs } from '@nestjs/config';

function resolveOutboxEnabled(): boolean {
  const explicit = process.env.TASK_AUTOMATION_OUTBOX_ENABLED;
  if (explicit === 'false') {
    const nodeEnv = process.env.NODE_ENV || 'development';
    if (nodeEnv === 'production') {
      console.error(
        '[task-automation-outbox] TASK_AUTOMATION_OUTBOX_ENABLED=false is not permitted in production; outbox remains enabled.',
      );
      return true;
    }
    return false;
  }
  return explicit !== '0';
}

export default registerAs('taskAutomationOutbox', () => ({
  enabled: resolveOutboxEnabled(),
  maxAttempts: parseInt(process.env.TASK_AUTOMATION_OUTBOX_MAX_ATTEMPTS ?? '5', 10),
  backoffMs: parseInt(process.env.TASK_AUTOMATION_OUTBOX_BACKOFF_MS ?? '60000', 10),
  pollBatchSize: parseInt(process.env.TASK_AUTOMATION_OUTBOX_POLL_BATCH ?? '50', 10),
  jobAttempts: parseInt(process.env.TASK_AUTOMATION_OUTBOX_JOB_ATTEMPTS ?? '5', 10),
  jobBackoffMs: parseInt(process.env.TASK_AUTOMATION_OUTBOX_JOB_BACKOFF_MS ?? '30000', 10),
  processingStaleMs: parseInt(
    process.env.TASK_AUTOMATION_OUTBOX_PROCESSING_STALE_MS ?? '300000',
    10,
  ),
}));
