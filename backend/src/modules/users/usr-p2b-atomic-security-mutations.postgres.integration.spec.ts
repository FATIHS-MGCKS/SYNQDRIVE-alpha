/**
 * USR-P2B — atomic security mutations (B01–B10 focused matrix).
 */
import { randomUUID } from 'node:crypto';
import * as bcrypt from 'bcrypt';
import * as jwt from 'jsonwebtoken';
import {
  BusinessType,
  MfaFactorType,
  MembershipStatus,
  PasswordResetPurpose,
  PrismaClient,
  UserPlatformRole,
  UserStatus,
} from '@prisma/client';
import { ConfigService } from '@nestjs/config';
import { UnauthorizedException } from '@nestjs/common';
import { AccountService } from '@modules/account/account.service';
import { PasswordResetService } from '@modules/auth/password-reset.service';
import { RefreshTokenService } from '@modules/auth/refresh-token.service';
import { IamSessionPolicyService, IamSessionNotificationService } from '@modules/auth/iam-session-policy.service';
import { PlatformPermissionService } from '@modules/users/platform-permissions/platform-permission.service';
import { UserAccessAuthorityService } from '@shared/auth/user-access-authority.service';
import { UserAccessAuditService } from '@modules/users/user-access-audit.service';
import { PasswordPolicyService } from '@shared/auth/password-policy.service';
import { AuditService } from '@modules/activity-log/audit.service';
import { AuthMfaLoginService } from '@modules/auth/auth-mfa-login.service';
import { IamMfaResetService } from '@modules/iam-mfa/iam-mfa-reset.service';
import { IamAuditService } from '@modules/users/iam-audit.service';
import { IamMembershipLifecycleService } from '@modules/users/iam-membership-lifecycle.service';
import { generatePasswordResetToken, passwordResetTokenLookupKey } from '@modules/auth/utils/password-reset-token.util';
import { acquireCanonicalSecurityMutationLocks } from '@modules/auth/iam-security-mutation-concurrency';

const OPT_IN = 'USR_P2B_ATOMIC_SECURITY_PG';
const JWT_SECRET = 'usr-p2b-atomic-security-secret';
const run = process.env[OPT_IN] === '1';

function assertDisposableDb(): void {
  if (process.env[OPT_IN] !== '1') throw new Error(`${OPT_IN}=1 required`);
  const url = process.env.DATABASE_URL ?? '';
  if (!/localhost|127\.0\.0\.1/.test(url) || !/usr/i.test(url)) {
    throw new Error('DATABASE_URL must target disposable localhost test DB');
  }
}

(run ? describe : describe.skip)('USR-P2B atomic security mutations (PostgreSQL)', () => {
  jest.setTimeout(360_000);
  let prisma: PrismaClient;
  let account: AccountService;
  let refreshTokens: RefreshTokenService;
  let sessionPolicy: IamSessionPolicyService;
  let authority: UserAccessAuthorityService;
  let passwordReset: PasswordResetService;
  let mfaReset: IamMfaResetService;
  let lifecycle: IamMembershipLifecycleService;
  let iamAudit: IamAuditService;
  let mfaLogin: AuthMfaLoginService;
  let prismaB: PrismaClient;

  const config = {
    get: (key: string, fallback?: unknown) => {
      if (key === 'app.jwtSecret') return JWT_SECRET;
      if (key === 'app.jwtExpiresIn') return '15m';
      if (key === 'iam.enableOrgBoundRefreshSessions') return true;
      if (key === 'iam.enableLegacyUnscopedRefreshGrace') return false;
      return fallback;
    },
  } as ConfigService;

  beforeAll(() => {
    assertDisposableDb();
    process.env.JWT_SECRET = JWT_SECRET;
    prisma = new PrismaClient();
    prismaB = new PrismaClient();
    const userAudit = { record: jest.fn().mockResolvedValue(undefined) } as unknown as UserAccessAuditService;
    const notifications = new IamSessionNotificationService();
    const platformPermissions = new PlatformPermissionService(prisma as never);
    refreshTokens = new RefreshTokenService(
      prisma as never,
      config,
      { recordAndExecute: jest.fn() } as never,
      platformPermissions,
    );
    sessionPolicy = new IamSessionPolicyService(
      prisma as never,
      refreshTokens,
      userAudit,
      notifications,
    );
    authority = new UserAccessAuthorityService(prisma as never, platformPermissions);
    account = new AccountService(
      prisma as never,
      { record: jest.fn() } as unknown as AuditService,
      refreshTokens,
      sessionPolicy,
      new PasswordPolicyService(),
    );
    passwordReset = new PasswordResetService(
      prisma as never,
      new PasswordPolicyService(),
      { assertWithinLimit: jest.fn().mockResolvedValue(undefined) } as never,
      { sendPasswordResetCompleted: jest.fn() } as never,
      sessionPolicy,
      userAudit,
    );
    iamAudit = {
      enqueueInTransaction: jest.fn().mockImplementation(async (tx, input) => {
        return { id: randomUUID(), ...input };
      }),
      processOutboxIds: jest.fn().mockResolvedValue(undefined),
    } as unknown as IamAuditService;
    mfaReset = new IamMfaResetService(prisma as never, sessionPolicy, iamAudit);
    lifecycle = new IamMembershipLifecycleService(
      prisma as never,
      iamAudit,
      { notifyAfterCommit: jest.fn() } as never,
      sessionPolicy,
    );
    mfaLogin = new AuthMfaLoginService(
      { get: () => JWT_SECRET } as never,
      prisma as never,
      refreshTokens,
      { isMfaEnrolled: jest.fn().mockResolvedValue(true) } as never,
      {
        verifyLoginMfaTotp: jest.fn().mockResolvedValue({
          claims: {
            assuranceLevel: 2,
            authenticatedAt: new Date().toISOString(),
            mfaAuthenticatedAt: new Date().toISOString(),
            authMethods: ['pwd', 'totp'],
            securityVersion: 0,
          },
        }),
      } as never,
      platformPermissions,
    );
  });

  afterAll(async () => {
    await prisma?.$disconnect();
    await prismaB?.$disconnect();
  });

  async function waitForSessionBump(userId: string, minVersion = 1, timeoutMs = 30_000) {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      const live = await prisma.user.findUnique({
        where: { id: userId },
        select: { sessionVersion: true },
      });
      if ((live?.sessionVersion ?? 0) >= minVersion) return live!.sessionVersion;
      await new Promise((r) => setTimeout(r, 50));
    }
    throw new Error('timeout waiting for session version bump');
  }

  async function seedUserWithOrg(passwordPlain = 'password-A1!long') {
    const email = `p2b-${randomUUID()}@example.test`;
    const passwordHash = await bcrypt.hash(passwordPlain, 10);
    const user = await prisma.user.create({
      data: {
        email,
        passwordHash,
        mustChangePassword: false,
        platformRole: UserPlatformRole.USER,
        status: UserStatus.ACTIVE,
      },
    });
    const orgA = await prisma.organization.create({
      data: { companyName: `OrgA ${randomUUID().slice(0, 6)}`, businessType: BusinessType.RENTAL },
    });
    const orgB = await prisma.organization.create({
      data: { companyName: `OrgB ${randomUUID().slice(0, 6)}`, businessType: BusinessType.RENTAL },
    });
    const memA = await prisma.organizationMembership.create({
      data: {
        userId: user.id,
        organizationId: orgA.id,
        role: 'WORKER',
        roleLabel: 'Worker',
        status: MembershipStatus.ACTIVE,
      },
    });
    const memB = await prisma.organizationMembership.create({
      data: {
        userId: user.id,
        organizationId: orgB.id,
        role: 'WORKER',
        roleLabel: 'Worker',
        status: MembershipStatus.ACTIVE,
      },
    });
    return { user, orgA, orgB, memA, memB, passwordPlain };
  }

  async function issueOrgSession(
    user: { id: string; email: string },
    orgId: string,
    membershipId: string,
    sessionVersion = 0,
  ) {
    return refreshTokens.issueTokenPair(
      {
        id: user.id,
        email: user.email,
        platformRole: UserPlatformRole.USER,
        sessionVersion,
        securityVersion: 0,
      },
      {
        organizationId: orgId,
        membershipId,
        role: 'WORKER',
        membershipVersion: 0,
      },
    );
  }

  it('B01 AccountService password change denies old credentials before processIntents', async () => {
    const ctx = await seedUserWithOrg('OldPass1!x');
    const issued = await issueOrgSession(ctx.user, ctx.orgA.id, ctx.memA.id);
    const decoded = jwt.verify(issued.accessToken, JWT_SECRET) as jwt.JwtPayload;

    let release!: () => void;
    const blocked = new Promise<void>((r) => {
      release = r;
    });
    const orig = sessionPolicy.processIntents.bind(sessionPolicy);
    jest.spyOn(sessionPolicy, 'processIntents').mockImplementation(async (ids) => {
      await blocked;
      return orig(ids);
    });

    const changePromise = account.changePassword(
      ctx.user.id,
      ctx.orgA.id,
      {
        currentPassword: ctx.passwordPlain,
        newPassword: 'NewPass2!y-long',
        confirmPassword: 'NewPass2!y-long',
        revokeOtherSessions: true,
      },
      {},
    );

    const bumpDeadline = Date.now() + 30_000;
    while (Date.now() < bumpDeadline) {
      const live = await prisma.user.findUnique({
        where: { id: ctx.user.id },
        select: { sessionVersion: true },
      });
      if ((live?.sessionVersion ?? 0) > 0) break;
      await new Promise((r) => setTimeout(r, 50));
    }
    await expect(authority.validateAccessJwt(decoded as never)).rejects.toThrow();
    await expect(refreshTokens.rotate(issued.refreshToken)).rejects.toThrow(/no longer valid/i);

    release();
    await changePromise;
  });

  it('B02 fresh login remains valid after deferred processIntents completes', async () => {
    const ctx = await seedUserWithOrg('Fresh1!aa-long');
    await issueOrgSession(ctx.user, ctx.orgA.id, ctx.memA.id);

    let release!: () => void;
    const blocked = new Promise<void>((r) => {
      release = r;
    });
    const origProcess = sessionPolicy.processIntents.bind(sessionPolicy);
    let reachedPostCommit = false;
    jest.spyOn(sessionPolicy, 'processIntents').mockImplementation(async (ids) => {
      reachedPostCommit = true;
      await blocked;
      return origProcess(ids);
    });

    const changePromise = account.changePassword(
      ctx.user.id,
      ctx.orgA.id,
      {
        currentPassword: ctx.passwordPlain,
        newPassword: 'Fresh2!bb-long',
        confirmPassword: 'Fresh2!bb-long',
        revokeOtherSessions: true,
      },
      {},
    );
    const bumpedVersion = await waitForSessionBump(ctx.user.id);
    const postCommitDeadline = Date.now() + 30_000;
    while (!reachedPostCommit && Date.now() < postCommitDeadline) {
      await new Promise((r) => setTimeout(r, 25));
    }
    expect(reachedPostCommit).toBe(true);

    const live = await prisma.user.findUnique({
      where: { id: ctx.user.id },
      select: { sessionVersion: true, email: true },
    });
    const midSession = await refreshTokens.issueTokenPair(
      {
        id: ctx.user.id,
        email: live!.email,
        platformRole: UserPlatformRole.USER,
        sessionVersion: live!.sessionVersion,
        securityVersion: 0,
      },
      {
        organizationId: ctx.orgA.id,
        membershipId: ctx.memA.id,
        role: 'WORKER',
        membershipVersion: 0,
      },
    );
    const midDecoded = jwt.verify(midSession.accessToken, JWT_SECRET) as jwt.JwtPayload;
    await authority.validateAccessJwt(midDecoded as never);

    release();
    jest.restoreAllMocks();
    await changePromise;
    await authority.validateAccessJwt(midDecoded as never);
  });

  it('B03 distinct password operations use separate mutation identities', async () => {
    const ctx = await seedUserWithOrg('Distinct1!long');
    await account.changePassword(
      ctx.user.id,
      ctx.orgA.id,
      {
        currentPassword: 'Distinct1!long',
        newPassword: 'Distinct2!long',
        confirmPassword: 'Distinct2!long',
        revokeOtherSessions: true,
      },
      {},
    );
    await account.changePassword(
      ctx.user.id,
      ctx.orgA.id,
      {
        currentPassword: 'Distinct2!long',
        newPassword: 'Distinct3!long',
        confirmPassword: 'Distinct3!long',
        revokeOtherSessions: true,
      },
      {},
    );

    const intents = await prisma.iamSessionRevocationIntent.findMany({
      where: { userId: ctx.user.id, eventType: 'PASSWORD_CHANGED' },
      orderBy: { createdAt: 'asc' },
    });
    expect(intents.length).toBeGreaterThanOrEqual(2);
    const keys = new Set(intents.map((i) => i.idempotencyKey));
    expect(keys.size).toBeGreaterThanOrEqual(2);
  });

  it('B04 same-operation replay preserves fresh session and metadata', async () => {
    const ctx = await seedUserWithOrg('Replay1!xx-long');
    const opKey = `p2b-replay:${randomUUID()}`;
    const newHash = await bcrypt.hash('Replay-admin1!long', 10);
    let versionAfter = 0;
    await prisma.$transaction(async (tx) => {
      await acquireCanonicalSecurityMutationLocks(tx, {
        organizationIds: [ctx.orgA.id],
        userIds: [ctx.user.id],
      });
      const u = await tx.user.findUnique({
        where: { id: ctx.user.id },
        select: { sessionVersion: true },
      });
      await tx.user.update({
        where: { id: ctx.user.id },
        data: { passwordHash: newHash, mustChangePassword: true },
      });
      await sessionPolicy.enqueueInTransactionWithAuthoritativeInvalidation(tx, {
        eventType: 'PASSWORD_CHANGED',
        userId: ctx.user.id,
        organizationId: ctx.orgA.id,
        idempotencyKey: opKey,
        mutationVersion: u!.sessionVersion + 1,
      });
    });
    const afterFirst = await prisma.user.findUnique({
      where: { id: ctx.user.id },
      select: { sessionVersion: true, email: true },
    });
    versionAfter = afterFirst!.sessionVersion;
    const fresh = await issueOrgSession(
      { id: ctx.user.id, email: afterFirst!.email },
      ctx.orgA.id,
      ctx.memA.id,
      versionAfter,
    );
    const freshDecoded = jwt.verify(fresh.accessToken, JWT_SECRET) as jwt.JwtPayload;
    const intentRow = await prisma.iamSessionRevocationIntent.findFirst({
      where: { idempotencyKey: `${opKey}:USER_ALL_SESSIONS` },
    });
    expect(intentRow?.revokedTokenCount).toBeGreaterThanOrEqual(0);

    await prisma.$transaction(async (tx) => {
      const replay = await sessionPolicy.enqueueInTransactionWithAuthoritativeInvalidation(tx, {
        eventType: 'PASSWORD_CHANGED',
        userId: ctx.user.id,
        organizationId: ctx.orgA.id,
        idempotencyKey: opKey,
        mutationVersion: versionAfter,
      });
      expect(replay.idempotentReplay).toBe(true);
    });
    const afterReplay = await prisma.user.findUnique({
      where: { id: ctx.user.id },
      select: { sessionVersion: true },
    });
    expect(afterReplay!.sessionVersion).toBe(versionAfter);
    await authority.validateAccessJwt(freshDecoded as never);
    await refreshTokens.rotate(fresh.refreshToken);
  });

  it('B06 transaction rollback leaves no partial password mutation', async () => {
    const ctx = await seedUserWithOrg('Rollback1!');
    const before = await prisma.user.findUnique({
      where: { id: ctx.user.id },
      select: { passwordHash: true, sessionVersion: true },
    });
    await expect(
      prisma.$transaction(async (tx) => {
        await acquireCanonicalSecurityMutationLocks(tx, {
          organizationIds: [ctx.orgA.id],
          userIds: [ctx.user.id],
        });
        const hash = await bcrypt.hash('Rollback2!', 10);
        await tx.user.update({ where: { id: ctx.user.id }, data: { passwordHash: hash } });
        await sessionPolicy.enqueueInTransactionWithAuthoritativeInvalidation(tx, {
          eventType: 'PASSWORD_CHANGED',
          userId: ctx.user.id,
          organizationId: ctx.orgA.id,
          mutationVersion: before!.sessionVersion + 1,
        });
        throw new Error('inject-rollback');
      }),
    ).rejects.toThrow('inject-rollback');

    const after = await prisma.user.findUnique({
      where: { id: ctx.user.id },
      select: { passwordHash: true, sessionVersion: true },
    });
    expect(after!.passwordHash).toBe(before!.passwordHash);
    expect(after!.sessionVersion).toBe(before!.sessionVersion);
    const pending = await prisma.iamSessionRevocationIntent.count({
      where: { userId: ctx.user.id, status: 'PENDING' },
    });
    expect(pending).toBe(0);
  });

  it('B07 password reset confirm atomically consumes token and invalidates sessions', async () => {
    const ctx = await seedUserWithOrg('ResetTok1!long');
    const issued = await issueOrgSession(ctx.user, ctx.orgA.id, ctx.memA.id);
    const decoded = jwt.verify(issued.accessToken, JWT_SECRET) as jwt.JwtPayload;
    const { plain, hash } = generatePasswordResetToken();
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000);
    await prisma.passwordResetToken.create({
      data: {
        userId: ctx.user.id,
        tokenHash: hash,
        tokenLookup: passwordResetTokenLookupKey(plain),
        expiresAt,
        purpose: PasswordResetPurpose.SELF_SERVICE,
        organizationId: ctx.orgA.id,
      },
    });

    let releaseReset!: () => void;
    const resetBlocked = new Promise<void>((r) => {
      releaseReset = r;
    });
    const origResetProcess = sessionPolicy.processIntents.bind(sessionPolicy);
    jest.spyOn(sessionPolicy, 'processIntents').mockImplementation(async (ids) => {
      await resetBlocked;
      return origResetProcess(ids);
    });

    const resetPromise = passwordReset.confirmReset({
      token: plain,
      newPassword: 'ResetTok2!long',
      confirmPassword: 'ResetTok2!long',
    });
    await waitForSessionBump(ctx.user.id);
    await expect(authority.validateAccessJwt(decoded as never)).rejects.toThrow();
    await expect(refreshTokens.rotate(issued.refreshToken)).rejects.toThrow(/no longer valid/i);
    releaseReset();
    await resetPromise;
    await expect(
      passwordReset.confirmReset({
        token: plain,
        newPassword: 'ResetTok2!long',
        confirmPassword: 'ResetTok2!long',
      }),
    ).rejects.toThrow();
    jest.restoreAllMocks();
    const row = await prisma.passwordResetToken.findFirst({
      where: { userId: ctx.user.id },
      orderBy: { createdAt: 'desc' },
    });
    expect(row?.usedAt).not.toBeNull();
    const ok = await bcrypt.compare(
      'ResetTok2!long',
      (await prisma.user.findUnique({ where: { id: ctx.user.id } }))!.passwordHash!,
    );
    expect(ok).toBe(true);
  });

  it('B08 MFA reset invalidates MASTER_ADMIN pending challenge after valid pre-reset context', async () => {
    const adminEmail = `ma-${randomUUID()}@example.test`;
    const admin = await prisma.user.create({
      data: {
        email: adminEmail,
        passwordHash: await bcrypt.hash('MaAdmin1!long-x', 10),
        platformRole: UserPlatformRole.MASTER_ADMIN,
        status: UserStatus.ACTIVE,
      },
    });
    await prisma.userMfaFactor.create({
      data: {
        userId: admin.id,
        factorType: MfaFactorType.TOTP,
        encryptedSecret: 'enc-ma',
        label: 'ma',
        verifiedAt: new Date(),
        enabledAt: new Date(),
      },
    });
    const maIssued = await refreshTokens.issueTokenPair(
      {
        id: admin.id,
        email: adminEmail,
        platformRole: UserPlatformRole.MASTER_ADMIN,
        sessionVersion: 0,
        securityVersion: 0,
      },
      null,
    );
    const maDecoded = jwt.verify(maIssued.accessToken, JWT_SECRET) as jwt.JwtPayload;
    const maPending = mfaLogin.signMfaPendingToken({
      userId: admin.id,
      sessionVersion: 0,
      securityVersion: 0,
      platformRole: UserPlatformRole.MASTER_ADMIN,
    });
    await mfaLogin.completeLoginMfa({ mfaPendingToken: maPending, code: '123456' });

    const userRow = await prisma.user.findUnique({
      where: { id: admin.id },
      select: { sessionVersion: true, securityVersion: true, platformRole: true },
    });
    const pendingToken = mfaLogin.signMfaPendingToken({
      userId: admin.id,
      sessionVersion: userRow!.sessionVersion,
      securityVersion: userRow!.securityVersion,
      platformRole: UserPlatformRole.MASTER_ADMIN,
    });

    await mfaReset.resetMfaForUser({
      organizationId: 'platform',
      targetUserId: admin.id,
      actorUserId: admin.id,
      idempotencyKey: `mfa-reset:${randomUUID()}`,
    });

    await expect(authority.validateAccessJwt(maDecoded as never)).rejects.toThrow();
    await expect(refreshTokens.rotate(maIssued.refreshToken)).rejects.toThrow(/no longer valid/i);
    await expect(
      mfaLogin.completeLoginMfa({ mfaPendingToken: pendingToken, code: '123456' }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    const factorsLeft = await prisma.userMfaFactor.count({ where: { userId: admin.id } });
    expect(factorsLeft).toBe(0);
    const sec = await prisma.user.findUnique({
      where: { id: admin.id },
      select: { securityVersion: true },
    });
    expect(sec!.securityVersion).toBeGreaterThan(0);
  });

  it('B09 membership suspend revokes org A session only', async () => {
    const ctx = await seedUserWithOrg('Iso1!membership-long');
    const sessionA = await issueOrgSession(ctx.user, ctx.orgA.id, ctx.memA.id);
    const sessionB = await issueOrgSession(ctx.user, ctx.orgB.id, ctx.memB.id);
    const decodedA = jwt.verify(sessionA.accessToken, JWT_SECRET) as jwt.JwtPayload;
    const decodedB = jwt.verify(sessionB.accessToken, JWT_SECRET) as jwt.JwtPayload;

    await lifecycle.suspend({
      organizationId: ctx.orgA.id,
      userId: ctx.user.id,
      idempotencyKey: `suspend:${randomUUID()}`,
      reason: 'p2b-b09',
    });

    await expect(authority.validateAccessJwt(decodedA as never)).rejects.toThrow();
    await expect(refreshTokens.rotate(sessionA.refreshToken)).rejects.toThrow();
    await authority.validateAccessJwt(decodedB as never);
    const rotatedB = await refreshTokens.rotate(sessionB.refreshToken);
    expect(rotatedB.accessToken).toBeTruthy();
    jest.restoreAllMocks();
  });

  it('B05 concurrent replay applies authoritative mutation once', async () => {
    const ctx = await seedUserWithOrg('Concurrent1!long-x');
    const opKey = `p2b-concurrent:${randomUUID()}`;
    const versionBefore = (
      await prisma.user.findUnique({ where: { id: ctx.user.id }, select: { sessionVersion: true } })
    )!.sessionVersion;
    const sessionPolicyB = new IamSessionPolicyService(
      prismaB as never,
      refreshTokens,
      { record: jest.fn() } as never,
      new IamSessionNotificationService(),
    );

    await prisma.$transaction(async (tx) => {
      await acquireCanonicalSecurityMutationLocks(tx, {
        organizationIds: [ctx.orgA.id],
        userIds: [ctx.user.id],
      });
      await sessionPolicy.enqueueInTransactionWithAuthoritativeInvalidation(tx, {
        eventType: 'PASSWORD_CHANGED',
        userId: ctx.user.id,
        organizationId: ctx.orgA.id,
        idempotencyKey: opKey,
        mutationVersion: versionBefore + 1,
      });
    });

    const runReplay = (client: PrismaClient, policy: IamSessionPolicyService) =>
      client.$transaction(async (tx) =>
        policy.enqueueInTransactionWithAuthoritativeInvalidation(tx, {
          eventType: 'PASSWORD_CHANGED',
          userId: ctx.user.id,
          organizationId: ctx.orgA.id,
          idempotencyKey: opKey,
          mutationVersion: versionBefore + 1,
        }),
      );

    const [left, right] = await Promise.all([
      runReplay(prisma, sessionPolicy),
      runReplay(prismaB, sessionPolicyB),
    ]);
    expect(left.idempotentReplay || right.idempotentReplay).toBe(true);
    expect([left, right].filter((r) => r.idempotentReplay).length).toBeGreaterThanOrEqual(1);
    const versionAfter = (
      await prisma.user.findUnique({ where: { id: ctx.user.id }, select: { sessionVersion: true } })
    )!.sessionVersion;
    expect(versionAfter).toBe(versionBefore + 1);
    const scopedIntents = await prisma.iamSessionRevocationIntent.findMany({
      where: { idempotencyKey: { startsWith: opKey } },
    });
    expect(scopedIntents.length).toBe(1);
    expect(scopedIntents[0]!.revokedTokenCount).toBeGreaterThanOrEqual(0);
  });

  function refreshServiceOn(client: PrismaClient) {
    return new RefreshTokenService(
      client as never,
      config,
      { recordAndExecute: jest.fn() } as never,
      new PlatformPermissionService(client as never),
    );
  }

  it('B10 password mutation serializes against concurrent refresh rotation', async () => {
    const ctx = await seedUserWithOrg('LockOrd1!long-xy');
    const issued = await issueOrgSession(ctx.user, ctx.orgA.id, ctx.memA.id);
    const refreshB = refreshServiceOn(prismaB);
    const [rotateResult, changeResult] = await Promise.allSettled([
      refreshB.rotate(issued.refreshToken),
      account.changePassword(
        ctx.user.id,
        ctx.orgA.id,
        {
          currentPassword: ctx.passwordPlain,
          newPassword: 'LockOrd2!long-xy',
          confirmPassword: 'LockOrd2!long-xy',
          revokeOtherSessions: true,
        },
        {},
      ),
    ]);
    expect(changeResult.status === 'fulfilled' || rotateResult.status === 'fulfilled').toBe(true);
    if (changeResult.status === 'rejected' && rotateResult.status === 'rejected') {
      throw changeResult.reason;
    }
    const live = await prisma.user.findUnique({
      where: { id: ctx.user.id },
      select: { sessionVersion: true },
    });
    expect(live!.sessionVersion).toBeGreaterThan(0);
  });

  it('B10 MFA reset serializes against concurrent refresh rotation', async () => {
    const ctx = await seedUserWithOrg('LockMfa1!long-xy');
    await prisma.userMfaFactor.create({
      data: {
        userId: ctx.user.id,
        factorType: MfaFactorType.TOTP,
        encryptedSecret: 'enc',
        label: 'p2b',
        verifiedAt: new Date(),
        enabledAt: new Date(),
      },
    });
    const issued = await issueOrgSession(ctx.user, ctx.orgA.id, ctx.memA.id);
    const refreshB = refreshServiceOn(prismaB);
    const [rotateResult, resetResult] = await Promise.allSettled([
      refreshB.rotate(issued.refreshToken),
      mfaReset.resetMfaForUser({
        organizationId: ctx.orgA.id,
        targetUserId: ctx.user.id,
        actorUserId: ctx.user.id,
        idempotencyKey: `mfa-b10:${randomUUID()}`,
      }),
    ]);
    expect(resetResult.status === 'fulfilled' || rotateResult.status === 'fulfilled').toBe(true);
    if (resetResult.status === 'rejected' && rotateResult.status === 'rejected') {
      throw resetResult.reason;
    }
    const sec = await prisma.user.findUnique({
      where: { id: ctx.user.id },
      select: { securityVersion: true },
    });
    expect(sec!.securityVersion).toBeGreaterThan(0);
  });

  it('B10 membership mutation serializes against concurrent refresh rotation', async () => {
    const ctx = await seedUserWithOrg('LockMem1!long-xy');
    const issued = await issueOrgSession(ctx.user, ctx.orgA.id, ctx.memA.id);
    const refreshB = refreshServiceOn(prismaB);
    const [rotateResult, suspendResult] = await Promise.allSettled([
      refreshB.rotate(issued.refreshToken),
      lifecycle.suspend({
        organizationId: ctx.orgA.id,
        userId: ctx.user.id,
        idempotencyKey: `suspend-b10:${randomUUID()}`,
        reason: 'p2b-b10',
      }),
    ]);
    expect(suspendResult.status === 'fulfilled' || rotateResult.status === 'fulfilled').toBe(true);
    if (suspendResult.status === 'rejected' && rotateResult.status === 'rejected') {
      throw suspendResult.reason;
    }
    const mem = await prisma.organizationMembership.findUnique({ where: { id: ctx.memA.id } });
    expect(mem?.status).toBe(MembershipStatus.SUSPENDED);
  });

  it('ADMIN changePasswordAdmin denies old credentials and persists intent', async () => {
    const { UsersService } = await import('@modules/users/users.service');
    const usersService = new UsersService(
      prisma as never,
      iamAudit,
      lifecycle,
      passwordReset,
      sessionPolicy,
    );
    const ctx = await seedUserWithOrg('AdminPw1!long-xy');
    const operatorId = randomUUID();
    await prisma.user.create({
      data: {
        id: operatorId,
        email: `operator-${operatorId}@example.test`,
        platformRole: 'MASTER_ADMIN',
        status: 'ACTIVE',
      },
    });
    const issued = await issueOrgSession(ctx.user, ctx.orgA.id, ctx.memA.id);
    const decoded = jwt.verify(issued.accessToken, JWT_SECRET) as jwt.JwtPayload;

    await usersService.changePasswordAdmin(ctx.user.id, 'AdminSet2!long-xy', operatorId);

    await expect(authority.validateAccessJwt(decoded as never)).rejects.toThrow();
    await expect(refreshTokens.rotate(issued.refreshToken)).rejects.toThrow(/no longer valid/i);
    const row = await prisma.user.findUnique({
      where: { id: ctx.user.id },
      select: { mustChangePassword: true, passwordHash: true },
    });
    expect(row?.mustChangePassword).toBe(true);
    const ok = await bcrypt.compare('AdminSet2!long-xy', row!.passwordHash!);
    expect(ok).toBe(true);
    expect(await bcrypt.compare(ctx.passwordPlain, row!.passwordHash!)).toBe(false);
    const intent = await prisma.iamSessionRevocationIntent.findFirst({
      where: { userId: ctx.user.id, eventType: 'PASSWORD_CHANGED' },
      orderBy: { createdAt: 'desc' },
    });
    expect(intent?.idempotencyKey).toContain('USER_ALL_SESSIONS');
    expect(intent?.actorUserId).toBe(operatorId);
    expect(intent?.actorUserId).not.toBe(ctx.user.id);
  });

  it('multi-scope high-risk reuse creates distinct scope intents', async () => {
    const ctx = await seedUserWithOrg('MultiScope1!long');
    const opKey = `multi-scope:${randomUUID()}`;
    await prisma.$transaction(async (tx) => {
      await acquireCanonicalSecurityMutationLocks(tx, {
        organizationIds: [ctx.orgA.id],
        userIds: [ctx.user.id],
      });
      await sessionPolicy.enqueueInTransactionWithAuthoritativeInvalidation(tx, {
        eventType: 'REFRESH_TOKEN_REUSE_DETECTED',
        userId: ctx.user.id,
        organizationId: ctx.orgA.id,
        idempotencyKey: opKey,
        highRiskReuse: true,
        tokenFamily: 'family-test',
        mutationVersion: 1,
      });
    });
    const rows = await prisma.iamSessionRevocationIntent.findMany({
      where: { idempotencyKey: { startsWith: opKey } },
      orderBy: { idempotencyKey: 'asc' },
    });
    expect(rows.map((r) => r.idempotencyKey)).toEqual([
      `${opKey}:TOKEN_FAMILY`,
      `${opKey}:USER_ALL_SESSIONS`,
    ]);
  });
});