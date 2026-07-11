import {
  NotificationDomain,
  NotificationEntityType,
  NotificationSeverity,
} from '@prisma/client';
import type { NotificationScopeRow } from './notification-access.types';

/** Event types that remain visible regardless of station scope when role allows. */
export const ORG_WIDE_EVENT_TYPES = new Set([
  'INTEGRATION_DISCONNECTED',
  'WEBHOOK_FAILURE',
]);

/**
 * Organisation-wide notifications bypass station scope for eligible roles.
 * Derived from product rules — not invented roles.
 */
export function isOrgWideNotification(row: Pick<NotificationScopeRow, 'eventType' | 'domain' | 'severity' | 'entityType'>): boolean {
  if (ORG_WIDE_EVENT_TYPES.has(row.eventType)) {
    return true;
  }
  if (row.entityType === NotificationEntityType.ORGANIZATION) {
    return true;
  }
  if (row.domain === NotificationDomain.SECURITY && row.severity === NotificationSeverity.CRITICAL) {
    return true;
  }
  return false;
}

export function buildOrgWideScopeOrClause() {
  return {
    OR: [
      { eventType: { in: [...ORG_WIDE_EVENT_TYPES] } },
      { entityType: NotificationEntityType.ORGANIZATION },
      {
        AND: [
          { domain: NotificationDomain.SECURITY },
          { severity: NotificationSeverity.CRITICAL },
        ],
      },
    ],
  };
}
