/**
 * USR-P2 session write fencing concurrency proofs (PostgreSQL).
 * USR_P2_SESSION_CONCURRENCY_PG=1 DATABASE_URL=postgresql://127.0.0.1:5432/<disposable> \
 *   npx jest usr-p2-session-concurrency.postgres.integration.spec --runInBand
 */
import { randomUUID } from 'node:crypto';
import { BusinessType, PrismaClient, UserPlatformRole, UserStatus } from '@prisma/client';
import { RefreshTokenService } from '@modules/auth/refresh-token.service';
import {
  IAM_ORG_SESSION_WRITE_LOCK_CLASS,
  IAM_USER_SESSION_WRITE_LOCK_CLASS,
} from '@modules/auth/refresh-token-session-concurrency';
import { UserAccessAuthorityService } from '@shared/auth/user-access-authority.service';
import * as jwt from 'jsonwebtoken';
import { createUsrP2PgIamStack } from '@modules/users/testing/usr-p2-pg-iam-stack.helper';

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
  let sessionPolicyA: ReturnType<typeof createUsrP2PgIamStack>['sessionPolicy'];
  let authorityA: UserAccessAuthorityService;

  beforeAll(() => {
    assertDisposableDb();
    process.env.JWT_SECRET = JWT_SECRET;
    prismaA = new PrismaClient();
    prismaB = new PrismaClient();
    const stackA = createUsrP2PgIamStack(prismaA, JWT_SECRET);
    const stackB = createUsrP2PgIamStack(prismaB, JWT_SECRET);
    refreshA = stackA.refresh;
    refreshB = stackB.refresh;
    sessionPolicyA = stackA.sessionPolicy;
    authorityA = stackA.authority;
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

  it('RACE01 concurrent revoke-all vs rotate denies post-revocation successor JWT', async () => {
    const { userId, email, membership } = await seedUserWithOrg();
    const issued = await issueBound(userId, email, membership);
  let successor: { accessToken: string; refreshToken: string } | undefined;
    await Promise.allSettled([
      refreshA.revokeAllActiveForUser(userId),
      refreshB.rotate(issued.refreshToken).then((r) => {
        successor = r;
        return r;
      }),
    ]);
    expect(await activeHeadCount(userId)).toBe(0);
    if (successor) {
      const decoded = jwt.verify(successor.accessToken, JWT_SECRET) as jwt.JwtPayload;
      await expect(authorityA.validateAccessJwt(decoded as never)).rejects.toThrow();
      await expect(refreshA.rotate(successor.refreshToken)).rejects.toThrow(/no longer valid/i);
    }
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
    const results = await Promise.allSettled([
      refreshA.revoke(issued.refreshToken, 'LOGOUT'),
      refreshB.rotate(issued.refreshToken),
    ]);
    const rotateRejected = results[1].status === 'rejected';
    expect(rotateRejected || (await activeHeadCount(userId)) === 0).toBe(true);
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
    expect(fulfilled.length).toBe(1);
    expect(await orphanSuccessorCount(userId)).toBe(0);
    const heads = await activeHeadCount(userId);
    expect(heads).toBeLessThanOrEqual(1);
    const winner = (
      fulfilled[0] as PromiseFulfilledResult<{ accessToken: string; refreshToken: string }>
    ).value;
    expect(winner.accessToken).toBeTruthy();
    if (heads === 1) {
      const chain = await refreshA.rotate(winner.refreshToken);
      expect(chain.accessToken).toBeTruthy();
    }
  });

  it('advisory lock classes are stable', () => {
    expect(IAM_USER_SESSION_WRITE_LOCK_CLASS).toBe(913_104);
    expect(IAM_ORG_SESSION_WRITE_LOCK_CLASS).toBe(913_105);
  });

  async function issueLegacyUnscoped(userId: string, email: string) {
    return refreshA.issueTokenPair(
      {
        id: userId,
        email,
        platformRole: UserPlatformRole.USER,
        sessionVersion: 0,
        securityVersion: 0,
      },
      null,
    );
  }

  it('RACE03 revoke-all with multiple families leaves zero active heads', async () => {
    const { userId, email, membership } = await seedUserWithOrg();
    const familyA = await issueBound(userId, email, membership);
    const familyB = await issueLegacyUnscoped(userId, email);
    await Promise.allSettled([
      sessionPolicyA.recordAndExecute({ eventType: 'PASSWORD_CHANGED', userId }),
      refreshB.rotate(familyA.refreshToken),
    ]);
    expect(await activeHeadCount(userId)).toBe(0);
    await expect(refreshB.rotate(familyB.refreshToken)).rejects.toThrow(/no longer valid/i);
  });

  it('RACE05 membership removal invalidates org-bound refresh', async () => {
    const { userId, email, membership } = await seedUserWithOrg();
    const issued = await issueBound(userId, email, membership);
    const decoded = jwt.verify(issued.accessToken, JWT_SECRET) as jwt.JwtPayload;
    await sessionPolicyA.recordAndExecute({
      eventType: 'MEMBERSHIP_REMOVED',
      userId,
      organizationId: membership.organizationId,
      membershipId: membership.membershipId,
    });
    await expect(refreshA.rotate(issued.refreshToken)).rejects.toThrow(/no longer valid/i);
    await expect(authorityA.validateAccessJwt(decoded as never)).rejects.toThrow();
  });

  it('RACE07 reuse detection invalidates entire family under IAM policy', async () => {
    const { userId, email, membership } = await seedUserWithOrg();
    const issued = await issueBound(userId, email, membership);
    const rotated = await refreshA.rotate(issued.refreshToken);
    await expect(refreshB.rotate(issued.refreshToken)).rejects.toThrow(/no longer valid/i);
    expect(await activeHeadCount(userId)).toBe(0);
    await expect(refreshA.rotate(rotated.refreshToken)).rejects.toThrow(/no longer valid/i);
  });

  it('RACE09 unrelated family remains active when one family is revoked', async () => {
    const { userId, email, membership } = await seedUserWithOrg();
    const keep = await issueBound(userId, email, membership);
    const revoke = await issueLegacyUnscoped(userId, email);
    const keepDecoded = jwt.verify(keep.accessToken, JWT_SECRET) as jwt.JwtPayload;
    const fam = keepDecoded.tokenFamily as string;
    await refreshA.revoke(revoke.refreshToken, 'LOGOUT');
    expect(await activeHeadCount(userId)).toBe(1);
    await authorityA.validateAccessJwt(keepDecoded as never);
    const rows = await prismaA.refreshToken.findMany({
      where: { userId, family: fam, revokedAt: null },
    });
    expect(rows.length).toBeGreaterThanOrEqual(1);
  });

  it('RACE10 multi-organization sessions preserve unrelated org', async () => {
    const userId = randomUUID();
    const email = `race10-${userId}@example.test`;
    await prismaA.$executeRaw`
      INSERT INTO users (id, email, platform_role, status, created_at, updated_at, session_version, security_version)
      VALUES (${userId}, ${email}, ${UserPlatformRole.USER}::"UserPlatformRole", ${UserStatus.ACTIVE}::"UserStatus", NOW(), NOW(), 0, 0)
    `;
    const orgA = randomUUID();
    const orgB = randomUUID();
    const memA = randomUUID();
    const memB = randomUUID();
    for (const [orgId, memId] of [
      [orgA, memA],
      [orgB, memB],
    ] as const) {
      await prismaA.$executeRaw`
        INSERT INTO organizations (id, company_name, business_type, status, created_at, updated_at)
        VALUES (${orgId}, ${`org-${orgId.slice(0, 6)}`}, ${BusinessType.RENTAL}::"BusinessType", 'ACTIVE'::"OrganizationStatus", NOW(), NOW())
      `;
      await prismaA.$executeRaw`
        INSERT INTO organization_memberships (id, user_id, organization_id, role, status, created_at, updated_at, membership_version)
        VALUES (${memId}, ${userId}, ${orgId}, 'WORKER'::"MembershipRole", 'ACTIVE'::"MembershipStatus", NOW(), NOW(), 0)
      `;
    }
    const sessionA = await issueBound(userId, email, {
      organizationId: orgA,
      membershipId: memA,
      role: 'WORKER',
      membershipVersion: 0,
    });
    const sessionB = await issueBound(userId, email, {
      organizationId: orgB,
      membershipId: memB,
      role: 'WORKER',
      membershipVersion: 0,
    });
    await sessionPolicyA.recordAndExecute({
      eventType: 'MEMBERSHIP_REMOVED',
      userId,
      organizationId: orgA,
      membershipId: memA,
    });
    await expect(refreshA.rotate(sessionA.refreshToken)).rejects.toThrow(/no longer valid/i);
    const rotatedB = await refreshB.rotate(sessionB.refreshToken);
    expect(rotatedB.accessToken).toBeTruthy();
  });

  it('RACE08 password-change policy concurrent with refresh invalidates tokens', async () => {
    const { userId, email, membership } = await seedUserWithOrg();
    const issued = await issueBound(userId, email, membership);
    const decoded = jwt.verify(issued.accessToken, JWT_SECRET) as jwt.JwtPayload;
    await Promise.allSettled([
      sessionPolicyA.recordAndExecute({ eventType: 'PASSWORD_CHANGED', userId }),
      refreshB.rotate(issued.refreshToken),
    ]);
    await expect(authorityA.validateAccessJwt(decoded as never)).rejects.toThrow();
    await expect(refreshA.rotate(issued.refreshToken)).rejects.toThrow(/no longer valid/i);
  });

  it('ORG_OFFBOARDING_RACE organization-wide revoke vs concurrent refresh', async () => {
    const { userId, email, membership } = await seedUserWithOrg();
    const issued = await issueBound(userId, email, membership);
    let rotated: { accessToken: string; refreshToken: string } | undefined;
    await Promise.allSettled([
      refreshA.revokeAllActiveForOrganization(membership.organizationId),
      refreshB.rotate(issued.refreshToken).then((r) => {
        rotated = r;
        return r;
      }),
    ]);
    expect(await activeHeadCount(userId)).toBe(0);
    if (rotated) {
      const decoded = jwt.verify(rotated.accessToken, JWT_SECRET) as jwt.JwtPayload;
      await expect(authorityA.validateAccessJwt(decoded as never)).rejects.toThrow();
    }
  });

  it('RACE02 deterministic barrier: revoke-all before rotate', async () => {
    const raceId = `race02-${randomUUID()}`;
    await prismaA.$executeRaw`
      CREATE TABLE IF NOT EXISTS usr_p2_race_barrier (
        race_id text PRIMARY KEY,
        phase int NOT NULL DEFAULT 0
      )
    `;
    const { userId, email, membership } = await seedUserWithOrg();
    const issued = await issueBound(userId, email, membership);
    const barrierA = (async () => {
      await prismaA.$executeRaw`
        INSERT INTO usr_p2_race_barrier (race_id, phase) VALUES (${raceId}, 1)
        ON CONFLICT (race_id) DO UPDATE SET phase = 1
      `;
      let waited = 0;
      while (waited < 120) {
        const rows = await prismaA.$queryRaw<Array<{ phase: number }>>`
          SELECT phase FROM usr_p2_race_barrier WHERE race_id = ${raceId}
        `;
        if (rows[0]?.phase >= 2) break;
        await new Promise((r) => setTimeout(r, 25));
        waited += 1;
      }
      await refreshA.revokeAllActiveForUser(userId);
      await prismaA.$executeRaw`
        UPDATE usr_p2_race_barrier SET phase = 3 WHERE race_id = ${raceId}
      `;
    })();
    const barrierB = (async () => {
      let waited = 0;
      while (waited < 120) {
        const rows = await prismaB.$queryRaw<Array<{ phase: number }>>`
          SELECT phase FROM usr_p2_race_barrier WHERE race_id = ${raceId}
        `;
        if (rows[0]?.phase === 1) break;
        await new Promise((r) => setTimeout(r, 25));
        waited += 1;
      }
      await prismaB.$executeRaw`
        UPDATE usr_p2_race_barrier SET phase = 2 WHERE race_id = ${raceId}
      `;
      let phase = 0;
      while (phase < 3 && waited < 240) {
        const rows = await prismaB.$queryRaw<Array<{ phase: number }>>`
          SELECT phase FROM usr_p2_race_barrier WHERE race_id = ${raceId}
        `;
        phase = rows[0]?.phase ?? 0;
        if (phase >= 3) break;
        await new Promise((r) => setTimeout(r, 25));
        waited += 1;
      }
      await expect(refreshB.rotate(issued.refreshToken)).rejects.toThrow(/no longer valid/i);
    })();
    await Promise.all([barrierA, barrierB]);
    expect(await activeHeadCount(userId)).toBe(0);
  });
});