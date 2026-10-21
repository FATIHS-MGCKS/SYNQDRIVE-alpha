import type { ReconciliationTier } from '@modules/vehicle-intelligence/trips/reconciliation/reconciliation.types';

export type TripReconciliationMutexType = 'trip';

export type ReconciliationMutexSkipReason = 'LOCKED' | 'REDIS_UNAVAILABLE';

export interface ReconciliationMutexScope {
  organizationId: string;
  vehicleId: string;
  reconciliationType: TripReconciliationMutexType;
  tier?: ReconciliationTier;
}

export type ReconciliationMutexExecuteResult<T> =
  | { status: 'executed'; value: T }
  | { status: 'skipped'; reason: ReconciliationMutexSkipReason };
