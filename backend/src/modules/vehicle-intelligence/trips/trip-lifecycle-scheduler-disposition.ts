import type { TripLifecycleInvariantResult } from './trip-lifecycle-invariant';

export type SchedulerStaleDisposition =
  | 'block'
  | 'enqueue_only'
  | 'enqueue_and_reconcile';

/**
 * Scheduler routing for stale FSM rows (R2B).
 *
 * - CONFLICT → block (no enqueue, no reconciliation)
 * - RECOVERABLE → enqueue only (worker repairs under lock later)
 * - HEALTHY stale → enqueue + existing event reconciliation eligibility
 */
export function resolveSchedulerStaleStateDisposition(
  result: Pick<TripLifecycleInvariantResult, 'action' | 'classification'> | null,
): SchedulerStaleDisposition {
  if (!result) return 'enqueue_and_reconcile';
  if (result.action === 'NO_SAFE_REPAIR') return 'block';
  if (result.action !== 'NONE') return 'enqueue_only';
  return 'enqueue_and_reconcile';
}

export function isRecoverableLifecycleClassification(
  classification: TripLifecycleInvariantResult['classification'],
): boolean {
  return classification.startsWith('RECOVERABLE_');
}
