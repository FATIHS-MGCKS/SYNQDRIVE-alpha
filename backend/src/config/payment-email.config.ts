import { registerAs } from '@nestjs/config';

export default registerAs('paymentEmail', () => ({
  enabled: process.env.PAYMENT_EMAIL_ENABLED !== 'false',
  maxAttempts: parseInt(process.env.PAYMENT_EMAIL_MAX_ATTEMPTS ?? '5', 10),
  backoffMs: parseInt(process.env.PAYMENT_EMAIL_BACKOFF_MS ?? '60000', 10),
  pollBatchSize: parseInt(process.env.PAYMENT_EMAIL_POLL_BATCH ?? '50', 10),
  jobAttempts: parseInt(process.env.PAYMENT_EMAIL_JOB_ATTEMPTS ?? '5', 10),
  jobBackoffMs: parseInt(process.env.PAYMENT_EMAIL_JOB_BACKOFF_MS ?? '30000', 10),
}));
