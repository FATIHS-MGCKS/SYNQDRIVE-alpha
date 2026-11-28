import {
  MembershipRole,
  MembershipStatus,
  OrganizationInviteStatus,
  UserPlatformRole,
  UserStatus,
} from '@prisma/client';
import { normalizeMembershipPermissions } from '@shared/auth/permission.util';
import { identityEmailsMatch } from '../utils/identity-email.util';

export const INVITE_ACCEPT_ERROR = {
  CONFIRMATION_REQUIRED: 'INVITE_CONFIRMATION_REQUIRED',
  AUTHENTICATION_REQUIRED: 'INVITE_AUTHENTICATION_REQUIRED',
  IDENTITY_MISMATCH: 'INVITE_IDENTITY_MISMATCH',
  REJOIN_ACK_REQUIRED: 'INVITE_REJOIN_ACK_REQUIRED',
  PRIVILEGED_ROLE_ACK_REQUIRED: 'INVITE_PRIVILEGED_ROLE_ACK_REQUIRED',
  STEP_UP_REQUIRED: 'INVITE_STEP_UP_REQUIRED',
  ALREADY_CONSUMED: 'INVITE_ALREADY_CONSUMED',
  INVALID_TOKEN: 'INVITE_INVALID_TOKEN',
  PROVISIONING_BINDING_INVALID: 'INVITE_PROVISIONING_BINDING_INVALID',
  INITIAL_CREDENTIAL_INELIGIBLE: 'INVITE_INITIAL_CREDENTIAL_INELIGIBLE',
  ORGANIZATION_NOT_ACTIVE: 'INVITE_ORGANIZATION_NOT_ACTIVE',
} as const;

export function isPrivilegedInviteRole(input: {
  membershipRole: MembershipRole;
  permissions?: unknown;
}): boolean {
  if (
    input.membershipRole === MembershipRole.ORG_ADMIN ||
    input.membershipRole === MembershipRole.SUB_ADMIN
  ) {
    return true;
  }
  const permissions = normalizeMembershipPermissions(
    input.permissions as Record<string, { read?: boolean; write?: boolean; manage?: boolean }> | null,
  );
  if (!permissions) return false;
  return Object.values(permissions).some((level) => Boolean(level?.manage));
}

export function requiresRejoinAcknowledgement(
  status: MembershipStatus | null | undefined,
): boolean {
  return (
    status === MembershipStatus.REMOVED ||
    status === MembershipStatus.SUSPENDED ||
    status === MembershipStatus.REACTIVATION_REQUIRED ||
    status === MembershipStatus.OFFBOARDING
  );
}

export function canActivateMembershipFromInvite(
  status: MembershipStatus | null | undefined,
  acknowledgeRejoin: boolean,
): boolean {
  if (!status || status === MembershipStatus.ACTIVE || status === MembershipStatus.INVITED) {
    return true;
  }
  if (requiresRejoinAcknowledgement(status)) {
    return acknowledgeRejoin;
  }
  return false;
}

export function buildConsumedTokenLookup(inviteId: string): string {
  return `consumed:${inviteId}`;
}

export type InitialCredentialSecuritySnapshot = {
  verifiedMfaFactorCount: number;
  activeRefreshSessionCount: number;
  activePlatformPermissionGrantCount: number;
};

export function evaluateInitialCredentialEligibility(input: {
  invite: {
    id: string;
    organizationId: string;
    email: string;
    status: OrganizationInviteStatus;
    provisionedUserId: string | null;
    provisionedMembershipId: string | null;
  };
  user: {
    id: string;
    email: string;
    passwordHash: string | null;
    status: UserStatus;
    platformRole: UserPlatformRole;
  } | null;
  membership: {
    id: string;
    organizationId: string;
    userId: string;
    status: MembershipStatus;
  } | null;
  security: InitialCredentialSecuritySnapshot;
}): { eligible: true } | { eligible: false; code: (typeof INVITE_ACCEPT_ERROR)[keyof typeof INVITE_ACCEPT_ERROR] } {
  if (input.invite.status !== OrganizationInviteStatus.PENDING) {
    return { eligible: false, code: INVITE_ACCEPT_ERROR.ALREADY_CONSUMED };
  }
  if (!input.invite.provisionedUserId || !input.invite.provisionedMembershipId) {
    return { eligible: false, code: INVITE_ACCEPT_ERROR.PROVISIONING_BINDING_INVALID };
  }
  if (!input.user) {
    return { eligible: false, code: INVITE_ACCEPT_ERROR.PROVISIONING_BINDING_INVALID };
  }
  if (!input.membership) {
    return { eligible: false, code: INVITE_ACCEPT_ERROR.PROVISIONING_BINDING_INVALID };
  }
  if (input.invite.provisionedUserId !== input.user.id) {
    return { eligible: false, code: INVITE_ACCEPT_ERROR.PROVISIONING_BINDING_INVALID };
  }
  if (input.invite.provisionedMembershipId !== input.membership.id) {
    return { eligible: false, code: INVITE_ACCEPT_ERROR.PROVISIONING_BINDING_INVALID };
  }
  if (input.membership.userId !== input.user.id) {
    return { eligible: false, code: INVITE_ACCEPT_ERROR.PROVISIONING_BINDING_INVALID };
  }
  if (input.membership.organizationId !== input.invite.organizationId) {
    return { eligible: false, code: INVITE_ACCEPT_ERROR.PROVISIONING_BINDING_INVALID };
  }
  if (!identityEmailsMatch(input.user.email, input.invite.email)) {
    return { eligible: false, code: INVITE_ACCEPT_ERROR.IDENTITY_MISMATCH };
  }
  if (input.user.passwordHash) {
    return { eligible: false, code: INVITE_ACCEPT_ERROR.AUTHENTICATION_REQUIRED };
  }
  if (input.user.status !== UserStatus.ACTIVE) {
    return { eligible: false, code: INVITE_ACCEPT_ERROR.INITIAL_CREDENTIAL_INELIGIBLE };
  }
  if (input.user.platformRole !== UserPlatformRole.USER) {
    return { eligible: false, code: INVITE_ACCEPT_ERROR.INITIAL_CREDENTIAL_INELIGIBLE };
  }
  if (input.membership.status !== MembershipStatus.INVITED) {
    return { eligible: false, code: INVITE_ACCEPT_ERROR.INITIAL_CREDENTIAL_INELIGIBLE };
  }
  if (input.security.verifiedMfaFactorCount > 0) {
    return { eligible: false, code: INVITE_ACCEPT_ERROR.INITIAL_CREDENTIAL_INELIGIBLE };
  }
  if (input.security.activeRefreshSessionCount > 0) {
    return { eligible: false, code: INVITE_ACCEPT_ERROR.INITIAL_CREDENTIAL_INELIGIBLE };
  }
  if (input.security.activePlatformPermissionGrantCount > 0) {
    return { eligible: false, code: INVITE_ACCEPT_ERROR.INITIAL_CREDENTIAL_INELIGIBLE };
  }
  return { eligible: true };
}

/** @deprecated use evaluateInitialCredentialEligibility — kept for characterization imports */
export function canEstablishInitialCredentialsViaInvite(input: {
  user: {
    passwordHash: string | null;
    status: UserStatus;
    platformRole: UserPlatformRole;
  };
  membership: { status: MembershipStatus } | null;
}): boolean {
  if (input.user.passwordHash) return false;
  if (input.user.status !== UserStatus.ACTIVE) return false;
  if (input.user.platformRole !== UserPlatformRole.USER) return false;
  if (!input.membership || input.membership.status !== MembershipStatus.INVITED) return false;
  return true;
}