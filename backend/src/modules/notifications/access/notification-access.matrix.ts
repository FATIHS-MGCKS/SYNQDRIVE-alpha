import { MembershipRole } from '@prisma/client';
import { NOTIFICATION_EVENT_TYPE_DEFINITIONS } from '../registry/notification-event-registry.definitions';
import { NotificationDomain } from '../notification.enums';

export type NotificationAccessMatrixRole =
  | 'MASTER_ADMIN'
  | 'ORG_ADMIN'
  | 'SUB_ADMIN'
  | 'WORKER'
  | 'DRIVER'
  | 'CUSTOMER';

export interface RoleMatrixEntry {
  role: NotificationAccessMatrixRole;
  apiAccess: boolean;
  stationScopeApplies: boolean;
  eventTypesVisible: string[];
  domainsVisible: NotificationDomain[];
  canResolve: boolean;
  canArchive: boolean;
  notes: string;
}

const OPS = [MembershipRole.ORG_ADMIN, MembershipRole.SUB_ADMIN, MembershipRole.WORKER] as const;

function eventTypesForRoles(roles: readonly MembershipRole[]): string[] {
  return NOTIFICATION_EVENT_TYPE_DEFINITIONS
    .filter((d) => roles.some((r) => (d.supportedRoles as readonly MembershipRole[]).includes(r)))
    .map((d) => d.eventType);
}

function domainsForEventTypes(eventTypes: string[]): NotificationDomain[] {
  const domains = new Set<NotificationDomain>();
  for (const et of eventTypes) {
    const def = NOTIFICATION_EVENT_TYPE_DEFINITIONS.find((d) => d.eventType === et);
    if (def) domains.add(def.domain as NotificationDomain);
  }
  return [...domains];
}

export const NOTIFICATION_ACCESS_MATRIX: RoleMatrixEntry[] = [
  {
    role: 'MASTER_ADMIN',
    apiAccess: true,
    stationScopeApplies: false,
    eventTypesVisible: NOTIFICATION_EVENT_TYPE_DEFINITIONS.map((d) => d.eventType),
    domainsVisible: domainsForEventTypes(NOTIFICATION_EVENT_TYPE_DEFINITIONS.map((d) => d.eventType)),
    canResolve: true,
    canArchive: true,
    notes: 'Platform role — bypasses station scope via OrgScopingGuard; uses target org membership for actions.',
  },
  {
    role: 'ORG_ADMIN',
    apiAccess: true,
    stationScopeApplies: false,
    eventTypesVisible: eventTypesForRoles([MembershipRole.ORG_ADMIN, ...OPS]),
    domainsVisible: domainsForEventTypes(eventTypesForRoles(OPS)),
    canResolve: true,
    canArchive: true,
    notes: 'Full org visibility; stationScope ALL or unset.',
  },
  {
    role: 'SUB_ADMIN',
    apiAccess: true,
    stationScopeApplies: true,
    eventTypesVisible: eventTypesForRoles(OPS),
    domainsVisible: domainsForEventTypes(eventTypesForRoles(OPS)),
    canResolve: true,
    canArchive: true,
    notes: 'Station-scoped when membership.stationScope set; org-wide critical/system events still visible.',
  },
  {
    role: 'WORKER',
    apiAccess: true,
    stationScopeApplies: true,
    eventTypesVisible: eventTypesForRoles(OPS),
    domainsVisible: domainsForEventTypes(eventTypesForRoles(OPS)),
    canResolve: true,
    canArchive: false,
    notes: 'Station-scoped; billing/org settings redacted in API.',
  },
  {
    role: 'DRIVER',
    apiAccess: true,
    stationScopeApplies: false,
    eventTypesVisible: eventTypesForRoles([MembershipRole.DRIVER, ...OPS]),
    domainsVisible: domainsForEventTypes(eventTypesForRoles([MembershipRole.DRIVER])),
    canResolve: false,
    canArchive: false,
    notes: 'Subset: booking/handover events only per registry; no billing params.',
  },
  {
    role: 'CUSTOMER',
    apiAccess: false,
    stationScopeApplies: false,
    eventTypesVisible: [],
    domainsVisible: [],
    canResolve: false,
    canArchive: false,
    notes: 'No MembershipRole.CUSTOMER in schema — external customers have no org notification API.',
  },
];

export function matrixEntryForRole(
  role: MembershipRole | 'MASTER_ADMIN',
): RoleMatrixEntry | undefined {
  return NOTIFICATION_ACCESS_MATRIX.find((e) => e.role === role);
}
