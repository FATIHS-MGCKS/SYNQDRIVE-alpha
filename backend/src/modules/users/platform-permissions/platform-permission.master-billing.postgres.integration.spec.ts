/**
 * P3B0 — canonical master-billing grant + JWT contract on disposable Postgres.
 * Opt-in: P3B0_PLATFORM_PERMISSION_PG=1 and DATABASE_URL.
 */
import { PrismaClient, UserPlatformRole } from '@prisma/client';
import * as jwt from 'jsonwebtoken';
import { PlatformPermissionService } from './platform-permission.service';
import { RefreshTokenService } from '@modules/auth/refresh-token.service';
import { ConfigService } from '@nestjs/config';
import { MasterBillingGuard } from '@shared/auth/master-billing.guard';
import { Reflector } from '@nestjs/core';
import { PLATFORM_PERMISSION_JWT_VALUES } from './platform-permission.constants';
import { assertP3b0DisposablePostgresPreflight } from './testing/p3b0-disposable-postgres-preflight';

const runPg = process.env.P3B0_PLATFORM_PERMISSION_PG === '1';

const describePg = runPg ? describe : describe.skip;

describePg('PlatformPermissionService (disposable Postgres)', () => {
  let prisma: PrismaClient;
  let platformPermissions: PlatformPermissionService;
  let refreshTokens: RefreshTokenService;
  const jwtSecret = process.env.JWT_SECRET ?? 'p3b0-test-jwt-secret';

  beforeAll(() => {
    assertP3b0DisposablePostgresPreflight();
    if (!process.env.JWT_SECRET) {
      process.env.JWT_SECRET = jwtSecret;
    }
    prisma = new PrismaClient();
    platformPermissions = new PlatformPermissionService(prisma as never);
    const config = {
      get: (key: string, fallback?: unknown) => {
        if (key === 'app.jwtSecret') return jwtSecret;
        if (key === 'app.jwtExpiresIn') return '15m';
        if (key === 'iam.enableOrgBoundRefreshSessions') return true;
        if (key === 'iam.enableLegacyUnscopedRefreshGrace') return false;
        return fallback;
      },
    };
    refreshTokens = new RefreshTokenService(
      prisma as never,
      config as unknown as ConfigService,
      { recordAndExecute: jest.fn().mockResolvedValue({ revokedTokenCount: 0 }) } as never,
      platformPermissions,
    );
  });

  afterAll(async () => {
    await prisma?.$disconnect();
  });

  it('grant → JWT claim → revoke immediate denial', async () => {
    const suffix = Date.now();
    const masterId = `p3b0-master-${suffix}`;
    const delegateId = `p3b0-delegate-${suffix}`;
    await prisma.$executeRaw`
      INSERT INTO users (id, email, name, status, platform_role, created_at, updated_at)
      VALUES (
        ${masterId}, ${`p3b0-master-${suffix}@test.example`}, 'Master',
        'ACTIVE'::"UserStatus", ${UserPlatformRole.MASTER_ADMIN}::"UserPlatformRole", NOW(), NOW()
      )
    `;
    await prisma.$executeRaw`
      INSERT INTO users (id, email, name, status, platform_role, created_at, updated_at)
      VALUES (
        ${delegateId}, ${`p3b0-delegate-${suffix}@test.example`}, 'Delegate',
        'ACTIVE'::"UserStatus", ${UserPlatformRole.USER}::"UserPlatformRole", NOW(), NOW()
      )
    `;
    const master = { id: masterId };
    const delegate = {
      id: delegateId,
      email: `p3b0-delegate-${suffix}@test.example`,
      name: 'Delegate',
      platformRole: UserPlatformRole.USER,
    };

    await platformPermissions.grantMasterBilling(delegate.id, master.id);

    const { accessToken } = await refreshTokens.issueTokenPair(
      {
        id: delegate.id,
        email: delegate.email,
        name: delegate.name,
        platformRole: delegate.platformRole,
        sessionVersion: 0,
      },
      null,
    );

    const decoded = jwt.verify(accessToken, jwtSecret) as jwt.JwtPayload;
    expect(decoded.platformPermissions).toEqual([PLATFORM_PERMISSION_JWT_VALUES.MASTER_BILLING]);

    const reflector = { getAllAndOverride: jest.fn().mockReturnValue(true) } as unknown as Reflector;
    const guard = new MasterBillingGuard(reflector, platformPermissions);

    await expect(
      guard.canActivate({
        switchToHttp: () => ({
          getRequest: () => ({
            user: {
              id: delegate.id,
              platformRole: 'USER',
              platformPermissions: decoded.platformPermissions,
            },
          }),
        }),
        getHandler: () => ({}),
        getClass: () => ({}),
      } as never),
    ).resolves.toBe(true);

    await platformPermissions.revokeMasterBilling(delegate.id, master.id);

    await expect(
      guard.canActivate({
        switchToHttp: () => ({
          getRequest: () => ({
            user: {
              id: delegate.id,
              platformRole: 'USER',
              platformPermissions: decoded.platformPermissions,
            },
          }),
        }),
        getHandler: () => ({}),
        getClass: () => ({}),
      } as never),
    ).rejects.toThrow();

    const refreshed = await refreshTokens.issueTokenPair(
      {
        id: delegate.id,
        email: delegate.email,
        name: delegate.name,
        platformRole: delegate.platformRole,
        sessionVersion: 0,
      },
      null,
    );
    const refreshedDecoded = jwt.verify(refreshed.accessToken, jwtSecret) as jwt.JwtPayload;
    expect(refreshedDecoded.platformPermissions).toEqual([]);

    await prisma.userPlatformPermissionGrant.deleteMany({ where: { userId: delegate.id } });
    await prisma.user.deleteMany({ where: { id: { in: [masterId, delegateId] } } });
  });
});