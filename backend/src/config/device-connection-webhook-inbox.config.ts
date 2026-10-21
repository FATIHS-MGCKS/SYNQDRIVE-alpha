import { registerAs } from '@nestjs/config';

/**
 * Deterministic dev/test cutover when `CONNECTIVITY_LIFECYCLE_RECONCILE_AFTER` is unset in non-production.
 * NOT used in production — production requires an explicit deployment-controlled value.
 */
export const CONNECTIVITY_LIFECYCLE_DEV_RECONCILE_AFTER_ISO = '2026-08-25T00:00:00.000Z';

export type LifecycleReconcileConfig = {
  lifecycleReconcileAfter: Date | null;
  automaticLifecycleReconciliationEnabled: boolean;
};

function parseIsoDate(raw: string, label: string): Date {
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) {
    throw new Error(`Invalid ${label} "${raw}" — expected ISO-8601 datetime`);
  }
  return parsed;
}

export function resolveLifecycleReconcileConfig(
  env: NodeJS.ProcessEnv = process.env,
): LifecycleReconcileConfig {
  const raw = env.CONNECTIVITY_LIFECYCLE_RECONCILE_AFTER?.trim();
  const isProduction = (env.NODE_ENV ?? 'development') === 'production';

  if (!raw) {
    if (isProduction) {
      return {
        lifecycleReconcileAfter: null,
        automaticLifecycleReconciliationEnabled: false,
      };
    }
    return {
      lifecycleReconcileAfter: parseIsoDate(
        CONNECTIVITY_LIFECYCLE_DEV_RECONCILE_AFTER_ISO,
        'CONNECTIVITY_LIFECYCLE_DEV_RECONCILE_AFTER_ISO',
      ),
      automaticLifecycleReconciliationEnabled: true,
    };
  }

  return {
    lifecycleReconcileAfter: parseIsoDate(raw, 'CONNECTIVITY_LIFECYCLE_RECONCILE_AFTER'),
    automaticLifecycleReconciliationEnabled: true,
  };
}

export default registerAs('deviceConnectionWebhookInbox', () => {
  const lifecycle = resolveLifecycleReconcileConfig();
  return {
    maxAttempts: Number(process.env.CONNECTIVITY_WEBHOOK_MAX_ATTEMPTS ?? 5),
    baseBackoffMs: Number(process.env.CONNECTIVITY_WEBHOOK_BACKOFF_MS ?? 60_000),
    pollBatchSize: Number(process.env.CONNECTIVITY_WEBHOOK_POLL_BATCH ?? 50),
    processingStaleMs: Number(process.env.CONNECTIVITY_WEBHOOK_STALE_MS ?? 5 * 60_000),
    ...lifecycle,
  };
});
