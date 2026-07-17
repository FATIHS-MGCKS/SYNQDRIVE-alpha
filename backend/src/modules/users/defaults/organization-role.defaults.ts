import { MembershipRole } from '@prisma/client';
import type { MembershipPermissionsMap } from '@shared/auth/permission.util';
import {
  STATIONS_V2_ROLE_DEFAULTS,
} from '@shared/auth/stations-v2-role-permissions';
import type { StationsV2PermissionsMap } from '@shared/auth/stations-v2-permission.constants';

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

function paymentModulePermissions(config: {
  payments?: { read: boolean; write: boolean };
  refund?: boolean;
  disputesRead?: boolean;
  connectRead?: boolean;
  connectManage?: boolean;
  settingsManage?: boolean;
}): MembershipPermissionsMap {
  const perms: MembershipPermissionsMap = {};
  if (config.payments) {
    perms.payments = all(config.payments.read, config.payments.write);
  }
  if (config.refund !== undefined) {
    perms['payments-refund'] = all(config.refund, config.refund);
  }
  if (config.disputesRead !== undefined) {
    perms['payments-disputes'] = all(config.disputesRead, false);
  }
  if (config.connectRead !== undefined || config.connectManage !== undefined) {
    perms['payments-connect'] = all(
      config.connectRead ?? false,
      false,
      config.connectManage ?? false,
    );
  }
  if (config.settingsManage !== undefined) {
    perms['payments-settings'] = all(false, false, config.settingsManage);
  }
  return perms;
}

function mergePermissions(
  base: MembershipPermissionsMap,
  extra: MembershipPermissionsMap,
): MembershipPermissionsMap {
  return { ...base, ...extra };
}

function withStationsV2Permissions(
  permissions: MembershipPermissionsMap,
  systemKey: string,
): MembershipPermissionsMap & { stationsV2?: StationsV2PermissionsMap } {
  const stationsV2 = STATIONS_V2_ROLE_DEFAULTS[systemKey];
  if (!stationsV2) return permissions;
  return { ...permissions, stationsV2 };
}

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
  return mergePermissions(perms, paymentModulePermissions({
    payments: { read: true, write: true },
    refund: true,
    disputesRead: true,
    connectRead: true,
    connectManage: true,
    settingsManage: true,
  }));
}

function subAdminPermissions(): MembershipPermissionsMap {
  const perms = adminPermissions();
  for (const key of Object.keys(perms)) {
    if (['company-info', 'users-roles', 'billing', 'data-authorization'].includes(key)) {
      perms[key as keyof MembershipPermissionsMap] = all(true, false, false);
    }
  }
  for (const key of [
    'payments',
    'payments-refund',
    'payments-disputes',
    'payments-connect',
    'payments-settings',
  ] as const) {
    delete perms[key];
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
    permissions: withStationsV2Permissions(adminPermissions(), 'org_admin'),
  },
  {
    systemKey: 'sub_admin',
    name: 'Sub Admin',
    description: 'Operativer Zugriff ohne sensible Administration.',
    membershipRole: MembershipRole.SUB_ADMIN,
    permissions: withStationsV2Permissions(subAdminPermissions(), 'sub_admin'),
  },
  {
    systemKey: 'disposition',
    name: 'Disposition',
    description: 'Buchungen, Flotte und Kunden im Tagesgeschäft.',
    membershipRole: MembershipRole.SUB_ADMIN,
    permissions: withStationsV2Permissions(
      mergePermissions(
        workerReadPermissions(['bookings', 'customers', 'fleet']),
        paymentModulePermissions({
          payments: { read: true, write: true },
          disputesRead: true,
        }),
      ),
      'disposition',
    ),
  },
  {
    systemKey: 'accounting',
    name: 'Buchhaltung',
    description: 'Rechnungen, Mahnungen und Finanzdaten.',
    membershipRole: MembershipRole.SUB_ADMIN,
    permissions: withStationsV2Permissions(
      mergePermissions(
        workerReadPermissions(['invoices', 'fines', 'price-tariffs']),
        paymentModulePermissions({
          payments: { read: true, write: true },
          refund: true,
          disputesRead: true,
          connectRead: true,
        }),
      ),
      'accounting',
    ),
  },
  {
    systemKey: 'station_manager',
    name: 'Stationsleiter',
    description: 'Stationen, Übergaben und lokale Flotte.',
    membershipRole: MembershipRole.SUB_ADMIN,
    fieldAgentAccessDefault: true,
    permissions: withStationsV2Permissions(
      mergePermissions(
        workerReadPermissions(['stations', 'bookings', 'fleet', 'tasks']),
        paymentModulePermissions({
          payments: { read: true, write: true },
          disputesRead: true,
        }),
      ),
      'station_manager',
    ),
  },
  {
    systemKey: 'employee',
    name: 'Mitarbeiter',
    description: 'Standardzugriff für operative Mitarbeit.',
    membershipRole: MembershipRole.WORKER,
    permissions: withStationsV2Permissions(
      mergePermissions(
        workerReadPermissions(),
        paymentModulePermissions({ payments: { read: true, write: false } }),
      ),
      'employee',
    ),
  },
  {
    systemKey: 'driver',
    name: 'Fahrer',
    description: 'Eingeschränkter Zugriff für Fahrer.',
    membershipRole: MembershipRole.DRIVER,
    permissions: withStationsV2Permissions(workerReadPermissions(['bookings']), 'driver'),
  },
  {
    systemKey: 'field_agent',
    name: 'Field Agent / Übergabe',
    description: 'Übergabe- und Rückgabeprozesse vor Ort.',
    membershipRole: MembershipRole.WORKER,
    fieldAgentAccessDefault: true,
    permissions: withStationsV2Permissions(
      mergePermissions(
        workerReadPermissions(['bookings', 'fleet', 'tasks']),
        paymentModulePermissions({ payments: { read: true, write: false } }),
      ),
      'field_agent',
    ),
  },
  {
    systemKey: 'service',
    name: 'Service / Werkstatt',
    description: 'Werkstatt, Servicepartner und Fahrzeugzustand.',
    membershipRole: MembershipRole.WORKER,
    permissions: withStationsV2Permissions(
      mergePermissions(
        workerReadPermissions(['vendor-management', 'fleet-condition', 'fleet']),
        paymentModulePermissions({ payments: { read: true, write: false } }),
      ),
      'service',
    ),
  },
  {
    systemKey: 'read_only',
    name: 'Read-only',
    description: 'Nur Lesezugriff auf operative Bereiche.',
    membershipRole: MembershipRole.WORKER,
    permissions: withStationsV2Permissions(
      mergePermissions(
        workerReadPermissions(),
        paymentModulePermissions({ payments: { read: true, write: false } }),
      ),
      'read_only',
    ),
  },
];
