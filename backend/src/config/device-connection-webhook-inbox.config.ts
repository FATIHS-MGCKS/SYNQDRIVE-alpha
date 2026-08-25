import { registerAs } from '@nestjs/config';

/**
 * First instant the repaired inbox → BullMQ → episode lifecycle pipeline (PR #1267) is authoritative.
 * Events/inbox rows received before this are historical orphans (no automatic episode materialization).
 *
 * @see docs/audits/connectivity-production-processing-gate-2026-08.md
 */
export const CONNECTIVITY_LIFECYCLE_RUNTIME_RECONCILE_AFTER_ISO = '2026-08-25T00:00:00.000Z';

function parseLifecycleReconcileAfter(): Date {
  const raw =
    process.env.CONNECTIVITY_LIFECYCLE_RECONCILE_AFTER?.trim() ||
    CONNECTIVITY_LIFECYCLE_RUNTIME_RECONCILE_AFTER_ISO;
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) {
    throw new Error(
      `Invalid CONNECTIVITY_LIFECYCLE_RECONCILE_AFTER "${raw}" — expected ISO-8601 datetime`,
    );
  }
  return parsed;
}

export default registerAs('deviceConnectionWebhookInbox', () => ({
  maxAttempts: Number(process.env.CONNECTIVITY_WEBHOOK_MAX_ATTEMPTS ?? 5),
  baseBackoffMs: Number(process.env.CONNECTIVITY_WEBHOOK_BACKOFF_MS ?? 60_000),
  pollBatchSize: Number(process.env.CONNECTIVITY_WEBHOOK_POLL_BATCH ?? 50),
  processingStaleMs: Number(process.env.CONNECTIVITY_WEBHOOK_STALE_MS ?? 5 * 60_000),
  lifecycleReconcileAfter: parseLifecycleReconcileAfter(),
}));
