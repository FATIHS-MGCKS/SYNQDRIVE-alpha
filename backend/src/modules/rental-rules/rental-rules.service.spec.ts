import { BadRequestException, NotFoundException } from '@nestjs/common';
import { RentalEffectiveRulesService } from './rental-effective-rules.service';
import { RentalRulesService } from './rental-rules.service';

function makePrisma() {
  return {
    organization: { findUnique: jest.fn() },
    organizationRentalRules: {
      findUnique: jest.fn(),
      upsert: jest.fn(),
    },
    rentalVehicleCategory: {
      findFirst: jest.fn(),
      findMany: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    vehicle: {
      findFirst: jest.fn(),
      findMany: jest.fn(),
      updateMany: jest.fn(),
    },
    vehicleRentalRequirementOverride: {
      findUnique: jest.fn(),
      upsert: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
    priceTariffGroup: { findMany: jest.fn() },
    $transaction: jest.fn((ops: unknown[]) => Promise.all(ops)),
  };
}

describe('RentalRulesService', () => {
  let prisma: ReturnType<typeof makePrisma>;
  let svc: RentalRulesService;
  let effective: RentalEffectiveRulesService;

  beforeEach(() => {
    prisma = makePrisma();
    effective = new RentalEffectiveRulesService(prisma as any);
    const rentalRulePermissions = {
      assert: jest.fn().mockResolvedValue(undefined),
      assertPublishIfActiveChange: jest.fn().mockResolvedValue(undefined),
    };
    const activityLog = { log: jest.fn().mockResolvedValue({ id: 'log-1' }) };
    svc = new RentalRulesService(prisma as any, effective, rentalRulePermissions as any, activityLog as any);
  });

  it('blocks access to foreign organization category', async () => {
    prisma.rentalVehicleCategory.findFirst.mockResolvedValue(null);
    await expect(svc.getCategory('org1', 'cat-foreign')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('rejects vehicle assignment when vehicle is outside org', async () => {
    prisma.rentalVehicleCategory.findFirst.mockResolvedValue({
      id: 'cat1',
      organizationId: 'org1',
      name: 'Economy',
      isActive: true,
    });
    prisma.vehicle.findMany.mockResolvedValue([{ id: 'v1' }]);
    await expect(
      svc.assignCategoryVehicles('org1', 'cat1', { vehicleIds: ['v1', 'v-foreign'] }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('computes effective rules without category from organization defaults', async () => {
    prisma.vehicle.findFirst.mockResolvedValue({
      id: 'v1',
      organizationId: 'org1',
      vehicleName: 'Golf',
      make: 'VW',
      model: 'Golf',
      licensePlate: 'B-AB 123',
      rentalCategoryId: null,
      rentalCategory: null,
      rentalRequirementOverride: null,
      organization: { companyName: 'Acme' },
    });
    prisma.organizationRentalRules.findUnique.mockResolvedValue({
      organizationId: 'org1',
      isActive: true,
      minimumAgeYears: 21,
      minimumLicenseHoldingMonths: 12,
      depositAmountCents: 10000,
      depositCurrency: 'EUR',
      creditCardRequired: true,
      foreignTravelPolicy: 'ALLOWED',
      additionalDriverPolicy: 'ALLOWED',
      youngDriverPolicy: 'FEE_REQUIRED',
      insuranceRequirement: null,
      manualApprovalRequired: false,
      notes: null,
    });

    const result = await svc.getVehicleEffectiveRules('org1', 'v1');
    expect(result.minimumAgeYears).toEqual({
      value: 21,
      source: 'ORGANIZATION_DEFAULT',
      sourceName: 'Acme',
    });
    expect(result.depositAmount.value).toBe(10000);
  });

  it('does not touch price tariff tables', async () => {
    prisma.organization.findUnique.mockResolvedValue({ id: 'org1' });
    prisma.rentalVehicleCategory.findMany.mockResolvedValue([]);
    await svc.listCategories('org1');
    expect(prisma.priceTariffGroup.findMany).not.toHaveBeenCalled();
  });

  it('leaves organization defaults unchanged when patch omits fields', async () => {
    prisma.organization.findUnique.mockResolvedValue({ id: 'org1' });
    prisma.organizationRentalRules.upsert.mockResolvedValue({
      id: 'rules-1',
      organizationId: 'org1',
      minimumAgeYears: 21,
      minimumLicenseHoldingMonths: 12,
      depositAmountCents: 10000,
      depositCurrency: 'EUR',
      creditCardRequired: true,
      foreignTravelPolicy: 'ALLOWED',
      additionalDriverPolicy: 'ALLOWED',
      youngDriverPolicy: 'FEE_REQUIRED',
      insuranceRequirement: null,
      manualApprovalRequired: false,
      notes: null,
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    await svc.upsertOrganizationDefaults('org1', {});

    expect(prisma.organizationRentalRules.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        update: {},
      }),
    );
  });

  it('clears organization default fields when patch sends null', async () => {
    prisma.organization.findUnique.mockResolvedValue({ id: 'org1' });
    prisma.organizationRentalRules.upsert.mockResolvedValue({
      id: 'rules-1',
      organizationId: 'org1',
      minimumAgeYears: null,
      minimumLicenseHoldingMonths: null,
      depositAmountCents: null,
      depositCurrency: 'EUR',
      creditCardRequired: null,
      foreignTravelPolicy: null,
      additionalDriverPolicy: null,
      youngDriverPolicy: null,
      insuranceRequirement: null,
      manualApprovalRequired: null,
      notes: null,
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    await svc.upsertOrganizationDefaults('org1', {
      minimumAgeYears: null,
      creditCardRequired: false,
      manualApprovalRequired: false,
    });

    expect(prisma.organizationRentalRules.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        update: {
          minimumAgeYears: null,
          creditCardRequired: false,
          manualApprovalRequired: false,
        },
      }),
    );
  });

  it('sets nameNormalized when creating a category', async () => {
    prisma.organization.findUnique.mockResolvedValue({ id: 'org1' });
    prisma.rentalVehicleCategory.create.mockResolvedValue({
      id: 'cat1',
      organizationId: 'org1',
      name: 'Premium Fleet',
      nameNormalized: 'premium fleet',
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
      _count: { vehicles: 0 },
    });

    await svc.createCategory('org1', { name: '  Premium   Fleet  ', isActive: true });

    expect(prisma.rentalVehicleCategory.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          name: 'Premium   Fleet',
          nameNormalized: 'premium fleet',
        }),
      }),
    );
  });

  it('clears category override fields with null and preserves false', async () => {
    prisma.rentalVehicleCategory.findFirst.mockResolvedValue({
      id: 'cat1',
      organizationId: 'org1',
      name: 'Premium',
      isActive: true,
    });
    prisma.rentalVehicleCategory.update.mockResolvedValue({
      id: 'cat1',
      organizationId: 'org1',
      name: 'Premium',
      description: null,
      type: null,
      color: null,
      icon: null,
      minimumAgeYears: null,
      minimumLicenseHoldingMonths: null,
      depositAmountCents: null,
      depositCurrency: null,
      creditCardRequired: false,
      foreignTravelPolicy: null,
      additionalDriverPolicy: null,
      youngDriverPolicy: null,
      insuranceRequirement: null,
      manualApprovalRequired: null,
      notes: null,
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
      _count: { vehicles: 0 },
    });

    await svc.updateCategory('org1', 'cat1', {
      minimumAgeYears: null,
      creditCardRequired: false,
      depositCurrency: null,
    });

    expect(prisma.rentalVehicleCategory.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          minimumAgeYears: null,
          creditCardRequired: false,
          depositCurrency: null,
        }),
      }),
    );
  });
});

describe('normalizeRuleDtoInput', () => {
  it('converts license holding years to months', async () => {
    const { normalizeRuleDtoInput } = await import('./rental-rules.mapper');
    const out = normalizeRuleDtoInput({ minimumLicenseHoldingYears: 2 });
    expect(out.minimumLicenseHoldingMonths).toBe(24);
  });

  it('maps depositAmount alias to depositAmountCents', async () => {
    const { normalizeRuleDtoInput } = await import('./rental-rules.mapper');
    const out = normalizeRuleDtoInput({ depositAmount: 250000 });
    expect(out.depositAmountCents).toBe(250000);
  });
});

describe('RentalRulesService DTO validation integration', () => {
  it('minimumAgeYears below 18 should fail class-validator', async () => {
    const { validate } = await import('class-validator');
    const { plainToInstance } = await import('class-transformer');
    const { UpsertOrganizationRentalRulesDto } = await import('./dto');
    const dto = plainToInstance(UpsertOrganizationRentalRulesDto, { minimumAgeYears: 16 });
    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
  });
});
