import { JobsOptions } from 'bullmq';
import { ConfigType } from '@nestjs/config';
import paymentEmailConfig from '@config/payment-email.config';
import { sanitizeBullMqJobId } from '@shared/queue/bullmq-job-id.sanitizer';

export const PAYMENT_EMAIL_JOB_NAME = 'deliver';

export function buildPaymentEmailJobId(outboxId: string): string {
  return sanitizeBullMqJobId({
    namespace: 'payment-email',
    key: outboxId,
  });
}

export function buildPaymentEmailJobOptions(
  config: ConfigType<typeof paymentEmailConfig>,
  outboxId: string,
): JobsOptions {
  return {
    jobId: buildPaymentEmailJobId(outboxId),
    attempts: config.jobAttempts,
    backoff: {
      type: 'exponential',
      delay: config.jobBackoffMs,
    },
    removeOnComplete: true,
    removeOnFail: { count: 200, age: 7 * 24 * 3600 },
  };
}

export function buildPaymentEmailIdempotencyKey(params: {
  organizationId: string;
  paymentRequestId: string;
  emailType: string;
  suffix: string;
}): string {
  return `pay-email:${params.organizationId}:${params.paymentRequestId}:${params.emailType}:${params.suffix}`;
}
