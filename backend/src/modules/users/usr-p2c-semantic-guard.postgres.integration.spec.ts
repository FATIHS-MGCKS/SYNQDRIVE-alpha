/**
 * USR-P2C semantic guard evidence (disposable PostgreSQL).
 */
import { randomUUID } from 'node:crypto';
import * as bcrypt from 'bcrypt';
import {
  BusinessType,
  MembershipRole,
  MembershipStatus,
  PrismaClient,
  UserPlatformRole,
  UserStatus,
} from '@prisma/client';
import * as jwt from 'jsonwebtoken';
import { acquireCanonicalSecurityMutationLocks } from '@modules/auth/iam-security-mutation-concurrency';
import { UserAccessAuthorityService } from '@shared/auth/user-access-authority.service';
import { IamMembershipLifecycleService } from '@modules/users/iam-membership-lifecycle.service';
import { IamAuditService } from '@modules/users/iam-audit.service';
import { PlatformPermissionService } from '@modules/users/platform-permissions/platform-permission.service';
import { MasterBillingGuard } from '@shared/auth/master-billing.guard';
import { Reflector } from '@nestjs/core';
import { PLATFORM_PERMISSION_JWT_VALUES } from '@modules/users/platform-permissions/platform-permission.constants';
import { createUsrP2PgIamStack } from '@modules/users/testing/usr-p2-pg-iam-stack.helper';

const OPT_IN = 'USR_P2C_SEMANTIC_GUARD_PG';
const JWT_SECRET = 'usr-p2c-semantic-guard-secret';
const run = process.env[OPT_IN] === '1';

function assertDisposableDb(): void {
  if (process.env[OPT_IN] !== '1') throw new Error(`${OPT_IN}=1 required`);
  const url = process.env.DATABASE_URL ?? '';
  if (!/localhost|127\.0\.0\.1/.test(url) || !/usr/i.test(url)) {
    throw new Error('DATABASE_URL must target disposable localhost test DB');
  }
}

(run ? describe : describe.skip)('USR-P2C semantic guards (PostgreSQL)', () => {
  jest.setTimeout(180_000);
  let prisma: PrismaClient;
  let stack: ReturnType<typeof createUsrP2PgIamStack>;
  let lifecycle: IamMembershipLifecycleService;

  beforeAll(() => {
    assertDisposableDb();
    process.env.JWT_SECRET = JWT_SECRET;
    prisma = new PrismaClient();
    stack = createUsrP2PgIamStack(prisma, JWT_SECRET);
    const iamAudit = {
      enqueueInTransaction: jest.fn().mockImplementation(async (_tx, input) => ({
        id: randomUUID(),
        ...input,
      })),
      processOutboxIds: jest.fn().mockResolvedValue(undefined),
    } as unknown as IamAuditService;
    lifecycle = new IamMembershipLifecycleService(
      prisma as never,
      iamAudit,
      { notifyAfterCommit: jest.fn() } as never,
      stack.sessionPolicy,
    );
  });

  afterAll(async () => prisma?.$disconnect());

  it('SEMANTIC_REQ_07 membership remove denies org-bound session', async () => {
    const userId = randomUUID();
    const orgId = randomUUID();
    const memId = randomUUID();
    await prisma.user.create({
      data: {
        id: userId,
        email: `sem07-${userId}@example.test`,
        platformRole: UserPlatformRole.USER,
        status: UserStatus.ACTIVE,
        passwordHash: await bcrypt.hash('Sem07!long-pass', 10),
      },
    });
    await prisma.organization.create({
      data: { id: orgId, companyName: 'Sem07', businessType: BusinessType.RENTAL, status: 'ACTIVE' },
    });
    await prisma.organizationMembership.create({
      data: {
        id: memId,
        userId,
        organizationId: orgId,
        role: MembershipRole.WORKER,
        status: MembershipStatus.ACTIVE,
      },
    });
    const issued = await stack.refresh.issueTokenPair(
      {
        id: userId,
        email: `sem07-${userId}@example.test`,
        platformRole: UserPlatformRole.USER,
        sessionVersion: 0,
        securityVersion: 0,
      },
      { organizationId: orgId, membershipId: memId, role: 'WORKER', membershipVersion: 0 },
    );
    const decoded = jwt.verify(issued.accessToken, JWT_SECRET) as jwt.JwtPayload;
    await lifecycle.remove({
      organizationId: orgId,
      userId,
      idempotencyKey: `sem07:${randomUUID()}`,
      reason: 'p2c-semantic',
    });
    await expect(stack.authority.validateAccessJwt(decoded as never)).rejects.toThrow();
    await expect(stack.refresh.rotate(issued.refreshToken)).rejects.toThrow();
  });

  it('SEMANTIC_REQ_10 permission downgrade via lifecycle.move denies stale JWT', async () => {
    const userId = randomUUID();
    const orgId = randomUUID();
    const memId = randomUUID();
    const adminId = randomUUID();
    await prisma.user.create({
      data: {
        id: userId,
        email: `sem10-${userId}@example.test`,
        platformRole: UserPlatformRole.USER,
        status: UserStatus.ACTIVE,
      },
    });
    await prisma.user.create({
      data: {
        id: adminId,
        email: `sem10-admin-${adminId}@example.test`,
        platformRole: UserPlatformRole.USER,
        status: UserStatus.ACTIVE,
      },
    });
    await prisma.organization.create({
      data: { id: orgId, companyName: 'Sem10', businessType: BusinessType.RENTAL, status: 'ACTIVE' },
    });
    await prisma.organizationMembership.createMany({
      data: [
        {
          id: memId,
          userId,
          organizationId: orgId,
          role: MembershipRole.WORKER,
          status: MembershipStatus.ACTIVE,
          permissions: { fleet: { read: true, write: true, manage: false } },
        },
        {
          id: randomUUID(),
          userId: adminId,
          organizationId: orgId,
          role: MembershipRole.ORG_ADMIN,
          status: MembershipStatus.ACTIVE,
        },
      ],
    });
    const issued = await stack.refresh.issueTokenPair(
      {
        id: userId,
        email: `sem10-${userId}@example.test`,
        platformRole: UserPlatformRole.USER,
        sessionVersion: 0,
        securityVersion: 0,
      },
      {
        organizationId: orgId,
        membershipId: memId,
        role: 'WORKER',
        membershipVersion: 0,
      },
    );
    const decoded = jwt.verify(issued.accessToken, JWT_SECRET) as jwt.JwtPayload;
    await stack.authority.validateAccessJwt(decoded as never);
    await lifecycle.move({
      organizationId: orgId,
      userId,
      idempotencyKey: `sem10:${randomUUID()}`,
      permissions: { fleet: { read: true, write: false, manage: false } },
      actor: { userId: adminId },
    });
    await expect(stack.authority.validateAccessJwt(decoded as never)).rejects.toThrow();
  });

  it('SEMANTIC_REQ_12 platform role downgrade bumps securityVersion and denies JWT', async () => {
    const userId = randomUUID();
    await prisma.user.create({
      data: {
        id: userId,
        email: `sem12-${userId}@example.test`,
        platformRole: UserPlatformRole.MASTER_ADMIN,
        status: UserStatus.ACTIVE,
        sessionVersion: 0,
        securityVersion: 0,
      },
    });
    const issued = await stack.refresh.issueTokenPair(
      {
        id: userId,
        email: `sem12-${userId}@example.test`,
        platformRole: UserPlatformRole.MASTER_ADMIN,
        sessionVersion: 0,
        securityVersion: 0,
      },
      null,
    );
    let intentIds: string[] = [];
    await prisma.$transaction(async (tx) => {
      await acquireCanonicalSecurityMutationLocks(tx, { userIds: [userId] });
      const live = await tx.user.findUnique({
        where: { id: userId },
        select: { sessionVersion: true },
      });
      await tx.user.update({
        where: { id: userId },
        data: {
          platformRole: UserPlatformRole.USER,
          sessionVersion: (live?.sessionVersion ?? 0) + 1,
        },
      });
      const enq = await stack.sessionPolicy.enqueueInTransactionWithAuthoritativeInvalidation(tx, {
        eventType: 'PASSWORD_CHANGED',
        userId,
        mutationVersion: (live?.sessionVersion ?? 0) + 1,
        idempotencyKey: `sem12:${randomUUID()}`,
      });
      intentIds = enq.intentIds;
    });
    if (intentIds.length > 0) {
      await stack.sessionPolicy.processIntents(intentIds);
    }
    await expect(
      stack.authority.validateAccessJwt(jwt.verify(issued.accessToken, JWT_SECRET) as never),
    ).rejects.toThrow();
  });

  it('SEMANTIC_REQ_11 custom permission revocation via lifecycle.move denies stale JWT', async () => {
    const userId = randomUUID();
    const orgId = randomUUID();
    const memId = randomUUID();
    const adminId = randomUUID();
    await prisma.user.createMany({
      data: [
        {
          id: userId,
          email: `sem11-${userId}@example.test`,
          platformRole: UserPlatformRole.USER,
          status: UserStatus.ACTIVE,
        },
        {
          id: adminId,
          email: `sem11-admin-${adminId}@example.test`,
          platformRole: UserPlatformRole.USER,
          status: UserStatus.ACTIVE,
        },
      ],
    });
    await prisma.organization.create({
      data: { id: orgId, companyName: 'Sem11', businessType: BusinessType.RENTAL, status: 'ACTIVE' },
    });
    await prisma.organizationMembership.createMany({
      data: [
        {
          id: memId,
          userId,
          organizationId: orgId,
          role: MembershipRole.WORKER,
          status: MembershipStatus.ACTIVE,
          permissions: { fleet: { read: true, write: true, manage: false } },
        },
        {
          id: randomUUID(),
          userId: adminId,
          organizationId: orgId,
          role: MembershipRole.ORG_ADMIN,
          status: MembershipStatus.ACTIVE,
        },
      ],
    });
    const issued = await stack.refresh.issueTokenPair(
      {
        id: userId,
        email: `sem11-${userId}@example.test`,
        platformRole: UserPlatformRole.USER,
        sessionVersion: 0,
        securityVersion: 0,
      },
      {
        organizationId: orgId,
        membershipId: memId,
        role: 'WORKER',
        membershipVersion: 0,
      },
    );
    const decoded = jwt.verify(issued.accessToken, JWT_SECRET) as jwt.JwtPayload;
    await stack.authority.validateAccessJwt(decoded as never);
    await lifecycle.move({
      organizationId: orgId,
      userId,
      idempotencyKey: `sem11:${randomUUID()}`,
      permissions: { fleet: { read: true, write: false, manage: false } },
      actor: { userId: adminId },
    });
    await expect(stack.authority.validateAccessJwt(decoded as never)).rejects.toThrow();
  });

  it('SEMANTIC_REQ_13 master billing grant revoke fails MasterBillingGuard', async () => {
    const masterId = randomUUID();
    const delegateId = randomUUID();
    await prisma.$executeRaw`
      INSERT INTO users (id, email, status, platform_role, created_at, updated_at, session_version, security_version)
      VALUES
        (${masterId}, ${`sem13-m-${masterId}@test`}, 'ACTIVE'::"UserStatus", 'MASTER_ADMIN'::"UserPlatformRole", NOW(), NOW(), 0, 0),
        (${delegateId}, ${`sem13-d-${delegateId}@test`}, 'ACTIVE'::"UserStatus", 'USER'::"UserPlatformRole", NOW(), NOW(), 0, 0)
    `;
    const platformPermissions = new PlatformPermissionService(prisma as never);
    await platformPermissions.grantMasterBilling(delegateId, masterId);
    const delegate = {
      id: delegateId,
      email: `sem13-d-${delegateId}@test`,
      platformRole: UserPlatformRole.USER,
      sessionVersion: 0,
      securityVersion: 0,
    };
    const pair = await stack.refresh.issueTokenPair(delegate, null);
    const decoded = jwt.verify(pair.accessToken, JWT_SECRET) as jwt.JwtPayload;
    expect(Array.isArray(decoded.platformPermissions)).toBe(true);
    const reflector = { getAllAndOverride: jest.fn().mockReturnValue(true) } as unknown as Reflector;
    const guard = new MasterBillingGuard(reflector, platformPermissions);
    const ctx = {
      switchToHttp: () => ({
        getRequest: () => ({
          user: {
            id: delegateId,
            platformRole: 'USER',
            platformPermissions: decoded.platformPermissions,
          },
        }),
      }),
      getHandler: () => ({}),
      getClass: () => ({}),
    } as never;
    expect(await guard.canActivate(ctx)).toBe(true);
    await platformPermissions.revokeMasterBilling(delegateId, masterId);
    await expect(guard.canActivate(ctx)).rejects.toThrow();
    const perms = await platformPermissions.resolveJwtPermissions(delegateId);
    expect(perms.includes(PLATFORM_PERMISSION_JWT_VALUES.MASTER_BILLING)).toBe(false);
  });
});