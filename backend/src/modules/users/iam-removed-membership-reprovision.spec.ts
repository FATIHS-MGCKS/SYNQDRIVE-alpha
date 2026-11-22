/**
 * REMOVED membership re-add via createOrgUser must not mutate global identity.
 */
import { BadRequestException } from '@nestjs/common';
import { MembershipRole, MembershipStatus, UserStatus } from '@prisma/client';
import {
  createUsersServiceHarness,
  IAM_REGRESSION_IDS,
  mockOrgAdminActorMembership,
} from './iam-security-regression.harness';

describe('IAM REMOVED membership reprovision (global identity safety)', () => {
  const orgA = IAM_REGRESSION_IDS.orgA;
  const userId = IAM_REGRESSION_IDS.multiOrgUser;
  const membershipA = IAM_REGRESSION_IDS.membershipA;

  const baseUser = {
    id: userId,
    email: 'multi@regression.test',
    firstName: 'M',
    lastName: 'U',
    name: 'M U',
    passwordHash: 'hash-unchanged',
    status: UserStatus.ACTIVE,
  };

  function mockRemovedMembershipHarness(userStatus: UserStatus) {
    const { prisma, lifecycle, service } = createUsersServiceHarness();
    prisma.user.findUnique.mockResolvedValue({
      ...baseUser,
      status: userStatus,
    });
    prisma.organizationMembership.findUnique.mockResolvedValue({
      id: membershipA,
      status: MembershipStatus.REMOVED,
    });
    lifecycle.reactivate.mockResolvedValue({ membershipId: membershipA });
    jest.spyOn(service, 'findOrgUserDetail').mockResolvedValue({} as never);
    return { prisma, lifecycle, service };
  }

  it('A: globally SUSPENDED user — lifecycle reactivate only; User unchanged', async () => {
    const { prisma, lifecycle, service } = mockRemovedMembershipHarness(UserStatus.SUSPENDED);

    await service.createOrgUser(
      orgA,
      {
        email: 'multi@regression.test',
        firstName: 'M',
        lastName: 'U',
        role: 'WORKER',
      },
      { id: IAM_REGRESSION_IDS.adminA, platformRole: 'MASTER_ADMIN' },
    );

    expect(lifecycle.reactivate).toHaveBeenCalledWith(
      expect.objectContaining({ organizationId: orgA, userId }),
    );
    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  it('B: globally ACTIVE user — only org A membership lifecycle; no User.update', async () => {
    const { prisma, lifecycle, service } = mockRemovedMembershipHarness(UserStatus.ACTIVE);

    await service.createOrgUser(
      orgA,
      {
        email: 'multi@regression.test',
        firstName: 'M',
        lastName: 'U',
        role: 'WORKER',
      },
      { id: IAM_REGRESSION_IDS.adminA, platformRole: 'MASTER_ADMIN' },
    );

    expect(lifecycle.reactivate).toHaveBeenCalledTimes(1);
    expect(lifecycle.reactivate).toHaveBeenCalledWith(
      expect.objectContaining({ organizationId: orgA }),
    );
    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  it('C: password on existing removed member is rejected; no lifecycle', async () => {
    const { prisma, lifecycle, service } = mockRemovedMembershipHarness(UserStatus.ACTIVE);
    mockOrgAdminActorMembership(prisma, {
      id: membershipA,
      role: MembershipRole.WORKER,
      status: MembershipStatus.REMOVED,
    });

    await expect(
      service.createOrgUser(
        orgA,
        {
          email: 'multi@regression.test',
          firstName: 'M',
          lastName: 'U',
          role: 'WORKER',
          password: 'longpassword123',
        },
        { id: IAM_REGRESSION_IDS.adminA, membershipRole: MembershipRole.ORG_ADMIN },
      ),
    ).rejects.toThrow(BadRequestException);

    expect(lifecycle.reactivate).not.toHaveBeenCalled();
    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  it('org admin cannot supply global profile fields on re-add', async () => {
    const { prisma, lifecycle, service } = mockRemovedMembershipHarness(UserStatus.ACTIVE);
    mockOrgAdminActorMembership(prisma, {
      id: membershipA,
      role: MembershipRole.WORKER,
      status: MembershipStatus.REMOVED,
    });

    await expect(
      service.createOrgUser(
        orgA,
        {
          email: 'multi@regression.test',
          firstName: 'M',
          lastName: 'U',
          role: 'WORKER',
          phone: '+49123456789',
        },
        { id: IAM_REGRESSION_IDS.adminA, membershipRole: MembershipRole.ORG_ADMIN },
      ),
    ).rejects.toThrow(BadRequestException);

    expect(lifecycle.reactivate).not.toHaveBeenCalled();
    expect(prisma.user.update).not.toHaveBeenCalled();
  });
});