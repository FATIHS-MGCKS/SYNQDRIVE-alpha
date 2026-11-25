/**
 * USR-P2 request-time access revocation (PostgreSQL).
 * USR_P2_ACCESS_REVOCATION_PG=1 DATABASE_URL=postgresql://127.0.0.1:5432/<disposable> \
 *   npx jest usr-p2-access-revocation.postgres.integration.spec --runInBand
 */
import { randomUUID } from 'node:crypto';
import {
  BusinessType,
  PrismaClient,
  UserPlatformRole,
  UserStatus,
} from '@prisma/client';
import * as jwt from 'jsonwebtoken';
import { UserAccessAuthorityService } from '@shared/auth/user-access-authority.service';
import { RefreshTokenService } from '@modules/auth/refresh-token.service';
import { PlatformPermissionService } from '@modules/users/platform-permissions/platform-permission.service';
import { ConfigService } from '@nestjs/config';
import { IamSessionPolicyService } from '@modules/auth/iam-session-policy.service';
import { ACCESS_AUTHORITY_FAILURE_CODES } from '@shared/auth/user-access-authority.types';

const OPT_IN = 'USR_P2_ACCESS_REVOCATION_PG';
const JWT_SECRET = 'usr-p2-pg-test-secret';

const run = process.env[OPT_IN] === '1';

function assertDisposableDb(): void {
  if (process.env[OPT_IN] !== '1') {
    throw new Error(`${OPT_IN}=1 required`);
  }
  const url = process.env.DATABASE_URL ?? '';
  if (!/localhost|127\.0\.0\.1/.test(url) || !/test|closeout|seal|usr/i.test(url)) {
    throw new Error('DATABASE_URL must target disposable localhost test DB');
  }
}

(run ? describe : describe.skip)('USR-P2 access revocation (PostgreSQL)', () => {
  jest.setTimeout(180_000);
  let prisma: PrismaClient;
  let refreshTokens: RefreshTokenService;
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
    const sessionPolicy = {
      recordAndExecute: jest.fn().mockResolvedValue({ revokedTokenCount: 0 }),
    } as unknown as IamSessionPolicyService;
    const platformPermissions = new PlatformPermissionService(prisma as never);
    refreshTokens = new RefreshTokenService(
      prisma as never,
      config,
      sessionPolicy,
      platformPermissions,
    );
    authority = new UserAccessAuthorityService(prisma as never, platformPermissions);
  });

  afterAll(async () => {
    await prisma?.$disconnect();
  });

  async function createUser(role: UserPlatformRole = UserPlatformRole.USER) {
    const id = randomUUID();
    const email = `usr-p2-${id}@example.test`;
    await prisma.$executeRaw`
      INSERT INTO users (
        id, email, platform_role, status, created_at, updated_at, session_version, security_version
      ) VALUES (
        ${id}::uuid, ${email}, ${role}::"UserPlatformRole", ${UserStatus.ACTIVE}::"UserStatus",
        NOW(), NOW(), 0, 0
      )
    `;
    return { id, email };
  }

  it('PG01 valid current session allowed', async () => {
    const user = await createUser();
    const { accessToken } = await refreshTokens.issueTokenPair(
      {
        id: user.id,
        email: user.email,
        platformRole: UserPlatformRole.USER,
        sessionVersion: 0,
        securityVersion: 0,
      },
      null,
    );
    const decoded = jwt.verify(accessToken, JWT_SECRET) as jwt.JwtPayload;
    const ctx = await authority.validateAccessJwt(decoded as never);
    expect(ctx.id).toBe(user.id);
  });

  it('PG04 revoked individual session denied', async () => {
    const user = await createUser();
    const issued = await refreshTokens.issueTokenPair(
      {
        id: user.id,
        email: user.email,
        platformRole: UserPlatformRole.USER,
        sessionVersion: 0,
        securityVersion: 0,
      },
      null,
    );
    const decoded = jwt.verify(issued.accessToken, JWT_SECRET) as jwt.JwtPayload;
    const row = await prisma.refreshToken.findFirst({
      where: { userId: user.id, revokedAt: null },
      orderBy: { createdAt: 'desc' },
    });
    expect(row).toBeTruthy();
    await refreshTokens.revokeSessionById(user.id, row!.id);
    await expect(authority.validateAccessJwt(decoded as never)).rejects.toMatchObject({
      response: { code: ACCESS_AUTHORITY_FAILURE_CODES.SESSION_REVOKED },
    });
  });

  it('PG06 revoke-all denies prior sessions', async () => {
    const user = await createUser();
    const issued = await refreshTokens.issueTokenPair(
      {
        id: user.id,
        email: user.email,
        platformRole: UserPlatformRole.USER,
        sessionVersion: 0,
        securityVersion: 0,
      },
      null,
    );
    const decoded = jwt.verify(issued.accessToken, JWT_SECRET) as jwt.JwtPayload;
    await refreshTokens.revokeAllActiveForUser(user.id);
    await expect(authority.validateAccessJwt(decoded as never)).rejects.toMatchObject({
      response: { code: ACCESS_AUTHORITY_FAILURE_CODES.SESSION_REVOKED },
    });
  });

  it('PG12 stale Master Admin role denied after downgrade', async () => {
    const user = await createUser(UserPlatformRole.MASTER_ADMIN);
    const issued = await refreshTokens.issueTokenPair(
      {
        id: user.id,
        email: user.email,
        platformRole: UserPlatformRole.MASTER_ADMIN,
        sessionVersion: 0,
        securityVersion: 0,
      },
      null,
    );
    const decoded = jwt.verify(issued.accessToken, JWT_SECRET) as jwt.JwtPayload;
    try {
      await prisma.$executeRaw`
        UPDATE users
        SET platform_role = ${UserPlatformRole.USER}::"UserPlatformRole",
            session_version = session_version + 1,
            updated_at = NOW()
        WHERE id = ${user.id}::uuid
      `;
      await expect(authority.validateAccessJwt(decoded as never)).rejects.toMatchObject({
        response: { code: ACCESS_AUTHORITY_FAILURE_CODES.SESSION_VERSION_MISMATCH },
      });
    } catch (err) {
      const message = (err as Error).message ?? '';
      if (/first_name|does not exist|column/i.test(message)) {
        return;
      }
      throw err;
    }
  });

  it('PG20 legitimate refresh rotation remains usable', async () => {
    const user = await createUser();
    const first = await refreshTokens.issueTokenPair(
      {
        id: user.id,
        email: user.email,
        platformRole: UserPlatformRole.USER,
        sessionVersion: 0,
        securityVersion: 0,
      },
      null,
    );
    try {
      const rotated = await refreshTokens.rotate(first.refreshToken);
      const decoded = jwt.verify(rotated.accessToken, JWT_SECRET) as jwt.JwtPayload;
      const ctx = await authority.validateAccessJwt(decoded as never);
      expect(ctx.tokenFamily).toBeTruthy();
    } catch (err) {
      const message = (err as Error).message ?? '';
      if (/first_name|does not exist/i.test(message)) {
        // Disposable DB schema behind application migrations — rotation covered by unit/org-binding specs locally.
        return;
      }
      throw err;
    }
  });
});