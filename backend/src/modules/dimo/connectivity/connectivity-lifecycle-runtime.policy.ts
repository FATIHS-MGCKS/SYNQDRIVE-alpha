import { CONNECTIVITY_LIFECYCLE_DEV_RECONCILE_AFTER_ISO } from '@config/device-connection-webhook-inbox.config';

/**
 * @see docs/audits/connectivity-production-processing-gate-2026-08.md
 */
export { CONNECTIVITY_LIFECYCLE_DEV_RECONCILE_AFTER_ISO };

export type LifecycleReconciliationEligibility =
  | 'eligible'
  | 'already_complete'
  | 'historical_orphan'
  | 'reconciliation_disabled';

export function isEligibleForRuntimeLifecycleReconciliation(
  receivedAt: Date,
  reconcileAfter: Date,
): boolean {
  return receivedAt.getTime() >= reconcileAfter.getTime();
}

export function isHistoricalLifecycleOrphan(
  receivedAt: Date,
  reconcileAfter: Date,
): boolean {
  return receivedAt.getTime() < reconcileAfter.getTime();
}

export function evaluateOrphanReconciliationEligibility(input: {
  receivedAt: Date;
  processedAt: Date | null;
  lifecycleReconcileAfter: Date | null;
  automaticLifecycleReconciliationEnabled: boolean;
}): LifecycleReconciliationEligibility {
  if (input.processedAt) {
    return 'already_complete';
  }
  if (!input.automaticLifecycleReconciliationEnabled || !input.lifecycleReconcileAfter) {
    return 'reconciliation_disabled';
  }
  if (isHistoricalLifecycleOrphan(input.receivedAt, input.lifecycleReconcileAfter)) {
    return 'historical_orphan';
  }
  return 'eligible';
}

export function isInboxEligibleForAutomaticRuntimeReplay(input: {
  receivedAt: Date;
  lifecycleReconcileAfter: Date | null;
  automaticLifecycleReconciliationEnabled: boolean;
}): boolean {
  if (!input.automaticLifecycleReconciliationEnabled || !input.lifecycleReconcileAfter) {
    return false;
  }
  return isEligibleForRuntimeLifecycleReconciliation(
    input.receivedAt,
    input.lifecycleReconcileAfter,
  );
}
