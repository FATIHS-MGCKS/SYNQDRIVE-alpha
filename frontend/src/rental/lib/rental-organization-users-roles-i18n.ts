/**
 * Rental Users & Roles member-management presentation adapter (P2.2.62).
 * Presentation-only: labels, formatting, and translation key resolution.
 */
import {
  DEFAULT_PRODUCT_LOCALE,
  getFormattingLocale,
  isSupportedLocale,
  type SupportedLocale,
} from '../../i18n/locales';
import type { TranslationKey } from '../../i18n/translations/en';
import type { MembershipPermissionsMap } from '../../lib/api';
import {
  PERMISSION_GROUPS,
  PERMISSION_MODULES,
  permissionLevelFrom,
  type PermissionLevel,
} from '../components/users-roles/constants';

export type IamMemberTranslate = (
  key: TranslationKey,
  vars?: Record<string, string | number>,
) => string;

const MEMBERSHIP_STATUS_KEYS = {
  INVITED: 'iam.member.status.INVITED',
  ACTIVE: 'iam.member.status.ACTIVE',
  SUSPENDED: 'iam.member.status.SUSPENDED',
  OFFBOARDING: 'iam.member.status.OFFBOARDING',
  REMOVED: 'iam.member.status.REMOVED',
  REACTIVATION_REQUIRED: 'iam.member.status.REACTIVATION_REQUIRED',
} as const satisfies Record<string, TranslationKey>;

const AUDIT_ACTION_KEYS = {
  USER_CREATED: 'iam.audit.USER_CREATED',
  USER_UPDATED: 'iam.audit.USER_UPDATED',
  USER_DEACTIVATED: 'iam.audit.USER_DEACTIVATED',
  USER_REACTIVATED: 'iam.audit.USER_REACTIVATED',
  USER_REMOVED_FROM_ORG: 'iam.audit.USER_REMOVED_FROM_ORG',
  USER_ROLE_CHANGED: 'iam.audit.USER_ROLE_CHANGED',
  USER_PERMISSIONS_CHANGED: 'iam.audit.USER_PERMISSIONS_CHANGED',
  USER_STATION_SCOPE_CHANGED: 'iam.audit.USER_STATION_SCOPE_CHANGED',
  USER_PASSWORD_RESET_BY_ADMIN: 'iam.audit.USER_PASSWORD_RESET_BY_ADMIN',
  USER_INVITED: 'iam.audit.USER_INVITED',
  USER_INVITE_RESENT: 'iam.audit.USER_INVITE_RESENT',
  USER_INVITE_REVOKED: 'iam.audit.USER_INVITE_REVOKED',
  USER_INVITE_ACCEPTED: 'iam.audit.USER_INVITE_ACCEPTED',
  ROLE_CREATED: 'iam.audit.ROLE_CREATED',
  ROLE_UPDATED: 'iam.audit.ROLE_UPDATED',
  ROLE_DELETED: 'iam.audit.ROLE_DELETED',
  ROLE_ASSIGNED: 'iam.audit.ROLE_ASSIGNED',
} as const satisfies Record<string, TranslationKey>;

const WIZARD_STEP_KEYS = {
  person: 'iam.wizard.step.person',
  role: 'iam.wizard.step.role',
  access: 'iam.wizard.step.access',
  invite: 'iam.wizard.step.invite',
  summary: 'iam.wizard.step.summary',
} as const;

const PERMISSION_MODULE_NAV_KEYS: Record<string, TranslationKey> = {
  dashboard: 'nav.dashboard',
  bookings: 'nav.bookings',
  customers: 'nav.customers',
  fleet: 'nav.fleet',
  'fleet-condition': 'nav.fleetCondition',
  'vendor-management': 'nav.vendorManagement',
  tasks: 'nav.tasks',
  invoices: 'nav.invoices',
  payments: 'nav.customerPayments',
  fines: 'nav.fines',
  'price-tariffs': 'nav.pricingTariffs',
  'rental-rules': 'nav.rentalRules',
  'ai-assistant': 'nav.aiAssistant',
  'document-upload': 'nav.upload',
  'legal-documents': 'nav.legalDocuments',
  'workflow-automation': 'nav.workflowAutomation',
  'company-info': 'nav.companyInfo',
  'users-roles': 'nav.usersRoles',
  stations: 'nav.stations',
  'data-analyse': 'nav.dataAnalyse',
  'data-authorization': 'nav.dataAuthorization',
  billing: 'nav.billingSubscription',
  support: 'nav.helpCenter',
  'fleet-connectivity': 'nav.integrations',
};

const PERMISSION_GROUP_LABEL_KEYS: Record<string, TranslationKey> = {
  Dashboard: 'nav.dashboard',
  Buchungen: 'nav.bookings',
  Kunden: 'nav.customers',
  Flotte: 'nav.fleet',
  Health: 'nav.fleetCondition',
  Service: 'nav.vendorManagement',
  Aufgaben: 'nav.tasks',
  Finanzen: 'nav.finance',
  'Preise & Tarife': 'nav.pricingTariffs',
  Insights: 'nav.insights',
  Dokumente: 'nav.upload',
  Workflow: 'nav.workflowAutomation',
  Unternehmen: 'nav.companyInfo',
  'Benutzer & Rollen': 'nav.usersRoles',
  Stationen: 'nav.stations',
  Integrationen: 'nav.integrations',
  Administration: 'nav.administration',
};

const PERMISSION_MODULE_SPECIFIC_KEYS = {
  'payments-refund': 'iam.permission.module.payments-refund',
  'payments-disputes': 'iam.permission.module.payments-disputes',
  'payments-connect': 'iam.permission.module.payments-connect',
  'payments-settings': 'iam.permission.module.payments-settings',
  'rental-rules-publish': 'iam.permission.module.rental-rules-publish',
  'rental-rules-assign': 'iam.permission.module.rental-rules-assign',
  'rental-rules-overrides': 'iam.permission.module.rental-rules-overrides',
  'booking-eligibility': 'iam.permission.module.booking-eligibility',
  'booking-eligibility-override': 'iam.permission.module.booking-eligibility-override',
  'fleet-connectivity': 'iam.permission.module.fleet-connectivity',
} as const satisfies Record<string, TranslationKey>;

const PERMISSION_LEVEL_KEYS: Record<PermissionLevel, TranslationKey> = {
  none: 'iam.permission.level.none',
  read: 'iam.permission.level.read',
  write: 'iam.permission.level.write',
  manage: 'iam.permission.level.manage',
};

export function iamMemberFormattingLocale(locale: string): string {
  return isSupportedLocale(locale)
    ? getFormattingLocale(locale as SupportedLocale)
    : getFormattingLocale(DEFAULT_PRODUCT_LOCALE);
}

export function resolveMembershipStatusLabel(
  status: string | null | undefined,
  t: IamMemberTranslate,
): string {
  const machine = status?.trim();
  if (!machine) return '—';
  const key = MEMBERSHIP_STATUS_KEYS[machine as keyof typeof MEMBERSHIP_STATUS_KEYS];
  return key ? t(key) : machine;
}

export function resolveAuditActionLabel(
  action: string | null | undefined,
  t: IamMemberTranslate,
): string | null {
  const machine = action?.trim();
  if (!machine) return null;
  const key = AUDIT_ACTION_KEYS[machine as keyof typeof AUDIT_ACTION_KEYS];
  return key ? t(key) : null;
}

export function resolveWizardStepLabel(step: keyof typeof WIZARD_STEP_KEYS, t: IamMemberTranslate): string {
  return t(WIZARD_STEP_KEYS[step]);
}

export function formatIamMemberDateTime(
  value: string | null | undefined,
  locale: string,
): string {
  if (!value) return '—';
  try {
    return new Intl.DateTimeFormat(iamMemberFormattingLocale(locale), {
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(new Date(value));
  } catch {
    return value;
  }
}

export function resolvePermissionModuleLabel(moduleKey: string, t: IamMemberTranslate): string {
  const machine = moduleKey.trim();
  if (!machine) return '—';
  const navKey = PERMISSION_MODULE_NAV_KEYS[machine];
  if (navKey) return t(navKey);
  const specificKey = PERMISSION_MODULE_SPECIFIC_KEYS[machine as keyof typeof PERMISSION_MODULE_SPECIFIC_KEYS];
  if (specificKey) return t(specificKey);
  return machine;
}

export function resolvePermissionGroupLabel(group: string, t: IamMemberTranslate): string {
  const machine = group.trim();
  if (!machine) return '—';
  const key = PERMISSION_GROUP_LABEL_KEYS[machine];
  return key ? t(key) : machine;
}

export function resolvePermissionLevelLabel(level: PermissionLevel, t: IamMemberTranslate): string {
  return t(PERMISSION_LEVEL_KEYS[level]);
}

export function buildPermissionPreviewLines(
  permissions: MembershipPermissionsMap | null,
  t: IamMemberTranslate,
  max = 12,
): string[] {
  if (!permissions) return [t('iam.permission.preview.noAccess')];
  const result: string[] = [];
  for (const mod of PERMISSION_MODULES) {
    const level = permissionLevelFrom(permissions[mod.key]);
    if (level === 'none') continue;
    const moduleLabel = resolvePermissionModuleLabel(mod.key, t);
    if (level === 'manage') {
      result.push(t('iam.permission.preview.manage', { module: moduleLabel }));
    } else if (level === 'write') {
      result.push(t('iam.permission.preview.write', { module: moduleLabel }));
    } else {
      result.push(t('iam.permission.preview.read', { module: moduleLabel }));
    }
    if (result.length >= max) break;
  }
  return result.length ? result : [t('iam.permission.preview.noAccess')];
}

export function listPermissionGroups() {
  const map = new Map<string, typeof PERMISSION_MODULES>();
  for (const mod of PERMISSION_MODULES) {
    const list = map.get(mod.group) ?? [];
    list.push(mod);
    map.set(mod.group, list);
  }
  return PERMISSION_GROUPS.map((group) => ({ group, modules: map.get(group) ?? [] })).filter(
    (entry) => entry.modules.length > 0,
  );
}
