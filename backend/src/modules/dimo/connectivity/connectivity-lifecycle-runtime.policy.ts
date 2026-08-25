import { CONNECTIVITY_LIFECYCLE_RUNTIME_RECONCILE_AFTER_ISO } from '@config/device-connection-webhook-inbox.config';

/**
 * First instant the repaired inbox → BullMQ → episode lifecycle pipeline (PR #1267) is authoritative.
 *
 * Canonical events and inbox rows with `receivedAt` strictly before this boundary are
 * **historical orphans** — reported only, never auto-reconciled by the 30s scheduler.
 *
 * Override via `CONNECTIVITY_LIFECYCLE_RECONCILE_AFTER` (ISO-8601) for controlled environments.
 *
 * @see docs/audits/connectivity-production-processing-gate-2026-08.md
 * @see prisma/migrations/20260719160000_device_connection_webhook_inbox
 */
export { CONNECTIVITY_LIFECYCLE_RUNTIME_RECONCILE_AFTER_ISO };

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
