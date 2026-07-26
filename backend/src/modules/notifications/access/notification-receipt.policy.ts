import { NotificationDomain, Prisma } from '@prisma/client';
import { ORG_MANDATORY_EVENT_TYPES } from './notification-mandatory.policy';

/**
 * Receipt field semantics — per-user overlay on org-wide notification lifecycle.
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
