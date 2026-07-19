import { registerAs } from '@nestjs/config';

export default registerAs('deviceConnectionEpisodeResolutionOutbox', () => ({
  maxAttempts: Number(process.env.CONNECTIVITY_RESOLUTION_OUTBOX_MAX_ATTEMPTS ?? 5),
  baseBackoffMs: Number(process.env.CONNECTIVITY_RESOLUTION_OUTBOX_BACKOFF_MS ?? 30_000),
  pollBatchSize: Number(process.env.CONNECTIVITY_RESOLUTION_OUTBOX_POLL_BATCH ?? 25),
  processingStaleMs: Number(process.env.CONNECTIVITY_RESOLUTION_OUTBOX_STALE_MS ?? 5 * 60_000),
}));
