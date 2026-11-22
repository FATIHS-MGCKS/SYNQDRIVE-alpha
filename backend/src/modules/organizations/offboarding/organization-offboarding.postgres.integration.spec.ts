/**
 * Organization offboarding prepare job — postgres idempotency + concurrency.
 *
 * ORGANIZATION_OFFBOARDING_POSTGRES=1 \
 * DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:5432/synqdrive_org_offboarding_p6d2 \
 * npm test -- --runInBand organization-offboarding.postgres
 */
import { ConflictException } from '@nestjs/common';
import { OrganizationOffboardingJobStatus, OrganizationStatus } from '@prisma/client';
import { PrismaClient } from '@prisma/client';
import { OrganizationOffboardPreflightService } from './organization-offboard-preflight.service';
import { OrganizationOffboardingService } from './organization-offboarding.service';
import { MasterAdminAuditService } from '@modules/activity-log/master-admin-audit.service';
import { VehicleOffboardPreflightService } from '@modules/vehicle-onboarding/offboarding/vehicle-offboard-preflight.service';
import { IamLegalHoldService } from '@modules/iam-data-retention/iam-legal-hold.service';
import { PrismaService } from '@shared/database/prisma.service';

const LIVE = process.env.ORGANIZATION_OFFBOARDING_POSTGRES === '1';
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

(LIVE ? describe : describe.skip)('Organization offboarding prepare (postgres)', () => {
  const prisma = new PrismaClient();
  let service: OrganizationOffboardingService;
  const orgIds: string[] = [];

  beforeAll(() => {
    assertDisposableUrl();
    const prismaService = prisma as unknown as PrismaService;
    const legalHold = { isBlocked: jest.fn().mockResolvedValue(false) } as unknown as IamLegalHoldService;
    const vehiclePreflight = new VehicleOffboardPreflightService(prismaService);
    const preflight = new OrganizationOffboardPreflightService(
      prismaService,
      legalHold,
      vehiclePreflight,
    );
    const masterAudit = { record: jest.fn().mockResolvedValue(undefined) } as unknown as MasterAdminAuditService;
    service = new OrganizationOffboardingService(prismaService, preflight, masterAudit);
  });

  afterAll(async () => {
    if (orgIds.length) {
      await prisma.organizationOffboardingJob.deleteMany({
        where: { organizationId: { in: orgIds } },
      });
      await prisma.organization.deleteMany({ where: { id: { in: orgIds } } });
    }
    await prisma.$disconnect();
  });

  async function seedOrg() {
    const org = await prisma.organization.create({
      data: {
        companyName: `Offboard PG ${Date.now()}`,
        businessType: 'RENTAL',
        status: OrganizationStatus.ACTIVE,
        email: `offboard-${Date.now()}@example.test`,
      },
    });
    orgIds.push(org.id);
    return org.id;
  }

  it('idempotent prepare returns same job', async () => {
    const orgId = await seedOrg();
    const first = await service.prepare(orgId, { idempotencyKey: 'idem-a' }, 'ma-test');
    const second = await service.prepare(orgId, { idempotencyKey: 'idem-a' }, 'ma-test');
    expect(first.jobId).toBe(second.jobId);
    expect(second.idempotentReplay).toBe(true);
    expect(first.status).toBe(OrganizationOffboardingJobStatus.PREPARED);
  });

  it('different idempotency keys cannot create two active jobs', async () => {
    const orgId = await seedOrg();
    await service.prepare(orgId, { idempotencyKey: 'idem-1' }, 'ma-test');
    try {
      await service.prepare(orgId, { idempotencyKey: 'idem-2' }, 'ma-test');
      throw new Error('expected conflict');
    } catch (error) {
      expect(error).toBeInstanceOf(ConflictException);
      const body = (error as ConflictException).getResponse() as Record<string, unknown>;
      expect(body.code).toBe('ORGANIZATION_OFFBOARDING_PREFLIGHT_BLOCKED');
      expect(body.hardBlockers).toContain('CONFLICTING_ACTIVE_OFFBOARDING_JOB');
    }
  });

  it('parallel same org + same idempotencyKey persists one job', async () => {
    const orgId = await seedOrg();
    const results = await Promise.all(
      Array.from({ length: 8 }, () =>
        service.prepare(orgId, { idempotencyKey: 'parallel-same' }, 'ma-test'),
      ),
    );
    const jobIds = new Set(results.map((r) => r.jobId));
    expect(jobIds.size).toBe(1);
    const replayCount = results.filter((r) => r.idempotentReplay).length;
    expect(replayCount).toBeGreaterThanOrEqual(1);
    const count = await prisma.organizationOffboardingJob.count({
      where: { organizationId: orgId, idempotencyKey: 'parallel-same' },
    });
    expect(count).toBe(1);
  });

  it('parallel same org + different keys yields one active prepared job', async () => {
    const orgId = await seedOrg();
    const settled = await Promise.allSettled(
      Array.from({ length: 6 }, (_, i) =>
        service.prepare(orgId, { idempotencyKey: `parallel-diff-${i}` }, 'ma-test'),
      ),
    );
    const fulfilled = settled.filter((s) => s.status === 'fulfilled') as PromiseFulfilledResult<
      Awaited<ReturnType<OrganizationOffboardingService['prepare']>>
    >[];
    expect(fulfilled.length).toBe(1);
    const rejected = settled.filter((s) => s.status === 'rejected');
    expect(rejected.length).toBe(5);
    const activeCount = await prisma.organizationOffboardingJob.count({
      where: {
        organizationId: orgId,
        status: OrganizationOffboardingJobStatus.PREPARED,
      },
    });
    expect(activeCount).toBe(1);
  });

  it('parallel same key + different payload surfaces idempotency conflict', async () => {
    const orgId = await seedOrg();
    await service.prepare(orgId, { idempotencyKey: 'fp-key', note: 'a' }, 'ma-test');
    const settled = await Promise.allSettled([
      service.prepare(orgId, { idempotencyKey: 'fp-key', note: 'b' }, 'ma-test'),
      service.prepare(orgId, { idempotencyKey: 'fp-key', note: 'b' }, 'ma-test'),
    ]);
    const conflicts = settled.filter(
      (s) =>
        s.status === 'rejected' &&
        s.reason instanceof ConflictException &&
        (s.reason.getResponse() as { code?: string }).code === 'ORGANIZATION_OFFBOARDING_IDEMPOTENCY_CONFLICT',
    );
    expect(conflicts.length).toBeGreaterThanOrEqual(1);
  });

  it('parallel different organizations get isolated jobs', async () => {
    const orgA = await seedOrg();
    const orgB = await seedOrg();
    const [a, b] = await Promise.all([
      service.prepare(orgA, { idempotencyKey: 'shared-key' }, 'ma-test'),
      service.prepare(orgB, { idempotencyKey: 'shared-key' }, 'ma-test'),
    ]);
    expect(a.organizationId).toBe(orgA);
    expect(b.organizationId).toBe(orgB);
    expect(a.jobId).not.toBe(b.jobId);
  });
});