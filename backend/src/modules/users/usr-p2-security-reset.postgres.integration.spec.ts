/**
 * USR-P2 security mutation invalidation (production session policy paths).
 */
import { randomUUID } from 'node:crypto';
import * as jwt from 'jsonwebtoken';
import { BusinessType, PrismaClient, UserPlatformRole, UserStatus } from '@prisma/client';
import { ConfigService } from '@nestjs/config';
import { RefreshTokenService } from '@modules/auth/refresh-token.service';
import { IamSessionPolicyService, IamSessionNotificationService } from '@modules/auth/iam-session-policy.service';
import { PlatformPermissionService } from '@modules/users/platform-permissions/platform-permission.service';
import { UserAccessAuthorityService } from '@shared/auth/user-access-authority.service';
import { UserAccessAuditService } from '@modules/users/user-access-audit.service';
import { ACCESS_AUTHORITY_FAILURE_CODES } from '@shared/auth/user-access-authority.types';
import { AuthMfaLoginService } from '@modules/auth/auth-mfa-login.service';
import { UnauthorizedException } from '@nestjs/common';

const OPT_IN = 'USR_P2_SECURITY_RESET_PG';
const JWT_SECRET = 'usr-p2-security-reset-secret';
const run = process.env[OPT_IN] === '1';

function assertDisposableDb(): void {
  if (process.env[OPT_IN] !== '1') throw new Error(`${OPT_IN}=1 required`);
  const url = process.env.DATABASE_URL ?? '';
  if (!/localhost|127\.0\.0\.1/.test(url) || !/usr/i.test(url)) {
    throw new Error('DATABASE_URL must target disposable localhost test DB');
  }
}

(run ? describe : describe.skip)('USR-P2 security reset invalidation (PostgreSQL)', () => {
  jest.setTimeout(240_000);
  let prisma: PrismaClient;
  let refreshTokens: RefreshTokenService;
  let sessionPolicy: IamSessionPolicyService;
  let authority: UserAccessAuthorityService;

  beforeAll(() => {
    assertDisposableDb();
    process.env.JWT_SECRET = JWT_SECRET;
    prisma = new PrismaClient();
    const config = {
      get: (key: string, fallback?: unknown) => {
        if (key === 'app.jwtSecret') return JWT_SECRET;
        if (key === 'app.jwtExpiresIn') return '15m';
        if (key === 'iam.enableOrgBoundRefreshSessions') return true;
        if (key === 'iam.enableLegacyUnscopedRefreshGrace') return false;
        return fallback;
      },
    } as ConfigService;
    const userAudit = { record: jest.fn().mockResolvedValue(undefined) } as unknown as UserAccessAuditService;
    const platformPermissions = new PlatformPermissionService(prisma as never);
    const notifications = new IamSessionNotificationService();
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
  });

  afterAll(async () => {
    await prisma?.$disconnect();
  });

  async function seedUser(role: UserPlatformRole = UserPlatformRole.USER) {
    const id = randomUUID();
    const email = `sec-reset-${id}@example.test`;
    await prisma.$executeRaw`
      INSERT INTO users (id, email, platform_role, status, created_at, updated_at, session_version, security_version)
      VALUES (
        ${id}, ${email}, ${role}::"UserPlatformRole", ${UserStatus.ACTIVE}::"UserStatus",
        NOW(), NOW(), 0, 0
      )
    `;
    return { id, email };
  }

  async function issuePlatformSession(user: { id: string; email: string }) {
    return refreshTokens.issueTokenPair(
      {
        id: user.id,
        email: user.email,
        platformRole: UserPlatformRole.USER,
        sessionVersion: 0,
        securityVersion: 0,
      },
      null,
    );
  }

  it('PASSWORD_CHANGED policy rejects old access and refresh tokens', async () => {
    const user = await seedUser();
    const issued = await issuePlatformSession(user);
    const decoded = jwt.verify(issued.accessToken, JWT_SECRET) as jwt.JwtPayload;
    await sessionPolicy.recordAndExecute({
      eventType: 'PASSWORD_CHANGED',
      userId: user.id,
      actorUserId: user.id,
    });
    await expect(authority.validateAccessJwt(decoded as never)).rejects.toMatchObject({
      response: { code: ACCESS_AUTHORITY_FAILURE_CODES.SESSION_VERSION_MISMATCH },
    });
    await expect(refreshTokens.rotate(issued.refreshToken)).rejects.toThrow(/no longer valid/i);
    const live = await prisma.$queryRaw<Array<{ session_version: number; security_version: number }>>`
      SELECT session_version, security_version FROM users WHERE id = ${user.id}
    `;
    const fresh = await refreshTokens.issueTokenPair(
      {
        id: user.id,
        email: user.email,
        platformRole: UserPlatformRole.USER,
        sessionVersion: live[0]!.session_version,
        securityVersion: live[0]!.security_version,
      },
      null,
    );
    const freshDecoded = jwt.verify(fresh.accessToken, JWT_SECRET) as jwt.JwtPayload;
    await authority.validateAccessJwt(freshDecoded as never);
  });

  it('PASSWORD_CHANGED invalidates stale MFA pending challenge', async () => {
    const user = await seedUser(UserPlatformRole.USER);
    const issued = await issuePlatformSession(user);
    const decoded = jwt.verify(issued.accessToken, JWT_SECRET) as jwt.JwtPayload;
    const mfaLogin = new AuthMfaLoginService(
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
      new PlatformPermissionService(prisma as never),
    );
    const liveRow = await prisma.$queryRaw<Array<{ session_version: number; security_version: number }>>`
      SELECT session_version, security_version FROM users WHERE id = ${user.id}
    `;
    const pendingToken = mfaLogin.signMfaPendingToken({
      userId: user.id,
      sessionVersion: liveRow[0]!.session_version,
      securityVersion: liveRow[0]!.security_version,
      platformRole: UserPlatformRole.USER,
    });
    await sessionPolicy.recordAndExecute({
      eventType: 'PASSWORD_CHANGED',
      userId: user.id,
      actorUserId: user.id,
    });
    await expect(authority.validateAccessJwt(decoded as never)).rejects.toThrow();
    await expect(
      mfaLogin.completeLoginMfa({ mfaPendingToken: pendingToken, code: '123456' }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    await expect(refreshTokens.rotate(issued.refreshToken)).rejects.toThrow(/no longer valid/i);
  });

  it('account suspension rejects active session authority', async () => {
    const user = await seedUser();
    const issued = await issuePlatformSession(user);
    const decoded = jwt.verify(issued.accessToken, JWT_SECRET) as jwt.JwtPayload;
    await prisma.$executeRaw`
      UPDATE users SET status = ${UserStatus.INACTIVE}::"UserStatus", updated_at = NOW() WHERE id = ${user.id}
    `;
    await expect(authority.validateAccessJwt(decoded as never)).rejects.toMatchObject({
      response: { code: ACCESS_AUTHORITY_FAILURE_CODES.USER_INACTIVE },
    });
  });
});