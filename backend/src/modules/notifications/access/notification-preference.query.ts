import {
  NotificationCategory,
  NotificationEventKind,
  NotificationSeverity,
  Prisma,
  type UserNotificationPreference,
} from '@prisma/client';
import { NOTIFICATION_EVENT_TYPE_DEFINITIONS } from '../registry/notification-event-registry.definitions';

function eventTypesForCategory(category: NotificationCategory): string[] {
  return NOTIFICATION_EVENT_TYPE_DEFINITIONS
    .filter((d) => d.preferenceCategory === category)
    .map((d) => d.eventType);
}

/**
 * Build Prisma where clauses reflecting user notification preferences.
 * Mandatory SECURITY + CRITICAL overrides remain visible.
 * Dashboard STATE insights stay visible in the inbox (V1 parity); prefs gate ALERT delivery only.
 */
export function buildPreferenceWhereClause(
  preferences: UserNotificationPreference[],
): Prisma.NotificationWhereInput | null {
  const and: Prisma.NotificationWhereInput[] = [];

  for (const pref of preferences) {
    if (pref.inApp) continue;
    // SECURITY cannot be fully disabled (account layer); still skip hiding security events.
    if (pref.category === NotificationCategory.SECURITY) continue;

    const eventTypes = eventTypesForCategory(pref.category);
    if (!eventTypes.length) continue;

    and.push({
      NOT: {
        AND: [
          { eventType: { in: eventTypes } },
          { eventKind: { not: NotificationEventKind.STATE } },
          { severity: { not: NotificationSeverity.CRITICAL } },
        ],
      },
    });
  }

  for (const pref of preferences) {
    if (!pref.criticalOnly) continue;
    const eventTypes = eventTypesForCategory(pref.category);
    if (!eventTypes.length) continue;

    and.push({
      NOT: {
        AND: [
          { eventType: { in: eventTypes } },
          { eventKind: { not: NotificationEventKind.STATE } },
          { severity: { not: NotificationSeverity.CRITICAL } },
        ],
      },
    });
  }

  if (!and.length) return null;
  return { AND: and };
}

export function buildUserSnoozeExclusionClause(
  userId: string,
  referenceNow: Date,
): Prisma.NotificationWhereInput {
  return {
    NOT: {
      AND: [
        { severity: { not: NotificationSeverity.CRITICAL } },
        {
          receipts: {
            some: {
              userId,
              snoozedUntil: { gt: referenceNow },
            },
          },
        },
      ],
    },
  };
}
