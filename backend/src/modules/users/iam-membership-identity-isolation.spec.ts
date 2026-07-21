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
  describe('multi-org suspend', () => {
    it('suspends membership in org A only', async () => {
      const { prisma, service } = createUsersServiceHarness();
      mockOrgAdminActorMembership(prisma, activeWorkerMembership);
      prisma.organizationMembership.update.mockResolvedValue({});
      jest.spyOn(service, 'findOrgUserDetail').mockResolvedValue({} as never);

      await service.updateOrgUser(
        IAM_REGRESSION_IDS.orgA,
        IAM_REGRESSION_IDS.multiOrgUser,
        { status: 'SUSPENDED' },
        { id: IAM_REGRESSION_IDS.adminA, membershipRole: MembershipRole.ORG_ADMIN },
      );

      expect(prisma.organizationMembership.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ status: MembershipStatus.SUSPENDED }),
        }),
      );
      expect(prisma.user.update).not.toHaveBeenCalled();
    });
  });

  describe('multi-org removal', () => {
    it('sets membership REMOVED without deleting global user', async () => {
      const { prisma, service } = createUsersServiceHarness();
      prisma.organizationMembership.findFirst.mockResolvedValue({
        id: IAM_REGRESSION_IDS.membershipA,
        role: MembershipRole.WORKER,
        status: MembershipStatus.ACTIVE,
      });
      prisma.organizationMembership.count.mockResolvedValue(1);
      prisma.organizationMembership.update.mockResolvedValue({});

      await service.removeOrgUser(
        IAM_REGRESSION_IDS.orgA,
        IAM_REGRESSION_IDS.multiOrgUser,
        { id: IAM_REGRESSION_IDS.adminA },
      );

      expect(prisma.organizationMembership.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { status: MembershipStatus.REMOVED },
        }),
      );
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
    it('reactivate does not force global User.status ACTIVE', async () => {
      const { prisma, service } = createUsersServiceHarness();
      prisma.user.findUnique.mockResolvedValue({
        id: IAM_REGRESSION_IDS.multiOrgUser,
        email: 'multi@regression.test',
        status: UserStatus.SUSPENDED,
      });
      prisma.organizationMembership.findUnique.mockResolvedValue({
        id: IAM_REGRESSION_IDS.membershipA,
        status: MembershipStatus.REMOVED,
      });
      prisma.organizationMembership.update.mockResolvedValue({
        id: IAM_REGRESSION_IDS.membershipA,
        role: MembershipRole.WORKER,
        status: MembershipStatus.ACTIVE,
        roleLabel: null,
        stationScope: null,
        stationIds: null,
        department: null,
        position: null,
        permissions: null,
        fieldAgentAccess: false,
        createdAt: new Date(),
        updatedAt: new Date(),
        user: {
          id: IAM_REGRESSION_IDS.multiOrgUser,
          email: 'multi@regression.test',
          name: 'M U',
          firstName: 'M',
          lastName: 'U',
          status: UserStatus.SUSPENDED,
          phone: '',
          mobile: '',
          language: 'de',
          timezone: 'Europe/Berlin',
          dateFormat: 'DD.MM.YYYY',
          lastLoginAt: null,
          createdAt: new Date(),
          updatedAt: new Date(),
          address: '',
          mustChangePassword: false,
          lastLoginIp: '',
          lastLoginDevice: '',
        },
        organization: { id: IAM_REGRESSION_IDS.orgA, companyName: 'Org A' },
      });

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

      expect(prisma.user.update).not.toHaveBeenCalled();
    });
  });

  describe('password reset request contract', () => {
    it('records reset request without writing passwordHash', async () => {
      const { prisma, userAudit, service } = createUsersServiceHarness();
      prisma.organizationMembership.findFirst.mockImplementation(
        async (args: { where?: { userId?: string }; include?: unknown }) => {
          const userId = args?.where?.userId;
          if (userId === IAM_REGRESSION_IDS.adminA) {
            return { role: MembershipRole.ORG_ADMIN, permissions: null };
          }
          if (userId === IAM_REGRESSION_IDS.multiOrgUser) {
            return {
              id: IAM_REGRESSION_IDS.membershipA,
              status: MembershipStatus.ACTIVE,
              user: { email: 'multi@regression.test' },
            };
          }
          return null;
        },
      );

      const result = await service.requestOrgUserPasswordReset(
        IAM_REGRESSION_IDS.orgA,
        IAM_REGRESSION_IDS.multiOrgUser,
        { id: IAM_REGRESSION_IDS.adminA, membershipRole: MembershipRole.ORG_ADMIN },
        { reason: 'User locked out' },
      );

      expect(result.code).toBe('PASSWORD_RESET_REQUEST_RECORDED');
      expect(prisma.user.update).not.toHaveBeenCalled();
      expect(userAudit.record).toHaveBeenCalled();
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
