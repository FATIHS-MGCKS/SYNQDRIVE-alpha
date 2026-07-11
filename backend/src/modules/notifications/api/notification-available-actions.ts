import { MembershipRole, NotificationEventKind, NotificationStatus } from '@prisma/client';
import { canTransitionNotificationStatus } from '../notification-status.transitions';
import { NotificationStatus as DomainStatus } from '../notification.enums';
import { getEventTypeDefinition } from '../registry/notification-event-registry';
import { isManualResolutionAllowed } from './notification-manual-resolution.policy';
import { isUserSnoozeActive } from '../access/notification-receipt.policy';

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

const ACTIVE_STATUSES: NotificationStatus[] = [
  NotificationStatus.OPEN,
  NotificationStatus.ACKNOWLEDGED,
  NotificationStatus.SNOOZED,
];

export interface AvailableActionsInput {
  status: NotificationStatus;
  eventType: string;
  eventKind: NotificationEventKind;
  membershipRole: MembershipRole;
  isRead: boolean;
  isPersonallyAcknowledged: boolean;
  userSnoozedUntil: Date | null;
  hasActionTarget: boolean;
  referenceNow?: Date;
}

export function deriveAvailableActions(input: AvailableActionsInput): NotificationAvailableAction[] {
  const def = getEventTypeDefinition(input.eventType);
  if (def && !def.supportedRoles.includes(input.membershipRole as MembershipRole)) {
    return [];
  }

  const actions: NotificationAvailableAction[] = [];
  const domainStatus = input.status as unknown as DomainStatus;
  const isActive = ACTIVE_STATUSES.includes(input.status);
  const userSnoozed = isUserSnoozeActive(input.userSnoozedUntil, input.referenceNow);

  if (input.isRead) {
    actions.push('unread');
  } else {
    actions.push('read');
  }

  if (isActive && !input.isPersonallyAcknowledged) {
    actions.push('acknowledge');
  }

  if (isActive && !userSnoozed) {
    actions.push('snooze');
  }

  if (userSnoozed) {
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
