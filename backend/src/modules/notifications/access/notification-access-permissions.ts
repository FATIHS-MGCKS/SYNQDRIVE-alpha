import { MembershipRole } from '@prisma/client';

/**
 * Concrete API permission matrix for notification endpoints.
 * Source of truth for docs/security/notification-engine-access-control.md
 */
export type NotificationApiOperation =
  | 'list'
  | 'counts'
  | 'detail'
  | 'read'
  | 'unread'
  | 'acknowledge'
  | 'snooze'
  | 'unsnooze'
  | 'resolve'
  | 'archive'
  | 'delivery_retry'
  | 'admin_audit';

export type NotificationPermissionEffect = 'allow' | 'deny' | 'scoped' | 'conditional';

export interface NotificationPermissionRule {
  operation: NotificationApiOperation;
  roles: MembershipRole[];
  masterAdmin: NotificationPermissionEffect;
  stationScope: boolean;
  notes: string;
}

export const NOTIFICATION_API_PERMISSION_MATRIX: NotificationPermissionRule[] = [
  {
    operation: 'list',
    roles: [MembershipRole.ORG_ADMIN, MembershipRole.SUB_ADMIN, MembershipRole.WORKER, MembershipRole.DRIVER],
    masterAdmin: 'allow',
    stationScope: true,
    notes: 'Registry event-type filter + station scope SQL; preferences applied.',
  },
  {
    operation: 'counts',
    roles: [MembershipRole.ORG_ADMIN, MembershipRole.SUB_ADMIN, MembershipRole.WORKER, MembershipRole.DRIVER],
    masterAdmin: 'allow',
    stationScope: true,
    notes: 'Same visibility stack as list.',
  },
  {
    operation: 'detail',
    roles: [MembershipRole.ORG_ADMIN, MembershipRole.SUB_ADMIN, MembershipRole.WORKER, MembershipRole.DRIVER],
    masterAdmin: 'allow',
    stationScope: true,
    notes: '404 when out of org, role, station, or preference scope.',
  },
  {
    operation: 'read',
    roles: [MembershipRole.ORG_ADMIN, MembershipRole.SUB_ADMIN, MembershipRole.WORKER, MembershipRole.DRIVER],
    masterAdmin: 'allow',
    stationScope: true,
    notes: 'Per-user receipt only.',
  },
  {
    operation: 'unread',
    roles: [MembershipRole.ORG_ADMIN, MembershipRole.SUB_ADMIN, MembershipRole.WORKER, MembershipRole.DRIVER],
    masterAdmin: 'allow',
    stationScope: true,
    notes: 'Per-user receipt only.',
  },
  {
    operation: 'acknowledge',
    roles: [MembershipRole.ORG_ADMIN, MembershipRole.SUB_ADMIN, MembershipRole.WORKER, MembershipRole.DRIVER],
    masterAdmin: 'allow',
    stationScope: true,
    notes: 'Personal receipt — does not change org-wide status.',
  },
  {
    operation: 'snooze',
    roles: [MembershipRole.ORG_ADMIN, MembershipRole.SUB_ADMIN, MembershipRole.WORKER, MembershipRole.DRIVER],
    masterAdmin: 'allow',
    stationScope: true,
    notes: 'Personal receipt snooze.',
  },
  {
    operation: 'unsnooze',
    roles: [MembershipRole.ORG_ADMIN, MembershipRole.SUB_ADMIN, MembershipRole.WORKER, MembershipRole.DRIVER],
    masterAdmin: 'allow',
    stationScope: true,
    notes: 'Personal receipt unsnooze.',
  },
  {
    operation: 'resolve',
    roles: [MembershipRole.ORG_ADMIN, MembershipRole.SUB_ADMIN, MembershipRole.WORKER],
    masterAdmin: 'allow',
    stationScope: true,
    notes: 'Conditional on manual-resolution policy; DRIVER denied.',
  },
  {
    operation: 'archive',
    roles: [MembershipRole.ORG_ADMIN, MembershipRole.SUB_ADMIN],
    masterAdmin: 'allow',
    stationScope: true,
    notes: 'WORKER and DRIVER denied.',
  },
  {
    operation: 'delivery_retry',
    roles: [MembershipRole.ORG_ADMIN, MembershipRole.SUB_ADMIN],
    masterAdmin: 'allow',
    stationScope: false,
    notes: 'Admin-only operational endpoint when exposed; org-scoped.',
  },
  {
    operation: 'admin_audit',
    roles: [MembershipRole.ORG_ADMIN, MembershipRole.SUB_ADMIN],
    masterAdmin: 'allow',
    stationScope: false,
    notes: 'Activity log / retention purge visibility — org admin only.',
  },
];

export function isOperationAllowedForRole(
  operation: NotificationApiOperation,
  role: MembershipRole,
): boolean {
  const rule = NOTIFICATION_API_PERMISSION_MATRIX.find((r) => r.operation === operation);
  return rule?.roles.includes(role) ?? false;
}
