import { registerAs } from '@nestjs/config';

export default registerAs('deviceConnectionPhysicalStateActionOutbox', () => ({
  maxAttempts: Number(process.env.CONNECTIVITY_PHYSICAL_STATE_ACTION_OUTBOX_MAX_ATTEMPTS ?? 5),
  baseBackoffMs: Number(
    process.env.CONNECTIVITY_PHYSICAL_STATE_ACTION_OUTBOX_BACKOFF_MS ?? 30_000,
  ),
  pollBatchSize: Number(process.env.CONNECTIVITY_PHYSICAL_STATE_ACTION_OUTBOX_POLL_BATCH ?? 25),
  processingLeaseMs: Number(
    process.env.CONNECTIVITY_PHYSICAL_STATE_ACTION_OUTBOX_LEASE_MS ?? 5 * 60_000,
  ),
  processingStaleMs: Number(
    process.env.CONNECTIVITY_PHYSICAL_STATE_ACTION_OUTBOX_STALE_MS ?? 5 * 60_000,
  ),
}));
