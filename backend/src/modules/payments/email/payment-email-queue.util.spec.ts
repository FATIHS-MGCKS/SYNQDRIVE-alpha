import { buildPaymentEmailJobId } from './payment-email-queue.util';
import { isBullMqCompatibleJobId } from '@shared/queue/bullmq-job-id.sanitizer';

describe('payment-email-queue.util', () => {
  it('buildPaymentEmailJobId is colon-free and deterministic', () => {
    const outboxId = 'outbox-abc-123';
    const jobId = buildPaymentEmailJobId(outboxId);
    expect(jobId).not.toContain(':');
    expect(isBullMqCompatibleJobId(jobId)).toBe(true);
    expect(buildPaymentEmailJobId(outboxId)).toBe(jobId);
  });
});
