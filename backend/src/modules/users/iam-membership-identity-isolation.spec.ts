/**
 * Prompt 4/22 — Organization membership admin isolated from global identity.
 */
import { BadRequestException, GoneException } from '@nestjs/common';
import {
  MembershipRole,
  MembershipStatus,
  UserStatus,
} from '@prisma/client';
import {
  createUsersServiceHarness,
  IAM_REGRESSION_IDS,
  mockOrgAdminActorMembership,
} from './iam-security-regression.harness';

const activeWorkerMembership = {
  id: IAM_REGRESSION_IDS.membershipA,
  role: MembershipRole.WORKER,
  status: MembershipStatus.ACTIVE,
  roleLabel: null,
  permissions: null,
  stationScope: null,
  stationIds: null,
  fieldAgentAccess: false,
};

describe('IAM membership vs global identity isolation (Prompt 4)', () => {
  describe('multi-org reactivate', () => {
    it('reactivates membership in org A only via lifecycle.reactivate', async () => {
      const { prisma, lifecycle, service } = createUsersServiceHarness();
      prisma.organizationMembership.findFirst.mockResolvedValue({
        id: IAM_REGRESSION_IDS.membershipA,
        role: MembershipRole.WORKER,
        status: MembershipStatus.SUSPENDED,
        roleLabel: null,
        organizationRoleId: null,
        stationScope: null,
        stationIds: null,
        permissions: null,
        fieldAgentAccess: false,
      });
      jest.spyOn(service, 'findOrgUserDetail').mockResolvedValue({} as never);

      await service.updateOrgUser(
        IAM_REGRESSION_IDS.orgA,
        IAM_REGRESSION_IDS.multiOrgUser,
        { status: 'ACTIVE' },
        { id: IAM_REGRESSION_IDS.adminA, platformRole: 'MASTER_ADMIN' },
      );

      expect(lifecycle.reactivate).toHaveBeenCalledTimes(1);
      expect(lifecycle.reactivate).toHaveBeenCalledWith(
        expect.objectContaining({
          organizationId: IAM_REGRESSION_IDS.orgA,
          userId: IAM_REGRESSION_IDS.multiOrgUser,
        }),
      );
      expect(prisma.user.update).not.toHaveBeenCalled();
    });
  });

  describe('multi-org suspend', () => {
    it('suspends membership in org A only via lifecycle.suspend', async () => {
      const { prisma, lifecycle, service } = createUsersServiceHarness();
      mockOrgAdminActorMembership(prisma, activeWorkerMembership);
      jest.spyOn(service, 'findOrgUserDetail').mockResolvedValue({} as never);

      await service.updateOrgUser(
        IAM_REGRESSION_IDS.orgA,
        IAM_REGRESSION_IDS.multiOrgUser,
        { status: 'SUSPENDED' },
        { id: IAM_REGRESSION_IDS.adminA, platformRole: 'MASTER_ADMIN' },
      );

      expect(lifecycle.suspend).toHaveBeenCalledWith(
        expect.objectContaining({
          organizationId: IAM_REGRESSION_IDS.orgA,
          userId: IAM_REGRESSION_IDS.multiOrgUser,
        }),
      );
      expect(prisma.user.update).not.toHaveBeenCalled();
    });
  });

  describe('multi-org removal', () => {
    it('sets membership REMOVED without deleting global user', async () => {
      const { prisma, lifecycle, service } = createUsersServiceHarness();
      prisma.organizationMembership.findFirst.mockResolvedValue({
        id: IAM_REGRESSION_IDS.membershipA,
        role: MembershipRole.WORKER,
        status: MembershipStatus.ACTIVE,
      });
      prisma.organizationMembership.count.mockResolvedValue(1);

      await service.removeOrgUser(
        IAM_REGRESSION_IDS.orgA,
        IAM_REGRESSION_IDS.multiOrgUser,
        { id: IAM_REGRESSION_IDS.adminA, platformRole: 'MASTER_ADMIN' },
      );

      expect(lifecycle.remove).toHaveBeenCalledWith(
        expect.objectContaining({
          organizationId: IAM_REGRESSION_IDS.orgA,
          userId: IAM_REGRESSION_IDS.multiOrgUser,
        }),
      );
      expect(prisma.user.update).not.toHaveBeenCalled();
    });
  });

  describe('global identity blocked for org admin', () => {
    it('blocks global email change', async () => {
      const { prisma, service } = createUsersServiceHarness();
      mockOrgAdminActorMembership(prisma, activeWorkerMembership);

      await expect(
        service.updateOrgUser(
          IAM_REGRESSION_IDS.orgA,
          IAM_REGRESSION_IDS.multiOrgUser,
          { email: 'hijack@evil.test' },
          { id: IAM_REGRESSION_IDS.adminA, membershipRole: MembershipRole.ORG_ADMIN },
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('blocks direct password write via deprecated service method', async () => {
      const { prisma, service } = createUsersServiceHarness();
      mockOrgAdminActorMembership(prisma, activeWorkerMembership);

      await expect(
        service.changeOrgUserPassword(
          IAM_REGRESSION_IDS.orgA,
          IAM_REGRESSION_IDS.multiOrgUser,
          'longpassword123',
          IAM_REGRESSION_IDS.adminA,
          { id: IAM_REGRESSION_IDS.adminA },
        ),
      ).rejects.toThrow(GoneException);
      expect(prisma.user.update).not.toHaveBeenCalled();
    });

    it('blocks password on existing user during createOrgUser', async () => {
      const { prisma, service } = createUsersServiceHarness();
      mockOrgAdminActorMembership(prisma, activeWorkerMembership);
      prisma.user.findUnique.mockResolvedValue({
        id: IAM_REGRESSION_IDS.multiOrgUser,
        email: 'multi@regression.test',
      });
      prisma.organizationMembership.findUnique.mockResolvedValue(null);

      await expect(
        service.createOrgUser(
          IAM_REGRESSION_IDS.orgA,
          {
            email: 'multi@regression.test',
            firstName: 'M',
            lastName: 'U',
            role: 'WORKER',
            password: 'longpassword123',
          },
          { id: IAM_REGRESSION_IDS.adminA, membershipRole: MembershipRole.ORG_ADMIN },
        ),
      ).rejects.toThrow(/reset|password/i);
    });
  });

  describe('global user status unchanged', () => {
    it('org membership reactivate does not mutate global User.status', async () => {
      const { prisma, lifecycle, service } = createUsersServiceHarness();
      prisma.organizationMembership.findFirst.mockResolvedValue({
        id: IAM_REGRESSION_IDS.membershipA,
        role: MembershipRole.WORKER,
        status: MembershipStatus.SUSPENDED,
        roleLabel: null,
        organizationRoleId: null,
        stationScope: null,
        stationIds: null,
        permissions: null,
        fieldAgentAccess: false,
      });
      prisma.user.findUnique.mockResolvedValue({
        id: IAM_REGRESSION_IDS.multiOrgUser,
        status: UserStatus.SUSPENDED,
      });
      jest.spyOn(service, 'findOrgUserDetail').mockResolvedValue({} as never);

      await service.updateOrgUser(
        IAM_REGRESSION_IDS.orgA,
        IAM_REGRESSION_IDS.multiOrgUser,
        { status: 'ACTIVE' },
        { id: IAM_REGRESSION_IDS.adminA, platformRole: 'MASTER_ADMIN' },
      );

      expect(lifecycle.reactivate).toHaveBeenCalled();
      expect(prisma.user.update).not.toHaveBeenCalled();
    });

    it('createOrgUser on REMOVED membership delegates to lifecycle.reactivate', async () => {
      const { prisma, lifecycle, service } = createUsersServiceHarness();
      prisma.user.findUnique.mockResolvedValue({
        id: IAM_REGRESSION_IDS.multiOrgUser,
        email: 'multi@regression.test',
        status: UserStatus.SUSPENDED,
        firstName: 'M',
        lastName: 'U',
        name: 'M U',
      });
      prisma.organizationMembership.findUnique.mockResolvedValue({
        id: IAM_REGRESSION_IDS.membershipA,
        status: MembershipStatus.REMOVED,
      });
      lifecycle.reactivate.mockResolvedValue({ membershipId: IAM_REGRESSION_IDS.membershipA });
      jest.spyOn(service, 'findOrgUserDetail').mockResolvedValue({} as never);

      await service.createOrgUser(
        IAM_REGRESSION_IDS.orgA,
        {
          email: 'multi@regression.test',
          firstName: 'M',
          lastName: 'U',
          role: 'WORKER',
        },
        { id: IAM_REGRESSION_IDS.adminA, membershipRole: MembershipRole.ORG_ADMIN },
      );

      expect(lifecycle.reactivate).toHaveBeenCalled();
    });
  });

  describe('password reset request contract', () => {
    it('delegates to PasswordResetService with neutral response only', async () => {
      const { prisma, passwordReset, service } = createUsersServiceHarness();
      mockOrgAdminActorMembership(prisma, activeWorkerMembership);

      const result = await service.requestOrgUserPasswordReset(
        IAM_REGRESSION_IDS.orgA,
        IAM_REGRESSION_IDS.multiOrgUser,
        { id: IAM_REGRESSION_IDS.adminA, membershipRole: MembershipRole.ORG_ADMIN },
        { reason: 'User locked out' },
      );

      expect(passwordReset.requestAdminReset).toHaveBeenCalled();
      expect(result.status).toBe('accepted');
      expect(result).not.toHaveProperty('targetUserId');
      expect(JSON.stringify(result)).not.toMatch(/token|resetUrl/i);
    });
  });

  describe('last admin protection (unchanged)', () => {
    it('blocks suspending last org admin', async () => {
      const { prisma, service } = createUsersServiceHarness();
      prisma.organizationMembership.findFirst.mockResolvedValue({
        id: 'm-admin',
        role: MembershipRole.ORG_ADMIN,
        status: MembershipStatus.ACTIVE,
        roleLabel: null,
        permissions: null,
        stationScope: null,
        stationIds: null,
        fieldAgentAccess: true,
      });
      prisma.organizationMembership.findMany.mockResolvedValue([]);
      prisma.organizationMembership.count.mockResolvedValue(0);

      await expect(
        service.updateOrgUser(
          IAM_REGRESSION_IDS.orgA,
          IAM_REGRESSION_IDS.adminA,
          { status: 'SUSPENDED' },
          { id: IAM_REGRESSION_IDS.adminA, membershipRole: MembershipRole.ORG_ADMIN },
        ),
      ).rejects.toThrow(BadRequestException);
    });
  });
});
