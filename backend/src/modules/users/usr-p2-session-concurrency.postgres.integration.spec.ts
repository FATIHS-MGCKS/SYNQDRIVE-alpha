/**
 * USR-P2 session write fencing concurrency proofs (PostgreSQL).
 * USR_P2_SESSION_CONCURRENCY_PG=1 DATABASE_URL=postgresql://127.0.0.1:5432/<disposable> \
 *   npx jest usr-p2-session-concurrency.postgres.integration.spec --runInBand
 */
import { randomUUID } from 'node:crypto';
import { PrismaClient, UserPlatformRole, UserStatus } from '@prisma/client';
import { ConfigService } from '@nestjs/config';
import { RefreshTokenService } from '@modules/auth/refresh-token.service';
import { IamSessionPolicyService } from '@modules/auth/iam-session-policy.service';
import { PlatformPermissionService } from '@modules/users/platform-permissions/platform-permission.service';
import { UserAccessAuthorityService } from '@shared/auth/user-access-authority.service';
import { IAM_USER_SESSION_WRITE_LOCK_CLASS } from '@modules/auth/refresh-token-session-concurrency';

const OPT_IN = 'USR_P2_SESSION_CONCURRENCY_PG';
const JWT_SECRET = 'usr-p2-concurrency-test-secret';
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

(run ? describe : describe.skip)('USR-P2 session concurrency (PostgreSQL)', () => {
  jest.setTimeout(300_000);
  let prismaA: PrismaClient;
  let prismaB: PrismaClient;
  let refreshA: RefreshTokenService;
  let refreshB: RefreshTokenService;
  let authority: UserAccessAuthorityService;

  beforeAll(() => {
    assertDisposableDb();
    process.env.JWT_SECRET = JWT_SECRET;
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
    prismaA = new PrismaClient();
    prismaB = new PrismaClient();
    const platformA = new PlatformPermissionService(prismaA as never);
    const platformB = new PlatformPermissionService(prismaB as never);
    refreshA = new RefreshTokenService(prismaA as never, config, sessionPolicy, platformA);
    refreshB = new RefreshTokenService(prismaB as never, config, sessionPolicy, platformB);
    authority = new UserAccessAuthorityService(prismaA as never, platformA);
  });

  afterAll(async () => {
    await prismaA?.$disconnect();
    await prismaB?.$disconnect();
  });

  async function seedPlatformUser() {
    const userId = randomUUID();
    const email = `race-${userId}@example.test`;
    await prismaA.user.create({
      data: {
        id: userId,
        email,
        platformRole: UserPlatformRole.MASTER_ADMIN,
        status: UserStatus.ACTIVE,
        sessionVersion: 0,
        securityVersion: 0,
      },
    });
    return { userId, email };
  }

  it('RACE01 rotation then concurrent revoke-all invalidates successor', async () => {
    const { userId, email } = await seedPlatformUser();
    const issued = await refreshA.issueTokenPair(
      {
        id: userId,
        email,
        name: null,
        platformRole: UserPlatformRole.MASTER_ADMIN,
        sessionVersion: 0,
        securityVersion: 0,
      },
      null,
    );
    const rotated = await refreshA.rotate(issued.refreshToken, {});

    const revokePromise = refreshB.revokeAllActiveForUser(userId);
    const rotatePromise = refreshB.rotate(rotated.refreshToken, {});
    const [revokeCount] = await Promise.all([
      revokePromise,
      rotatePromise.catch(() => null),
    ]);

    const activeHead = await prismaA.refreshToken.count({
      where: { userId, revokedAt: null, replacedBy: null, expiresAt: { gt: new Date() } },
    });
    expect(revokeCount).toBeGreaterThan(0);
    expect(activeHead).toBe(0);

    const decoded = JSON.parse(
      Buffer.from(rotated.accessToken.split('.')[1], 'base64').toString(),
    );
    await expect(
      authority.validateAccessJwt({
        sub: userId,
        ...decoded,
        tokenFamily: decoded.tokenFamily,
      }),
    ).rejects.toThrow(/SESSION_REVOKED|no longer valid|Invalid/i);
  });

  it('advisory lock class is stable', () => {
    expect(IAM_USER_SESSION_WRITE_LOCK_CLASS).toBe(913_104);
  });
});