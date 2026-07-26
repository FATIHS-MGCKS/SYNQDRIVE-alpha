import type { MembershipRole, NotificationStatus } from '@prisma/client';

/** Org-wide lifecycle statuses — READ is receipt-only, not a lifecycle state. */
export type NotificationLifecycleStatus = NotificationStatus;

export type NotificationLifecycleRole =
  | 'SYSTEM'
  | MembershipRole.ORG_ADMIN
  | MembershipRole.SUB_ADMIN
  | MembershipRole.WORKER
  | MembershipRole.DRIVER;

export type NotificationLifecycleTrigger =
  | 'INGEST_OCCURRENCE'
  | 'INGEST_RECOVERY'
  | 'INGEST_REOPEN'
  | 'MANUAL_ACKNOWLEDGE'
  | 'MANUAL_SNOOZE'
  | 'MANUAL_UNSNOOZE'
  | 'MANUAL_RESOLVE'
  | 'MANUAL_ARCHIVE'
  | 'SNOOZE_EXPIRED'
  | 'AUTO_EXPIRE';

export type NotificationLifecycleAuditEvent =
  | 'notification.lifecycle.acknowledged'
  | 'notification.lifecycle.snoozed'
  | 'notification.lifecycle.unsnoozed'
  | 'notification.lifecycle.resolved'
  | 'notification.lifecycle.archived'
  | 'notification.lifecycle.reopened'
  | 'notification.lifecycle.ingest_updated'
  | 'notification.lifecycle.ingest_ignored';

export interface NotificationLifecycleTransitionContext {
  administrativeArchive?: boolean;
  reopenAuthorized?: boolean;
  manualResolutionAllowed?: boolean;
  conditionStillActive?: boolean;
}

export interface NotificationLifecycleTransitionSpec {
  from: NotificationLifecycleStatus;
  to: NotificationLifecycleStatus;
  triggers: NotificationLifecycleTrigger[];
  roles: NotificationLifecycleRole[];
  auditEvent: NotificationLifecycleAuditEvent;
  /** Timestamp field written on the notification row when this transition commits. */
  timestampField?: 'acknowledgedAt' | 'snoozedUntil' | 'resolvedAt' | 'archivedAt';
  clearsFields?: Array<'snoozedUntil' | 'resolvedAt' | 'acknowledgedAt'>;
  /** Ingest: new occurrence while in `from` status. */
  onIngestOccurrence?: 'UPDATE_IN_PLACE' | 'WAKE_TO_OPEN' | 'IGNORE' | 'REOPEN_POLICY';
  onSeverityEscalation?: 'ESCALATE' | 'ESCALATE_AND_WAKE' | 'NONE';
  onRecovery?: 'RESOLVE' | 'IGNORE_ALREADY_RESOLVED' | 'ERROR_NO_ACTIVE';
  onReopen?: 'REGISTRY_POLICY';
}

export interface IngestLifecycleEffect {
  status: NotificationLifecycleStatus;
  snoozedUntil: Date | null;
  wakeFromSnooze: boolean;
  snoozeExpired: boolean;
}

export interface LifecycleTimestampPatch {
  acknowledgedAt?: Date | null;
  snoozedUntil?: Date | null;
  resolvedAt?: Date | null;
  archivedAt?: Date | null;
}
