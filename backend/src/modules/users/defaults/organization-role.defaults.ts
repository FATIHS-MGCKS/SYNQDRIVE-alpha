import { MembershipRole } from '@prisma/client';
import type { MembershipPermissionsMap } from '@shared/auth/permission.util';

export interface DefaultRoleTemplate {
  systemKey: string;
  name: string;
  description: string;
  membershipRole: MembershipRole;
  isDefault?: boolean;
  fieldAgentAccessDefault?: boolean;
  permissions: MembershipPermissionsMap;
}

const all = (read: boolean, write: boolean, manage = false) => ({ read, write, manage });

function adminPermissions(): MembershipPermissionsMap {
  const keys = [
    'dashboard', 'bookings', 'fleet', 'customers', 'stations', 'fleet-condition',
    'invoices', 'fines', 'price-tariffs', 'tasks', 'vendor-management',
    'ai-assistant', 'workflow-automation', 'document-upload', 'company-info',
    'users-roles', 'fleet-connectivity', 'data-analyse', 'data-authorization', 'billing', 'support',
  ] as const;
  const perms: MembershipPermissionsMap = {};
  for (const key of keys) {
    perms[key] = all(true, true, true);
  }
  return perms;
}

function subAdminPermissions(): MembershipPermissionsMap {
  const perms = adminPermissions();
  for (const key of Object.keys(perms)) {
    if (['company-info', 'users-roles', 'billing', 'data-authorization'].includes(key)) {
      perms[key as keyof MembershipPermissionsMap] = all(true, false, false);
    }
  }
  return perms;
}

function workerReadPermissions(extraWrite: string[] = []): MembershipPermissionsMap {
  const readKeys = [
    'dashboard', 'fleet', 'bookings', 'customers', 'stations', 'tasks', 'support',
  ];
  const perms: MembershipPermissionsMap = {};
  for (const key of [
    'dashboard', 'bookings', 'fleet', 'customers', 'stations', 'fleet-condition',
    'invoices', 'fines', 'price-tariffs', 'tasks', 'vendor-management',
    'ai-assistant', 'workflow-automation', 'document-upload', 'company-info',
    'users-roles', 'fleet-connectivity', 'data-analyse', 'data-authorization', 'billing', 'support',
  ]) {
    const canRead = readKeys.includes(key);
    const canWrite = extraWrite.includes(key);
    perms[key as keyof MembershipPermissionsMap] = all(canRead, canWrite, false);
  }
  return perms;
}

export const DEFAULT_ORGANIZATION_ROLE_TEMPLATES: DefaultRoleTemplate[] = [
  {
    systemKey: 'org_admin',
    name: 'Org Admin',
    description: 'Vollzugriff auf alle Mandantenfunktionen.',
    membershipRole: MembershipRole.ORG_ADMIN,
    isDefault: true,
    fieldAgentAccessDefault: true,
    permissions: adminPermissions(),
  },
  {
    systemKey: 'sub_admin',
    name: 'Sub Admin',
    description: 'Operativer Zugriff ohne sensible Administration.',
    membershipRole: MembershipRole.SUB_ADMIN,
    permissions: subAdminPermissions(),
  },
  {
    systemKey: 'disposition',
    name: 'Disposition',
    description: 'Buchungen, Flotte und Kunden im Tagesgeschäft.',
    membershipRole: MembershipRole.SUB_ADMIN,
    permissions: workerReadPermissions(['bookings', 'customers', 'fleet']),
  },
  {
    systemKey: 'accounting',
    name: 'Buchhaltung',
    description: 'Rechnungen, Mahnungen und Finanzdaten.',
    membershipRole: MembershipRole.SUB_ADMIN,
    permissions: workerReadPermissions(['invoices', 'fines', 'price-tariffs']),
  },
  {
    systemKey: 'station_manager',
    name: 'Stationsleiter',
    description: 'Stationen, Übergaben und lokale Flotte.',
    membershipRole: MembershipRole.SUB_ADMIN,
    fieldAgentAccessDefault: true,
    permissions: workerReadPermissions(['stations', 'bookings', 'fleet', 'tasks']),
  },
  {
    systemKey: 'employee',
    name: 'Mitarbeiter',
    description: 'Standardzugriff für operative Mitarbeit.',
    membershipRole: MembershipRole.WORKER,
    permissions: workerReadPermissions(),
  },
  {
    systemKey: 'driver',
    name: 'Fahrer',
    description: 'Eingeschränkter Zugriff für Fahrer.',
    membershipRole: MembershipRole.DRIVER,
    permissions: workerReadPermissions(['bookings']),
  },
  {
    systemKey: 'field_agent',
    name: 'Field Agent / Übergabe',
    description: 'Übergabe- und Rückgabeprozesse vor Ort.',
    membershipRole: MembershipRole.WORKER,
    fieldAgentAccessDefault: true,
    permissions: workerReadPermissions(['bookings', 'fleet', 'tasks']),
  },
  {
    systemKey: 'service',
    name: 'Service / Werkstatt',
    description: 'Werkstatt, Servicepartner und Fahrzeugzustand.',
    membershipRole: MembershipRole.WORKER,
    permissions: workerReadPermissions(['vendor-management', 'fleet-condition', 'fleet']),
  },
  {
    systemKey: 'read_only',
    name: 'Read-only',
    description: 'Nur Lesezugriff auf operative Bereiche.',
    membershipRole: MembershipRole.WORKER,
    permissions: workerReadPermissions(),
  },
];
