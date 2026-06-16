import { BadRequestException } from '@nestjs/common';
import {
  MembershipRole,
  MembershipStatus,
  OrganizationInviteStatus,
} from '@prisma/client';
import { OrganizationInviteService } from './organization-invite.service';
import { PrismaService } from '@shared/database/prisma.service';
import { OrganizationRoleService } from './organization-role.service';
import { TransactionalMailService } from './transactional-mail.service';
import { UserAccessAuditService } from './user-access-audit.service';
import { generateInviteToken, inviteTokenLookupKey } from './utils/invite-token.util';

describe('OrganizationInviteService', () => {
  const orgId = 'org-1';
  const inviterId = 'admin-1';
  const inviteId = 'invite-1';
  const email = 'newuser@test.de';

  let prisma: {
    organization: { findUnique: jest.Mock };
    organizationUserInvite: {
      findFirst: jest.Mock;
      findUnique: jest.Mock;
      create: jest.Mock;
      update: jest.Mock;
      findMany: jest.Mock;
    };
    user: { findUnique: jest.Mock; create: jest.Mock };
    organizationMembership: {
      findUnique: jest.Mock;
      findFirst: jest.Mock;
      create: jest.Mock;
      update: jest.Mock;
      count: jest.Mock;
    };
    $transaction: jest.Mock;
  };
  let roleService: {
    ensureDefaultRoles: jest.Mock;
    resolveRoleForInvite: jest.Mock;
    inviteExpiryDays: number;
  };
  let mail: { sendOrganizationInvite: jest.Mock };
  let userAudit: { record: jest.Mock };
  let service: OrganizationInviteService;

  beforeEach(() => {
    prisma = {
      organization: {
        findUnique: jest.fn().mockResolvedValue({ companyName: 'Test Org' }),
      },
      organizationUserInvite: {
        findFirst: jest.fn(),
        findUnique: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        findMany: jest.fn(),
      },
      user: { findUnique: jest.fn(), create: jest.fn() },
      organizationMembership: {
        findUnique: jest.fn(),
        findFirst: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        count: jest.fn(),
      },
      $transaction: jest.fn(async (fn: (tx: typeof prisma) => Promise<unknown>) =>
        fn(prisma),
      ),
    };
    roleService = {
      ensureDefaultRoles: jest.fn().mockResolvedValue(undefined),
      resolveRoleForInvite: jest.fn(),
      inviteExpiryDays: 7,
    };
    mail = { sendOrganizationInvite: jest.fn().mockResolvedValue(undefined) };
    userAudit = { record: jest.fn().mockResolvedValue(undefined) };
    service = new OrganizationInviteService(
      prisma as unknown as PrismaService,
      roleService as unknown as OrganizationRoleService,
      mail as unknown as TransactionalMailService,
      userAudit as unknown as UserAccessAuditService,
    );
  });

  it('blocks invite for active org member', async () => {
    prisma.user.findUnique.mockResolvedValue({ id: 'user-1' });
    prisma.organizationMembership.findFirst.mockResolvedValue({ id: 'm-1' });

    await expect(
      service.createInvite(orgId, { email, membershipRole: MembershipRole.WORKER }, inviterId),
    ).rejects.toThrow(BadRequestException);

    expect(prisma.organizationUserInvite.create).not.toHaveBeenCalled();
  });

  it('stores token hash, not plaintext, on create', async () => {
    prisma.user.findUnique.mockResolvedValue(null);
    prisma.organizationMembership.findFirst.mockResolvedValue(null);
    prisma.organizationUserInvite.findFirst.mockResolvedValue(null);
    prisma.organizationUserInvite.create.mockImplementation(async ({ data }) => ({
      id: inviteId,
      ...data,
      organization: { companyName: 'Test Org' },
      invitedBy: { name: 'Admin', email: 'admin@test.de' },
      createdAt: new Date(),
      updatedAt: new Date(),
    }));

    const result = await service.createInvite(
      orgId,
      { email, membershipRole: MembershipRole.WORKER },
      inviterId,
    );

    const createData = prisma.organizationUserInvite.create.mock.calls[0][0].data;
    expect(createData.tokenHash).toBeDefined();
    expect(createData.tokenLookup).toBeDefined();
    expect(createData.tokenHash).not.toBe(result.inviteToken);
    expect(createData.tokenLookup).toBe(inviteTokenLookupKey(result.inviteToken!));
    expect(result.inviteToken).toBeDefined();
    expect(userAudit.record).toHaveBeenCalled();
  });

  it('blocks accept on expired invite', async () => {
    const { plain, hash } = generateInviteToken();
    prisma.organizationUserInvite.findUnique.mockResolvedValue({
      id: inviteId,
      organizationId: orgId,
      email,
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
      expiresAt: new Date(Date.now() - 60_000),
    });
    prisma.organizationUserInvite.update.mockResolvedValue({});

    await expect(service.acceptInvite({ token: plain })).rejects.toThrow(
      BadRequestException,
    );
    expect(prisma.organizationUserInvite.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { status: OrganizationInviteStatus.EXPIRED },
      }),
    );
  });

  it('reactivates removed membership on accept', async () => {
    const { plain, hash } = generateInviteToken();
    const userId = 'user-1';
    prisma.organizationUserInvite.findUnique.mockResolvedValue({
      id: inviteId,
      organizationId: orgId,
      email,
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
    prisma.user.findUnique.mockResolvedValue({ id: userId, email });
    prisma.organizationMembership.findUnique.mockResolvedValue({
      id: 'm-1',
      role: MembershipRole.WORKER,
      status: MembershipStatus.REMOVED,
    });
    prisma.organizationMembership.update.mockResolvedValue({});
    prisma.organizationUserInvite.update.mockResolvedValue({});

    const result = await service.acceptInvite({ token: plain });

    expect(result.accepted).toBe(true);
    expect(prisma.organizationMembership.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: MembershipStatus.ACTIVE }),
      }),
    );
  });

  it('revokes pending invite', async () => {
    prisma.organizationUserInvite.findFirst.mockResolvedValue({
      id: inviteId,
      organizationId: orgId,
      email,
      status: OrganizationInviteStatus.PENDING,
      membershipRole: MembershipRole.WORKER,
      expiresAt: new Date(),
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    prisma.organizationUserInvite.update.mockResolvedValue({
      id: inviteId,
      organizationId: orgId,
      email,
      membershipRole: MembershipRole.WORKER,
      organizationRoleId: null,
      roleLabel: null,
      department: null,
      position: null,
      status: OrganizationInviteStatus.REVOKED,
      expiresAt: new Date(),
      createdAt: new Date(),
      updatedAt: new Date(),
      acceptedAt: null,
      revokedAt: new Date(),
    });

    await service.revokeInvite(orgId, inviteId, inviterId);

    expect(prisma.organizationUserInvite.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: OrganizationInviteStatus.REVOKED }),
      }),
    );
    expect(userAudit.record).toHaveBeenCalled();
  });
});
