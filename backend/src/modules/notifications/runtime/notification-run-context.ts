import { AsyncLocalStorage } from 'async_hooks';
import type { NotificationEvaluationRunStats } from './notification-evaluation.types';
import { EMPTY_RUN_STATS } from './notification-evaluation.types';
import {
  createNotificationAuthCache,
  type NotificationAuthCache,
} from '@modules/data-authorizations/notification-enforcement/notification-enforcement.types';

export interface ActiveNotificationRunContext {
  runId: string;
  organizationId: string;
  stats: NotificationEvaluationRunStats;
  authCache: NotificationAuthCache;
}

export const notificationRunContextStorage = new AsyncLocalStorage<ActiveNotificationRunContext>();

export function getActiveNotificationRunStats(): NotificationEvaluationRunStats | null {
  return notificationRunContextStorage.getStore()?.stats ?? null;
}

export function recordNotificationIngestOperation(
  operation: 'created' | 'updated' | 'resolved' | 'ignored' | 'skipped_flag_off' | 'skipped_auth_denied',
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
    case 'skipped_auth_denied':
      stats.deduplicatedCount++;
      break;
    default:
      break;
  }
}

export function getActiveNotificationAuthCache(): NotificationAuthCache | null {
  return notificationRunContextStorage.getStore()?.authCache ?? null;
}

export function recordNotificationFailure(): void {
  const stats = getActiveNotificationRunStats();
  if (stats) stats.failureCount++;
}

export function runWithNotificationRunContext<T>(
  ctx: Omit<ActiveNotificationRunContext, 'authCache'> & { authCache?: NotificationAuthCache },
  fn: () => Promise<T>,
): Promise<T> {
  return notificationRunContextStorage.run(
    {
      ...ctx,
      stats: { ...EMPTY_RUN_STATS(), ...ctx.stats },
      authCache: ctx.authCache ?? createNotificationAuthCache(),
    },
    fn,
  );
}
