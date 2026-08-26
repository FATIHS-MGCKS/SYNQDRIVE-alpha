import { buildNotificationEvaluationJobId } from './notification-evaluation-queue.util';
import { isBullMqCompatibleJobId } from '@shared/queue/bullmq-job-id.sanitizer';

describe('notification-evaluation-queue.util', () => {
  const orgId = 'faa710c9-6d91-4079-a7d5-91fdccdec14a';

  it('buildNotificationEvaluationJobId is colon-free and distinguishes trigger classes', () => {
    const debounced = buildNotificationEvaluationJobId(orgId, 'debounced');
    const scheduled = buildNotificationEvaluationJobId(orgId, 'scheduled');
    expect(debounced).not.toContain(':');
    expect(scheduled).not.toContain(':');
    expect(isBullMqCompatibleJobId(debounced)).toBe(true);
    expect(debounced).not.toBe(scheduled);
    expect(buildNotificationEvaluationJobId(orgId, 'debounced')).toBe(debounced);
  });
});
