import { BadRequestException } from '@nestjs/common';
import {
  InviteEmailOutboxStatus,
  MembershipRole,
  MembershipStatus,
  OrganizationInviteStatus,
} from '@prisma/client';
import { OrganizationInviteService } from './organization-invite.service';
import { PrismaService } from '@shared/database/prisma.service';
import { OrganizationRoleService } from './organization-role.service';
import { IamAuditService } from './iam-audit.service';
import { InviteRateLimitService } from './invite-rate-limit.service';
import { InviteEmailDeliveryService } from './invite-email-delivery.service';
import { InviteEmailOutboxRepository } from './invite-email-outbox.repository';
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
  let iamAudit: {
    enqueueInTransaction: jest.Mock;
    processOutboxIds: jest.Mock;
  };
  let inviteRateLimit: { assertCreateAllowed: jest.Mock; assertResendAllowed: jest.Mock };
  let inviteDelivery: { enqueueInviteDelivery: jest.Mock; processOutboxIds: jest.Mock };
  let inviteOutbox: { findById: jest.Mock; findLatestByInviteIds: jest.Mock };
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
    iamAudit = {
      enqueueInTransaction: jest.fn().mockResolvedValue({ id: 'audit-outbox-1' }),
      processOutboxIds: jest.fn().mockResolvedValue(undefined),
    };
    inviteRateLimit = {
      assertCreateAllowed: jest.fn().mockResolvedValue(undefined),
      assertResendAllowed: jest.fn().mockResolvedValue(undefined),
    };
    inviteDelivery = {
      enqueueInviteDelivery: jest.fn().mockResolvedValue({ outboxId: 'outbox-1' }),
      processOutboxIds: jest.fn().mockResolvedValue(undefined),
    };
    inviteOutbox = {
      findById: jest.fn().mockResolvedValue({
        id: 'outbox-1',
        status: InviteEmailOutboxStatus.COMPLETED,
      }),
      findLatestByInviteIds: jest.fn().mockResolvedValue(new Map()),
    };
    service = new OrganizationInviteService(
      prisma as unknown as PrismaService,
      roleService as unknown as OrganizationRoleService,
      iamAudit as unknown as IamAuditService,
      inviteRateLimit as unknown as InviteRateLimitService,
      inviteDelivery as unknown as InviteEmailDeliveryService,
      inviteOutbox as unknown as InviteEmailOutboxRepository,
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
    expect(result).not.toHaveProperty('inviteToken');
    expect(result.inviteId).toBe(inviteId);
    expect(iamAudit.enqueueInTransaction).toHaveBeenCalled();
    expect(inviteDelivery.enqueueInviteDelivery).toHaveBeenCalled();
  });

  it('revokes pending invite', async () => {
    prisma.organizationUserInvite.findFirst.mockResolvedValue({
      id: inviteId,
      organizationId: orgId,
      email,
      status: OrganizationInviteStatus.PENDING,
      membershipRole: MembershipRole.WORKER,
      roleLabel: null,
      expiresAt: new Date(),
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    prisma.organizationUserInvite.update.mockResolvedValue({
      id: inviteId,
      organizationId: orgId,
      email,
      membershipRole: MembershipRole.WORKER,
      roleLabel: null,
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
    expect(iamAudit.enqueueInTransaction).toHaveBeenCalled();
  });
});
