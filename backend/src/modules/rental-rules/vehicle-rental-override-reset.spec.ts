import { BadRequestException, NotFoundException } from '@nestjs/common';
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
    },
    vehicleRentalRequirementOverride: {
      findUnique: jest.fn(),
      findUniqueOrThrow: jest.fn(),
      create: jest.fn(),
      upsert: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
      delete: jest.fn(),
      deleteMany: jest.fn(),
    },
    rentalRuleRevision: { findFirst: jest.fn().mockResolvedValue(null) },
    priceTariffGroup: { findMany: jest.fn() },
    $transaction: jest.fn((ops: unknown[]) => Promise.all(ops)),
  };
}

function baseVehicle(orgId = 'org1') {
  return {
    id: 'v1',
    organizationId: orgId,
    vehicleName: 'Golf',
    make: 'VW',
    model: 'Golf',
    licensePlate: 'B-AB 123',
    rentalCategoryId: 'cat1',
    rentalCategory: {
      id: 'cat1',
      name: 'Economy',
      type: 'ECONOMY',
      isActive: true,
      status: 'ACTIVE',
      minimumAgeYears: 23,
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
    },
    rentalRequirementOverride: null,
    organization: { companyName: 'Acme' },
  };
}

function baseOrgRules() {
  return {
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
  };
}

describe('Vehicle rental override reset', () => {
  let prisma: ReturnType<typeof makePrisma>;
  let svc: RentalRulesService;
  let activityLog: { log: jest.Mock };
  let revisions: {
    upsertDraft: jest.Mock;
    publishDraft: jest.Mock;
    preview: jest.Mock;
    syncActiveRevisionScopeMeta: jest.Mock;
  };

  beforeEach(() => {
    prisma = makePrisma();
    const effective = new RentalEffectiveRulesService(prisma as never);
    activityLog = { log: jest.fn().mockResolvedValue({ id: 'log-1' }) };
    const rentalRulePermissions = {
      assert: jest.fn().mockResolvedValue(undefined),
      assertPublishIfActiveChange: jest.fn().mockResolvedValue(undefined),
    };
    revisions = {
      upsertDraft: jest.fn().mockImplementation(async ({ rulePatch, sourceRow }) => {
        const row = (sourceRow ?? {}) as Record<string, unknown>;
        const merged = {
          minimumAgeYears: row.minimumAgeYears ?? null,
          minimumLicenseHoldingMonths: row.minimumLicenseHoldingMonths ?? null,
          depositAmountCents: row.depositAmountCents ?? null,
          depositCurrency: row.depositCurrency ?? null,
          creditCardRequired: row.creditCardRequired ?? null,
          foreignTravelPolicy: row.foreignTravelPolicy ?? null,
          additionalDriverPolicy: row.additionalDriverPolicy ?? null,
          youngDriverPolicy: row.youngDriverPolicy ?? null,
          insuranceRequirement: row.insuranceRequirement ?? null,
          manualApprovalRequired: row.manualApprovalRequired ?? null,
          notes: row.notes ?? null,
          ...(rulePatch ?? {}),
        };
        return {
          revision: {
            id: 'draft-1',
            lockVersion: 1,
            rulesHash: 'hash',
            createdAt: new Date().toISOString(),
            normalizedRules: { rules: merged, scopeMeta: { vehicleId: 'v1' } },
          },
          publishedVersion: (row.version as number | undefined) ?? 1,
          created: true,
        };
      }),
      publishDraft: jest.fn(),
      preview: jest.fn(),
      syncActiveRevisionScopeMeta: jest.fn().mockResolvedValue(undefined),
    };
    svc = new RentalRulesService(
      prisma as never,
      effective,
      rentalRulePermissions as never,
      activityLog as never,
      revisions as never,
    );
  });

  function mockVehicleContext(vehicle: Record<string, unknown> = baseVehicle()) {
    prisma.vehicle.findFirst.mockResolvedValue(vehicle);
    prisma.organizationRentalRules.findUnique.mockResolvedValue(baseOrgRules());
  }

  it('performs full reset and deletes empty override shell', async () => {
    mockVehicleContext({
      ...baseVehicle(),
      rentalRequirementOverride: {
        id: 'ov1',
        organizationId: 'org1',
        vehicleId: 'v1',
        minimumAgeYears: 30,
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
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    } as Record<string, unknown>);
    prisma.vehicleRentalRequirementOverride.findUnique
      .mockResolvedValueOnce({
        id: 'ov1',
        organizationId: 'org1',
        vehicleId: 'v1',
        version: 1,
        minimumAgeYears: 30,
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
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      .mockResolvedValueOnce({
        id: 'ov1',
        organizationId: 'org1',
        vehicleId: 'v1',
        version: 2,
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
        createdAt: new Date(),
        updatedAt: new Date(),
      });
    prisma.vehicleRentalRequirementOverride.updateMany.mockResolvedValue({ count: 1 });
    prisma.vehicleRentalRequirementOverride.findUniqueOrThrow.mockResolvedValue({
      id: 'ov1',
      organizationId: 'org1',
      vehicleId: 'v1',
      version: 2,
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
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    prisma.vehicleRentalRequirementOverride.delete.mockResolvedValue({});
    prisma.vehicle.findFirst
      .mockResolvedValueOnce({
        ...baseVehicle(),
        rentalRequirementOverride: {
          id: 'ov1',
          organizationId: 'org1',
          vehicleId: 'v1',
          minimumAgeYears: 30,
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
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      })
      .mockResolvedValue(baseVehicle());

    const result = await svc.resetVehicleOverrides(
      'org1',
      'v1',
      { expectedVersion: 1 },
      { actor: { id: 'user-1' } },
    );

    expect(result.result).toBe('deleted');
    expect(result.overrides).toBeNull();
    expect(result.removedFields).toEqual(['minimumAgeYears']);
    expect(result.effectiveRules.minimumAgeYears).toEqual({
      value: 23,
      source: 'CATEGORY',
      sourceName: 'Economy',
    });
    expect(revisions.upsertDraft).toHaveBeenCalled();
    expect(activityLog.log).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'DELETE',
        entity: 'VEHICLE',
        entityId: 'v1',
        metaJson: expect.objectContaining({
          removedFields: ['minimumAgeYears'],
          result: 'deleted',
        }),
      }),
    );
  });

  it('performs partial reset and keeps remaining override fields', async () => {
    mockVehicleContext({
      ...baseVehicle(),
      rentalRequirementOverride: {
        id: 'ov1',
        organizationId: 'org1',
        vehicleId: 'v1',
        minimumAgeYears: 30,
        minimumLicenseHoldingMonths: null,
        depositAmountCents: 50000,
        depositCurrency: 'EUR',
        creditCardRequired: null,
        foreignTravelPolicy: null,
        additionalDriverPolicy: null,
        youngDriverPolicy: null,
        insuranceRequirement: null,
        manualApprovalRequired: null,
        notes: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    } as Record<string, unknown>);
    prisma.vehicleRentalRequirementOverride.findUnique
      .mockResolvedValueOnce({
        id: 'ov1',
        organizationId: 'org1',
        vehicleId: 'v1',
        version: 1,
        minimumAgeYears: 30,
        minimumLicenseHoldingMonths: null,
        depositAmountCents: 50000,
        depositCurrency: 'EUR',
        creditCardRequired: null,
        foreignTravelPolicy: null,
        additionalDriverPolicy: null,
        youngDriverPolicy: null,
        insuranceRequirement: null,
        manualApprovalRequired: null,
        notes: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      .mockResolvedValueOnce({
        id: 'ov1',
        organizationId: 'org1',
        vehicleId: 'v1',
        version: 2,
        minimumAgeYears: null,
        minimumLicenseHoldingMonths: null,
        depositAmountCents: 50000,
        depositCurrency: 'EUR',
        creditCardRequired: null,
        foreignTravelPolicy: null,
        additionalDriverPolicy: null,
        youngDriverPolicy: null,
        insuranceRequirement: null,
        manualApprovalRequired: null,
        notes: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
    prisma.vehicleRentalRequirementOverride.updateMany.mockResolvedValue({ count: 1 });
    prisma.vehicleRentalRequirementOverride.findUniqueOrThrow.mockResolvedValue({
      id: 'ov1',
      organizationId: 'org1',
      vehicleId: 'v1',
      version: 2,
      minimumAgeYears: null,
      minimumLicenseHoldingMonths: null,
      depositAmountCents: 50000,
      depositCurrency: 'EUR',
      creditCardRequired: null,
      foreignTravelPolicy: null,
      additionalDriverPolicy: null,
      youngDriverPolicy: null,
      insuranceRequirement: null,
      manualApprovalRequired: null,
      notes: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    prisma.vehicle.findFirst
      .mockResolvedValueOnce({
        ...baseVehicle(),
        rentalRequirementOverride: {
          id: 'ov1',
          organizationId: 'org1',
          vehicleId: 'v1',
          minimumAgeYears: 30,
          minimumLicenseHoldingMonths: null,
          depositAmountCents: 50000,
          depositCurrency: 'EUR',
          creditCardRequired: null,
          foreignTravelPolicy: null,
          additionalDriverPolicy: null,
          youngDriverPolicy: null,
          insuranceRequirement: null,
          manualApprovalRequired: null,
          notes: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      })
      .mockResolvedValue({
        ...baseVehicle(),
        rentalRequirementOverride: {
          id: 'ov1',
          organizationId: 'org1',
          vehicleId: 'v1',
          minimumAgeYears: null,
          minimumLicenseHoldingMonths: null,
          depositAmountCents: 50000,
          depositCurrency: 'EUR',
          creditCardRequired: null,
          foreignTravelPolicy: null,
          additionalDriverPolicy: null,
          youngDriverPolicy: null,
          insuranceRequirement: null,
          manualApprovalRequired: null,
          notes: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      });

    const result = await svc.resetVehicleOverrides(
      'org1',
      'v1',
      { fields: ['minimumAgeYears'], expectedVersion: 1 },
      { actor: { id: 'user-1' } },
    );

    expect(result.result).toBe('updated');
    expect(result.removedFields).toEqual(['minimumAgeYears']);
    expect(result.overrides?.depositAmountCents).toBe(50000);
    expect(prisma.vehicleRentalRequirementOverride.delete).not.toHaveBeenCalled();
    expect(result.effectiveRules.minimumAgeYears.source).toBe('CATEGORY');
    expect(result.effectiveRules.depositAmount.value).toBe(50000);
  });

  it('blocks cross-tenant vehicle reset via NotFound', async () => {
    prisma.vehicle.findFirst.mockResolvedValue(null);
    await expect(
      svc.resetVehicleOverrides('org1', 'foreign-v', {}, { actor: { id: 'user-1' } }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('is idempotent when override is already absent', async () => {
    mockVehicleContext();
    prisma.vehicleRentalRequirementOverride.findUnique.mockResolvedValue(null);

    const first = await svc.resetVehicleOverrides('org1', 'v1', {}, { actor: { id: 'user-1' } });
    const second = await svc.deleteVehicleOverrides('org1', 'v1', 0, { actor: { id: 'user-1' } });

    expect(first.result).toBe('no_op');
    expect(second.result).toBe('no_op');
    expect(prisma.vehicleRentalRequirementOverride.delete).not.toHaveBeenCalled();
  });

  it('delete endpoint removes entire override row', async () => {
    mockVehicleContext();
    prisma.vehicleRentalRequirementOverride.findUnique.mockResolvedValue({
      id: 'ov1',
      organizationId: 'org1',
      vehicleId: 'v1',
      version: 1,
      minimumAgeYears: 30,
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
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    prisma.vehicleRentalRequirementOverride.deleteMany.mockResolvedValue({ count: 1 });

    const result = await svc.deleteVehicleOverrides('org1', 'v1', 1, { actor: { id: 'user-1' } });

    expect(result.result).toBe('deleted');
    expect(result.overrides).toBeNull();
    expect(activityLog.log).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'DELETE' }),
    );
  });

  it('preview shows current effective, future inherited value, and source after reset', async () => {
    mockVehicleContext({
      ...baseVehicle(),
      rentalRequirementOverride: {
        id: 'ov1',
        organizationId: 'org1',
        vehicleId: 'v1',
        minimumAgeYears: 30,
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
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    } as Record<string, unknown>);
    prisma.vehicleRentalRequirementOverride.findUnique.mockResolvedValue({
      id: 'ov1',
      organizationId: 'org1',
      vehicleId: 'v1',
      version: 1,
      minimumAgeYears: 30,
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
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const preview = await svc.previewVehicleOverrideReset('org1', 'v1', {
      fields: ['minimumAgeYears'],
    });

    expect(preview.resetFields).toEqual(['minimumAgeYears']);
    expect(preview.fields[0]).toEqual({
      field: 'minimumAgeYears',
      current: {
        value: 30,
        source: 'VEHICLE_OVERRIDE',
        sourceName: 'Golf',
      },
      afterReset: {
        value: 23,
        source: 'CATEGORY',
        sourceName: 'Economy',
      },
    });
  });

  it('rejects invalid reset field names', async () => {
    mockVehicleContext();
    prisma.vehicleRentalRequirementOverride.findUnique.mockResolvedValue({
      id: 'ov1',
      organizationId: 'org1',
      vehicleId: 'v1',
      version: 1,
      minimumAgeYears: 30,
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
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    await expect(
      svc.resetVehicleOverrides('org1', 'v1', { fields: ['notAField'] }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('prunes empty override shell after upsert clears all fields', async () => {
    prisma.vehicle.findFirst.mockResolvedValue(baseVehicle());
    prisma.vehicleRentalRequirementOverride.findUnique
      .mockResolvedValueOnce({
        id: 'ov1',
        organizationId: 'org1',
        vehicleId: 'v1',
        version: 1,
        minimumAgeYears: 30,
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
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      .mockResolvedValueOnce({
        id: 'ov1',
        organizationId: 'org1',
        vehicleId: 'v1',
        version: 2,
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
        createdAt: new Date(),
        updatedAt: new Date(),
      });
    prisma.vehicleRentalRequirementOverride.updateMany.mockResolvedValue({ count: 1 });
    prisma.vehicleRentalRequirementOverride.delete.mockResolvedValue({});

    const result = await svc.upsertVehicleOverrides(
      'org1',
      'v1',
      { minimumAgeYears: null, expectedVersion: 1 },
      { actor: { id: 'user-1' } },
    );

    expect(result).toEqual(
      expect.objectContaining({
        result: 'deleted',
        hasUnpublishedDraft: true,
        overrides: null,
      }),
    );
    expect(revisions.upsertDraft).toHaveBeenCalled();
  });
});
