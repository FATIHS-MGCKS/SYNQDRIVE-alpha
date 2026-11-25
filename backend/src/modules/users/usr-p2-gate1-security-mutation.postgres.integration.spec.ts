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

  async function hasUsersColumn(column: string): Promise<boolean> {
    const rows = await prisma.$queryRaw<Array<{ column_name: string }>>`
      SELECT column_name
      FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'users' AND column_name = ${column}
    `;
    return rows.length > 0;
  }

  async function seedUserBasic() {
    const id = randomUUID();
    const email = `gate1-${id}@example.test`;
    const orgId = randomUUID();
    const membershipId = randomUUID();
    await prisma.$executeRaw`
      INSERT INTO users (id, email, platform_role, status, created_at, updated_at, session_version, security_version)
      VALUES (
        ${id}, ${email}, ${UserPlatformRole.USER}::"UserPlatformRole", ${UserStatus.ACTIVE}::"UserStatus",
        NOW(), NOW(), 0, 0
      )
    `;
    await prisma.$executeRaw`
      INSERT INTO organizations (id, company_name, business_type, status, created_at, updated_at)
      VALUES (${orgId}, ${`org-${orgId.slice(0, 6)}`}, ${BusinessType.RENTAL}::"BusinessType", 'ACTIVE'::"OrganizationStatus", NOW(), NOW())
    `;
    await prisma.$executeRaw`
      INSERT INTO organization_memberships (id, user_id, organization_id, role, status, created_at, updated_at, membership_version)
      VALUES (${membershipId}, ${id}, ${orgId}, 'WORKER'::"MembershipRole", 'ACTIVE'::"MembershipStatus", NOW(), NOW(), 0)
    `;
    return { id, email, orgId, membershipId };
  }

  async function seedUserWithPassword(password: string) {
    const id = randomUUID();
    const email = `gate1-${id}@example.test`;
    const hash = await bcrypt.hash(password, 10);
    const orgId = randomUUID();
    const membershipId = randomUUID();
    await prisma.$executeRaw`
      INSERT INTO users (
        id, email, platform_role, status, created_at, updated_at,
        session_version, security_version, password_hash, must_change_password
      )
      VALUES (
        ${id}, ${email}, ${UserPlatformRole.USER}::"UserPlatformRole", ${UserStatus.ACTIVE}::"UserStatus",
        NOW(), NOW(), 0, 0, ${hash}, false
      )
    `;
    await prisma.$executeRaw`
      INSERT INTO organizations (id, company_name, business_type, status, created_at, updated_at)
      VALUES (${orgId}, ${`org-${orgId.slice(0, 6)}`}, ${BusinessType.RENTAL}::"BusinessType", 'ACTIVE'::"OrganizationStatus", NOW(), NOW())
    `;
    await prisma.$executeRaw`
      INSERT INTO organization_memberships (id, user_id, organization_id, role, status, created_at, updated_at, membership_version)
      VALUES (${membershipId}, ${id}, ${orgId}, 'WORKER'::"MembershipRole", 'ACTIVE'::"MembershipStatus", NOW(), NOW(), 0)
    `;
    return { id, email, orgId, membershipId, password };
  }

  it('GATE1 authoritative invalidation effective before deferred processIntents', async () => {
    const user = await seedUserBasic();
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

  it('GATE1 AccountService.changePassword when password_hash exists', async () => {
    if (!(await hasUsersColumn('password_hash'))) {
      return;
    }
    const user = await seedUserWithPassword('oldpassword1');
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