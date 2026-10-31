import { ConfigService } from '@nestjs/config';
import { OneAutoProviderJobStatus } from '@prisma/client';
import { OneAutoProviderService } from './oneauto-provider.service';
import { OneAutoProviderExecutionService } from './oneauto-provider-execution.service';

describe('OneAutoProviderService cost and idempotency', () => {
  const prisma = {
    vehicle: { findFirst: jest.fn() },
    oneAutoProviderJob: {
      findUnique: jest.fn(),
      aggregate: jest.fn(),
      create: jest.fn(),
    },
  };
  const execution = { enqueueExecution: jest.fn() };
  const config = {
    get: () => ({
      enabled: true,
      indicativePriceMinorBySku: { OE_VIN_LOOKUP_EU: 150 },
      pricingCatalogVersion: 'synqdrive-catalog-v1',
      orgDailyBudgetMinor: 500,
    }),
  } as unknown as ConfigService;

  let service: OneAutoProviderService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new OneAutoProviderService(
      prisma as never,
      config,
      execution as unknown as OneAutoProviderExecutionService,
    );
    jest.spyOn(service as unknown as { resolvedCatalog: () => unknown[] }, 'resolvedCatalog').mockReturnValue([
      {
        serviceSku: 'OE_VIN_LOOKUP_EU',
        availabilityStatus: 'AVAILABLE',
        indicativePriceMinor: 150,
        currency: 'GBP',
        pricingSourceVersion: 'synqdrive-catalog-v1',
        executionMode: 'SYNC',
      },
    ]);
    prisma.vehicle.findFirst.mockResolvedValue({
      id: 'v1',
      organizationId: 'org1',
      vin: 'WBA12345678901234',
    });
    prisma.oneAutoProviderJob.aggregate.mockResolvedValue({ _sum: { confirmedPriceMinor: 400 } });
  });

  it('rejects budget exceeded', async () => {
    await expect(
      service.executeConfirmed({
        orgId: 'org1',
        vehicleId: 'v1',
        serviceSku: 'OE_VIN_LOOKUP_EU',
        idempotencyKey: 'key-1',
        confirmedPriceMinor: 150,
        pricingSourceVersion: 'synqdrive-catalog-v1',
        acknowledgeIndicativeNotGuaranteed: true,
        masterAdminUserId: 'ma-1',
      }),
    ).rejects.toMatchObject({ response: { code: 'ONEAUTO_BUDGET_EXCEEDED' } });
  });

  it('returns existing job for duplicate idempotency key', async () => {
    prisma.oneAutoProviderJob.findUnique.mockResolvedValue({
      id: 'job-existing',
      organizationId: 'org1',
      vehicleId: 'v1',
      vinSnapshot: 'WBA12345678901234',
      serviceSku: 'OE_VIN_LOOKUP_EU',
      status: OneAutoProviderJobStatus.SUCCEEDED,
      idempotencyKey: 'key-dup',
      providerRequestId: null,
      estimatedPriceMinor: 150,
      currency: 'GBP',
      pricingSourceVersion: 'synqdrive-catalog-v1',
      costConfirmedAt: new Date(),
      confirmedPriceMinor: 150,
      actualChargeMinor: null,
      actualChargeKnown: false,
      pollAttemptCount: 0,
      lastErrorCode: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    const result = await service.executeConfirmed({
      orgId: 'org1',
      vehicleId: 'v1',
      serviceSku: 'OE_VIN_LOOKUP_EU',
      idempotencyKey: 'key-dup',
      confirmedPriceMinor: 150,
      pricingSourceVersion: 'synqdrive-catalog-v1',
      acknowledgeIndicativeNotGuaranteed: true,
      masterAdminUserId: 'ma-1',
    });
    expect(result.id).toBe('job-existing');
    expect(prisma.oneAutoProviderJob.create).not.toHaveBeenCalled();
  });
});
