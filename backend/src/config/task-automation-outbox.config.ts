import { registerAs } from '@nestjs/config';

export default registerAs('taskAutomationOutbox', () => ({
  enabled: process.env.TASK_AUTOMATION_OUTBOX_ENABLED !== 'false',
  maxAttempts: parseInt(process.env.TASK_AUTOMATION_OUTBOX_MAX_ATTEMPTS ?? '5', 10),
  backoffMs: parseInt(process.env.TASK_AUTOMATION_OUTBOX_BACKOFF_MS ?? '60000', 10),
  pollBatchSize: parseInt(process.env.TASK_AUTOMATION_OUTBOX_POLL_BATCH ?? '50', 10),
  jobAttempts: parseInt(process.env.TASK_AUTOMATION_OUTBOX_JOB_ATTEMPTS ?? '5', 10),
  jobBackoffMs: parseInt(process.env.TASK_AUTOMATION_OUTBOX_JOB_BACKOFF_MS ?? '30000', 10),
}));
