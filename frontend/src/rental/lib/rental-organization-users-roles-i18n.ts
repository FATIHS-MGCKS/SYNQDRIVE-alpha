/**
 * Rental Users & Roles member-management presentation adapter (P2.2.62).
 * Machine values, IDs, payloads, and permission checks stay unchanged.
 */
import {
  DEFAULT_PRODUCT_LOCALE,
  getFormattingLocale,
  isSupportedLocale,
  type SupportedLocale,
} from '../../i18n/locales';
import type { TranslationKey } from '../../i18n/translations/en';
import type { CreateUserFormState } from '../components/users-roles/types';
import type { MembershipPermissionsMap, OrganizationRoleDto, Station } from '../../lib/api';

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

export function iamMemberFormattingLocale(locale: string): string {
  return isSupportedLocale(locale) ? getFormattingLocale(locale as SupportedLocale) : DEFAULT_PRODUCT_LOCALE;
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

export interface InviteUserPayloadInput {
  orgId: string;
  form: CreateUserFormState;
  selectedRole: OrganizationRoleDto | null;
  stations: Station[];
  previewPermissions: MembershipPermissionsMap | null;
}

export function buildInviteUserPayload(input: InviteUserPayloadInput) {
  const { form, selectedRole, stations, previewPermissions } = input;
  const stationScope =
    form.stationMode === 'all'
      ? undefined
      : stations.find((s) => s.id === form.stationIds[0])?.name;
  const stationIds = form.stationMode === 'selected' ? form.stationIds : undefined;

  return {
    email: form.email.trim(),
    organizationRoleId: form.organizationRoleId,
    membershipRole: selectedRole?.membershipRole,
    permissions: previewPermissions ?? undefined,
    stationScope,
    stationIds,
    fieldAgentAccess: form.fieldAgentAccess,
    department: form.department.trim() || undefined,
    position: form.position.trim() || undefined,
    roleLabel: selectedRole?.name,
    firstName: form.firstName.trim(),
    lastName: form.lastName.trim(),
  };
}

export function buildCreateUserPayload(input: InviteUserPayloadInput & { password: string }) {
  const invitePayload = buildInviteUserPayload(input);
  return {
    email: invitePayload.email,
    firstName: invitePayload.firstName,
    lastName: invitePayload.lastName,
    role: input.selectedRole?.membershipRole ?? 'WORKER',
    organizationRoleId: invitePayload.organizationRoleId,
    password: input.password,
    phone: input.form.phone.trim() || undefined,
    department: invitePayload.department,
    position: invitePayload.position,
    roleLabel: invitePayload.roleLabel,
    stationScope: invitePayload.stationScope,
    stationIds: invitePayload.stationIds,
    permissions:
      input.selectedRole?.membershipRole === 'ORG_ADMIN'
        ? undefined
        : invitePayload.permissions ?? undefined,
    fieldAgentAccess: invitePayload.fieldAgentAccess,
  };
}
