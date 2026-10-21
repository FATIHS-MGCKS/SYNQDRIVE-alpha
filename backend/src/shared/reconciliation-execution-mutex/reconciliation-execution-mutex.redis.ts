import type { TripReconciliationMutexType } from './reconciliation-execution-mutex.types';

export const RECONCILIATION_LOCK_KEY_PREFIX = 'synqdrive:reconciliation:lock';

export function buildReconciliationLockKey(
  organizationId: string,
  vehicleId: string,
  reconciliationType: TripReconciliationMutexType,
): string {
  return `${RECONCILIATION_LOCK_KEY_PREFIX}:${organizationId}:${vehicleId}:${reconciliationType}`;
}
