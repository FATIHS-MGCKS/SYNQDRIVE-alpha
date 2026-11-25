/**
 * USR-P2 session write fencing concurrency proofs (PostgreSQL).
 * USR_P2_SESSION_CONCURRENCY_PG=1 DATABASE_URL=postgresql://127.0.0.1:5432/<disposable> \
 *   npx jest usr-p2-session-concurrency.postgres.integration.spec --runInBand
 */
import { randomUUID } from 'node:crypto';
import { BusinessType, PrismaClient, UserPlatformRole, UserStatus } from '@prisma/client';
import { ConfigService } from '@nestjs/config';
import { RefreshTokenService } from '@modules/auth/refresh-token.service';
import { IamSessionPolicyService } from '@modules/auth/iam-session-policy.service';
import { PlatformPermissionService } from '@modules/users/platform-permissions/platform-permission.service';
import {
  IAM_ORG_SESSION_WRITE_LOCK_CLASS,
  IAM_USER_SESSION_WRITE_LOCK_CLASS,
} from '@modules/auth/refresh-token-session-concurrency';

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
    const sessionPolicy = {
      recordAndExecute: jest.fn().mockResolvedValue({ revokedTokenCount: 0 }),
    } as unknown as IamSessionPolicyService;
    prismaA = new PrismaClient();
    prismaB = new PrismaClient();
    const platformA = new PlatformPermissionService(prismaA as never);
    const platformB = new PlatformPermissionService(prismaB as never);
    refreshA = new RefreshTokenService(prismaA as never, config, sessionPolicy, platformA);
    refreshB = new RefreshTokenService(prismaB as never, config, sessionPolicy, platformB);
  });

  afterAll(async () => {
    await prismaA?.$disconnect();
    await prismaB?.$disconnect();
  });

  async function seedUserWithOrg() {
    const userId = randomUUID();
    const email = `race-${userId}@example.test`;
    const orgId = randomUUID();
    const membershipId = randomUUID();
    await prismaA.$executeRaw`
      INSERT INTO users (id, email, platform_role, status, created_at, updated_at, session_version, security_version)
      VALUES (${userId}, ${email}, ${UserPlatformRole.USER}::"UserPlatformRole", ${UserStatus.ACTIVE}::"UserStatus", NOW(), NOW(), 0, 0)
    `;
    await prismaA.$executeRaw`
      INSERT INTO organizations (id, company_name, business_type, status, created_at, updated_at)
      VALUES (${orgId}, ${`org-${orgId.slice(0, 6)}`}, ${BusinessType.RENTAL}::"BusinessType", 'ACTIVE'::"OrganizationStatus", NOW(), NOW())
    `;
    await prismaA.$executeRaw`
      INSERT INTO organization_memberships (id, user_id, organization_id, role, status, created_at, updated_at, membership_version)
      VALUES (${membershipId}, ${userId}, ${orgId}, 'WORKER'::"MembershipRole", 'ACTIVE'::"MembershipStatus", NOW(), NOW(), 0)
    `;
    const membership = {
      organizationId: orgId,
      membershipId,
      role: 'WORKER',
      membershipVersion: 0,
    };
    return { userId, email, membership };
  }

  async function issueBound(
    userId: string,
    email: string,
    membership: { organizationId: string; membershipId: string; role: string; membershipVersion: number },
  ) {
    return refreshA.issueTokenPair(
      {
        id: userId,
        email,
        platformRole: UserPlatformRole.USER,
        sessionVersion: 0,
        securityVersion: 0,
      },
      membership,
    );
  }

  async function activeHeadCount(userId: string) {
    return prismaA.refreshToken.count({
      where: {
        userId,
        revokedAt: null,
        replacedBy: null,
        expiresAt: { gt: new Date() },
      },
    });
  }

  async function orphanSuccessorCount(userId: string) {
    return prismaA.$queryRaw<Array<{ count: bigint }>>`
      SELECT COUNT(*)::bigint AS count
      FROM refresh_tokens successor
      WHERE successor.user_id = ${userId}
        AND successor.revoked_at IS NULL
        AND successor.replaced_by IS NULL
        AND NOT EXISTS (
          SELECT 1 FROM refresh_tokens predecessor
          WHERE predecessor.replaced_by = successor.id
        )
        AND successor.created_at > NOW() - INTERVAL '5 minutes'
    `.then((rows) => Number(rows[0]?.count ?? 0n));
  }

  it('RACE01 concurrent revoke-all vs rotate leaves no active head', async () => {
    const { userId, email, membership } = await seedUserWithOrg();
    const issued = await issueBound(userId, email, membership);
    await Promise.all([
      refreshA.revokeAllActiveForUser(userId),
      refreshB.rotate(issued.refreshToken).catch(() => null),
    ]);
    expect(await activeHeadCount(userId)).toBe(0);
  });

  it('RACE02 revoke-all before rotate blocks successor issuance', async () => {
    const { userId, email, membership } = await seedUserWithOrg();
    const issued = await issueBound(userId, email, membership);
    await refreshA.revokeAllActiveForUser(userId);
    await expect(refreshB.rotate(issued.refreshToken)).rejects.toThrow(/no longer valid/i);
    expect(await activeHeadCount(userId)).toBe(0);
  });

  it('RACE04 logout (family revoke) vs concurrent refresh', async () => {
    const { userId, email, membership } = await seedUserWithOrg();
    const issued = await issueBound(userId, email, membership);
    await Promise.all([
      refreshA.revoke(issued.refreshToken, 'LOGOUT'),
      refreshB.rotate(issued.refreshToken).catch(() => null),
    ]);
    expect(await activeHeadCount(userId)).toBe(0);
  });

  it('RACE06 concurrent rotate of same token does not orphan successors', async () => {
    const { userId, email, membership } = await seedUserWithOrg();
    const issued = await issueBound(userId, email, membership);
    const results = await Promise.allSettled([
      refreshA.rotate(issued.refreshToken),
      refreshB.rotate(issued.refreshToken),
    ]);
    const fulfilled = results.filter((r) => r.status === 'fulfilled');
    expect(fulfilled.length).toBeLessThanOrEqual(1);
    expect(await activeHeadCount(userId)).toBeLessThanOrEqual(1);
    expect(await orphanSuccessorCount(userId)).toBeLessThanOrEqual(1);
  });

  it('advisory lock classes are stable', () => {
    expect(IAM_USER_SESSION_WRITE_LOCK_CLASS).toBe(913_104);
    expect(IAM_ORG_SESSION_WRITE_LOCK_CLASS).toBe(913_105);
  });
});