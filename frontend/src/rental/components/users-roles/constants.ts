import {
  Activity,
  AlertCircle,
  Briefcase,
  Building2,
  Calendar,
  Car,
  CreditCard,
  FileText,
  Headphones,
  LayoutDashboard,
  ListTodo,
  Lock,
  MapPin,
  MessageSquare,
  Tag,
  Upload,
  UserCog,
  Users,
  Wifi,
  Zap,
  type LucideIcon,
} from 'lucide-react';
import type { MembershipPermissionsMap } from '../../../lib/api';

export type PermissionLevel = 'none' | 'read' | 'write' | 'manage';

export interface PermissionModuleDef {
  key: string;
  label: string;
  icon: LucideIcon;
  group: string;
}

/** Gruppierte Module — spiegelt Backend-Keys, Labels auf Deutsch */
export const PERMISSION_MODULES: PermissionModuleDef[] = [
  { key: 'dashboard', label: 'Dashboard', icon: LayoutDashboard, group: 'Dashboard' },
  { key: 'bookings', label: 'Buchungen', icon: Calendar, group: 'Buchungen' },
  { key: 'customers', label: 'Kunden', icon: Users, group: 'Kunden' },
  { key: 'fleet', label: 'Flotte', icon: Car, group: 'Flotte' },
  { key: 'fleet-condition', label: 'Fahrzeugzustand', icon: Activity, group: 'Health' },
  { key: 'vendor-management', label: 'Service & Werkstatt', icon: Briefcase, group: 'Service' },
  { key: 'tasks', label: 'Aufgaben', icon: ListTodo, group: 'Aufgaben' },
  { key: 'invoices', label: 'Kundenrechnungen', icon: FileText, group: 'Finanzen' },
  { key: 'payments-connect', label: 'Kundenzahlungen', icon: CreditCard, group: 'Finanzen' },
  { key: 'fines', label: 'Bußgelder', icon: AlertCircle, group: 'Finanzen' },
  { key: 'price-tariffs', label: 'Preise & Tarife', icon: Tag, group: 'Preise & Tarife' },
  { key: 'ai-assistant', label: 'Insights & KI', icon: MessageSquare, group: 'Insights' },
  { key: 'document-upload', label: 'Dokumente', icon: Upload, group: 'Dokumente' },
  { key: 'workflow-automation', label: 'Workflow-Automatisierung', icon: Zap, group: 'Workflow' },
  { key: 'company-info', label: 'Unternehmensinformationen', icon: Building2, group: 'Unternehmen' },
  { key: 'users-roles', label: 'Benutzer & Rollen', icon: UserCog, group: 'Benutzer & Rollen' },
  { key: 'stations', label: 'Stationen', icon: MapPin, group: 'Stationen' },
  { key: 'fleet-connectivity', label: 'Flotten-Konnektivität', icon: Wifi, group: 'Integrationen' },
  { key: 'data-analyse', label: 'Data Analyse', icon: Activity, group: 'Integrationen' },
  { key: 'data-authorization', label: 'Datenfreigaben', icon: Lock, group: 'Integrationen' },
  { key: 'billing', label: 'SynqDrive-Abrechnung', icon: CreditCard, group: 'Administration' },
  { key: 'support', label: 'Hilfe-Center', icon: Headphones, group: 'Administration' },
];

export const PERMISSION_GROUPS = [
  'Dashboard',
  'Buchungen',
  'Kunden',
  'Flotte',
  'Health',
  'Service',
  'Aufgaben',
  'Finanzen',
  'Preise & Tarife',
  'Insights',
  'Dokumente',
  'Workflow',
  'Unternehmen',
  'Benutzer & Rollen',
  'Stationen',
  'Integrationen',
  'Administration',
] as const;

export const MEMBERSHIP_ROLE_LABELS: Record<string, string> = {
  ORG_ADMIN: 'Organisations-Admin',
  SUB_ADMIN: 'Sub-Admin',
  WORKER: 'Mitarbeiter',
  DRIVER: 'Fahrer',
};

export const ACCESS_CONTROL_TABS = [
  { id: 'users' as const, label: 'Benutzer' },
  { id: 'invites' as const, label: 'Einladungen' },
  { id: 'roles' as const, label: 'Rollen' },
  { id: 'scopes' as const, label: 'Zugriffsbereiche' },
  { id: 'security' as const, label: 'Sicherheit & Aktivität' },
];

export const AUDIT_ACTION_LABELS: Record<string, string> = {
  USER_CREATED: 'Benutzer erstellt',
  USER_UPDATED: 'Benutzer aktualisiert',
  USER_DEACTIVATED: 'Benutzer deaktiviert',
  USER_REACTIVATED: 'Benutzer reaktiviert',
  USER_REMOVED_FROM_ORG: 'Aus Organisation entfernt',
  USER_ROLE_CHANGED: 'Rolle geändert',
  USER_PERMISSIONS_CHANGED: 'Berechtigungen geändert',
  USER_STATION_SCOPE_CHANGED: 'Standortzugriff geändert',
  USER_PASSWORD_RESET_BY_ADMIN: 'Passwort zurückgesetzt',
  USER_INVITED: 'Einladung versendet',
  USER_INVITE_RESENT: 'Einladung erneut gesendet',
  USER_INVITE_REVOKED: 'Einladung widerrufen',
  USER_INVITE_ACCEPTED: 'Einladung angenommen',
  ROLE_CREATED: 'Rolle erstellt',
  ROLE_UPDATED: 'Rolle aktualisiert',
  ROLE_DELETED: 'Rolle gelöscht',
  ROLE_ASSIGNED: 'Rolle zugewiesen',
};

export function permissionLevelFrom(
  p?: { read: boolean; write: boolean; manage?: boolean } | null,
): PermissionLevel {
  if (!p || (!p.read && !p.write && !p.manage)) return 'none';
  if (p.manage) return 'manage';
  if (p.write) return 'write';
  if (p.read) return 'read';
  return 'none';
}

export function applyPermissionLevel(
  level: PermissionLevel,
): { read: boolean; write: boolean; manage?: boolean } {
  switch (level) {
    case 'manage':
      return { read: true, write: true, manage: true };
    case 'write':
      return { read: true, write: true, manage: false };
    case 'read':
      return { read: true, write: false, manage: false };
    default:
      return { read: false, write: false, manage: false };
  }
}

export function permissionsFromRoleTemplate(
  role: { membershipRole: string; permissions: MembershipPermissionsMap | null },
): MembershipPermissionsMap {
  if (role.permissions && Object.keys(role.permissions).length > 0) {
    return role.permissions;
  }
  const perms: MembershipPermissionsMap = {};
  for (const m of PERMISSION_MODULES) {
    if (role.membershipRole === 'ORG_ADMIN') {
      perms[m.key] = { read: true, write: true, manage: true };
    } else {
      perms[m.key] = { read: false, write: false, manage: false };
    }
  }
  return perms;
}
