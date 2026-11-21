/**
 * P3B0 — canonical master-billing grant + JWT contract on disposable Postgres.
 * Opt-in: P3B0_PLATFORM_PERMISSION_PG=1 and DATABASE_URL.
 */
import { ActivityEntity, PrismaClient, UserPlatformRole } from '@prisma/client';
import {
  MasterAdminAuditAction,
  type MasterAdminAuditRecordInput,
} from '@modules/activity-log/master-admin-audit.contract';
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
  });

  it('concurrent grants yield one active row', async () => {
    const suffix = Date.now();
    const masterId = `p3b0-race-master-${suffix}`;
    const delegateId = `p3b0-race-delegate-${suffix}`;
    await prisma.$executeRaw`
      INSERT INTO users (id, email, name, status, platform_role, created_at, updated_at)
      VALUES (
        ${masterId}, ${`race-master-${suffix}@test.example`}, 'Master',
        'ACTIVE'::"UserStatus", ${UserPlatformRole.MASTER_ADMIN}::"UserPlatformRole", NOW(), NOW()
      )
    `;
    await prisma.$executeRaw`
      INSERT INTO users (id, email, name, status, platform_role, created_at, updated_at)
      VALUES (
        ${delegateId}, ${`race-delegate-${suffix}@test.example`}, 'Delegate',
        'ACTIVE'::"UserStatus", ${UserPlatformRole.USER}::"UserPlatformRole", NOW(), NOW()
      )
    `;

    const results = await Promise.all([
      platformPermissions.grantMasterBilling(delegateId, masterId),
      platformPermissions.grantMasterBilling(delegateId, masterId),
    ]);
    expect(results.every((r) => r.granted)).toBe(true);

    const activeCount = await prisma.userPlatformPermissionGrant.count({
      where: { userId: delegateId, revokedAt: null },
    });
    expect(activeCount).toBe(1);

    await prisma.userPlatformPermissionGrant.deleteMany({ where: { userId: delegateId } });
  });

  it('denies delegated billing when target user is deactivated', async () => {
    const suffix = Date.now();
    const masterId = `p3b0-inactive-master-${suffix}`;
    const delegateId = `p3b0-inactive-delegate-${suffix}`;
    await prisma.$executeRaw`
      INSERT INTO users (id, email, name, status, platform_role, created_at, updated_at)
      VALUES (
        ${masterId}, ${`inactive-master-${suffix}@test.example`}, 'Master',
        'ACTIVE'::"UserStatus", ${UserPlatformRole.MASTER_ADMIN}::"UserPlatformRole", NOW(), NOW()
      )
    `;
    await prisma.$executeRaw`
      INSERT INTO users (id, email, name, status, platform_role, created_at, updated_at)
      VALUES (
        ${delegateId}, ${`inactive-delegate-${suffix}@test.example`}, 'Delegate',
        'ACTIVE'::"UserStatus", ${UserPlatformRole.USER}::"UserPlatformRole", NOW(), NOW()
      )
    `;

    await platformPermissions.grantMasterBilling(delegateId, masterId);
    await prisma.$executeRaw`
      UPDATE users SET status = 'INACTIVE'::"UserStatus", updated_at = NOW() WHERE id = ${delegateId}
    `;

    await expect(platformPermissions.hasActiveMasterBillingGrant(delegateId)).resolves.toBe(false);

    await prisma.userPlatformPermissionGrant.deleteMany({ where: { userId: delegateId } });
  });

  it('mandatory audit: grant persists activityLog with mutation', async () => {
    const suffix = Date.now();
    const masterId = `p3b0-audit-master-${suffix}`;
    const delegateId = `p3b0-audit-delegate-${suffix}`;
    await prisma.$executeRaw`
      INSERT INTO users (id, email, name, status, platform_role, created_at, updated_at)
      VALUES (
        ${masterId}, ${`audit-master-${suffix}@test.example`}, 'Master',
        'ACTIVE'::"UserStatus", ${UserPlatformRole.MASTER_ADMIN}::"UserPlatformRole", NOW(), NOW()
      )
    `;
    await prisma.$executeRaw`
      INSERT INTO users (id, email, name, status, platform_role, created_at, updated_at)
      VALUES (
        ${delegateId}, ${`audit-delegate-${suffix}@test.example`}, 'Delegate',
        'ACTIVE'::"UserStatus", ${UserPlatformRole.USER}::"UserPlatformRole", NOW(), NOW()
      )
    `;

    const buildAudit = (): MasterAdminAuditRecordInput => ({
      auditAction: MasterAdminAuditAction.PLATFORM_USER_UPDATED,
      actorUserId: masterId,
      actorPlatformRole: 'MASTER_ADMIN',
      entityId: delegateId,
      description: 'grant test',
      correlationId: `corr-${suffix}`,
      metadata: {
        domain: 'platform_permission',
        operation: 'GRANT_MASTER_BILLING',
        targetUserId: delegateId,
      },
    });

    await platformPermissions.grantMasterBillingWithMandatoryAudit(
      delegateId,
      masterId,
      (result) => ({
        ...buildAudit(),
        metadata: {
          domain: 'platform_permission',
          operation: 'GRANT_MASTER_BILLING',
          targetUserId: delegateId,
          grantId: result.grantId,
          idempotent: result.idempotent,
        },
      }),
    );

    const auditRow = await prisma.activityLog.findFirst({
      where: {
        userId: masterId,
        entity: ActivityEntity.ADMIN_OPERATION,
        entityId: delegateId,
      },
      orderBy: { createdAt: 'desc' },
    });
    expect(auditRow).not.toBeNull();

    await prisma.userPlatformPermissionGrant.deleteMany({ where: { userId: delegateId } });
  });

  const buildGrantAudit = (
    masterId: string,
    delegateId: string,
    suffix: number | string,
  ): ((result: { grantId: string | null; idempotent: boolean }) => MasterAdminAuditRecordInput) => (
    result,
  ) => ({
    auditAction: MasterAdminAuditAction.PLATFORM_USER_UPDATED,
    actorUserId: masterId,
    actorPlatformRole: 'MASTER_ADMIN',
    entityId: delegateId,
    description: 'pg grant test',
    correlationId: `corr-${suffix}`,
    metadata: {
      domain: 'platform_permission',
      operation: 'GRANT_MASTER_BILLING',
      targetUserId: delegateId,
      grantId: result.grantId,
      idempotent: result.idempotent,
    },
  });

  async function seedMasterDelegatePair(suffix: number) {
    const masterId = `p3b0-pg-master-${suffix}`;
    const delegateId = `p3b0-pg-delegate-${suffix}`;
    await prisma.$executeRaw`
      INSERT INTO users (id, email, name, status, platform_role, created_at, updated_at)
      VALUES (
        ${masterId}, ${`pg-master-${suffix}@test.example`}, 'Master',
        'ACTIVE'::"UserStatus", ${UserPlatformRole.MASTER_ADMIN}::"UserPlatformRole", NOW(), NOW()
      )
    `;
    await prisma.$executeRaw`
      INSERT INTO users (id, email, name, status, platform_role, created_at, updated_at)
      VALUES (
        ${delegateId}, ${`pg-delegate-${suffix}@test.example`}, 'Delegate',
        'ACTIVE'::"UserStatus", ${UserPlatformRole.USER}::"UserPlatformRole", NOW(), NOW()
      )
    `;
    return { masterId, delegateId };
  }

  async function cleanupPair(_masterId: string, delegateId: string) {
    await prisma.userPlatformPermissionGrant.deleteMany({ where: { userId: delegateId } });
  }

  it('audit failure rolls back grant (no partial commit)', async () => {
    const suffix = Date.now();
    const { masterId, delegateId } = await seedMasterDelegatePair(suffix);
    const phantomActor = '00000000-0000-0000-0000-000000009901';

    await expect(
      platformPermissions.grantMasterBillingWithMandatoryAudit(
        delegateId,
        masterId,
        () => ({
          auditAction: MasterAdminAuditAction.PLATFORM_USER_UPDATED,
          actorUserId: phantomActor,
          actorPlatformRole: 'MASTER_ADMIN',
          entityId: delegateId,
          description: 'should fail audit',
          correlationId: `corr-fail-grant-${suffix}`,
          metadata: { domain: 'platform_permission', operation: 'GRANT_MASTER_BILLING' },
        }),
      ),
    ).rejects.toThrow();

    const activeGrants = await prisma.userPlatformPermissionGrant.count({
      where: { userId: delegateId, revokedAt: null },
    });
    expect(activeGrants).toBe(0);
    await cleanupPair(masterId, delegateId);
  });

  it('audit failure rolls back revoke (no partial commit)', async () => {
    const suffix = Date.now();
    const { masterId, delegateId } = await seedMasterDelegatePair(suffix);
    await platformPermissions.grantMasterBillingWithMandatoryAudit(
      delegateId,
      masterId,
      buildGrantAudit(masterId, delegateId, suffix),
    );
    const phantomActor = '00000000-0000-0000-0000-000000009902';

    await expect(
      platformPermissions.revokeMasterBillingWithMandatoryAudit(
        delegateId,
        masterId,
        () => ({
          auditAction: MasterAdminAuditAction.PLATFORM_USER_UPDATED,
          actorUserId: phantomActor,
          actorPlatformRole: 'MASTER_ADMIN',
          entityId: delegateId,
          description: 'should fail audit',
          correlationId: `corr-fail-revoke-${suffix}`,
          metadata: { domain: 'platform_permission', operation: 'REVOKE_MASTER_BILLING' },
        }),
      ),
    ).rejects.toThrow();

    const stillActive = await prisma.userPlatformPermissionGrant.count({
      where: { userId: delegateId, revokedAt: null },
    });
    expect(stillActive).toBe(1);
    await cleanupPair(masterId, delegateId);
  });

  it('concurrent mandatory grants: P2002-safe, one active grant, durable audits', async () => {
    const suffix = Date.now();
    const { masterId, delegateId } = await seedMasterDelegatePair(suffix);
    const buildAudit = buildGrantAudit(masterId, delegateId, `race-${suffix}`);

    const results = await Promise.all(
      Array.from({ length: 6 }, (_, i) =>
        platformPermissions.grantMasterBillingWithMandatoryAudit(
          delegateId,
          masterId,
          (result) => buildAudit(result),
        ),
      ),
    );

    expect(results.every((r) => r.granted)).toBe(true);
    expect(new Set(results.map((r) => r.grantId).filter(Boolean)).size).toBe(1);

    const activeCount = await prisma.userPlatformPermissionGrant.count({
      where: { userId: delegateId, revokedAt: null },
    });
    expect(activeCount).toBe(1);

    const auditCount = await prisma.activityLog.count({
      where: {
        entity: ActivityEntity.ADMIN_OPERATION,
        entityId: delegateId,
        userId: masterId,
      },
    });
    expect(auditCount).toBe(6);

    await cleanupPair(masterId, delegateId);
  });

  it('idempotent mandatory retry after conflict succeeds with coherent audit', async () => {
    const suffix = Date.now();
    const { masterId, delegateId } = await seedMasterDelegatePair(suffix);
    const buildAudit = buildGrantAudit(masterId, delegateId, `retry-${suffix}`);

    const first = await platformPermissions.grantMasterBillingWithMandatoryAudit(
      delegateId,
      masterId,
      buildAudit,
    );
    expect(first.idempotent).toBe(false);

    const second = await platformPermissions.grantMasterBillingWithMandatoryAudit(
      delegateId,
      masterId,
      buildAudit,
    );
    expect(second.idempotent).toBe(true);
    expect(second.grantId).toBe(first.grantId);

    const activeCount = await prisma.userPlatformPermissionGrant.count({
      where: { userId: delegateId, revokedAt: null },
    });
    expect(activeCount).toBe(1);

    await cleanupPair(masterId, delegateId);
  });
});