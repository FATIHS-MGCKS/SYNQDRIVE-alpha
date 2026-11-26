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
  let mfaLogin: AuthMfaLoginService;

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
    const iamAudit = {
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
  });

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
    jest.spyOn(sessionPolicy, 'processIntents').mockImplementation(async () => {
      await blocked;
      return [];
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
    const bumpDeadlineB02 = Date.now() + 30_000;
    while (Date.now() < bumpDeadlineB02) {
      const liveBump = await prisma.user.findUnique({
        where: { id: ctx.user.id },
        select: { sessionVersion: true },
      });
      if ((liveBump?.sessionVersion ?? 0) > 0) break;
      await new Promise((r) => setTimeout(r, 50));
    }

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

  it('B04 same-operation replay does not re-bump session version', async () => {
    const ctx = await seedUserWithOrg('Replay1!xx');
    const opKey = `p2b-replay:${randomUUID()}`;
    let firstVersion = 0;
    await prisma.$transaction(async (tx) => {
      await acquireCanonicalSecurityMutationLocks(tx, {
        organizationIds: [ctx.orgA.id],
        userIds: [ctx.user.id],
      });
      const u = await tx.user.findUnique({
        where: { id: ctx.user.id },
        select: { sessionVersion: true },
      });
      firstVersion = u!.sessionVersion;
      await sessionPolicy.enqueueInTransactionWithAuthoritativeInvalidation(tx, {
        eventType: 'PASSWORD_CHANGED',
        userId: ctx.user.id,
        organizationId: ctx.orgA.id,
        idempotencyKey: opKey,
        mutationVersion: firstVersion + 1,
      });
    });
    const afterFirst = await prisma.user.findUnique({
      where: { id: ctx.user.id },
      select: { sessionVersion: true },
    });
    await prisma.$transaction(async (tx) => {
      const again = await sessionPolicy.enqueueInTransactionWithAuthoritativeInvalidation(tx, {
        eventType: 'PASSWORD_CHANGED',
        userId: ctx.user.id,
        organizationId: ctx.orgA.id,
        idempotencyKey: opKey,
        mutationVersion: firstVersion + 1,
      });
      expect(again.idempotentReplay).toBe(true);
    });
    const afterReplay = await prisma.user.findUnique({
      where: { id: ctx.user.id },
      select: { sessionVersion: true },
    });
    expect(afterReplay!.sessionVersion).toBe(afterFirst!.sessionVersion);
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

    await passwordReset.confirmReset({
      token: plain,
      newPassword: 'ResetTok2!long',
      confirmPassword: 'ResetTok2!long',
    });

    await expect(authority.validateAccessJwt(decoded as never)).rejects.toThrow();
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

  it('B08 MFA reset invalidates sessions and stale MFA pending token', async () => {
    const ctx = await seedUserWithOrg('MfaReset1!');
    await prisma.userMfaFactor.create({
      data: {
        userId: ctx.user.id,
        factorType: MfaFactorType.TOTP,
        encryptedSecret: 'enc',
        label: 'test',
        verifiedAt: new Date(),
        enabledAt: new Date(),
      },
    });
    const issued = await issueOrgSession(ctx.user, ctx.orgA.id, ctx.memA.id);
    const decoded = jwt.verify(issued.accessToken, JWT_SECRET) as jwt.JwtPayload;
    const userRow = await prisma.user.findUnique({
      where: { id: ctx.user.id },
      select: { sessionVersion: true, securityVersion: true, platformRole: true },
    });
    const pendingToken = mfaLogin.signMfaPendingToken({
      userId: ctx.user.id,
      sessionVersion: userRow!.sessionVersion,
      securityVersion: userRow!.securityVersion,
      platformRole: userRow!.platformRole,
    });

    await mfaReset.resetMfaForUser({
      organizationId: ctx.orgA.id,
      targetUserId: ctx.user.id,
      actorUserId: ctx.user.id,
      idempotencyKey: `mfa-reset:${randomUUID()}`,
    });

    await expect(authority.validateAccessJwt(decoded as never)).rejects.toThrow();
    await expect(refreshTokens.rotate(issued.refreshToken)).rejects.toThrow(/no longer valid/i);
    await expect(
      mfaLogin.completeLoginMfa({ mfaPendingToken: pendingToken, code: '123456' }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
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

    await expect(refreshTokens.rotate(sessionA.refreshToken)).rejects.toThrow();
    await authority.validateAccessJwt(decodedB as never);
    const rotatedB = await refreshTokens.rotate(sessionB.refreshToken);
    expect(rotatedB.accessToken).toBeTruthy();
    jest.restoreAllMocks();
  });
});