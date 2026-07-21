import { MembershipRole, MembershipStatus } from '@prisma/client';
import {
  canActivateMembershipFromInvite,
  isPrivilegedInviteRole,
  requiresRejoinAcknowledgement,
} from './invite-accept.policy';

describe('invite-accept.policy', () => {
  it('detects privileged org admin invites', () => {
    expect(isPrivilegedInviteRole({ membershipRole: MembershipRole.ORG_ADMIN })).toBe(true);
    expect(isPrivilegedInviteRole({ membershipRole: MembershipRole.WORKER })).toBe(false);
  });

  it('requires rejoin acknowledgement for removed or suspended memberships', () => {
    expect(requiresRejoinAcknowledgement(MembershipStatus.REMOVED)).toBe(true);
    expect(requiresRejoinAcknowledgement(MembershipStatus.SUSPENDED)).toBe(true);
    expect(requiresRejoinAcknowledgement(MembershipStatus.ACTIVE)).toBe(false);
  });

  it('blocks removed membership activation without acknowledgement', () => {
    expect(canActivateMembershipFromInvite(MembershipStatus.REMOVED, false)).toBe(false);
    expect(canActivateMembershipFromInvite(MembershipStatus.REMOVED, true)).toBe(true);
  });
});
