import { NotificationDomain } from '@prisma/client';
import { WORKFLOW_AUDIT_RETENTION_DAYS } from '@modules/workflows/audit/workflow-audit.constants';

/**
 * Retention classes derived from existing SynqDrive policies:
 * - VEHICLE_WARNING_RETENTION_NOTIFICATIONS_DAYS (180) — fleet warning remediation
 * - WORKFLOW_AUDIT_RETENTION_DAYS — technical/governance audit alignment
 * - Legal document DELIVERY_EVIDENCE pattern — outbound comms redaction horizon
 */
export const NOTIFICATION_RETENTION_CLASS = {
  ACTIVE_OPERATIONAL: 'ACTIVE_OPERATIONAL',
  RESOLVED_OPERATIONAL: 'RESOLVED_OPERATIONAL',
  SECURITY_GOVERNANCE: 'SECURITY_GOVERNANCE',
  DELIVERY_TECHNICAL: 'DELIVERY_TECHNICAL',
  WORKFLOW_TECHNICAL: 'WORKFLOW_TECHNICAL',
} as const;

export type NotificationRetentionClass =
  (typeof NOTIFICATION_RETENTION_CLASS)[keyof typeof NOTIFICATION_RETENTION_CLASS];

export const NOTIFICATION_RETENTION_DAYS: Record<NotificationRetentionClass, number> = {
  /** Active rows — retained while status is non-terminal; no age-based purge. */
  ACTIVE_OPERATIONAL: 0,
  /** Resolved/archived operational notifications — VEHICLE_WARNING_RETENTION default. */
  RESOLVED_OPERATIONAL: 180,
  /** SECURITY / integration compliance — WORKFLOW GOVERNANCE_AUDIT horizon. */
  SECURITY_GOVERNANCE: WORKFLOW_AUDIT_RETENTION_DAYS.GOVERNANCE_AUDIT,
  /** Terminal delivery outbox rows — WORKFLOW TECHNICAL_LOG horizon. */
  DELIVERY_TECHNICAL: WORKFLOW_AUDIT_RETENTION_DAYS.TECHNICAL_LOG,
  /** Notification-triggered workflow runs — WORKFLOW TECHNICAL_LOG horizon. */
  WORKFLOW_TECHNICAL: WORKFLOW_AUDIT_RETENTION_DAYS.TECHNICAL_LOG,
};

export const NOTIFICATION_RETENTION_PURGE_RUN_STATUS = {
  RUNNING: 'RUNNING',
  COMPLETED: 'COMPLETED',
  FAILED: 'FAILED',
} as const;

export const NOTIFICATION_RETENTION_SKIP_REASON = {
  LEGAL_HOLD: 'legal_hold',
  NOT_ELIGIBLE: 'not_eligible',
  ACTIVE_STATUS: 'active_status',
  DISABLED: 'disabled',
  DRY_RUN: 'dry_run',
} as const;

export function resolveNotificationRetentionClass(input: {
  domain: NotificationDomain;
  eventType: string;
  status: string;
}): NotificationRetentionClass {
  if (input.status === 'OPEN' || input.status === 'ACKNOWLEDGED' || input.status === 'SNOOZED') {
    return NOTIFICATION_RETENTION_CLASS.ACTIVE_OPERATIONAL;
  }
  if (
    input.domain === NotificationDomain.SECURITY
    || input.domain === NotificationDomain.SYSTEM
    || input.eventType === 'INTEGRATION_DISCONNECTED'
    || input.eventType === 'WEBHOOK_FAILURE'
  ) {
    return NOTIFICATION_RETENTION_CLASS.SECURITY_GOVERNANCE;
  }
  return NOTIFICATION_RETENTION_CLASS.RESOLVED_OPERATIONAL;
}

export function computeDeletionEligibleAt(
  retentionClass: NotificationRetentionClass,
  anchor: Date,
): Date | null {
  const days = NOTIFICATION_RETENTION_DAYS[retentionClass];
  if (!Number.isFinite(days) || days <= 0) return null;
  const eligible = new Date(anchor);
  eligible.setUTCDate(eligible.getUTCDate() + days);
  return eligible;
}
