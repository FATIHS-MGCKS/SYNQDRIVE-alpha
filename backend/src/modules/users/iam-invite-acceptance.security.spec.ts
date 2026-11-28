import {
  BadRequestException,
  ForbiddenException,
  UnauthorizedException,
} from '@nestjs/common';
import {
  MembershipRole,
  MembershipStatus,
  OrganizationInviteStatus,
  OrganizationStatus,
  UserPlatformRole,
  UserStatus,
} from '@prisma/client';
import { PasswordPolicyService } from '@shared/auth/password-policy.service';
import { InviteAcceptService } from './invite-accept.service';
import { PrismaService } from '@shared/database/prisma.service';
import { IamAuditService } from './iam-audit.service';
import { IamMembershipLifecycleService } from './iam-membership-lifecycle.service';
import { generateInviteToken, inviteTokenLookupKey } from './utils/invite-token.util';
import { INVITE_ACCEPT_ERROR } from './policies/invite-accept.policy';

describe('IAM invite acceptance (Prompt 15)', () => {
  const orgId = 'org-accept-1';
  const inviteId = 'invite-accept-1';
  const email = 'invitee@test.de';
  const userId = 'user-existing-1';

  let prisma: {
    organizationUserInvite: {
      findUnique: jest.Mock;
      update: jest.Mock;
      updateMany: jest.Mock;
    };
    user: {
      findUnique: jest.Mock;
      findUniqueOrThrow: jest.Mock;
      create: jest.Mock;
      update: jest.Mock;
      updateMany: jest.Mock;
    };
    organizationMembership: {
      findUnique: jest.Mock;
      create: jest.Mock;
      update: jest.Mock;
      count: jest.Mock;
    };
    userMfaFactor: { count: jest.Mock };
    refreshToken: { count: jest.Mock };
    userPlatformPermissionGrant: { count: jest.Mock };
    activityLog: { create: jest.Mock };
    iamAuditOutbox: { create: jest.Mock };
    $executeRaw: jest.Mock;
    $transaction: jest.Mock;
  };
  let lifecycle: {
    applyJoinInTransaction: jest.Mock;
  };
  let iamAudit: {
    enqueueInTransaction: jest.Mock;
    processOutboxIds: jest.Mock;
  };
  let service: InviteAcceptService;
  let optionalAuth: { userId: string; email: string } | null = null;

  const baseDto = {
    token: '',
    confirmed: true as const,
    password: 'secure-password-12',
  };

  function mockPendingInvite(plain: string, hash: string, overrides: Record<string, unknown> = {}) {
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
      acceptedByUserId: null,
      provisionedUserId: null,
      provisionedMembershipId: null,
      organization: { id: orgId, companyName: 'Org', status: OrganizationStatus.ACTIVE },
      organizationRole: null,
      ...overrides,
    });
  }

  beforeEach(() => {
    prisma = {
      organizationUserInvite: {
        findUnique: jest.fn(),
        update: jest.fn().mockResolvedValue({}),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      user: {
        findUnique: jest.fn(),
        findUniqueOrThrow: jest.fn().mockImplementation(async ({ where }) => {
          const row = await prisma.user.findUnique({ where });
          if (!row) throw new Error('User not found');
          return row;
        }),
        create: jest.fn().mockImplementation(async ({ data }) => ({ id: 'new-user', ...data })),
        update: jest.fn().mockImplementation(async ({ data, where }) => ({
          id: where.id,
          email,
          ...data,
        })),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      organizationMembership: {
        findUnique: jest.fn(),
        create: jest.fn().mockResolvedValue({}),
        update: jest.fn().mockResolvedValue({}),
        count: jest.fn().mockResolvedValue(1),
      },
      userMfaFactor: { count: jest.fn().mockResolvedValue(0) },
      refreshToken: { count: jest.fn().mockResolvedValue(0) },
      userPlatformPermissionGrant: { count: jest.fn().mockResolvedValue(0) },
      activityLog: { create: jest.fn().mockResolvedValue({}) },
      iamAuditOutbox: {
        create: jest.fn().mockImplementation(async ({ data }) => ({
          id: `outbox-${data.eventType ?? data.auditAction ?? 'event'}`,
          ...data,
        })),
      },
      $executeRaw: jest.fn().mockResolvedValue(0),
    $transaction: jest.fn(async (fn: (tx: typeof prisma) => Promise<unknown>) => fn(prisma)),
    };
    lifecycle = {
      applyJoinInTransaction: jest.fn().mockResolvedValue({
        row: { id: 'mem-1', membershipVersion: 1 },
        outboxId: 'outbox-join',
        mfaRequired: false,
      }),
    };
    iamAudit = {
      enqueueInTransaction: jest.fn().mockImplementation((_tx, input) =>
        prisma.iamAuditOutbox.create({ data: input }),
      ),
      processOutboxIds: jest.fn().mockResolvedValue(undefined),
    };
    const accessAuthority = {
      validateAccessJwt: jest.fn(),
    } as unknown as import('@shared/auth/user-access-authority.service').UserAccessAuthorityService;
    service = new InviteAcceptService(
      prisma as unknown as PrismaService,
      lifecycle as unknown as IamMembershipLifecycleService,
      iamAudit as unknown as IamAuditService,
      new PasswordPolicyService(),
      accessAuthority,
    );
    optionalAuth = null;
    jest.spyOn(service, 'resolveOptionalAuthIdentity').mockImplementation(async () => optionalAuth);
  });

  it('accepts new user with password and explicit confirmation', async () => {
    const { plain, hash } = generateInviteToken();
    mockPendingInvite(plain, hash);
    prisma.user.findUnique.mockResolvedValue(null);
    prisma.organizationMembership.findUnique.mockResolvedValue(null);

    const result = await service.acceptInvite({ ...baseDto, token: plain });

    expect(result.accepted).toBe(true);
    expect(prisma.user.create).toHaveBeenCalled();
    expect(lifecycle.applyJoinInTransaction).toHaveBeenCalled();
  });

  it('requires authentication for existing user', async () => {
    const { plain, hash } = generateInviteToken();
    mockPendingInvite(plain, hash);
    prisma.user.findUnique.mockResolvedValue({
      id: userId,
      email,
      passwordHash: 'existing-hash',
      status: UserStatus.ACTIVE,
      platformRole: UserPlatformRole.USER,
    });

    await expect(service.acceptInvite({ ...baseDto, token: plain, password: undefined })).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it('allows credentialless provisioned identity to establish password without auth', async () => {
    const { plain, hash } = generateInviteToken();
    mockPendingInvite(plain, hash, {
      provisionedUserId: userId,
      provisionedMembershipId: 'm-invited',
    });
    prisma.user.findUnique.mockResolvedValue({
      id: userId,
      email,
      passwordHash: null,
      status: UserStatus.ACTIVE,
      platformRole: UserPlatformRole.USER,
    });
    prisma.organizationMembership.findUnique.mockResolvedValue({
      id: 'm-invited',
      organizationId: orgId,
      userId,
      role: MembershipRole.WORKER,
      status: MembershipStatus.INVITED,
    });

    const result = await service.acceptInvite({ ...baseDto, token: plain });

    expect(result.accepted).toBe(true);
    expect(prisma.user.create).not.toHaveBeenCalled();
    expect(prisma.user.updateMany).toHaveBeenCalled();
    expect(lifecycle.applyJoinInTransaction).toHaveBeenCalled();
  });

  it('accepts existing user when authenticated email matches', async () => {
    const { plain, hash } = generateInviteToken();
    mockPendingInvite(plain, hash);
    prisma.user.findUnique.mockResolvedValue({
      id: userId,
      email,
      passwordHash: 'existing-hash',
      status: UserStatus.ACTIVE,
      platformRole: UserPlatformRole.USER,
    });
    prisma.organizationMembership.findUnique.mockResolvedValue(null);

    optionalAuth = { userId, email };
    const result = await service.acceptInvite(
      { token: plain, confirmed: true },
      'Bearer session',
    );

    expect(result.accepted).toBe(true);
    expect(prisma.user.create).not.toHaveBeenCalled();
    expect(lifecycle.applyJoinInTransaction).toHaveBeenCalled();
  });

  it('rejects wrong logged-in user', async () => {
    const { plain, hash } = generateInviteToken();
    mockPendingInvite(plain, hash);
    prisma.user.findUnique.mockResolvedValue({
      id: userId,
      email,
      passwordHash: 'existing-hash',
      status: UserStatus.ACTIVE,
      platformRole: UserPlatformRole.USER,
    });
    optionalAuth = { userId: 'other-user', email: 'other@test.de' };

    await expect(
      service.acceptInvite(
        { token: plain, confirmed: true },
        'Bearer session',
      ),
    ).rejects.toMatchObject({
      response: { code: INVITE_ACCEPT_ERROR.IDENTITY_MISMATCH },
    });
  });

  it('requires explicit confirmation', async () => {
    const { plain, hash } = generateInviteToken();
    mockPendingInvite(plain, hash);

    await expect(
      service.acceptInvite({ token: plain, confirmed: false as unknown as true }),
    ).rejects.toMatchObject({
      response: { code: INVITE_ACCEPT_ERROR.CONFIRMATION_REQUIRED },
    });
  });

  it('blocks removed membership without rejoin acknowledgement', async () => {
    const { plain, hash } = generateInviteToken();
    mockPendingInvite(plain, hash);
    prisma.user.findUnique.mockResolvedValue({
      id: userId,
      email,
      passwordHash: 'existing-hash',
      status: UserStatus.ACTIVE,
      platformRole: UserPlatformRole.USER,
    });
    prisma.organizationMembership.findUnique.mockResolvedValue({
      id: 'm-1',
      role: MembershipRole.WORKER,
      status: MembershipStatus.REMOVED,
    });
    optionalAuth = { userId, email };

    await expect(
      service.acceptInvite({ token: plain, confirmed: true }, 'Bearer session'),
    ).rejects.toMatchObject({
      response: { code: INVITE_ACCEPT_ERROR.REJOIN_ACK_REQUIRED },
    });
  });

  it('allows removed membership rejoin with explicit acknowledgement', async () => {
    const { plain, hash } = generateInviteToken();
    mockPendingInvite(plain, hash);
    prisma.user.findUnique.mockResolvedValue({
      id: userId,
      email,
      passwordHash: 'existing-hash',
      status: UserStatus.ACTIVE,
      platformRole: UserPlatformRole.USER,
    });
    prisma.organizationMembership.findUnique.mockResolvedValue({
      id: 'm-1',
      role: MembershipRole.WORKER,
      status: MembershipStatus.REMOVED,
    });

    optionalAuth = { userId, email };
    const result = await service.acceptInvite(
      { token: plain, confirmed: true, acknowledgeRejoin: true },
      'Bearer session',
    );

    expect(result.accepted).toBe(true);
    expect(lifecycle.applyJoinInTransaction).toHaveBeenCalled();
  });

  it('blocks suspended membership without rejoin acknowledgement', async () => {
    const { plain, hash } = generateInviteToken();
    mockPendingInvite(plain, hash);
    prisma.user.findUnique.mockResolvedValue({
      id: userId,
      email,
      passwordHash: 'existing-hash',
      status: UserStatus.ACTIVE,
      platformRole: UserPlatformRole.USER,
    });
    prisma.organizationMembership.findUnique.mockResolvedValue({
      id: 'm-1',
      role: MembershipRole.WORKER,
      status: MembershipStatus.SUSPENDED,
    });
    optionalAuth = { userId, email };

    await expect(
      service.acceptInvite({ token: plain, confirmed: true }, 'Bearer session'),
    ).rejects.toMatchObject({
      response: { code: INVITE_ACCEPT_ERROR.REJOIN_ACK_REQUIRED },
    });
  });

  it('requires privileged role acknowledgement for org admin invites', async () => {
    const { plain, hash } = generateInviteToken();
    mockPendingInvite(plain, hash, { membershipRole: MembershipRole.ORG_ADMIN });
    prisma.user.findUnique.mockResolvedValue(null);
    prisma.organizationMembership.findUnique.mockResolvedValue(null);

    await expect(service.acceptInvite({ ...baseDto, token: plain })).rejects.toMatchObject({
      response: { code: INVITE_ACCEPT_ERROR.PRIVILEGED_ROLE_ACK_REQUIRED },
    });
  });

  it('returns idempotent success for duplicate acceptance by same user', async () => {
    const { plain, hash } = generateInviteToken();
    mockPendingInvite(plain, hash, {
      status: OrganizationInviteStatus.ACCEPTED,
      acceptedByUserId: userId,
    });
    prisma.user.findUnique.mockResolvedValue({ id: userId, email });

    optionalAuth = { userId, email };
    const result = await service.acceptInvite({ token: plain, confirmed: true }, 'Bearer session');

    expect(result.idempotent).toBe(true);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('rejects expired invite', async () => {
    const { plain, hash } = generateInviteToken();
    mockPendingInvite(plain, hash, { expiresAt: new Date(Date.now() - 60_000) });

    await expect(service.acceptInvite({ ...baseDto, token: plain })).rejects.toThrow(
      BadRequestException,
    );
  });

  it('rejects revoked invite', async () => {
    const { plain, hash } = generateInviteToken();
    mockPendingInvite(plain, hash, { status: OrganizationInviteStatus.REVOKED });

    await expect(service.acceptInvite({ ...baseDto, token: plain })).rejects.toThrow(
      BadRequestException,
    );
  });

  it('invalidates token after acceptance', async () => {
    const { plain, hash } = generateInviteToken();
    mockPendingInvite(plain, hash);
    prisma.user.findUnique.mockResolvedValue(null);
    prisma.organizationMembership.findUnique.mockResolvedValue(null);

    await service.acceptInvite({ ...baseDto, token: plain });

    const updateData = prisma.organizationUserInvite.updateMany.mock.calls[0][0].data;
    expect(updateData.status).toBe(OrganizationInviteStatus.ACCEPTED);
    expect(updateData.tokenHash).toBeDefined();
  });
});
