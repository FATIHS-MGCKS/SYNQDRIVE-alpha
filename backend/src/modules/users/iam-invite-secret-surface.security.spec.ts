import { NotFoundException, HttpException, HttpStatus } from '@nestjs/common';
import {
  InviteEmailOutboxStatus,
  MembershipRole,
  OrganizationInviteStatus,
} from '@prisma/client';
import { OrganizationInviteService } from './organization-invite.service';
import { PrismaService } from '@shared/database/prisma.service';
import { OrganizationRoleService } from './organization-role.service';
import { UserAccessAuditService } from './user-access-audit.service';
import { InviteRateLimitService } from './invite-rate-limit.service';
import { InviteEmailDeliveryService } from './invite-email-delivery.service';
import { InviteEmailOutboxRepository } from './invite-email-outbox.repository';
import { TransactionalMailService } from './transactional-mail.service';
import { generateInviteToken, inviteTokenLookupKey, verifyInviteToken } from './utils/invite-token.util';
import { encryptInviteToken } from './utils/invite-secret-crypto.util';

describe('IAM invite secret surface (Prompt 14)', () => {
  const orgId = 'org-invite-1';
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
  let inviteRateLimit: { assertCreateAllowed: jest.Mock; assertResendAllowed: jest.Mock };
  let inviteDelivery: {
    enqueueInviteDelivery: jest.Mock;
    processOutboxIds: jest.Mock;
  };
  let inviteOutbox: {
    findById: jest.Mock;
    claimForProcessing: jest.Mock;
    markCompleted: jest.Mock;
  };
  let mail: { sendOrganizationInvite: jest.Mock };
  let service: OrganizationInviteService;
  let deliveryService: InviteEmailDeliveryService;

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
      $transaction: jest.fn(async (fn: (tx: typeof prisma) => Promise<unknown>) => fn(prisma)),
    };
    inviteRateLimit = {
      assertCreateAllowed: jest.fn().mockResolvedValue(undefined),
      assertResendAllowed: jest.fn().mockResolvedValue(undefined),
    };
    inviteOutbox = {
      findById: jest.fn(),
      claimForProcessing: jest.fn(),
      markCompleted: jest.fn(),
    };
    inviteDelivery = {
      enqueueInviteDelivery: jest.fn().mockResolvedValue({ outboxId: 'outbox-1' }),
      processOutboxIds: jest.fn().mockResolvedValue(undefined),
    };
    mail = { sendOrganizationInvite: jest.fn().mockResolvedValue({ sent: false, fallback: true }) };

    service = new OrganizationInviteService(
      prisma as unknown as PrismaService,
      {
        ensureDefaultRoles: jest.fn(),
        resolveRoleForInvite: jest.fn(),
        inviteExpiryDays: 7,
      } as unknown as OrganizationRoleService,
      { record: jest.fn() } as unknown as UserAccessAuditService,
      inviteRateLimit as unknown as InviteRateLimitService,
      inviteDelivery as unknown as InviteEmailDeliveryService,
      inviteOutbox as unknown as InviteEmailOutboxRepository,
    );

    deliveryService = new InviteEmailDeliveryService(
      prisma as unknown as PrismaService,
      inviteOutbox as unknown as InviteEmailOutboxRepository,
      mail as unknown as TransactionalMailService,
    );
  });

  it('createInvite does not return inviteToken or inviteUrl', async () => {
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
    inviteOutbox.findById.mockResolvedValue({
      id: 'outbox-1',
      status: InviteEmailOutboxStatus.COMPLETED,
    });

    const result = await service.createInvite(
      orgId,
      { email, membershipRole: MembershipRole.WORKER },
      inviterId,
    );

    expect(result).not.toHaveProperty('inviteToken');
    expect(result).not.toHaveProperty('inviteUrl');
    expect(result.inviteId).toBe(inviteId);
    expect(result.deliveryStatus).toBe('SENT');
  });

  it('resendInvite rotates token and does not return secrets', async () => {
    const { plain: oldPlain, hash: oldHash } = generateInviteToken();
    const { plain: newPlain, hash: newHash } = generateInviteToken();

    prisma.organizationUserInvite.findFirst.mockResolvedValue({
      id: inviteId,
      organizationId: orgId,
      email,
      status: OrganizationInviteStatus.PENDING,
      membershipRole: MembershipRole.WORKER,
      expiresAt: new Date(Date.now() + 86_400_000),
      tokenHash: oldHash,
      tokenLookup: inviteTokenLookupKey(oldPlain),
    });
    prisma.organizationUserInvite.update.mockResolvedValue({
      id: inviteId,
      organizationId: orgId,
      email,
      status: OrganizationInviteStatus.PENDING,
      membershipRole: MembershipRole.WORKER,
      roleLabel: null,
      tokenHash: newHash,
      tokenLookup: inviteTokenLookupKey(newPlain),
      organizationRole: null,
      expiresAt: new Date(Date.now() + 86_400_000),
    });
    inviteOutbox.findById.mockResolvedValue({
      id: 'outbox-2',
      status: InviteEmailOutboxStatus.COMPLETED,
    });

    const result = await service.resendInvite(orgId, inviteId, inviterId);

    const updateData = prisma.organizationUserInvite.update.mock.calls[0][0].data;
    expect(updateData.tokenLookup).not.toBe(inviteTokenLookupKey(oldPlain));
    expect(result).not.toHaveProperty('inviteToken');
    expect(result).not.toHaveProperty('inviteUrl');
  });

  it('old invite token no longer verifies after resend rotation', async () => {
    const { plain: oldPlain, hash: oldHash } = generateInviteToken();
    const { plain: newPlain, hash: newHash } = generateInviteToken();

    expect(await verifyInviteToken(oldPlain, oldHash)).toBe(true);
    expect(await verifyInviteToken(oldPlain, newHash)).toBe(false);
    expect(await verifyInviteToken(newPlain, newHash)).toBe(true);
  });

  it('cross-tenant resend is rejected', async () => {
    prisma.organizationUserInvite.findFirst.mockResolvedValue(null);
    await expect(service.resendInvite('other-org', inviteId, inviterId)).rejects.toThrow(
      NotFoundException,
    );
  });

  it('rate limit blocks excessive invite create', async () => {
    inviteRateLimit.assertCreateAllowed.mockRejectedValue(
      new HttpException({ code: 'INVITE_RATE_LIMITED' }, HttpStatus.TOO_MANY_REQUESTS),
    );

    await expect(
      service.createInvite(orgId, { email, membershipRole: MembershipRole.WORKER }, inviterId),
    ).rejects.toMatchObject({ status: HttpStatus.TOO_MANY_REQUESTS });
  });

  it('delivery service sends via mail without persisting token in API layer', async () => {
    const { plain } = generateInviteToken();
    const ciphertext = encryptInviteToken(plain);

    inviteOutbox.claimForProcessing.mockResolvedValue({
      id: 'outbox-1',
      inviteId,
      organizationId: orgId,
      tokenCiphertext: ciphertext,
      attempts: 1,
    });
    prisma.organizationUserInvite.findFirst.mockResolvedValue({
      id: inviteId,
      email,
      expiresAt: new Date(Date.now() + 86_400_000),
      organization: { companyName: 'Test Org' },
      invitedBy: { name: 'Admin', email: 'admin@test.de' },
    });
    inviteOutbox.markCompleted.mockResolvedValue({});

    await deliveryService.processOutboxId('outbox-1');

    expect(mail.sendOrganizationInvite).toHaveBeenCalledWith(
      expect.objectContaining({
        to: email,
        inviteUrl: expect.stringContaining('token='),
      }),
    );
    expect(inviteOutbox.markCompleted).toHaveBeenCalledWith('outbox-1');
  });

  it('duplicate pending invite is revoked before creating a new one', async () => {
    prisma.user.findUnique.mockResolvedValue(null);
    prisma.organizationMembership.findFirst.mockResolvedValue(null);
    prisma.organizationUserInvite.findFirst.mockResolvedValue({
      id: 'old-invite',
      organizationId: orgId,
      email,
      status: OrganizationInviteStatus.PENDING,
      membershipRole: MembershipRole.WORKER,
      expiresAt: new Date(),
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    prisma.organizationUserInvite.update.mockResolvedValue({
      id: 'old-invite',
      organizationId: orgId,
      email,
      status: OrganizationInviteStatus.REVOKED,
      membershipRole: MembershipRole.WORKER,
      roleLabel: null,
      expiresAt: new Date(),
      createdAt: new Date(),
      updatedAt: new Date(),
      acceptedAt: null,
      revokedAt: new Date(),
    });
    prisma.organizationUserInvite.create.mockImplementation(async ({ data }) => ({
      id: inviteId,
      ...data,
      organization: { companyName: 'Test Org' },
      invitedBy: { name: 'Admin', email: 'admin@test.de' },
      createdAt: new Date(),
      updatedAt: new Date(),
    }));
    inviteOutbox.findById.mockResolvedValue({
      id: 'outbox-1',
      status: InviteEmailOutboxStatus.PENDING,
    });

    await service.createInvite(orgId, { email, membershipRole: MembershipRole.WORKER }, inviterId);

    expect(prisma.organizationUserInvite.update.mock.calls.length).toBeGreaterThan(0);
    expect(prisma.organizationUserInvite.create.mock.calls.length).toBe(1);
  });
});
