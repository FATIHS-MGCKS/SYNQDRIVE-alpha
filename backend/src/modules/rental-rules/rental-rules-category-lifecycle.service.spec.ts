import { BadRequestException, ConflictException } from '@nestjs/common';
import { RentalEffectiveRulesService } from './rental-effective-rules.service';
import { RentalRulesService } from './rental-rules.service';

function makePrisma() {
  return {
    organization: { findUnique: jest.fn() },
    organizationRentalRules: {
      findUnique: jest.fn(),
      create: jest.fn(),
      updateMany: jest.fn(),
      findUniqueOrThrow: jest.fn(),
      upsert: jest.fn(),
    },
    rentalVehicleCategory: {
      findFirst: jest.fn(),
      findMany: jest.fn(),
      findUnique: jest.fn(),
      findUniqueOrThrow: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
    },
    vehicle: {
      findFirst: jest.fn(),
      findMany: jest.fn(),
      updateMany: jest.fn(),
      count: jest.fn(),
    },
    booking: { count: jest.fn() },
    vehicleRentalRequirementOverride: {
      findUnique: jest.fn(),
      findUniqueOrThrow: jest.fn(),
      create: jest.fn(),
      upsert: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
      delete: jest.fn(),
      deleteMany: jest.fn(),
      findMany: jest.fn(),
    },
    priceTariffGroup: { findMany: jest.fn() },
    $queryRaw: jest.fn(),
    $transaction: jest.fn((ops: unknown[]) => Promise.all(ops)),
  };
}

describe('RentalRulesService category lifecycle', () => {
  let prisma: ReturnType<typeof makePrisma>;
  let svc: RentalRulesService;
  let activityLog: { log: jest.Mock };

  const categoryRow = {
    id: 'cat-1',
    organizationId: 'org1',
    name: 'Economy',
    description: null,
    type: null,
    color: null,
    icon: null,
    minimumAgeYears: null,
    minimumLicenseHoldingMonths: null,
    depositAmountCents: null,
    depositCurrency: null,
    creditCardRequired: null,
    foreignTravelPolicy: null,
    additionalDriverPolicy: null,
    youngDriverPolicy: null,
    insuranceRequirement: null,
    manualApprovalRequired: null,
    notes: null,
    isActive: true,
    status: 'ACTIVE' as const,
    statusChangedAt: new Date('2026-01-01T00:00:00.000Z'),
    version: 2,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    _count: { vehicles: 1 },
  };

  beforeEach(() => {
    prisma = makePrisma();
    const effective = new RentalEffectiveRulesService(prisma as never);
    const rentalRulePermissions = {
      assert: jest.fn().mockResolvedValue(undefined),
      assertPublishIfActiveChange: jest.fn().mockResolvedValue(undefined),
    };
    activityLog = { log: jest.fn().mockResolvedValue({ id: 'log-1' }) };
    svc = new RentalRulesService(
      prisma as never,
      effective,
      rentalRulePermissions as never,
      activityLog as never,
      {
        upsertDraft: jest.fn(),
        publishDraft: jest.fn(),
        preview: jest.fn(),
        syncActiveRevisionScopeMeta: jest.fn().mockResolvedValue(undefined),
      } as never,
      {
        analyzePublishImpact: jest.fn(),
        assertPublishPreconditions: jest.fn(),
      } as never,
    );
  });

  it('transitions ACTIVE to INACTIVE', async () => {
    prisma.rentalVehicleCategory.findFirst.mockResolvedValue(categoryRow);
    prisma.rentalVehicleCategory.updateMany.mockResolvedValue({ count: 1 });
    prisma.rentalVehicleCategory.findUniqueOrThrow.mockResolvedValue({
      ...categoryRow,
      status: 'INACTIVE',
      isActive: false,
      version: 3,
    });

    const result = await svc.transitionCategoryLifecycle('org1', 'cat-1', {
      expectedVersion: 2,
      targetStatus: 'INACTIVE',
    });

    expect(result.status).toBe('INACTIVE');
    expect(result.isActive).toBe(false);
    expect(activityLog.log).toHaveBeenCalled();
  });

  it('transitions INACTIVE back to ACTIVE', async () => {
    prisma.rentalVehicleCategory.findFirst.mockResolvedValue({ ...categoryRow, status: 'INACTIVE', isActive: false });
    prisma.rentalVehicleCategory.updateMany.mockResolvedValue({ count: 1 });
    prisma.rentalVehicleCategory.findUniqueOrThrow.mockResolvedValue({ ...categoryRow, status: 'ACTIVE', version: 4 });

    const result = await svc.transitionCategoryLifecycle('org1', 'cat-1', {
      expectedVersion: 3,
      targetStatus: 'ACTIVE',
    });

    expect(result.status).toBe('ACTIVE');
  });

  it('transitions ARCHIVED to ACTIVE (restore)', async () => {
    prisma.rentalVehicleCategory.findFirst.mockResolvedValue({ ...categoryRow, status: 'ARCHIVED', isActive: false });
    prisma.rentalVehicleCategory.updateMany.mockResolvedValue({ count: 1 });
    prisma.rentalVehicleCategory.findUniqueOrThrow.mockResolvedValue({ ...categoryRow, status: 'ACTIVE', version: 5 });

    const result = await svc.transitionCategoryLifecycle('org1', 'cat-1', {
      expectedVersion: 4,
      targetStatus: 'ACTIVE',
    });

    expect(result.status).toBe('ACTIVE');
  });

  it('rejects invalid lifecycle transition', async () => {
    prisma.rentalVehicleCategory.findFirst.mockResolvedValue({ ...categoryRow, status: 'ARCHIVED', isActive: false });

    await expect(
      svc.transitionCategoryLifecycle('org1', 'cat-1', {
        expectedVersion: 2,
        targetStatus: 'INACTIVE',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('blocks edits on archived categories', async () => {
    prisma.rentalVehicleCategory.findFirst.mockResolvedValue({ ...categoryRow, status: 'ARCHIVED', isActive: false });

    await expect(
      svc.updateCategory(
        'org1',
        'cat-1',
        { expectedVersion: 2, name: 'Renamed' },
        {},
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('blocks hard delete when historical references exist', async () => {
    prisma.rentalVehicleCategory.findFirst.mockResolvedValue({ ...categoryRow, status: 'DRAFT' });
    prisma.vehicle.findMany.mockResolvedValue([{ id: 'v1' }]);
    prisma.booking.count.mockResolvedValue(2);
    prisma.$queryRaw.mockResolvedValue([{ count: 1n }]);

    await expect(svc.assertCategoryMayBeHardDeleted('org1', 'cat-1')).rejects.toBeInstanceOf(ConflictException);
  });

  it('lists non-active categories when includeInactive is true', async () => {
    prisma.organization.findUnique.mockResolvedValue({ id: 'org1' });
    prisma.rentalVehicleCategory.findMany.mockResolvedValue([
      categoryRow,
      { ...categoryRow, id: 'cat-2', name: 'Old', status: 'INACTIVE', isActive: false },
    ]);

    const rows = await svc.listCategories('org1', true);
    expect(rows).toHaveLength(2);
    expect(prisma.rentalVehicleCategory.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ organizationId: 'org1' }),
      }),
    );
  });
});
