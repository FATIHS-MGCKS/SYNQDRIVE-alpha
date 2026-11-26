/**
 * USR-P2C deterministic concurrency acceptance (PostgreSQL, disposable DB).
 */
import { randomUUID } from 'node:crypto';
import {
  BusinessType,
  MembershipStatus,
  PrismaClient,
  UserPlatformRole,
  UserStatus,
} from '@prisma/client';
import * as jwt from 'jsonwebtoken';
import { RefreshTokenService } from '@modules/auth/refresh-token.service';
import { UserAccessAuthorityService } from '@shared/auth/user-access-authority.service';
import { IamMembershipLifecycleService } from '@modules/users/iam-membership-lifecycle.service';
import { IamAuditService } from '@modules/users/iam-audit.service';
import * as bcrypt from 'bcrypt';
import { MfaFactorType } from '@prisma/client';
import { AccountService } from '@modules/account/account.service';
import { PasswordPolicyService } from '@shared/auth/password-policy.service';
import { AuditService } from '@modules/activity-log/audit.service';
import { IamMfaResetService } from '@modules/iam-mfa/iam-mfa-reset.service';
import { acquireCanonicalSecurityMutationLocks } from '@modules/auth/iam-security-mutation-concurrency';
import {
  holdUserSessionWriteLockTransaction,
  pgBackendPid,
  waitUntilAdvisoryLockWaiters,
  waitUntilBackendBlocked,
  waitUntilUserAdvisoryLockHeld,
} from '@modules/users/testing/usr-p2-deterministic-concurrency.helper';
import { createUsrP2PgIamStack } from '@modules/users/testing/usr-p2-pg-iam-stack.helper';

const OPT_IN = 'USR_P2C_DETERMINISTIC_RACE_PG';
const JWT_SECRET = 'usr-p2c-deterministic-race-secret';
const run = process.env[OPT_IN] === '1';

function assertDisposableDb(): void {
  if (process.env[OPT_IN] !== '1') throw new Error(`${OPT_IN}=1 required`);
  const url = process.env.DATABASE_URL ?? '';
  if (!/localhost|127\.0\.0\.1/.test(url) || !/usr/i.test(url)) {
    throw new Error('DATABASE_URL must target disposable localhost test DB');
  }
}

(run ? describe : describe.skip)('USR-P2C deterministic race (PostgreSQL)', () => {
  jest.setTimeout(360_000);
  let prismaA: PrismaClient;
  let prismaB: PrismaClient;
  let stackA: ReturnType<typeof createUsrP2PgIamStack>;
  let stackB: ReturnType<typeof createUsrP2PgIamStack>;
  let authorityB: UserAccessAuthorityService;
  let lifecycle: IamMembershipLifecycleService;
  let accountA: AccountService;
  let mfaReset: IamMfaResetService;

  beforeAll(() => {
    assertDisposableDb();
    process.env.JWT_SECRET = JWT_SECRET;
    prismaA = new PrismaClient();
    prismaB = new PrismaClient();
    stackA = createUsrP2PgIamStack(prismaA, JWT_SECRET);
    stackB = createUsrP2PgIamStack(prismaB, JWT_SECRET);
    authorityB = stackB.authority;
    const iamAudit = {
      enqueueInTransaction: jest.fn().mockImplementation(async (_tx, input) => ({
        id: randomUUID(),
        ...input,
      })),
      processOutboxIds: jest.fn().mockResolvedValue(undefined),
    } as unknown as IamAuditService;
    lifecycle = new IamMembershipLifecycleService(
      prismaA as never,
      iamAudit,
      { notifyAfterCommit: jest.fn() } as never,
      stackA.sessionPolicy,
    );
    accountA = new AccountService(
      prismaA as never,
      { record: jest.fn() } as unknown as AuditService,
      stackA.refresh,
      stackA.sessionPolicy,
      new PasswordPolicyService(),
    );
    mfaReset = new IamMfaResetService(prismaA as never, stackA.sessionPolicy, iamAudit);
  });

  afterAll(async () => {
    await prismaA?.$disconnect();
    await prismaB?.$disconnect();
  });

  async function seedUserWithOrg() {
    const userId = randomUUID();
    const email = `p2c-${userId}@example.test`;
    const orgId = randomUUID();
    const membershipId = randomUUID();
    await prismaA.user.create({
      data: {
        id: userId,
        email,
        platformRole: UserPlatformRole.USER,
        status: UserStatus.ACTIVE,
        passwordHash: await bcrypt.hash('P2cSeed1!long-pass', 10),
        sessionVersion: 0,
        securityVersion: 0,
      },
    });
    await prismaA.organization.create({
      data: {
        id: orgId,
        companyName: `Org ${orgId.slice(0, 6)}`,
        businessType: BusinessType.RENTAL,
        status: 'ACTIVE',
      },
    });
    await prismaA.organizationMembership.create({
      data: {
        id: membershipId,
        userId,
        organizationId: orgId,
        role: 'WORKER',
        status: MembershipStatus.ACTIVE,
        membershipVersion: 0,
      },
    });
    return {
      userId,
      email,
      orgId,
      membershipId,
      passwordPlain: 'P2cSeed1!long-pass',
      membership: {
        organizationId: orgId,
        membershipId,
        role: 'WORKER',
        membershipVersion: 0,
      },
    };
  }

  async function issueBound(
    refresh: RefreshTokenService,
    userId: string,
    email: string,
    membership: { organizationId: string; membershipId: string; role: string; membershipVersion: number },
    versions?: { sessionVersion?: number; securityVersion?: number },
  ) {
    const live = await prismaA.user.findUnique({
      where: { id: userId },
      select: { sessionVersion: true, securityVersion: true },
    });
    return refresh.issueTokenPair(
      {
        id: userId,
        email,
        platformRole: UserPlatformRole.USER,
        sessionVersion: versions?.sessionVersion ?? live?.sessionVersion ?? 0,
        securityVersion: versions?.securityVersion ?? live?.securityVersion ?? 0,
      },
      membership,
    );
  }

  async function activeHeadCount(userId: string) {
    return prismaA.refreshToken.count({
      where: { userId, revokedAt: null, replacedBy: null, expiresAt: { gt: new Date() } },
    });
  }

  it('RACE01 rotation-first: revoke waits on rotate fence; successor denied after both commit', async () => {
    const ctx = await seedUserWithOrg();
    const issued = await issueBound(stackA.refresh, ctx.userId, ctx.email, ctx.membership);

    const rotateP = stackB.refresh.rotate(issued.refreshToken);
    const pidRotate = await pgBackendPid(prismaB);
    const revokeP = stackA.refresh.revokeAllActiveForUser(ctx.userId);
    const blockingPids = await waitUntilBackendBlocked(prismaA, pidRotate);

    const successor = await rotateP;
    await revokeP;
    expect(blockingPids.length).toBeGreaterThan(0);

    const decoded = jwt.verify(successor.accessToken, JWT_SECRET) as jwt.JwtPayload;
    await expect(stackA.authority.validateAccessJwt(decoded as never)).rejects.toThrow();
    await expect(stackB.refresh.rotate(successor.refreshToken)).rejects.toThrow(/no longer valid/i);
    expect(await activeHeadCount(ctx.userId)).toBe(0);
  });

  it('RACE02 revocation-first: rotate waits on advisory lock then denied', async () => {
    const ctx = await seedUserWithOrg();
    const issued = await issueBound(stackA.refresh, ctx.userId, ctx.email, ctx.membership);
    const holder = holdUserSessionWriteLockTransaction(prismaA, ctx.userId);
    await waitUntilUserAdvisoryLockHeld(prismaB, ctx.userId);

    const revokeP = stackA.refresh.revokeAllActiveForUser(ctx.userId);
    await waitUntilAdvisoryLockWaiters(prismaA, ctx.userId, 1);

    const pidRotate = await pgBackendPid(prismaB);
    const rotateP = stackB.refresh.rotate(issued.refreshToken);
    const blockingPids = await waitUntilBackendBlocked(prismaA, pidRotate);

    holder.release();
    await holder.completion;
    await revokeP;
    await expect(rotateP).rejects.toThrow(/no longer valid/i);
    expect(blockingPids.length).toBeGreaterThan(0);
    expect(await activeHeadCount(ctx.userId)).toBe(0);
  });

  it('RACE03 revoke-all with concurrent refresh on second family', async () => {
    const ctx = await seedUserWithOrg();
    const bound = await issueBound(stackA.refresh, ctx.userId, ctx.email, ctx.membership);
    const legacy = await stackA.refresh.issueTokenPair(
      {
        id: ctx.userId,
        email: ctx.email,
        platformRole: UserPlatformRole.USER,
        sessionVersion: 0,
        securityVersion: 0,
      },
      null,
    );

    const holder = holdUserSessionWriteLockTransaction(prismaA, ctx.userId);
    await waitUntilUserAdvisoryLockHeld(prismaB, ctx.userId);
    const revokeP = stackA.sessionPolicy.recordAndExecute({
      eventType: 'PASSWORD_CHANGED',
      userId: ctx.userId,
    });
    await waitUntilAdvisoryLockWaiters(prismaA, ctx.userId, 1);
    const pidRotate = await pgBackendPid(prismaB);
    const rotateP = stackB.refresh.rotate(bound.refreshToken);
    await waitUntilBackendBlocked(prismaA, pidRotate);
    holder.release();
    await holder.completion;
    await revokeP;
    const rotateOutcome = await Promise.allSettled([rotateP]);
    expect(rotateOutcome[0].status).toBe('rejected');

    expect(await activeHeadCount(ctx.userId)).toBe(0);
    await expect(stackB.refresh.rotate(legacy.refreshToken)).rejects.toThrow(/no longer valid/i);
  });

  it('RACE04 logout on rotated predecessor revokes entire family', async () => {
    const ctx = await seedUserWithOrg();
    const issued = await issueBound(stackA.refresh, ctx.userId, ctx.email, ctx.membership);
    const rotated = await stackA.refresh.rotate(issued.refreshToken);
    await stackA.refresh.revoke(issued.refreshToken, 'LOGOUT');
    await expect(stackB.refresh.rotate(rotated.refreshToken)).rejects.toThrow(/no longer valid/i);
    expect(await activeHeadCount(ctx.userId)).toBe(0);
  });

  it('RACE05 membership suspend via lifecycle denies org JWT', async () => {
    const ctx = await seedUserWithOrg();
    const issued = await issueBound(stackA.refresh, ctx.userId, ctx.email, ctx.membership);
    const decoded = jwt.verify(issued.accessToken, JWT_SECRET) as jwt.JwtPayload;
    await lifecycle.suspend({
      organizationId: ctx.orgId,
      userId: ctx.userId,
      idempotencyKey: `p2c-race05:${randomUUID()}`,
      reason: 'p2c',
    });
    await expect(stackA.authority.validateAccessJwt(decoded as never)).rejects.toThrow();
    await expect(stackB.refresh.rotate(issued.refreshToken)).rejects.toThrow();
  });

  it('RACE07 reuse detection invalidates family via real session policy', async () => {
    const ctx = await seedUserWithOrg();
    const issued = await issueBound(stackA.refresh, ctx.userId, ctx.email, ctx.membership);
    const rotated = await stackA.refresh.rotate(issued.refreshToken);
    await expect(stackB.refresh.rotate(issued.refreshToken)).rejects.toThrow(/no longer valid/i);
    const intents = await prismaA.iamSessionRevocationIntent.findMany({
      where: { userId: ctx.userId, eventType: 'REFRESH_TOKEN_REUSE_DETECTED' },
    });
    expect(intents.length).toBeGreaterThanOrEqual(1);
    expect(await activeHeadCount(ctx.userId)).toBe(0);
    await expect(stackA.refresh.rotate(rotated.refreshToken)).rejects.toThrow(/no longer valid/i);
  });

  it('RACE08 AccountService password change denies concurrent refresh', async () => {
    const ctx = await seedUserWithOrg();
    const issued = await issueBound(stackA.refresh, ctx.userId, ctx.email, ctx.membership);
    const decoded = jwt.verify(issued.accessToken, JWT_SECRET) as jwt.JwtPayload;
    const holder = holdUserSessionWriteLockTransaction(prismaA, ctx.userId);
    await waitUntilUserAdvisoryLockHeld(prismaB, ctx.userId);
    const changeP = accountA.changePassword(
      ctx.userId,
      ctx.orgId,
      {
        currentPassword: ctx.passwordPlain,
        newPassword: 'Race08!long-pass',
        confirmPassword: 'Race08!long-pass',
        revokeOtherSessions: true,
      },
      {},
    );
    await waitUntilAdvisoryLockWaiters(prismaA, ctx.userId, 1);
    const pidRotate = await pgBackendPid(prismaB);
    const rotateP = stackB.refresh.rotate(issued.refreshToken);
    await waitUntilBackendBlocked(prismaA, pidRotate);
    holder.release();
    await holder.completion;
    const [, rotateOutcome] = await Promise.allSettled([changeP, rotateP]);
    expect(rotateOutcome.status).toBe('rejected');
    await expect(stackA.authority.validateAccessJwt(decoded as never)).rejects.toThrow();
  });

  it('RACE11 tenant suspension revokes bound sessions; unrelated org preserved', async () => {
    const ctx = await seedUserWithOrg();
    const bound = await issueBound(stackA.refresh, ctx.userId, ctx.email, ctx.membership);
    const legacy = await stackA.refresh.issueTokenPair(
      {
        id: ctx.userId,
        email: ctx.email,
        platformRole: UserPlatformRole.USER,
        sessionVersion: 0,
        securityVersion: 0,
      },
      null,
    );
    const orgB = randomUUID();
    const memB = randomUUID();
    await prismaA.organization.create({
      data: {
        id: orgB,
        companyName: 'Org B',
        businessType: BusinessType.RENTAL,
        status: 'ACTIVE',
      },
    });
    await prismaA.organizationMembership.create({
      data: {
        id: memB,
        userId: ctx.userId,
        organizationId: orgB,
        role: 'WORKER',
        status: MembershipStatus.ACTIVE,
      },
    });
    const sessionB = await issueBound(stackA.refresh, ctx.userId, ctx.email, {
      organizationId: orgB,
      membershipId: memB,
      role: 'WORKER',
      membershipVersion: 0,
    });

    await prismaA.organization.update({
      where: { id: ctx.orgId },
      data: { status: 'SUSPENDED' },
    });
    await expect(stackB.refresh.rotate(bound.refreshToken)).rejects.toThrow();
    const rotatedB = await stackB.refresh.rotate(sessionB.refreshToken);
    expect(rotatedB.accessToken).toBeTruthy();
    await expect(stackA.refresh.rotate(legacy.refreshToken)).rejects.toThrow();
  });

  it('RACE11 legacy unscoped refresh cannot upgrade when home org is suspended', async () => {
    const ctx = await seedUserWithOrg();
    await prismaA.user.update({
      where: { id: ctx.userId },
      data: { lastSelectedOrganizationId: ctx.orgId },
    });
    const legacy = await stackA.refresh.issueTokenPair(
      {
        id: ctx.userId,
        email: ctx.email,
        platformRole: UserPlatformRole.USER,
        sessionVersion: 0,
        securityVersion: 0,
      },
      null,
    );
    await prismaA.organization.update({
      where: { id: ctx.orgId },
      data: { status: 'SUSPENDED' },
    });
    await expect(stackB.refresh.rotate(legacy.refreshToken)).rejects.toThrow();
  });

  it('B05 concurrent first application applies mutation once', async () => {
    const ctx = await seedUserWithOrg();
    const opKey = `p2c-b05-first:${randomUUID()}`;
    const preSession = await issueBound(stackA.refresh, ctx.userId, ctx.email, ctx.membership);
    const preDecoded = jwt.verify(preSession.accessToken, JWT_SECRET) as jwt.JwtPayload;
    const versionBefore = (
      await prismaA.user.findUnique({ where: { id: ctx.userId }, select: { sessionVersion: true } })
    )!.sessionVersion;

    const apply = (client: PrismaClient, policy: typeof stackA.sessionPolicy) =>
      client.$transaction(async (tx) => {
        await acquireCanonicalSecurityMutationLocks(tx, {
          organizationIds: [ctx.orgId],
          userIds: [ctx.userId],
        });
        return policy.enqueueInTransactionWithAuthoritativeInvalidation(tx, {
          eventType: 'PASSWORD_CHANGED',
          userId: ctx.userId,
          organizationId: ctx.orgId,
          idempotencyKey: opKey,
          mutationVersion: versionBefore + 1,
        });
      });

    const [left, right] = await Promise.all([
      apply(prismaA, stackA.sessionPolicy),
      apply(prismaB, stackB.sessionPolicy),
    ]);
    expect(left.idempotentReplay || right.idempotentReplay).toBe(true);
    expect([left, right].filter((r) => r.idempotentReplay).length).toBe(1);
    const applied = left.idempotentReplay ? right : left;
    await stackA.sessionPolicy.processIntents(applied.intentIds);
    const intentRow = await prismaA.iamSessionRevocationIntent.findFirst({
      where: { id: { in: applied.intentIds } },
    });
    expect(intentRow?.revokedTokenCount ?? 0).toBeGreaterThan(0);
    const versionAfter = (
      await prismaA.user.findUnique({ where: { id: ctx.userId }, select: { sessionVersion: true } })
    )!.sessionVersion;
    expect(versionAfter).toBe(versionBefore + 1);
    const intents = await prismaA.iamSessionRevocationIntent.findMany({
      where: { idempotencyKey: { startsWith: opKey } },
    });
    expect(intents.length).toBe(1);

    const fresh = await issueBound(stackA.refresh, ctx.userId, ctx.email, {
      ...ctx.membership,
      membershipVersion: 0,
    });
    await stackA.authority.validateAccessJwt(
      jwt.verify(fresh.accessToken, JWT_SECRET) as never,
    );
    const replay = await prismaA.$transaction((tx) =>
      stackA.sessionPolicy.enqueueInTransactionWithAuthoritativeInvalidation(tx, {
        eventType: 'PASSWORD_CHANGED',
        userId: ctx.userId,
        organizationId: ctx.orgId,
        idempotencyKey: opKey,
        mutationVersion: versionAfter,
      }),
    );
    expect(replay.idempotentReplay).toBe(true);
    await stackA.authority.validateAccessJwt(
      jwt.verify(fresh.accessToken, JWT_SECRET) as never,
    );
    await expect(stackA.authority.validateAccessJwt(preDecoded as never)).rejects.toThrow();
    await stackA.refresh.rotate(fresh.refreshToken);
  });

  it('B10 AccountService.changePassword contends with refresh via user advisory lock', async () => {
    const ctx = await seedUserWithOrg();
    const issued = await issueBound(stackA.refresh, ctx.userId, ctx.email, ctx.membership);
    const holder = holdUserSessionWriteLockTransaction(prismaA, ctx.userId);
    await waitUntilUserAdvisoryLockHeld(prismaB, ctx.userId);
    const changeP = accountA.changePassword(
      ctx.userId,
      ctx.orgId,
      {
        currentPassword: ctx.passwordPlain,
        newPassword: 'P2cNew2!long-pass',
        confirmPassword: 'P2cNew2!long-pass',
        revokeOtherSessions: true,
      },
      {},
    );
    await waitUntilAdvisoryLockWaiters(prismaA, ctx.userId, 1);
    const pidRotate = await pgBackendPid(prismaB);
    const rotateP = stackB.refresh.rotate(issued.refreshToken);
    await waitUntilBackendBlocked(prismaA, pidRotate);
    holder.release();
    await holder.completion;
    const [, rotateOutcome] = await Promise.allSettled([changeP, rotateP]);
    expect(rotateOutcome.status).toBe('rejected');
  });

  it('B10 MFA reset contends with refresh via user advisory lock', async () => {
    const ctx = await seedUserWithOrg();
    await prismaA.userMfaFactor.create({
      data: {
        userId: ctx.userId,
        factorType: MfaFactorType.TOTP,
        encryptedSecret: 'enc',
        label: 'p2c',
        verifiedAt: new Date(),
        enabledAt: new Date(),
      },
    });
    const issued = await issueBound(stackA.refresh, ctx.userId, ctx.email, ctx.membership);
    const holder = holdUserSessionWriteLockTransaction(prismaA, ctx.userId);
    await waitUntilUserAdvisoryLockHeld(prismaB, ctx.userId);
    const resetP = mfaReset.resetMfaForUser({
      organizationId: ctx.orgId,
      targetUserId: ctx.userId,
      actorUserId: ctx.userId,
      idempotencyKey: `b10-mfa:${randomUUID()}`,
    });
    await waitUntilAdvisoryLockWaiters(prismaA, ctx.userId, 1);
    const pidRotate = await pgBackendPid(prismaB);
    const rotateP = stackB.refresh.rotate(issued.refreshToken);
    await waitUntilBackendBlocked(prismaA, pidRotate);
    holder.release();
    await holder.completion;
    const [, rotateOutcome] = await Promise.allSettled([resetP, rotateP]);
    expect(rotateOutcome.status).toBe('rejected');
  });

  it('B10 membership suspend contends with refresh via user advisory lock', async () => {
    const ctx = await seedUserWithOrg();
    const issued = await issueBound(stackA.refresh, ctx.userId, ctx.email, ctx.membership);
    const holder = holdUserSessionWriteLockTransaction(prismaA, ctx.userId);
    await waitUntilUserAdvisoryLockHeld(prismaB, ctx.userId);
    const suspendP = lifecycle.suspend({
      organizationId: ctx.orgId,
      userId: ctx.userId,
      idempotencyKey: `b10-mem:${randomUUID()}`,
      reason: 'p2c-b10',
    });
    await waitUntilAdvisoryLockWaiters(prismaA, ctx.userId, 1);
    const pidRotate = await pgBackendPid(prismaB);
    const rotateP = stackB.refresh.rotate(issued.refreshToken);
    await waitUntilBackendBlocked(prismaA, pidRotate);
    holder.release();
    await holder.completion;
    const [, rotateOutcome] = await Promise.allSettled([suspendP, rotateP]);
    expect(rotateOutcome.status).toBe('rejected');
  });

  it('CROSS_REPLICA revoke on B denies on A authority', async () => {
    const ctx = await seedUserWithOrg();
    const issued = await issueBound(stackA.refresh, ctx.userId, ctx.email, ctx.membership);
    const decoded = jwt.verify(issued.accessToken, JWT_SECRET) as jwt.JwtPayload;
    await stackB.sessionPolicy.recordAndExecute({
      eventType: 'PASSWORD_CHANGED',
      userId: ctx.userId,
    });
    await expect(stackA.authority.validateAccessJwt(decoded as never)).rejects.toThrow();
    await expect(authorityB.validateAccessJwt(decoded as never)).rejects.toThrow();
    const fresh = await issueBound(stackB.refresh, ctx.userId, ctx.email, {
      ...ctx.membership,
      membershipVersion: 1,
    });
    const freshDecoded = jwt.verify(fresh.accessToken, JWT_SECRET) as jwt.JwtPayload;
    await stackA.authority.validateAccessJwt(freshDecoded as never);
  });
});