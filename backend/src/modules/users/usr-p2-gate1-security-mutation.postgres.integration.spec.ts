/**
 * GATE-1 — security mutation atomicity (AccountService.changePassword + delayed processIntents).
 */
import { randomUUID } from 'node:crypto';
import * as bcrypt from 'bcrypt';
import * as jwt from 'jsonwebtoken';
import { BusinessType, PrismaClient, UserPlatformRole, UserStatus } from '@prisma/client';
import { ConfigService } from '@nestjs/config';
import { AccountService } from '@modules/account/account.service';
import { RefreshTokenService } from '@modules/auth/refresh-token.service';
import { IamSessionPolicyService, IamSessionNotificationService } from '@modules/auth/iam-session-policy.service';
import { PlatformPermissionService } from '@modules/users/platform-permissions/platform-permission.service';
import { UserAccessAuthorityService } from '@shared/auth/user-access-authority.service';
import { UserAccessAuditService } from '@modules/users/user-access-audit.service';
import { PasswordPolicyService } from '@shared/auth/password-policy.service';
import { AuditService } from '@modules/activity-log/audit.service';
import { AuthMfaLoginService } from '@modules/auth/auth-mfa-login.service';
import { UnauthorizedException } from '@nestjs/common';

const OPT_IN = 'USR_P2_GATE1_PG';
const JWT_SECRET = 'usr-p2-gate1-secret';
const run = process.env[OPT_IN] === '1';

function assertDisposableDb(): void {
  if (process.env[OPT_IN] !== '1') throw new Error(`${OPT_IN}=1 required`);
  const url = process.env.DATABASE_URL ?? '';
  if (!/localhost|127\.0\.0\.1/.test(url) || !/usr/i.test(url)) {
    throw new Error('DATABASE_URL must target disposable localhost test DB');
  }
}

(run ? describe : describe.skip)('GATE-1 security mutation atomicity (PostgreSQL)', () => {
  jest.setTimeout(300_000);
  let prisma: PrismaClient;
  let account: AccountService;
  let refreshTokens: RefreshTokenService;
  let sessionPolicy: IamSessionPolicyService;
  let authority: UserAccessAuthorityService;
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

  async function seedMembershipUser(passwordPlain?: string) {
    const email = `gate1-${randomUUID()}@example.test`;
    const passwordHash = passwordPlain ? await bcrypt.hash(passwordPlain, 10) : null;
    const user = await prisma.user.create({
      data: {
        email,
        passwordHash,
        mustChangePassword: false,
        platformRole: UserPlatformRole.USER,
        status: UserStatus.ACTIVE,
      },
    });
    const org = await prisma.organization.create({
      data: { companyName: `Gate1 Org ${randomUUID().slice(0, 6)}`, businessType: BusinessType.RENTAL },
    });
    const membership = await prisma.organizationMembership.create({
      data: {
        userId: user.id,
        organizationId: org.id,
        role: 'WORKER',
        roleLabel: 'Worker',
        status: 'ACTIVE',
      },
    });
    return {
      id: user.id,
      email: user.email,
      orgId: org.id,
      membershipId: membership.id,
      password: passwordPlain,
    };
  }

  it('GATE1 authoritative invalidation effective before deferred processIntents', async () => {
    const user = await seedMembershipUser();
    const issued = await refreshTokens.issueTokenPair(
      {
        id: user.id,
        email: user.email,
        platformRole: UserPlatformRole.USER,
        sessionVersion: 0,
        securityVersion: 0,
      },
      {
        organizationId: user.orgId,
        membershipId: user.membershipId,
        role: 'WORKER',
        membershipVersion: 0,
      },
    );
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

    const txPromise = prisma.$transaction(async (tx) => {
      await tx.$executeRaw`
        UPDATE users SET updated_at = NOW() WHERE id = ${user.id}
      `;
      return sessionPolicy.enqueueInTransactionWithAuthoritativeInvalidation(tx, {
        eventType: 'PASSWORD_CHANGED',
        userId: user.id,
        organizationId: user.orgId,
        actorUserId: user.id,
      });
    });
    await new Promise((r) => setTimeout(r, 100));
    await expect(authority.validateAccessJwt(decoded as never)).rejects.toThrow();
    await expect(refreshTokens.rotate(issued.refreshToken)).rejects.toThrow(/no longer valid/i);
    release();
    await txPromise;
    jest.restoreAllMocks();
  });

  it('GATE1 AccountService.changePassword denies tokens before processIntents resumes', async () => {
    const user = await seedMembershipUser('oldpassword1');
    const issued = await refreshTokens.issueTokenPair(
      {
        id: user.id,
        email: user.email,
        platformRole: UserPlatformRole.USER,
        sessionVersion: 0,
        securityVersion: 0,
      },
      {
        organizationId: user.orgId,
        membershipId: user.membershipId,
        role: 'WORKER',
        membershipVersion: 0,
      },
    );
    const decoded = jwt.verify(issued.accessToken, JWT_SECRET) as jwt.JwtPayload;
    const liveBefore = await prisma.$queryRaw<Array<{ session_version: number }>>`
      SELECT session_version FROM users WHERE id = ${user.id}
    `;
    const pendingToken = mfaLogin.signMfaPendingToken({
      userId: user.id,
      sessionVersion: liveBefore[0]!.session_version,
      securityVersion: 0,
      platformRole: UserPlatformRole.USER,
    });

    let releaseProcessIntents!: () => void;
    const processBlocked = new Promise<void>((resolve) => {
      releaseProcessIntents = resolve;
    });
    const origProcess = sessionPolicy.processIntents.bind(sessionPolicy);
    jest.spyOn(sessionPolicy, 'processIntents').mockImplementation(async (ids) => {
      await processBlocked;
      return origProcess(ids);
    });

    const changePromise = account.changePassword(
      user.id,
      user.orgId,
      {
        currentPassword: 'oldpassword1',
        newPassword: 'newpassword2',
        confirmPassword: 'newpassword2',
        revokeOtherSessions: true,
      },
      {},
    );

    await new Promise((r) => setTimeout(r, 150));
    await expect(authority.validateAccessJwt(decoded as never)).rejects.toThrow();
    await expect(refreshTokens.rotate(issued.refreshToken)).rejects.toThrow(/no longer valid/i);
    await expect(
      mfaLogin.completeLoginMfa({ mfaPendingToken: pendingToken, code: '123456' }),
    ).rejects.toBeInstanceOf(UnauthorizedException);

    const midRow = await prisma.$queryRaw<Array<{ session_version: number }>>`
      SELECT session_version FROM users WHERE id = ${user.id}
    `;
    expect(midRow[0]!.session_version).toBeGreaterThan(0);

    releaseProcessIntents();
    await changePromise;

    await expect(refreshTokens.rotate(issued.refreshToken)).rejects.toThrow(/no longer valid/i);
    const afterLogin = await refreshTokens.issueTokenPair(
      {
        id: user.id,
        email: user.email,
        platformRole: UserPlatformRole.USER,
        sessionVersion: midRow[0]!.session_version,
        securityVersion: 0,
      },
      {
        organizationId: user.orgId,
        membershipId: user.membershipId,
        role: 'WORKER',
        membershipVersion: 0,
      },
    );
    const freshDecoded = jwt.verify(afterLogin.accessToken, JWT_SECRET) as jwt.JwtPayload;
    await authority.validateAccessJwt(freshDecoded as never);
    jest.restoreAllMocks();
  });
});