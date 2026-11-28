import {
  MembershipStatus,
  OrganizationStatus,
  UserPlatformRole,
  UserStatus,
} from '@prisma/client';
import type { InitialCredentialSecuritySnapshot } from './invite-accept.policy';

export const CREDENTIAL_SETUP_CONFIRM_ERROR = {
  BINDING_INVALID: 'CREDENTIAL_SETUP_BINDING_INVALID',
  INITIAL_CREDENTIAL_INELIGIBLE: 'CREDENTIAL_SETUP_INITIAL_INELIGIBLE',
  ORGANIZATION_NOT_ACTIVE: 'CREDENTIAL_SETUP_ORGANIZATION_NOT_ACTIVE',
  MEMBERSHIP_NOT_ACTIVE: 'CREDENTIAL_SETUP_MEMBERSHIP_NOT_ACTIVE',
} as const;

export function evaluateOperationBoundCredentialSetupConfirm(input: {
  intent: {
    securityOperationId: string;
    userId: string;
    organizationId: string;
    membershipId: string;
    passwordResetTokenId: string | null;
    deliveryGeneration: number;
    credentialEstablishedAt: Date | null;
  };
  token: {
    id: string;
    userId: string;
    organizationId: string | null;
    securityOperationId: string | null;
    setupDeliveryGeneration: number | null;
  };
  user: {
    id: string;
    status: UserStatus;
    passwordHash: string | null;
    platformRole: UserPlatformRole;
  };
  membership: {
    id: string;
    userId: string;
    organizationId: string;
    status: MembershipStatus;
  };
  organization: { id: string; status: OrganizationStatus };
  security: InitialCredentialSecuritySnapshot;
}):
  | { eligible: true }
  | { eligible: false; code: (typeof CREDENTIAL_SETUP_CONFIRM_ERROR)[keyof typeof CREDENTIAL_SETUP_CONFIRM_ERROR] } {
  if (input.intent.credentialEstablishedAt) {
    return { eligible: false, code: CREDENTIAL_SETUP_CONFIRM_ERROR.BINDING_INVALID };
  }
  if (!input.intent.passwordResetTokenId || input.intent.passwordResetTokenId !== input.token.id) {
    return { eligible: false, code: CREDENTIAL_SETUP_CONFIRM_ERROR.BINDING_INVALID };
  }
  if (
    input.token.securityOperationId !== input.intent.securityOperationId ||
    input.token.userId !== input.intent.userId
  ) {
    return { eligible: false, code: CREDENTIAL_SETUP_CONFIRM_ERROR.BINDING_INVALID };
  }
  if (input.token.organizationId !== input.intent.organizationId) {
    return { eligible: false, code: CREDENTIAL_SETUP_CONFIRM_ERROR.BINDING_INVALID };
  }
  if (input.token.setupDeliveryGeneration !== input.intent.deliveryGeneration) {
    return { eligible: false, code: CREDENTIAL_SETUP_CONFIRM_ERROR.BINDING_INVALID };
  }
  if (input.membership.id !== input.intent.membershipId) {
    return { eligible: false, code: CREDENTIAL_SETUP_CONFIRM_ERROR.BINDING_INVALID };
  }
  if (input.organization.status !== OrganizationStatus.ACTIVE) {
    return { eligible: false, code: CREDENTIAL_SETUP_CONFIRM_ERROR.ORGANIZATION_NOT_ACTIVE };
  }
  if (input.membership.status !== MembershipStatus.ACTIVE) {
    return { eligible: false, code: CREDENTIAL_SETUP_CONFIRM_ERROR.MEMBERSHIP_NOT_ACTIVE };
  }
  if (input.user.passwordHash) {
    return { eligible: false, code: CREDENTIAL_SETUP_CONFIRM_ERROR.INITIAL_CREDENTIAL_INELIGIBLE };
  }
  if (input.user.status !== UserStatus.ACTIVE) {
    return { eligible: false, code: CREDENTIAL_SETUP_CONFIRM_ERROR.INITIAL_CREDENTIAL_INELIGIBLE };
  }
  if (input.user.platformRole !== UserPlatformRole.USER) {
    return { eligible: false, code: CREDENTIAL_SETUP_CONFIRM_ERROR.INITIAL_CREDENTIAL_INELIGIBLE };
  }
  if (input.security.verifiedMfaFactorCount > 0) {
    return { eligible: false, code: CREDENTIAL_SETUP_CONFIRM_ERROR.INITIAL_CREDENTIAL_INELIGIBLE };
  }
  if (input.security.activeRefreshSessionCount > 0) {
    return { eligible: false, code: CREDENTIAL_SETUP_CONFIRM_ERROR.INITIAL_CREDENTIAL_INELIGIBLE };
  }
  if (input.security.activePlatformPermissionGrantCount > 0) {
    return { eligible: false, code: CREDENTIAL_SETUP_CONFIRM_ERROR.INITIAL_CREDENTIAL_INELIGIBLE };
  }
  return { eligible: true };
}