import {
  MembershipRole,
  NotificationEventKind,
  NotificationSeverity,
  NotificationStatus,
} from '@prisma/client';
import { escalateSeverity, isRecoverySeverity } from '../notification-severity.policy';
import { NotificationSeverity as DomainSeverity } from '../notification.enums';
import { getEventTypeDefinition } from '../registry/notification-event-registry';
import type {
  IngestLifecycleEffect,
  LifecycleTimestampPatch,
  NotificationLifecycleAuditEvent,
  NotificationLifecycleRole,
  NotificationLifecycleTransitionContext,
  NotificationLifecycleTransitionSpec,
  NotificationLifecycleTrigger,
} from './notification-lifecycle.types';

export class NotificationLifecycleTransitionError extends Error {
  constructor(
    public readonly from: NotificationStatus,
    public readonly to: NotificationStatus,
    message?: string,
  ) {
    super(message ?? `Invalid notification lifecycle transition: ${from} → ${to}`);
    this.name = 'NotificationLifecycleTransitionError';
  }
}

export const NOTIFICATION_LIFECYCLE_STATUSES: readonly NotificationStatus[] = [
  NotificationStatus.OPEN,
  NotificationStatus.ACKNOWLEDGED,
  NotificationStatus.SNOOZED,
  NotificationStatus.RESOLVED,
  NotificationStatus.ARCHIVED,
] as const;

export const NOTIFICATION_ACTIVE_LIFECYCLE_STATUSES: readonly NotificationStatus[] = [
  NotificationStatus.OPEN,
  NotificationStatus.ACKNOWLEDGED,
  NotificationStatus.SNOOZED,
] as const;

/**
 * Canonical transition catalog — single source of truth for org-wide lifecycle.
 * Receipt-level read/ack/snooze overlays are intentionally excluded.
 */
export const NOTIFICATION_LIFECYCLE_TRANSITIONS: readonly NotificationLifecycleTransitionSpec[] = [
  {
    from: NotificationStatus.OPEN,
    to: NotificationStatus.ACKNOWLEDGED,
    triggers: ['MANUAL_ACKNOWLEDGE'],
    roles: [MembershipRole.ORG_ADMIN, MembershipRole.SUB_ADMIN, MembershipRole.WORKER],
    auditEvent: 'notification.lifecycle.acknowledged',
    timestampField: 'acknowledgedAt',
    onIngestOccurrence: 'UPDATE_IN_PLACE',
    onSeverityEscalation: 'ESCALATE',
  },
  {
    from: NotificationStatus.OPEN,
    to: NotificationStatus.SNOOZED,
    triggers: ['MANUAL_SNOOZE'],
    roles: [MembershipRole.ORG_ADMIN, MembershipRole.SUB_ADMIN, MembershipRole.WORKER],
    auditEvent: 'notification.lifecycle.snoozed',
    timestampField: 'snoozedUntil',
    onIngestOccurrence: 'UPDATE_IN_PLACE',
    onSeverityEscalation: 'ESCALATE',
  },
  {
    from: NotificationStatus.OPEN,
    to: NotificationStatus.RESOLVED,
    triggers: ['INGEST_RECOVERY', 'MANUAL_RESOLVE', 'AUTO_EXPIRE'],
    roles: ['SYSTEM', MembershipRole.ORG_ADMIN, MembershipRole.SUB_ADMIN, MembershipRole.WORKER],
    auditEvent: 'notification.lifecycle.resolved',
    timestampField: 'resolvedAt',
    clearsFields: ['snoozedUntil'],
    onRecovery: 'RESOLVE',
  },
  {
    from: NotificationStatus.OPEN,
    to: NotificationStatus.ARCHIVED,
    triggers: ['MANUAL_ARCHIVE'],
    roles: [MembershipRole.ORG_ADMIN, MembershipRole.SUB_ADMIN],
    auditEvent: 'notification.lifecycle.archived',
    timestampField: 'archivedAt',
  },
  {
    from: NotificationStatus.ACKNOWLEDGED,
    to: NotificationStatus.SNOOZED,
    triggers: ['MANUAL_SNOOZE'],
    roles: [MembershipRole.ORG_ADMIN, MembershipRole.SUB_ADMIN, MembershipRole.WORKER],
    auditEvent: 'notification.lifecycle.snoozed',
    timestampField: 'snoozedUntil',
    onIngestOccurrence: 'UPDATE_IN_PLACE',
    onSeverityEscalation: 'ESCALATE',
  },
  {
    from: NotificationStatus.ACKNOWLEDGED,
    to: NotificationStatus.RESOLVED,
    triggers: ['INGEST_RECOVERY', 'MANUAL_RESOLVE', 'AUTO_EXPIRE'],
    roles: ['SYSTEM', MembershipRole.ORG_ADMIN, MembershipRole.SUB_ADMIN, MembershipRole.WORKER],
    auditEvent: 'notification.lifecycle.resolved',
    timestampField: 'resolvedAt',
    clearsFields: ['snoozedUntil'],
    onIngestOccurrence: 'UPDATE_IN_PLACE',
    onSeverityEscalation: 'ESCALATE',
    onRecovery: 'RESOLVE',
  },
  {
    from: NotificationStatus.SNOOZED,
    to: NotificationStatus.OPEN,
    triggers: ['MANUAL_UNSNOOZE', 'SNOOZE_EXPIRED', 'INGEST_OCCURRENCE'],
    roles: ['SYSTEM', MembershipRole.ORG_ADMIN, MembershipRole.SUB_ADMIN, MembershipRole.WORKER],
    auditEvent: 'notification.lifecycle.unsnoozed',
    clearsFields: ['snoozedUntil'],
    onIngestOccurrence: 'WAKE_TO_OPEN',
    onSeverityEscalation: 'ESCALATE_AND_WAKE',
  },
  {
    from: NotificationStatus.SNOOZED,
    to: NotificationStatus.RESOLVED,
    triggers: ['INGEST_RECOVERY', 'MANUAL_RESOLVE', 'AUTO_EXPIRE'],
    roles: ['SYSTEM', MembershipRole.ORG_ADMIN, MembershipRole.SUB_ADMIN, MembershipRole.WORKER],
    auditEvent: 'notification.lifecycle.resolved',
    timestampField: 'resolvedAt',
    clearsFields: ['snoozedUntil'],
    onRecovery: 'RESOLVE',
  },
  {
    from: NotificationStatus.RESOLVED,
    to: NotificationStatus.OPEN,
    triggers: ['INGEST_REOPEN'],
    roles: ['SYSTEM'],
    auditEvent: 'notification.lifecycle.reopened',
    clearsFields: ['resolvedAt', 'snoozedUntil'],
    onReopen: 'REGISTRY_POLICY',
  },
  {
    from: NotificationStatus.RESOLVED,
    to: NotificationStatus.ARCHIVED,
    triggers: ['MANUAL_ARCHIVE'],
    roles: [MembershipRole.ORG_ADMIN, MembershipRole.SUB_ADMIN],
    auditEvent: 'notification.lifecycle.archived',
    timestampField: 'archivedAt',
  },
] as const;

function findTransitionSpecs(
  from: NotificationStatus,
  to: NotificationStatus,
): NotificationLifecycleTransitionSpec[] {
  return NOTIFICATION_LIFECYCLE_TRANSITIONS.filter((t) => t.from === from && t.to === to);
}

export function isTerminalNotificationStatus(status: NotificationStatus): boolean {
  return status === NotificationStatus.ARCHIVED;
}

export function isActiveNotificationStatus(status: NotificationStatus): boolean {
  return NOTIFICATION_ACTIVE_LIFECYCLE_STATUSES.includes(status);
}

export function isOrgSnoozeExpired(
  snoozedUntil: Date | null | undefined,
  referenceNow: Date = new Date(),
): boolean {
  return !!snoozedUntil && snoozedUntil.getTime() <= referenceNow.getTime();
}

export function shouldWakeFromSnoozeOnEscalation(
  currentSeverity: NotificationSeverity,
  incomingSeverity: NotificationSeverity,
): boolean {
  if (isRecoverySeverity(incomingSeverity as unknown as DomainSeverity)) return false;
  const escalated = escalateSeverity(
    currentSeverity as unknown as DomainSeverity,
    incomingSeverity as unknown as DomainSeverity,
  ) as NotificationSeverity;
  if (escalated === NotificationSeverity.CRITICAL && currentSeverity !== NotificationSeverity.CRITICAL) {
    return true;
  }
  return escalated !== currentSeverity;
}

export function applyIngestOccurrenceToLifecycle(input: {
  status: NotificationStatus;
  severity: NotificationSeverity;
  snoozedUntil: Date | null | undefined;
  incomingSeverity: NotificationSeverity;
  referenceNow: Date;
}): IngestLifecycleEffect {
  const snoozeExpired = input.status === NotificationStatus.SNOOZED
    && isOrgSnoozeExpired(input.snoozedUntil, input.referenceNow);

  if (snoozeExpired) {
    return {
      status: NotificationStatus.OPEN,
      snoozedUntil: null,
      wakeFromSnooze: true,
      snoozeExpired: true,
    };
  }

  if (input.status === NotificationStatus.SNOOZED) {
    if (shouldWakeFromSnoozeOnEscalation(input.severity, input.incomingSeverity)) {
      return {
        status: NotificationStatus.OPEN,
        snoozedUntil: null,
        wakeFromSnooze: true,
        snoozeExpired: false,
      };
    }
    return {
      status: NotificationStatus.SNOOZED,
      snoozedUntil: input.snoozedUntil ?? null,
      wakeFromSnooze: false,
      snoozeExpired: false,
    };
  }

  if (input.status === NotificationStatus.ACKNOWLEDGED) {
    return {
      status: NotificationStatus.ACKNOWLEDGED,
      snoozedUntil: null,
      wakeFromSnooze: false,
      snoozeExpired: false,
    };
  }

  return {
    status: input.status,
    snoozedUntil: null,
    wakeFromSnooze: false,
    snoozeExpired: false,
  };
}

export function canAdministrativeArchive(input: {
  status: NotificationStatus;
  eventKind: NotificationEventKind;
  eventType: string;
  conditionStillActive?: boolean;
}): boolean {
  if (input.status === NotificationStatus.RESOLVED) {
    return true;
  }
  if (input.status !== NotificationStatus.OPEN) {
    return false;
  }
  if (input.conditionStillActive) {
    return false;
  }
  const def = getEventTypeDefinition(input.eventType);
  if (input.eventKind === NotificationEventKind.STATE && def?.resolutionPolicy.autoResolveWhenConditionClears) {
    return false;
  }
  return true;
}

export function allowedNotificationStatusTargets(
  from: NotificationStatus,
  context: NotificationLifecycleTransitionContext = {},
): NotificationStatus[] {
  const targets = new Set<NotificationStatus>();
  for (const spec of NOTIFICATION_LIFECYCLE_TRANSITIONS) {
    if (spec.from !== from) continue;
    if (spec.to === NotificationStatus.ARCHIVED && !context.administrativeArchive) continue;
    if (spec.to === NotificationStatus.OPEN && from === NotificationStatus.RESOLVED && !context.reopenAuthorized) {
      continue;
    }
    targets.add(spec.to);
  }
  return [...targets];
}

export function canTransitionNotificationStatus(
  from: NotificationStatus,
  to: NotificationStatus,
  context: NotificationLifecycleTransitionContext = {},
): boolean {
  return allowedNotificationStatusTargets(from, context).includes(to);
}

export function assertNotificationStatusTransition(
  from: NotificationStatus,
  to: NotificationStatus,
  context: NotificationLifecycleTransitionContext = {},
): void {
  if (!canTransitionNotificationStatus(from, to, context)) {
    throw new NotificationLifecycleTransitionError(from, to);
  }
}

export function getLifecycleTransitionSpec(
  from: NotificationStatus,
  to: NotificationStatus,
): NotificationLifecycleTransitionSpec | undefined {
  return findTransitionSpecs(from, to)[0];
}

export function getLifecycleAuditEvent(
  from: NotificationStatus,
  to: NotificationStatus,
): NotificationLifecycleAuditEvent | undefined {
  return getLifecycleTransitionSpec(from, to)?.auditEvent;
}

export function lifecycleTimestampPatchForTransition(
  from: NotificationStatus,
  to: NotificationStatus,
  at: Date,
  until?: Date,
): LifecycleTimestampPatch {
  const spec = getLifecycleTransitionSpec(from, to);
  if (!spec) return {};

  const patch: LifecycleTimestampPatch = {};
  if (spec.timestampField === 'acknowledgedAt') patch.acknowledgedAt = at;
  if (spec.timestampField === 'snoozedUntil') patch.snoozedUntil = until ?? at;
  if (spec.timestampField === 'resolvedAt') patch.resolvedAt = at;
  if (spec.timestampField === 'archivedAt') patch.archivedAt = at;

  for (const field of spec.clearsFields ?? []) {
    patch[field] = null;
  }
  return patch;
}

export function isForbiddenLifecycleTransition(
  from: NotificationStatus,
  to: NotificationStatus,
  context: NotificationLifecycleTransitionContext = {},
): boolean {
  return !canTransitionNotificationStatus(from, to, context);
}

export function listAllLifecycleTransitionPairs(): Array<{
  from: NotificationStatus;
  to: NotificationStatus;
  allowed: boolean;
}> {
  const pairs: Array<{ from: NotificationStatus; to: NotificationStatus; allowed: boolean }> = [];
  for (const from of NOTIFICATION_LIFECYCLE_STATUSES) {
    for (const to of NOTIFICATION_LIFECYCLE_STATUSES) {
      if (from === to) continue;
      pairs.push({
        from,
        to,
        allowed: canTransitionNotificationStatus(from, to)
          || canTransitionNotificationStatus(from, to, { administrativeArchive: true, reopenAuthorized: true }),
      });
    }
  }
  return pairs;
}

/** Recovery ingest never materializes a new active SUCCESS notification. */
export function recoveryIngestCreatesActiveNotification(): false {
  return false;
}

export function roleMayTriggerLifecycleTransition(
  role: NotificationLifecycleRole,
  trigger: NotificationLifecycleTrigger,
  from: NotificationStatus,
  to: NotificationStatus,
): boolean {
  const spec = getLifecycleTransitionSpec(from, to);
  if (!spec || !spec.triggers.includes(trigger)) return false;
  return spec.roles.includes(role);
}

// Backward-compatible alias
export { NotificationLifecycleTransitionError as NotificationStatusTransitionError };
