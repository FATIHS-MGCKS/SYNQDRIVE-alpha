/**
 * Organization offboarding finalization (P6D4) — disposable PostgreSQL evidence.
 *
 * ORGANIZATION_OFFBOARDING_FINALIZATION_POSTGRES=1 \
 * ORGANIZATION_OFFBOARDING_EXECUTION_ENABLED=1 \
 * ORGANIZATION_OFFBOARDING_FINALIZATION_ENABLED=1 \
 * ORGANIZATION_OFFBOARDING_MOCK_DIMO_EXTERNAL=CONFIRMED \
 * ORGANIZATION_OFFBOARDING_MOCK_HM_EXTERNAL=CONFIRMED \
 * DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:5432/synqdrive_org_offboarding_p6d4 \
 * npm test -- --runInBand organization-offboarding-finalization.postgres
 */
import { ConflictException } from '@nestjs/common';
import {
  OrganizationOffboardingJobStatus,
  OrganizationStatus,
  UserPlatformRole,
  UserStatus,
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
import { OrganizationOffboardingFinalizationService } from './organization-offboarding-finalization.service';
import { OrganizationOffboardingProviderDisconnectService } from './organization-offboarding-provider-disconnect.service';
import { OrganizationOffboardingService } from './organization-offboarding.service';
import { OFFBOARDING_EXECUTION_CONFIRM_VALUE } from './organization-offboarding-execution.policy';
import { OFFBOARDING_FINALIZATION_CONFIRM_VALUE } from './organization-offboarding-finalization.policy';

const LIVE = process.env.ORGANIZATION_OFFBOARDING_FINALIZATION_POSTGRES === '1';
const DB_TOKEN = 'synqdrive_org_offboarding_p6d4';

function assertDisposableUrl(): void {
  const url = process.env.DATABASE_URL ?? '';
  if (!url.includes(DB_TOKEN)) {
    throw new Error(`DATABASE_URL must include ${DB_TOKEN}`);
  }
  if (/production|staging|app\.synqdrive|srv1374778|hstgr\.cloud/i.test(url)) {
    throw new Error('Forbidden database target');
  }
}

(LIVE ? describe : describe.skip)('Organization offboarding finalization (postgres P6D4)', () => {
  const prisma = new PrismaClient();
  let prepare: OrganizationOffboardingService;
  let execution: OrganizationOffboardingExecutionService;
  let finalization: OrganizationOffboardingFinalizationService;
  const orgIds: string[] = [];

  beforeAll(() => {
    assertDisposableUrl();
    process.env.ORGANIZATION_OFFBOARDING_EXECUTION_ENABLED = '1';
    process.env.ORGANIZATION_OFFBOARDING_FINALIZATION_ENABLED = '1';
    process.env.ORGANIZATION_OFFBOARDING_MOCK_DIMO_EXTERNAL = 'CONFIRMED';
    process.env.ORGANIZATION_OFFBOARDING_MOCK_HM_EXTERNAL = 'CONFIRMED';

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
      revokeAllActiveForOrganization: () => Promise.resolve(0),
    } as unknown as RefreshTokenService;
    const vehicleOffboarding = createVehicleOffboardingServiceForTests(prisma);
    const vehicleOffboard = new VehicleOnboardingOffboardService(vehiclePreflight, vehicleOffboarding);
    const providerDisconnect = new OrganizationOffboardingProviderDisconnectService(prismaService);

    prepare = new OrganizationOffboardingService(prismaService, preflight, masterAudit);
    execution = new OrganizationOffboardingExecutionService(
      prismaService,
      preflight,
      refreshTokens,
      vehicleOffboard,
      masterAudit,
      providerDisconnect,
    );
    finalization = new OrganizationOffboardingFinalizationService(
      prismaService,
      preflight,
      providerDisconnect,
      masterAudit,
    );
  });

  afterAll(async () => {
    if (orgIds.length) {
      await prisma.organizationOffboardingJob.deleteMany({ where: { organizationId: { in: orgIds } } });
      await prisma.organization.deleteMany({ where: { id: { in: orgIds } } });
    }
    await prisma.$disconnect();
  });

  async function seedOrg(): Promise<string> {
    const id = randomUUID();
    await prisma.organization.create({
      data: {
        id,
        companyName: `P6D4 Org ${id.slice(0, 8)}`,
        shortCode: `p6d4${id.slice(0, 4)}`,
        status: OrganizationStatus.ACTIVE,
        email: `${id}@example.test`,
      },
    });
    orgIds.push(id);
    return id;
  }

  it('finalize is idempotent and sets ARCHIVED + COMPLETED', async () => {
    const orgId = await seedOrg();
    await prepare.prepare(orgId, { idempotencyKey: `prep-${orgId}` }, 'ma-1');
    const executed = await execution.execute(
      orgId,
      {
        idempotencyKey: `exec-${orgId}`,
        confirmExecution: OFFBOARDING_EXECUTION_CONFIRM_VALUE,
      },
      'ma-1',
    );
    expect(executed.phase).toBe('READY_FOR_ARCHIVE');

    const job = await prisma.organizationOffboardingJob.findFirstOrThrow({
      where: { organizationId: orgId },
    });

    const finalized = await finalization.finalize(
      orgId,
      {
        jobId: job.id,
        idempotencyKey: `fin-${orgId}`,
        confirmFinalization: OFFBOARDING_FINALIZATION_CONFIRM_VALUE,
      },
      'ma-1',
    );
    expect(finalized.status).toBe(OrganizationOffboardingJobStatus.COMPLETED);
    const org = await prisma.organization.findUniqueOrThrow({ where: { id: orgId } });
    expect(org.status).toBe(OrganizationStatus.ARCHIVED);

    const replay = await finalization.finalize(
      orgId,
      {
        jobId: job.id,
        idempotencyKey: `fin-${orgId}`,
        confirmFinalization: OFFBOARDING_FINALIZATION_CONFIRM_VALUE,
      },
      'ma-1',
    );
    expect(replay.executionIdempotentReplay).toBe(true);
  });

  it('HM mock FAILED blocks finalization', async () => {
    process.env.ORGANIZATION_OFFBOARDING_MOCK_HM_EXTERNAL = 'FAILED';
    const orgId = await seedOrg();
    await prepare.prepare(orgId, { idempotencyKey: `prep-hm-${orgId}` }, 'ma-1');
    await execution.execute(
      orgId,
      {
        idempotencyKey: `exec-hm-${orgId}`,
        confirmExecution: OFFBOARDING_EXECUTION_CONFIRM_VALUE,
      },
      'ma-1',
    );
    const job = await prisma.organizationOffboardingJob.findFirstOrThrow({
      where: { organizationId: orgId },
    });
    await expect(
      finalization.finalize(
        orgId,
        {
          jobId: job.id,
          idempotencyKey: `fin-hm-${orgId}`,
          confirmFinalization: OFFBOARDING_FINALIZATION_CONFIRM_VALUE,
        },
        'ma-1',
      ),
    ).rejects.toBeInstanceOf(ConflictException);
    const org = await prisma.organization.findUniqueOrThrow({ where: { id: orgId } });
    expect(org.status).toBe(OrganizationStatus.SUSPENDED);
    process.env.ORGANIZATION_OFFBOARDING_MOCK_HM_EXTERNAL = 'CONFIRMED';
  });
});