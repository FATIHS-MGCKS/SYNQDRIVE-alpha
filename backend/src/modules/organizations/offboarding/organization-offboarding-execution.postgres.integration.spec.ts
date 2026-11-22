/**
 * Organization offboarding execution — disposable PostgreSQL evidence.
 *
 * ORGANIZATION_OFFBOARDING_EXECUTION_POSTGRES=1 \
 * ORGANIZATION_OFFBOARDING_EXECUTION_ENABLED=1 \
 * DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:5432/synqdrive_org_offboarding_p6d2 \
 * npm test -- --runInBand organization-offboarding-execution.postgres
 */
import { ConflictException } from '@nestjs/common';
import {
  FuelType,
  OrganizationOffboardingJobStatus,
  OrganizationStatus,
  UserPlatformRole,
  UserStatus,
  VehicleProviderConsentGrantType,
  VehicleRegistryLifecycle,
  VehicleStatus,
} from '@prisma/client';
import { randomUUID } from 'crypto';
import { PrismaClient } from '@prisma/client';
import { RefreshTokenService } from '@modules/auth/refresh-token.service';
import { MasterAdminAuditService } from '@modules/activity-log/master-admin-audit.service';
import { IamLegalHoldService } from '@modules/iam-data-retention/iam-legal-hold.service';
import { VehicleOffboardPreflightService } from '@modules/vehicle-onboarding/offboarding/vehicle-offboard-preflight.service';
import { VehicleOnboardingOffboardService } from '@modules/vehicle-onboarding/services/vehicle-onboarding-offboard.service';
import { createVehicleOffboardingServiceForTests } from '@modules/vehicle-onboarding/testing/vehicle-offboarding-test.harness';
import { PrismaService } from '@shared/database/prisma.service';
import { OrganizationOffboardPreflightService } from './organization-offboard-preflight.service';
import { OrganizationOffboardingExecutionService } from './organization-offboarding-execution.service';
import { OrganizationOffboardingService } from './organization-offboarding.service';
import {
  OFFBOARDING_EXECUTION_CONFIRM_VALUE,
  ORGANIZATION_OFFBOARDING_EXECUTION_CONFLICT_CODE,
  ORGANIZATION_OFFBOARDING_EXECUTION_LEASE_CONFLICT_CODE,
} from './organization-offboarding-execution.policy';

const LIVE = process.env.ORGANIZATION_OFFBOARDING_EXECUTION_POSTGRES === '1';
const DB_TOKEN = 'synqdrive_org_offboarding_p6d2';

function assertDisposableUrl(): void {
  const url = process.env.DATABASE_URL ?? '';
  if (!url.includes(DB_TOKEN)) {
    throw new Error(`DATABASE_URL must include ${DB_TOKEN}`);
  }
  if (/production|staging|app\.synqdrive|srv1374778|hstgr\.cloud/i.test(url)) {
    throw new Error('Forbidden database target');
  }
}

function execReq(idempotencyKey: string) {
  return {
    idempotencyKey,
    confirmExecution: OFFBOARDING_EXECUTION_CONFIRM_VALUE as typeof OFFBOARDING_EXECUTION_CONFIRM_VALUE,
  };
}

(LIVE ? describe : describe.skip)('Organization offboarding execution (postgres)', () => {
  const prisma = new PrismaClient();
  let prepare: OrganizationOffboardingService;
  let execution: OrganizationOffboardingExecutionService;
  const orgIds: string[] = [];
  const userIds: string[] = [];

  beforeAll(() => {
    assertDisposableUrl();
    process.env.ORGANIZATION_OFFBOARDING_EXECUTION_ENABLED = '1';
    process.env.ORGANIZATION_OFFBOARDING_EXECUTION_LEASE_MS = '30000';
    const prismaService = prisma as unknown as PrismaService;
    const legalHold = { isBlocked: jest.fn().mockResolvedValue(false) } as unknown as IamLegalHoldService;
    const vehiclePreflight = new VehicleOffboardPreflightService(prismaService);
    const preflight = new OrganizationOffboardPreflightService(
      prismaService,
      legalHold,
      vehiclePreflight,
    );
    const masterAudit = { record: jest.fn().mockResolvedValue(undefined) } as unknown as MasterAdminAuditService;
    const refreshTokens = {
      revokeAllActiveForOrganization: (organizationId: string) =>
        prisma.refreshToken.updateMany({
          where: {
            organizationId,
            revokedAt: null,
            expiresAt: { gt: new Date() },
          },
          data: {
            revokedAt: new Date(),
            revocationReason: 'ORG_OFFBOARDING_SESSIONS_REVOKED',
          },
        }).then((r) => r.count),
    } as unknown as RefreshTokenService;
    const vehicleOffboarding = createVehicleOffboardingServiceForTests(prisma);
    const vehicleOffboard = new VehicleOnboardingOffboardService(vehiclePreflight, vehicleOffboarding);
    prepare = new OrganizationOffboardingService(prismaService, preflight, masterAudit);
    execution = new OrganizationOffboardingExecutionService(
      prismaService,
      preflight,
      refreshTokens,
      vehicleOffboard,
      masterAudit,
    );
  });

  afterAll(async () => {
    if (userIds.length) {
      await prisma.refreshToken.deleteMany({ where: { userId: { in: userIds } } });
      await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    }
    if (orgIds.length) {
      await prisma.vehicleProviderConsent.deleteMany({ where: { organizationId: { in: orgIds } } });
      await prisma.vehicle.deleteMany({ where: { organizationId: { in: orgIds } } });
      await prisma.organizationOffboardingJob.deleteMany({ where: { organizationId: { in: orgIds } } });
      await prisma.organizationMembership.deleteMany({ where: { organizationId: { in: orgIds } } });
      await prisma.organization.deleteMany({ where: { id: { in: orgIds } } });
    }
    await prisma.$disconnect();
  });

  async function seedOrg() {
    const org = await prisma.organization.create({
      data: {
        companyName: `Exec PG ${Date.now()}`,
        businessType: 'RENTAL',
        status: OrganizationStatus.ACTIVE,
        email: `exec-${Date.now()}@example.test`,
      },
    });
    orgIds.push(org.id);
    return org.id;
  }

  async function seedPreparedJob(orgId: string) {
    await prepare.prepare(orgId, { idempotencyKey: `prep-${orgId}` }, 'ma-exec-test');
  }

  async function seedUser(emailPrefix: string): Promise<string> {
    const id = randomUUID();
    const email = `${emailPrefix}-${Date.now()}@example.test`;
    await prisma.$executeRaw`
      INSERT INTO users (id, email, name, platform_role, status, created_at, updated_at, session_version, security_version)
      VALUES (${id}, ${email}, 'PG Test User', 'USER'::"UserPlatformRole", 'ACTIVE'::"UserStatus", NOW(), NOW(), 0, 0)
    `;
    userIds.push(id);
    return id;
  }

  async function seedMembership(userId: string, organizationId: string): Promise<string> {
    const id = randomUUID();
    await prisma.$executeRaw`
      INSERT INTO organization_memberships (id, user_id, organization_id, role, status, created_at, updated_at, membership_version)
      VALUES (${id}, ${userId}, ${organizationId}, 'ORG_ADMIN'::"MembershipRole", 'ACTIVE'::"MembershipStatus", NOW(), NOW(), 1)
    `;
    return id;
  }

  it('concurrent execute with different idempotency keys — one lease winner', async () => {
    const orgId = await seedOrg();
    await seedPreparedJob(orgId);
    const settled = await Promise.allSettled([
      execution.execute(orgId, execReq('exec-a'), 'ma-1'),
      execution.execute(orgId, execReq('exec-b'), 'ma-1'),
    ]);
    const rejected = settled.filter((s) => s.status === 'rejected');
    const fulfilled = settled.filter((s) => s.status === 'fulfilled');
    expect(fulfilled.length).toBe(1);
    expect(rejected.length).toBe(1);
    const reason = (rejected[0] as PromiseRejectedResult).reason;
    expect(reason).toBeInstanceOf(ConflictException);
    const code = (reason as ConflictException).getResponse() as { code?: string };
    expect([ORGANIZATION_OFFBOARDING_EXECUTION_LEASE_CONFLICT_CODE, ORGANIZATION_OFFBOARDING_EXECUTION_CONFLICT_CODE]).toContain(
      code.code,
    );
  });

  it('provider dependency blocks READY_FOR_ARCHIVE', async () => {
    const orgId = await seedOrg();
    await seedPreparedJob(orgId);
    const vehicle = await prisma.vehicle.create({
      data: {
        organizationId: orgId,
        licensePlate: `PG-${Date.now()}`,
        make: 'Test',
        model: 'Car',
        year: 2024,
        fuelType: FuelType.GASOLINE,
        status: VehicleStatus.AVAILABLE,
        registryLifecycle: VehicleRegistryLifecycle.OFFBOARDED,
      },
    });
    await prisma.vehicleProviderConsent.create({
      data: {
        organizationId: orgId,
        vehicleId: vehicle.id,
        provider: 'DIMO',
        grantType: VehicleProviderConsentGrantType.DIMO_OAUTH,
        status: 'ACTIVE',
        scopes: [],
      },
    });
    const result = await execution.execute(orgId, execReq('exec-provider'), 'ma-1');
    expect(result.phase).not.toBe('READY_FOR_ARCHIVE');
    expect(result.executionProgress.phasesCompleted).not.toContain('PROVIDER_QUIESCE');
    expect(result.status).toBe(OrganizationOffboardingJobStatus.RETRYABLE);
    const org = await prisma.organization.findUniqueOrThrow({ where: { id: orgId } });
    expect(org.status).toBe(OrganizationStatus.SUSPENDED);
    expect(org.status).not.toBe(OrganizationStatus.ARCHIVED);
  });

  it('session revocation is org-scoped (multi-org isolation)', async () => {
    const orgA = await seedOrg();
    const orgB = await seedOrg();
    const userId = await seedUser('multi-org');
    await seedMembership(userId, orgA);
    await seedMembership(userId, orgB);
    const expires = new Date(Date.now() + 60 * 60 * 1000);
    const tokenA = await prisma.refreshToken.create({
      data: {
        userId,
        organizationId: orgA,
        tokenHash: `hash-a-${Date.now()}`,
        family: `fam-a-${Date.now()}`,
        expiresAt: expires,
      },
    });
    const tokenB = await prisma.refreshToken.create({
      data: {
        userId,
        organizationId: orgB,
        tokenHash: `hash-b-${Date.now()}`,
        family: `fam-b-${Date.now()}`,
        expiresAt: expires,
      },
    });
    await seedPreparedJob(orgA);
    await execution.execute(orgA, execReq('exec-sessions'), 'ma-1');
    const afterA = await prisma.refreshToken.findUniqueOrThrow({ where: { id: tokenA.id } });
    const afterB = await prisma.refreshToken.findUniqueOrThrow({ where: { id: tokenB.id } });
    expect(afterA.revokedAt).not.toBeNull();
    expect(afterB.revokedAt).toBeNull();
  });

  it('clean org execution reaches READY_FOR_ARCHIVE without ARCHIVED status', async () => {
    const orgId = await seedOrg();
    await seedPreparedJob(orgId);
    const result = await execution.execute(orgId, execReq('exec-clean'), 'ma-1');
    expect(result.phase).toBe('READY_FOR_ARCHIVE');
    expect(result.executionProgress.phasesCompleted).toContain('SUSPEND');
    expect(result.executionProgress.phasesCompleted).not.toContain('ARCHIVED');
    const org = await prisma.organization.findUniqueOrThrow({ where: { id: orgId } });
    expect(org.status).toBe(OrganizationStatus.SUSPENDED);
    expect(org.status).not.toBe(OrganizationStatus.ARCHIVED);
    const job = await prisma.organizationOffboardingJob.findFirstOrThrow({
      where: { organizationId: orgId },
    });
    expect(job.status).not.toBe(OrganizationOffboardingJobStatus.COMPLETED);
    expect(job.completedAt).toBeNull();
  });

  it('execution retry does not re-bump membership versions when sessions phase complete', async () => {
    const orgId = await seedOrg();
    await seedPreparedJob(orgId);
    const userId = await seedUser('retry');
    const membershipId = await seedMembership(userId, orgId);
    await prisma.refreshToken.create({
      data: {
        userId,
        organizationId: orgId,
        tokenHash: `hash-r-${Date.now()}`,
        family: `fam-r-${Date.now()}`,
        expiresAt: new Date(Date.now() + 3600_000),
      },
    });
    const readMembershipVersion = async () => {
      const rows = await prisma.$queryRaw<{ membership_version: number }[]>`
        SELECT membership_version FROM organization_memberships WHERE id = ${membershipId}
      `;
      return rows[0]?.membership_version ?? 0;
    };
    await execution.execute(orgId, execReq('exec-retry'), 'ma-1');
    const versionAfterFirst = await readMembershipVersion();
    await execution.execute(orgId, execReq('exec-retry'), 'ma-1');
    const versionAfterSecond = await readMembershipVersion();
    expect(versionAfterSecond).toBe(versionAfterFirst);
  });
});