import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { RentalEffectiveRulesService } from './rental-effective-rules.service';
import { RentalRulesService } from './rental-rules.service';
import {
  RENTAL_RULES_ASSIGNMENT_STALE_CODE,
  RENTAL_RULES_VERSION_CONFLICT_CODE,
} from './rental-rules-concurrency.constants';

const ORG = 'org1';
const CAT_TARGET = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const CAT_SOURCE = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const V1 = '11111111-1111-4111-8111-111111111111';
const V2 = '22222222-2222-4222-8222-222222222222';
const V_FOREIGN = '99999999-9999-4999-8999-999999999999';

function makePrisma() {
  const tx = {
    vehicle: { updateMany: jest.fn() },
    rentalVehicleCategory: {
      updateMany: jest.fn(),
      findFirst: jest.fn(),
      findUniqueOrThrow: jest.fn(),
    },
  };

  return {
    organization: { findUnique: jest.fn() },
    rentalVehicleCategory: {
      findFirst: jest.fn(),
      findMany: jest.fn(),
      findUniqueOrThrow: jest.fn(),
    },
    vehicle: {
      findFirst: jest.fn(),
      findMany: jest.fn(),
      updateMany: jest.fn(),
    },
    $transaction: jest.fn(async (fn: (client: typeof tx) => Promise<unknown>) => fn(tx)),
    __tx: tx,
  };
}

describe('RentalRulesService category assignment delta', () => {
  let prisma: ReturnType<typeof makePrisma>;
  let svc: RentalRulesService;
  let activityLog: { log: jest.Mock };

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
    );
  });

  function mockCategory(version = 2) {
    prisma.rentalVehicleCategory.findFirst.mockResolvedValue({
      id: CAT_TARGET,
      organizationId: ORG,
      name: 'Target',
      version,
    });
  }

  it('rejects cross-tenant vehicles', async () => {
    mockCategory();
    prisma.vehicle.findMany.mockResolvedValue([{ id: V1, rentalCategoryId: null, make: 'VW', model: 'Golf', vehicleName: null, licensePlate: 'B-AB 1' }]);
    prisma.rentalVehicleCategory.findMany.mockResolvedValue([{ id: CAT_TARGET, name: 'Target' }]);

    await expect(
      svc.assignCategoryVehicles(ORG, CAT_TARGET, {
        expectedVersion: 2,
        vehiclesToAdd: [V1, V_FOREIGN],
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('returns no-op for empty delta without transaction', async () => {
    mockCategory(3);
    prisma.vehicle.findMany.mockResolvedValue([]);

    const result = await svc.assignCategoryVehicles(ORG, CAT_TARGET, { expectedVersion: 3 });

    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(result.version).toBe(3);
    expect(result.diff.added).toEqual([]);
  });

  it('applies move transactionally and audits diff', async () => {
    mockCategory(2);
    prisma.vehicle.findMany.mockResolvedValue([
      { id: V1, rentalCategoryId: CAT_SOURCE, make: 'VW', model: 'Golf', vehicleName: null, licensePlate: 'B-AB 1' },
    ]);
    prisma.rentalVehicleCategory.findMany.mockResolvedValue([
      { id: CAT_TARGET, name: 'Target' },
      { id: CAT_SOURCE, name: 'Economy' },
    ]);
    prisma.__tx.vehicle.updateMany.mockResolvedValue({ count: 1 });
    prisma.__tx.rentalVehicleCategory.updateMany
      .mockResolvedValueOnce({ count: 1 })
      .mockResolvedValueOnce({ count: 1 });
    prisma.__tx.rentalVehicleCategory.findUniqueOrThrow.mockResolvedValue({ version: 3 });
    prisma.vehicle.findMany.mockResolvedValueOnce([
      { id: V1, rentalCategoryId: CAT_SOURCE, make: 'VW', model: 'Golf', vehicleName: null, licensePlate: 'B-AB 1' },
    ]);
    prisma.vehicle.findMany.mockResolvedValueOnce([
      { id: V1, make: 'VW', model: 'Golf', vehicleName: null, licensePlate: 'B-AB 1', status: 'ACTIVE' },
    ]);

    const result = await svc.assignCategoryVehicles(
      ORG,
      CAT_TARGET,
      {
        expectedVersion: 2,
        vehiclesToMove: [{ vehicleId: V1, fromCategoryId: CAT_SOURCE }],
      },
      { actor: { id: 'user-1' } as never },
    );

    expect(prisma.__tx.vehicle.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id: V1, rentalCategoryId: CAT_SOURCE }),
        data: { rentalCategoryId: CAT_TARGET },
      }),
    );
    expect(result.version).toBe(3);
    expect(result.diff.moved).toHaveLength(1);
    expect(activityLog.log).toHaveBeenCalledWith(
      expect.objectContaining({
        metaJson: expect.objectContaining({
          diff: expect.objectContaining({ moved: expect.any(Array) }),
        }),
      }),
    );
  });

  it('throws version conflict on parallel category edits', async () => {
    mockCategory(4);
    prisma.vehicle.findMany.mockResolvedValue([
      { id: V2, rentalCategoryId: null, make: 'BMW', model: 'X1', vehicleName: null, licensePlate: 'M-XY 1' },
    ]);
    prisma.rentalVehicleCategory.findMany.mockResolvedValue([{ id: CAT_TARGET, name: 'Target' }]);
    prisma.__tx.vehicle.updateMany.mockResolvedValue({ count: 1 });
    prisma.__tx.rentalVehicleCategory.updateMany.mockResolvedValue({ count: 0 });
    prisma.__tx.rentalVehicleCategory.findFirst.mockResolvedValue({
      id: CAT_TARGET,
      organizationId: ORG,
      name: 'Target',
      version: 5,
      description: null,
      type: null,
      color: null,
      icon: null,
      isActive: true,
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
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
      updatedAt: new Date('2026-01-01T00:00:00.000Z'),
      _count: { vehicles: 1 },
    });

    await expect(
      svc.assignCategoryVehicles(ORG, CAT_TARGET, {
        expectedVersion: 2,
        vehiclesToAdd: [V2],
      }),
    ).rejects.toMatchObject({
      response: expect.objectContaining({ code: RENTAL_RULES_VERSION_CONFLICT_CODE }),
    });
  });

  it('rolls back when move source no longer matches', async () => {
    mockCategory(2);
    prisma.vehicle.findMany.mockResolvedValue([
      { id: V1, rentalCategoryId: CAT_SOURCE, make: 'VW', model: 'Golf', vehicleName: null, licensePlate: 'B-AB 1' },
    ]);
    prisma.rentalVehicleCategory.findMany.mockResolvedValue([
      { id: CAT_TARGET, name: 'Target' },
      { id: CAT_SOURCE, name: 'Economy' },
    ]);
    prisma.__tx.vehicle.updateMany.mockResolvedValue({ count: 0 });

    await expect(
      svc.assignCategoryVehicles(ORG, CAT_TARGET, {
        expectedVersion: 2,
        vehiclesToMove: [{ vehicleId: V1, fromCategoryId: CAT_SOURCE }],
      }),
    ).rejects.toMatchObject({
      response: expect.objectContaining({ code: RENTAL_RULES_ASSIGNMENT_STALE_CODE }),
    });
  });

  it('blocks access to foreign organization category', async () => {
    prisma.rentalVehicleCategory.findFirst.mockResolvedValue(null);
    await expect(
      svc.assignCategoryVehicles(ORG, CAT_TARGET, { expectedVersion: 1, vehiclesToAdd: [V1] }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('preview returns diff without mutating', async () => {
    mockCategory(2);
    prisma.vehicle.findMany.mockResolvedValue([
      { id: V1, rentalCategoryId: null, make: 'VW', model: 'Golf', vehicleName: null, licensePlate: 'B-AB 1' },
    ]);
    prisma.rentalVehicleCategory.findMany.mockResolvedValue([{ id: CAT_TARGET, name: 'Target' }]);

    const preview = await svc.previewCategoryVehicleAssignment(ORG, CAT_TARGET, {
      vehiclesToAdd: [V1],
    });

    expect(preview.hasMutations).toBe(true);
    expect(preview.diff.added).toHaveLength(1);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
});
