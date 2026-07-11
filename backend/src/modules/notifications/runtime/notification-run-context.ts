import { AsyncLocalStorage } from 'async_hooks';
import type { NotificationEvaluationRunStats } from './notification-evaluation.types';
import { EMPTY_RUN_STATS } from './notification-evaluation.types';

export interface ActiveNotificationRunContext {
  runId: string;
  organizationId: string;
  stats: NotificationEvaluationRunStats;
}

export const notificationRunContextStorage = new AsyncLocalStorage<ActiveNotificationRunContext>();

export function getActiveNotificationRunStats(): NotificationEvaluationRunStats | null {
  return notificationRunContextStorage.getStore()?.stats ?? null;
}

export function recordNotificationIngestOperation(
  operation: 'created' | 'updated' | 'resolved' | 'ignored' | 'skipped_flag_off',
): void {
  const stats = getActiveNotificationRunStats();
  if (!stats) return;

  switch (operation) {
    case 'created':
      stats.createdCount++;
      break;
    case 'updated':
      stats.updatedCount++;
      break;
    case 'resolved':
      stats.resolvedCount++;
      break;
    case 'ignored':
      stats.deduplicatedCount++;
      break;
    default:
      break;
  }
}

export function recordNotificationFailure(): void {
  const stats = getActiveNotificationRunStats();
  if (stats) stats.failureCount++;
}

export function runWithNotificationRunContext<T>(
  ctx: ActiveNotificationRunContext,
  fn: () => Promise<T>,
): Promise<T> {
  return notificationRunContextStorage.run(
    { ...ctx, stats: { ...EMPTY_RUN_STATS(), ...ctx.stats } },
    fn,
  );
}
