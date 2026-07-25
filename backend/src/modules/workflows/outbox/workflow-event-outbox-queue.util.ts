import { JobsOptions } from 'bullmq';
import { ConfigType } from '@nestjs/config';
import workflowEventOutboxConfig from '@config/workflow-event-outbox.config';

export const WORKFLOW_EVENT_OUTBOX_JOB_NAME = 'dispatch';

export function buildWorkflowEventOutboxJobId(outboxId: string): string {
  return `workflow-event-outbox:${outboxId}`;
}

export function buildWorkflowEventOutboxJobOptions(
  config: ConfigType<typeof workflowEventOutboxConfig>,
  outboxId: string,
): JobsOptions {
  return {
    jobId: buildWorkflowEventOutboxJobId(outboxId),
    attempts: config.jobAttempts,
    backoff: {
      type: 'exponential',
      delay: config.jobBackoffMs,
    },
    removeOnComplete: true,
    removeOnFail: { count: 200, age: 7 * 24 * 3600 },
  };
}
