import { JobsOptions } from 'bullmq';
import { ConfigType } from '@nestjs/config';
import taskAutomationOutboxConfig from '@config/task-automation-outbox.config';

export const TASK_AUTOMATION_OUTBOX_JOB_NAME = 'execute';

export function buildTaskAutomationOutboxJobId(outboxId: string): string {
  return `task-automation:${outboxId}`;
}

export function buildTaskAutomationOutboxJobOptions(
  config: ConfigType<typeof taskAutomationOutboxConfig>,
  outboxId: string,
): JobsOptions {
  return {
    jobId: buildTaskAutomationOutboxJobId(outboxId),
    attempts: config.jobAttempts,
    backoff: {
      type: 'exponential',
      delay: config.jobBackoffMs,
    },
    removeOnComplete: true,
    removeOnFail: { count: 200, age: 7 * 24 * 3600 },
  };
}
