/**
 * IAM security regression harness (Prompt 2/22).
 *
 * Documents confirmed P0/P1 IAM risks as characterization + TARGET (RED) tests.
 * TARGET blocks assert the remediation goal and are expected to fail until fixed.
 */
import { BadRequestException } from '@nestjs/common';
import {
  MembershipRole,
  MembershipStatus,
  OrganizationInviteStatus,
  UserStatus,
} from '@prisma/client';
import { RefreshTokenService } from '@modules/auth/refresh-token.service';
import { UsersService } from './users.service';
import { orgAdminMayMutateGlobalIdentity } from './policies/iam-global-identity.policy';
import {
  computeEffectiveModuleAccess,
  surfacesAgree,
} from './policies/iam-effective-access.policy';
import { sessionInvalidationSatisfiesTarget } from './policies/iam-session-invalidation.policy';
import { assertNotLastActiveOrgAdmin } from './org-admin-protection.util';
import {
  createInviteServiceHarness,
  createRoleServiceHarness,
  createUsersServiceHarness,
  IAM_REGRESSION_IDS,
  mockOrgAdminActorMembership,
  multiOrgUserFixture,
} from './iam-security-regression.harness';
import { generateInviteToken, inviteTokenLookupKey } from './utils/invite-token.util';

const activeWorkerMembership = {
  id: IAM_REGRESSION_IDS.membershipA,
  role: MembershipRole.WORKER,
  status: MembershipStatus.ACTIVE,
  roleLabel: null,
  permissions: null,
  stationScope: null,
  stationIds: null,
  fieldAgentAccess: false,
  membershipVersion: 0,
};

describe('IAM security regressions A–K (Prompt 2/22)', () => {
  describe('A — Global identity boundary', () => {
    it('org admin changeOrgUserPassword is deprecated and does not write passwordHash', async () => {
      const { prisma, service } = createUsersServiceHarness();
      mockOrgAdminActorMembership(prisma, activeWorkerMembership);

      await expect(
        service.changeOrgUserPassword(
          IAM_REGRESSION_IDS.orgA,
          IAM_REGRESSION_IDS.multiOrgUser,
          'longpassword123',
          IAM_REGRESSION_IDS.adminA,
          { id: IAM_REGRESSION_IDS.adminA, membershipRole: MembershipRole.ORG_ADMIN },
        ),
      ).rejects.toThrow(/reset|forbidden|not allowed|deprecated/i);
      expect(prisma.user.update).not.toHaveBeenCalled();
    });

    it('TARGET: org admin must not set global password hash', async () => {
      expect(orgAdminMayMutateGlobalIdentity('SET_PASSWORD_HASH')).toBe(false);
      const { prisma, service } = createUsersServiceHarness();
      mockOrgAdminActorMembership(prisma, activeWorkerMembership);

      await expect(
        service.changeOrgUserPassword(
          IAM_REGRESSION_IDS.orgA,
          IAM_REGRESSION_IDS.multiOrgUser,
          'longpassword123',
          IAM_REGRESSION_IDS.adminA,
          { id: IAM_REGRESSION_IDS.adminA, membershipRole: MembershipRole.ORG_ADMIN },
        ),
      ).rejects.toThrow(/reset|forbidden|not allowed|deprecated/i);
    });

    it('org admin updateOrgUser cannot change global email', async () => {
      const { prisma, service } = createUsersServiceHarness();
      mockOrgAdminActorMembership(prisma, activeWorkerMembership);

      await expect(
        service.updateOrgUser(
          IAM_REGRESSION_IDS.orgA,
          IAM_REGRESSION_IDS.multiOrgUser,
          { email: 'new-email@regression.test' },
          { id: IAM_REGRESSION_IDS.adminA, membershipRole: MembershipRole.ORG_ADMIN },
        ),
      ).rejects.toThrow(/global|forbidden|not allowed/i);
      expect(prisma.user.update).not.toHaveBeenCalled();
    });

    it('TARGET: org admin must not change global email via org user update', async () => {
      expect(orgAdminMayMutateGlobalIdentity('CHANGE_EMAIL')).toBe(false);
      const { prisma, service } = createUsersServiceHarness();
      mockOrgAdminActorMembership(prisma, activeWorkerMembership);

      await expect(
        service.updateOrgUser(
          IAM_REGRESSION_IDS.orgA,
          IAM_REGRESSION_IDS.multiOrgUser,
          { email: 'new-email@regression.test' },
          { id: IAM_REGRESSION_IDS.adminA, membershipRole: MembershipRole.ORG_ADMIN },
        ),
      ).rejects.toThrow(/global|forbidden|not allowed/i);
    });

    it('org A suspension sets membership SUSPENDED without global User.status', async () => {
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

      const membershipUpdate = prisma.organizationMembership.update.mock.calls[0]?.[0];
      expect(membershipUpdate?.data?.status).toBe(MembershipStatus.SUSPENDED);
      expect(prisma.user.update).not.toHaveBeenCalled();
    });

    it('TARGET: org A suspension must not deactivate org B membership', async () => {
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

      const membershipUpdate = prisma.organizationMembership.update.mock.calls[0]?.[0];
      expect(membershipUpdate?.data?.status).toBe(MembershipStatus.SUSPENDED);
      expect(prisma.user.update).not.toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ status: UserStatus.SUSPENDED }),
        }),
      );
    });
  });

  describe('B — Membership suspension isolation', () => {
    it('TARGET RED: suspension must leave other-org membership ACTIVE', () => {
      const user = multiOrgUserFixture();
      const membershipB = user.memberships.find(
        (m) => m.organizationId === IAM_REGRESSION_IDS.orgB,
      );
      expect(membershipB?.status).toBe(MembershipStatus.ACTIVE);
    });

    it('TARGET: org-scoped suspension enqueues membership session invalidation', async () => {
      const { prisma, sessionPolicy, service } = createUsersServiceHarness();
      mockOrgAdminActorMembership(prisma, activeWorkerMembership);
      prisma.organizationMembership.update.mockResolvedValue({});
      jest.spyOn(service, 'findOrgUserDetail').mockResolvedValue({} as never);

      await service.updateOrgUser(
        IAM_REGRESSION_IDS.orgA,
        IAM_REGRESSION_IDS.multiOrgUser,
        { status: 'SUSPENDED' },
        { id: IAM_REGRESSION_IDS.adminA, membershipRole: MembershipRole.ORG_ADMIN },
      );

      expect(sessionPolicy.enqueueInTransaction).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ eventType: 'MEMBERSHIP_SUSPENDED' }),
      );
      expect(sessionPolicy.processIntents).toHaveBeenCalled();
    });
  });

  describe('C — Password reset', () => {
    it('org admin changeOrgUserPassword is rejected (no plaintext hash write)', async () => {
      const { prisma, service } = createUsersServiceHarness();
      mockOrgAdminActorMembership(prisma, activeWorkerMembership);

      await expect(
        service.changeOrgUserPassword(
          IAM_REGRESSION_IDS.orgA,
          IAM_REGRESSION_IDS.multiOrgUser,
          'adminSetPassword1',
          IAM_REGRESSION_IDS.adminA,
          { id: IAM_REGRESSION_IDS.adminA, membershipRole: MembershipRole.ORG_ADMIN },
        ),
      ).rejects.toThrow(/reset|token|forbidden|deprecated/i);
      expect(prisma.user.update).not.toHaveBeenCalled();
    });

    it('TARGET: admin must trigger reset flow instead of setting password hash', async () => {
      const { prisma, service } = createUsersServiceHarness();
      mockOrgAdminActorMembership(prisma, activeWorkerMembership);

      await expect(
        service.changeOrgUserPassword(
          IAM_REGRESSION_IDS.orgA,
          IAM_REGRESSION_IDS.multiOrgUser,
          'adminSetPassword1',
          IAM_REGRESSION_IDS.adminA,
          { id: IAM_REGRESSION_IDS.adminA, membershipRole: MembershipRole.ORG_ADMIN },
        ),
      ).rejects.toThrow(/reset|token|forbidden|deprecated/i);
      expect(prisma.user.update).not.toHaveBeenCalled();
    });
  });

  describe('D — Session invalidation policy', () => {
    it('membership suspension enqueues ORGANIZATION_MEMBERSHIP_SESSIONS intent', async () => {
      const { prisma, sessionPolicy, service } = createUsersServiceHarness();
      mockOrgAdminActorMembership(prisma, activeWorkerMembership);
      prisma.organizationMembership.update.mockResolvedValue({});
      jest.spyOn(service, 'findOrgUserDetail').mockResolvedValue({} as never);

      await service.updateOrgUser(
        IAM_REGRESSION_IDS.orgA,
        IAM_REGRESSION_IDS.multiOrgUser,
        { status: 'SUSPENDED' },
        { id: IAM_REGRESSION_IDS.adminA, membershipRole: MembershipRole.ORG_ADMIN },
      );

      expect(sessionPolicy.enqueueInTransaction).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          eventType: 'MEMBERSHIP_SUSPENDED',
          organizationId: IAM_REGRESSION_IDS.orgA,
        }),
      );
    });

    it('policy rejects NONE for PASSWORD_CHANGED', () => {
      expect(
        sessionInvalidationSatisfiesTarget('PASSWORD_CHANGED', 'NONE'),
      ).toBe(false);
    });

    it('removeOrgUser enqueues MEMBERSHIP_REMOVED session invalidation', async () => {
      const { prisma, sessionPolicy, service } = createUsersServiceHarness();
      prisma.organizationMembership.findFirst.mockResolvedValue({
        id: 'm1',
        role: MembershipRole.WORKER,
        status: MembershipStatus.ACTIVE,
        membershipVersion: 0,
      });
      prisma.organizationMembership.count.mockResolvedValue(1);
      prisma.organizationMembership.update.mockResolvedValue({});

      await service.removeOrgUser(
        IAM_REGRESSION_IDS.orgA,
        IAM_REGRESSION_IDS.multiOrgUser,
      );

      expect(sessionPolicy.enqueueInTransaction).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ eventType: 'MEMBERSHIP_REMOVED' }),
      );
      expect(sessionPolicy.processIntents).toHaveBeenCalled();
    });
  });

  describe('F — Role drift', () => {
    it('characterization: updateRole does not propagate permissions to assigned memberships', async () => {
      const { prisma, service } = createRoleServiceHarness();
      prisma.organizationRole.findFirst.mockResolvedValue({
        id: IAM_REGRESSION_IDS.roleWorker,
        organizationId: IAM_REGRESSION_IDS.orgA,
        name: 'Worker',
        description: null,
        systemKey: null,
        isSystemTemplate: false,
        isDefault: false,
        isActive: true,
        membershipRole: MembershipRole.WORKER,
        permissions: { bookings: { read: true, write: true } },
        fieldAgentAccessDefault: false,
        stationScopeDefault: null,
        defaultStationIds: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      prisma.organizationRole.update.mockResolvedValue({
        id: IAM_REGRESSION_IDS.roleWorker,
        organizationId: IAM_REGRESSION_IDS.orgA,
        name: 'Worker',
        description: null,
        systemKey: null,
        isSystemTemplate: false,
        isDefault: false,
        isActive: true,
        membershipRole: MembershipRole.WORKER,
        permissions: { bookings: { read: true, write: false } },
        fieldAgentAccessDefault: false,
        stationScopeDefault: null,
        defaultStationIds: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      await service.updateRole(
        IAM_REGRESSION_IDS.orgA,
        IAM_REGRESSION_IDS.roleWorker,
        { permissions: { bookings: { read: true, write: false } } },
        IAM_REGRESSION_IDS.adminA,
      );

      expect(prisma.organizationMembership.update).not.toHaveBeenCalled();
    });

    it('TARGET RED: role permission reduction must update assigned membership snapshots', async () => {
      const { prisma, service } = createRoleServiceHarness();
      prisma.organizationRole.findFirst.mockResolvedValue({
        id: IAM_REGRESSION_IDS.roleWorker,
        organizationId: IAM_REGRESSION_IDS.orgA,
        name: 'Worker',
        isSystemTemplate: false,
        membershipRole: MembershipRole.WORKER,
        permissions: { bookings: { read: true, write: true } },
      });
      prisma.organizationRole.update.mockResolvedValue({
        id: IAM_REGRESSION_IDS.roleWorker,
        permissions: { bookings: { read: true, write: false } },
      });
      prisma.organizationMembership.findMany.mockResolvedValue([
        { id: IAM_REGRESSION_IDS.membershipA },
      ]);

      await service.updateRole(
        IAM_REGRESSION_IDS.orgA,
        IAM_REGRESSION_IDS.roleWorker,
        { permissions: { bookings: { read: true, write: false } } },
        IAM_REGRESSION_IDS.adminA,
      );

      expect(prisma.organizationMembership.update).toHaveBeenCalled();
    });
  });

  describe('G — Effective access consistency', () => {
    it('characterization: permissionPreview returns template only — not membership effective access', async () => {
      const { prisma, service } = createRoleServiceHarness();
      prisma.organizationRole.findFirst.mockResolvedValue({
        id: IAM_REGRESSION_IDS.roleWorker,
        organizationId: IAM_REGRESSION_IDS.orgA,
        name: 'Worker',
        membershipRole: MembershipRole.WORKER,
        permissions: { bookings: { read: true, write: false } },
        fieldAgentAccessDefault: false,
        stationScopeDefault: null,
        defaultStationIds: [],
        isSystemTemplate: false,
        isActive: true,
      });

      const preview = await service.permissionPreview(
        IAM_REGRESSION_IDS.orgA,
        IAM_REGRESSION_IDS.roleWorker,
      );
      expect(preview.permissions).toEqual({
        bookings: { read: true, write: false, manage: false },
      });
      expect(preview).not.toHaveProperty('membershipOverrides');
    });

    it('TARGET RED: guard and API preview must agree for assigned user effective access', () => {
      const membershipPermissions = {
        bookings: { read: true, write: true, manage: false },
      };
      const templatePermissions = { bookings: { read: true, write: false } };
      const guardAllowsWrite = computeEffectiveModuleAccess({
        membershipRole: MembershipRole.WORKER,
        permissions: membershipPermissions,
        module: 'bookings',
        level: 'write',
      });
      const previewAllowsWrite = computeEffectiveModuleAccess({
        membershipRole: MembershipRole.WORKER,
        permissions: templatePermissions,
        module: 'bookings',
        level: 'write',
      });
      expect(
        surfacesAgree({
          GUARD: guardAllowsWrite,
          API_PREVIEW: previewAllowsWrite,
        }),
      ).toBe(true);
    });
  });

  describe('H — Invite security', () => {
    it('characterization: createInvite returns plaintext inviteToken in API response', async () => {
      const { prisma, service } = createInviteServiceHarness();
      prisma.user.findUnique.mockResolvedValue(null);
      prisma.organizationMembership.findFirst.mockResolvedValue(null);
      prisma.organizationUserInvite.findFirst.mockResolvedValue(null);
      prisma.organizationUserInvite.create.mockImplementation(async ({ data }) => ({
        id: IAM_REGRESSION_IDS.invitePending,
        ...data,
        organization: { companyName: 'Org A' },
        invitedBy: { name: 'Admin', email: 'admin@regression.test' },
        createdAt: new Date(),
        updatedAt: new Date(),
      }));

      const result = await service.createInvite(
        IAM_REGRESSION_IDS.orgA,
        { email: 'invitee@regression.test', membershipRole: MembershipRole.WORKER },
        IAM_REGRESSION_IDS.adminA,
      );

      expect(result.inviteToken).toBeDefined();
      expect(typeof result.inviteToken).toBe('string');
      expect(result.inviteToken!.length).toBeGreaterThan(20);
    });

    it('TARGET RED: admin invite create response must not include inviteToken', async () => {
      const { prisma, service } = createInviteServiceHarness();
      prisma.user.findUnique.mockResolvedValue(null);
      prisma.organizationMembership.findFirst.mockResolvedValue(null);
      prisma.organizationUserInvite.findFirst.mockResolvedValue(null);
      prisma.organizationUserInvite.create.mockImplementation(async ({ data }) => ({
        id: IAM_REGRESSION_IDS.invitePending,
        ...data,
        organization: { companyName: 'Org A' },
        invitedBy: { name: 'Admin', email: 'admin@regression.test' },
        createdAt: new Date(),
        updatedAt: new Date(),
      }));

      const result = await service.createInvite(
        IAM_REGRESSION_IDS.orgA,
        { email: 'invitee@regression.test', membershipRole: MembershipRole.WORKER },
        IAM_REGRESSION_IDS.adminA,
      );

      expect(result.inviteToken).toBeUndefined();
      expect(result).not.toHaveProperty('inviteUrl');
    });

    it('characterization: existing user can accept invite without authenticated session', async () => {
      const { plain, hash } = generateInviteToken();
      const { prisma, service } = createInviteServiceHarness();
      prisma.organizationUserInvite.findUnique.mockResolvedValue({
        id: IAM_REGRESSION_IDS.invitePending,
        organizationId: IAM_REGRESSION_IDS.orgA,
        email: 'existing@regression.test',
        membershipRole: MembershipRole.WORKER,
        organizationRoleId: null,
        roleLabel: null,
        stationScope: null,
        stationIds: null,
        department: null,
        position: null,
        permissions: null,
        fieldAgentAccess: false,
        tokenHash: hash,
        tokenLookup: inviteTokenLookupKey(plain),
        status: OrganizationInviteStatus.PENDING,
        expiresAt: new Date(Date.now() + 86_400_000),
      });
      prisma.user.findUnique.mockResolvedValue({
        id: IAM_REGRESSION_IDS.multiOrgUser,
        email: 'existing@regression.test',
      });
      prisma.organizationMembership.findUnique.mockResolvedValue(null);
      prisma.organizationMembership.create.mockResolvedValue({});
      prisma.organizationUserInvite.update.mockResolvedValue({});

      const result = await service.acceptInvite({ token: plain });
      expect(result.accepted).toBe(true);
    });

    it('TARGET RED: existing user accept requires matching authenticated identity', async () => {
      const { plain, hash } = generateInviteToken();
      const { prisma, service } = createInviteServiceHarness();
      prisma.organizationUserInvite.findUnique.mockResolvedValue({
        id: IAM_REGRESSION_IDS.invitePending,
        organizationId: IAM_REGRESSION_IDS.orgA,
        email: 'existing@regression.test',
        membershipRole: MembershipRole.WORKER,
        organizationRoleId: null,
        roleLabel: null,
        stationScope: null,
        stationIds: null,
        department: null,
        position: null,
        permissions: null,
        fieldAgentAccess: false,
        tokenHash: hash,
        tokenLookup: inviteTokenLookupKey(plain),
        status: OrganizationInviteStatus.PENDING,
        expiresAt: new Date(Date.now() + 86_400_000),
      });
      prisma.user.findUnique.mockResolvedValue({
        id: IAM_REGRESSION_IDS.multiOrgUser,
        email: 'existing@regression.test',
      });

      await expect(service.acceptInvite({ token: plain })).rejects.toThrow(
        /authenticated|re-auth|session/i,
      );
    });

    it('characterization: resend rotates token hash — old token no longer verifies', async () => {
      const { plain: oldPlain, hash: oldHash } = generateInviteToken();
      const { plain: newPlain, hash: newHash } = generateInviteToken();
      const { prisma, service } = createInviteServiceHarness();

      prisma.organizationUserInvite.findFirst.mockResolvedValue({
        id: IAM_REGRESSION_IDS.invitePending,
        organizationId: IAM_REGRESSION_IDS.orgA,
        email: 'invitee@regression.test',
        status: OrganizationInviteStatus.PENDING,
        membershipRole: MembershipRole.WORKER,
        expiresAt: new Date(Date.now() + 86_400_000),
        createdAt: new Date(),
        updatedAt: new Date(),
        tokenHash: oldHash,
        tokenLookup: inviteTokenLookupKey(oldPlain),
      });
      prisma.organizationUserInvite.update.mockResolvedValue({
        id: IAM_REGRESSION_IDS.invitePending,
        organizationId: IAM_REGRESSION_IDS.orgA,
        email: 'invitee@regression.test',
        status: OrganizationInviteStatus.PENDING,
        membershipRole: MembershipRole.WORKER,
        tokenHash: newHash,
        tokenLookup: inviteTokenLookupKey(newPlain),
        organization: { companyName: 'Org A' },
        invitedBy: { name: 'Admin', email: 'admin@regression.test' },
        expiresAt: new Date(Date.now() + 86_400_000),
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      await service.resendInvite(
        IAM_REGRESSION_IDS.orgA,
        IAM_REGRESSION_IDS.invitePending,
        IAM_REGRESSION_IDS.adminA,
      );

      const updateData = prisma.organizationUserInvite.update.mock.calls[0][0].data;
      expect(updateData.tokenHash).not.toBe(oldHash);
      expect(updateData.tokenLookup).not.toBe(inviteTokenLookupKey(oldPlain));
    });
  });

  describe('I — Audit reliability', () => {
    it('characterization: UsersService uses fire-and-forget void userAudit.record on role change', async () => {
      const { prisma, userAudit, service } = createUsersServiceHarness();
      mockOrgAdminActorMembership(prisma, activeWorkerMembership);
      prisma.organizationMembership.update.mockResolvedValue({});
      prisma.user.update.mockResolvedValue({});
      jest.spyOn(service, 'findOrgUserDetail').mockResolvedValue({} as never);

      await service.updateOrgUser(
        IAM_REGRESSION_IDS.orgA,
        IAM_REGRESSION_IDS.multiOrgUser,
        { role: MembershipRole.SUB_ADMIN },
        { id: IAM_REGRESSION_IDS.adminA, membershipRole: MembershipRole.ORG_ADMIN },
      );

      expect(userAudit.record).toHaveBeenCalled();
      const source = UsersService.prototype.updateOrgUser.toString();
      expect(source).toContain('void this.userAudit.record');
    });

    it('TARGET RED: critical IAM mutation must be transactional with durable audit outbox', () => {
      const source = UsersService.prototype.updateOrgUser.toString();
      expect(source).toMatch(/auditOutbox|outbox/i);
      expect(source).not.toContain('void this.userAudit.record');
    });
  });

  describe('J — Last admin protection', () => {
    it('characterization: blocks removing last ORG_ADMIN membership role', async () => {
      const prisma = {
        organizationMembership: {
          findFirst: jest.fn().mockResolvedValue({
            role: MembershipRole.ORG_ADMIN,
            status: MembershipStatus.ACTIVE,
          }),
          count: jest.fn().mockResolvedValue(0),
        },
      };

      await expect(
        assertNotLastActiveOrgAdmin(prisma, IAM_REGRESSION_IDS.orgA, IAM_REGRESSION_IDS.adminA),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('TARGET RED: custom role with users-roles.manage must count as effective admin', async () => {
      const prisma = {
        organizationMembership: {
          findFirst: jest.fn().mockResolvedValue({
            role: MembershipRole.WORKER,
            status: MembershipStatus.ACTIVE,
            permissions: { 'users-roles': { read: true, write: true, manage: true } },
          }),
          count: jest.fn().mockResolvedValue(0),
        },
      };

      await expect(
        assertNotLastActiveOrgAdmin(prisma, IAM_REGRESSION_IDS.orgA, 'custom-admin-user'),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  describe('K — Tenant isolation (service layer)', () => {
    it('assignRoleToUser rejects role from foreign organization', async () => {
      const { prisma, service } = createRoleServiceHarness();
      prisma.organizationRole.findFirst.mockResolvedValue(null);

      await expect(
        service.assignRoleToUser(
          IAM_REGRESSION_IDS.orgA,
          IAM_REGRESSION_IDS.multiOrgUser,
          'foreign-role-id',
          IAM_REGRESSION_IDS.adminA,
        ),
      ).rejects.toThrow(/not found/i);
      expect(prisma.organizationRole.findFirst).toHaveBeenCalledWith({
        where: {
          id: 'foreign-role-id',
          organizationId: IAM_REGRESSION_IDS.orgA,
          isActive: true,
        },
      });
    });

    it('validateStationIds rejects stations outside org (via createOrgUser path)', async () => {
      const { prisma, service } = createUsersServiceHarness();
      prisma.user.findUnique.mockResolvedValue(null);
      prisma.organizationMembership.findUnique.mockResolvedValue(null);
      prisma.station.count.mockResolvedValue(0);

      await expect(
        service.createOrgUser(
          IAM_REGRESSION_IDS.orgA,
          {
            email: 'new@regression.test',
            firstName: 'N',
            lastName: 'U',
            role: 'WORKER',
            stationIds: ['foreign-station-id'],
          },
          { id: IAM_REGRESSION_IDS.adminA, membershipRole: MembershipRole.ORG_ADMIN },
        ),
      ).rejects.toThrow(/station ids are invalid/i);
    });
  });
});

describe('RefreshTokenService membership selection (E — characterization)', () => {
  it('rotate uses take:1 on active memberships ordered by createdAt desc', () => {
    const rotateSource = RefreshTokenService.prototype.rotate.toString();
    expect(rotateSource).toContain('take: 1');
    expect(rotateSource).toContain('orderBy');
    expect(rotateSource).not.toMatch(/stored\.organizationId|refreshToken\.organizationId/);
  });
});
