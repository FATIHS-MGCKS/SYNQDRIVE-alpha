import type {
  NotificationAuditEventType,
  NotificationAuditRetentionClass,
} from '@prisma/client';
import { WORKFLOW_AUDIT_RETENTION_DAYS } from '@modules/workflows/audit/workflow-audit.constants';

export const NOTIFICATION_AUDIT_RETENTION_DAYS: Record<
  NotificationAuditRetentionClass,
  number
> = {
  TECHNICAL_LOG: WORKFLOW_AUDIT_RETENTION_DAYS.TECHNICAL_LOG,
  REVISION_AUDIT: WORKFLOW_AUDIT_RETENTION_DAYS.REVISION_AUDIT,
  GOVERNANCE_AUDIT: WORKFLOW_AUDIT_RETENTION_DAYS.GOVERNANCE_AUDIT,
};

export const NOTIFICATION_AUDIT_EVENT_RETENTION: Record<
  NotificationAuditEventType,
  NotificationAuditRetentionClass
> = {
  NOTIFICATION_CREATED: 'REVISION_AUDIT',
  SEVERITY_ESCALATED: 'GOVERNANCE_AUDIT',
  ACKNOWLEDGED: 'REVISION_AUDIT',
  SNOOZED: 'REVISION_AUDIT',
  UNSNOOZED: 'REVISION_AUDIT',
  RESOLVED: 'GOVERNANCE_AUDIT',
  REOPENED: 'GOVERNANCE_AUDIT',
  ARCHIVED: 'GOVERNANCE_AUDIT',
  DELIVERY_FAILED: 'TECHNICAL_LOG',
  DELIVERY_DEAD_LETTER: 'GOVERNANCE_AUDIT',
  WORKFLOW_TRIGGERED: 'TECHNICAL_LOG',
  MANUAL_INTERVENTION: 'GOVERNANCE_AUDIT',
  POLICY_REJECTED: 'GOVERNANCE_AUDIT',
  INGEST_IGNORED: 'TECHNICAL_LOG',
};

/** Fields never persisted in audit state snapshots or client payloads. */
export const NOTIFICATION_AUDIT_PROTECTED_FIELDS = [
  'titleKey',
  'bodyKey',
  'title',
  'body',
  'templateParams',
  'actionTarget',
  'payload',
  'message',
  'messageBody',
  'email',
  'phone',
  'recipientEmail',
  'rawPayload',
] as const;
