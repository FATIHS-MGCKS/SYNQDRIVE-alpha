import { NotificationDomain, NotificationSeverity, Prisma } from '@prisma/client';
import {
  isMandatoryNotification,
  ORG_MANDATORY_EVENT_TYPES,
} from './notification-mandatory.policy';

/**
 * Receipt field semantics — per-user overlay on org-wide notification lifecycle.
 *
 * Org-wide lifecycle (OPEN/ACKNOWLEDGED/SNOOZED/RESOLVED/ARCHIVED) lives on `notifications`.
 * Personal inbox state lives on `notification_receipts` only.
 */
export function isUserSnoozeActive(
  snoozedUntil: Date | null | undefined,
  referenceNow: Date = new Date(),
): boolean {
  return !!snoozedUntil && snoozedUntil.getTime() > referenceNow.getTime();
}

export function isPersonallyAcknowledged(
  acknowledgedAt: Date | null | undefined,
): boolean {
  return acknowledgedAt != null;
}

export function isUnreadForUser(readAt: Date | null | undefined): boolean {
  return readAt == null;
}

export function isPersonallyHidden(
  hiddenAt: Date | null | undefined,
): boolean {
  return hiddenAt != null;
}

/** Compliance / security notifications cannot be removed from the operational record via hide. */
export function canPersonallyHideNotification(
  eventType: string,
  severity: NotificationSeverity,
): boolean {
  return !isMandatoryNotification(eventType, severity);
}

export function assertReceiptBelongsToUser(
  receiptUserId: string,
  actingUserId: string,
): void {
  if (receiptUserId !== actingUserId) {
    throw new Error('Receipt access denied: user mismatch');
  }
}

/**
 * Personal hide removes a notification from the user's inbox only.
 * Mandatory / compliance-critical rows remain visible.
 */
export function buildUserHiddenExclusionClause(userId: string): Prisma.NotificationWhereInput {
  const mandatoryTypes = [...ORG_MANDATORY_EVENT_TYPES];
  return {
    OR: [
      { eventType: { in: mandatoryTypes } },
      { domain: NotificationDomain.SECURITY },
      {
        NOT: {
          receipts: {
            some: {
              userId,
              hiddenAt: { not: null },
            },
          },
        },
      },
    ],
  };
}
