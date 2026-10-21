import { buildTaskAutomationOutboxJobId } from './task-automation-outbox-queue.util';
import { isBullMqCompatibleJobId } from '@shared/queue/bullmq-job-id.sanitizer';

describe('task-automation-outbox-queue.util', () => {
  it('buildTaskAutomationOutboxJobId is colon-free and deterministic', () => {
    const outboxId = 'task-outbox-1';
    const jobId = buildTaskAutomationOutboxJobId(outboxId);
    expect(jobId).not.toContain(':');
    expect(isBullMqCompatibleJobId(jobId)).toBe(true);
    expect(buildTaskAutomationOutboxJobId(outboxId)).toBe(jobId);
  });
});
