import { MembershipRole, MembershipStatus } from '@prisma/client';
import { normalizeMembershipPermissions } from '@shared/auth/permission.util';

export const INVITE_ACCEPT_ERROR = {
  CONFIRMATION_REQUIRED: 'INVITE_CONFIRMATION_REQUIRED',
  AUTHENTICATION_REQUIRED: 'INVITE_AUTHENTICATION_REQUIRED',
  IDENTITY_MISMATCH: 'INVITE_IDENTITY_MISMATCH',
  REJOIN_ACK_REQUIRED: 'INVITE_REJOIN_ACK_REQUIRED',
  PRIVILEGED_ROLE_ACK_REQUIRED: 'INVITE_PRIVILEGED_ROLE_ACK_REQUIRED',
  STEP_UP_REQUIRED: 'INVITE_STEP_UP_REQUIRED',
  ALREADY_CONSUMED: 'INVITE_ALREADY_CONSUMED',
  INVALID_TOKEN: 'INVITE_INVALID_TOKEN',
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
  return status === MembershipStatus.REMOVED || status === MembershipStatus.SUSPENDED;
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
