/**
 * Organization offboarding finalization (P6D4) — disposable PostgreSQL evidence.
 */
import { ConflictException } from '@nestjs/common';
import {
  FuelType,
  OrganizationOffboardingJobStatus,
  OrganizationStatus,
  TripStatus,
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
import { OrganizationOffboardingFinalizationService } from './organization-offboarding-finalization.service';
import { OrganizationOffboardingProviderDisconnectService } from './organization-offboarding-provider-disconnect.service';
import { OrganizationOffboardingService } from './organization-offboarding.service';
import { OFFBOARDING_EXECUTION_CONFIRM_VALUE } from './organization-offboarding-execution.policy';
import {
  OFFBOARDING_FINALIZATION_CONFIRM_VALUE,
  ORGANIZATION_OFFBOARDING_FINALIZE_BLOCKED_CODE,
  ORGANIZATION_OFFBOARDING_FINALIZE_CONFLICT_CODE,
  ORGANIZATION_OFFBOARDING_FINALIZE_MOCK_INADMISSIBLE_CODE,
} from './organization-offboarding-finalization.policy';
import { parseExecutionProgress, toProgressJson } from './organization-offboarding-execution.progress';

const LIVE = process.env.ORGANIZATION_OFFBOARDING_FINALIZATION_POSTGRES === '1';
const ALLOWED_DB_TOKENS = ['synqdrive_org_offboarding_p6d4', 'synqdrive_org_offboarding_p6d2'];

function assertDisposableUrl(): void {
  const url = process.env.DATABASE_URL ?? '';
  if (!ALLOWED_DB_TOKENS.some((token) => url.includes(token))) {
    throw new Error(`DATABASE_URL must include ${ALLOWED_DB_TOKENS.join(' or ')}`);
  }
  if (/production|staging|app\.synqdrive|srv1374778|hstgr\.cloud/i.test(url)) {
    throw new Error('Forbidden database target');
  }
}

function execReq(key: string) {
  return {
    idempotencyKey: key,
    confirmExecution: OFFBOARDING_EXECUTION_CONFIRM_VALUE as typeof OFFBOARDING_EXECUTION_CONFIRM_VALUE,
  };
}

function finReq(jobId: string, key: string) {
  return {
    jobId,
    idempotencyKey: key,
    confirmFinalization: OFFBOARDING_FINALIZATION_CONFIRM_VALUE as typeof OFFBOARDING_FINALIZATION_CONFIRM_VALUE,
  };
}

(LIVE ? describe : describe.skip)('Organization offboarding finalization (postgres P6D4)', () => {
  const prisma = new PrismaClient();
  let prepare: OrganizationOffboardingService;
  let execution: OrganizationOffboardingExecutionService;
  let finalization: OrganizationOffboardingFinalizationService;
  let providerDisconnect: OrganizationOffboardingProviderDisconnectService;
  const orgIds: string[] = [];

  const masterActorId = 'ma-1';

  beforeAll(async () => {
    assertDisposableUrl();
    await prisma.$executeRaw`
      INSERT INTO users (id, email, platform_role, status, created_at, updated_at, security_version, session_version)
      VALUES (
        ${masterActorId},
        ${'p6d4-master-admin@test.local'},
        ${'MASTER_ADMIN'}::"UserPlatformRole",
        ${'ACTIVE'}::"UserStatus",
        NOW(),
        NOW(),
        0,
        0
      )
      ON CONFLICT (id) DO NOTHING
    `;
    process.env.NODE_ENV = 'test';
    process.env.ORGANIZATION_OFFBOARDING_PROVIDER_MOCK_ALLOWED = '1';
    process.env.ORGANIZATION_OFFBOARDING_EXECUTION_ENABLED = '1';
    process.env.ORGANIZATION_OFFBOARDING_FINALIZATION_ENABLED = '1';
    process.env.ORGANIZATION_OFFBOARDING_MOCK_DIMO_EXTERNAL = 'CONFIRMED';
    process.env.ORGANIZATION_OFFBOARDING_MOCK_HM_EXTERNAL = 'CONFIRMED';
    process.env.ORGANIZATION_OFFBOARDING_FINALIZE_LEASE_MS = '30000';

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
    providerDisconnect = new OrganizationOffboardingProviderDisconnectService(prismaService);

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
    for (const orgId of orgIds) {
      await prisma.booking.deleteMany({ where: { organizationId: orgId } });
      await prisma.vehicleTrip.deleteMany({ where: { vehicle: { organizationId: orgId } } });
      await prisma.vehicleDataSourceLink.deleteMany({ where: { vehicle: { organizationId: orgId } } });
      await prisma.vehicleProviderConsent.deleteMany({ where: { organizationId: orgId } });
      await prisma.vehicleRegistryLifecycleOutbox.deleteMany({
        where: { vehicle: { organizationId: orgId } },
      });
      await prisma.vehicle.deleteMany({ where: { organizationId: orgId } });
      await prisma.organizationOffboardingJob.deleteMany({ where: { organizationId: orgId } });
      // Archival finalize writes append-only ActivityLog rows; org DELETE would cascade SET NULL on logs (blocked).
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
        businessType: 'RENTAL',
        status: OrganizationStatus.ACTIVE,
        email: `${id}@example.test`,
      },
    });
    orgIds.push(id);
    return id;
  }

  async function seedCustomer(orgId: string) {
    return prisma.customer.create({
      data: {
        organizationId: orgId,
        firstName: 'Test',
        lastName: 'Customer',
        email: `cust-${Date.now()}@example.test`,
      },
    });
  }

  async function seedInactiveHmLink(orgId: string, vehicleId: string) {
    const hmId = randomUUID();
    await prisma.highMobilityVehicle.create({
      data: {
        id: hmId,
        organizationId: orgId,
        synqdriveVehicleId: vehicleId,
        vin: `HM${randomUUID().replace(/-/g, '').slice(0, 14)}`,
        brand: 'BMW',
        packageType: 'HEALTH',
        sourceMode: 'HM_ONLY',
        clearanceStatus: 'APPROVED',
        hmVehicleReference: `hm-ref-${hmId.slice(0, 8)}`,
      },
    });
    await prisma.vehicleDataSourceLink.create({
      data: {
        vehicleId,
        provider: 'HIGH_MOBILITY',
        sourceType: 'HIGH_MOBILITY',
        sourceSubtype: 'HM_HEALTH',
        sourceReferenceId: hmId,
        isActive: false,
        deactivatedAt: new Date(),
      },
    });
  }

  async function runToReady(orgId: string, execKey: string) {
    await prepare.prepare(orgId, { idempotencyKey: `prep-${execKey}` }, 'ma-1');
    const executed = await execution.execute(orgId, execReq(execKey), 'ma-1');
    expect(executed.phase).toBe('READY_FOR_ARCHIVE');
    return prisma.organizationOffboardingJob.findFirstOrThrow({ where: { organizationId: orgId } });
  }

  it('A — finalize success and idempotent retry', async () => {
    const orgId = await seedOrg();
    const job = await runToReady(orgId, `exec-a-${orgId}`);
    await finalization.finalize(orgId, finReq(job.id, `fin-a-${orgId}`), 'ma-1');
    const org = await prisma.organization.findUniqueOrThrow({ where: { id: orgId } });
    expect(org.status).toBe(OrganizationStatus.ARCHIVED);
    const replay = await finalization.finalize(orgId, finReq(job.id, `fin-a-${orgId}`), 'ma-1');
    expect(replay.executionIdempotentReplay).toBe(true);
  });

  it('B — HM dependency + provider failure at finalize keeps SUSPENDED', async () => {
    const orgId = await seedOrg();
    const vehicle = await prisma.vehicle.create({
      data: {
        organizationId: orgId,
        licensePlate: `HM-${Date.now()}`,
        make: 'Test',
        model: 'Car',
        year: 2024,
        fuelType: FuelType.GASOLINE,
        status: VehicleStatus.AVAILABLE,
        registryLifecycle: VehicleRegistryLifecycle.ACTIVE,
      },
    });
    await seedInactiveHmLink(orgId, vehicle.id);
    process.env.ORGANIZATION_OFFBOARDING_MOCK_HM_EXTERNAL = 'CONFIRMED';
    const job = await runToReady(orgId, `exec-hm-${orgId}`);
    process.env.ORGANIZATION_OFFBOARDING_MOCK_HM_EXTERNAL = 'FAILED';
    await expect(
      finalization.finalize(orgId, finReq(job.id, `fin-hm-${orgId}`), 'ma-1'),
    ).rejects.toBeInstanceOf(ConflictException);
    const org = await prisma.organization.findUniqueOrThrow({ where: { id: orgId } });
    expect(org.status).toBe(OrganizationStatus.SUSPENDED);
    process.env.ORGANIZATION_OFFBOARDING_MOCK_HM_EXTERNAL = 'CONFIRMED';
  });

  it('C — mock DIMO cannot confirm archival when NODE_ENV=production', async () => {
    const orgId = await seedOrg();
    const dimoId = randomUUID();
    await prisma.$executeRaw`
      INSERT INTO dimo_vehicles (id, external_id, connection_status, created_at, updated_at)
      VALUES (${dimoId}, ${`ext-${dimoId.slice(0, 8)}`}, 'CONNECTED'::"DimoConnectionStatus", NOW(), NOW())
    `;
    await prisma.vehicle.create({
      data: {
        organizationId: orgId,
        licensePlate: `PROD-${Date.now()}`,
        make: 'Test',
        model: 'Car',
        year: 2024,
        fuelType: FuelType.GASOLINE,
        status: VehicleStatus.AVAILABLE,
        registryLifecycle: VehicleRegistryLifecycle.ACTIVE,
        dimoVehicleId: dimoId,
      },
    });
    const job = await runToReady(orgId, `exec-prod-${orgId}`);
    const prevNode = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';
    process.env.ORGANIZATION_OFFBOARDING_MOCK_DIMO_EXTERNAL = 'CONFIRMED';
    try {
      await expect(
        finalization.finalize(orgId, finReq(job.id, `fin-prod-${orgId}`), 'ma-1'),
      ).rejects.toBeInstanceOf(ConflictException);
    } finally {
      process.env.NODE_ENV = prevNode;
      process.env.ORGANIZATION_OFFBOARDING_MOCK_DIMO_EXTERNAL = 'CONFIRMED';
    }
    const org = await prisma.organization.findUniqueOrThrow({ where: { id: orgId } });
    expect(org.status).toBe(OrganizationStatus.SUSPENDED);
  });

  it('D — parallel finalize single winner', async () => {
    const orgId = await seedOrg();
    const job = await runToReady(orgId, `exec-par-${orgId}`);
    const settled = await Promise.allSettled([
      finalization.finalize(orgId, finReq(job.id, `fin-par-a-${orgId}`), 'ma-1'),
      finalization.finalize(orgId, finReq(job.id, `fin-par-b-${orgId}`), 'ma-1'),
    ]);
    const ok = settled.filter((s) => s.status === 'fulfilled');
    const bad = settled.filter((s) => s.status === 'rejected');
    expect(ok.length).toBe(1);
    expect(bad.length).toBe(1);
    const code = (bad[0] as PromiseRejectedResult).reason as ConflictException;
    expect(code.getResponse()).toMatchObject({
      code: expect.stringMatching(
        `${ORGANIZATION_OFFBOARDING_FINALIZE_CONFLICT_CODE}|ORGANIZATION_OFFBOARDING_FINALIZE_LEASE_CONFLICT`,
      ),
    });
  });

  it('E — expired finalize lease allows retry', async () => {
    const orgId = await seedOrg();
    const job = await runToReady(orgId, `exec-crash-${orgId}`);
    const prior = parseExecutionProgress(job.progressJson);
    await prisma.organizationOffboardingJob.update({
      where: { id: job.id },
      data: {
        progressJson: toProgressJson({
          ...prior,
          finalize: {
            idempotencyKey: `fin-crash-${orgId}`,
            claimedAt: new Date().toISOString(),
            actorUserId: 'ma-1',
            inProgress: true,
          },
          finalizeLease: {
            token: 'stale-token',
            fence: 1,
            expiresAt: new Date(Date.now() - 60_000).toISOString(),
            finalizeIdempotencyKey: `fin-crash-${orgId}`,
          },
        }),
      },
    });
    const result = await finalization.finalize(orgId, finReq(job.id, `fin-crash-${orgId}`), 'ma-1');
    expect(result.status).toBe(OrganizationOffboardingJobStatus.COMPLETED);
  });

  it('F — active booking blocks finalization', async () => {
    const orgId = await seedOrg();
    const job = await runToReady(orgId, `exec-book-${orgId}`);
    const customer = await seedCustomer(orgId);
    const vehicle = await prisma.vehicle.create({
      data: {
        organizationId: orgId,
        licensePlate: `BK-${Date.now()}`,
        make: 'Test',
        model: 'Car',
        year: 2024,
        fuelType: FuelType.GASOLINE,
        status: VehicleStatus.AVAILABLE,
        registryLifecycle: VehicleRegistryLifecycle.OFFBOARDED,
      },
    });
    await prisma.booking.create({
      data: {
        organizationId: orgId,
        customerId: customer.id,
        vehicleId: vehicle.id,
        startDate: new Date(),
        endDate: new Date(Date.now() + 86_400_000),
        status: 'ACTIVE',
      },
    });
    await expect(
      finalization.finalize(orgId, finReq(job.id, `fin-book-${orgId}`), 'ma-1'),
    ).rejects.toBeInstanceOf(ConflictException);
    expect((await prisma.organization.findUniqueOrThrow({ where: { id: orgId } })).status).toBe(
      OrganizationStatus.SUSPENDED,
    );
  });

  it('G — sole-tenant dimo local quiesce may disconnect DimoVehicle', async () => {
    const orgId = await seedOrg();
    const dimoId = randomUUID();
    await prisma.$executeRaw`
      INSERT INTO dimo_vehicles (id, external_id, connection_status, created_at, updated_at)
      VALUES (${dimoId}, ${`ext-${dimoId.slice(0, 8)}`}, 'CONNECTED'::"DimoConnectionStatus", NOW(), NOW())
    `;
    await prisma.vehicle.create({
      data: {
        organizationId: orgId,
        licensePlate: `SOLO-${Date.now()}`,
        make: 'Test',
        model: 'Car',
        year: 2024,
        fuelType: FuelType.GASOLINE,
        status: VehicleStatus.AVAILABLE,
        registryLifecycle: VehicleRegistryLifecycle.ACTIVE,
        dimoVehicleId: dimoId,
      },
    });
    await providerDisconnect.assessOrganization(orgId);
    const dimo = await prisma.dimoVehicle.findUniqueOrThrow({ where: { id: dimoId } });
    expect(dimo.connectionStatus).toBe('DISCONNECTED');
  });

  it('H — historical HM data source link blocks READY without mocks', async () => {
    const orgId = await seedOrg();
    const vehicle = await prisma.vehicle.create({
      data: {
        organizationId: orgId,
        licensePlate: `HIST-${Date.now()}`,
        make: 'Test',
        model: 'Car',
        year: 2024,
        fuelType: FuelType.GASOLINE,
        status: VehicleStatus.AVAILABLE,
        registryLifecycle: VehicleRegistryLifecycle.OFFBOARDED,
      },
    });
    await seedInactiveHmLink(orgId, vehicle.id);
    delete process.env.ORGANIZATION_OFFBOARDING_MOCK_HM_EXTERNAL;
    delete process.env.ORGANIZATION_OFFBOARDING_MOCK_DIMO_EXTERNAL;
    await prepare.prepare(orgId, { idempotencyKey: `prep-h-${orgId}` }, 'ma-1');
    const result = await execution.execute(orgId, execReq(`exec-h-${orgId}`), 'ma-1');
    expect(result.phase).not.toBe('READY_FOR_ARCHIVE');
    expect(result.executionProgress.providerQuiesce?.finalizationState).toBe('EXTERNAL_DISCONNECT_PENDING');
    process.env.ORGANIZATION_OFFBOARDING_MOCK_HM_EXTERNAL = 'CONFIRMED';
    process.env.ORGANIZATION_OFFBOARDING_MOCK_DIMO_EXTERNAL = 'CONFIRMED';
  });

  it('Integrity A — ONGOING trip on OFFBOARDED vehicle blocks finalize', async () => {
    const orgId = await seedOrg();
    const job = await runToReady(orgId, `exec-int-a-${orgId}`);
    const vehicle = await prisma.vehicle.create({
      data: {
        organizationId: orgId,
        licensePlate: `TRIP-${Date.now()}`,
        make: 'Test',
        model: 'Car',
        year: 2024,
        fuelType: FuelType.GASOLINE,
        status: VehicleStatus.AVAILABLE,
        registryLifecycle: VehicleRegistryLifecycle.OFFBOARDED,
      },
    });
    await prisma.vehicleTrip.create({
      data: {
        vehicleId: vehicle.id,
        tripStatus: TripStatus.ONGOING,
        startTime: new Date(),
      },
    });
    try {
      await finalization.finalize(orgId, finReq(job.id, `fin-int-a-${orgId}`), 'ma-1');
      throw new Error('expected finalize to be blocked');
    } catch (error) {
      expect(error).toBeInstanceOf(ConflictException);
      expect((error as ConflictException).getResponse()).toMatchObject({
        code: ORGANIZATION_OFFBOARDING_FINALIZE_BLOCKED_CODE,
        hardBlockers: ['ONGOING_TRIP'],
      });
    }
    expect((await prisma.organization.findUniqueOrThrow({ where: { id: orgId } })).status).toBe(
      OrganizationStatus.SUSPENDED,
    );
  });

  it('Integrity B — booking introduced after READY cannot bypass commit guard', async () => {
    const orgId = await seedOrg();
    const job = await runToReady(orgId, `exec-int-b-${orgId}`);
    const customer = await seedCustomer(orgId);
    const vehicle = await prisma.vehicle.create({
      data: {
        organizationId: orgId,
        licensePlate: `LATE-${Date.now()}`,
        make: 'Test',
        model: 'Car',
        year: 2024,
        fuelType: FuelType.GASOLINE,
        status: VehicleStatus.AVAILABLE,
        registryLifecycle: VehicleRegistryLifecycle.OFFBOARDED,
      },
    });
    await prisma.booking.create({
      data: {
        organizationId: orgId,
        customerId: customer.id,
        vehicleId: vehicle.id,
        startDate: new Date(),
        endDate: new Date(Date.now() + 86_400_000),
        status: 'PENDING',
      },
    });
    try {
      await finalization.finalize(orgId, finReq(job.id, `fin-int-b-${orgId}`), 'ma-1');
      throw new Error('expected finalize to be blocked');
    } catch (error) {
      expect(error).toBeInstanceOf(ConflictException);
      expect((error as ConflictException).getResponse()).toMatchObject({
        code: ORGANIZATION_OFFBOARDING_FINALIZE_BLOCKED_CODE,
        hardBlockers: expect.arrayContaining(['RELEVANT_COMMITTED_BOOKING']),
      });
    }
  });

  it('Integrity C — concurrent finalizer remains fenced to one winner', async () => {
    const orgId = await seedOrg();
    const job = await runToReady(orgId, `exec-int-c-${orgId}`);
    const settled = await Promise.allSettled([
      finalization.finalize(orgId, finReq(job.id, `fin-int-c-a-${orgId}`), 'ma-1'),
      finalization.finalize(orgId, finReq(job.id, `fin-int-c-b-${orgId}`), 'ma-1'),
    ]);
    expect(settled.filter((s) => s.status === 'fulfilled').length).toBe(1);
    expect(settled.filter((s) => s.status === 'rejected').length).toBe(1);
  });

  it('Integrity D — durable archival audit evidence on successful finalize', async () => {
    const orgId = await seedOrg();
    const job = await runToReady(orgId, `exec-int-d-${orgId}`);
    await finalization.finalize(orgId, finReq(job.id, `fin-int-d-${orgId}`), 'ma-1');
    const stored = await prisma.organizationOffboardingJob.findUniqueOrThrow({ where: { id: job.id } });
    const progress = parseExecutionProgress(stored.progressJson);
    const auditId = progress.archived?.auditActivityLogId;
    expect(auditId).toEqual(expect.any(String));
    const log = await prisma.activityLog.findUniqueOrThrow({ where: { id: auditId! } });
    expect(log.organizationId).toBe(orgId);
    expect(log.entityId).toBe(job.id);
    expect(JSON.stringify(log.metaJson)).toContain('ORG_OFFBOARDING_ARCHIVED');
    expect(JSON.stringify(log.metaJson)).toContain('durableArchivalCommit');
  });
});