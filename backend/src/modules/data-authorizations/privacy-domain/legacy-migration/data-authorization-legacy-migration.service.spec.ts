import {
  DataAuthorizationLegacyMigrationMode,
  DataAuthorizationLegacyMigrationRunStatus,
  EnforcementPolicyStatus,
  ProcessingActivityStatus,
  ProviderAccessGrantStatus,
} from '@prisma/client';
import { DataAuthorizationLegacyMigrationService } from './data-authorization-legacy-migration.service';
import { DIMO_TELEMETRY_SYSTEM_KEY } from '../../data-authorization.constants';

describe('DataAuthorizationLegacyMigrationService', () => {
  const orgId = 'org-1';
  const orgAuthId = 'oda-1';
  const vpcId = 'vpc-1';

  const orgAuth = {
    id: orgAuthId,
    organizationId: orgId,
    title: 'DIMO Telemetry Authorization',
    purpose: 'LIVE_MAP',
    purposes: ['TRIPS'],
    dataCategories: ['GPS_LOCATION', 'TELEMETRY_DATA'],
    scope: 'CONNECTED_VEHICLES',
    status: 'ACTIVE',
    sourceType: 'DIMO',
    systemKey: DIMO_TELEMETRY_SYSTEM_KEY,
    isSystemGenerated: true,
    vehicleIds: ['veh-1'],
    customerIds: [],
    bookingIds: [],
    processorType: 'SYNQDRIVE',
    processorName: 'SynqDrive',
    destination: 'SynqDrive Platform',
    moduleOrigin: 'Telematics',
  };

  let prisma: {
    dataAuthorizationLegacyMigrationRun: {
      create: jest.Mock;
      update: jest.Mock;
      findUnique: jest.Mock;
    };
    dataAuthorizationLegacyMigrationEntry: {
      findUnique: jest.Mock;
      upsert: jest.Mock;
      update: jest.Mock;
    };
    orgDataAuthorization: { findMany: jest.Mock };
    vehicleProviderConsent: { findMany: jest.Mock };
    processingActivity: {
      findFirst: jest.Mock;
      create: jest.Mock;
      delete: jest.Mock;
    };
    processingActivityCategory: { createMany: jest.Mock; deleteMany: jest.Mock };
    processingActivityPurpose: { createMany: jest.Mock; deleteMany: jest.Mock };
    enforcementPolicy: {
      findFirst: jest.Mock;
      create: jest.Mock;
      delete: jest.Mock;
    };
    enforcementPolicyVehicle: { deleteMany: jest.Mock };
    enforcementPolicyCustomer: { deleteMany: jest.Mock };
    enforcementPolicyBooking: { deleteMany: jest.Mock };
    enforcementPolicyStation: { deleteMany: jest.Mock };
    providerAccessGrant: {
      findFirst: jest.Mock;
      create: jest.Mock;
      delete: jest.Mock;
    };
    providerAccessGrantScope: { createMany: jest.Mock; deleteMany: jest.Mock };
    $transaction: jest.Mock;
  };
  let service: DataAuthorizationLegacyMigrationService;

  beforeEach(() => {
    prisma = {
      dataAuthorizationLegacyMigrationRun: {
        create: jest.fn().mockResolvedValue({ id: 'run-1' }),
        update: jest.fn(),
        findUnique: jest.fn(),
      },
      dataAuthorizationLegacyMigrationEntry: {
        findUnique: jest.fn().mockResolvedValue(null),
        upsert: jest.fn(),
        update: jest.fn(),
      },
      orgDataAuthorization: {
        findMany: jest.fn().mockResolvedValueOnce([orgAuth]).mockResolvedValue([]),
      },
      vehicleProviderConsent: {
        findMany: jest.fn().mockResolvedValueOnce([]).mockResolvedValue([]),
      },
      processingActivity: {
        findFirst: jest
          .fn()
          .mockResolvedValueOnce(null)
          .mockResolvedValue({ id: 'pa-1' }),
        create: jest.fn().mockResolvedValue({ id: 'pa-1' }),
        delete: jest.fn(),
      },
      processingActivityCategory: { createMany: jest.fn(), deleteMany: jest.fn() },
      processingActivityPurpose: { createMany: jest.fn(), deleteMany: jest.fn() },
      enforcementPolicy: {
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue({ id: 'ep-1' }),
        delete: jest.fn(),
      },
      enforcementPolicyVehicle: { deleteMany: jest.fn() },
      enforcementPolicyCustomer: { deleteMany: jest.fn() },
      enforcementPolicyBooking: { deleteMany: jest.fn() },
      enforcementPolicyStation: { deleteMany: jest.fn() },
      providerAccessGrant: {
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue({ id: 'pag-1' }),
        delete: jest.fn(),
      },
      providerAccessGrantScope: { createMany: jest.fn(), deleteMany: jest.fn() },
      $transaction: jest.fn(async (callback) => callback(prisma)),
    };

    service = new DataAuthorizationLegacyMigrationService(prisma as never);
  });

  it('runs dry-run without creating domain records', async () => {
    const report = await service.run({ mode: DataAuthorizationLegacyMigrationMode.DRY_RUN });

    expect(report.analyzedCount).toBeGreaterThan(0);
    expect(report.reviewRequiredCount).toBeGreaterThan(0);
    expect(prisma.processingActivity.create).not.toHaveBeenCalled();
    expect(prisma.dataAuthorizationLegacyMigrationEntry.upsert).toHaveBeenCalled();
  });

  it('commits processing activity as DRAFT without activating enforcement', async () => {
    const report = await service.run({ mode: DataAuthorizationLegacyMigrationMode.COMMIT });

    expect(report.migratedCount + report.reviewRequiredCount).toBeGreaterThan(0);
    expect(prisma.processingActivity.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: ProcessingActivityStatus.DRAFT,
          legacyOrgDataAuthorizationId: orgAuthId,
        }),
      }),
    );
    expect(prisma.enforcementPolicy.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: EnforcementPolicyStatus.DRAFT,
          legacyOrgDataAuthorizationId: orgAuthId,
        }),
      }),
    );
    expect(prisma.providerAccessGrant.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          providerStatus: ProviderAccessGrantStatus.PENDING,
        }),
      }),
    );
  });

  it('skips already-linked VPC records', async () => {
    prisma.orgDataAuthorization.findMany = jest.fn().mockResolvedValue([]);
    prisma.vehicleProviderConsent.findMany = jest
      .fn()
      .mockResolvedValueOnce([
        {
          id: vpcId,
          organizationId: orgId,
          vehicleId: 'veh-1',
          provider: 'DIMO',
          status: 'ACTIVE',
          scopes: ['telemetry'],
          proofReference: null,
          grantType: 'DIMO_DIRECT',
          legacyProviderAccessGrant: { id: 'pag-existing' },
        },
      ])
      .mockResolvedValue([]);

    const report = await service.run({ mode: DataAuthorizationLegacyMigrationMode.DRY_RUN });

    expect(report.skippedCount).toBe(1);
    expect(prisma.providerAccessGrant.create).not.toHaveBeenCalled();
  });

  it('rolls back committed targets without deleting legacy sources', async () => {
    prisma.dataAuthorizationLegacyMigrationRun.findUnique = jest.fn().mockResolvedValue({
      id: 'run-1',
      entries: [
        {
          id: 'entry-1',
          sourceType: 'ORG_DATA_AUTHORIZATION',
          legacySourceId: orgAuthId,
          targetType: 'PROCESSING_ACTIVITY',
          targetId: 'pa-1',
          status: 'MIGRATED',
        },
      ],
    });

    const report = await service.run({
      mode: DataAuthorizationLegacyMigrationMode.ROLLBACK,
      rollbackRunId: 'run-1',
    });

    expect(report.mode).toBe(DataAuthorizationLegacyMigrationMode.ROLLBACK);
    expect(prisma.processingActivity.delete).toHaveBeenCalledWith({ where: { id: 'pa-1' } });
  });
});
