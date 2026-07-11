import { MembershipRole, NotificationEventKind, NotificationStatus } from '@prisma/client';
import { canTransitionNotificationStatus } from '../notification-status.transitions';
import { NotificationStatus as DomainStatus } from '../notification.enums';
import { getEventTypeDefinition } from '../registry/notification-event-registry';
import { isManualResolutionAllowed } from './notification-manual-resolution.policy';

export type NotificationAvailableAction =
  | 'read'
  | 'unread'
  | 'acknowledge'
  | 'snooze'
  | 'unsnooze'
  | 'resolve'
  | 'archive'
  | 'open_entity';

const ARCHIVE_ROLES: MembershipRole[] = [
  MembershipRole.ORG_ADMIN,
  MembershipRole.SUB_ADMIN,
];

const MANUAL_RESOLVE_ROLES: MembershipRole[] = [
  MembershipRole.ORG_ADMIN,
  MembershipRole.SUB_ADMIN,
  MembershipRole.WORKER,
];

export interface AvailableActionsInput {
  status: NotificationStatus;
  eventType: string;
  eventKind: NotificationEventKind;
  membershipRole: MembershipRole;
  isRead: boolean;
  hasActionTarget: boolean;
}

export function deriveAvailableActions(input: AvailableActionsInput): NotificationAvailableAction[] {
  const def = getEventTypeDefinition(input.eventType);
  if (def && !def.supportedRoles.includes(input.membershipRole as MembershipRole)) {
    return [];
  }

  const actions: NotificationAvailableAction[] = [];
  const domainStatus = input.status as unknown as DomainStatus;

  if (input.isRead) {
    actions.push('unread');
  } else {
    actions.push('read');
  }

  if (
    canTransitionNotificationStatus(domainStatus, DomainStatus.ACKNOWLEDGED)
    && input.status === NotificationStatus.OPEN
  ) {
    actions.push('acknowledge');
  }

  if (
    canTransitionNotificationStatus(domainStatus, DomainStatus.SNOOZED)
    && (input.status === NotificationStatus.OPEN || input.status === NotificationStatus.ACKNOWLEDGED)
  ) {
    actions.push('snooze');
  }

  if (input.status === NotificationStatus.SNOOZED) {
    actions.push('unsnooze');
  }

  if (
    MANUAL_RESOLVE_ROLES.includes(input.membershipRole)
    && isManualResolutionAllowed(input.eventType, input.eventKind)
    && canTransitionNotificationStatus(domainStatus, DomainStatus.RESOLVED)
  ) {
    actions.push('resolve');
  }

  if (
    ARCHIVE_ROLES.includes(input.membershipRole)
    && (
      (input.status === NotificationStatus.OPEN
        && canTransitionNotificationStatus(domainStatus, DomainStatus.ARCHIVED, { administrativeArchive: true }))
      || (input.status === NotificationStatus.RESOLVED
        && canTransitionNotificationStatus(domainStatus, DomainStatus.ARCHIVED, { administrativeArchive: true }))
    )
  ) {
    actions.push('archive');
  }

  if (input.hasActionTarget) {
    actions.push('open_entity');
  }

  return actions;
}
