import { registerAs } from '@nestjs/config';

export default registerAs('deviceConnectionWebhookInbox', () => ({
  maxAttempts: Number(process.env.CONNECTIVITY_WEBHOOK_MAX_ATTEMPTS ?? 5),
  baseBackoffMs: Number(process.env.CONNECTIVITY_WEBHOOK_BACKOFF_MS ?? 60_000),
  pollBatchSize: Number(process.env.CONNECTIVITY_WEBHOOK_POLL_BATCH ?? 50),
  processingStaleMs: Number(process.env.CONNECTIVITY_WEBHOOK_STALE_MS ?? 5 * 60_000),
}));
