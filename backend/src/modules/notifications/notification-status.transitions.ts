import { NotificationStatus } from './notification.enums';

export class NotificationStatusTransitionError extends Error {
  constructor(
    public readonly from: NotificationStatus,
    public readonly to: NotificationStatus,
    message?: string,
  ) {
    super(message ?? `Invalid notification status transition: ${from} → ${to}`);
    this.name = 'NotificationStatusTransitionError';
  }
}

export interface NotificationStatusTransitionContext {
  /** Required for OPEN → ARCHIVED and RESOLVED → ARCHIVED */
  administrativeArchive?: boolean;
  /** Required for RESOLVED → OPEN (reopen path) */
  reopenAuthorized?: boolean;
}

const BASE_TRANSITIONS: Readonly<Record<NotificationStatus, readonly NotificationStatus[]>> = {
  [NotificationStatus.OPEN]: [
    NotificationStatus.ACKNOWLEDGED,
    NotificationStatus.SNOOZED,
    NotificationStatus.RESOLVED,
  ],
  [NotificationStatus.ACKNOWLEDGED]: [NotificationStatus.RESOLVED, NotificationStatus.SNOOZED],
  [NotificationStatus.SNOOZED]: [NotificationStatus.OPEN, NotificationStatus.RESOLVED],
  [NotificationStatus.RESOLVED]: [],
  [NotificationStatus.ARCHIVED]: [],
};

export function allowedNotificationStatusTargets(
  from: NotificationStatus,
  context: NotificationStatusTransitionContext = {},
): NotificationStatus[] {
  const base = [...(BASE_TRANSITIONS[from] ?? [])];
  if (from === NotificationStatus.OPEN && context.administrativeArchive) {
    base.push(NotificationStatus.ARCHIVED);
  }
  if (from === NotificationStatus.RESOLVED && context.reopenAuthorized) {
    base.push(NotificationStatus.OPEN);
  }
  if (from === NotificationStatus.RESOLVED && context.administrativeArchive) {
    base.push(NotificationStatus.ARCHIVED);
  }
  return base;
}

export function canTransitionNotificationStatus(
  from: NotificationStatus,
  to: NotificationStatus,
  context: NotificationStatusTransitionContext = {},
): boolean {
  return allowedNotificationStatusTargets(from, context).includes(to);
}

export function assertNotificationStatusTransition(
  from: NotificationStatus,
  to: NotificationStatus,
  context: NotificationStatusTransitionContext = {},
): void {
  if (!canTransitionNotificationStatus(from, to, context)) {
    throw new NotificationStatusTransitionError(from, to);
  }
}

export function isTerminalNotificationStatus(status: NotificationStatus): boolean {
  return status === NotificationStatus.ARCHIVED;
}

export function isActiveNotificationStatus(status: NotificationStatus): boolean {
  return (
    status === NotificationStatus.OPEN
    || status === NotificationStatus.ACKNOWLEDGED
    || status === NotificationStatus.SNOOZED
  );
}
