import { buildDeliveryJobId } from './notification-delivery-queue.util';
import { isBullMqCompatibleJobId } from '@shared/queue/bullmq-job-id.sanitizer';

describe('notification-delivery-queue.util', () => {
  it('buildDeliveryJobId is colon-free and deterministic', () => {
    const outboxId = 'delivery-outbox-1';
    const jobId = buildDeliveryJobId(outboxId);
    expect(jobId).not.toContain(':');
    expect(isBullMqCompatibleJobId(jobId)).toBe(true);
    expect(buildDeliveryJobId(outboxId)).toBe(jobId);
  });
});
